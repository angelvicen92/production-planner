-- P0-U00p. One daily authority after task instantiation; no historical adoption.
ALTER TABLE public.plans ADD COLUMN daily_round_synchronization jsonb;
ALTER TABLE public.plans ADD CONSTRAINT daily_round_single_authority CHECK (
 daily_round_synchronization IS NULL OR (planner_next_profile IS NOT NULL
 AND planner_next_configuration IS NULL AND round_preparation_overrides='[]'::jsonb));

CREATE FUNCTION public.guard_daily_round_synchronization() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.daily_round_synchronization IS NOT NULL) OR
 (TG_OP='UPDATE' AND NEW.daily_round_synchronization IS DISTINCT FROM OLD.daily_round_synchronization) THEN
  IF current_user<>'service_role' OR current_setting('optiplan.daily_round_operation',true) IS DISTINCT FROM 'versioned'
  THEN RAISE EXCEPTION 'ROUND_STRUCTURE_REQUIRES_VERSIONED_OPERATION'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_daily_round_synchronization BEFORE INSERT OR UPDATE ON public.plans
 FOR EACH ROW EXECUTE FUNCTION public.guard_daily_round_synchronization();
REVOKE ALL ON FUNCTION public.guard_daily_round_synchronization() FROM PUBLIC,anon,authenticated,service_role;

-- JSON.stringify-compatible canonical JSON for the existing semantic identity.
-- Only used by the structural writer: no legacy fingerprint is rewritten.
CREATE FUNCTION public.round_structure_canonical_json(v jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result text;
BEGIN
 CASE jsonb_typeof(v)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.round_structure_canonical_json(value),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(public.round_structure_canonical_json(value),',' ORDER BY ordinality),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY;
 ELSE result:=v::text;
 END CASE;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.round_structure_canonical_json(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.round_structure_canonical_json(jsonb) TO service_role;

CREATE FUNCTION public.assert_daily_round_structure(p_plan integer,p_structure jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE policy jsonb; lane jsonb; member jsonb; ids integer[]:='{}'; spaces integer[]:='{}'; duration integer; d integer; t public.daily_tasks%rowtype;
BEGIN
 IF jsonb_typeof(p_structure) IS DISTINCT FROM 'object' OR p_structure->>'contractVersion' IS DISTINCT FROM '1'
 OR p_structure-ARRAY['contractVersion','policies']<>'{}'::jsonb OR jsonb_typeof(p_structure->'policies') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_structure->'policies')>1 THEN RAISE EXCEPTION 'UNSUPPORTED_ROUND_STRUCTURE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plans WHERE id=p_plan AND planner_next_configuration IS NULL
  AND planner_next_profile#>>'{configuration,scenario}'='STANDALONE_ONLY'
  AND planner_next_profile#>>'{configuration,setup}'='NONE'
  AND planner_next_profile#>>'{configuration,transport}'='NONE'
  AND planner_next_profile#>>'{configuration,timeGridMinutes}'='5'
  AND round_preparation_overrides='[]'::jsonb)
 OR public.effective_operation_continuity(p_plan,'[]')<>'[]'::jsonb
 OR EXISTS(SELECT 1 FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan)
 THEN RAISE EXCEPTION 'UNSUPPORTED_ROUND_STRUCTURE_COMBINATION'; END IF;
 FOR policy IN SELECT value FROM jsonb_array_elements(p_structure->'policies') LOOP
  IF policy-ARRAY['id','synchronization','lanes']<>'{}'::jsonb OR jsonb_typeof(policy->'id') IS DISTINCT FROM 'string'
   OR length(btrim(policy->>'id')) NOT BETWEEN 1 AND 120 OR btrim(policy->>'id')<>policy->>'id'
   OR policy->>'synchronization' IS DISTINCT FROM 'START_TOGETHER_WHILE_ALL_LANES_ACTIVE'
   OR jsonb_typeof(policy->'lanes') IS DISTINCT FROM 'array' OR jsonb_array_length(policy->'lanes')<>2
  THEN RAISE EXCEPTION 'UNSUPPORTED_ROUND_STRUCTURE'; END IF;
  FOR lane IN SELECT value FROM jsonb_array_elements(policy->'lanes') LOOP
   IF lane-ARRAY['spaceId','taskIds','preparationMinutesBetweenRounds']<>'{}'::jsonb
    OR coalesce(lane->>'spaceId','')!~'^[1-9][0-9]*$' OR jsonb_typeof(lane->'spaceId') IS DISTINCT FROM 'number'
    OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings WHERE plan_id=p_plan AND space_id=(lane->>'spaceId')::integer)
    OR (lane->>'spaceId')::integer=ANY(spaces)
    OR coalesce(lane->>'preparationMinutesBetweenRounds','')!~'^[0-9]+$'
    OR jsonb_typeof(lane->'preparationMinutesBetweenRounds') IS DISTINCT FROM 'number'
    OR (lane->>'preparationMinutesBetweenRounds')::bigint>2147483647 OR (lane->>'preparationMinutesBetweenRounds')::bigint%5<>0
    OR jsonb_typeof(lane->'taskIds') IS DISTINCT FROM 'array' OR jsonb_array_length(lane->'taskIds')<2
   THEN RAISE EXCEPTION 'UNSUPPORTED_ROUND_STRUCTURE_LANE'; END IF;
   spaces:=array_append(spaces,(lane->>'spaceId')::integer);
   FOR member IN SELECT value FROM jsonb_array_elements(lane->'taskIds') LOOP
    IF jsonb_typeof(member) IS DISTINCT FROM 'number' OR member::text!~'^[1-9][0-9]*$' OR member::text::integer=ANY(ids)
    THEN RAISE EXCEPTION 'UNSUPPORTED_ROUND_STRUCTURE_MEMBER'; END IF;
    ids:=array_append(ids,member::text::integer);
    SELECT * INTO t FROM public.daily_tasks WHERE id=member::text::integer AND plan_id=p_plan;
    IF NOT FOUND OR t.space_id IS DISTINCT FROM (lane->>'spaceId')::integer OR t.contestant_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.contestants WHERE id=t.contestant_id AND plan_id=p_plan)
    OR t.status NOT IN ('pending','interrupted') OR EXISTS(SELECT 1 FROM public.locks WHERE plan_id=p_plan AND task_id=t.id)
    THEN RAISE EXCEPTION 'ROUND_STRUCTURE_PROTECTED_OR_UNKNOWN_MEMBER'; END IF;
    SELECT coalesce(t.duration_override,s.default_duration) INTO d FROM public.plan_task_template_snapshots s
     WHERE s.plan_id=p_plan AND s.source_template_id=t.template_id AND s.planner_next_operation->>'kind'='auxiliary';
    IF d IS NULL OR d<=0 OR d%5<>0 OR (duration IS NOT NULL AND duration<>d)
    THEN RAISE EXCEPTION 'UNSUPPORTED_ROUND_STRUCTURE_DURATION_OR_ROLE'; END IF;
    duration:=d;
   END LOOP;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_daily_round_structure(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_daily_round_structure(integer,jsonb) TO service_role;

-- 102: native rounds resolve from the daily authority; legacy body stays literal.
CREATE OR REPLACE FUNCTION public.apply_day_config_operation_v4(
 p_plan_id integer,p_actor uuid,p_operation text,p_payload jsonb,p_expected_revision bigint,
 p_expected_identity jsonb,p_expected_replay jsonb,p_candidate_identity jsonb,p_candidate_replay jsonb,p_diff jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%ROWTYPE; selected boolean; target jsonb; rounds jsonb; lane jsonb; overrides jsonb;
 old_guard text; result bigint; new_minutes integer; old_minutes integer; original_minutes integer; n integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id WHERE u.user_id=p_actor AND r.key IN ('admin','production'))
  THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
 selected:=(p_operation='EDIT' AND p_payload ? 'roundPreparation') OR (p_operation='RESTORE' AND p_payload->>'capability'='SYNCHRONIZED_ROUNDS');
 rounds:=CASE WHEN p.daily_round_synchronization IS NULL THEN public.effective_round_preparations(p.planner_next_configuration,p.round_preparation_overrides) ELSE nullif(p.daily_round_synchronization->'policies','[]'::jsonb) END;
 IF selected AND p.daily_round_synchronization IS NOT NULL THEN RAISE EXCEPTION 'ROUND_STRUCTURE_USE_STRUCTURAL_EDITOR'; END IF;
 IF selected THEN
  IF NOT (p_payload ? 'expectedRevisionId') OR p_payload->'expectedRevisionId' IS DISTINCT FROM coalesce(to_jsonb(p_expected_revision),'null'::jsonb)
   THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  IF p_expected_replay#>'{authorities,plan_workday,0,plannerNextAuthorities,roundSynchronizations}' IS DISTINCT FROM rounds
   THEN RAISE EXCEPTION 'STALE_ROUND_PREPARATION_CANDIDATE'; END IF;
  target:=p_payload->'roundPreparation';
  IF jsonb_typeof(target) IS DISTINCT FROM 'object' OR jsonb_typeof(target->'policyId') IS DISTINCT FROM 'string'
   OR jsonb_typeof(target->'spaceId') IS DISTINCT FROM 'number' OR (target->>'spaceId')!~'^[1-9][0-9]*$'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) key WHERE key NOT IN ('roundPreparation','expectedRevisionId','capability'))
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(target) key WHERE key NOT IN ('policyId','spaceId','preparationMinutesBetweenRounds'))
   THEN RAISE EXCEPTION 'INVALID_ROUND_PREPARATION_OVERRIDE'; END IF;
  SELECT count(*) INTO n FROM jsonb_array_elements(p.planner_next_configuration->'roundSynchronizations') policy WHERE policy->>'id'=target->>'policyId';
  IF n<>1 THEN RAISE EXCEPTION 'ROUND_PREPARATION_CONFIGURATION_CONFLICT'; END IF;
  SELECT count(*) INTO n FROM jsonb_array_elements(p.planner_next_configuration->'roundSynchronizations') policy,
   LATERAL jsonb_array_elements(policy->'lanes') l WHERE policy->>'id'=target->>'policyId' AND l->'spaceId'=target->'spaceId';
  IF n<>1 THEN RAISE EXCEPTION 'ROUND_PREPARATION_CONFIGURATION_CONFLICT'; END IF;
  SELECT l INTO lane FROM jsonb_array_elements(p.planner_next_configuration->'roundSynchronizations') policy,
   LATERAL jsonb_array_elements(policy->'lanes') l WHERE policy->>'id'=target->>'policyId' AND l->'spaceId'=target->'spaceId';
  IF NOT EXISTS(SELECT 1 FROM public.plan_space_settings s WHERE s.plan_id=p_plan_id AND s.space_id=(target->>'spaceId')::integer)
   OR jsonb_array_length(lane->'taskIds')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(lane->'taskIds') t WHERE NOT EXISTS
     (SELECT 1 FROM public.daily_tasks d WHERE d.plan_id=p_plan_id AND d.id=t::text::integer AND d.space_id=(target->>'spaceId')::integer))
   THEN RAISE EXCEPTION 'ROUND_PREPARATION_CONFIGURATION_CONFLICT'; END IF;
  original_minutes:=(lane->>'preparationMinutesBetweenRounds')::integer;
  SELECT (value->>'preparationMinutesBetweenRounds')::integer INTO old_minutes FROM jsonb_array_elements(p.round_preparation_overrides)
   WHERE value->>'policyId'=target->>'policyId' AND value->'spaceId'=target->'spaceId';
  SELECT coalesce(jsonb_agg(value),'[]'::jsonb) INTO overrides FROM jsonb_array_elements(p.round_preparation_overrides)
   WHERE NOT (value->>'policyId'=target->>'policyId' AND value->'spaceId'=target->'spaceId');
  IF p_operation='EDIT' THEN
   IF jsonb_typeof(target->'preparationMinutesBetweenRounds') IS DISTINCT FROM 'number' OR (target->>'preparationMinutesBetweenRounds')!~'^[0-9]+$'
    THEN RAISE EXCEPTION 'INVALID_ROUND_PREPARATION_OVERRIDE'; END IF;
   new_minutes:=(target->>'preparationMinutesBetweenRounds')::integer;
   IF new_minutes=coalesce(old_minutes,original_minutes) THEN RAISE EXCEPTION 'ROUND_PREPARATION_NO_CHANGES'; END IF;
   overrides:=overrides||jsonb_build_array(target||jsonb_build_object('by',p_actor,'at',now()));
  ELSE
   IF target ? 'preparationMinutesBetweenRounds' OR old_minutes IS NULL THEN RAISE EXCEPTION 'ROUND_PREPARATION_RESTORE_NOT_AVAILABLE'; END IF;
  END IF;
  rounds:=public.effective_round_preparations(p.planner_next_configuration,overrides);
  old_guard:=current_setting('optiplan.round_preparation_operation',true);
  PERFORM set_config('optiplan.round_preparation_operation','versioned',true);
  UPDATE public.plans SET round_preparation_overrides=overrides WHERE id=p_plan_id;
  PERFORM set_config('optiplan.round_preparation_operation',coalesce(old_guard,''),true);
 END IF;
 -- Every category must preserve this authority in its durable replay.
 IF p_candidate_replay#>'{authorities,plan_workday,0,plannerNextAuthorities,roundSynchronizations}' IS DISTINCT FROM rounds
  THEN RAISE EXCEPTION 'STALE_ROUND_PREPARATION_CANDIDATE'; END IF;
 result:=public.apply_day_config_operation_v3(p_plan_id,p_actor,p_operation,p_payload-'roundPreparation'-'expectedRevisionId',p_expected_revision,
   p_expected_identity,p_expected_replay,p_candidate_identity,p_candidate_replay,p_diff);
 RETURN result;
END $$;

-- 104: extend the existing authenticated configuration operation.
CREATE OR REPLACE FUNCTION public.apply_day_config_operation_v5(
 p_plan_id integer,p_actor uuid,p_operation text,p_payload jsonb,p_expected_revision bigint,
 p_expected_identity jsonb,p_expected_replay jsonb,p_candidate_identity jsonb,p_candidate_replay jsonb,p_diff jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; target jsonb; overrides jsonb; groups jsonb; selected boolean; guard text; result bigint;
 structure_selected boolean; old_rounds jsonb; new_rounds jsonb; path text[]:=ARRAY['authorities','plan_workday','0','plannerNextAuthorities','roundSynchronizations'];
 s public.assisted_planning_sessions%rowtype; before_sources jsonb; changed jsonb; expected_candidate jsonb; component jsonb; work_fp text; all_fp text;
BEGIN
 PERFORM 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
 WHERE u.user_id=p_actor AND r.key IN ('admin','production') FOR SHARE OF u;
 IF NOT FOUND THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;

 structure_selected:=p_operation='EDIT' AND p_payload ? 'roundSynchronization';
 IF p_diff ? 'roundSynchronizationTransition' THEN RAISE EXCEPTION 'INVALID_ROUND_STRUCTURE_DIFF'; END IF;
 IF structure_selected THEN
  IF p_payload-ARRAY['roundSynchronization','expectedRevisionId']<>'{}' OR p_payload->'expectedRevisionId' IS DISTINCT FROM coalesce(to_jsonb(p_expected_revision),'null')
  THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
  SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR NO KEY UPDATE NOWAIT;
  IF FOUND THEN
   IF s.draft_snapshot_json IS DISTINCT FROM s.working_snapshot_json OR s.draft_fingerprint IS DISTINCT FROM s.working_fingerprint
    OR s.draft_scope_json<>'{}' THEN RAISE EXCEPTION 'ROUND_STRUCTURE_DIRTY_DRAFT'; END IF;
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
  THEN RAISE EXCEPTION 'ROUND_STRUCTURE_PENDING_PROPOSAL'; END IF;
  PERFORM public.assert_daily_round_structure(p_plan_id,p_payload->'roundSynchronization');
  old_rounds:=nullif(p.daily_round_synchronization->'policies','[]');
  new_rounds:=nullif(p_payload#>'{roundSynchronization,policies}','[]');
  IF old_rounds IS NOT DISTINCT FROM new_rounds THEN RAISE EXCEPTION 'ROUND_STRUCTURE_NO_CHANGES'; END IF;
  IF p_expected_replay#>path IS DISTINCT FROM old_rounds THEN RAISE EXCEPTION 'STALE_ROUND_STRUCTURE'; END IF;
  -- A policy touching protected decisions can only remain literally identical.
  FOR changed IN SELECT value FROM jsonb_array_elements(coalesce(old_rounds,'[]')) UNION SELECT value FROM jsonb_array_elements(coalesce(new_rounds,'[]')) LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(changed->'lanes') l,LATERAL jsonb_array_elements(l->'taskIds') m
    JOIN public.daily_tasks t ON t.id=m::text::integer AND t.plan_id=p_plan_id
    WHERE t.start_planned IS NOT NULL OR t.status IN ('done','in_progress') OR EXISTS(SELECT 1 FROM public.locks WHERE plan_id=p_plan_id AND task_id=t.id))
    AND (NOT coalesce(old_rounds,'[]') @> jsonb_build_array(changed) OR NOT coalesce(new_rounds,'[]') @> jsonb_build_array(changed))
   THEN RAISE EXCEPTION 'ROUND_STRUCTURE_PROTECTED_DECISIONS'; END IF;
  END LOOP;
  expected_candidate:=CASE WHEN new_rounds IS NULL THEN p_expected_replay #- path ELSE jsonb_set(p_expected_replay,path,new_rounds,true) END;
  IF expected_candidate IS DISTINCT FROM p_candidate_replay THEN RAISE EXCEPTION 'STALE_ROUND_STRUCTURE_REPLAY'; END IF;
  work_fp:=encode(sha256(convert_to('{"contractVersion":1,"authority":"plan_workday","availability":"AVAILABLE","semanticValue":'||public.round_structure_canonical_json(p_candidate_replay#>'{authorities,plan_workday}')||'}','UTF8')),'hex');
  SELECT value INTO component FROM jsonb_array_elements(p_candidate_identity->'components') WHERE value->>'authority'='plan_workday';
  IF component->>'fingerprint' IS DISTINCT FROM work_fp
   OR jsonb_set(p_expected_identity,'{components}',(SELECT jsonb_agg(CASE WHEN value->>'authority'='plan_workday' THEN jsonb_set(value,'{fingerprint}',to_jsonb(work_fp)) ELSE value END ORDER BY ordinality) FROM jsonb_array_elements(p_expected_identity->'components') WITH ORDINALITY)) - 'configurationFingerprint'
    IS DISTINCT FROM p_candidate_identity-'configurationFingerprint'
  THEN RAISE EXCEPTION 'STALE_ROUND_STRUCTURE_IDENTITY'; END IF;
  SELECT encode(sha256(convert_to('{"contractVersion":1,"components":'||public.round_structure_canonical_json(jsonb_agg(jsonb_build_object('authority',value->'authority','availability',value->'availability','fingerprint',value->'fingerprint') ORDER BY ordinality))||'}','UTF8')),'hex') INTO all_fp
   FROM jsonb_array_elements(p_candidate_identity->'components') WITH ORDINALITY;
  IF p_candidate_identity->>'configurationFingerprint' IS DISTINCT FROM all_fp THEN RAISE EXCEPTION 'STALE_ROUND_STRUCTURE_IDENTITY'; END IF;
  guard:=current_setting('optiplan.daily_round_operation',true);
  PERFORM set_config('optiplan.daily_round_operation','versioned',true);
  UPDATE public.plans SET daily_round_synchronization=p_payload->'roundSynchronization'||jsonb_build_object('by',p_actor,'at',now()) WHERE id=p_plan_id;
  PERFORM set_config('optiplan.daily_round_operation',coalesce(guard,''),true);
  -- Reuse the immutable revision diff for the explicit configuration transition.
  -- No admission row, replacement session, mutable bootstrap capture or new table.
  p_diff:=p_diff||jsonb_build_object('roundSynchronizationTransition',jsonb_build_object('contractVersion',1,
   'sessionId',s.id,'baseStageId',s.active_stage_id,'previousSessionRevisionId',s.current_config_revision_id,
   'previousPlanRevisionId',p_expected_revision,'before',p.daily_round_synchronization,
   'after',(SELECT daily_round_synchronization FROM public.plans WHERE id=p_plan_id),
   'sources',public.assisted_read_bootstrap_sources(p_plan_id)));
 END IF;
 groups:=public.effective_operation_continuity(p_plan_id,p.operation_continuity_overrides);
 selected:=(p_operation='EDIT' AND p_payload ? 'operationContinuity') OR (p_operation='RESTORE' AND p_payload->>'capability'='OPERATION_CONTINUITY');
 IF coalesce(p_expected_replay#>'{authorities,plan_workday,0,plannerNextAuthorities,operationContinuityGroups}','[]'::jsonb) IS DISTINCT FROM groups
 THEN RAISE EXCEPTION 'STALE_OPERATION_CONTINUITY_CANDIDATE'; END IF;
 IF selected THEN
  IF NOT p_payload ? 'expectedRevisionId' OR p_payload->'expectedRevisionId' IS DISTINCT FROM coalesce(to_jsonb(p_expected_revision),'null'::jsonb)
  THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('operationContinuity','expectedRevisionId','capability'))
  THEN RAISE EXCEPTION 'INVALID_OPERATION_CONTINUITY_OVERRIDE'; END IF;
  target:=p_payload->'operationContinuity';
  IF jsonb_typeof(target) IS DISTINCT FROM 'object' OR NOT target ? 'groupId'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(target) k WHERE k NOT IN ('groupId','policy','gapWeight'))
  THEN RAISE EXCEPTION 'INVALID_OPERATION_CONTINUITY_OVERRIDE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(groups) g WHERE g->>'id'=target->>'groupId')
  THEN RAISE EXCEPTION 'OPERATION_CONTINUITY_CONFIGURATION_CONFLICT'; END IF;
  IF p_operation='RESTORE' AND (target ? 'policy' OR target ? 'gapWeight' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.operation_continuity_overrides) v WHERE v->>'groupId'=target->>'groupId'))
  THEN RAISE EXCEPTION 'OPERATION_CONTINUITY_RESTORE_NOT_AVAILABLE'; END IF;
  SELECT coalesce(jsonb_agg(value),'[]'::jsonb) INTO overrides FROM jsonb_array_elements(p.operation_continuity_overrides) WHERE value->>'groupId'<>target->>'groupId';
  IF p_operation='EDIT' THEN overrides:=overrides||jsonb_build_array(target||jsonb_build_object('by',p_actor,'at',now())); END IF;
  groups:=public.effective_operation_continuity(p_plan_id,overrides);
  guard:=current_setting('optiplan.operation_continuity_operation',true);
  PERFORM set_config('optiplan.operation_continuity_operation','versioned',true);
  UPDATE public.plans SET operation_continuity_overrides=overrides WHERE id=p_plan_id;
  PERFORM set_config('optiplan.operation_continuity_operation',coalesce(guard,''),true);
 END IF;
 IF coalesce(p_candidate_replay#>'{authorities,plan_workday,0,plannerNextAuthorities,operationContinuityGroups}','[]'::jsonb) IS DISTINCT FROM groups
 THEN RAISE EXCEPTION 'STALE_OPERATION_CONTINUITY_CANDIDATE'; END IF;
 result:=public.apply_day_config_operation_v4(p_plan_id,p_actor,p_operation,p_payload-'operationContinuity'-'roundSynchronization',p_expected_revision,
  p_expected_identity,p_expected_replay,p_candidate_identity,p_candidate_replay,p_diff);
 IF structure_selected THEN
  UPDATE public.planning_runs r SET status='error',message='STALE_CONFIG_REVISION',cancel_reason='ROUND_STRUCTURE_CHANGED',cancelled_at=now()
  WHERE r.assisted_session_id=s.id AND r.status='success'
   AND NOT EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE proposal_run_id=r.id);
 END IF;
 RETURN result;
END $$;

-- 107/113: retain the latest explicit configuration capture without admitting tasks.
CREATE OR REPLACE FUNCTION public.assisted_expected_obligation_sources(p_session bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; result jsonb; tasks jsonb; participants jsonb; transition_record public.plan_config_revisions%rowtype; admission_revision bigint;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE id=p_session;
 SELECT sources_json INTO result FROM public.assisted_obligation_transitions WHERE id=s.obligation_transition_id AND session_id=s.id;
 IF result IS NULL THEN SELECT sources_json INTO result FROM public.assisted_bootstrap_sources WHERE session_id=s.id; END IF;

 SELECT config_revision_id INTO admission_revision FROM public.assisted_obligation_transitions WHERE id=s.obligation_transition_id;
 SELECT * INTO transition_record FROM public.plan_config_revisions r WHERE r.plan_id=s.plan_id AND r.id<=s.current_config_revision_id
  AND r.id>coalesce(admission_revision,0) AND r.diff_json#>>'{roundSynchronizationTransition,sessionId}'=s.id::text ORDER BY r.id DESC LIMIT 1;
 IF FOUND THEN
  result:=transition_record.diff_json#>'{roundSynchronizationTransition,sources}';
  result:=jsonb_set(result,'{plans,0,current_config_revision_id}',to_jsonb(transition_record.id));
 END IF;
 IF result IS NULL OR NOT (result ?& ARRAY['plans','daily_tasks','contestants','locks','plan_breaks','plan_task_template_snapshots','plan_optimizer_snapshots','plan_optimizer_snapshot_heuristics','plan_optimizer_snapshot_grouping_zones','plan_zone_settings','plan_space_settings','plan_resource_items','plan_resource_bundle_snapshots','plan_zone_resource_assignments','plan_space_resource_assignments','plan_zone_resource_type_requirements','plan_space_resource_type_requirements','resource_availability','plan_itinerant_unit_snapshots','program_settings','resource_types','resource_item_components'])
 OR EXISTS(SELECT 1 FROM jsonb_each(result) WHERE jsonb_typeof(value)<>'array') THEN RETURN NULL; END IF;
 -- A capture with all keys but missing rows cannot prove a pure addition.
 IF (SELECT jsonb_agg(t->'id' ORDER BY (t->>'id')::bigint) FROM jsonb_array_elements(result->'daily_tasks') t)
  IS DISTINCT FROM (SELECT jsonb_agg(t->'taskId' ORDER BY (t->>'taskId')::bigint) FROM jsonb_array_elements(s.working_snapshot_json->'tasks') t)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'daily_tasks') t WHERE t->>'contestant_id' IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'contestants') c WHERE c->'id'=t->'contestant_id'))
 THEN RETURN NULL; END IF;
 SELECT replay_snapshot_json->'authorities'->'contestant_availability' INTO participants
  FROM public.plan_config_revisions WHERE id=s.current_config_revision_id AND plan_id=s.plan_id;
 IF jsonb_typeof(participants) IS DISTINCT FROM 'array' OR EXISTS(
  SELECT 1 FROM jsonb_array_elements(participants) p WHERE NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(result->'contestants') c WHERE c->'id'=p->'contestantId')) THEN RETURN NULL; END IF;
 SELECT jsonb_agg(t || public.assisted_task_planning_fields(p) ORDER BY (t->>'id')::bigint) INTO tasks
 FROM jsonb_array_elements(result->'daily_tasks') t JOIN jsonb_array_elements(s.working_snapshot_json->'tasks') p ON t->'id'=p->'taskId';
 IF jsonb_array_length(coalesce(tasks,'[]'))<>jsonb_array_length(result->'daily_tasks') THEN RETURN NULL; END IF;
 RETURN jsonb_set(result,'{daily_tasks}',coalesce(tasks,'[]'));
END $$;


CREATE OR REPLACE FUNCTION public.assisted_preview_s0_additions(p_plan_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; base public.assisted_planning_stages%rowtype;
 old_sources jsonb; current_sources jsonb; added jsonb; reason text; item jsonb;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE';
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 SELECT * INTO base FROM public.assisted_planning_stages WHERE id=s.active_stage_id AND session_id=s.id;
 old_sources:=public.assisted_expected_obligation_sources(s.id);
 current_sources:=public.assisted_read_bootstrap_sources(p_plan_id);
 SELECT coalesce(jsonb_agg((t->>'id')::integer ORDER BY (t->>'id')::integer),'[]') INTO added
 FROM jsonb_array_elements(current_sources->'daily_tasks') t
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(base.snapshot_json->'tasks') b WHERE b->>'taskId'=t->>'id');
 IF base.ordinal IS DISTINCT FROM 0 OR s.draft_base_stage_id IS DISTINCT FROM base.id
  OR EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE session_id=s.id AND ordinal>0) THEN reason:='REBOOTSTRAP_ACCEPTED_STAGE';
 ELSIF s.draft_snapshot_json IS DISTINCT FROM base.snapshot_json OR s.draft_fingerprint IS DISTINCT FROM base.snapshot_fingerprint
  OR s.draft_scope_json<>'{}' OR s.draft_validation_id IS NOT NULL THEN reason:='REBOOTSTRAP_DIRTY_DRAFT';
 ELSIF EXISTS(SELECT 1 FROM public.planning_runs WHERE plan_id=p_plan_id AND
  (status IN ('queued','running','cancelling') OR (assisted_session_id=s.id AND status='success' AND assisted_result_json->>'outcome'='PROPOSAL'))) THEN reason:='REBOOTSTRAP_PENDING_PROPOSAL';
 ELSIF EXISTS(SELECT 1 FROM public.daily_tasks WHERE plan_id=p_plan_id AND
  (status NOT IN ('pending','interrupted') OR start_real IS NOT NULL OR end_real IS NOT NULL
   OR to_jsonb(daily_tasks)->>'start_real_at' IS NOT NULL OR to_jsonb(daily_tasks)->>'end_real_at' IS NOT NULL))
  OR EXISTS(SELECT 1 FROM public.locks WHERE plan_id=p_plan_id) THEN reason:='REBOOTSTRAP_PROTECTED_DAY';
 ELSIF old_sources IS NULL OR public.assisted_expected_obligation_sources(s.id) IS NULL THEN reason:='REBOOTSTRAP_BASELINE_UNAVAILABLE';
 ELSIF old_sources-ARRAY['daily_tasks','contestants'] IS DISTINCT FROM current_sources-ARRAY['daily_tasks','contestants'] THEN reason:='REBOOTSTRAP_AUTHORITY_CHANGED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(old_sources->'daily_tasks') old WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(current_sources->'daily_tasks') current_row WHERE current_row=old)) THEN reason:='REBOOTSTRAP_TASK_CHANGED_OR_REMOVED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(old_sources->'contestants') old WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(current_sources->'contestants') current_row WHERE current_row=old)) THEN reason:='REBOOTSTRAP_PARTICIPANT_CHANGED_OR_REMOVED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(current_sources->'contestants') c
  WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old_sources->'contestants') old_row WHERE old_row=c) AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(current_sources->'daily_tasks') t WHERE t->>'contestant_id'=c->>'id' AND added @> jsonb_build_array((t->>'id')::integer))) THEN reason:='REBOOTSTRAP_AUTHORITY_CHANGED';
 ELSIF jsonb_array_length(added)=0 THEN reason:='REBOOTSTRAP_NO_ADDITIONS'; END IF;
 RETURN jsonb_build_object('allowed',reason IS NULL,'reason',reason,'addedTaskIds',added,
  'pendingProposalIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM public.planning_runs WHERE assisted_session_id=s.id AND status='success' AND assisted_result_json->>'outcome'='PROPOSAL'),
  'expectedSessionId',s.id,'expectedBaseStageId',s.draft_base_stage_id,'expectedDraftFingerprint',s.draft_fingerprint,
  'expectedConfigRevisionId',s.current_config_revision_id,
  'sourceToken',encode(sha256(convert_to(current_sources::text,'UTF8')),'hex'));
END $$;

-- Validate the native certificate's material rounds, independently of result hashes.
-- This is a guard over a proposed snapshot, never a search or scheduling algorithm.
CREATE FUNCTION public.assert_daily_round_snapshot(p_plan integer,p_snapshot jsonb,p_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; policy jsonb; lane jsonb; row jsonb; other jsonb; prep jsonb; tasks jsonb; peers jsonb;
 total integer; planned integer; idx integer; first_space integer; start_min integer; end_min integer; prev_end integer;
 prep_min integer; expected_ids text[]:='{}'; expected_id text; duration integer;
BEGIN
 SELECT * INTO p FROM public.plans WHERE id=p_plan;
 IF p.daily_round_synchronization IS NULL THEN RETURN; END IF;
 IF (SELECT replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities,roundSynchronizations}'
  FROM public.plan_config_revisions WHERE id=p_revision AND plan_id=p_plan)
  IS DISTINCT FROM nullif(p.daily_round_synchronization->'policies','[]') THEN RAISE EXCEPTION 'STALE_ROUND_STRUCTURE_REPLAY'; END IF;
 FOR policy IN SELECT value FROM jsonb_array_elements(p.daily_round_synchronization->'policies') LOOP
  SELECT count(*),count(*) FILTER(WHERE t->>'startPlanned' IS NOT NULL) INTO total,planned
   FROM jsonb_array_elements(policy->'lanes') l,LATERAL jsonb_array_elements(l->'taskIds') m
   JOIN jsonb_array_elements(p_snapshot->'tasks') t ON t->'taskId'=m;
  IF total<>(SELECT sum(jsonb_array_length(l->'taskIds')) FROM jsonb_array_elements(policy->'lanes') l)
  OR planned NOT IN (0,total) THEN RAISE EXCEPTION 'ROUND_STRUCTURE_CERTIFICATE_INVALID'; END IF;
  IF planned=0 THEN CONTINUE; END IF;
  peers:=NULL;
  FOR lane IN SELECT value FROM jsonb_array_elements(policy->'lanes') LOOP
   SELECT jsonb_agg(t ORDER BY t->>'startPlanned',(t->>'taskId')::integer) INTO tasks
    FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE lane->'taskIds' @> jsonb_build_array(t->'taskId');
   idx:=0;prev_end:=NULL;prep_min:=(lane->>'preparationMinutesBetweenRounds')::integer;
   FOR row IN SELECT value FROM jsonb_array_elements(tasks) LOOP
    idx:=idx+1;start_min:=public.hhmm_to_minutes(row->>'startPlanned');end_min:=public.hhmm_to_minutes(row->>'endPlanned');
    SELECT coalesce(d.duration_override,s.default_duration) INTO duration FROM public.daily_tasks d
     JOIN public.plan_task_template_snapshots s ON s.plan_id=d.plan_id AND s.source_template_id=d.template_id
     WHERE d.id=(row->>'taskId')::integer AND d.plan_id=p_plan;
    IF start_min IS NULL OR end_min IS NULL OR end_min-start_min IS DISTINCT FROM duration
     OR row->'spaceId' IS DISTINCT FROM lane->'spaceId' OR start_min%5<>0
     OR start_min<public.hhmm_to_minutes(p.work_start) OR end_min>public.hhmm_to_minutes(p.work_end)
    THEN RAISE EXCEPTION 'ROUND_STRUCTURE_CERTIFICATE_INVALID'; END IF;
    IF peers IS NOT NULL AND idx<=jsonb_array_length(peers) THEN
     other:=peers->(idx-1);
     IF row->'startPlanned' IS DISTINCT FROM other->'startPlanned' OR row->'endPlanned' IS DISTINCT FROM other->'endPlanned'
     THEN RAISE EXCEPTION 'ROUND_STRUCTURE_CERTIFICATE_INVALID'; END IF;
    END IF;
    IF prev_end IS NOT NULL THEN
     IF start_min-prep_min<prev_end THEN RAISE EXCEPTION 'ROUND_STRUCTURE_CERTIFICATE_INVALID'; END IF;
     IF prep_min>0 THEN
      expected_id:='round-preparation:'||(policy->>'id')||':'||(lane->>'spaceId')||':'||idx;
      expected_ids:=array_append(expected_ids,expected_id);
      SELECT value INTO prep FROM jsonb_array_elements(coalesce(p_snapshot->'roundPreparations','[]')) WHERE value->>'id'=expected_id;
      IF prep IS NULL OR prep->>'synchronizationId' IS DISTINCT FROM policy->>'id' OR prep->'spaceId' IS DISTINCT FROM lane->'spaceId'
       OR (prep->>'roundIndex')::integer IS DISTINCT FROM idx OR (prep->>'duration')::integer IS DISTINCT FROM prep_min
       OR (prep->>'start')::integer IS DISTINCT FROM start_min-prep_min OR (prep->>'end')::integer IS DISTINCT FROM start_min
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE t->'spaceId'=lane->'spaceId' AND t->>'startPlanned' IS NOT NULL
        AND public.hhmm_to_minutes(t->>'startPlanned')<start_min AND public.hhmm_to_minutes(t->>'endPlanned')>start_min-prep_min)
       OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings s WHERE s.plan_id=p_plan AND s.space_id=(lane->>'spaceId')::integer
        AND start_min-prep_min>=public.hhmm_to_minutes(coalesce(s.availability_start,p.work_start))
        AND start_min<=public.hhmm_to_minutes(coalesce(s.availability_end,p.work_end)))
       OR (p.meal_mode='global_hard_break' AND start_min-prep_min<public.hhmm_to_minutes(p.meal_end) AND start_min>public.hhmm_to_minutes(p.meal_start))
      THEN RAISE EXCEPTION 'ROUND_STRUCTURE_CERTIFICATE_INVALID'; END IF;
     END IF;
    END IF;
    prev_end:=end_min;
   END LOOP;
   IF peers IS NULL THEN peers:=tasks; END IF;
  END LOOP;
 END LOOP;
 IF jsonb_array_length(coalesce(p_snapshot->'roundPreparations','[]'))<>cardinality(expected_ids)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_snapshot->'roundPreparations','[]')) t WHERE NOT (t->>'id'=ANY(expected_ids)))
  OR (SELECT count(DISTINCT t->>'id') FROM jsonb_array_elements(coalesce(p_snapshot->'roundPreparations','[]')) t)<>cardinality(expected_ids)
 THEN RAISE EXCEPTION 'ROUND_STRUCTURE_CERTIFICATE_INVALID'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_daily_round_snapshot(integer,jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_daily_round_snapshot(integer,jsonb,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.assisted_guard_obligation_validation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; r public.planning_runs%rowtype;
BEGIN
 PERFORM public.assisted_read_bootstrap_sources(NEW.plan_id,true);
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE id=NEW.session_id AND plan_id=NEW.plan_id FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND OR s.status<>'ACTIVE' OR s.current_config_revision_id IS DISTINCT FROM NEW.config_revision_id
  OR s.draft_base_stage_id IS DISTINCT FROM NEW.base_stage_id OR s.draft_fingerprint IS DISTINCT FROM NEW.draft_fingerprint THEN RAISE EXCEPTION 'STALE_VALIDATION'; END IF;
 IF (SELECT jsonb_agg(t->'taskId' ORDER BY (t->>'taskId')::bigint) FROM jsonb_array_elements(s.draft_snapshot_json->'tasks') t)
  IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(id) ORDER BY id) FROM public.daily_tasks WHERE plan_id=NEW.plan_id)
 THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
 PERFORM public.assert_daily_round_snapshot(NEW.plan_id,s.draft_snapshot_json,NEW.config_revision_id);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.working_snapshot_json->'roundPreparations','[]')) protected_prep
  WHERE NOT coalesce(s.draft_snapshot_json->'roundPreparations','[]') @> jsonb_build_array(protected_prep))
  AND EXISTS(SELECT 1 FROM public.plans WHERE id=NEW.plan_id AND daily_round_synchronization IS NOT NULL)
 THEN RAISE EXCEPTION 'ROUND_STRUCTURE_PROTECTED_DECISIONS'; END IF;
 NEW.source_token:=public.assisted_bootstrap_source_token(NEW.plan_id);
 IF NEW.report_json->>'mode' IN ('MANUAL_DELTA_CLEAN_V1','MANUAL_STAGE_VALIDATION_V1') AND NEW.report_json->>'sourceToken' IS DISTINCT FROM NEW.source_token THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
 IF NEW.report_json->>'mode'='PROPOSAL_CERTIFIED_CLEAN_V1' THEN
  SELECT * INTO r FROM public.planning_runs WHERE id=(NEW.report_json->>'proposalRunId')::bigint;
  IF r.source_token IS DISTINCT FROM NEW.source_token OR r.source_origin_snapshot_json IS DISTINCT FROM s.working_snapshot_json THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
 END IF;
 RETURN NEW;
END $$;

-- A null new authority must not stale historical source tokens merely on migration.
CREATE OR REPLACE FUNCTION public.assisted_read_bootstrap_sources(p_plan_id integer,p_lock boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE tab text; rows jsonb; result jsonb:='{}'; predicate text; projection text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['plans','daily_tasks','contestants','locks','plan_breaks',
  'plan_task_template_snapshots','plan_optimizer_snapshots','plan_optimizer_snapshot_heuristics','plan_optimizer_snapshot_grouping_zones',
  'plan_zone_settings','plan_space_settings','plan_resource_items','plan_resource_bundle_snapshots',
  'plan_zone_resource_assignments','plan_space_resource_assignments','plan_zone_resource_type_requirements','plan_space_resource_type_requirements',
  'resource_availability','plan_itinerant_unit_snapshots','program_settings','resource_types','resource_item_components'] LOOP
  -- SHARE prevents both row changes and phantom insertions during the short commit.
  IF p_lock THEN EXECUTE format('LOCK TABLE public.%I IN SHARE MODE NOWAIT',tab); END IF;
  predicate:=CASE WHEN tab='plans' THEN 't.id=$1'
   WHEN tab IN ('plan_optimizer_snapshot_heuristics','plan_optimizer_snapshot_grouping_zones') THEN 't.snapshot_id IN (SELECT id FROM public.plan_optimizer_snapshots WHERE plan_id=$1)'
   WHEN tab='program_settings' THEN 't.id=1'
   WHEN tab='resource_types' THEN 't.id IN (SELECT type_id FROM public.plan_resource_items WHERE plan_id=$1)'
   WHEN tab='resource_item_components' THEN 't.parent_resource_item_id IN (SELECT resource_item_id FROM public.plan_resource_items WHERE plan_id=$1)'
   ELSE 't.plan_id=$1' END;
  projection:=CASE WHEN tab='plans' THEN 'CASE WHEN t.daily_round_synchronization IS NULL THEN to_jsonb(t)-''daily_round_synchronization'' ELSE to_jsonb(t) END' ELSE 'to_jsonb(t)' END;
  EXECUTE format('SELECT coalesce(jsonb_agg(v ORDER BY v::text),''[]''::jsonb) FROM (SELECT (%s)-''created_at''-''updated_at'' AS v FROM public.%I t WHERE %s) q',projection,tab,predicate) INTO rows USING p_plan_id;
  result:=result||jsonb_build_object(tab,rows);
 END LOOP;
 RETURN result;
END $$;

