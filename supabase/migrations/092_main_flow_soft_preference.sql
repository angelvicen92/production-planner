-- SOFT operational preference, independent of the immutable 088 snapshot.
-- Existing days remain AUTO. No planning, Stage, task, lock or snapshot DML.
ALTER TABLE public.program_settings
 ADD COLUMN main_preferred_block_count integer,
 ADD COLUMN main_before_meal_blocks integer,
 ADD CONSTRAINT program_main_preference_shape CHECK (
  (main_preferred_block_count IS NULL AND main_before_meal_blocks IS NULL) OR
  (main_preferred_block_count IS NOT NULL AND main_preferred_block_count>0 AND (main_before_meal_blocks IS NULL OR main_before_meal_blocks BETWEEN 0 AND main_preferred_block_count))
 );
ALTER TABLE public.plans
 ADD COLUMN main_preferred_block_count integer,
 ADD COLUMN main_before_meal_blocks integer,
 ADD COLUMN main_baseline_preferred_block_count integer,
 ADD COLUMN main_baseline_before_meal_blocks integer,
 ADD COLUMN main_preference_source text NOT NULL DEFAULT 'LEGACY_BACKFILL',
 ADD COLUMN main_preference_override_by uuid,
 ADD COLUMN main_preference_override_at timestamptz,
 ADD CONSTRAINT plans_main_preference_shape CHECK (
  (main_preferred_block_count IS NULL AND main_before_meal_blocks IS NULL) OR
  (main_preferred_block_count IS NOT NULL AND main_preferred_block_count>0 AND (main_before_meal_blocks IS NULL OR main_before_meal_blocks BETWEEN 0 AND main_preferred_block_count))
 ),
 ADD CONSTRAINT plans_main_baseline_preference_shape CHECK (
  (main_baseline_preferred_block_count IS NULL AND main_baseline_before_meal_blocks IS NULL) OR
  (main_baseline_preferred_block_count IS NOT NULL AND main_baseline_preferred_block_count>0 AND (main_baseline_before_meal_blocks IS NULL OR main_baseline_before_meal_blocks BETWEEN 0 AND main_baseline_preferred_block_count))
 ),
 ADD CONSTRAINT plans_main_preference_source_check CHECK (
  main_preference_source IN ('INHERITED','DAY_OVERRIDE','LEGACY_BACKFILL') AND
  ((main_preference_source='DAY_OVERRIDE')=(main_preference_override_by IS NOT NULL AND main_preference_override_at IS NOT NULL))
 );

CREATE FUNCTION public.guard_main_flow_preference() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT main_preferred_block_count,main_before_meal_blocks INTO NEW.main_baseline_preferred_block_count,NEW.main_baseline_before_meal_blocks
  FROM public.program_settings WHERE id=1;
  NEW.main_preferred_block_count:=NEW.main_baseline_preferred_block_count;
  NEW.main_before_meal_blocks:=NEW.main_baseline_before_meal_blocks;
  NEW.main_preference_source:='INHERITED';
  NEW.main_preference_override_by:=NULL; NEW.main_preference_override_at:=NULL;
 ELSIF ROW(NEW.main_preferred_block_count,NEW.main_before_meal_blocks,NEW.main_baseline_preferred_block_count,NEW.main_baseline_before_meal_blocks,NEW.main_preference_source,NEW.main_preference_override_by,NEW.main_preference_override_at)
  IS DISTINCT FROM ROW(OLD.main_preferred_block_count,OLD.main_before_meal_blocks,OLD.main_baseline_preferred_block_count,OLD.main_baseline_before_meal_blocks,OLD.main_preference_source,OLD.main_preference_override_by,OLD.main_preference_override_at) THEN
  IF current_user<>'service_role' OR current_setting('optiplan.main_preference_operation',true) IS DISTINCT FROM 'versioned' THEN
   RAISE EXCEPTION 'MAIN_PREFERENCE_REQUIRES_VERSIONED_OPERATION';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_main_flow_preference BEFORE INSERT OR UPDATE ON public.plans
 FOR EACH ROW EXECUTE FUNCTION public.guard_main_flow_preference();
REVOKE ALL ON FUNCTION public.guard_main_flow_preference() FROM PUBLIC,anon,authenticated;

-- Add one recognized restore category to the existing canonical revision
-- writer. It INSERTs source=RESTORE; immutable revisions need no UPDATE grant.
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
    ELSIF cap='BLOCK_COUNT_POLICY' THEN NULL;
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

CREATE FUNCTION public.apply_day_config_operation_v3(
 p_plan_id integer,p_actor uuid,p_operation text,p_payload jsonb,p_expected_revision bigint,
 p_expected_identity jsonb,p_expected_replay jsonb,p_candidate_identity jsonb,p_candidate_replay jsonb,p_diff jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%ROWTYPE; g public.program_settings%ROWTYPE; selected boolean; pref jsonb; split jsonb;
 count_value integer; before_value integer; new_revision bigint; forwarded jsonb; old_guard text; actual jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id WHERE u.user_id=p_actor AND r.key IN ('admin','production'))
  THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
 selected:=(p_operation='EDIT' AND p_payload ? 'mainFlowPreference')
  OR (p_operation='RESTORE' AND p_payload->>'capability'='BLOCK_COUNT_POLICY')
  OR (p_operation='REFRESH' AND p_payload->'capabilities' ? 'BLOCK_COUNT_POLICY');
 forwarded:=p_payload-'mainFlowPreference';
 IF selected AND NOT (p_operation='REFRESH' AND p.main_preference_source='LEGACY_BACKFILL' AND p_payload->>'legacyTreatment' IS DISTINCT FROM 'ADOPT_GENERAL_AS_INHERITED') THEN
  count_value:=p.main_preferred_block_count; before_value:=p.main_before_meal_blocks;
  IF p_operation='EDIT' THEN
   pref:=p_payload#>'{mainFlowPreference,blockCountPolicy}'; split:=p_payload#>'{mainFlowPreference,mealSplitPreference}';
   IF pref->>'mode'='AUTO_MIN_FEASIBLE' AND split->>'mode'='OFF' THEN count_value:=NULL; before_value:=NULL;
   ELSIF pref->>'mode'='SOFT_PREFER_N' THEN
    count_value:=(pref->>'count')::integer;
    IF count_value IS NULL OR count_value<=0 THEN RAISE EXCEPTION 'INVALID_MAIN_PREFERENCE'; END IF;
    IF split->>'mode'='OFF' THEN before_value:=NULL;
    ELSIF split->>'mode'='PREFERRED' THEN
     before_value:=(split->>'beforeMealBlocks')::integer;
     IF before_value IS NULL OR before_value<0 OR before_value>count_value OR (split->>'afterMealBlocks')::integer IS DISTINCT FROM count_value-before_value THEN RAISE EXCEPTION 'INVALID_MAIN_PREFERENCE'; END IF;
    ELSE RAISE EXCEPTION 'INVALID_MAIN_PREFERENCE'; END IF;
   ELSE RAISE EXCEPTION 'INVALID_MAIN_PREFERENCE'; END IF;
  ELSIF p_operation='RESTORE' THEN
   IF p.main_preference_source<>'DAY_OVERRIDE' THEN RAISE EXCEPTION 'MAIN_PREFERENCE_RESTORE_NOT_AVAILABLE'; END IF;
   count_value:=p.main_baseline_preferred_block_count; before_value:=p.main_baseline_before_meal_blocks;
  ELSE
   SELECT * INTO g FROM public.program_settings WHERE id=1 FOR SHARE;
   IF p_payload->'mainPreferenceBaseline' IS DISTINCT FROM jsonb_build_object(
    'blockCountPolicy',CASE WHEN g.main_preferred_block_count IS NULL THEN jsonb_build_object('mode','AUTO_MIN_FEASIBLE') ELSE jsonb_build_object('mode','SOFT_PREFER_N','count',g.main_preferred_block_count) END,
    'mealSplitPreference',CASE WHEN g.main_before_meal_blocks IS NULL THEN jsonb_build_object('mode','OFF') ELSE jsonb_build_object('mode','PREFERRED','beforeMealBlocks',g.main_before_meal_blocks,'afterMealBlocks',g.main_preferred_block_count-g.main_before_meal_blocks) END)
    THEN RAISE EXCEPTION 'STALE_MAIN_PREFERENCE_BASELINE'; END IF;
   IF p.main_preference_source<>'DAY_OVERRIDE' THEN count_value:=g.main_preferred_block_count; before_value:=g.main_before_meal_blocks; END IF;
  END IF;
  old_guard:=current_setting('optiplan.main_preference_operation',true);
  PERFORM set_config('optiplan.main_preference_operation','versioned',true);
  UPDATE public.plans SET main_preferred_block_count=count_value,main_before_meal_blocks=before_value,
   main_baseline_preferred_block_count=CASE WHEN p_operation='REFRESH' THEN g.main_preferred_block_count ELSE main_baseline_preferred_block_count END,
   main_baseline_before_meal_blocks=CASE WHEN p_operation='REFRESH' THEN g.main_before_meal_blocks ELSE main_baseline_before_meal_blocks END,
   main_preference_source=CASE WHEN p_operation='EDIT' THEN 'DAY_OVERRIDE' WHEN p_operation='RESTORE' OR main_preference_source<>'DAY_OVERRIDE' THEN 'INHERITED' ELSE main_preference_source END,
   main_preference_override_by=CASE WHEN p_operation='EDIT' THEN p_actor WHEN p_operation='REFRESH' AND main_preference_source='DAY_OVERRIDE' THEN main_preference_override_by ELSE NULL END,
   main_preference_override_at=CASE WHEN p_operation='EDIT' THEN now() WHEN p_operation='REFRESH' AND main_preference_source='DAY_OVERRIDE' THEN main_preference_override_at ELSE NULL END
  WHERE id=p_plan_id;
  PERFORM set_config('optiplan.main_preference_operation',coalesce(old_guard,''),true);
 END IF;
 -- Cross-check durable replay against the actual effective preference, even for
 -- edits of another category. AUTO uses the historical absent representation.
 actual:=p_candidate_replay#>'{authorities,plan_workday,0,plannerNextAuthorities,plannerNext,mainFlow,preference}';
 IF NOT selected OR (p_operation='REFRESH' AND p.main_preference_source='LEGACY_BACKFILL' AND p_payload->>'legacyTreatment' IS DISTINCT FROM 'ADOPT_GENERAL_AS_INHERITED') THEN count_value:=p.main_preferred_block_count;before_value:=p.main_before_meal_blocks; END IF;
 IF NOT selected THEN before_value:=p.main_before_meal_blocks; END IF;
 IF count_value IS NULL THEN
  IF actual IS NOT NULL THEN RAISE EXCEPTION 'STALE_MAIN_PREFERENCE_CANDIDATE'; END IF;
 ELSE
  IF actual IS DISTINCT FROM jsonb_build_object('blockCountPolicy',jsonb_build_object('mode','SOFT_PREFER_N','count',count_value),
    'mealSplitPreference',CASE WHEN before_value IS NULL THEN jsonb_build_object('mode','OFF') ELSE jsonb_build_object('mode','PREFERRED','beforeMealBlocks',before_value,'afterMealBlocks',count_value-before_value) END)
   THEN RAISE EXCEPTION 'STALE_MAIN_PREFERENCE_CANDIDATE'; END IF;
 END IF;
 IF p_operation='REFRESH' THEN forwarded:=jsonb_set(forwarded,'{capabilities}',coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(forwarded->'capabilities') WHERE value<>'"BLOCK_COUNT_POLICY"'::jsonb),'[]'::jsonb)); END IF;
 new_revision:=public.apply_day_config_operation_v2(p_plan_id,p_actor,p_operation,forwarded,p_expected_revision,p_expected_identity,p_expected_replay,p_candidate_identity,p_candidate_replay,p_diff);
 RETURN new_revision;
END $$;
REVOKE ALL ON FUNCTION public.apply_day_config_operation_v3(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_day_config_operation_v3(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
