-- G0: only effective nominal Production assignments grant staff execution scope.
-- Global auth roles, nominal resource authority and zone/space mode semantics stay intact.
CREATE OR REPLACE FUNCTION public.execution_task_scope(p_task_id bigint,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.daily_tasks t
  LEFT JOIN public.plan_space_settings s ON s.plan_id=t.plan_id AND s.space_id=t.space_id
  JOIN public.user_entity_links l ON l.user_id=p_actor AND l.is_primary
  WHERE t.id=p_task_id AND (
   (l.entity_type='staff_person' AND EXISTS (
    SELECT 1 FROM public.plan_staff_assignments a JOIN public.staff_people p ON p.id=a.staff_person_id AND p.is_active
    LEFT JOIN public.plan_zone_staff_mode m ON m.plan_id=a.plan_id AND m.zone_id=coalesce(t.zone_id,s.zone_id)
    WHERE a.plan_id=t.plan_id AND a.staff_person_id=l.entity_id AND a.staff_role='production' AND (
     (a.scope_type='space' AND a.space_id=t.space_id AND coalesce(m.mode::text,'space')='space')
     OR (a.scope_type='zone' AND a.zone_id=coalesce(t.zone_id,s.zone_id)
       AND (t.zone_id IS NULL OR s.zone_id IS NULL OR t.zone_id=s.zone_id) AND coalesce(m.mode::text,'zone')='zone')
    )))
   OR (l.entity_type='resource_item' AND EXISTS (
    SELECT 1 FROM public.execution_task_resources(t.id) r
    JOIN public.resource_items i ON i.id=r.resource_item_id AND i.is_active WHERE r.resource_item_id=l.entity_id))
  )
 );
$$;

CREATE OR REPLACE FUNCTION public.execution_context(p_plan_id bigint,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE role_key text; ready boolean;
BEGIN
 SELECT r.key INTO role_key FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id WHERE u.user_id=p_actor;
 IF role_key IS NULL THEN RAISE EXCEPTION 'EXECUTION_FORBIDDEN'; END IF;
 ready:=public.execution_plan_ready(p_plan_id);
 RETURN jsonb_build_object('role',role_key,'planningReady',ready,
  'planningState',CASE WHEN EXISTS(SELECT 1 FROM public.plans WHERE id=p_plan_id AND status='published') THEN 'published' WHEN ready THEN 'accepted' ELSE 'pending' END,
  'draftPending',EXISTS(SELECT 1 FROM public.assisted_planning_sessions s JOIN public.assisted_planning_stages g ON g.id=s.active_stage_id
    WHERE s.plan_id=p_plan_id AND s.status='ACTIVE' AND s.draft_fingerprint<>g.snapshot_fingerprint),
  'clock',public.execution_clock(p_plan_id),
  'hasScope',EXISTS(SELECT 1 FROM public.daily_tasks t WHERE t.plan_id=p_plan_id AND public.execution_task_scope(t.id,p_actor)),
  'tasks',coalesce((SELECT jsonb_agg(jsonb_build_object('taskId',t.id,'inScope',public.execution_task_scope(t.id,p_actor),
    'hasAuthority',public.execution_task_authorized(t.id,p_actor),
    'canExecute',public.execution_task_authorized(t.id,p_actor) AND (ready OR t.status IN ('in_progress','interrupted')),
    'resources',(SELECT coalesce(jsonb_agg(r.name ORDER BY r.id),'[]'::jsonb) FROM public.execution_task_resources(t.id) r)) ORDER BY t.id)
    FROM public.daily_tasks t WHERE t.plan_id=p_plan_id),'[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.execution_task_scope(bigint,uuid), public.execution_context(bigint,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.execution_task_scope(bigint,uuid), public.execution_context(bigint,uuid)
 TO service_role;
