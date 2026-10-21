-- U06a: minutes only, over the frozen 088 baseline. Empty overrides preserve history.
ALTER TABLE public.plans ADD COLUMN round_preparation_overrides jsonb NOT NULL DEFAULT '[]'::jsonb
 CHECK (jsonb_typeof(round_preparation_overrides)='array');

CREATE FUNCTION public.guard_round_preparation_overrides() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.round_preparation_overrides<>'[]'::jsonb)
 OR (TG_OP='UPDATE' AND NEW.round_preparation_overrides IS DISTINCT FROM OLD.round_preparation_overrides) THEN
  IF current_user<>'service_role' OR current_setting('optiplan.round_preparation_operation',true) IS DISTINCT FROM 'versioned'
   THEN RAISE EXCEPTION 'ROUND_PREPARATION_REQUIRES_VERSIONED_OPERATION'; END IF;
 END IF;
 RETURN NEW;
END $$;

-- Pure projection; never accepts a replacement policy or edits the baseline.
CREATE FUNCTION public.effective_round_preparations(p_config jsonb,p_overrides jsonb) RETURNS jsonb
 LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE rounds jsonb:=p_config->'roundSynchronizations'; item jsonb; pi integer; li integer; n integer; keys text[]:='{}'; k text;
BEGIN
 IF jsonb_typeof(p_overrides) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_ROUND_PREPARATION_OVERRIDE'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_overrides) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>5
   OR jsonb_typeof(item->'policyId') IS DISTINCT FROM 'string' OR coalesce(item->>'policyId','')=''
   OR jsonb_typeof(item->'spaceId') IS DISTINCT FROM 'number' OR (item->>'spaceId')!~'^[1-9][0-9]*$'
   OR jsonb_typeof(item->'preparationMinutesBetweenRounds') IS DISTINCT FROM 'number'
   OR (item->>'preparationMinutesBetweenRounds')!~'^[0-9]+$'
   OR (item->>'preparationMinutesBetweenRounds')::bigint>2147483647
   OR (item->>'preparationMinutesBetweenRounds')::bigint%5<>0
   OR item->>'by' IS NULL OR item->>'at' IS NULL THEN RAISE EXCEPTION 'INVALID_ROUND_PREPARATION_OVERRIDE'; END IF;
  PERFORM (item->>'by')::uuid,(item->>'at')::timestamptz;
  k:=jsonb_build_array(item->>'policyId',item->>'spaceId')::text;
  IF k=ANY(keys) THEN RAISE EXCEPTION 'DUPLICATE_ROUND_PREPARATION_OVERRIDE'; END IF;
  keys:=array_append(keys,k);
  SELECT count(*),min((ordinality-1)::integer) INTO n,pi FROM jsonb_array_elements(rounds) WITH ORDINALITY WHERE value->>'id'=item->>'policyId';
  IF n<>1 THEN RAISE EXCEPTION 'ROUND_PREPARATION_CONFIGURATION_CONFLICT'; END IF;
  SELECT count(*),min((ordinality-1)::integer) INTO n,li FROM jsonb_array_elements(rounds->pi->'lanes') WITH ORDINALITY WHERE value->'spaceId'=item->'spaceId';
  IF n<>1 THEN RAISE EXCEPTION 'ROUND_PREPARATION_CONFIGURATION_CONFLICT'; END IF;
  rounds:=jsonb_set(rounds,ARRAY[pi::text,'lanes',li::text,'preparationMinutesBetweenRounds'],item->'preparationMinutesBetweenRounds',false);
 END LOOP;
 RETURN rounds;
END $$;
REVOKE ALL ON FUNCTION public.effective_round_preparations(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.effective_round_preparations(jsonb,jsonb) TO service_role;

CREATE FUNCTION public.apply_day_config_operation_v4(
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
 rounds:=public.effective_round_preparations(p.planner_next_configuration,p.round_preparation_overrides);
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
REVOKE ALL ON FUNCTION public.apply_day_config_operation_v4(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_day_config_operation_v4(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
CREATE TRIGGER guard_round_preparation_overrides BEFORE INSERT OR UPDATE ON public.plans
 FOR EACH ROW EXECUTE FUNCTION public.guard_round_preparation_overrides();
REVOKE ALL ON FUNCTION public.guard_round_preparation_overrides() FROM PUBLIC,anon,authenticated;

-- Extend only the recognized RESTORE categories in the existing revision writer.
CREATE OR REPLACE FUNCTION public.apply_day_config_operation(
  p_plan_id integer, p_actor uuid, p_operation text, p_payload jsonb,
  p_expected_revision bigint, p_expected_identity jsonb, p_expected_replay jsonb,
  p_candidate_identity jsonb, p_candidate_replay jsonb, p_diff jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p public.plans%ROWTYPE; g public.program_settings%ROWTYPE; cap text;
  parent_revision bigint; new_revision bigint; persisted_fingerprint text;
BEGIN
  SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  IF p.current_config_revision_id IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  IF p_expected_identity->>'contractVersion'<>'1' OR (p_expected_identity->>'planId')::integer<>p_plan_id
     OR p_expected_replay->>'contractVersion'<>'1' OR p_expected_identity->>'configurationFingerprint' IS NULL
     OR p_candidate_identity->>'contractVersion'<>'1' OR (p_candidate_identity->>'planId')::integer<>p_plan_id
     OR p_candidate_replay->>'contractVersion'<>'1' OR p_candidate_identity->>'configurationFingerprint' IS NULL
     THEN RAISE EXCEPTION 'INVALID_CONFIG_REVISION_CONTRACT'; END IF;

  parent_revision:=p.current_config_revision_id;
  IF parent_revision IS NOT NULL THEN
    SELECT fingerprint INTO persisted_fingerprint FROM public.plan_config_revisions
      -- The plan lock pins this immutable revision; SELECT needs no UPDATE grant.
      WHERE id=parent_revision AND plan_id=p_plan_id;
  END IF;
  -- A missing or stale legacy pointer is repaired only with a full canonical
  -- snapshot of the pre-mutation effective configuration.
  IF persisted_fingerprint IS DISTINCT FROM p_expected_identity->>'configurationFingerprint' THEN
    INSERT INTO public.plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json,created_by)
    VALUES(p_plan_id,parent_revision,'CANONICAL_MATERIALIZATION',p_expected_identity->>'configurationFingerprint',p_expected_identity,p_expected_replay,
      jsonb_build_object('reason','legacy-or-stale-current-revision'),p_actor) RETURNING id INTO parent_revision;
  END IF;

  IF p_operation='EDIT' THEN
    IF p_payload ? 'workday' THEN UPDATE public.plans SET work_start=p_payload#>>'{workday,start}',work_end=p_payload#>>'{workday,end}',work_config_source='DAY_OVERRIDE',work_override_by=p_actor,work_override_at=now() WHERE id=p_plan_id; END IF;
    IF p_payload ? 'meal' THEN UPDATE public.plans SET meal_start=p_payload#>>'{meal,start}',meal_end=p_payload#>>'{meal,end}',meal_mode=p_payload#>>'{meal,mode}',meal_config_source='DAY_OVERRIDE',meal_override_by=p_actor,meal_override_at=now() WHERE id=p_plan_id; END IF;
    IF p_payload ? 'participantTransitionMinutes' THEN UPDATE public.plans SET participant_transition_minutes=(p_payload->>'participantTransitionMinutes')::int,participant_transition_config_source='DAY_OVERRIDE',participant_transition_override_by=p_actor,participant_transition_override_at=now() WHERE id=p_plan_id; END IF;
  ELSIF p_operation='RESTORE' THEN
    cap:=p_payload->>'capability';
    IF cap='WORKDAY_WINDOW' THEN UPDATE public.plans SET work_start=work_baseline_start,work_end=work_baseline_end,work_config_source='INHERITED',work_override_by=NULL,work_override_at=NULL WHERE id=p_plan_id;
    ELSIF cap='GLOBAL_MEAL_BREAK' THEN UPDATE public.plans SET meal_start=meal_baseline_start,meal_end=meal_baseline_end,meal_mode=meal_baseline_mode,meal_config_source='INHERITED',meal_override_by=NULL,meal_override_at=NULL WHERE id=p_plan_id;
    ELSIF cap='PARTICIPANT_TRANSITION' THEN UPDATE public.plans SET participant_transition_minutes=participant_transition_baseline_minutes,participant_transition_config_source='INHERITED',participant_transition_override_by=NULL,participant_transition_override_at=NULL WHERE id=p_plan_id;
    -- v3 already restored the separate Main authority under the plan lock.
    ELSIF cap IN ('BLOCK_COUNT_POLICY','OPTIMIZATION','SYNCHRONIZED_ROUNDS') THEN NULL;
    ELSE RAISE EXCEPTION 'INVALID_CAPABILITY'; END IF;
  ELSIF p_operation='REFRESH' THEN
    SELECT * INTO g FROM public.program_settings WHERE id=1;
    IF p_payload->'capabilities' ? 'WORKDAY_WINDOW' AND (p.work_config_source<>'LEGACY_BACKFILL' OR p_payload->>'legacyTreatment'='ADOPT_GENERAL_AS_INHERITED') THEN
      UPDATE public.plans SET work_baseline_start=g.default_work_start,work_baseline_end=g.default_work_end,
        work_start=CASE WHEN p.work_config_source='DAY_OVERRIDE' THEN work_start ELSE g.default_work_start END,
        work_end=CASE WHEN p.work_config_source='DAY_OVERRIDE' THEN work_end ELSE g.default_work_end END,
        work_config_source=CASE WHEN p.work_config_source='LEGACY_BACKFILL' THEN 'INHERITED' ELSE p.work_config_source END,
        work_override_by=CASE WHEN p.work_config_source='DAY_OVERRIDE' THEN work_override_by ELSE NULL END,
        work_override_at=CASE WHEN p.work_config_source='DAY_OVERRIDE' THEN work_override_at ELSE NULL END WHERE id=p_plan_id;
    END IF;
    IF p_payload->'capabilities' ? 'GLOBAL_MEAL_BREAK' AND (p.meal_config_source<>'LEGACY_BACKFILL' OR p_payload->>'legacyTreatment'='ADOPT_GENERAL_AS_INHERITED') THEN
      UPDATE public.plans SET meal_baseline_start=g.meal_start,meal_baseline_end=g.meal_end,meal_baseline_mode=g.meal_mode,
        meal_start=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_start ELSE g.meal_start END,
        meal_end=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_end ELSE g.meal_end END,
        meal_mode=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_mode ELSE g.meal_mode END,
        meal_config_source=CASE WHEN p.meal_config_source='LEGACY_BACKFILL' THEN 'INHERITED' ELSE p.meal_config_source END,
        meal_override_by=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_override_by ELSE NULL END,
        meal_override_at=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_override_at ELSE NULL END WHERE id=p_plan_id;
    END IF;
    IF p_payload->'capabilities' ? 'PARTICIPANT_TRANSITION' AND (p.participant_transition_config_source<>'LEGACY_BACKFILL' OR p_payload->>'legacyTreatment'='ADOPT_GENERAL_AS_INHERITED') THEN
      UPDATE public.plans SET participant_transition_baseline_minutes=g.default_participant_transition_minutes,
        participant_transition_minutes=CASE WHEN p.participant_transition_config_source='DAY_OVERRIDE' THEN participant_transition_minutes ELSE g.default_participant_transition_minutes END,
        participant_transition_config_source=CASE WHEN p.participant_transition_config_source='LEGACY_BACKFILL' THEN 'INHERITED' ELSE p.participant_transition_config_source END,
        participant_transition_override_by=CASE WHEN p.participant_transition_config_source='DAY_OVERRIDE' THEN participant_transition_override_by ELSE NULL END,
        participant_transition_override_at=CASE WHEN p.participant_transition_config_source='DAY_OVERRIDE' THEN participant_transition_override_at ELSE NULL END WHERE id=p_plan_id;
    END IF;
  ELSE RAISE EXCEPTION 'INVALID_OPERATION'; END IF;

  -- Re-lock/read after mutation and reject a server candidate built for any
  -- different effective workday/meal state. Contestant values are never inferred.
  SELECT * INTO p FROM public.plans WHERE id=p_plan_id;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_candidate_replay#>'{authorities,plan_workday}') w
    WHERE w#>>'{workDay,start}'=p.work_start AND w#>>'{workDay,end}'=p.work_end
      AND w->>'mealMode'=p.meal_mode
      AND (w#>>'{mealWindow,start}'=p.meal_start OR w#>>'{meal,start}'=p.meal_start)
      AND (w#>>'{mealWindow,end}'=p.meal_end OR w#>>'{meal,end}'=p.meal_end)
      AND (w->>'defaultParticipantTransitionMinutes')::int=p.participant_transition_minutes)
    THEN RAISE EXCEPTION 'STALE_CONFIG_CANDIDATE'; END IF;

  INSERT INTO public.plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json,created_by)
  VALUES(p_plan_id,parent_revision,p_operation,p_candidate_identity->>'configurationFingerprint',p_candidate_identity,p_candidate_replay,p_diff,p_actor)
  RETURNING id INTO new_revision;
  UPDATE public.plans SET current_config_revision_id=new_revision WHERE id=p_plan_id;
  UPDATE public.assisted_planning_sessions SET current_config_revision_id=new_revision,draft_validation_id=NULL,updated_at=now()
    WHERE plan_id=p_plan_id AND status='ACTIVE';
  RETURN new_revision;
END $$;

