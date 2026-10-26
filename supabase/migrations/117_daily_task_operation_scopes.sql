-- Explicit daily authority; historical 088 and absent declarations stay literal.
ALTER TABLE public.plans ADD COLUMN daily_task_operation_scopes jsonb;
ALTER TABLE public.plans ADD CONSTRAINT daily_task_scope_single_authority CHECK (
 daily_task_operation_scopes IS NULL OR (planner_next_profile IS NOT NULL AND planner_next_configuration IS NULL));
CREATE FUNCTION public.guard_daily_task_operation_scopes() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.daily_task_operation_scopes IS NOT NULL) OR
 (TG_OP='UPDATE' AND NEW.daily_task_operation_scopes IS DISTINCT FROM OLD.daily_task_operation_scopes) THEN
  IF current_user<>'service_role' OR current_setting('optiplan.daily_task_scope_operation',true) IS DISTINCT FROM 'versioned'
  THEN RAISE EXCEPTION 'TASK_SCOPE_REQUIRES_VERSIONED_OPERATION'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_daily_task_operation_scopes BEFORE INSERT OR UPDATE ON public.plans
 FOR EACH ROW EXECUTE FUNCTION public.guard_daily_task_operation_scopes();
REVOKE ALL ON FUNCTION public.guard_daily_task_operation_scopes() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.task_scope_member_ids(policy jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ SELECT jsonb_build_array(policy->'taskId') $$;
CREATE FUNCTION public.task_scope_contracts(policies jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ SELECT nullif(policies,'[]') $$;
REVOKE ALL ON FUNCTION public.task_scope_member_ids(jsonb),public.task_scope_contracts(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.task_scope_member_ids(jsonb),public.task_scope_contracts(jsonb) TO service_role;

CREATE FUNCTION public.assert_daily_task_operation_scopes(p_plan integer,p_structure jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE policy jsonb; t public.daily_tasks%rowtype; tpl public.plan_task_template_snapshots%rowtype;
 unit public.plan_itinerant_unit_snapshots%rowtype; required_ids jsonb; prior jsonb; seen integer[]:='{}';
BEGIN
 IF jsonb_typeof(p_structure) IS DISTINCT FROM 'object' OR p_structure->'contractVersion' IS DISTINCT FROM '1'::jsonb
  OR p_structure-ARRAY['contractVersion','policies']<>'{}' OR jsonb_typeof(p_structure->'policies') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'TASK_SCOPE_INVALID_STRUCTURE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plans WHERE id=p_plan AND planner_next_configuration IS NULL AND planner_next_profile->'configuration' IS NOT NULL
  AND planner_next_profile#>>'{configuration,setup}'='NONE' AND planner_next_profile#>>'{configuration,transport}'='NONE'
  AND coalesce(daily_round_synchronization->'policies','[]')='[]' AND coalesce(daily_technical_chains->'policies','[]')='[]'
  AND coalesce(daily_anchored_accompaniments->'policies','[]')='[]') OR public.effective_operation_continuity(p_plan,'[]')<>'[]'
 THEN RAISE EXCEPTION 'UNSUPPORTED_TASK_SCOPE_COMBINATION'; END IF;
 FOR policy IN SELECT value FROM jsonb_array_elements(p_structure->'policies') LOOP
  IF policy-ARRAY['taskId','agendaScope','resourceInheritance','blocksSpace','itinerantUnitId','declaredResourceIds']<>'{}'
   OR jsonb_typeof(policy->'taskId') IS DISTINCT FROM 'number' OR (policy->>'taskId')!~'^[1-9][0-9]*$'
   OR policy->>'agendaScope' IS NULL OR policy->>'agendaScope' NOT IN ('PHYSICAL_SPACE','ITINERANT_UNIT')
   OR policy->>'resourceInheritance' IS NULL OR policy->>'resourceInheritance' NOT IN ('LOCATION','OPERATION_ONLY')
   OR jsonb_typeof(policy->'blocksSpace') IS DISTINCT FROM 'boolean'
   OR NOT policy ? 'itinerantUnitId' OR jsonb_typeof(policy->'itinerantUnitId') NOT IN ('number','null')
   OR (policy->>'itinerantUnitId' IS NOT NULL AND (policy->>'itinerantUnitId')!~'^[1-9][0-9]*$')
   OR jsonb_typeof(policy->'declaredResourceIds') IS DISTINCT FROM 'array'
   OR (policy->>'taskId')::integer=ANY(seen)
  THEN RAISE EXCEPTION 'TASK_SCOPE_INVALID_STRUCTURE'; END IF;
  seen:=array_append(seen,(policy->>'taskId')::integer);
  SELECT * INTO t FROM public.daily_tasks WHERE id=(policy->>'taskId')::integer AND plan_id=p_plan;
  IF NOT FOUND OR t.status='cancelled' OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings WHERE plan_id=p_plan AND space_id=t.space_id)
  THEN RAISE EXCEPTION 'TASK_SCOPE_INVALID_TASK'; END IF;
  SELECT * INTO tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=t.template_id;
  IF NOT FOUND OR tpl.planner_next_operation->>'kind' IS NULL OR tpl.planner_next_operation->>'kind' NOT IN ('auxiliary','technical')
   OR tpl.setup_id IS NOT NULL OR tpl.requires_auxiliar OR tpl.requires_presenter
   OR coalesce(tpl.resource_requirements->'byType','{}')<>'{}' OR coalesce(tpl.resource_requirements->'anyOf','[]')<>'[]'
   OR t.template_id=(SELECT (planner_next_profile->>'mealTaskTemplateId')::integer FROM public.plans WHERE id=p_plan AND meal_mode='flexible_meal_window')
  THEN RAISE EXCEPTION 'TASK_SCOPE_INVALID_TASK'; END IF;
  IF policy->>'itinerantUnitId' IS NOT NULL THEN
   SELECT * INTO unit FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND id=(policy->>'itinerantUnitId')::integer;
   IF NOT FOUND OR jsonb_array_length(unit.members)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(unit.members) m WHERE NOT EXISTS(
    SELECT 1 FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND r.id=(m->>'planResourceItemId')::integer AND r.resource_item_id=(m->>'resourceItemId')::integer))
    OR (tpl.itinerant_team_requirement='specific' AND tpl.itinerant_team_id IS DISTINCT FROM unit.source_team_id)
    OR (tpl.itinerant_team_requirement='any' AND NOT tpl.allowed_itinerant_team_ids @> jsonb_build_array(unit.source_team_id))
   THEN RAISE EXCEPTION 'TASK_SCOPE_INVALID_UNIT'; END IF;
  ELSIF policy->>'agendaScope'='ITINERANT_UNIT' AND tpl.itinerant_team_requirement NOT IN ('specific','any')
  THEN RAISE EXCEPTION 'TASK_SCOPE_UNIT_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'declaredResourceIds') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'number' OR r::text!~'^[1-9][0-9]*$')
   OR (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(policy->'declaredResourceIds'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'declaredResourceIds') r WHERE NOT EXISTS(SELECT 1 FROM public.plan_resource_items WHERE plan_id=p_plan AND id=r::text::integer))
  THEN RAISE EXCEPTION 'TASK_SCOPE_DIRECT_RESOURCE_MISSING'; END IF;
  SELECT p INTO prior FROM public.plans day,LATERAL jsonb_array_elements(coalesce(day.daily_task_operation_scopes->'policies','[]')) p WHERE day.id=p_plan AND p->'taskId'=policy->'taskId';
  IF FOUND THEN required_ids:=prior->'declaredResourceIds'; ELSE
   SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO required_ids FROM (
    SELECT value::text::integer id FROM jsonb_array_elements(coalesce(t.assigned_resource_ids,'[]'))
    UNION SELECT r.id FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND tpl.resource_requirements#>ARRAY['byItem',r.resource_item_id::text]='1'
    UNION SELECT c.vocal_coach_plan_resource_item_id FROM public.contestants c WHERE c.plan_id=p_plan AND c.id=t.contestant_id AND tpl.requires_coach AND c.vocal_coach_plan_resource_item_id IS NOT NULL
   ) direct;
  END IF;
  IF policy->'declaredResourceIds' IS DISTINCT FROM required_ids THEN RAISE EXCEPTION 'TASK_SCOPE_DIRECT_RESOURCE_PROVENANCE'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_daily_task_operation_scopes(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_daily_task_operation_scopes(integer,jsonb) TO service_role;

-- Rebuild the owned fields from real daily template/unit identities. Location,
-- dependencies, roles and declared resources remain separate authorities.
CREATE FUNCTION public.task_scope_task_operations(p_plan integer,operations jsonb,old_policies jsonb,new_policies jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE op jsonb; result jsonb:='[]'; policy jsonb; tpl public.plan_task_template_snapshots%rowtype; unit_id integer; allowed jsonb; direct_ids jsonb;
BEGIN
 FOR op IN SELECT value FROM jsonb_array_elements(operations) LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(old_policies,'[]')) p WHERE p->'taskId'=op->'taskId') THEN
   SELECT s.* INTO STRICT tpl FROM public.daily_tasks d JOIN public.plan_task_template_snapshots s ON s.plan_id=d.plan_id AND s.source_template_id=d.template_id WHERE d.plan_id=p_plan AND d.id=(op->>'taskId')::integer;
   SELECT id INTO unit_id FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND source_team_id=tpl.itinerant_team_id;
   SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO allowed FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND tpl.allowed_itinerant_team_ids @> jsonb_build_array(source_team_id);
   op:=(op-ARRAY['blocksSpace','agendaScope','resourceInheritance','itinerantTeamId','itinerantTeamRequirement','allowedItinerantTeamIds','declaredResourceIds'])
    ||jsonb_build_object('itinerantTeamId',unit_id,'itinerantTeamRequirement',tpl.itinerant_team_requirement,'allowedItinerantTeamIds',allowed);
   SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO direct_ids FROM (
    SELECT c.vocal_coach_plan_resource_item_id id FROM public.contestants c JOIN public.daily_tasks d ON d.contestant_id=c.id WHERE d.plan_id=p_plan AND d.id=(op->>'taskId')::integer AND tpl.requires_coach AND c.vocal_coach_plan_resource_item_id IS NOT NULL
    UNION SELECT r.id FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND tpl.itinerant_team_requirement<>'none' AND tpl.resource_requirements#>ARRAY['byItem',r.resource_item_id::text]='1'
   ) direct;
   IF direct_ids<>'[]' THEN op:=op||jsonb_build_object('declaredResourceIds',direct_ids); END IF;
  END IF;
  SELECT p INTO policy FROM jsonb_array_elements(coalesce(new_policies,'[]')) p WHERE p->'taskId'=op->'taskId';
  IF FOUND THEN
   op:=op||jsonb_build_object('agendaScope',policy->'agendaScope','resourceInheritance',policy->'resourceInheritance','blocksSpace',policy->'blocksSpace','declaredResourceIds',policy->'declaredResourceIds');
   IF policy->>'itinerantUnitId' IS NOT NULL THEN op:=op||jsonb_build_object('itinerantTeamId',policy->'itinerantUnitId','itinerantTeamRequirement','specific','allowedItinerantTeamIds',jsonb_build_array(policy->'itinerantUnitId')); END IF;
  END IF;
  result:=result||jsonb_build_array(op);
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.task_scope_task_operations(integer,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.task_scope_task_operations(integer,jsonb,jsonb,jsonb) TO service_role;

CREATE FUNCTION public.assert_task_scope_revision(p_plan integer,replay jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; policies jsonb; operations jsonb;
BEGIN
 SELECT * INTO STRICT p FROM public.plans WHERE id=p_plan;
 IF p.planner_next_profile IS NULL THEN RETURN; END IF;
 policies:=nullif(p.daily_task_operation_scopes->'policies','[]');
 IF replay#>'{authorities,plan_workday,0,plannerNextAuthorities,dailyTaskOperationScopes}' IS DISTINCT FROM policies THEN RAISE EXCEPTION 'TASK_SCOPE_AUTHORITY_NOT_MATERIALIZED'; END IF;
 operations:=replay#>'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}';
 IF policies IS NOT NULL THEN
  PERFORM public.assert_daily_task_operation_scopes(p_plan,p.daily_task_operation_scopes-ARRAY['by','at']);
  IF operations IS DISTINCT FROM public.task_scope_task_operations(p_plan,operations,policies,policies)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(policies) policy WHERE (SELECT count(*) FROM jsonb_array_elements(operations) op WHERE op->'taskId'=policy->'taskId')<>1)
  THEN RAISE EXCEPTION 'TASK_SCOPE_OPERATIONS_NOT_MATERIALIZED'; END IF;
 END IF;
 -- With no daily declaration, independent native tasks cannot acquire these
 -- authorities from caller-authored replay, even with coherent fingerprints.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(operations) op JOIN public.daily_tasks d ON d.plan_id=p_plan AND d.id=(op->>'taskId')::integer
  WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(policies,'[]')) policy WHERE policy->'taskId'=op->'taskId')
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.daily_anchored_accompaniments->'policies','[]')) a WHERE public.anchored_member_ids(a) @> jsonb_build_array(op->'taskId'))
   AND (op ? 'agendaScope' OR op ? 'resourceInheritance' OR op ? 'blocksSpace')) THEN RAISE EXCEPTION 'TASK_SCOPE_AUTHORITY_NOT_MATERIALIZED'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_task_scope_revision(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_task_scope_revision(integer,jsonb) TO service_role;
CREATE FUNCTION public.guard_task_scope_revision() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN PERFORM public.assert_task_scope_revision(NEW.plan_id,NEW.replay_snapshot_json); RETURN NEW; END $$;
CREATE TRIGGER task_scope_revision BEFORE INSERT ON public.plan_config_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_task_scope_revision();
REVOKE ALL ON FUNCTION public.guard_task_scope_revision() FROM PUBLIC,anon,authenticated,service_role;

-- Reuse the authenticated v5 operation, CAS, source locks and atomic session transition.
ALTER FUNCTION public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) RENAME TO apply_day_config_operation_before_task_operation_scopes;
CREATE OR REPLACE FUNCTION public.apply_day_config_operation_v5(
 p_plan_id integer,p_actor uuid,p_operation text,p_payload jsonb,p_expected_revision bigint,
 p_expected_identity jsonb,p_expected_replay jsonb,p_candidate_identity jsonb,p_candidate_replay jsonb,p_diff jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; guard text; result bigint;
 structure_selected boolean; old_chains jsonb; new_chains jsonb; path text[]:=ARRAY['authorities','plan_workday','0','plannerNextAuthorities','dailyTaskOperationScopes'];
 s public.assisted_planning_sessions%rowtype; before_sources jsonb; changed jsonb; expected_candidate jsonb; component jsonb; work_fp text; all_fp text;
BEGIN
 PERFORM 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
 WHERE u.user_id=p_actor AND r.key IN ('admin','production') FOR SHARE OF u;
 IF NOT FOUND THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;

 structure_selected:=p_operation='EDIT' AND p_payload ? 'taskOperationScopes';
 IF p_diff ? 'taskOperationScopeTransition' THEN RAISE EXCEPTION 'INVALID_TASK_SCOPE_DIFF'; END IF;
 IF structure_selected THEN
  IF p_payload-ARRAY['taskOperationScopes','expectedRevisionId']<>'{}' OR p_payload->'expectedRevisionId' IS DISTINCT FROM coalesce(to_jsonb(p_expected_revision),'null')
  THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
  SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR NO KEY UPDATE NOWAIT;
  IF FOUND THEN
   IF s.draft_snapshot_json IS DISTINCT FROM s.working_snapshot_json OR s.draft_fingerprint IS DISTINCT FROM s.working_fingerprint
    OR s.draft_scope_json<>'{}' THEN RAISE EXCEPTION 'TASK_SCOPE_DIRTY_DRAFT'; END IF;
   IF (SELECT replay_snapshot_json FROM public.plan_config_revisions WHERE id=s.current_config_revision_id AND plan_id=p_plan_id) IS DISTINCT FROM p_expected_replay
    OR (SELECT identity_json FROM public.plan_config_revisions WHERE id=s.current_config_revision_id AND plan_id=p_plan_id) IS DISTINCT FROM p_expected_identity
   THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
   before_sources:=public.assisted_expected_obligation_sources(s.id);
   changed:=public.assisted_read_bootstrap_sources(p_plan_id);
   -- S0 stores empty assignments as [] in its codec; raw pending rows may use null.
   -- Normalize only this documented representation, preserving every other field/row.
   before_sources:=jsonb_set(before_sources,'{daily_tasks}',(SELECT jsonb_agg(t||jsonb_build_object('assigned_resource_ids',coalesce(nullif(t->'assigned_resource_ids','null'),'[]')) ORDER BY t::text) FROM jsonb_array_elements(before_sources->'daily_tasks') t));
   changed:=jsonb_set(changed,'{daily_tasks}',(SELECT jsonb_agg(t||jsonb_build_object('assigned_resource_ids',coalesce(nullif(t->'assigned_resource_ids','null'),'[]')) ORDER BY t::text) FROM jsonb_array_elements(changed->'daily_tasks') t));
   IF before_sources IS DISTINCT FROM changed
   THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.planning_runs r WHERE r.plan_id=p_plan_id AND (r.status IN ('queued','running','cancelling') OR (r.status='success' AND r.assisted_result_json->>'outcome'='PROPOSAL' AND NOT EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE proposal_run_id=r.id))))
  THEN RAISE EXCEPTION 'TASK_SCOPE_PENDING_PROPOSAL'; END IF;
  PERFORM public.assert_daily_task_operation_scopes(p_plan_id,p_payload->'taskOperationScopes');
  old_chains:=nullif(p.daily_task_operation_scopes->'policies','[]');
  new_chains:=nullif(p_payload#>'{taskOperationScopes,policies}','[]');
  IF old_chains IS NOT DISTINCT FROM new_chains THEN RAISE EXCEPTION 'TASK_SCOPE_NO_CHANGES'; END IF;
  IF p_expected_replay#>path IS DISTINCT FROM public.task_scope_contracts(old_chains) THEN RAISE EXCEPTION 'STALE_TASK_SCOPE'; END IF;
  -- A policy touching protected decisions can only remain literally identical.
  FOR changed IN SELECT value FROM jsonb_array_elements(coalesce(old_chains,'[]')) old_policy WHERE NOT coalesce(new_chains,'[]') @> jsonb_build_array(old_policy.value) UNION SELECT value FROM jsonb_array_elements(coalesce(new_chains,'[]')) new_policy WHERE NOT coalesce(old_chains,'[]') @> jsonb_build_array(new_policy.value) LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.task_scope_member_ids(changed)) m JOIN public.daily_tasks t ON t.id=m::text::integer AND t.plan_id=p_plan_id
    WHERE t.start_planned IS NOT NULL OR t.status IN ('done','in_progress') OR EXISTS(SELECT 1 FROM public.locks WHERE plan_id=p_plan_id AND task_id=t.id))
    OR EXISTS(SELECT 1 FROM public.assisted_planning_stages st,LATERAL jsonb_array_elements(st.snapshot_json->'tasks') t
     WHERE st.plan_id=p_plan_id AND t->>'startPlanned' IS NOT NULL AND public.task_scope_member_ids(changed) @> jsonb_build_array(t->'taskId'))
   THEN RAISE EXCEPTION 'TASK_SCOPE_PROTECTED_DECISIONS'; END IF;
  END LOOP;
  expected_candidate:=CASE WHEN new_chains IS NULL THEN p_expected_replay #- path ELSE jsonb_set(p_expected_replay,path,public.task_scope_contracts(new_chains),true) END;
  expected_candidate:=jsonb_set(expected_candidate,'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}',public.task_scope_task_operations(p_plan_id,p_expected_replay#>'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}',old_chains,new_chains));
  IF expected_candidate IS DISTINCT FROM p_candidate_replay THEN RAISE EXCEPTION 'STALE_TASK_SCOPE_REPLAY'; END IF;
  work_fp:=encode(sha256(convert_to('{"contractVersion":1,"authority":"plan_workday","availability":"AVAILABLE","semanticValue":'||public.round_structure_canonical_json(p_candidate_replay#>'{authorities,plan_workday}')||'}','UTF8')),'hex');
  SELECT value INTO component FROM jsonb_array_elements(p_candidate_identity->'components') WHERE value->>'authority'='plan_workday';
  IF component->>'fingerprint' IS DISTINCT FROM work_fp
   OR jsonb_set(p_expected_identity,'{components}',(SELECT jsonb_agg(CASE WHEN value->>'authority'='plan_workday' THEN jsonb_set(value,'{fingerprint}',to_jsonb(work_fp)) ELSE value END ORDER BY ordinality) FROM jsonb_array_elements(p_expected_identity->'components') WITH ORDINALITY)) - 'configurationFingerprint'
    IS DISTINCT FROM p_candidate_identity-'configurationFingerprint'
  THEN RAISE EXCEPTION 'STALE_TASK_SCOPE_IDENTITY'; END IF;
  SELECT encode(sha256(convert_to('{"contractVersion":1,"components":'||public.round_structure_canonical_json(jsonb_agg(jsonb_build_object('authority',value->'authority','availability',value->'availability','fingerprint',value->'fingerprint') ORDER BY ordinality))||'}','UTF8')),'hex') INTO all_fp
   FROM jsonb_array_elements(p_candidate_identity->'components') WITH ORDINALITY;
  IF p_candidate_identity->>'configurationFingerprint' IS DISTINCT FROM all_fp THEN RAISE EXCEPTION 'STALE_TASK_SCOPE_IDENTITY'; END IF;
  -- Same CANONICAL_MATERIALIZATION contract as 104, before authority mutation.
  -- This prevents the delegate from capturing an old replay against a new rule.
  IF (SELECT fingerprint FROM public.plan_config_revisions WHERE id=p.current_config_revision_id AND plan_id=p_plan_id)
    IS DISTINCT FROM p_expected_identity->>'configurationFingerprint' THEN
   INSERT INTO public.plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json,created_by)
   VALUES(p_plan_id,p.current_config_revision_id,'CANONICAL_MATERIALIZATION',p_expected_identity->>'configurationFingerprint',p_expected_identity,p_expected_replay,
    jsonb_build_object('reason','legacy-or-stale-current-revision'),p_actor) RETURNING id INTO result;
   UPDATE public.plans SET current_config_revision_id=result WHERE id=p_plan_id;
   p_expected_revision:=result;
  END IF;
  guard:=current_setting('optiplan.daily_task_scope_operation',true);
  PERFORM set_config('optiplan.daily_task_scope_operation','versioned',true);
  UPDATE public.plans SET daily_task_operation_scopes=p_payload->'taskOperationScopes'||jsonb_build_object('by',p_actor,'at',now()) WHERE id=p_plan_id;
  PERFORM set_config('optiplan.daily_task_scope_operation',coalesce(guard,''),true);
  -- Reuse the immutable revision diff for the explicit configuration transition.
  -- No admission row, replacement session, mutable bootstrap capture or new table.
  p_diff:=p_diff||jsonb_build_object('taskOperationScopeTransition',jsonb_build_object('contractVersion',1,
   'sessionId',s.id,'baseStageId',s.active_stage_id,'previousSessionRevisionId',s.current_config_revision_id,
   'previousPlanRevisionId',p.current_config_revision_id,'before',p.daily_task_operation_scopes,
   'after',(SELECT daily_task_operation_scopes FROM public.plans WHERE id=p_plan_id),
   'sources',public.assisted_read_bootstrap_sources(p_plan_id)));
 END IF;
 result:=public.apply_day_config_operation_before_task_operation_scopes(p_plan_id,p_actor,p_operation,p_payload-'taskOperationScopes'-CASE WHEN structure_selected THEN 'expectedRevisionId' ELSE '__unused' END,p_expected_revision,
  p_expected_identity,p_expected_replay,p_candidate_identity,p_candidate_replay,p_diff);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;

-- Extend the existing source-transition reader. Assert its exact predecessor
-- fragments rather than silently changing behavior against an unknown ledger.
DO $migration$
DECLARE signature text; definition text; old_text text; new_text text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.assisted_expected_obligation_sources(bigint)','public.assisted_preview_s0_additions(integer)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  old_text:='coalesce(r.diff_json#>>''{anchoredAccompanimentTransition,sessionId}'',r.diff_json#>>''{technicalChainTransition,sessionId}'',r.diff_json#>>''{roundSynchronizationTransition,sessionId}'')';
  new_text:='coalesce(r.diff_json#>>''{taskOperationScopeTransition,sessionId}'',r.diff_json#>>''{anchoredAccompanimentTransition,sessionId}'',r.diff_json#>>''{technicalChainTransition,sessionId}'',r.diff_json#>>''{roundSynchronizationTransition,sessionId}'')';
  IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'TASK_SCOPE_UNEXPECTED_TRANSITION_READER'; END IF;
  definition:=replace(definition,old_text,new_text);
  old_text:='coalesce(transition_record.diff_json#>''{anchoredAccompanimentTransition,sources}'',transition_record.diff_json#>''{technicalChainTransition,sources}'',transition_record.diff_json#>''{roundSynchronizationTransition,sources}'')';
  new_text:='coalesce(transition_record.diff_json#>''{taskOperationScopeTransition,sources}'',transition_record.diff_json#>''{anchoredAccompanimentTransition,sources}'',transition_record.diff_json#>''{technicalChainTransition,sources}'',transition_record.diff_json#>''{roundSynchronizationTransition,sources}'')';
  IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'TASK_SCOPE_UNEXPECTED_TRANSITION_READER'; END IF;
  EXECUTE replace(definition,old_text,new_text);
 END LOOP;
 definition:=pg_get_functiondef('public.assisted_read_bootstrap_sources(integer,boolean)'::regprocedure);
 old_text:='- CASE WHEN t.daily_anchored_accompaniments IS NULL THEN ''''daily_anchored_accompaniments'''' ELSE ''''__absent'''' END';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'TASK_SCOPE_UNEXPECTED_SOURCE_READER'; END IF;
 EXECUTE replace(definition,old_text,old_text||' - CASE WHEN t.daily_task_operation_scopes IS NULL THEN ''''daily_task_operation_scopes'''' ELSE ''''__absent'''' END');
END $migration$;

-- Material validation on both writers. Derive physical consumption from SQL
-- authority; a caller cannot hide a competitor's resources in its snapshot.
CREATE FUNCTION public.assert_task_scope_snapshot(p_plan integer,p_snapshot jsonb,p_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; replay jsonb; actual jsonb; other jsonb; policy jsonb; op jsonb; occupations jsonb:='[]';
 t public.daily_tasks%rowtype; tpl public.plan_task_template_snapshots%rowtype; unit public.plan_itinerant_unit_snapshots%rowtype;
 resources jsonb; stored_resources jsonb; fixed_unit integer; start_min integer; end_min integer; transition_min integer; gap integer;
BEGIN
 SELECT * INTO STRICT p FROM public.plans WHERE id=p_plan;
 IF coalesce(p.daily_task_operation_scopes->'policies','[]')='[]' THEN RETURN; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'STALE_TASK_SCOPE_REVISION'; END IF;
 SELECT replay_snapshot_json INTO STRICT replay FROM public.plan_config_revisions WHERE id=p_revision AND plan_id=p_plan;
 PERFORM public.assert_task_scope_revision(p_plan,replay);
 FOR actual IN SELECT value FROM jsonb_array_elements(p_snapshot->'tasks') WHERE value->>'startPlanned' IS NOT NULL LOOP
  SELECT * INTO t FROM public.daily_tasks WHERE plan_id=p_plan AND id=(actual->>'taskId')::integer;
  IF NOT FOUND OR (SELECT count(*) FROM jsonb_array_elements(p_snapshot->'tasks') row WHERE row->'taskId'=actual->'taskId')<>1 THEN RAISE EXCEPTION 'TASK_SCOPE_SNAPSHOT_INVALID'; END IF;
  SELECT * INTO STRICT tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=t.template_id;
  SELECT value INTO policy FROM jsonb_array_elements(p.daily_task_operation_scopes->'policies') WHERE value->'taskId'=actual->'taskId';
  SELECT value INTO op FROM jsonb_array_elements(replay#>'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}') WHERE value->'taskId'=actual->'taskId';
  start_min:=public.hhmm_to_minutes(actual->>'startPlanned');end_min:=public.hhmm_to_minutes(actual->>'endPlanned');
  IF start_min IS NULL OR end_min IS NULL OR start_min%5<>0 OR end_min-start_min IS DISTINCT FROM coalesce(t.duration_override,tpl.default_duration)
   OR actual->'spaceId' IS DISTINCT FROM to_jsonb(t.space_id) OR t.status='cancelled'
   OR start_min<public.hhmm_to_minutes(p.work_start) OR end_min>public.hhmm_to_minutes(p.work_end)
   OR (p.meal_mode='global_hard_break' AND start_min<public.hhmm_to_minutes(p.meal_end) AND end_min>public.hhmm_to_minutes(p.meal_start))
   OR (t.contestant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.contestants c WHERE c.plan_id=p_plan AND c.id=t.contestant_id AND start_min>=public.hhmm_to_minutes(coalesce(c.availability_start,p.work_start)) AND end_min<=public.hhmm_to_minutes(coalesce(c.availability_end,p.work_end))))
   OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings sp JOIN public.plan_zone_settings z ON z.plan_id=sp.plan_id AND z.zone_id=sp.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=t.space_id AND start_min>=public.hhmm_to_minutes(greatest(coalesce(sp.availability_start,p.work_start),coalesce(z.availability_start,p.work_start))) AND end_min<=public.hhmm_to_minutes(least(coalesce(sp.availability_end,p.work_end),coalesce(z.availability_end,p.work_end))))
   OR EXISTS(SELECT 1 FROM public.locks l WHERE l.plan_id=p_plan AND l.task_id=t.id AND l.lock_type IN ('time','full') AND ((l.locked_start IS NOT NULL AND l.locked_start<>actual->>'startPlanned') OR (l.locked_end IS NOT NULL AND l.locked_end<>actual->>'endPlanned')))
  THEN RAISE EXCEPTION 'TASK_SCOPE_WINDOW_OR_IDENTITY'; END IF;
  unit:=NULL;fixed_unit:=NULL;
  IF policy->>'itinerantUnitId' IS NOT NULL THEN fixed_unit:=(policy->>'itinerantUnitId')::integer;
  ELSIF tpl.itinerant_team_requirement='specific' THEN SELECT id INTO STRICT fixed_unit FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND source_team_id=tpl.itinerant_team_id; END IF;
  IF fixed_unit IS NOT NULL OR tpl.itinerant_team_requirement='any' THEN
   SELECT * INTO unit FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND id=(actual->>'itinerantTeamId')::integer;
   IF NOT FOUND OR jsonb_array_length(unit.members)=0 OR (fixed_unit IS NOT NULL AND unit.id<>fixed_unit)
    OR (fixed_unit IS NULL AND NOT tpl.allowed_itinerant_team_ids @> jsonb_build_array(unit.source_team_id))
    OR (unit.availability_windows IS NOT NULL AND NOT (SELECT range_agg(int4range(public.hhmm_to_minutes(w->>'start'),public.hhmm_to_minutes(w->>'end'),'[)')) @> int4range(start_min,end_min,'[)') FROM jsonb_array_elements(unit.availability_windows) w))
   THEN RAISE EXCEPTION 'TASK_SCOPE_UNIT_INVALID_OR_UNAVAILABLE'; END IF;
  ELSIF actual->>'itinerantTeamId' IS NOT NULL THEN RAISE EXCEPTION 'TASK_SCOPE_UNIT_INVALID_OR_UNAVAILABLE'; END IF;
  SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO resources FROM (
   SELECT value::text::integer id FROM jsonb_array_elements(coalesce(policy->'declaredResourceIds',t.assigned_resource_ids,'[]'))
   UNION SELECT r.id FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND tpl.resource_requirements#>ARRAY['byItem',r.resource_item_id::text]='1'
   UNION SELECT (m->>'planResourceItemId')::integer FROM jsonb_array_elements(coalesce(unit.members,'[]')) m
   UNION SELECT a.plan_resource_item_id FROM public.plan_space_resource_assignments a WHERE a.plan_id=p_plan AND a.space_id=t.space_id AND coalesce(policy->>'resourceInheritance','LOCATION')='LOCATION'
   UNION SELECT a.plan_resource_item_id FROM public.plan_zone_resource_assignments a JOIN public.plan_space_settings sp ON sp.plan_id=a.plan_id AND sp.zone_id=a.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=t.space_id AND coalesce(policy->>'resourceInheritance','LOCATION')='LOCATION'
   UNION SELECT l.locked_resource_id FROM public.locks l WHERE l.plan_id=p_plan AND l.task_id=t.id AND l.lock_type IN ('resource','full') AND l.locked_resource_id IS NOT NULL
  ) required;
  -- SQL stores direct/materialized assignments. Location inheritance remains a
  -- derived physical obligation, including for competitors outside the override.
  SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO stored_resources FROM (
   SELECT value::text::integer id FROM jsonb_array_elements(coalesce(policy->'declaredResourceIds',t.assigned_resource_ids,'[]'))
   UNION SELECT r.id FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND tpl.resource_requirements#>ARRAY['byItem',r.resource_item_id::text]='1'
   UNION SELECT (m->>'planResourceItemId')::integer FROM jsonb_array_elements(coalesce(unit.members,'[]')) m
   UNION SELECT l.locked_resource_id FROM public.locks l WHERE l.plan_id=p_plan AND l.task_id=t.id AND l.lock_type IN ('resource','full') AND l.locked_resource_id IS NOT NULL
  ) direct_and_materialized;
  IF jsonb_typeof(actual->'assignedResourceIds') IS DISTINCT FROM 'array'
   OR (SELECT coalesce(jsonb_agg(value ORDER BY value::text::integer),'[]') FROM jsonb_array_elements(actual->'assignedResourceIds')) IS DISTINCT FROM stored_resources
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(resources) rid WHERE NOT EXISTS(SELECT 1 FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND r.id=rid::text::integer AND r.is_available AND start_min>=public.hhmm_to_minutes(coalesce(r.availability_start,p.work_start)) AND end_min<=public.hhmm_to_minutes(coalesce(r.availability_end,p.work_end))))
   OR EXISTS(SELECT 1 FROM jsonb_each(coalesce(tpl.resource_requirements->'byItem','{}')) req WHERE req.value<>'1'::jsonb OR NOT EXISTS(SELECT 1 FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND r.resource_item_id::text=req.key))
  THEN RAISE EXCEPTION 'TASK_SCOPE_PHYSICAL_RESOURCES'; END IF;
  occupations:=occupations||jsonb_build_array(jsonb_build_object('task',t.id,'start',start_min,'end',end_min,'space',t.space_id,'participant',t.contestant_id,'blocks',coalesce(policy->'blocksSpace','true'),'unit',unit.id,'unitTransition',coalesce(unit.transition_minutes,0),'resources',resources,
   'before',tpl.participant_margin_before_minutes,'after',tpl.participant_margin_after_minutes));
 END LOOP;
 FOR actual IN SELECT value FROM jsonb_array_elements(occupations) LOOP
  FOR other IN SELECT value FROM jsonb_array_elements(occupations) WHERE value->'task'<>actual->'task' LOOP
   gap:=(other->>'start')::integer-(actual->>'end')::integer;
   IF (actual->>'start')::integer<(other->>'end')::integer AND (other->>'start')::integer<(actual->>'end')::integer THEN
    IF (actual->'space'=other->'space' AND actual->'blocks'='true' AND other->'blocks'='true')
     OR (actual->>'participant' IS NOT NULL AND actual->'participant'=other->'participant')
     OR (actual->>'unit' IS NOT NULL AND actual->'unit'=other->'unit')
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'resources') rid WHERE other->'resources' @> jsonb_build_array(rid))
    THEN RAISE EXCEPTION 'TASK_SCOPE_PHYSICAL_CONFLICT'; END IF;
   ELSIF gap>=0 THEN
    IF actual->>'participant' IS NOT NULL AND actual->'participant'=other->'participant'
     AND gap<coalesce(greatest((actual->>'after')::integer,(other->>'before')::integer),p.participant_transition_minutes)
    THEN RAISE EXCEPTION 'TASK_SCOPE_PARTICIPANT_TRANSITION'; END IF;
    IF actual->'space'<>other->'space' THEN
     transition_min:=(p.planner_next_profile#>>'{configuration,resourceTransitionMinutes}')::integer;
     IF (actual->>'unit' IS NOT NULL AND actual->'unit'=other->'unit' AND gap<(actual->>'unitTransition')::integer)
      OR (gap<transition_min AND EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'resources') rid WHERE other->'resources' @> jsonb_build_array(rid)))
     THEN RAISE EXCEPTION 'TASK_SCOPE_RESOURCE_TRANSITION'; END IF;
    END IF;
   END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_task_scope_snapshot(integer,jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_task_scope_snapshot(integer,jsonb,bigint) TO service_role;
CREATE FUNCTION public.guard_task_scope_stage() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype;
BEGIN
 IF TG_TABLE_NAME='planning_stage_validations' THEN
  SELECT * INTO STRICT s FROM public.assisted_planning_sessions WHERE id=NEW.session_id AND plan_id=NEW.plan_id;
  PERFORM public.assert_task_scope_snapshot(NEW.plan_id,s.draft_snapshot_json,NEW.config_revision_id);
 ELSIF NEW.ordinal>0 THEN PERFORM public.assert_task_scope_snapshot(NEW.plan_id,NEW.snapshot_json,NEW.config_revision_id); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_scope_validation BEFORE INSERT ON public.planning_stage_validations FOR EACH ROW EXECUTE FUNCTION public.guard_task_scope_stage();
CREATE TRIGGER task_scope_stage BEFORE INSERT ON public.assisted_planning_stages FOR EACH ROW EXECUTE FUNCTION public.guard_task_scope_stage();
REVOKE ALL ON FUNCTION public.guard_task_scope_stage() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.guard_task_scope_source() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.plans p,LATERAL jsonb_array_elements(coalesce(p.daily_task_operation_scopes->'policies','[]')) policy WHERE p.id=OLD.plan_id AND policy->>'taskId'=OLD.id::text) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'TASK_SCOPE_REFERENCED'; END IF;
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.contestant_id IS DISTINCT FROM OLD.contestant_id OR NEW.space_id IS DISTINCT FROM OLD.space_id OR NEW.zone_id IS DISTINCT FROM OLD.zone_id OR NEW.duration_override IS DISTINCT FROM OLD.duration_override OR (NEW.status='cancelled' AND NEW.status IS DISTINCT FROM OLD.status)
  THEN RAISE EXCEPTION 'TASK_SCOPE_REQUIRES_VERSIONED_CHANGE'; END IF;
  -- Reuse the existing 116 accept/restore loop's transaction-scoped marker.
  IF (NEW.start_planned IS DISTINCT FROM OLD.start_planned OR NEW.end_planned IS DISTINCT FROM OLD.end_planned OR NEW.assigned_resource_ids IS DISTINCT FROM OLD.assigned_resource_ids)
   AND current_setting('optiplan.anchored_task_materialization',true) IS DISTINCT FROM txid_current()::text
  THEN RAISE EXCEPTION 'TASK_SCOPE_REQUIRES_ASSISTED_MATERIALIZATION'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER task_scope_source BEFORE UPDATE OR DELETE ON public.daily_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_task_scope_source();
REVOKE ALL ON FUNCTION public.guard_task_scope_source() FROM PUBLIC,anon,authenticated,service_role;
