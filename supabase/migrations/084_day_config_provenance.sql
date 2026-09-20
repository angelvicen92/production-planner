-- Fuente 04 v2.4: lossless provenance for the workday and global meal.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.plans
  ADD COLUMN work_baseline_start text,
  ADD COLUMN work_baseline_end text,
  ADD COLUMN work_config_source text,
  ADD COLUMN work_override_by uuid,
  ADD COLUMN work_override_at timestamptz,
  ADD COLUMN meal_baseline_start text,
  ADD COLUMN meal_baseline_end text,
  ADD COLUMN meal_baseline_mode text,
  ADD COLUMN meal_config_source text,
  ADD COLUMN meal_override_by uuid,
  ADD COLUMN meal_override_at timestamptz,
  ADD COLUMN current_config_revision_id bigint;

-- Historical intent is unknowable. Preserve effective values, but do not invent
-- a partial plan_config_revision: the application canonically materializes it
-- from every effective daily authority on first access/mutation.
UPDATE public.plans SET
  work_baseline_start=work_start, work_baseline_end=work_end, work_config_source='LEGACY_BACKFILL',
  meal_baseline_start=meal_start, meal_baseline_end=meal_end, meal_baseline_mode=meal_mode,
  meal_config_source='LEGACY_BACKFILL';

ALTER TABLE public.plans
  ALTER COLUMN work_baseline_start SET NOT NULL,
  ALTER COLUMN work_baseline_end SET NOT NULL,
  ALTER COLUMN work_config_source SET NOT NULL,
  ALTER COLUMN meal_baseline_start SET NOT NULL,
  ALTER COLUMN meal_baseline_end SET NOT NULL,
  ALTER COLUMN meal_baseline_mode SET NOT NULL,
  ALTER COLUMN meal_config_source SET NOT NULL,
  ADD CONSTRAINT plans_work_config_source_check CHECK (work_config_source IN ('INHERITED','DAY_OVERRIDE','LEGACY_BACKFILL')),
  ADD CONSTRAINT plans_meal_config_source_check CHECK (meal_config_source IN ('INHERITED','DAY_OVERRIDE','LEGACY_BACKFILL')),
  ADD CONSTRAINT plans_work_baseline_format_check CHECK (work_baseline_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND work_baseline_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND work_baseline_start < work_baseline_end),
  ADD CONSTRAINT plans_meal_baseline_format_check CHECK (meal_baseline_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND meal_baseline_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND meal_baseline_start < meal_baseline_end),
  ADD CONSTRAINT plans_meal_baseline_mode_check CHECK (meal_baseline_mode IN ('global_hard_break','flexible_meal_window')),
  ADD CONSTRAINT plans_work_override_metadata_check CHECK ((work_config_source='DAY_OVERRIDE') = (work_override_by IS NOT NULL AND work_override_at IS NOT NULL)),
  ADD CONSTRAINT plans_meal_override_metadata_check CHECK ((meal_config_source='DAY_OVERRIDE') = (meal_override_by IS NOT NULL AND meal_override_at IS NOT NULL)),
  ADD CONSTRAINT plans_work_inherited_value_check CHECK (work_config_source<>'INHERITED' OR (work_start=work_baseline_start AND work_end=work_baseline_end)),
  ADD CONSTRAINT plans_meal_inherited_value_check CHECK (meal_config_source<>'INHERITED' OR (meal_start=meal_baseline_start AND meal_end=meal_baseline_end AND meal_mode=meal_baseline_mode));

ALTER TABLE public.plans ADD CONSTRAINT plans_current_config_revision_fk
  FOREIGN KEY(current_config_revision_id, id) REFERENCES public.plan_config_revisions(id, plan_id);

-- Identity/replay are the existing complete v1 contracts. The server builds
-- them from buildEngineInput; SQL only validates and atomically switches them.
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
  ELSIF p_operation='RESTORE' THEN
    cap:=p_payload->>'capability';
    IF cap='WORKDAY_WINDOW' THEN UPDATE public.plans SET work_start=work_baseline_start,work_end=work_baseline_end,work_config_source='INHERITED',work_override_by=NULL,work_override_at=NULL WHERE id=p_plan_id;
    ELSIF cap='GLOBAL_MEAL_BREAK' THEN UPDATE public.plans SET meal_start=meal_baseline_start,meal_end=meal_baseline_end,meal_mode=meal_baseline_mode,meal_config_source='INHERITED',meal_override_by=NULL,meal_override_at=NULL WHERE id=p_plan_id;
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
  ELSE RAISE EXCEPTION 'INVALID_OPERATION'; END IF;

  -- Re-lock/read after mutation and reject a server candidate built for any
  -- different effective workday/meal state. Contestant values are never inferred.
  SELECT * INTO p FROM public.plans WHERE id=p_plan_id;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_candidate_replay#>'{authorities,plan_workday}') w
    WHERE w#>>'{workDay,start}'=p.work_start AND w#>>'{workDay,end}'=p.work_end
      AND w->>'mealMode'=p.meal_mode
      AND (w#>>'{mealWindow,start}'=p.meal_start OR w#>>'{meal,start}'=p.meal_start)
      AND (w#>>'{mealWindow,end}'=p.meal_end OR w#>>'{meal,end}'=p.meal_end))
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
