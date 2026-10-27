CREATE OR REPLACE FUNCTION public.assert_task_scope_snapshot(p_plan integer,p_snapshot jsonb,p_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; replay jsonb; actual jsonb; other jsonb; policy jsonb; op jsonb; occupations jsonb:='[]';
 t public.daily_tasks%rowtype; tpl public.plan_task_template_snapshots%rowtype; unit public.plan_itinerant_unit_snapshots%rowtype;
 resources jsonb; stored_resources jsonb; fixed_unit integer; start_min integer; end_min integer; transition_min integer; gap integer; anchored_member boolean;
BEGIN
 SELECT * INTO STRICT p FROM public.plans WHERE id=p_plan;
 IF coalesce(p.daily_task_operation_scopes->'policies','[]')='[]' THEN RETURN; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'STALE_TASK_SCOPE_REVISION'; END IF;
 SELECT replay_snapshot_json INTO STRICT replay FROM public.plan_config_revisions WHERE id=p_revision AND plan_id=p_plan;
 PERFORM public.assert_task_scope_revision(p_plan,replay);
 FOR actual IN SELECT value FROM jsonb_array_elements(p_snapshot->'tasks') WHERE value->>'startPlanned' IS NOT NULL LOOP
  SELECT * INTO t FROM public.daily_tasks WHERE plan_id=p_plan AND id=(actual->>'taskId')::integer;
  IF NOT FOUND OR (SELECT count(*) FROM jsonb_array_elements(p_snapshot->'tasks') row WHERE row->'taskId'=actual->'taskId')<>1 THEN RAISE EXCEPTION 'TASK_SCOPE_SNAPSHOT_INVALID'; END IF;
  SELECT * INTO STRICT tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=t.template_id;
  SELECT value INTO policy FROM jsonb_array_elements(p.daily_task_operation_scopes->'policies') WHERE value->'taskId'=actual->'taskId';
  SELECT value INTO op FROM jsonb_array_elements(replay#>'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}') WHERE value->'taskId'=actual->'taskId';
  -- Each declaration retains its own authority. The revision is immutable and
  -- its two materializers have already checked the disjoint task ownership.
  anchored_member:=EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.daily_anchored_accompaniments->'policies','[]')) a
   WHERE public.anchored_member_ids(a) @> jsonb_build_array(actual->'taskId'));
  IF anchored_member THEN
   policy:=op||jsonb_build_object('itinerantUnitId',op->'itinerantTeamId');
   IF op->>'itinerantTeamRequirement'='any' THEN
    IF NOT coalesce(op->'allowedItinerantTeamIds','[]') @> jsonb_build_array(actual->'itinerantTeamId') THEN RAISE EXCEPTION 'TASK_SCOPE_UNIT_INVALID_OR_UNAVAILABLE'; END IF;
    policy:=policy||jsonb_build_object('itinerantUnitId',actual->'itinerantTeamId');
   END IF;
  END IF;
  start_min:=public.hhmm_to_minutes(actual->>'startPlanned');end_min:=public.hhmm_to_minutes(actual->>'endPlanned');
  IF start_min IS NULL OR end_min IS NULL OR start_min%5<>0 OR end_min-start_min IS DISTINCT FROM coalesce(t.duration_override,tpl.default_duration)
   OR actual->'spaceId' IS DISTINCT FROM to_jsonb(t.space_id) OR t.status='cancelled'
   OR start_min<public.hhmm_to_minutes(p.work_start) OR end_min>public.hhmm_to_minutes(p.work_end)
   OR (p.meal_mode='global_hard_break' AND start_min<public.hhmm_to_minutes(p.meal_end) AND end_min>public.hhmm_to_minutes(p.meal_start))
   OR (t.contestant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.contestants c WHERE c.plan_id=p_plan AND c.id=t.contestant_id AND start_min>=public.hhmm_to_minutes(coalesce(c.availability_start,p.work_start)) AND end_min<=public.hhmm_to_minutes(coalesce(c.availability_end,p.work_end))))
   OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings sp JOIN public.plan_zone_settings z ON z.plan_id=sp.plan_id AND z.zone_id=sp.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=t.space_id AND start_min>=public.hhmm_to_minutes(greatest(coalesce(sp.availability_start,p.work_start),coalesce(z.availability_start,p.work_start))) AND end_min<=public.hhmm_to_minutes(least(coalesce(sp.availability_end,p.work_end),coalesce(z.availability_end,p.work_end))))
   OR EXISTS(SELECT 1 FROM public.locks l WHERE l.plan_id=p_plan AND l.task_id=t.id AND l.lock_type IN ('time','full') AND ((l.locked_start IS NOT NULL AND l.locked_start<>actual->>'startPlanned') OR (l.locked_end IS NOT NULL AND l.locked_end<>actual->>'endPlanned')))
  THEN RAISE EXCEPTION 'TASK_SCOPE_WINDOW_OR_IDENTITY'; END IF;
  unit:=NULL;fixed_unit:=NULL;
  IF policy->>'itinerantUnitId' IS NOT NULL THEN fixed_unit:=(policy->>'itinerantUnitId')::integer;
  ELSIF tpl.itinerant_team_requirement='specific' THEN SELECT id INTO STRICT fixed_unit FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND source_team_id=tpl.itinerant_team_id; END IF;
  IF fixed_unit IS NOT NULL OR tpl.itinerant_team_requirement='any' THEN
   SELECT * INTO unit FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND id=(actual->>'itinerantTeamId')::integer;
   IF NOT FOUND OR jsonb_array_length(unit.members)=0 OR (fixed_unit IS NOT NULL AND unit.id<>fixed_unit)
    OR (fixed_unit IS NULL AND NOT tpl.allowed_itinerant_team_ids @> jsonb_build_array(unit.source_team_id))
    OR (unit.availability_windows IS NOT NULL AND NOT (SELECT range_agg(int4range(public.hhmm_to_minutes(w->>'start'),public.hhmm_to_minutes(w->>'end'),'[)')) @> int4range(start_min,end_min,'[)') FROM jsonb_array_elements(unit.availability_windows) w))
   THEN RAISE EXCEPTION 'TASK_SCOPE_UNIT_INVALID_OR_UNAVAILABLE'; END IF;
  ELSIF actual->>'itinerantTeamId' IS NOT NULL THEN RAISE EXCEPTION 'TASK_SCOPE_UNIT_INVALID_OR_UNAVAILABLE'; END IF;
  SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO resources FROM (
   SELECT value::text::integer id FROM jsonb_array_elements(coalesce(policy->'declaredResourceIds',t.assigned_resource_ids,'[]'))
   UNION SELECT r.id FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND tpl.resource_requirements#>ARRAY['byItem',r.resource_item_id::text]='1'
   UNION SELECT (m->>'planResourceItemId')::integer FROM jsonb_array_elements(coalesce(unit.members,'[]')) m
   UNION SELECT c.vocal_coach_plan_resource_item_id FROM public.contestants c WHERE c.plan_id=p_plan AND c.id=t.contestant_id AND tpl.requires_coach AND c.vocal_coach_plan_resource_item_id IS NOT NULL
   UNION SELECT a.plan_resource_item_id FROM public.plan_space_resource_assignments a WHERE a.plan_id=p_plan AND a.space_id=t.space_id AND coalesce(policy->>'resourceInheritance','LOCATION')='LOCATION'
   UNION SELECT a.plan_resource_item_id FROM public.plan_zone_resource_assignments a JOIN public.plan_space_settings sp ON sp.plan_id=a.plan_id AND sp.zone_id=a.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=t.space_id AND coalesce(policy->>'resourceInheritance','LOCATION')='LOCATION'
   UNION SELECT l.locked_resource_id FROM public.locks l WHERE l.plan_id=p_plan AND l.task_id=t.id AND l.lock_type IN ('resource','full') AND l.locked_resource_id IS NOT NULL
  ) required;
  -- SQL stores direct/materialized assignments. Location inheritance remains a
  -- derived physical obligation, including for competitors outside the override.
  SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO stored_resources FROM (
   SELECT value::text::integer id FROM jsonb_array_elements(coalesce(policy->'declaredResourceIds',t.assigned_resource_ids,'[]'))
   UNION SELECT r.id FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND tpl.resource_requirements#>ARRAY['byItem',r.resource_item_id::text]='1'
   UNION SELECT (m->>'planResourceItemId')::integer FROM jsonb_array_elements(coalesce(unit.members,'[]')) m
   UNION SELECT l.locked_resource_id FROM public.locks l WHERE l.plan_id=p_plan AND l.task_id=t.id AND l.lock_type IN ('resource','full') AND l.locked_resource_id IS NOT NULL
  ) direct_and_materialized;
  -- Native v2 deliberately persists the complete physical assignment of each
  -- anchored member, including LOCATION resources of the physical Main.
  IF anchored_member AND p.daily_anchored_accompaniments->'contractVersion'='2' THEN stored_resources:=resources; END IF;
  IF jsonb_typeof(actual->'assignedResourceIds') IS DISTINCT FROM 'array'
   OR (SELECT coalesce(jsonb_agg(value ORDER BY value::text::integer),'[]') FROM jsonb_array_elements(actual->'assignedResourceIds')) IS DISTINCT FROM stored_resources
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(resources) rid WHERE NOT EXISTS(SELECT 1 FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND r.id=rid::text::integer AND r.is_available AND start_min>=public.hhmm_to_minutes(coalesce(r.availability_start,p.work_start)) AND end_min<=public.hhmm_to_minutes(coalesce(r.availability_end,p.work_end))))
   OR EXISTS(SELECT 1 FROM jsonb_each(coalesce(tpl.resource_requirements->'byItem','{}')) req WHERE req.value<>'1'::jsonb OR NOT EXISTS(SELECT 1 FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND r.resource_item_id::text=req.key))
  THEN RAISE EXCEPTION 'TASK_SCOPE_PHYSICAL_RESOURCES' USING DETAIL=format('taskId=%s expectedAssignments=%s actualAssignments=%s',t.id,stored_resources,actual->'assignedResourceIds'); END IF;
  occupations:=occupations||jsonb_build_array(jsonb_build_object('task',t.id,'start',start_min,'end',end_min,'space',t.space_id,'participant',t.contestant_id,'blocks',coalesce(policy->'blocksSpace','true'),'unit',unit.id,'unitTransition',coalesce(unit.transition_minutes,0),'resources',resources,
   'before',tpl.participant_margin_before_minutes,'after',tpl.participant_margin_after_minutes));
 END LOOP;
 FOR actual IN SELECT value FROM jsonb_array_elements(occupations) LOOP
  FOR other IN SELECT value FROM jsonb_array_elements(occupations) WHERE value->'task'<>actual->'task' LOOP
   gap:=(other->>'start')::integer-(actual->>'end')::integer;
   IF (actual->>'start')::integer<(other->>'end')::integer AND (other->>'start')::integer<(actual->>'end')::integer THEN
    IF (actual->'space'=other->'space' AND actual->'blocks'='true' AND other->'blocks'='true')
     OR (actual->>'participant' IS NOT NULL AND actual->'participant'=other->'participant')
     OR (actual->>'unit' IS NOT NULL AND actual->'unit'=other->'unit')
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'resources') rid WHERE other->'resources' @> jsonb_build_array(rid))
    THEN RAISE EXCEPTION 'TASK_SCOPE_PHYSICAL_CONFLICT'; END IF;
   ELSIF gap>=0 THEN
    IF actual->>'participant' IS NOT NULL AND actual->'participant'=other->'participant'
     AND gap<coalesce(greatest((actual->>'after')::integer,(other->>'before')::integer),p.participant_transition_minutes)
    THEN RAISE EXCEPTION 'TASK_SCOPE_PARTICIPANT_TRANSITION'; END IF;
    IF actual->'space'<>other->'space' THEN
     transition_min:=(p.planner_next_profile#>>'{configuration,resourceTransitionMinutes}')::integer;
     IF (actual->>'unit' IS NOT NULL AND actual->'unit'=other->'unit' AND gap<(actual->>'unitTransition')::integer)
      OR (gap<transition_min AND EXISTS(SELECT 1 FROM jsonb_array_elements(actual->'resources') rid WHERE other->'resources' @> jsonb_build_array(rid)))
     THEN RAISE EXCEPTION 'TASK_SCOPE_RESOURCE_TRANSITION'; END IF;
    END IF;
   END IF;
  END LOOP;
 END LOOP;
END $$;