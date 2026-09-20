-- Fuente 04 v2.4: lossless provenance for the workday and global meal.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

-- Historical intent is unknowable: preserve the effective values and say so.
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

CREATE OR REPLACE FUNCTION public.record_day_config_revision(p_plan_id integer,p_actor uuid,p_source text,p_diff jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p public.plans%ROWTYPE; revision_id bigint; identity jsonb; replay jsonb; fingerprint text;
BEGIN
  SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  replay:=jsonb_build_object('contractVersion',1,'workday',jsonb_build_object('effective',jsonb_build_object('start',p.work_start,'end',p.work_end),'baseline',jsonb_build_object('start',p.work_baseline_start,'end',p.work_baseline_end),'source',p.work_config_source),'meal',jsonb_build_object('effective',jsonb_build_object('start',p.meal_start,'end',p.meal_end,'mode',p.meal_mode),'baseline',jsonb_build_object('start',p.meal_baseline_start,'end',p.meal_baseline_end,'mode',p.meal_baseline_mode),'source',p.meal_config_source));
  fingerprint:=encode(digest(replay::text,'sha256'),'hex');
  identity:=jsonb_build_object('configurationFingerprint',fingerprint,'dayConfigurationFingerprint',fingerprint);
  INSERT INTO public.plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json,created_by)
  VALUES(p_plan_id,p.current_config_revision_id,p_source,fingerprint,identity,replay,p_diff,p_actor) RETURNING id INTO revision_id;
  UPDATE public.plans SET current_config_revision_id=revision_id WHERE id=p_plan_id;
  UPDATE public.assisted_planning_sessions SET current_config_revision_id=revision_id,draft_validation_id=NULL,updated_at=now() WHERE plan_id=p_plan_id AND status='ACTIVE';
  RETURN revision_id;
END $$;

INSERT INTO public.plan_config_revisions(plan_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json)
SELECT p.id,'LEGACY_BACKFILL',encode(digest((jsonb_build_object('workday',jsonb_build_object('effective',jsonb_build_object('start',p.work_start,'end',p.work_end),'baseline',jsonb_build_object('start',p.work_baseline_start,'end',p.work_baseline_end),'source',p.work_config_source),'meal',jsonb_build_object('effective',jsonb_build_object('start',p.meal_start,'end',p.meal_end,'mode',p.meal_mode),'baseline',jsonb_build_object('start',p.meal_baseline_start,'end',p.meal_baseline_end,'mode',p.meal_baseline_mode),'source',p.meal_config_source)))::text,'sha256'),'hex'),
jsonb_build_object('configurationFingerprint',encode(digest((jsonb_build_object('planId',p.id,'legacy',true))::text,'sha256'),'hex')),
jsonb_build_object('contractVersion',1,'legacyBackfill',true),jsonb_build_object('reason','migration-084') FROM public.plans p;
UPDATE public.plans p SET current_config_revision_id=r.id FROM LATERAL (SELECT id FROM public.plan_config_revisions WHERE plan_id=p.id ORDER BY id DESC LIMIT 1) r;
ALTER TABLE public.plans ADD CONSTRAINT plans_current_config_revision_fk FOREIGN KEY(current_config_revision_id, id) REFERENCES public.plan_config_revisions(id, plan_id);

CREATE OR REPLACE FUNCTION public.apply_day_config_operation(p_plan_id integer,p_actor uuid,p_operation text,p_payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p public.plans%ROWTYPE; g public.program_settings%ROWTYPE; cap text; old_start text; old_end text;
BEGIN
  SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  old_start:=p.work_start; old_end:=p.work_end;
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
    IF p_payload->'capabilities' ? 'WORKDAY_WINDOW' THEN
      IF p.work_config_source<>'LEGACY_BACKFILL' OR p_payload->>'legacyTreatment'='ADOPT_GENERAL_AS_INHERITED' THEN
        UPDATE public.plans SET work_baseline_start=g.default_work_start,work_baseline_end=g.default_work_end,
          work_start=CASE WHEN p.work_config_source='DAY_OVERRIDE' THEN work_start ELSE g.default_work_start END,
          work_end=CASE WHEN p.work_config_source='DAY_OVERRIDE' THEN work_end ELSE g.default_work_end END,
          work_config_source=CASE WHEN p.work_config_source='LEGACY_BACKFILL' THEN 'INHERITED' ELSE p.work_config_source END,
          work_override_by=CASE WHEN p.work_config_source='DAY_OVERRIDE' THEN work_override_by ELSE NULL END,
          work_override_at=CASE WHEN p.work_config_source='DAY_OVERRIDE' THEN work_override_at ELSE NULL END WHERE id=p_plan_id;
      END IF;
    END IF;
    IF p_payload->'capabilities' ? 'GLOBAL_MEAL_BREAK' THEN
      IF p.meal_config_source<>'LEGACY_BACKFILL' OR p_payload->>'legacyTreatment'='ADOPT_GENERAL_AS_INHERITED' THEN
        UPDATE public.plans SET meal_baseline_start=g.meal_start,meal_baseline_end=g.meal_end,meal_baseline_mode=g.meal_mode,
          meal_start=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_start ELSE g.meal_start END,
          meal_end=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_end ELSE g.meal_end END,
          meal_mode=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_mode ELSE g.meal_mode END,
          meal_config_source=CASE WHEN p.meal_config_source='LEGACY_BACKFILL' THEN 'INHERITED' ELSE p.meal_config_source END,
          meal_override_by=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_override_by ELSE NULL END,
          meal_override_at=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_override_at ELSE NULL END WHERE id=p_plan_id;
      END IF;
    END IF;
  ELSE RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
  -- Descendants that still inherited the old effective boundary follow it;
  -- protected task placements and locks are deliberately untouched.
  UPDATE public.contestants c SET availability_start=n.work_start FROM public.plans n WHERE n.id=p_plan_id AND c.plan_id=p_plan_id AND c.availability_start=old_start;
  UPDATE public.contestants c SET availability_end=n.work_end FROM public.plans n WHERE n.id=p_plan_id AND c.plan_id=p_plan_id AND c.availability_end=old_end;
  RETURN public.record_day_config_revision(p_plan_id,p_actor,p_operation,p_payload);
END $$;

REVOKE ALL ON FUNCTION public.record_day_config_revision(integer,uuid,text,jsonb), public.apply_day_config_operation(integer,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_day_config_revision(integer,uuid,text,jsonb), public.apply_day_config_operation(integer,uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.initialize_day_config_revision() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  PERFORM public.record_day_config_revision(NEW.id,COALESCE(NEW.work_override_by,NEW.meal_override_by),'DAY_CREATED',jsonb_build_object('workdaySource',NEW.work_config_source,'mealSource',NEW.meal_config_source));
  RETURN NEW;
END $$;
CREATE TRIGGER plans_initialize_day_config_revision AFTER INSERT ON public.plans FOR EACH ROW EXECUTE FUNCTION public.initialize_day_config_revision();
