-- EJEC-01: server-only, atomic execution. Does not change planning/configuration.
ALTER TABLE public.daily_tasks
  ADD COLUMN start_real_at timestamptz,
  ADD COLUMN end_real_at timestamptz,
  ADD COLUMN paused_at timestamptz,
  ADD COLUMN execution_clock_mode text,
  ADD COLUMN execution_clock_revision timestamptz;
ALTER TABLE public.task_status_events
  ADD COLUMN previous_status public.task_status,
  ADD COLUMN operational_at timestamptz,
  ADD COLUMN clock_mode text,
  ADD COLUMN task_snapshot jsonb;
ALTER TABLE public.locks ADD COLUMN execution_owned boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX locks_one_execution_per_task ON public.locks(task_id) WHERE execution_owned;

-- All application mutations already use the server. Prevent direct API writes
-- from bypassing the transaction or forging an operational assignment.
REVOKE INSERT, UPDATE, DELETE ON public.daily_tasks, public.task_status_events,
  public.locks, public.plans, public.plan_resource_items, public.plan_space_settings,
  public.plan_staff_assignments, public.plan_zone_staff_mode,
  public.plan_space_resource_assignments, public.plan_zone_resource_assignments
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.execution_task_resources(p_task_id bigint)
RETURNS SETOF public.plan_resource_items LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT r.* FROM public.daily_tasks t
  LEFT JOIN public.plan_space_settings s ON s.plan_id=t.plan_id AND s.space_id=t.space_id
  JOIN public.plan_resource_items r ON r.plan_id=t.plan_id AND r.is_available
  WHERE t.id=p_task_id AND (
    coalesce(t.assigned_resource_ids,'[]'::jsonb) @> jsonb_build_array(r.id)
    OR EXISTS (SELECT 1 FROM public.plan_space_resource_assignments a
      WHERE a.plan_id=t.plan_id AND a.space_id=t.space_id AND a.plan_resource_item_id=r.id)
    OR ((t.zone_id IS NULL OR s.zone_id IS NULL OR t.zone_id=s.zone_id)
      AND EXISTS (SELECT 1 FROM public.plan_zone_resource_assignments a
        WHERE a.plan_id=t.plan_id AND a.zone_id=coalesce(t.zone_id,s.zone_id) AND a.plan_resource_item_id=r.id))
  );
$$;

CREATE FUNCTION public.execution_task_scope(p_task_id bigint,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.daily_tasks t
  LEFT JOIN public.plan_space_settings s ON s.plan_id=t.plan_id AND s.space_id=t.space_id
  JOIN public.user_entity_links l ON l.user_id=p_actor AND l.is_primary
  WHERE t.id=p_task_id AND (
   (l.entity_type='staff_person' AND EXISTS (
    SELECT 1 FROM public.plan_staff_assignments a JOIN public.staff_people p ON p.id=a.staff_person_id AND p.is_active
    LEFT JOIN public.plan_zone_staff_mode m ON m.plan_id=a.plan_id AND m.zone_id=coalesce(t.zone_id,s.zone_id)
    WHERE a.plan_id=t.plan_id AND a.staff_person_id=l.entity_id AND (
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

CREATE FUNCTION public.execution_task_authorized(p_task_id bigint,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.daily_tasks t,public.user_roles u JOIN public.roles r ON r.id=u.role_id
  WHERE t.id=p_task_id AND u.user_id=p_actor
    AND (r.key IN ('admin','production') OR (r.key='aux' AND public.execution_task_scope(t.id,p_actor))));
$$;

CREATE FUNCTION public.execution_plan_ready(p_plan_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.plans p WHERE p.id=p_plan_id AND (
  (p.status='published' AND NOT EXISTS(SELECT 1 FROM public.daily_tasks t WHERE t.plan_id=p.id AND (t.start_planned IS NULL OR t.end_planned IS NULL))) OR EXISTS (
   SELECT 1 FROM public.assisted_planning_sessions s JOIN public.assisted_planning_stages g ON g.id=s.active_stage_id AND g.plan_id=s.plan_id
   WHERE s.plan_id=p.id AND s.status='ACTIVE' AND g.ordinal>0 AND g.archived_at IS NULL
    AND jsonb_array_length(g.snapshot_json->'tasks')=(SELECT count(*) FROM public.daily_tasks WHERE plan_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM public.daily_tasks t WHERE t.plan_id=p.id AND NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(g.snapshot_json->'tasks') x WHERE (x->>'taskId')::bigint=t.id
     AND x->>'startPlanned'=t.start_planned AND x->>'endPlanned'=t.end_planned
     AND t.start_planned IS NOT NULL AND t.end_planned IS NOT NULL
     AND (x->>'spaceId')::integer IS NOT DISTINCT FROM t.space_id
     AND (x->>'zoneId')::integer IS NOT DISTINCT FROM t.zone_id
     AND (x->>'durationOverride')::integer IS NOT DISTINCT FROM t.duration_override
     AND (x->>'camerasOverride')::integer IS NOT DISTINCT FROM t.cameras_override
     AND x->>'locationLabel' IS NOT DISTINCT FROM t.location_label
     AND (NOT(x ? 'assignedResourceIds') OR coalesce(x->'assignedResourceIds','[]'::jsonb)=coalesce(t.assigned_resource_ids,'[]'::jsonb))))
  )));
$$;

CREATE FUNCTION public.execution_clock(p_plan_id bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE settings public.program_settings%rowtype; day date; actual timestamptz:=clock_timestamp(); operational timestamptz;
BEGIN
 SELECT * INTO settings FROM public.program_settings WHERE id=1;
 SELECT date INTO day FROM public.plans WHERE id=p_plan_id;
 IF day IS NULL THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND'; END IF;
 IF settings.clock_mode='manual' AND settings.simulated_time IS NOT NULL AND settings.simulated_set_at IS NOT NULL THEN
  operational:=((day+settings.simulated_time::time) AT TIME ZONE 'Europe/Madrid')+greatest(actual-settings.simulated_set_at,interval '0 seconds');
 ELSE operational:=actual; END IF;
 RETURN jsonb_build_object('serverAt',actual,'operationalAt',operational,'mode',coalesce(settings.clock_mode,'auto'),
  'revision',CASE WHEN settings.clock_mode='manual' THEN settings.simulated_set_at ELSE NULL END);
END;
$$;

CREATE FUNCTION public.execution_context(p_plan_id bigint,p_actor uuid)
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
  'hasScope',EXISTS(SELECT 1 FROM public.user_entity_links l WHERE l.user_id=p_actor AND l.is_primary AND (
    (l.entity_type='staff_person' AND EXISTS(SELECT 1 FROM public.plan_staff_assignments a JOIN public.staff_people p ON p.id=a.staff_person_id AND p.is_active WHERE a.plan_id=p_plan_id AND a.staff_person_id=l.entity_id AND a.scope_type IN ('zone','space')))
    OR (l.entity_type='resource_item' AND EXISTS(SELECT 1 FROM public.plan_resource_items r JOIN public.resource_items i ON i.id=r.resource_item_id AND i.is_active WHERE r.plan_id=p_plan_id AND r.resource_item_id=l.entity_id AND r.is_available)))),
  'tasks',coalesce((SELECT jsonb_agg(jsonb_build_object('taskId',t.id,'inScope',public.execution_task_scope(t.id,p_actor),
    'hasAuthority',public.execution_task_authorized(t.id,p_actor),
    'canExecute',public.execution_task_authorized(t.id,p_actor) AND (ready OR t.status IN ('in_progress','interrupted')),
    'resources',(SELECT coalesce(jsonb_agg(r.name ORDER BY r.id),'[]'::jsonb) FROM public.execution_task_resources(t.id) r)) ORDER BY t.id)
    FROM public.daily_tasks t WHERE t.plan_id=p_plan_id),'[]'::jsonb));
END;
$$;

CREATE FUNCTION public.execute_task_transition(p_task_id bigint,p_actor uuid,p_status text,p_expected_status text DEFAULT NULL)
RETURNS public.daily_tasks LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE t public.daily_tasks%rowtype; previous public.task_status; c jsonb; at_time timestamptz; sec integer; hhmm text; owned integer;
BEGIN
 SELECT * INTO t FROM public.daily_tasks WHERE id=p_task_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND'; END IF;
 -- Same plan serializes starts for different tasks as well as double presses.
 PERFORM 1 FROM public.plans WHERE id=t.plan_id FOR UPDATE;
 PERFORM 1 FROM public.assisted_planning_sessions WHERE plan_id=t.plan_id AND status='ACTIVE' FOR SHARE;
 SELECT * INTO t FROM public.daily_tasks WHERE id=p_task_id FOR UPDATE;
 IF NOT public.execution_task_authorized(t.id,p_actor) THEN RAISE EXCEPTION 'EXECUTION_FORBIDDEN'; END IF;
 IF p_expected_status IS NOT NULL AND p_expected_status<>t.status::text THEN RAISE EXCEPTION 'EXECUTION_STALE'; END IF;
 IF NOT ((t.status='pending' AND p_status IN ('in_progress','cancelled'))
  OR (t.status='in_progress' AND p_status IN ('done','interrupted'))
  OR (t.status='interrupted' AND p_status IN ('in_progress','cancelled'))) THEN RAISE EXCEPTION 'EXECUTION_TRANSITION'; END IF;
 IF t.status='pending' AND p_status='in_progress' AND NOT public.execution_plan_ready(t.plan_id) THEN RAISE EXCEPTION 'EXECUTION_PLANNING_REQUIRED'; END IF;
 IF p_status='in_progress' AND EXISTS (SELECT 1 FROM public.daily_tasks x WHERE x.plan_id=t.plan_id AND x.id<>t.id AND x.status='in_progress'
  AND ((t.contestant_id IS NOT NULL AND x.contestant_id=t.contestant_id) OR (t.space_id IS NOT NULL AND x.space_id=t.space_id))) THEN RAISE EXCEPTION 'EXECUTION_OCCUPIED'; END IF;
 -- Read the clock settings under lock; the browser's clock is never an input.
 PERFORM 1 FROM public.program_settings WHERE id=1 FOR SHARE;
 c:=public.execution_clock(t.plan_id); at_time:=(c->>'operationalAt')::timestamptz;
 IF t.start_real_at IS NOT NULL AND (t.execution_clock_mode IS DISTINCT FROM c->>'mode'
  OR t.execution_clock_revision IS DISTINCT FROM (c->>'revision')::timestamptz) THEN RAISE EXCEPTION 'EXECUTION_CLOCK_CHANGED'; END IF;
 IF at_time<coalesce(t.paused_at,t.start_real_at) THEN RAISE EXCEPTION 'EXECUTION_CLOCK_REVERSED'; END IF;
 hhmm:=to_char(at_time AT TIME ZONE 'Europe/Madrid','HH24:MI'); sec:=floor(extract(second FROM at_time))::integer; previous:=t.status;
 IF p_status='in_progress' AND t.status='pending' THEN
  t.start_real_at:=at_time;t.start_real:=hhmm;t.start_real_seconds:=sec;t.execution_clock_mode:=c->>'mode';t.execution_clock_revision:=(c->>'revision')::timestamptz;
 ELSIF t.paused_at IS NOT NULL AND p_status IN ('in_progress','cancelled') THEN
  t.paused_total_seconds:=t.paused_total_seconds+floor(extract(epoch FROM at_time-t.paused_at))::integer;
 END IF;
 IF p_status='interrupted' THEN t.paused_at:=at_time;t.paused_at_hhmm:=hhmm;t.paused_at_seconds:=sec;
 ELSE t.paused_at:=NULL;t.paused_at_hhmm:=NULL;t.paused_at_seconds:=NULL; END IF;
 IF p_status IN ('done','cancelled') THEN t.end_real_at:=at_time;t.end_real:=hhmm;t.end_real_seconds:=sec; END IF;
 IF p_status='done' AND t.start_real IS NULL THEN RAISE EXCEPTION 'EXECUTION_TRANSITION'; END IF;
 UPDATE public.daily_tasks SET status=p_status::public.task_status,start_real=t.start_real,start_real_seconds=t.start_real_seconds,
  start_real_at=t.start_real_at,end_real=t.end_real,end_real_seconds=t.end_real_seconds,end_real_at=t.end_real_at,
  paused_at=t.paused_at,paused_at_hhmm=t.paused_at_hhmm,paused_at_seconds=t.paused_at_seconds,paused_total_seconds=t.paused_total_seconds,
  execution_clock_mode=t.execution_clock_mode,execution_clock_revision=t.execution_clock_revision WHERE id=t.id RETURNING * INTO t;
 INSERT INTO public.task_status_events(plan_id,task_id,status,previous_status,changed_by,time_real,operational_at,clock_mode,task_snapshot,created_at)
  VALUES(t.plan_id,t.id,t.status,previous,p_actor::text,hhmm,at_time,c->>'mode',to_jsonb(t),(c->>'serverAt')::timestamptz);
 IF t.start_real IS NOT NULL THEN
  SELECT count(*) INTO owned FROM public.locks WHERE task_id=t.id AND (execution_owned OR reason IN ('Execution lock for status: in_progress','Execution lock for status: done'));
  IF owned>1 THEN RAISE EXCEPTION 'EXECUTION_LOCK_CONFLICT'; END IF;
  IF owned=0 THEN
   INSERT INTO public.locks(plan_id,task_id,lock_type,locked_start,locked_end,created_by,reason,execution_owned)
    VALUES(t.plan_id,t.id,'full',t.start_planned,t.end_planned,p_actor::text,'Execution lock',true);
  ELSE UPDATE public.locks SET execution_owned=true WHERE task_id=t.id AND (execution_owned OR reason IN ('Execution lock for status: in_progress','Execution lock for status: done')); END IF;
 END IF;
 RETURN t;
END;
$$;

CREATE FUNCTION public.reset_task_execution(p_task_id bigint,p_actor uuid)
RETURNS public.daily_tasks LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE t public.daily_tasks%rowtype; c jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id WHERE u.user_id=p_actor AND r.key IN ('admin','production')) THEN RAISE EXCEPTION 'EXECUTION_FORBIDDEN'; END IF;
 SELECT * INTO t FROM public.daily_tasks WHERE id=p_task_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND'; END IF;
 PERFORM 1 FROM public.plans WHERE id=t.plan_id FOR UPDATE;
 SELECT * INTO t FROM public.daily_tasks WHERE id=p_task_id FOR UPDATE;
 c:=public.execution_clock(t.plan_id);
 INSERT INTO public.task_status_events(plan_id,task_id,status,previous_status,changed_by,time_real,operational_at,clock_mode,task_snapshot,created_at)
  VALUES(t.plan_id,t.id,'pending',t.status,p_actor::text,to_char((c->>'operationalAt')::timestamptz AT TIME ZONE 'Europe/Madrid','HH24:MI'),(c->>'operationalAt')::timestamptz,c->>'mode',to_jsonb(t),(c->>'serverAt')::timestamptz);
 DELETE FROM public.locks WHERE task_id=t.id AND (execution_owned OR reason IN ('Execution lock for status: in_progress','Execution lock for status: done'));
 UPDATE public.daily_tasks SET status='pending',start_real=NULL,end_real=NULL,start_real_seconds=NULL,end_real_seconds=NULL,
  start_real_at=NULL,end_real_at=NULL,paused_at=NULL,paused_at_hhmm=NULL,paused_at_seconds=NULL,paused_total_seconds=0,
  execution_clock_mode=NULL,execution_clock_revision=NULL WHERE id=t.id RETURNING * INTO t;
 RETURN t;
END;
$$;

REVOKE ALL ON FUNCTION public.execution_task_resources(bigint), public.execution_task_scope(bigint,uuid),
 public.execution_task_authorized(bigint,uuid), public.execution_plan_ready(bigint), public.execution_clock(bigint),
 public.execution_context(bigint,uuid), public.execute_task_transition(bigint,uuid,text,text),public.reset_task_execution(bigint,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.execution_task_resources(bigint), public.execution_task_scope(bigint,uuid),
 public.execution_task_authorized(bigint,uuid), public.execution_plan_ready(bigint), public.execution_clock(bigint),
 public.execution_context(bigint,uuid), public.execute_task_transition(bigint,uuid,text,text),public.reset_task_execution(bigint,uuid)
 TO service_role;

-- Existing managed projects expose these changes through the established bus.
-- Fresh disposable PostgreSQL without Realtime has no publication to change.
DO $$ DECLARE tab text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime' AND NOT puballtables) THEN
  FOREACH tab IN ARRAY ARRAY['daily_tasks','locks'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=tab) THEN
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',tab);
   END IF;
  END LOOP;
 END IF;
END $$;
