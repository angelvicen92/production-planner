-- Native anchored operation. NULL preserves every historical authority and source token.
ALTER TABLE public.plans ADD COLUMN daily_anchored_accompaniments jsonb;
ALTER TABLE public.plans ADD CONSTRAINT daily_anchored_single_authority CHECK (
 daily_anchored_accompaniments IS NULL OR (planner_next_profile IS NOT NULL AND planner_next_configuration IS NULL));
CREATE FUNCTION public.guard_daily_anchored_accompaniments() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.daily_anchored_accompaniments IS NOT NULL) OR
 (TG_OP='UPDATE' AND NEW.daily_anchored_accompaniments IS DISTINCT FROM OLD.daily_anchored_accompaniments) THEN
  IF current_user<>'service_role' OR current_setting('optiplan.daily_anchored_operation',true) IS DISTINCT FROM 'versioned'
  THEN RAISE EXCEPTION 'ANCHORED_REQUIRES_VERSIONED_OPERATION'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_daily_anchored_accompaniments BEFORE INSERT OR UPDATE ON public.plans
 FOR EACH ROW EXECUTE FUNCTION public.guard_daily_anchored_accompaniments();
REVOKE ALL ON FUNCTION public.guard_daily_anchored_accompaniments() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.anchored_member_ids(policy jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (policy->'beforeTaskIds')||jsonb_build_array(policy->'anchorTaskId')||(policy->'afterTaskIds')
$$;
CREATE FUNCTION public.anchored_contracts(policies jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT nullif(coalesce(jsonb_agg(value-'itinerantUnitId' ORDER BY ordinality),'[]'),'[]')
 FROM jsonb_array_elements(coalesce(policies,'[]')) WITH ORDINALITY
$$;
REVOKE ALL ON FUNCTION public.anchored_member_ids(jsonb),public.anchored_contracts(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.anchored_member_ids(jsonb),public.anchored_contracts(jsonb) TO service_role;

CREATE FUNCTION public.assert_daily_anchored_accompaniments(p_plan integer,p_structure jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE policy jsonb; member jsonb; t public.daily_tasks%rowtype; tpl public.plan_task_template_snapshots%rowtype;
 anchor public.daily_tasks%rowtype; unit public.plan_itinerant_unit_snapshots%rowtype; ids integer[]; position integer; dep integer;
BEGIN
 IF jsonb_typeof(p_structure) IS DISTINCT FROM 'object' OR p_structure->'contractVersion' IS DISTINCT FROM '1'::jsonb
 OR p_structure-ARRAY['contractVersion','policies']<>'{}' OR jsonb_typeof(p_structure->'policies') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_structure->'policies')>1 THEN RAISE EXCEPTION 'ANCHORED_INVALID_STRUCTURE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plans WHERE id=p_plan AND planner_next_configuration IS NULL
  AND planner_next_profile#>>'{configuration,scenario}'='MAIN_WITH_VOCAL_FEEDER'
  AND planner_next_profile#>>'{configuration,setup}'='NONE' AND planner_next_profile#>>'{configuration,transport}'='NONE'
  AND coalesce(daily_round_synchronization->'policies','[]')='[]' AND coalesce(daily_technical_chains->'policies','[]')='[]')
 OR public.effective_operation_continuity(p_plan,'[]')<>'[]' THEN RAISE EXCEPTION 'UNSUPPORTED_ANCHORED_COMBINATION'; END IF;
 FOR policy IN SELECT value FROM jsonb_array_elements(p_structure->'policies') LOOP
  IF policy-ARRAY['id','anchorTaskId','beforeTaskIds','afterTaskIds','itinerantUnitId','adjacency','internalTransition','resourceContinuity']<>'{}'
  OR jsonb_typeof(policy->'id') IS DISTINCT FROM 'string' OR length(btrim(policy->>'id')) NOT BETWEEN 1 AND 120
  OR policy->>'id'<>btrim(policy->>'id') OR policy->>'adjacency' IS DISTINCT FROM 'REQUIRED'
  OR policy->>'internalTransition' IS DISTINCT FROM 'INCLUDED' OR policy->>'resourceContinuity' IS DISTINCT FROM 'REQUIRED'
  OR jsonb_typeof(policy->'beforeTaskIds') IS DISTINCT FROM 'array' OR jsonb_array_length(policy->'beforeTaskIds')<>1
  OR jsonb_typeof(policy->'afterTaskIds') IS DISTINCT FROM 'array' OR jsonb_array_length(policy->'afterTaskIds')<>1
  OR jsonb_typeof(policy->'anchorTaskId') IS DISTINCT FROM 'number' OR (policy->>'anchorTaskId')!~'^[1-9][0-9]*$'
  OR jsonb_typeof(policy->'itinerantUnitId') IS DISTINCT FROM 'number' OR (policy->>'itinerantUnitId')!~'^[1-9][0-9]*$'
  THEN RAISE EXCEPTION 'ANCHORED_INVALID_STRUCTURE'; END IF;
  SELECT * INTO unit FROM public.plan_itinerant_unit_snapshots WHERE id=(policy->>'itinerantUnitId')::integer AND plan_id=p_plan;
  IF NOT FOUND OR jsonb_array_length(unit.members)=0 THEN RAISE EXCEPTION 'ANCHORED_INVALID_UNIT'; END IF;
  SELECT * INTO anchor FROM public.daily_tasks WHERE id=(policy->>'anchorTaskId')::integer AND plan_id=p_plan;
  IF NOT FOUND OR anchor.contestant_id IS NULL OR anchor.space_id IS DISTINCT FROM (SELECT (planner_next_profile#>>'{configuration,mainFlow,spaceId}')::integer FROM public.plans WHERE id=p_plan)
  THEN RAISE EXCEPTION 'ANCHORED_INVALID_ANCHOR'; END IF;
  ids:='{}';
  FOR member IN SELECT value FROM jsonb_array_elements(public.anchored_member_ids(policy)) LOOP
   IF jsonb_typeof(member) IS DISTINCT FROM 'number' OR member::text!~'^[1-9][0-9]*$' OR member::text::integer=ANY(ids)
   THEN RAISE EXCEPTION 'ANCHORED_DUPLICATE_OR_INVALID_MEMBER'; END IF;
   ids:=array_append(ids,member::text::integer);
   SELECT * INTO t FROM public.daily_tasks WHERE id=member::text::integer AND plan_id=p_plan;
   IF NOT FOUND OR t.status='cancelled' OR t.contestant_id IS DISTINCT FROM anchor.contestant_id
    OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings WHERE plan_id=p_plan AND space_id=t.space_id)
   THEN RAISE EXCEPTION 'ANCHORED_INVALID_MEMBER'; END IF;
   SELECT * INTO tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=t.template_id;
   IF NOT FOUND OR tpl.planner_next_operation->>'kind' IS DISTINCT FROM (CASE WHEN t.id=anchor.id THEN 'main' ELSE 'auxiliary' END)
    OR (t.template_id=(SELECT (planner_next_profile->>'mealTaskTemplateId')::integer FROM public.plans WHERE id=p_plan AND meal_mode='flexible_meal_window'))
    OR tpl.setup_id IS NOT NULL OR coalesce(t.duration_override,tpl.default_duration)<=0 OR coalesce(t.duration_override,tpl.default_duration)%5<>0
    OR coalesce(tpl.resource_requirements->'byType','{}')<>'{}' OR coalesce(tpl.resource_requirements->'anyOf','[]')<>'[]'
    OR (tpl.itinerant_team_requirement='specific' AND tpl.itinerant_team_id IS DISTINCT FROM unit.source_team_id)
    OR (tpl.itinerant_team_requirement='any' AND NOT tpl.allowed_itinerant_team_ids @> jsonb_build_array(unit.source_team_id))
   THEN RAISE EXCEPTION 'ANCHORED_INVALID_MEMBER'; END IF;
  END LOOP;
  -- An explicit order cannot override a contradictory dependency.
  FOR position IN 1..3 LOOP
   SELECT * INTO t FROM public.daily_tasks WHERE id=ids[position];
   FOR dep IN SELECT (value::text)::integer FROM public.plan_task_template_snapshots s,LATERAL jsonb_array_elements(s.dependency_template_ids)
    WHERE s.plan_id=p_plan AND s.source_template_id=t.template_id LOOP
    IF EXISTS(SELECT 1 FROM public.daily_tasks d WHERE d.plan_id=p_plan AND d.template_id=dep AND d.contestant_id=anchor.contestant_id
     AND d.id=ANY(ids) AND array_position(ids,d.id)>=position) THEN RAISE EXCEPTION 'ANCHORED_CONTRADICTORY_ORDER'; END IF;
   END LOOP;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_daily_anchored_accompaniments(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_daily_anchored_accompaniments(integer,jsonb) TO service_role;

-- Rebuild only fields owned by this declaration. Direct resources remain declared;
-- the effective resolver derives unit members separately for both LOCATION and OPERATION_ONLY.
CREATE FUNCTION public.anchored_task_operations(p_plan integer,operations jsonb,old_policies jsonb,new_policies jsonb,capture_direct boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE op jsonb; result jsonb:='[]'; policy jsonb; tpl public.plan_task_template_snapshots%rowtype; unit_id integer; allowed jsonb; direct_ids jsonb; dependencies jsonb;
BEGIN
 FOR op IN SELECT value FROM jsonb_array_elements(operations) LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(old_policies,'[]')) p WHERE public.anchored_member_ids(p) @> jsonb_build_array(op->'taskId')) THEN
   SELECT s.* INTO STRICT tpl FROM public.daily_tasks d JOIN public.plan_task_template_snapshots s ON s.plan_id=d.plan_id AND s.source_template_id=d.template_id WHERE d.plan_id=p_plan AND d.id=(op->>'taskId')::integer;
   SELECT id INTO unit_id FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND source_team_id=tpl.itinerant_team_id;
   SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO allowed FROM public.plan_itinerant_unit_snapshots
    WHERE plan_id=p_plan AND tpl.allowed_itinerant_team_ids @> jsonb_build_array(source_team_id);
   op:=(op-ARRAY['blocksSpace','agendaScope','resourceInheritance','itinerantTeamId','itinerantTeamRequirement','allowedItinerantTeamIds','declaredResourceIds'])
    ||jsonb_build_object('itinerantTeamId',unit_id,'itinerantTeamRequirement',tpl.itinerant_team_requirement,'allowedItinerantTeamIds',allowed);
   SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO direct_ids FROM (
    SELECT c.vocal_coach_plan_resource_item_id id FROM public.contestants c JOIN public.daily_tasks d ON d.contestant_id=c.id WHERE d.plan_id=p_plan AND d.id=(op->>'taskId')::integer AND tpl.requires_coach AND c.vocal_coach_plan_resource_item_id IS NOT NULL
    UNION SELECT r.id FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND tpl.itinerant_team_requirement<>'none' AND tpl.resource_requirements#>ARRAY['byItem',r.resource_item_id::text]='1'
   ) direct;
   IF direct_ids<>'[]' THEN op:=op||jsonb_build_object('declaredResourceIds',direct_ids); END IF;

  END IF;
  SELECT p INTO policy FROM jsonb_array_elements(coalesce(new_policies,'[]')) p WHERE public.anchored_member_ids(p) @> jsonb_build_array(op->'taskId');
  IF FOUND THEN
   SELECT coalesce(jsonb_agg(d.id ORDER BY dep.ordinality,d.id),'[]') INTO dependencies
    FROM public.daily_tasks own_task JOIN public.plan_task_template_snapshots own_template ON own_template.plan_id=own_task.plan_id AND own_template.source_template_id=own_task.template_id,
    LATERAL jsonb_array_elements(own_template.dependency_template_ids) WITH ORDINALITY dep(value,ordinality),public.daily_tasks d
    WHERE own_task.plan_id=p_plan AND own_task.id=(op->>'taskId')::integer AND d.plan_id=p_plan
     AND d.contestant_id=own_task.contestant_id AND d.template_id=dep.value::text::integer AND d.status<>'cancelled';
   op:=(op-ARRAY['jointGroupId','setupFamilyId','breakKind','mealOccupiesSpace'])||jsonb_build_object(
    'plannerNextKind',CASE WHEN op->'taskId'=policy->'anchorTaskId' THEN 'main' ELSE 'auxiliary' END,
    'operationalRole','productive_task','dependsOnTaskIds',dependencies);
   IF capture_direct THEN
    SELECT coalesce(jsonb_agg(value ORDER BY value::text::integer),'[]') INTO direct_ids FROM (
     SELECT value FROM jsonb_array_elements(coalesce(op->'declaredResourceIds','[]'))
     UNION SELECT value FROM public.daily_tasks d,LATERAL jsonb_array_elements(coalesce(nullif(to_jsonb(d)->'assigned_resource_ids','null'),'[]')) WHERE d.plan_id=p_plan AND d.id=(op->>'taskId')::integer
    ) direct;
    op:=op||jsonb_build_object('declaredResourceIds',direct_ids);
   ELSE op:=op||jsonb_build_object('declaredResourceIds',coalesce(op->'declaredResourceIds','[]')); END IF;
   op:=op||jsonb_build_object('itinerantTeamId',policy->'itinerantUnitId','itinerantTeamRequirement','specific','allowedItinerantTeamIds',jsonb_build_array(policy->'itinerantUnitId'),
    'agendaScope',CASE WHEN op->'taskId'=policy->'anchorTaskId' THEN 'PHYSICAL_SPACE' ELSE 'ITINERANT_UNIT' END,
    'resourceInheritance',CASE WHEN op->'taskId'=policy->'anchorTaskId' THEN 'LOCATION' ELSE 'OPERATION_ONLY' END);
   IF op->'taskId'<>policy->'anchorTaskId' THEN op:=op||'{"blocksSpace":false}'; ELSE op:=op-'blocksSpace'; END IF;
  END IF;
  result:=result||jsonb_build_array(op);
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.anchored_task_operations(integer,jsonb,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.anchored_task_operations(integer,jsonb,jsonb,jsonb,boolean) TO service_role;

CREATE FUNCTION public.guard_anchored_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; policies jsonb; operations jsonb;
BEGIN
 SELECT * INTO p FROM public.plans WHERE id=NEW.plan_id;
 IF p.planner_next_profile IS NULL THEN RETURN NEW; END IF;
 policies:=nullif(p.daily_anchored_accompaniments->'policies','[]');
 IF NEW.replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities,anchoredAccompaniments}' IS DISTINCT FROM public.anchored_contracts(policies)
 THEN RAISE EXCEPTION 'ANCHORED_AUTHORITY_NOT_MATERIALIZED'; END IF;
 IF policies IS NOT NULL THEN
  PERFORM public.assert_daily_anchored_accompaniments(NEW.plan_id,p.daily_anchored_accompaniments-ARRAY['by','at']);
  operations:=NEW.replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}';
  IF operations IS DISTINCT FROM public.anchored_task_operations(NEW.plan_id,operations,NULL,policies)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(policies) policy,LATERAL jsonb_array_elements(public.anchored_member_ids(policy)) member
    WHERE (SELECT count(*) FROM jsonb_array_elements(operations) op WHERE op->'taskId'=member)<>1)
  THEN RAISE EXCEPTION 'ANCHORED_TASK_OPERATIONS_NOT_MATERIALIZED'; END IF;
  IF EXISTS(SELECT 1 FROM public.plan_config_revisions current_revision
   WHERE current_revision.id=p.current_config_revision_id AND current_revision.plan_id=NEW.plan_id
   AND current_revision.replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities,anchoredAccompaniments}'=public.anchored_contracts(policies)
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(policies) policy,LATERAL jsonb_array_elements(public.anchored_member_ids(policy)) member
    WHERE (SELECT op->'declaredResourceIds' FROM jsonb_array_elements(operations) op WHERE op->'taskId'=member)
     IS DISTINCT FROM (SELECT op->'declaredResourceIds' FROM jsonb_array_elements(current_revision.replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}') op WHERE op->'taskId'=member)))
  THEN RAISE EXCEPTION 'ANCHORED_RESOURCE_PROVENANCE_NOT_MATERIALIZED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anchored_revision BEFORE INSERT ON public.plan_config_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_anchored_revision();
REVOKE ALL ON FUNCTION public.guard_anchored_revision() FROM PUBLIC,anon,authenticated,service_role;

-- Reuse v5 CAS, source locking, canonical identity and session transition pattern.
-- Anchored operations additionally own three task-operation projections; the expected
-- replay is reconstructed above, not accepted as an arbitrary client delta.
ALTER FUNCTION public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) RENAME TO apply_day_config_operation_before_anchored_accompaniments;
CREATE OR REPLACE FUNCTION public.apply_day_config_operation_v5(
 p_plan_id integer,p_actor uuid,p_operation text,p_payload jsonb,p_expected_revision bigint,
 p_expected_identity jsonb,p_expected_replay jsonb,p_candidate_identity jsonb,p_candidate_replay jsonb,p_diff jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; guard text; result bigint;
 structure_selected boolean; old_chains jsonb; new_chains jsonb; path text[]:=ARRAY['authorities','plan_workday','0','plannerNextAuthorities','anchoredAccompaniments'];
 s public.assisted_planning_sessions%rowtype; before_sources jsonb; changed jsonb; expected_candidate jsonb; component jsonb; work_fp text; all_fp text;
BEGIN
 PERFORM 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
 WHERE u.user_id=p_actor AND r.key IN ('admin','production') FOR SHARE OF u;
 IF NOT FOUND THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;

 structure_selected:=p_operation='EDIT' AND p_payload ? 'anchoredAccompaniments';
 IF p_diff ? 'anchoredAccompanimentTransition' THEN RAISE EXCEPTION 'INVALID_ANCHORED_DIFF'; END IF;
 IF structure_selected THEN
  IF p_payload-ARRAY['anchoredAccompaniments','expectedRevisionId']<>'{}' OR p_payload->'expectedRevisionId' IS DISTINCT FROM coalesce(to_jsonb(p_expected_revision),'null')
  THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
  SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR NO KEY UPDATE NOWAIT;
  IF FOUND THEN
   IF s.draft_snapshot_json IS DISTINCT FROM s.working_snapshot_json OR s.draft_fingerprint IS DISTINCT FROM s.working_fingerprint
    OR s.draft_scope_json<>'{}' THEN RAISE EXCEPTION 'ANCHORED_DIRTY_DRAFT'; END IF;
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
  THEN RAISE EXCEPTION 'ANCHORED_PENDING_PROPOSAL'; END IF;
  PERFORM public.assert_daily_anchored_accompaniments(p_plan_id,p_payload->'anchoredAccompaniments');
  old_chains:=nullif(p.daily_anchored_accompaniments->'policies','[]');
  new_chains:=nullif(p_payload#>'{anchoredAccompaniments,policies}','[]');
  IF old_chains IS NOT DISTINCT FROM new_chains THEN RAISE EXCEPTION 'ANCHORED_NO_CHANGES'; END IF;
  IF p_expected_replay#>path IS DISTINCT FROM public.anchored_contracts(old_chains) THEN RAISE EXCEPTION 'STALE_ANCHORED'; END IF;
  -- A policy touching protected decisions can only remain literally identical.
  FOR changed IN SELECT value FROM jsonb_array_elements(coalesce(old_chains,'[]')) UNION SELECT value FROM jsonb_array_elements(coalesce(new_chains,'[]')) LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.anchored_member_ids(changed)) m JOIN public.daily_tasks t ON t.id=m::text::integer AND t.plan_id=p_plan_id
    WHERE t.start_planned IS NOT NULL OR t.status IN ('done','in_progress') OR EXISTS(SELECT 1 FROM public.locks WHERE plan_id=p_plan_id AND task_id=t.id))
    OR EXISTS(SELECT 1 FROM public.assisted_planning_stages st,LATERAL jsonb_array_elements(st.snapshot_json->'tasks') t
     WHERE st.plan_id=p_plan_id AND t->>'startPlanned' IS NOT NULL AND public.anchored_member_ids(changed) @> jsonb_build_array(t->'taskId'))
   THEN RAISE EXCEPTION 'ANCHORED_PROTECTED_DECISIONS'; END IF;
  END LOOP;
  expected_candidate:=CASE WHEN new_chains IS NULL THEN p_expected_replay #- path ELSE jsonb_set(p_expected_replay,path,public.anchored_contracts(new_chains),true) END;
  expected_candidate:=jsonb_set(expected_candidate,'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}',public.anchored_task_operations(p_plan_id,p_expected_replay#>'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}',old_chains,new_chains,true));
  IF expected_candidate IS DISTINCT FROM p_candidate_replay THEN RAISE EXCEPTION 'STALE_ANCHORED_REPLAY'; END IF;
  work_fp:=encode(sha256(convert_to('{"contractVersion":1,"authority":"plan_workday","availability":"AVAILABLE","semanticValue":'||public.round_structure_canonical_json(p_candidate_replay#>'{authorities,plan_workday}')||'}','UTF8')),'hex');
  SELECT value INTO component FROM jsonb_array_elements(p_candidate_identity->'components') WHERE value->>'authority'='plan_workday';
  IF component->>'fingerprint' IS DISTINCT FROM work_fp
   OR jsonb_set(p_expected_identity,'{components}',(SELECT jsonb_agg(CASE WHEN value->>'authority'='plan_workday' THEN jsonb_set(value,'{fingerprint}',to_jsonb(work_fp)) ELSE value END ORDER BY ordinality) FROM jsonb_array_elements(p_expected_identity->'components') WITH ORDINALITY)) - 'configurationFingerprint'
    IS DISTINCT FROM p_candidate_identity-'configurationFingerprint'
  THEN RAISE EXCEPTION 'STALE_ANCHORED_IDENTITY'; END IF;
  SELECT encode(sha256(convert_to('{"contractVersion":1,"components":'||public.round_structure_canonical_json(jsonb_agg(jsonb_build_object('authority',value->'authority','availability',value->'availability','fingerprint',value->'fingerprint') ORDER BY ordinality))||'}','UTF8')),'hex') INTO all_fp
   FROM jsonb_array_elements(p_candidate_identity->'components') WITH ORDINALITY;
  IF p_candidate_identity->>'configurationFingerprint' IS DISTINCT FROM all_fp THEN RAISE EXCEPTION 'STALE_ANCHORED_IDENTITY'; END IF;
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
  guard:=current_setting('optiplan.daily_anchored_operation',true);
  PERFORM set_config('optiplan.daily_anchored_operation','versioned',true);
  UPDATE public.plans SET daily_anchored_accompaniments=p_payload->'anchoredAccompaniments'||jsonb_build_object('by',p_actor,'at',now()) WHERE id=p_plan_id;
  PERFORM set_config('optiplan.daily_anchored_operation',coalesce(guard,''),true);
  -- Reuse the immutable revision diff for the explicit configuration transition.
  -- No admission row, replacement session, mutable bootstrap capture or new table.
  p_diff:=p_diff||jsonb_build_object('anchoredAccompanimentTransition',jsonb_build_object('contractVersion',1,
   'sessionId',s.id,'baseStageId',s.active_stage_id,'previousSessionRevisionId',s.current_config_revision_id,
   'previousPlanRevisionId',p.current_config_revision_id,'before',p.daily_anchored_accompaniments,
   'after',(SELECT daily_anchored_accompaniments FROM public.plans WHERE id=p_plan_id),
   'sources',public.assisted_read_bootstrap_sources(p_plan_id)));
 END IF;
 result:=public.apply_day_config_operation_before_anchored_accompaniments(p_plan_id,p_actor,p_operation,p_payload-'anchoredAccompaniments'-CASE WHEN structure_selected THEN 'expectedRevisionId' ELSE '__unused' END,p_expected_revision,
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
  old_text:='coalesce(r.diff_json#>>''{technicalChainTransition,sessionId}'',r.diff_json#>>''{roundSynchronizationTransition,sessionId}'')';
  new_text:='coalesce(r.diff_json#>>''{anchoredAccompanimentTransition,sessionId}'',r.diff_json#>>''{technicalChainTransition,sessionId}'',r.diff_json#>>''{roundSynchronizationTransition,sessionId}'')';
  IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'ANCHORED_UNEXPECTED_TRANSITION_READER'; END IF;
  definition:=replace(definition,old_text,new_text);
  old_text:='coalesce(transition_record.diff_json#>''{technicalChainTransition,sources}'',transition_record.diff_json#>''{roundSynchronizationTransition,sources}'')';
  new_text:='coalesce(transition_record.diff_json#>''{anchoredAccompanimentTransition,sources}'',transition_record.diff_json#>''{technicalChainTransition,sources}'',transition_record.diff_json#>''{roundSynchronizationTransition,sources}'')';
  IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'ANCHORED_UNEXPECTED_TRANSITION_READER'; END IF;
  EXECUTE replace(definition,old_text,new_text);
 END LOOP;
 definition:=pg_get_functiondef('public.assisted_read_bootstrap_sources(integer,boolean)'::regprocedure);
 old_text:='- CASE WHEN t.daily_technical_chains IS NULL THEN ''''daily_technical_chains'''' ELSE ''''__absent'''' END';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'ANCHORED_UNEXPECTED_SOURCE_READER'; END IF;
 EXECUTE replace(definition,old_text,old_text||' - CASE WHEN t.daily_anchored_accompaniments IS NULL THEN ''''daily_anchored_accompaniments'''' ELSE ''''__absent'''' END');
END $migration$;

CREATE FUNCTION public.assert_daily_anchored_snapshot(p_plan integer,p_snapshot jsonb,p_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; policy jsonb; member jsonb; actual jsonb; other jsonb; unit public.plan_itinerant_unit_snapshots%rowtype;
 task_row public.daily_tasks%rowtype; tpl public.plan_task_template_snapshots%rowtype; resource public.plan_resource_items%rowtype;
 start_min integer; end_min integer; previous_end integer; operation_start integer; operation_end integer; members jsonb; rid jsonb; placed_count integer;
 anchor_start integer; anchor_end integer; anchor_space integer; participant integer; selected_unit public.plan_itinerant_unit_snapshots%rowtype; selected_members jsonb; same_unit boolean;
BEGIN
 SELECT * INTO p FROM public.plans WHERE id=p_plan;
 IF p.daily_anchored_accompaniments IS NULL OR p.daily_anchored_accompaniments->'policies'='[]' THEN RETURN; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_revision OR (SELECT replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities,anchoredAccompaniments}' FROM public.plan_config_revisions WHERE id=p_revision AND plan_id=p_plan)
  IS DISTINCT FROM public.anchored_contracts(p.daily_anchored_accompaniments->'policies') THEN RAISE EXCEPTION 'STALE_ANCHORED_REPLAY'; END IF;
 PERFORM public.assert_daily_anchored_accompaniments(p_plan,p.daily_anchored_accompaniments-ARRAY['by','at']);
 policy:=p.daily_anchored_accompaniments#>'{policies,0}';
 SELECT * INTO STRICT unit FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND id=(policy->>'itinerantUnitId')::bigint;
 SELECT jsonb_agg(value->'planResourceItemId' ORDER BY (value->>'planResourceItemId')::integer) INTO members FROM jsonb_array_elements(unit.members);
 SELECT count(*) INTO placed_count FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE public.anchored_member_ids(policy) @> jsonb_build_array(t->'taskId') AND t->>'startPlanned' IS NOT NULL;
 -- This bounded native contract admits the anchored unit before other scopes.
 -- Never silently certify a detached future operation using individual task spots.
 IF placed_count=0 THEN RAISE EXCEPTION 'ANCHORED_FUTURE_STRUCTURAL_WITNESS_REQUIRED'; END IF;
 IF placed_count<>3 THEN RAISE EXCEPTION 'ANCHORED_INCOMPLETE_OPERATION'; END IF;
 FOR member IN SELECT value FROM jsonb_array_elements(public.anchored_member_ids(policy)) LOOP
  IF (SELECT count(*) FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE t->'taskId'=member)<>1 THEN RAISE EXCEPTION 'ANCHORED_CERTIFICATE_INVALID'; END IF;
  SELECT value INTO actual FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE t->'taskId'=member;
  SELECT * INTO STRICT task_row FROM public.daily_tasks WHERE plan_id=p_plan AND id=member::text::integer;
  SELECT * INTO STRICT tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=task_row.template_id;
  start_min:=public.hhmm_to_minutes(actual->>'startPlanned');end_min:=public.hhmm_to_minutes(actual->>'endPlanned');
  IF start_min IS NULL OR end_min IS NULL OR start_min%5<>0 OR end_min-start_min IS DISTINCT FROM coalesce(task_row.duration_override,tpl.default_duration)
   OR (previous_end IS NOT NULL AND previous_end<>start_min) OR actual->'spaceId' IS DISTINCT FROM to_jsonb(task_row.space_id)
   OR actual->'itinerantTeamId' IS DISTINCT FROM policy->'itinerantUnitId' OR jsonb_typeof(actual->'assignedResourceIds') IS DISTINCT FROM 'array'
   OR NOT actual->'assignedResourceIds' @> members OR start_min<public.hhmm_to_minutes(p.work_start) OR end_min>public.hhmm_to_minutes(p.work_end)
   OR NOT EXISTS(SELECT 1 FROM public.contestants c WHERE c.plan_id=p_plan AND c.id=task_row.contestant_id AND start_min>=public.hhmm_to_minutes(coalesce(c.availability_start,p.work_start)) AND end_min<=public.hhmm_to_minutes(coalesce(c.availability_end,p.work_end)))
   OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings sp JOIN public.plan_zone_settings z ON z.plan_id=sp.plan_id AND z.zone_id=sp.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=task_row.space_id
    AND start_min>=greatest(public.hhmm_to_minutes(coalesce(sp.availability_start,p.work_start)),public.hhmm_to_minutes(coalesce(z.availability_start,p.work_start)))
    AND end_min<=least(public.hhmm_to_minutes(coalesce(sp.availability_end,p.work_end)),public.hhmm_to_minutes(coalesce(z.availability_end,p.work_end))))
   OR (p.meal_mode='global_hard_break' AND start_min<public.hhmm_to_minutes(p.meal_end) AND end_min>public.hhmm_to_minutes(p.meal_start))
  THEN RAISE EXCEPTION 'ANCHORED_CERTIFICATE_INVALID'; END IF;
  IF member=policy->'anchorTaskId' AND EXISTS(SELECT 1 FROM (
    SELECT a.plan_resource_item_id id FROM public.plan_space_resource_assignments a WHERE a.plan_id=p_plan AND a.space_id=task_row.space_id
    UNION SELECT a.plan_resource_item_id FROM public.plan_zone_resource_assignments a JOIN public.plan_space_settings sp ON sp.plan_id=a.plan_id AND sp.zone_id=a.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=task_row.space_id
   ) required WHERE NOT actual->'assignedResourceIds' @> jsonb_build_array(required.id))
   OR EXISTS(SELECT 1 FROM jsonb_each(coalesce(tpl.resource_requirements->'byItem','{}')) req WHERE req.value<>'1'::jsonb OR NOT EXISTS(SELECT 1 FROM public.plan_resource_items res WHERE res.plan_id=p_plan AND res.resource_item_id::text=req.key AND actual->'assignedResourceIds' @> jsonb_build_array(res.id)))
  THEN RAISE EXCEPTION 'ANCHORED_CERTIFICATE_INVALID'; END IF;
  FOR rid IN SELECT value FROM jsonb_array_elements(actual->'assignedResourceIds') LOOP
   SELECT * INTO resource FROM public.plan_resource_items WHERE plan_id=p_plan AND id=rid::text::integer;
   IF NOT FOUND OR NOT resource.is_available OR start_min<public.hhmm_to_minutes(coalesce(resource.availability_start,p.work_start)) OR end_min>public.hhmm_to_minutes(coalesce(resource.availability_end,p.work_end)) THEN RAISE EXCEPTION 'ANCHORED_CERTIFICATE_INVALID'; END IF;
  END LOOP;
  operation_start:=coalesce(operation_start,start_min);operation_end:=end_min;previous_end:=end_min;
  IF member=policy->'anchorTaskId' THEN anchor_start:=start_min;anchor_end:=end_min;anchor_space:=task_row.space_id;participant:=task_row.contestant_id; END IF;
 END LOOP;
 IF unit.availability_windows IS NOT NULL AND NOT (SELECT range_agg(int4range(public.hhmm_to_minutes(w->>'start'),public.hhmm_to_minutes(w->>'end'),'[)')) @> int4range(operation_start,operation_end,'[)') FROM jsonb_array_elements(unit.availability_windows) w) THEN RAISE EXCEPTION 'ANCHORED_UNIT_UNAVAILABLE'; END IF;
 -- Capacity of the nominal unit and its physical members cannot be duplicated.
 FOR other IN SELECT value FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE NOT public.anchored_member_ids(policy) @> jsonb_build_array(t->'taskId') AND t->>'startPlanned' IS NOT NULL LOOP
  SELECT * INTO STRICT task_row FROM public.daily_tasks WHERE id=(other->>'taskId')::integer AND plan_id=p_plan;
  SELECT * INTO STRICT tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=task_row.template_id;
  IF tpl.itinerant_team_requirement<>'none' THEN
   SELECT * INTO selected_unit FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND id=(other->>'itinerantTeamId')::bigint;
   IF NOT FOUND OR (tpl.itinerant_team_requirement='specific' AND selected_unit.source_team_id IS DISTINCT FROM tpl.itinerant_team_id)
    OR (tpl.itinerant_team_requirement='any' AND NOT tpl.allowed_itinerant_team_ids @> jsonb_build_array(selected_unit.source_team_id))
   THEN RAISE EXCEPTION 'ANCHORED_COMPETITOR_UNIT_INVALID'; END IF;
   SELECT jsonb_agg(value->'planResourceItemId') INTO selected_members FROM jsonb_array_elements(selected_unit.members);
   IF NOT coalesce(other->'assignedResourceIds','[]') @> selected_members THEN RAISE EXCEPTION 'ANCHORED_COMPETITOR_UNIT_INVALID'; END IF;
  END IF;
  IF public.hhmm_to_minutes(other->>'startPlanned')<operation_end AND public.hhmm_to_minutes(other->>'endPlanned')>operation_start AND (
   other->'itinerantTeamId'=policy->'itinerantUnitId' OR (tpl.itinerant_team_requirement='specific' AND tpl.itinerant_team_id=unit.source_team_id)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(members) member_resource(value) WHERE coalesce(other->'assignedResourceIds','[]') @> jsonb_build_array(member_resource.value))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(members) member_resource(value) JOIN public.plan_resource_items res ON res.plan_id=p_plan AND res.id=member_resource.value::text::integer WHERE tpl.resource_requirements#>ARRAY['byItem',res.resource_item_id::text]='1')
  ) THEN RAISE EXCEPTION 'ANCHORED_UNIT_CAPACITY_CONFLICT'; END IF;
  same_unit:=coalesce(other->'itinerantTeamId'=policy->'itinerantUnitId' OR (tpl.itinerant_team_requirement='specific' AND tpl.itinerant_team_id=unit.source_team_id),false);
  IF same_unit AND public.hhmm_to_minutes(other->>'startPlanned')<operation_end+coalesce(unit.transition_minutes,0)
   AND public.hhmm_to_minutes(other->>'endPlanned')+coalesce(unit.transition_minutes,0)>operation_start
  THEN RAISE EXCEPTION 'ANCHORED_UNIT_TRANSITION_CONFLICT'; END IF;
  IF task_row.contestant_id=participant AND public.hhmm_to_minutes(other->>'startPlanned')<operation_end AND public.hhmm_to_minutes(other->>'endPlanned')>operation_start
  THEN RAISE EXCEPTION 'ANCHORED_PARTICIPANT_CAPACITY_CONFLICT'; END IF;
  IF (other->>'spaceId')::integer=anchor_space AND public.hhmm_to_minutes(other->>'startPlanned')<anchor_end AND public.hhmm_to_minutes(other->>'endPlanned')>anchor_start
  THEN RAISE EXCEPTION 'ANCHORED_PHYSICAL_SPACE_CONFLICT'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_daily_anchored_snapshot(integer,jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_daily_anchored_snapshot(integer,jsonb,bigint) TO service_role;
CREATE FUNCTION public.guard_daily_anchored_stage() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype;
BEGIN
 IF TG_TABLE_NAME='planning_stage_validations' THEN
  SELECT * INTO s FROM public.assisted_planning_sessions WHERE id=NEW.session_id AND plan_id=NEW.plan_id;
  PERFORM public.assert_daily_anchored_snapshot(NEW.plan_id,s.draft_snapshot_json,NEW.config_revision_id);
 ELSIF NEW.ordinal>0 THEN PERFORM public.assert_daily_anchored_snapshot(NEW.plan_id,NEW.snapshot_json,NEW.config_revision_id); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anchored_validation BEFORE INSERT ON public.planning_stage_validations FOR EACH ROW EXECUTE FUNCTION public.guard_daily_anchored_stage();
CREATE TRIGGER anchored_stage BEFORE INSERT ON public.assisted_planning_stages FOR EACH ROW EXECUTE FUNCTION public.guard_daily_anchored_stage();
REVOKE ALL ON FUNCTION public.guard_daily_anchored_stage() FROM PUBLIC,anon,authenticated,service_role;

-- JSON references have FK-like lifetime. Manual task writes must not orphan a
-- declaration or reinterpret materialized unit members as newly authored resources.
CREATE FUNCTION public.guard_anchored_task_source() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.plans p,LATERAL jsonb_array_elements(coalesce(p.daily_anchored_accompaniments->'policies','[]')) policy
  WHERE p.id=OLD.plan_id AND public.anchored_member_ids(policy) @> jsonb_build_array(OLD.id)) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ANCHORED_MEMBER_REFERENCED'; END IF;
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.template_id IS DISTINCT FROM OLD.template_id
   OR NEW.contestant_id IS DISTINCT FROM OLD.contestant_id OR NEW.space_id IS DISTINCT FROM OLD.space_id
   OR NEW.zone_id IS DISTINCT FROM OLD.zone_id OR NEW.duration_override IS DISTINCT FROM OLD.duration_override
   OR (NEW.status='cancelled' AND NEW.status IS DISTINCT FROM OLD.status)
  THEN RAISE EXCEPTION 'ANCHORED_MEMBER_REQUIRES_VERSIONED_CHANGE'; END IF;
  IF (NEW.start_planned IS DISTINCT FROM OLD.start_planned OR NEW.end_planned IS DISTINCT FROM OLD.end_planned
   OR NEW.assigned_resource_ids IS DISTINCT FROM OLD.assigned_resource_ids)
   AND current_setting('optiplan.anchored_task_materialization',true) IS DISTINCT FROM txid_current()::text
  THEN RAISE EXCEPTION 'ANCHORED_MEMBER_REQUIRES_ASSISTED_MATERIALIZATION'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER anchored_task_source BEFORE UPDATE OR DELETE ON public.daily_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_anchored_task_source();
REVOKE ALL ON FUNCTION public.guard_anchored_task_source() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.guard_anchored_coach_source() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.vocal_coach_plan_resource_item_id IS DISTINCT FROM OLD.vocal_coach_plan_resource_item_id AND EXISTS(
  SELECT 1 FROM public.plans p,LATERAL jsonb_array_elements(coalesce(p.daily_anchored_accompaniments->'policies','[]')) policy
  JOIN public.daily_tasks d ON d.id=(policy->>'anchorTaskId')::integer AND d.contestant_id=OLD.id WHERE p.id=OLD.plan_id)
 THEN RAISE EXCEPTION 'ANCHORED_MEMBER_REQUIRES_VERSIONED_CHANGE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anchored_coach_source BEFORE UPDATE ON public.contestants FOR EACH ROW EXECUTE FUNCTION public.guard_anchored_coach_source();
REVOKE ALL ON FUNCTION public.guard_anchored_coach_source() FROM PUBLIC,anon,authenticated,service_role;

-- Keep the existing acceptance/restore implementations, permissions and execution
-- checks. Only their already validated task-write loops receive the materializer marker.
DO $migration$
DECLARE definition text; prefix text; suffix text;
BEGIN
 definition:=pg_get_functiondef('public.assisted_accept_stage(integer,uuid,text,bigint,text)'::regprocedure);
 prefix:=' FOR task_item IN SELECT value FROM jsonb_array_elements(s.draft_snapshot_json->''tasks'') LOOP';
 suffix:=' END LOOP;'||chr(10)||' WITH RECURSIVE obsolete';
 IF strpos(definition,prefix)=0 OR strpos(definition,suffix)=0 THEN RAISE EXCEPTION 'ANCHORED_UNEXPECTED_ACCEPT_WRITER'; END IF;
 definition:=replace(definition,prefix,' PERFORM set_config(''optiplan.anchored_task_materialization'',txid_current()::text,true);'||chr(10)||prefix);
 definition:=replace(definition,suffix,' END LOOP;'||chr(10)||' PERFORM set_config(''optiplan.anchored_task_materialization'','''',true);'||chr(10)||' WITH RECURSIVE obsolete');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.assisted_apply_snapshot(integer,jsonb)'::regprocedure);
 prefix:='  FOR item IN SELECT value FROM jsonb_array_elements(p_snapshot->''tasks'') LOOP';
 suffix:='  END LOOP;'||chr(10)||'END';
 IF strpos(definition,prefix)=0 OR strpos(definition,suffix)=0 THEN RAISE EXCEPTION 'ANCHORED_UNEXPECTED_RESTORE_WRITER'; END IF;
 definition:=replace(definition,prefix,
  '  IF EXISTS(SELECT 1 FROM public.plans p WHERE p.id=p_plan_id AND coalesce(p.daily_anchored_accompaniments->''policies'',''[]'')<>''[]'') AND NOT EXISTS('||
  'SELECT 1 FROM public.assisted_planning_sessions session JOIN public.assisted_planning_stages stage ON stage.session_id=session.id AND stage.plan_id=p_plan_id '||
  'LEFT JOIN public.assisted_obligation_transitions transition ON transition.id=session.obligation_transition_id AND transition.session_id=session.id '||
  'WHERE session.plan_id=p_plan_id AND session.status=''ACTIVE'' AND p_snapshot=coalesce(transition.projections_json->stage.id::text->''snapshot'',stage.snapshot_json)) '||
  'THEN RAISE EXCEPTION ''ANCHORED_RESTORE_REQUIRES_CHECKPOINT''; END IF;'||chr(10)||
  '  PERFORM set_config(''optiplan.anchored_task_materialization'',txid_current()::text,true);'||chr(10)||prefix);
 definition:=replace(definition,suffix,'  END LOOP;'||chr(10)||'  PERFORM set_config(''optiplan.anchored_task_materialization'','''',true);'||chr(10)||'END');
 EXECUTE definition;
END $migration$;
