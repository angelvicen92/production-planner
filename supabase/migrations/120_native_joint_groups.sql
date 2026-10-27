-- P0-U00y: explicit native joint groups. Historical 001–119 and 088 are unchanged.
ALTER TABLE public.plans ADD COLUMN daily_joint_groups jsonb;
ALTER TABLE public.plans ADD CONSTRAINT daily_joint_single_authority CHECK (
 daily_joint_groups IS NULL OR (planner_next_profile IS NOT NULL AND planner_next_configuration IS NULL));
CREATE FUNCTION public.guard_daily_joint_groups() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.daily_joint_groups IS NOT NULL) OR
 (TG_OP='UPDATE' AND NEW.daily_joint_groups IS DISTINCT FROM OLD.daily_joint_groups) THEN
  IF current_user<>'service_role' OR current_setting('optiplan.daily_joint_group_operation',true) IS DISTINCT FROM 'versioned'
  THEN RAISE EXCEPTION 'JOINT_REQUIRES_VERSIONED_OPERATION'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_daily_joint_groups BEFORE INSERT OR UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.guard_daily_joint_groups();
REVOKE ALL ON FUNCTION public.guard_daily_joint_groups() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.joint_member_ids(policy jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ SELECT policy->'taskIds' $$;
CREATE FUNCTION public.joint_contracts(policies jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ SELECT nullif(policies,'[]') $$;
CREATE FUNCTION public.joint_task_resources(p_plan integer,p_task bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM (
  SELECT value::text::integer id FROM public.daily_tasks t,LATERAL jsonb_array_elements(coalesce(t.assigned_resource_ids,'[]')) WHERE t.plan_id=p_plan AND t.id=p_task
  UNION SELECT r.id FROM public.daily_tasks t JOIN public.plan_task_template_snapshots tpl ON tpl.plan_id=t.plan_id AND tpl.source_template_id=t.template_id JOIN public.plan_resource_items r ON r.plan_id=t.plan_id WHERE t.plan_id=p_plan AND t.id=p_task AND tpl.resource_requirements#>ARRAY['byItem',r.resource_item_id::text]='1'
  UNION SELECT a.plan_resource_item_id FROM public.daily_tasks t JOIN public.plan_space_resource_assignments a ON a.plan_id=t.plan_id AND a.space_id=t.space_id WHERE t.plan_id=p_plan AND t.id=p_task
  UNION SELECT a.plan_resource_item_id FROM public.daily_tasks t JOIN public.plan_space_settings s ON s.plan_id=t.plan_id AND s.space_id=t.space_id JOIN public.plan_zone_resource_assignments a ON a.plan_id=s.plan_id AND a.zone_id=s.zone_id WHERE t.plan_id=p_plan AND t.id=p_task
  UNION SELECT c.vocal_coach_plan_resource_item_id FROM public.daily_tasks t JOIN public.plan_task_template_snapshots tpl ON tpl.plan_id=t.plan_id AND tpl.source_template_id=t.template_id JOIN public.contestants c ON c.plan_id=t.plan_id AND c.id=t.contestant_id WHERE t.plan_id=p_plan AND t.id=p_task AND tpl.requires_coach AND c.vocal_coach_plan_resource_item_id IS NOT NULL
  UNION SELECT l.locked_resource_id FROM public.locks l WHERE l.plan_id=p_plan AND l.task_id=p_task AND l.lock_type IN ('resource','full') AND l.locked_resource_id IS NOT NULL
 ) physical
$$;
REVOKE ALL ON FUNCTION public.joint_member_ids(jsonb),public.joint_contracts(jsonb),public.joint_task_resources(integer,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.joint_member_ids(jsonb),public.joint_contracts(jsonb),public.joint_task_resources(integer,bigint) TO service_role;

CREATE FUNCTION public.assert_daily_joint_groups(p_plan integer,p_structure jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; g jsonb; mid jsonb; t public.daily_tasks%rowtype; tpl public.plan_task_template_snapshots%rowtype;
 seen integer[]:='{}'; participants integer[]; names text[]:='{}'; common_space integer; duration integer; physical jsonb; earliest integer; latest integer; c public.contestants%rowtype;
BEGIN
 SELECT * INTO STRICT p FROM public.plans WHERE id=p_plan;
 IF jsonb_typeof(p_structure) IS DISTINCT FROM 'object' OR p_structure->'contractVersion' IS DISTINCT FROM '1'::jsonb
  OR p_structure-ARRAY['contractVersion','groups']<>'{}' OR jsonb_typeof(p_structure->'groups') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'JOINT_INVALID_STRUCTURE'; END IF;
 IF p.planner_next_profile IS NULL OR nullif(p.planner_next_profile->'configuration','null') IS NULL OR p.planner_next_configuration IS NOT NULL THEN RAISE EXCEPTION 'JOINT_AUTHORITY_CONFLICT'; END IF;
 IF p_structure->'groups'='[]' THEN RETURN; END IF;
 IF p.planner_next_profile#>>'{configuration,setup}'<>'NONE' OR p.planner_next_profile#>>'{configuration,transport}'<>'NONE'
  OR p.meal_mode<>'global_hard_break' OR coalesce(p.daily_round_synchronization->'policies','[]')<>'[]'
  OR coalesce(p.daily_technical_chains->'policies','[]')<>'[]' OR coalesce(p.daily_anchored_accompaniments->'policies','[]')<>'[]'
  OR coalesce(p.daily_task_operation_scopes->'policies','[]')<>'[]' OR public.effective_operation_continuity(p_plan,'[]')<>'[]'
  OR EXISTS(SELECT 1 FROM public.daily_tasks d JOIN public.plan_task_template_snapshots s ON s.plan_id=d.plan_id AND s.source_template_id=d.template_id
   WHERE d.plan_id=p_plan AND d.status<>'cancelled' AND (s.setup_id IS NOT NULL OR s.itinerant_team_requirement<>'none' OR coalesce(s.resource_requirements->'byType','{}')<>'{}' OR coalesce(s.resource_requirements->'anyOf','[]')<>'[]'))
 THEN RAISE EXCEPTION 'UNSUPPORTED_JOINT_COMBINATION'; END IF;
 IF p_structure->'groups' IS DISTINCT FROM (SELECT jsonb_agg(element.value ORDER BY (element.value->>'id') COLLATE "C") FROM jsonb_array_elements(p_structure->'groups') element) THEN RAISE EXCEPTION 'JOINT_NONCANONICAL_STRUCTURE'; END IF;
 FOR g IN SELECT value FROM jsonb_array_elements(p_structure->'groups') LOOP
  IF g-ARRAY['id','taskIds']<>'{}' OR jsonb_typeof(g->'id') IS DISTINCT FROM 'string' OR length(g->>'id') NOT BETWEEN 1 AND 120
   OR btrim(g->>'id')<>g->>'id' OR g->>'id'!~'^[A-Za-z0-9_.:-]+$' OR g->>'id'=ANY(names) OR jsonb_typeof(g->'taskIds') IS DISTINCT FROM 'array' OR jsonb_array_length(g->'taskIds')<2
  THEN RAISE EXCEPTION 'JOINT_INVALID_STRUCTURE'; END IF;
  IF g->'taskIds' IS DISTINCT FROM (SELECT jsonb_agg(value ORDER BY value::text::integer) FROM jsonb_array_elements(g->'taskIds')) THEN RAISE EXCEPTION 'JOINT_NONCANONICAL_MEMBERS'; END IF;
  names:=array_append(names,g->>'id');participants:='{}';common_space:=NULL;duration:=NULL;physical:=NULL;earliest:=NULL;latest:=NULL;
  FOR mid IN SELECT value FROM jsonb_array_elements(g->'taskIds') LOOP
   IF jsonb_typeof(mid) IS DISTINCT FROM 'number' OR mid::text!~'^[1-9][0-9]*$' OR mid::text::integer=ANY(seen) THEN RAISE EXCEPTION 'JOINT_DUPLICATE_OR_INVALID_MEMBER'; END IF;
   seen:=array_append(seen,mid::text::integer);
   SELECT * INTO t FROM public.daily_tasks WHERE plan_id=p_plan AND id=mid::text::integer;
   IF NOT FOUND OR t.status='cancelled' OR t.contestant_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings WHERE plan_id=p_plan AND space_id=t.space_id) THEN RAISE EXCEPTION 'JOINT_INVALID_MEMBER'; END IF;
   SELECT * INTO STRICT tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=t.template_id;
   IF tpl.planner_next_operation->>'kind' IS DISTINCT FROM 'auxiliary' OR tpl.setup_id IS NOT NULL THEN RAISE EXCEPTION 'JOINT_INVALID_MEMBER'; END IF;
   IF t.contestant_id=ANY(participants) THEN RAISE EXCEPTION 'JOINT_DUPLICATE_PARTICIPANT'; END IF;
   participants:=array_append(participants,t.contestant_id::integer);
   IF duration IS NULL THEN duration:=coalesce(t.duration_override,tpl.default_duration); END IF;
   IF coalesce(t.duration_override,tpl.default_duration)<>duration OR duration<=0 OR duration%5<>0 THEN RAISE EXCEPTION 'JOINT_DURATION_MISMATCH'; END IF;
   IF common_space IS NULL THEN common_space:=t.space_id; END IF;
   IF common_space<>t.space_id THEN RAISE EXCEPTION 'JOINT_SPACE_MISMATCH'; END IF;
   IF physical IS NULL THEN physical:=public.joint_task_resources(p_plan,t.id); END IF;
   IF physical IS DISTINCT FROM public.joint_task_resources(p_plan,t.id) OR EXISTS(SELECT 1 FROM jsonb_each(coalesce(tpl.resource_requirements->'byItem','{}')) q WHERE q.value<>'1'::jsonb OR (SELECT count(*) FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND r.resource_item_id::text=q.key)<>1)
   THEN RAISE EXCEPTION 'JOINT_RESOURCE_MISMATCH'; END IF;
   IF EXISTS(SELECT 1 FROM public.daily_tasks sibling WHERE sibling.plan_id=p_plan AND sibling.contestant_id=t.contestant_id AND g->'taskIds' @> jsonb_build_array(sibling.id)
    AND tpl.dependency_template_ids @> jsonb_build_array(sibling.template_id)) THEN RAISE EXCEPTION 'JOINT_INTERNAL_DEPENDENCY'; END IF;
   SELECT * INTO STRICT c FROM public.contestants WHERE id=t.contestant_id AND plan_id=p_plan;
   earliest:=greatest(earliest,public.hhmm_to_minutes(coalesce(c.availability_start,p.work_start)));latest:=least(latest,public.hhmm_to_minutes(coalesce(c.availability_end,p.work_end)));
  END LOOP;
  IF earliest+duration>latest THEN RAISE EXCEPTION 'JOINT_NO_COMMON_AVAILABILITY'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_daily_joint_groups(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_daily_joint_groups(integer,jsonb) TO service_role;

CREATE FUNCTION public.joint_task_operations(p_plan integer,operations jsonb,old_policies jsonb,new_policies jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg((op-'jointGroupId')||CASE WHEN g IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('jointGroupId',g->'id') END ORDER BY ord),'[]')
 FROM jsonb_array_elements(operations) WITH ORDINALITY a(op,ord)
 LEFT JOIN LATERAL (SELECT value g FROM jsonb_array_elements(coalesce(new_policies,'[]')) WHERE value->'taskIds' @> jsonb_build_array(op->'taskId')) groups ON true
$$;
REVOKE ALL ON FUNCTION public.joint_task_operations(integer,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.joint_task_operations(integer,jsonb,jsonb,jsonb) TO service_role;
CREATE FUNCTION public.assert_joint_revision(p_plan integer,replay jsonb) RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; authority jsonb; groups jsonb;
BEGIN
 SELECT * INTO STRICT p FROM public.plans WHERE id=p_plan;
 IF p.planner_next_profile IS NULL THEN RETURN; END IF;
 -- A snapshot envelope with configuration:null is an unconfigured day, not a
 -- native joint authority. Preserve its literal absence, including empty days.
 IF nullif(p.planner_next_profile->'configuration','null') IS NULL THEN
  IF p.daily_joint_groups IS NOT NULL THEN RAISE EXCEPTION 'JOINT_UNCONFIGURED_AUTHORITY'; END IF;
  RETURN;
 END IF;
 authority:=replay#>'{authorities,plan_workday,0,plannerNextAuthorities}';groups:=nullif(p.daily_joint_groups->'groups','[]');
 IF authority->'dailyJointGroups' IS DISTINCT FROM groups OR authority->'dailyJointGroupsVersion' IS DISTINCT FROM (CASE WHEN groups IS NULL THEN NULL ELSE '1'::jsonb END)
  OR authority->'taskOperations' IS DISTINCT FROM public.joint_task_operations(p_plan,authority->'taskOperations',groups,groups)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(groups,'[]')) g,LATERAL jsonb_array_elements(g->'taskIds') mid WHERE (SELECT count(*) FROM jsonb_array_elements(authority->'taskOperations') op WHERE op->'taskId'=mid)<>1)
 THEN RAISE EXCEPTION 'JOINT_AUTHORITY_NOT_MATERIALIZED'; END IF;
 IF groups IS NOT NULL THEN
  PERFORM public.assert_daily_joint_groups(p_plan,p.daily_joint_groups-ARRAY['by','at']);
  IF jsonb_array_length(authority->'taskOperations')<>(SELECT count(*) FROM public.daily_tasks WHERE plan_id=p_plan)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(authority->'taskOperations') op LEFT JOIN public.daily_tasks t ON t.plan_id=p_plan AND t.id=(op->>'taskId')::integer LEFT JOIN public.plan_task_template_snapshots tpl ON tpl.plan_id=t.plan_id AND tpl.source_template_id=t.template_id
    WHERE t.id IS NULL OR op->>'plannerNextKind' IS DISTINCT FROM tpl.planner_next_operation->>'kind'
    OR op->'dependsOnTaskIds' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(d.id ORDER BY dep.ordinality),'[]') FROM jsonb_array_elements(tpl.dependency_template_ids) WITH ORDINALITY dep(value,ordinality) JOIN public.daily_tasks d ON d.plan_id=t.plan_id AND d.contestant_id IS NOT DISTINCT FROM t.contestant_id AND d.template_id=dep.value::text::integer))
  THEN RAISE EXCEPTION 'JOINT_SOURCE_OPERATIONS_NOT_MATERIALIZED'; END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_joint_revision(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_joint_revision(integer,jsonb) TO service_role;
CREATE FUNCTION public.guard_joint_revision() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN PERFORM public.assert_joint_revision(NEW.plan_id,NEW.replay_snapshot_json);RETURN NEW;END $$;
CREATE TRIGGER joint_revision BEFORE INSERT ON public.plan_config_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_joint_revision();
REVOKE ALL ON FUNCTION public.guard_joint_revision() FROM PUBLIC,anon,authenticated,service_role;

-- Reuse the authenticated v5 operation, CAS, source locks and atomic session transition.
ALTER FUNCTION public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) RENAME TO apply_day_config_operation_before_joint_groups;
CREATE OR REPLACE FUNCTION public.apply_day_config_operation_v5(
 p_plan_id integer,p_actor uuid,p_operation text,p_payload jsonb,p_expected_revision bigint,
 p_expected_identity jsonb,p_expected_replay jsonb,p_candidate_identity jsonb,p_candidate_replay jsonb,p_diff jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; guard text; result bigint;
 structure_selected boolean; old_chains jsonb; new_chains jsonb; path text[]:=ARRAY['authorities','plan_workday','0','plannerNextAuthorities','dailyJointGroups'];
 s public.assisted_planning_sessions%rowtype; before_sources jsonb; changed jsonb; expected_candidate jsonb; component jsonb; work_fp text; all_fp text;
BEGIN
 PERFORM 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
 WHERE u.user_id=p_actor AND r.key IN ('admin','production') FOR SHARE OF u;
 IF NOT FOUND THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;

 structure_selected:=p_operation='EDIT' AND p_payload ? 'jointGroups';
 IF p_diff ? 'jointGroupTransition' THEN RAISE EXCEPTION 'INVALID_JOINT_GROUP_DIFF'; END IF;
 IF structure_selected THEN
  IF p_payload-ARRAY['jointGroups','expectedRevisionId']<>'{}' OR p_payload->'expectedRevisionId' IS DISTINCT FROM coalesce(to_jsonb(p_expected_revision),'null')
  THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
  SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR NO KEY UPDATE NOWAIT;
  IF FOUND THEN
   IF s.draft_snapshot_json IS DISTINCT FROM s.working_snapshot_json OR s.draft_fingerprint IS DISTINCT FROM s.working_fingerprint
    OR s.draft_scope_json<>'{}' THEN RAISE EXCEPTION 'JOINT_GROUP_DIRTY_DRAFT'; END IF;
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
  THEN RAISE EXCEPTION 'JOINT_GROUP_PENDING_PROPOSAL'; END IF;
  PERFORM public.assert_daily_joint_groups(p_plan_id,p_payload->'jointGroups');
  old_chains:=nullif(p.daily_joint_groups->'groups','[]');
  new_chains:=nullif(p_payload#>'{jointGroups,groups}','[]');
  IF old_chains IS NOT DISTINCT FROM new_chains THEN RAISE EXCEPTION 'JOINT_GROUP_NO_CHANGES'; END IF;
  IF p_expected_replay#>path IS DISTINCT FROM public.joint_contracts(old_chains) THEN RAISE EXCEPTION 'STALE_JOINT_GROUP'; END IF;
  -- A policy touching protected decisions can only remain literally identical.
  FOR changed IN SELECT value FROM jsonb_array_elements(coalesce(old_chains,'[]')) old_policy WHERE NOT coalesce(new_chains,'[]') @> jsonb_build_array(old_policy.value) UNION SELECT value FROM jsonb_array_elements(coalesce(new_chains,'[]')) new_policy WHERE NOT coalesce(old_chains,'[]') @> jsonb_build_array(new_policy.value) LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.joint_member_ids(changed)) m JOIN public.daily_tasks t ON t.id=m::text::integer AND t.plan_id=p_plan_id
    WHERE t.start_planned IS NOT NULL OR t.status IN ('done','in_progress') OR EXISTS(SELECT 1 FROM public.locks WHERE plan_id=p_plan_id AND task_id=t.id))
    OR EXISTS(SELECT 1 FROM public.assisted_planning_stages st,LATERAL jsonb_array_elements(st.snapshot_json->'tasks') t
     WHERE st.plan_id=p_plan_id AND t->>'startPlanned' IS NOT NULL AND public.joint_member_ids(changed) @> jsonb_build_array(t->'taskId'))
   THEN RAISE EXCEPTION 'JOINT_GROUP_PROTECTED_DECISIONS'; END IF;
  END LOOP;
  expected_candidate:=CASE WHEN new_chains IS NULL THEN p_expected_replay #- path ELSE jsonb_set(p_expected_replay,path,public.joint_contracts(new_chains),true) END;
  expected_candidate:=jsonb_set(expected_candidate,'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}',public.joint_task_operations(p_plan_id,p_expected_replay#>'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}',old_chains,new_chains));
  expected_candidate:=CASE WHEN new_chains IS NULL THEN expected_candidate #- ARRAY['authorities','plan_workday','0','plannerNextAuthorities','dailyJointGroupsVersion'] ELSE jsonb_set(expected_candidate,ARRAY['authorities','plan_workday','0','plannerNextAuthorities','dailyJointGroupsVersion'],'1'::jsonb,true) END;
  IF expected_candidate IS DISTINCT FROM p_candidate_replay THEN RAISE EXCEPTION 'STALE_JOINT_GROUP_REPLAY'; END IF;
  work_fp:=encode(sha256(convert_to('{"contractVersion":1,"authority":"plan_workday","availability":"AVAILABLE","semanticValue":'||public.round_structure_canonical_json(p_candidate_replay#>'{authorities,plan_workday}')||'}','UTF8')),'hex');
  SELECT value INTO component FROM jsonb_array_elements(p_candidate_identity->'components') WHERE value->>'authority'='plan_workday';
  IF component->>'fingerprint' IS DISTINCT FROM work_fp
   OR jsonb_set(p_expected_identity,'{components}',(SELECT jsonb_agg(CASE WHEN value->>'authority'='plan_workday' THEN jsonb_set(value,'{fingerprint}',to_jsonb(work_fp)) ELSE value END ORDER BY ordinality) FROM jsonb_array_elements(p_expected_identity->'components') WITH ORDINALITY)) - 'configurationFingerprint'
    IS DISTINCT FROM p_candidate_identity-'configurationFingerprint'
  THEN RAISE EXCEPTION 'STALE_JOINT_GROUP_IDENTITY'; END IF;
  SELECT encode(sha256(convert_to('{"contractVersion":1,"components":'||public.round_structure_canonical_json(jsonb_agg(jsonb_build_object('authority',value->'authority','availability',value->'availability','fingerprint',value->'fingerprint') ORDER BY ordinality))||'}','UTF8')),'hex') INTO all_fp
   FROM jsonb_array_elements(p_candidate_identity->'components') WITH ORDINALITY;
  IF p_candidate_identity->>'configurationFingerprint' IS DISTINCT FROM all_fp THEN RAISE EXCEPTION 'STALE_JOINT_GROUP_IDENTITY'; END IF;
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
  guard:=current_setting('optiplan.daily_joint_group_operation',true);
  PERFORM set_config('optiplan.daily_joint_group_operation','versioned',true);
  UPDATE public.plans SET daily_joint_groups=p_payload->'jointGroups'||jsonb_build_object('by',p_actor,'at',now()) WHERE id=p_plan_id;
  PERFORM set_config('optiplan.daily_joint_group_operation',coalesce(guard,''),true);
  -- Reuse the immutable revision diff for the explicit configuration transition.
  -- No admission row, replacement session, mutable bootstrap capture or new table.
  p_diff:=p_diff||jsonb_build_object('jointGroupTransition',jsonb_build_object('contractVersion',1,
   'sessionId',s.id,'baseStageId',s.active_stage_id,'previousSessionRevisionId',s.current_config_revision_id,
   'previousPlanRevisionId',p.current_config_revision_id,'before',p.daily_joint_groups,
   'after',(SELECT daily_joint_groups FROM public.plans WHERE id=p_plan_id),
   'sources',public.assisted_read_bootstrap_sources(p_plan_id)));
 END IF;
 result:=public.apply_day_config_operation_before_joint_groups(p_plan_id,p_actor,p_operation,p_payload-'jointGroups'-CASE WHEN structure_selected THEN 'expectedRevisionId' ELSE '__unused' END,p_expected_revision,
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
  old_text:='coalesce(r.diff_json#>>''{taskOperationScopeTransition,sessionId}'',r.diff_json#>>''{anchoredAccompanimentTransition,sessionId}'',r.diff_json#>>''{technicalChainTransition,sessionId}'',r.diff_json#>>''{roundSynchronizationTransition,sessionId}'')';
  new_text:='coalesce(r.diff_json#>>''{jointGroupTransition,sessionId}'',r.diff_json#>>''{taskOperationScopeTransition,sessionId}'',r.diff_json#>>''{anchoredAccompanimentTransition,sessionId}'',r.diff_json#>>''{technicalChainTransition,sessionId}'',r.diff_json#>>''{roundSynchronizationTransition,sessionId}'')';
  IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'JOINT_GROUP_UNEXPECTED_TRANSITION_READER'; END IF;
  definition:=replace(definition,old_text,new_text);
  old_text:='coalesce(transition_record.diff_json#>''{taskOperationScopeTransition,sources}'',transition_record.diff_json#>''{anchoredAccompanimentTransition,sources}'',transition_record.diff_json#>''{technicalChainTransition,sources}'',transition_record.diff_json#>''{roundSynchronizationTransition,sources}'')';
  new_text:='coalesce(transition_record.diff_json#>''{jointGroupTransition,sources}'',transition_record.diff_json#>''{taskOperationScopeTransition,sources}'',transition_record.diff_json#>''{anchoredAccompanimentTransition,sources}'',transition_record.diff_json#>''{technicalChainTransition,sources}'',transition_record.diff_json#>''{roundSynchronizationTransition,sources}'')';
  IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'JOINT_GROUP_UNEXPECTED_TRANSITION_READER'; END IF;
  EXECUTE replace(definition,old_text,new_text);
 END LOOP;
 definition:=pg_get_functiondef('public.assisted_read_bootstrap_sources(integer,boolean)'::regprocedure);
 old_text:='- CASE WHEN t.daily_task_operation_scopes IS NULL THEN ''''daily_task_operation_scopes'''' ELSE ''''__absent'''' END';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'JOINT_GROUP_UNEXPECTED_SOURCE_READER'; END IF;
 EXECUTE replace(definition,old_text,old_text||' - CASE WHEN t.daily_joint_groups IS NULL THEN ''''daily_joint_groups'''' ELSE ''''__absent'''' END');
END $migration$;

CREATE OR REPLACE FUNCTION public.assert_anchored_choice_witness(p_plan integer,p_snapshot jsonb,p_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; r public.planning_runs%rowtype; replay jsonb; operations jsonb; proof jsonb;
 task public.daily_tasks%rowtype; tpl public.plan_task_template_snapshots%rowtype; person public.contestants%rowtype;
 item jsonb; other jsonb; op jsonb; policy jsonb; actual jsonb; certified jsonb; dep jsonb; full_snapshot jsonb;
 unit public.plan_itinerant_unit_snapshots%rowtype; required jsonb; resource_ids jsonb; effective_ids jsonb; persisted_required jsonb;
 start_min integer; end_min integer; coach integer; selected integer; rid jsonb; resource public.plan_resource_items%rowtype;
 margin integer; participant_margin integer; gap integer; same_operation boolean; main_flow jsonb;
BEGIN
 SELECT * INTO STRICT p FROM public.plans WHERE id=p_plan;
 IF p.current_config_revision_id IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'STALE_ANCHORED_REPLAY'; END IF;
 IF coalesce(p.daily_joint_groups->'groups','[]')<>'[]' THEN
  PERFORM public.assert_daily_joint_groups(p_plan,p.daily_joint_groups-ARRAY['by','at']);
 ELSE
  PERFORM public.assert_daily_anchored_accompaniments(p_plan,p.daily_anchored_accompaniments-ARRAY['by','at']);
 END IF;
 SELECT replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities}' INTO replay FROM public.plan_config_revisions WHERE id=p_revision AND plan_id=p_plan;
 IF replay->'anchoredAccompaniments' IS DISTINCT FROM public.anchored_contracts(p.daily_anchored_accompaniments->'policies') THEN RAISE EXCEPTION 'STALE_ANCHORED_REPLAY'; END IF;
 IF coalesce(p.daily_joint_groups->'groups','[]')<>'[]' AND (replay->'dailyJointGroups' IS DISTINCT FROM p.daily_joint_groups->'groups' OR replay->'dailyJointGroupsVersion' IS DISTINCT FROM '1'::jsonb) THEN RAISE EXCEPTION 'STALE_JOINT_REPLAY'; END IF;
 operations:=replay->'taskOperations';main_flow:=replay#>'{plannerNext,mainFlow}';margin:=coalesce((replay#>>'{plannerNext,resourceTransitionMinutes}')::integer,0);
 SELECT * INTO r FROM public.planning_runs WHERE plan_id=p_plan AND config_revision_id=p_revision AND status='success'
  AND execution_kind='ASSISTED_SCOPE' AND assisted_result_json->>'outcome'='PROPOSAL'
  AND assisted_result_json->'proposedDraftSnapshot'=p_snapshot ORDER BY id DESC LIMIT 1;
 IF NOT FOUND OR r.result_fingerprint IS DISTINCT FROM encode(extensions.digest(convert_to(r.assisted_result_json::text,'UTF8'),'sha256'),'hex')
 THEN RAISE EXCEPTION 'ANCHORED_AUTHENTIC_PROPOSAL_REQUIRED'; END IF;
 proof:=r.assisted_result_json#>'{evidence,nominalPhysicalFutureWitness,tasks}';
 IF jsonb_typeof(proof) IS DISTINCT FROM 'array' OR jsonb_array_length(proof)<>(SELECT count(*) FROM public.daily_tasks WHERE plan_id=p_plan AND status<>'cancelled')
  OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(proof))<>jsonb_array_length(proof)
 THEN RAISE EXCEPTION 'ANCHORED_FUTURE_STRUCTURAL_WITNESS_REQUIRED'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(proof) LOOP
  SELECT * INTO task FROM public.daily_tasks WHERE plan_id=p_plan AND 'task:'||id=item->>'id' AND status<>'cancelled';
  IF NOT FOUND THEN RAISE EXCEPTION 'ANCHORED_WITNESS_IDENTITY'; END IF;
  SELECT * INTO STRICT tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=task.template_id;
  SELECT value INTO op FROM jsonb_array_elements(operations) WHERE value->>'taskId'=task.id::text;
  start_min:=(item->>'start')::integer;end_min:=(item->>'end')::integer;coach:=NULL;selected:=NULL;unit:=NULL;
  IF op IS NULL OR item->>'kind' IS DISTINCT FROM op->>'plannerNextKind'
   OR coalesce(p.daily_joint_groups->'groups','[]')<>'[]' AND item->>'jointGroupId' IS DISTINCT FROM (CASE WHEN op->>'jointGroupId' IS NULL THEN NULL ELSE 'joint-group:'||(op->>'jointGroupId') END)
   OR item->>'spaceId' IS DISTINCT FROM 'space:'||task.space_id OR item->>'participantId' IS DISTINCT FROM (CASE WHEN task.contestant_id IS NULL THEN NULL ELSE 'participant:'||task.contestant_id END)
   OR (item->>'duration')::integer IS DISTINCT FROM coalesce(task.duration_override,tpl.default_duration)
   OR end_min-start_min IS DISTINCT FROM coalesce(task.duration_override,tpl.default_duration) OR start_min%5<>0 OR end_min%5<>0
   OR coalesce(item->>'blocksSpace','true') IS DISTINCT FROM coalesce(op->>'blocksSpace','true')
   OR (SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM jsonb_array_elements_text(coalesce(item->'dependencies','[]')))
    IS DISTINCT FROM (SELECT coalesce(jsonb_agg('task:'||value ORDER BY 'task:'||value),'[]') FROM jsonb_array_elements_text(op->'dependsOnTaskIds'))
  THEN RAISE EXCEPTION 'ANCHORED_WITNESS_IDENTITY'; END IF;
  IF start_min<public.hhmm_to_minutes(p.work_start) OR end_min>public.hhmm_to_minutes(p.work_end)
   OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings sp JOIN public.plan_zone_settings z ON z.plan_id=sp.plan_id AND z.zone_id=sp.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=task.space_id
    AND start_min>=greatest(public.hhmm_to_minutes(coalesce(sp.availability_start,p.work_start)),public.hhmm_to_minutes(coalesce(z.availability_start,p.work_start)))
    AND end_min<=least(public.hhmm_to_minutes(coalesce(sp.availability_end,p.work_end)),public.hhmm_to_minutes(coalesce(z.availability_end,p.work_end))))
   OR (p.meal_mode='global_hard_break' AND start_min<public.hhmm_to_minutes(p.meal_end) AND end_min>public.hhmm_to_minutes(p.meal_start))
   OR EXISTS(SELECT 1 FROM public.locks l WHERE l.plan_id=p_plan AND l.task_id=task.id AND l.lock_type IN ('time','full')
    AND (l.locked_start IS NOT NULL AND start_min<>public.hhmm_to_minutes(l.locked_start) OR l.locked_end IS NOT NULL AND end_min<>public.hhmm_to_minutes(l.locked_end)))
  THEN RAISE EXCEPTION 'ANCHORED_WITNESS_AVAILABILITY_OR_LOCK'; END IF;
  IF task.contestant_id IS NOT NULL THEN
   SELECT * INTO STRICT person FROM public.contestants WHERE id=task.contestant_id AND plan_id=p_plan;
   IF start_min<public.hhmm_to_minutes(coalesce(person.availability_start,p.work_start)) OR end_min>public.hhmm_to_minutes(coalesce(person.availability_end,p.work_end)) THEN RAISE EXCEPTION 'ANCHORED_WITNESS_PARTICIPANT_AVAILABILITY'; END IF;
  END IF;
  IF item->>'kind' IN ('main','vocal') THEN
   coach:=person.vocal_coach_plan_resource_item_id;
   IF coach IS NULL OR item->>'coachId' IS DISTINCT FROM 'plan-resource:'||coach OR item->>'kind'='main' AND item->>'blockKey' IS DISTINCT FROM 'plan-resource:'||coach
   THEN RAISE EXCEPTION 'ANCHORED_WITNESS_COACH'; END IF;
  ELSIF item->>'coachId' IS NOT NULL THEN RAISE EXCEPTION 'ANCHORED_WITNESS_COACH'; END IF;
  IF op->>'itinerantTeamRequirement' IN ('specific','any') THEN
   IF (SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM jsonb_array_elements_text(coalesce(item->'allowedItinerantUnitIds','[]')))
    IS DISTINCT FROM (SELECT coalesce(jsonb_agg('itinerant-team:'||value ORDER BY 'itinerant-team:'||value),'[]') FROM jsonb_array_elements_text(coalesce(op->'allowedItinerantTeamIds','[]')))
   THEN RAISE EXCEPTION 'ANCHORED_WITNESS_DOMAIN'; END IF;
   SELECT * INTO unit FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND 'itinerant-team:'||id=item->>'itinerantUnitId';
   IF NOT FOUND OR jsonb_array_length(unit.members)=0
    OR op->>'itinerantTeamRequirement'='specific' AND op->'itinerantTeamId' IS DISTINCT FROM to_jsonb(unit.id)
    OR op->>'itinerantTeamRequirement'='any' AND NOT coalesce(op->'allowedItinerantTeamIds','[]') @> jsonb_build_array(unit.id)
   THEN RAISE EXCEPTION 'ANCHORED_UNIT_NOT_ELIGIBLE'; END IF;
   selected:=unit.id;
   IF unit.availability_windows IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(unit.availability_windows) w WHERE public.hhmm_to_minutes(w->>'start')<=start_min AND public.hhmm_to_minutes(w->>'end')>=end_min)
   THEN RAISE EXCEPTION 'ANCHORED_UNIT_UNAVAILABLE'; END IF;
  ELSIF item->>'itinerantUnitId' IS NOT NULL THEN RAISE EXCEPTION 'ANCHORED_UNIT_NOT_ELIGIBLE'; END IF;
  SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO required FROM (
   SELECT value::text::integer id FROM jsonb_array_elements(coalesce(op->'declaredResourceIds','[]'))
   UNION SELECT value::text::integer FROM jsonb_array_elements(coalesce(task.assigned_resource_ids,'[]')) WHERE coalesce(p.daily_joint_groups->'groups','[]')<>'[]'
   UNION SELECT q.id FROM public.plan_resource_items q WHERE q.plan_id=p_plan AND tpl.resource_requirements#>ARRAY['byItem',q.resource_item_id::text]='1'
   UNION SELECT a.plan_resource_item_id FROM public.plan_space_resource_assignments a WHERE a.plan_id=p_plan AND a.space_id=task.space_id AND coalesce(op->>'resourceInheritance','LOCATION')='LOCATION'
   UNION SELECT a.plan_resource_item_id FROM public.plan_zone_resource_assignments a JOIN public.plan_space_settings sp ON sp.plan_id=a.plan_id AND sp.zone_id=a.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=task.space_id AND coalesce(op->>'resourceInheritance','LOCATION')='LOCATION'
   UNION SELECT (value->>'planResourceItemId')::integer FROM jsonb_array_elements(coalesce(unit.members,'[]'))
   UNION SELECT l.locked_resource_id FROM public.locks l WHERE l.plan_id=p_plan AND l.task_id=task.id AND l.lock_type IN ('resource','full') AND l.locked_resource_id IS NOT NULL
  ) ids WHERE id IS DISTINCT FROM coach;
  SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') INTO resource_ids FROM jsonb_array_elements_text(coalesce(item->'requiredResourceIds','[]'));
  IF resource_ids IS DISTINCT FROM (SELECT coalesce(jsonb_agg('plan-resource:'||value ORDER BY 'plan-resource:'||value),'[]') FROM jsonb_array_elements_text(required))
   OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(coalesce(item->'requiredResourceIds','[]')))<>jsonb_array_length(coalesce(item->'requiredResourceIds','[]'))
   OR EXISTS(SELECT 1 FROM jsonb_each(coalesce(tpl.resource_requirements->'byItem','{}')) req WHERE req.value<>'1'::jsonb OR NOT EXISTS(SELECT 1 FROM public.plan_resource_items q WHERE q.plan_id=p_plan AND q.resource_item_id::text=req.key))
  THEN RAISE EXCEPTION 'ANCHORED_WITNESS_PHYSICAL_RESOURCES'; END IF;
  effective_ids:=required||CASE WHEN coach IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(coach) END;
  SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO persisted_required FROM (
   SELECT value::text::integer id FROM jsonb_array_elements(coalesce(op->'declaredResourceIds','[]'))
   UNION SELECT value::text::integer FROM jsonb_array_elements(coalesce(task.assigned_resource_ids,'[]')) WHERE coalesce(p.daily_joint_groups->'groups','[]')<>'[]'
   UNION SELECT q.id FROM public.plan_resource_items q WHERE q.plan_id=p_plan AND tpl.resource_requirements#>ARRAY['byItem',q.resource_item_id::text]='1'
   UNION SELECT (value->>'planResourceItemId')::integer FROM jsonb_array_elements(coalesce(unit.members,'[]'))
   UNION SELECT coach WHERE coach IS NOT NULL
  ) ids WHERE id IS DISTINCT FROM coach;
  FOR rid IN SELECT value FROM jsonb_array_elements(effective_ids) LOOP
   SELECT * INTO resource FROM public.plan_resource_items WHERE plan_id=p_plan AND id=rid::text::integer;
   IF NOT FOUND OR NOT resource.is_available OR start_min<public.hhmm_to_minutes(coalesce(resource.availability_start,p.work_start)) OR end_min>public.hhmm_to_minutes(coalesce(resource.availability_end,p.work_end)) THEN RAISE EXCEPTION 'ANCHORED_WITNESS_RESOURCE_AVAILABILITY'; END IF;
  END LOOP;
  FOR dep IN SELECT value FROM jsonb_array_elements(op->'dependsOnTaskIds') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(proof) predecessor WHERE predecessor->>'id'='task:'||dep::text AND (predecessor->>'end')::integer<=start_min) THEN RAISE EXCEPTION 'ANCHORED_WITNESS_DEPENDENCY'; END IF;
  END LOOP;
  SELECT value INTO actual FROM jsonb_array_elements(p_snapshot->'tasks') x WHERE x->>'taskId'=task.id::text;
  IF actual IS NULL THEN RAISE EXCEPTION 'ANCHORED_WITNESS_SNAPSHOT_IDENTITY'; END IF;
  IF actual->>'startPlanned' IS NOT NULL AND (public.hhmm_to_minutes(actual->>'startPlanned') IS DISTINCT FROM start_min OR public.hhmm_to_minutes(actual->>'endPlanned') IS DISTINCT FROM end_min
   OR actual->'spaceId' IS DISTINCT FROM to_jsonb(task.space_id) OR nullif(actual->'itinerantTeamId','null') IS DISTINCT FROM to_jsonb(selected)
   OR NOT coalesce(actual->'assignedResourceIds','[]') @> persisted_required
   OR NOT effective_ids @> coalesce(actual->'assignedResourceIds','[]'))
  THEN RAISE EXCEPTION 'ANCHORED_SELECTION_SNAPSHOT_MISMATCH'; END IF;
  -- A witness cannot alter a decision already accepted in the active SQL projection.
  IF task.start_planned IS NOT NULL AND (start_min<>public.hhmm_to_minutes(task.start_planned) OR end_min<>public.hhmm_to_minutes(task.end_planned)
   OR actual->>'startPlanned' IS NULL) THEN RAISE EXCEPTION 'ANCHORED_PROTECTED_DECISIONS'; END IF;
 END LOOP;
 -- Whole-operation continuity and choice, including pending operations in the witness.
 SELECT jsonb_build_object('tasks',jsonb_agg(jsonb_build_object('taskId',substring(x->>'id' FROM 6)::integer,
  'spaceId',substring(x->>'spaceId' FROM 7)::integer,
  'startPlanned',lpad(((x->>'start')::integer/60)::text,2,'0')||':'||lpad(((x->>'start')::integer%60)::text,2,'0'),
  'endPlanned',lpad(((x->>'end')::integer/60)::text,2,'0')||':'||lpad(((x->>'end')::integer%60)::text,2,'0'),
  'itinerantTeamId',CASE WHEN x->>'itinerantUnitId' IS NULL THEN NULL ELSE substring(x->>'itinerantUnitId' FROM 16)::integer END,
  'assignedResourceIds',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]') FROM (
   SELECT substring(value FROM 15)::integer v FROM jsonb_array_elements_text(coalesce(x->'requiredResourceIds','[]'))
   UNION SELECT substring(x->>'coachId' FROM 15)::integer WHERE x->>'coachId' IS NOT NULL) ids)))) INTO full_snapshot FROM jsonb_array_elements(proof) x;
 FOR policy IN SELECT value FROM jsonb_array_elements(p.daily_anchored_accompaniments->'policies') LOOP
  SELECT value INTO certified FROM jsonb_array_elements(full_snapshot->'tasks') x WHERE x->'taskId'=policy->'anchorTaskId';
  IF policy ? 'itinerantUnitId' AND policy->'itinerantUnitId' IS DISTINCT FROM certified->'itinerantTeamId'
   OR policy ? 'eligibleItinerantUnitIds' AND NOT policy->'eligibleItinerantUnitIds' @> jsonb_build_array(certified->'itinerantTeamId') THEN RAISE EXCEPTION 'ANCHORED_UNIT_NOT_ELIGIBLE'; END IF;
  PERFORM public.assert_anchored_selected_snapshot(p_plan,full_snapshot,p_revision,(policy-'eligibleItinerantUnitIds')||jsonb_build_object('itinerantUnitId',certified->'itinerantTeamId'));
  IF (SELECT count(*) FROM jsonb_array_elements(p_snapshot->'tasks') x WHERE public.anchored_member_ids(policy) @> jsonb_build_array(x->'taskId') AND x->>'startPlanned' IS NOT NULL) NOT IN (0,3) THEN RAISE EXCEPTION 'ANCHORED_INCOMPLETE_OPERATION'; END IF;
 END LOOP;
 -- Native groups remain individual obligations in both channels. All members
 -- are present and synchronized before authorizing a shared physical occupation.
 FOR policy IN SELECT value FROM jsonb_array_elements(coalesce(p.daily_joint_groups->'groups','[]')) LOOP
  IF (SELECT count(*) FROM jsonb_array_elements(p_snapshot->'tasks') x WHERE policy->'taskIds' @> jsonb_build_array(x->'taskId') AND x->>'startPlanned' IS NOT NULL) NOT IN (0,jsonb_array_length(policy->'taskIds'))
  THEN RAISE EXCEPTION 'JOINT_INCOMPLETE_OPERATION'; END IF;
  SELECT value INTO certified FROM jsonb_array_elements(proof) x WHERE x->>'id'='task:'||(policy#>>'{taskIds,0}');
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(proof) x WHERE x->>'jointGroupId'='joint-group:'||(policy->>'id') AND
   (x->'start' IS DISTINCT FROM certified->'start' OR x->'end' IS DISTINCT FROM certified->'end' OR x->'spaceId' IS DISTINCT FROM certified->'spaceId' OR x->'requiredResourceIds' IS DISTINCT FROM certified->'requiredResourceIds'))
  THEN RAISE EXCEPTION 'JOINT_SYNCHRONIZATION'; END IF;
 END LOOP;
 -- Check competition once, against authentic physical channels. Internal phases
 -- are indivisible and validated above; their transition is INCLUDED.
 FOR item IN SELECT value FROM jsonb_array_elements(proof) LOOP
  FOR other IN SELECT value FROM jsonb_array_elements(proof) x WHERE x->>'id'>item->>'id' LOOP
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(p.daily_anchored_accompaniments->'policies') c WHERE public.anchored_member_ids(c) @> jsonb_build_array(substring(item->>'id' FROM 6)::integer,substring(other->>'id' FROM 6)::integer)) INTO same_operation;
   same_operation:=same_operation OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.daily_joint_groups->'groups','[]')) g WHERE g->'taskIds' @> jsonb_build_array(substring(item->>'id' FROM 6)::integer,substring(other->>'id' FROM 6)::integer));
   IF NOT same_operation THEN
    gap:=CASE WHEN (item->>'start')::integer<=(other->>'start')::integer THEN (other->>'start')::integer-(item->>'end')::integer ELSE (item->>'start')::integer-(other->>'end')::integer END;
    IF item->>'spaceId'=other->>'spaceId' AND coalesce(item->>'blocksSpace','true')='true' AND coalesce(other->>'blocksSpace','true')='true' AND gap<0 THEN RAISE EXCEPTION 'ANCHORED_WITNESS_SPACE_CONFLICT'; END IF;
    IF item->>'participantId'=other->>'participantId' AND item->>'participantId' IS NOT NULL THEN
     SELECT coalesce(greatest(coalesce(da.participant_margin_after_minutes,ta.participant_margin_after_minutes),coalesce(db.participant_margin_before_minutes,tb.participant_margin_before_minutes)),p.participant_transition_minutes,0) INTO participant_margin
      FROM public.daily_tasks da JOIN public.plan_task_template_snapshots ta ON ta.plan_id=da.plan_id AND ta.source_template_id=da.template_id,
       public.daily_tasks db JOIN public.plan_task_template_snapshots tb ON tb.plan_id=db.plan_id AND tb.source_template_id=db.template_id
      WHERE da.plan_id=p_plan AND db.plan_id=p_plan AND 'task:'||da.id=CASE WHEN (item->>'start')::integer<=(other->>'start')::integer THEN item->>'id' ELSE other->>'id' END
       AND 'task:'||db.id=CASE WHEN (item->>'start')::integer<=(other->>'start')::integer THEN other->>'id' ELSE item->>'id' END;
     IF gap<participant_margin THEN RAISE EXCEPTION 'ANCHORED_WITNESS_PARTICIPANT_CONFLICT'; END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(item->'requiredResourceIds','[]')||CASE WHEN item->>'coachId' IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(item->>'coachId') END) a
     JOIN jsonb_array_elements_text(coalesce(other->'requiredResourceIds','[]')||CASE WHEN other->>'coachId' IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(other->>'coachId') END) b ON a=b)
     AND (gap<0 OR item->>'spaceId'<>other->>'spaceId' AND gap<margin) THEN RAISE EXCEPTION 'ANCHORED_WITNESS_RESOURCE_CONFLICT'; END IF;
    IF item->>'coachId'=other->>'coachId' AND item->>'coachId' IS NOT NULL AND (gap<0 OR item->>'spaceId'<>other->>'spaceId' AND gap<margin) THEN RAISE EXCEPTION 'ANCHORED_WITNESS_COACH_CONFLICT'; END IF;
   END IF;
  END LOOP;
 END LOOP;
 -- Native Main is REQUIRED; no operational meals/transport/setup are admitted by this version.
 IF EXISTS(WITH ordered AS (SELECT x,lag((x->>'end')::integer) OVER(ORDER BY (x->>'start')::integer,x->>'id') previous_end FROM jsonb_array_elements(proof) x WHERE x->>'kind'='main')
  SELECT 1 FROM ordered WHERE previous_end IS NOT NULL AND previous_end<>(x->>'start')::integer
   AND NOT(p.meal_mode='global_hard_break' AND previous_end=public.hhmm_to_minutes(p.meal_start) AND (x->>'start')::integer=public.hhmm_to_minutes(p.meal_end)))
 THEN RAISE EXCEPTION 'ANCHORED_WITNESS_MAIN_CONTINUITY'; END IF;
 IF EXISTS(WITH ordered AS (SELECT x,lag(x->>'coachId') OVER(ORDER BY (x->>'start')::integer,x->>'id') previous_coach FROM jsonb_array_elements(proof) x WHERE x->>'kind'='main'),
  numbered AS (SELECT x,sum(CASE WHEN previous_coach IS DISTINCT FROM x->>'coachId' THEN 1 ELSE 0 END) OVER(ORDER BY (x->>'start')::integer,x->>'id') run FROM ordered),
  runs AS (SELECT x->>'coachId' coach_key,count(*) size FROM numbered GROUP BY run,x->>'coachId')
  SELECT 1 FROM runs GROUP BY coach_key HAVING min(size)<(main_flow->>'minTasksPerBlock')::integer OR count(*)>(main_flow->>'maxBlocksByKey')::integer)
 THEN RAISE EXCEPTION 'ANCHORED_WITNESS_MAIN_BLOCKS'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_anchored_choice_witness(integer,jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_anchored_choice_witness(integer,jsonb,bigint) TO service_role;

-- Use the same physical witness consumer as native v2 anchors. This guard
-- activates only for an explicitly authored daily joint authority.
CREATE FUNCTION public.guard_joint_stage() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; snapshot jsonb;
BEGIN
 IF coalesce((SELECT daily_joint_groups->'groups' FROM public.plans WHERE id=NEW.plan_id),'[]')='[]' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='planning_stage_validations' THEN
  SELECT * INTO STRICT s FROM public.assisted_planning_sessions WHERE id=NEW.session_id AND plan_id=NEW.plan_id;snapshot:=s.draft_snapshot_json;
 ELSIF NEW.ordinal>0 THEN snapshot:=NEW.snapshot_json;ELSE RETURN NEW;END IF;
 PERFORM public.assert_joint_revision(NEW.plan_id,(SELECT replay_snapshot_json FROM public.plan_config_revisions WHERE id=NEW.config_revision_id AND plan_id=NEW.plan_id));
 PERFORM public.assert_anchored_choice_witness(NEW.plan_id,snapshot,NEW.config_revision_id);
 RETURN NEW;
END $$;
CREATE TRIGGER joint_validation BEFORE INSERT ON public.planning_stage_validations FOR EACH ROW EXECUTE FUNCTION public.guard_joint_stage();
CREATE TRIGGER joint_stage BEFORE INSERT ON public.assisted_planning_stages FOR EACH ROW EXECUTE FUNCTION public.guard_joint_stage();
REVOKE ALL ON FUNCTION public.guard_joint_stage() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.guard_joint_source() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.plans p,LATERAL jsonb_array_elements(coalesce(p.daily_joint_groups->'groups','[]')) g WHERE p.id=OLD.plan_id AND g->'taskIds' @> jsonb_build_array(OLD.id)) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'JOINT_REFERENCED'; END IF;
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.contestant_id IS DISTINCT FROM OLD.contestant_id OR NEW.space_id IS DISTINCT FROM OLD.space_id OR NEW.zone_id IS DISTINCT FROM OLD.zone_id OR NEW.duration_override IS DISTINCT FROM OLD.duration_override OR (NEW.status='cancelled' AND NEW.status IS DISTINCT FROM OLD.status)
  THEN RAISE EXCEPTION 'JOINT_REQUIRES_VERSIONED_CHANGE'; END IF;
  IF (NEW.start_planned IS DISTINCT FROM OLD.start_planned OR NEW.end_planned IS DISTINCT FROM OLD.end_planned OR NEW.assigned_resource_ids IS DISTINCT FROM OLD.assigned_resource_ids)
   AND current_setting('optiplan.anchored_task_materialization',true) IS DISTINCT FROM txid_current()::text THEN RAISE EXCEPTION 'JOINT_REQUIRES_ASSISTED_MATERIALIZATION'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
CREATE TRIGGER joint_source BEFORE UPDATE OR DELETE ON public.daily_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_joint_source();
REVOKE ALL ON FUNCTION public.guard_joint_source() FROM PUBLIC,anon,authenticated,service_role;
