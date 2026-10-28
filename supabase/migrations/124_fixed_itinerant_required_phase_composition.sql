-- P0-U01f: fixed, zero-transition units in nominal physical composition.
-- Existing owners, invoker security, private grants and historical data preserved.
CREATE OR REPLACE FUNCTION public.joint_task_resources(p_plan integer,p_task bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM (
  SELECT value::text::integer id FROM public.daily_tasks t,LATERAL jsonb_array_elements(coalesce(t.assigned_resource_ids,'[]')) WHERE t.plan_id=p_plan AND t.id=p_task
  UNION SELECT r.id FROM public.daily_tasks t JOIN public.plan_task_template_snapshots tpl ON tpl.plan_id=t.plan_id AND tpl.source_template_id=t.template_id JOIN public.plan_resource_items r ON r.plan_id=t.plan_id WHERE t.plan_id=p_plan AND t.id=p_task AND tpl.resource_requirements#>ARRAY['byItem',r.resource_item_id::text]='1'
  UNION SELECT a.plan_resource_item_id FROM public.daily_tasks t JOIN public.plan_space_resource_assignments a ON a.plan_id=t.plan_id AND a.space_id=t.space_id WHERE t.plan_id=p_plan AND t.id=p_task
  UNION SELECT a.plan_resource_item_id FROM public.daily_tasks t JOIN public.plan_space_settings s ON s.plan_id=t.plan_id AND s.space_id=t.space_id JOIN public.plan_zone_resource_assignments a ON a.plan_id=s.plan_id AND a.zone_id=s.zone_id WHERE t.plan_id=p_plan AND t.id=p_task
  UNION SELECT c.vocal_coach_plan_resource_item_id FROM public.daily_tasks t JOIN public.plan_task_template_snapshots tpl ON tpl.plan_id=t.plan_id AND tpl.source_template_id=t.template_id JOIN public.contestants c ON c.plan_id=t.plan_id AND c.id=t.contestant_id WHERE t.plan_id=p_plan AND t.id=p_task AND tpl.requires_coach AND c.vocal_coach_plan_resource_item_id IS NOT NULL
  UNION SELECT l.locked_resource_id FROM public.locks l WHERE l.plan_id=p_plan AND l.task_id=p_task AND l.lock_type IN ('resource','full') AND l.locked_resource_id IS NOT NULL
  UNION SELECT (member->>'planResourceItemId')::integer FROM public.daily_tasks t
   JOIN public.plan_task_template_snapshots tpl ON tpl.plan_id=t.plan_id AND tpl.source_template_id=t.template_id
   JOIN public.plan_itinerant_unit_snapshots u ON u.plan_id=t.plan_id AND u.source_team_id=tpl.itinerant_team_id
   CROSS JOIN LATERAL jsonb_array_elements(u.members) member
   WHERE t.plan_id=p_plan AND t.id=p_task AND tpl.itinerant_team_requirement='specific'
 ) physical
$$;
DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_technical_chains(integer,jsonb)'::regprocedure);
 needle:='public.effective_operation_continuity(p_plan,''[]'')<>''[]'' OR EXISTS(SELECT 1 FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan)';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'FIXED_COMPOSITION_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'public.effective_operation_continuity(p_plan,''[]'')<>''[]''');
 needle:='s.itinerant_team_requirement<>''none''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'FIXED_COMPOSITION_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'(s.itinerant_team_requirement<>''none'' AND (
     p.planner_next_profile#>>''{configuration,scenario}'' IS DISTINCT FROM ''STANDALONE_ONLY''
     OR s.itinerant_team_requirement<>''specific'' OR p.itinerant_composition_version IS DISTINCT FROM 1
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.allowed_itinerant_team_ids,''[]'')) a WHERE a IS DISTINCT FROM to_jsonb(s.itinerant_team_id))
     OR NOT EXISTS(SELECT 1 FROM public.plan_itinerant_unit_snapshots u WHERE u.plan_id=p_plan AND u.source_team_id=s.itinerant_team_id
      AND u.transition_minutes=0 AND jsonb_array_length(u.members)>0
      AND (SELECT count(DISTINCT m->>''planResourceItemId'') FROM jsonb_array_elements(u.members) m)=jsonb_array_length(u.members)
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(u.members) m WHERE
       (SELECT count(*) FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND r.resource_item_id::text=m->>''resourceItemId'')<>1
       OR NOT EXISTS(SELECT 1 FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND r.id::text=m->>''planResourceItemId'' AND r.resource_item_id::text=m->>''resourceItemId'')))))');
 EXECUTE definition;
END $migration$;
DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_joint_groups(integer,jsonb)'::regprocedure);
 needle:='s.itinerant_team_requirement<>''none''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'FIXED_COMPOSITION_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'(s.itinerant_team_requirement<>''none'' AND (
     p.planner_next_profile#>>''{configuration,scenario}'' IS DISTINCT FROM ''STANDALONE_ONLY''
     OR s.itinerant_team_requirement<>''specific'' OR p.itinerant_composition_version IS DISTINCT FROM 1
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.allowed_itinerant_team_ids,''[]'')) a WHERE a IS DISTINCT FROM to_jsonb(s.itinerant_team_id))
     OR NOT EXISTS(SELECT 1 FROM public.plan_itinerant_unit_snapshots u WHERE u.plan_id=p_plan AND u.source_team_id=s.itinerant_team_id
      AND u.transition_minutes=0 AND jsonb_array_length(u.members)>0
      AND (SELECT count(DISTINCT m->>''planResourceItemId'') FROM jsonb_array_elements(u.members) m)=jsonb_array_length(u.members)
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(u.members) m WHERE
       (SELECT count(*) FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND r.resource_item_id::text=m->>''resourceItemId'')<>1
       OR NOT EXISTS(SELECT 1 FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND r.id::text=m->>''planResourceItemId'' AND r.resource_item_id::text=m->>''resourceItemId'')))))');
 needle:='physical jsonb; earliest integer;';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'FIXED_COMPOSITION_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'physical jsonb; common_unit bigint; earliest integer;');
 needle:='physical:=NULL;earliest:=NULL;';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'FIXED_COMPOSITION_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'physical:=NULL;common_unit:=NULL;earliest:=NULL;');
 needle:='IF physical IS NULL THEN physical:=public.joint_task_resources(p_plan,t.id); END IF;';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'FIXED_COMPOSITION_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'IF physical IS NULL THEN
    physical:=public.joint_task_resources(p_plan,t.id);
    common_unit:=CASE WHEN tpl.itinerant_team_requirement=''specific'' THEN tpl.itinerant_team_id END;
   END IF;
   IF common_unit IS DISTINCT FROM (CASE WHEN tpl.itinerant_team_requirement=''specific'' THEN tpl.itinerant_team_id END) THEN RAISE EXCEPTION ''JOINT_UNIT_MISMATCH''; END IF;');
 EXECUTE definition;
END $migration$;
