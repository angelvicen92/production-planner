ALTER TABLE public.program_settings
  ADD COLUMN IF NOT EXISTS default_participant_transition_minutes INTEGER NOT NULL DEFAULT 5
  CHECK (default_participant_transition_minutes >= 0);

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS participant_transition_minutes INTEGER NOT NULL DEFAULT 5 CHECK (participant_transition_minutes >= 0),
  ADD COLUMN IF NOT EXISTS participant_transition_baseline_minutes INTEGER NOT NULL DEFAULT 5 CHECK (participant_transition_baseline_minutes >= 0),
  ADD COLUMN IF NOT EXISTS participant_transition_config_source TEXT NOT NULL DEFAULT 'LEGACY_BACKFILL'
    CHECK (participant_transition_config_source IN ('INHERITED','DAY_OVERRIDE','LEGACY_BACKFILL')),
  ADD COLUMN IF NOT EXISTS participant_transition_override_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS participant_transition_override_at TIMESTAMPTZ;
ALTER TABLE public.plans ADD CONSTRAINT plans_participant_transition_provenance_check CHECK (
  (participant_transition_config_source='INHERITED' AND participant_transition_minutes=participant_transition_baseline_minutes AND participant_transition_override_by IS NULL AND participant_transition_override_at IS NULL)
  OR (participant_transition_config_source='DAY_OVERRIDE' AND participant_transition_override_by IS NOT NULL AND participant_transition_override_at IS NOT NULL)
  OR (participant_transition_config_source='LEGACY_BACKFILL' AND participant_transition_override_by IS NULL AND participant_transition_override_at IS NULL)
) NOT VALID;
ALTER TABLE public.plans VALIDATE CONSTRAINT plans_participant_transition_provenance_check;

ALTER TABLE public.task_templates
  ADD COLUMN IF NOT EXISTS participant_margin_before_minutes INTEGER CHECK (participant_margin_before_minutes >= 0),
  ADD COLUMN IF NOT EXISTS participant_margin_after_minutes INTEGER CHECK (participant_margin_after_minutes >= 0);

ALTER TABLE public.daily_tasks
  ADD COLUMN IF NOT EXISTS participant_margin_before_minutes INTEGER CHECK (participant_margin_before_minutes >= 0),
  ADD COLUMN IF NOT EXISTS participant_margin_after_minutes INTEGER CHECK (participant_margin_after_minutes >= 0);

ALTER TABLE public.plan_task_template_snapshots
  ADD COLUMN IF NOT EXISTS participant_margin_before_minutes INTEGER CHECK (participant_margin_before_minutes >= 0),
  ADD COLUMN IF NOT EXISTS participant_margin_after_minutes INTEGER CHECK (participant_margin_after_minutes >= 0);

ALTER TABLE public.plan_task_template_snapshots DROP CONSTRAINT IF EXISTS plan_task_template_snapshots_contract_version_check;
UPDATE public.plan_task_template_snapshots SET contract_version = 2 WHERE contract_version = 1;
ALTER TABLE public.plan_task_template_snapshots ALTER COLUMN contract_version SET DEFAULT 2;
ALTER TABLE public.plan_task_template_snapshots ADD CONSTRAINT plan_task_template_snapshots_contract_version_check CHECK (contract_version = 2);

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
      WHERE id=parent_revision AND plan_id=p_plan_id FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.initialize_day_config_revision(
  p_plan_id integer, p_actor uuid, p_identity jsonb, p_replay jsonb, p_diff jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p public.plans%ROWTYPE; new_revision bigint;
BEGIN
  SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  IF p.current_config_revision_id IS NOT NULL THEN RAISE EXCEPTION 'CONFIG_REVISION_ALREADY_INITIALIZED'; END IF;
  IF p_identity->>'contractVersion'<>'1' OR (p_identity->>'planId')::integer<>p_plan_id
    OR p_identity->>'configurationFingerprint' IS NULL OR p_replay->>'contractVersion'<>'1'
    THEN RAISE EXCEPTION 'INVALID_CONFIG_REVISION_CONTRACT'; END IF;
  INSERT INTO public.plan_config_revisions(plan_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json,created_by)
  VALUES(p_plan_id,'DAY_CREATED',p_identity->>'configurationFingerprint',p_identity,p_replay,p_diff,p_actor)
  RETURNING id INTO new_revision;
  UPDATE public.plans SET current_config_revision_id=new_revision WHERE id=p_plan_id;
  RETURN new_revision;
END $$;

REVOKE ALL ON FUNCTION public.apply_day_config_operation(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb),
  public.initialize_day_config_revision(integer,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_day_config_operation(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb),
  public.initialize_day_config_revision(integer,uuid,jsonb,jsonb,jsonb) TO service_role;

-- Re-project config refresh losslessly under snapshot contract v2.
CREATE OR REPLACE FUNCTION public.assisted_apply_config_refresh(
  p_plan_id INTEGER, p_user_id UUID, p_expected_revision BIGINT,
  p_identity JSONB, p_replay JSONB, p_diff JSONB
) RETURNS BIGINT LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s public.assisted_planning_sessions%ROWTYPE; new_revision BIGINT; item JSONB; optimizer JSONB; affected_rows INTEGER;
BEGIN
  SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF s.current_config_revision_id<>p_expected_revision THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  IF p_identity->>'configurationFingerprint'=(SELECT fingerprint FROM public.plan_config_revisions WHERE id=p_expected_revision) THEN RAISE EXCEPTION 'NO_CHANGES'; END IF;
  IF jsonb_typeof(p_replay->'taskTemplateSnapshots') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_replay->'optimizerSnapshot') IS DISTINCT FROM 'object'
     OR p_identity->>'configurationFingerprint' IS NULL THEN RAISE EXCEPTION 'INVALID_REFRESH_REPLAY'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_replay->'taskTemplateSnapshots') x
             GROUP BY (x->>'sourceTemplateId')::int HAVING count(*)<>1) THEN RAISE EXCEPTION 'INVALID_REFRESH_REPLAY'; END IF;

  -- Replace only the versioned daily catalogs represented by the replay. No
  -- placements, daily_tasks, stages, validations or accepted exceptions are updated.
  FOR item IN SELECT * FROM jsonb_array_elements(p_replay->'taskTemplateSnapshots') LOOP
    INSERT INTO public.plan_task_template_snapshots(plan_id,source_template_id,contract_version,source,template_name,default_duration,default_cameras,default_zone_id,default_space_id,auto_create_on_contestant_create,requires_auxiliar,requires_coach,requires_presenter,exclusive_auxiliar,has_dependency,dependency_template_ids,resource_requirements,itinerant_team_requirement,itinerant_team_id,allowed_itinerant_team_ids,setup_id,participant_margin_before_minutes,participant_margin_after_minutes)
    VALUES(p_plan_id,(item->>'sourceTemplateId')::int,2,item->>'source',item->>'templateName',(item->>'defaultDuration')::int,(item->>'defaultCameras')::int,(item->>'defaultZoneId')::int,(item->>'defaultSpaceId')::int,(item->>'autoCreateOnContestantCreate')::bool,(item->>'requiresAuxiliar')::bool,(item->>'requiresCoach')::bool,(item->>'requiresPresenter')::bool,(item->>'exclusiveAuxiliar')::bool,(item->>'hasDependency')::bool,item->'dependencyTemplateIds',NULLIF(item->'resourceRequirements','null'::jsonb),item->>'itinerantTeamRequirement',(item->>'itinerantTeamId')::int,item->'allowedItinerantTeamIds',(item->>'setupId')::int,(item->>'participantMarginBeforeMinutes')::int,(item->>'participantMarginAfterMinutes')::int)
    ON CONFLICT(plan_id,source_template_id) DO UPDATE SET source=EXCLUDED.source,template_name=EXCLUDED.template_name,default_duration=EXCLUDED.default_duration,default_cameras=EXCLUDED.default_cameras,default_zone_id=EXCLUDED.default_zone_id,default_space_id=EXCLUDED.default_space_id,auto_create_on_contestant_create=EXCLUDED.auto_create_on_contestant_create,requires_auxiliar=EXCLUDED.requires_auxiliar,requires_coach=EXCLUDED.requires_coach,requires_presenter=EXCLUDED.requires_presenter,exclusive_auxiliar=EXCLUDED.exclusive_auxiliar,has_dependency=EXCLUDED.has_dependency,dependency_template_ids=EXCLUDED.dependency_template_ids,resource_requirements=EXCLUDED.resource_requirements,itinerant_team_requirement=EXCLUDED.itinerant_team_requirement,itinerant_team_id=EXCLUDED.itinerant_team_id,allowed_itinerant_team_ids=EXCLUDED.allowed_itinerant_team_ids,setup_id=EXCLUDED.setup_id,participant_margin_before_minutes=EXCLUDED.participant_margin_before_minutes,participant_margin_after_minutes=EXCLUDED.participant_margin_after_minutes;
  END LOOP;
  optimizer:=p_replay->'optimizerSnapshot';
  UPDATE public.plan_optimizer_snapshots SET source=optimizer->>'source',editing_mode=optimizer->>'editingMode',main_zone_id=(optimizer->>'mainZoneId')::int,arrival_plan_template_snapshot_id=(optimizer#>>'{transport,arrivalPlanTemplateSnapshotId}')::bigint,departure_plan_template_snapshot_id=(optimizer#>>'{transport,departurePlanTemplateSnapshotId}')::bigint,arrival_grouping_target=(optimizer#>>'{transport,arrivalGroupingTarget}')::int,departure_grouping_target=(optimizer#>>'{transport,departureGroupingTarget}')::int,arrival_min_gap_minutes=(optimizer#>>'{transport,arrivalMinGapMinutes}')::int,departure_min_gap_minutes=(optimizer#>>'{transport,departureMinGapMinutes}')::int,van_capacity=(optimizer#>>'{transport,vanCapacity}')::int,grouping_weight=(optimizer#>>'{transport,groupingWeight}')::int,near_hard_breaks_max=(optimizer->>'nearHardBreaksMax')::int,updated_by=p_user_id,updated_at=now() WHERE plan_id=p_plan_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows<>1 THEN RAISE EXCEPTION 'REFRESH_REPLAY_NOT_MATERIALIZED'; END IF;
  DELETE FROM public.plan_optimizer_snapshot_heuristics h USING public.plan_optimizer_snapshots o WHERE h.snapshot_id=o.id AND o.plan_id=p_plan_id;
  INSERT INTO public.plan_optimizer_snapshot_heuristics(snapshot_id,heuristic_key,basic_level,advanced_value)
    SELECT o.id,h.key,(h.value->>'basicLevel')::int,(h.value->>'advancedValue')::int FROM public.plan_optimizer_snapshots o,jsonb_each(optimizer->'heuristics') h WHERE o.plan_id=p_plan_id;
  DELETE FROM public.plan_optimizer_snapshot_grouping_zones g USING public.plan_optimizer_snapshots o WHERE g.snapshot_id=o.id AND o.plan_id=p_plan_id;
  INSERT INTO public.plan_optimizer_snapshot_grouping_zones(snapshot_id,zone_id)
    SELECT o.id,(z#>>'{}')::int FROM public.plan_optimizer_snapshots o,jsonb_array_elements(optimizer->'groupingZoneIds') z WHERE o.plan_id=p_plan_id;
  DELETE FROM public.plan_task_template_snapshots t WHERE t.plan_id=p_plan_id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_replay->'taskTemplateSnapshots') x WHERE (x->>'sourceTemplateId')::int=t.source_template_id);

  -- Do not persist a revision whose replay differs from the rows actually
  -- materialized. The transaction aborts atomically on any lossy projection.
  IF (SELECT count(*) FROM public.plan_task_template_snapshots WHERE plan_id=p_plan_id)
       <> jsonb_array_length(p_replay->'taskTemplateSnapshots')
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_replay->'taskTemplateSnapshots') x
       LEFT JOIN public.plan_task_template_snapshots t ON t.plan_id=p_plan_id AND t.source_template_id=(x->>'sourceTemplateId')::int
       WHERE t.id IS NULL OR t.source IS DISTINCT FROM x->>'source'
          OR t.template_name IS DISTINCT FROM x->>'templateName'
          OR t.default_duration IS DISTINCT FROM (x->>'defaultDuration')::int
          OR t.default_cameras IS DISTINCT FROM (x->>'defaultCameras')::int
          OR t.default_zone_id IS DISTINCT FROM (x->>'defaultZoneId')::int
          OR t.default_space_id IS DISTINCT FROM (x->>'defaultSpaceId')::int
          OR t.auto_create_on_contestant_create IS DISTINCT FROM (x->>'autoCreateOnContestantCreate')::bool
          OR t.requires_auxiliar IS DISTINCT FROM (x->>'requiresAuxiliar')::bool
          OR t.requires_coach IS DISTINCT FROM (x->>'requiresCoach')::bool
          OR t.requires_presenter IS DISTINCT FROM (x->>'requiresPresenter')::bool
          OR t.exclusive_auxiliar IS DISTINCT FROM (x->>'exclusiveAuxiliar')::bool
          OR t.has_dependency IS DISTINCT FROM (x->>'hasDependency')::bool
          OR (SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb) FROM jsonb_array_elements(t.dependency_template_ids) v)
             IS DISTINCT FROM (SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb) FROM jsonb_array_elements(x->'dependencyTemplateIds') v)
          OR t.resource_requirements IS DISTINCT FROM NULLIF(x->'resourceRequirements','null'::jsonb)
          OR t.itinerant_team_requirement IS DISTINCT FROM x->>'itinerantTeamRequirement'
          OR t.itinerant_team_id IS DISTINCT FROM (x->>'itinerantTeamId')::int
          OR (SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb) FROM jsonb_array_elements(t.allowed_itinerant_team_ids) v)
             IS DISTINCT FROM (SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb) FROM jsonb_array_elements(x->'allowedItinerantTeamIds') v)
          OR t.setup_id IS DISTINCT FROM (x->>'setupId')::int
          OR t.participant_margin_before_minutes IS DISTINCT FROM (x->>'participantMarginBeforeMinutes')::int
          OR t.participant_margin_after_minutes IS DISTINCT FROM (x->>'participantMarginAfterMinutes')::int
     ) THEN RAISE EXCEPTION 'REFRESH_REPLAY_NOT_MATERIALIZED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plan_optimizer_snapshots o WHERE o.plan_id=p_plan_id
       AND o.source IS NOT DISTINCT FROM optimizer->>'source'
       AND o.editing_mode IS NOT DISTINCT FROM optimizer->>'editingMode'
       AND o.main_zone_id IS NOT DISTINCT FROM (optimizer->>'mainZoneId')::int
       AND o.arrival_plan_template_snapshot_id IS NOT DISTINCT FROM (optimizer#>>'{transport,arrivalPlanTemplateSnapshotId}')::bigint
       AND o.departure_plan_template_snapshot_id IS NOT DISTINCT FROM (optimizer#>>'{transport,departurePlanTemplateSnapshotId}')::bigint
       AND o.arrival_grouping_target IS NOT DISTINCT FROM (optimizer#>>'{transport,arrivalGroupingTarget}')::int
       AND o.departure_grouping_target IS NOT DISTINCT FROM (optimizer#>>'{transport,departureGroupingTarget}')::int
       AND o.arrival_min_gap_minutes IS NOT DISTINCT FROM (optimizer#>>'{transport,arrivalMinGapMinutes}')::int
       AND o.departure_min_gap_minutes IS NOT DISTINCT FROM (optimizer#>>'{transport,departureMinGapMinutes}')::int
       AND o.van_capacity IS NOT DISTINCT FROM (optimizer#>>'{transport,vanCapacity}')::int
       AND o.grouping_weight IS NOT DISTINCT FROM (optimizer#>>'{transport,groupingWeight}')::int
       AND o.near_hard_breaks_max IS NOT DISTINCT FROM (optimizer->>'nearHardBreaksMax')::int
       AND (SELECT count(*) FROM public.plan_optimizer_snapshot_heuristics h WHERE h.snapshot_id=o.id)=jsonb_object_length(optimizer->'heuristics')
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_each(optimizer->'heuristics') expected
         LEFT JOIN public.plan_optimizer_snapshot_heuristics actual ON actual.snapshot_id=o.id AND actual.heuristic_key=expected.key
         WHERE actual.heuristic_key IS NULL
            OR actual.basic_level IS DISTINCT FROM (expected.value->>'basicLevel')::int
            OR actual.advanced_value IS DISTINCT FROM (expected.value->>'advancedValue')::int
       )
       AND (SELECT COALESCE(jsonb_agg(g.zone_id ORDER BY g.zone_id),'[]'::jsonb) FROM public.plan_optimizer_snapshot_grouping_zones g WHERE g.snapshot_id=o.id)
           IS NOT DISTINCT FROM (SELECT COALESCE(jsonb_agg((z#>>'{}')::int ORDER BY (z#>>'{}')::int),'[]'::jsonb) FROM jsonb_array_elements(optimizer->'groupingZoneIds') z))
     THEN RAISE EXCEPTION 'REFRESH_REPLAY_NOT_MATERIALIZED'; END IF;

  INSERT INTO public.plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json,created_by)
  VALUES(p_plan_id,p_expected_revision,'GENERAL_REFRESH',p_identity->>'configurationFingerprint',p_identity,p_replay,p_diff,p_user_id) RETURNING id INTO new_revision;
  UPDATE public.assisted_planning_sessions SET current_config_revision_id=new_revision,draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
  RETURN new_revision;
END $$;
REVOKE ALL ON FUNCTION public.assisted_apply_config_refresh(INTEGER,UUID,BIGINT,JSONB,JSONB,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assisted_apply_config_refresh(INTEGER,UUID,BIGINT,JSONB,JSONB,JSONB) TO service_role;
