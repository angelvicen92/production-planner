-- ASST-009: selective General -> day refresh. The SECURITY INVOKER function is
-- callable only by service_role and keeps snapshot writes + revision switch atomic.
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
    INSERT INTO public.plan_task_template_snapshots(plan_id,source_template_id,contract_version,source,template_name,default_duration,default_cameras,default_zone_id,default_space_id,auto_create_on_contestant_create,requires_auxiliar,requires_coach,requires_presenter,exclusive_auxiliar,has_dependency,dependency_template_ids,resource_requirements,itinerant_team_requirement,itinerant_team_id,allowed_itinerant_team_ids,setup_id)
    VALUES(p_plan_id,(item->>'sourceTemplateId')::int,1,item->>'source',item->>'templateName',(item->>'defaultDuration')::int,(item->>'defaultCameras')::int,(item->>'defaultZoneId')::int,(item->>'defaultSpaceId')::int,(item->>'autoCreateOnContestantCreate')::bool,(item->>'requiresAuxiliar')::bool,(item->>'requiresCoach')::bool,(item->>'requiresPresenter')::bool,(item->>'exclusiveAuxiliar')::bool,(item->>'hasDependency')::bool,item->'dependencyTemplateIds',NULLIF(item->'resourceRequirements','null'::jsonb),item->>'itinerantTeamRequirement',(item->>'itinerantTeamId')::int,item->'allowedItinerantTeamIds',(item->>'setupId')::int)
    ON CONFLICT(plan_id,source_template_id) DO UPDATE SET source=EXCLUDED.source,template_name=EXCLUDED.template_name,default_duration=EXCLUDED.default_duration,default_cameras=EXCLUDED.default_cameras,default_zone_id=EXCLUDED.default_zone_id,default_space_id=EXCLUDED.default_space_id,auto_create_on_contestant_create=EXCLUDED.auto_create_on_contestant_create,requires_auxiliar=EXCLUDED.requires_auxiliar,requires_coach=EXCLUDED.requires_coach,requires_presenter=EXCLUDED.requires_presenter,exclusive_auxiliar=EXCLUDED.exclusive_auxiliar,has_dependency=EXCLUDED.has_dependency,dependency_template_ids=EXCLUDED.dependency_template_ids,resource_requirements=EXCLUDED.resource_requirements,itinerant_team_requirement=EXCLUDED.itinerant_team_requirement,itinerant_team_id=EXCLUDED.itinerant_team_id,allowed_itinerant_team_ids=EXCLUDED.allowed_itinerant_team_ids,setup_id=EXCLUDED.setup_id;
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
