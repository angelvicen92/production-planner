-- OPTIMIZATION: stable inherited baseline and atomic daily edit/restore/refresh.
ALTER TABLE public.plan_optimizer_snapshots
  ADD COLUMN baseline_snapshot jsonb,
  ADD COLUMN override_by uuid,
  ADD COLUMN override_at timestamptz,
  ADD CONSTRAINT plan_optimizer_snapshots_baseline_shape_check CHECK (
    baseline_snapshot IS NULL OR (
      baseline_snapshot->>'contractVersion'='1'
      AND baseline_snapshot->>'source'='INHERITED'
      AND jsonb_typeof(baseline_snapshot->'heuristics')='object'
      AND jsonb_typeof(baseline_snapshot->'groupingZoneIds')='array'
      AND jsonb_typeof(baseline_snapshot->'transport')='object'
    )
  ),
  ADD CONSTRAINT plan_optimizer_snapshots_override_metadata_check CHECK (
    (source='DAY_OVERRIDE')=(override_by IS NOT NULL AND override_at IS NOT NULL)
  ) NOT VALID,
  ADD CONSTRAINT plan_optimizer_snapshots_inherited_baseline_check CHECK (
    source<>'INHERITED' OR baseline_snapshot IS NOT NULL
  ) NOT VALID;

-- Historical optimizer intent cannot be reconstructed. Keep LEGACY_BACKFILL and
-- a NULL baseline instead of claiming that its effective value was inherited.
UPDATE public.plan_optimizer_snapshots
SET source='LEGACY_BACKFILL', override_by=NULL, override_at=NULL
WHERE baseline_snapshot IS NULL;

ALTER TABLE public.plan_optimizer_snapshots
  VALIDATE CONSTRAINT plan_optimizer_snapshots_override_metadata_check,
  VALIDATE CONSTRAINT plan_optimizer_snapshots_inherited_baseline_check;

CREATE OR REPLACE FUNCTION public.optimizer_snapshot_provenance_metadata()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.source='DAY_OVERRIDE' THEN
    NEW.override_by:=COALESCE(NEW.override_by,NEW.updated_by);
    NEW.override_at:=COALESCE(NEW.override_at,now());
  ELSE NEW.override_by:=NULL; NEW.override_at:=NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER optimizer_snapshot_provenance_metadata
BEFORE INSERT OR UPDATE ON public.plan_optimizer_snapshots
FOR EACH ROW EXECUTE FUNCTION public.optimizer_snapshot_provenance_metadata();

-- The pre-existing Assisted refresh RPC carries its validated General candidate
-- in the complete revision diff. Preserve a local override as effective while
-- advancing only its inherited baseline.
CREATE OR REPLACE FUNCTION public.optimizer_baseline_from_assisted_refresh()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.source='GENERAL_REFRESH' AND jsonb_typeof(NEW.diff_json->'optimizerBaseline')='object' THEN
    UPDATE public.plan_optimizer_snapshots SET baseline_snapshot=NEW.diff_json->'optimizerBaseline'
    WHERE plan_id=NEW.plan_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER optimizer_baseline_from_assisted_refresh
AFTER INSERT ON public.plan_config_revisions
FOR EACH ROW EXECUTE FUNCTION public.optimizer_baseline_from_assisted_refresh();
REVOKE ALL ON FUNCTION public.optimizer_snapshot_provenance_metadata(), public.optimizer_baseline_from_assisted_refresh() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_day_config_operation_v2(
  p_plan_id integer, p_actor uuid, p_operation text, p_payload jsonb,
  p_expected_revision bigint, p_expected_identity jsonb, p_expected_replay jsonb,
  p_candidate_identity jsonb, p_candidate_replay jsonb, p_diff jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE new_revision bigint; optimizer jsonb; optimizer_selected boolean; v_snapshot_id bigint; affected_rows integer;
BEGIN
  optimizer_selected := (p_operation='EDIT' AND p_payload ? 'optimizer')
    OR (p_operation='RESTORE' AND p_payload->>'capability'='OPTIMIZATION')
    OR (p_operation='REFRESH' AND p_payload->'capabilities' ? 'OPTIMIZATION');

  IF optimizer_selected THEN
    SELECT id INTO v_snapshot_id FROM public.plan_optimizer_snapshots WHERE plan_id=p_plan_id FOR UPDATE;
    IF v_snapshot_id IS NULL THEN RAISE EXCEPTION 'MISSING_PLAN_OPTIMIZER_SNAPSHOT'; END IF;
    IF p_operation='RESTORE' AND NOT EXISTS (
      SELECT 1 FROM public.plan_optimizer_snapshots WHERE id=v_snapshot_id AND source='DAY_OVERRIDE' AND baseline_snapshot IS NOT NULL
    ) THEN RAISE EXCEPTION 'OPTIMIZER_RESTORE_NOT_AVAILABLE'; END IF;
    IF p_operation='REFRESH' AND jsonb_typeof(p_payload->'optimizerBaseline') IS DISTINCT FROM 'object'
      THEN RAISE EXCEPTION 'INVALID_OPTIMIZER_BASELINE'; END IF;
  END IF;

  -- Existing v1 operation remains the authority for canonical revision
  -- materialization, optimistic concurrency, plan fields and Assisted freshness.
  -- v1 predates OPTIMIZATION and rejects RESTORE for that capability, so use an
  -- empty EDIT only as the no-op plan-field materialization path, then correct
  -- the revision source inside the same transaction before applying optimizer.
  IF p_operation='RESTORE' AND p_payload->>'capability'='OPTIMIZATION' THEN
    new_revision := public.apply_day_config_operation(
      p_plan_id,p_actor,'EDIT','{}'::jsonb,p_expected_revision,p_expected_identity,
      p_expected_replay,p_candidate_identity,p_candidate_replay,p_diff
    );
    UPDATE public.plan_config_revisions SET source='RESTORE'
    WHERE id=new_revision AND plan_id=p_plan_id;
  ELSE
    new_revision := public.apply_day_config_operation(
      p_plan_id,p_actor,p_operation,p_payload,p_expected_revision,p_expected_identity,
      p_expected_replay,p_candidate_identity,p_candidate_replay,p_diff
    );
  END IF;

  IF NOT optimizer_selected THEN RETURN new_revision; END IF;
  optimizer := p_candidate_replay->'optimizerSnapshot';
  IF jsonb_typeof(optimizer) IS DISTINCT FROM 'object' OR optimizer->>'contractVersion'<>'1'
    THEN RAISE EXCEPTION 'INVALID_OPTIMIZER_REPLAY'; END IF;

  UPDATE public.plan_optimizer_snapshots SET
    source=optimizer->>'source', editing_mode=optimizer->>'editingMode',
    main_zone_id=(optimizer->>'mainZoneId')::int,
    arrival_plan_template_snapshot_id=(optimizer#>>'{transport,arrivalPlanTemplateSnapshotId}')::bigint,
    departure_plan_template_snapshot_id=(optimizer#>>'{transport,departurePlanTemplateSnapshotId}')::bigint,
    arrival_grouping_target=(optimizer#>>'{transport,arrivalGroupingTarget}')::int,
    departure_grouping_target=(optimizer#>>'{transport,departureGroupingTarget}')::int,
    arrival_min_gap_minutes=(optimizer#>>'{transport,arrivalMinGapMinutes}')::int,
    departure_min_gap_minutes=(optimizer#>>'{transport,departureMinGapMinutes}')::int,
    van_capacity=(optimizer#>>'{transport,vanCapacity}')::int,
    grouping_weight=(optimizer#>>'{transport,groupingWeight}')::int,
    near_hard_breaks_max=(optimizer->>'nearHardBreaksMax')::int,
    baseline_snapshot=CASE WHEN p_operation='REFRESH' THEN p_payload->'optimizerBaseline' ELSE baseline_snapshot END,
    override_by=CASE WHEN optimizer->>'source'='DAY_OVERRIDE' THEN COALESCE(override_by,p_actor) ELSE NULL END,
    override_at=CASE WHEN optimizer->>'source'='DAY_OVERRIDE' THEN COALESCE(override_at,now()) ELSE NULL END,
    updated_by=p_actor, updated_at=now()
  WHERE id=v_snapshot_id;
  GET DIAGNOSTICS affected_rows=ROW_COUNT;
  IF affected_rows<>1 THEN RAISE EXCEPTION 'OPTIMIZER_REPLAY_NOT_MATERIALIZED'; END IF;

  DELETE FROM public.plan_optimizer_snapshot_heuristics WHERE snapshot_id=v_snapshot_id;
  INSERT INTO public.plan_optimizer_snapshot_heuristics(snapshot_id,heuristic_key,basic_level,advanced_value)
    SELECT v_snapshot_id,h.key,(h.value->>'basicLevel')::int,(h.value->>'advancedValue')::int
    FROM jsonb_each(optimizer->'heuristics') h;
  DELETE FROM public.plan_optimizer_snapshot_grouping_zones WHERE snapshot_id=v_snapshot_id;
  INSERT INTO public.plan_optimizer_snapshot_grouping_zones(snapshot_id,zone_id)
    SELECT v_snapshot_id,(z#>>'{}')::int FROM jsonb_array_elements(optimizer->'groupingZoneIds') z;

  IF (SELECT count(*) FROM public.plan_optimizer_snapshot_heuristics WHERE plan_optimizer_snapshot_heuristics.snapshot_id=v_snapshot_id)
       <> jsonb_object_length(optimizer->'heuristics')
    THEN RAISE EXCEPTION 'OPTIMIZER_REPLAY_NOT_MATERIALIZED'; END IF;
  RETURN new_revision;
END $$;

REVOKE ALL ON FUNCTION public.apply_day_config_operation_v2(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_day_config_operation_v2(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
