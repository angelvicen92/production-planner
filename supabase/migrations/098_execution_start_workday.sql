-- P7: Madrid-date integrity for real Starts and audited time corrections.
-- Planning hours constrain scheduling, not same-day execution facts.
-- CREATE OR REPLACE preserves the versioned signature, defaults and existing ACL.
CREATE OR REPLACE FUNCTION public.execute_task_transition(p_task_id bigint,p_actor uuid,p_status text,p_expected_status text DEFAULT NULL,p_expected_version integer DEFAULT NULL)
RETURNS public.daily_tasks LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE t public.daily_tasks%rowtype; previous public.task_status; c jsonb; at_time timestamptz; sec integer; hhmm text; owned integer;
 day date; manual_base timestamptz;
BEGIN
 SELECT * INTO t FROM public.daily_tasks WHERE id=p_task_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND'; END IF;
 -- Same plan serializes starts for different tasks as well as double presses.
 PERFORM 1 FROM public.plans WHERE id=t.plan_id FOR UPDATE;
 PERFORM 1 FROM public.assisted_planning_sessions WHERE plan_id=t.plan_id AND status='ACTIVE' FOR SHARE;
 SELECT * INTO t FROM public.daily_tasks WHERE id=p_task_id FOR UPDATE;
 IF NOT public.execution_task_authorized(t.id,p_actor) THEN RAISE EXCEPTION 'EXECUTION_FORBIDDEN'; END IF;
 IF p_expected_version IS NULL OR p_expected_version<>t.execution_version THEN RAISE EXCEPTION 'EXECUTION_STALE'; END IF;
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
 -- P7: only new Starts are constrained. Finish/Interrupt/Resume/Cancel keep
 -- their existing chronology and clock-revision contract, including old runs.
 -- The plan and clock settings are already locked; reject before any write.
 IF t.status='pending' AND p_status='in_progress' THEN
  SELECT p.date INTO day FROM public.plans p WHERE p.id=t.plan_id;
  -- A same-day early/late real Start is a deviation from the plan. Never clamp
  -- its timestamp or infer a cross-midnight workday from planning hours.
  IF day IS NULL OR at_time IS NULL
   OR (at_time AT TIME ZONE 'Europe/Madrid')::date<>day THEN RAISE EXCEPTION 'EXECUTION_START_WORKDAY'; END IF;
  IF c->>'mode'='manual' THEN
   SELECT (day+s.simulated_time::time) AT TIME ZONE 'Europe/Madrid' INTO manual_base FROM public.program_settings s WHERE id=1;
   -- 097's round-trip/fold check: HH:mm cannot select a unique instant in a
   -- repeated hour and PostgreSQL must not silently normalize a missing hour.
   IF manual_base IS NULL OR EXISTS(SELECT 1 FROM public.program_settings s WHERE id=1 AND (
     (manual_base AT TIME ZONE 'Europe/Madrid')::timestamp<>day+s.simulated_time::time
     OR ((manual_base-interval '1 hour') AT TIME ZONE 'Europe/Madrid')::timestamp=day+s.simulated_time::time
     OR ((manual_base+interval '1 hour') AT TIME ZONE 'Europe/Madrid')::timestamp=day+s.simulated_time::time)) THEN RAISE EXCEPTION 'EXECUTION_CLOCK_INVALID'; END IF;
  END IF;
 END IF;
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
 UPDATE public.daily_tasks SET execution_version=execution_version+1,status=p_status::public.task_status,start_real=t.start_real,start_real_seconds=t.start_real_seconds,
  start_real_at=t.start_real_at,end_real=t.end_real,end_real_seconds=t.end_real_seconds,end_real_at=t.end_real_at,
  paused_at=t.paused_at,paused_at_hhmm=t.paused_at_hhmm,paused_at_seconds=t.paused_at_seconds,paused_total_seconds=t.paused_total_seconds,
  execution_clock_mode=t.execution_clock_mode,execution_clock_revision=t.execution_clock_revision WHERE id=t.id RETURNING * INTO t;
 INSERT INTO public.task_status_events(plan_id,task_id,status,previous_status,changed_by,time_real,operational_at,clock_mode,task_snapshot,created_at,execution_version)
  VALUES(t.plan_id,t.id,t.status,previous,p_actor::text,hhmm,at_time,c->>'mode',to_jsonb(t),(c->>'serverAt')::timestamptz,t.execution_version);
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

-- 097 is historical. Preserve its correction signature, locks, ACL and audit;
-- replace only the planning-window restriction with the same date authority.
CREATE OR REPLACE FUNCTION public.correct_task_execution_time(p_task_id bigint,p_actor uuid,p_field text,p_real_at text,p_reason text,p_expected_version integer)
RETURNS public.daily_tasks LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.daily_tasks%rowtype; original jsonb; c jsonb; value_at timestamptz; old_at timestamptz;
 day date; manual_base timestamptz; boundary_min timestamptz; boundary_max timestamptz; until_at timestamptz;
BEGIN
 SELECT * INTO t FROM public.daily_tasks WHERE id=p_task_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND'; END IF;
 -- Same lock order as Start/Finish; permissions are re-read after waiting.
 PERFORM 1 FROM public.plans WHERE id=t.plan_id FOR UPDATE;
 PERFORM 1 FROM public.assisted_planning_sessions WHERE plan_id=t.plan_id AND status='ACTIVE' FOR SHARE;
 SELECT * INTO t FROM public.daily_tasks WHERE id=p_task_id FOR UPDATE;
 IF NOT public.execution_task_authorized(t.id,p_actor) THEN RAISE EXCEPTION 'EXECUTION_FORBIDDEN'; END IF;
 IF p_expected_version IS NULL OR p_expected_version<>t.execution_version THEN RAISE EXCEPTION 'EXECUTION_STALE'; END IF;
 IF p_field IS NULL OR p_field NOT IN ('start','end') OR p_reason IS NULL OR p_reason !~ '[^[:space:]]' OR length(btrim(p_reason)) NOT BETWEEN 1 AND 240
  OR p_real_at IS NULL OR p_real_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[0-5]\d(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' THEN RAISE EXCEPTION 'EXECUTION_INVALID'; END IF;
 BEGIN value_at:=p_real_at::timestamptz;
 EXCEPTION WHEN data_exception THEN RAISE EXCEPTION 'EXECUTION_INVALID'; END;
 IF NOT isfinite(value_at) THEN RAISE EXCEPTION 'EXECUTION_INVALID'; END IF;
 IF t.start_real_at IS NULL OR t.status NOT IN ('in_progress','interrupted','done','cancelled')
  OR (t.status IN ('done','cancelled') AND t.end_real_at IS NULL)
  OR (t.status IN ('in_progress','interrupted') AND t.end_real_at IS NOT NULL)
  OR (p_field='end' AND t.status NOT IN ('done','cancelled')) THEN RAISE EXCEPTION 'EXECUTION_TRANSITION'; END IF;
 original:=to_jsonb(t);old_at:=CASE WHEN p_field='start' THEN t.start_real_at ELSE t.end_real_at END;
 IF old_at=value_at THEN RAISE EXCEPTION 'EXECUTION_INVALID'; END IF;
 PERFORM 1 FROM public.program_settings WHERE id=1 FOR SHARE;
 SELECT p.date INTO day FROM public.plans p WHERE p.id=t.plan_id;
 c:=public.execution_clock(t.plan_id);
 IF c->>'mode'='manual' THEN
  SELECT (day+s.simulated_time::time) AT TIME ZONE 'Europe/Madrid' INTO manual_base FROM public.program_settings s WHERE id=1;
  -- The HH:mm simulator cannot disambiguate a repeated hour, and must not
  -- silently normalize a missing hour. Explicit realAt instants remain valid.
  IF manual_base IS NULL OR EXISTS(SELECT 1 FROM public.program_settings s WHERE id=1 AND (
    (manual_base AT TIME ZONE 'Europe/Madrid')::timestamp<>day+s.simulated_time::time
    OR ((manual_base-interval '1 hour') AT TIME ZONE 'Europe/Madrid')::timestamp=day+s.simulated_time::time
    OR ((manual_base+interval '1 hour') AT TIME ZONE 'Europe/Madrid')::timestamp=day+s.simulated_time::time)) THEN RAISE EXCEPTION 'EXECUTION_CLOCK_CHANGED'; END IF;
 END IF;
 IF t.execution_clock_mode IS DISTINCT FROM c->>'mode'
  OR t.execution_clock_revision IS DISTINCT FROM (c->>'revision')::timestamptz THEN RAISE EXCEPTION 'EXECUTION_CLOCK_CHANGED'; END IF;
 IF value_at>(c->>'operationalAt')::timestamptz THEN RAISE EXCEPTION 'EXECUTION_CHRONOLOGY'; END IF;
 IF p_field='start' THEN t.start_real_at:=value_at; ELSE t.end_real_at:=value_at; END IF;
 until_at:=coalesce(t.end_real_at,t.paused_at,(c->>'operationalAt')::timestamptz);
 IF until_at>(c->>'operationalAt')::timestamptz OR until_at<t.start_real_at OR coalesce(t.paused_total_seconds,0)<0
  OR extract(epoch FROM until_at-t.start_real_at)<coalesce(t.paused_total_seconds,0)
  OR (t.status='interrupted' AND (t.paused_at IS NULL OR t.paused_at<t.start_real_at)) THEN RAISE EXCEPTION 'EXECUTION_CHRONOLOGY'; END IF;
 -- Corrections never move pause/resume facts. Restrict to the current run,
 -- including reset events created before this migration (pending + previous status).
 SELECT min(operational_at),max(operational_at) INTO boundary_min,boundary_max FROM public.task_status_events e
 WHERE e.task_id=t.id AND e.event_kind='transition' AND (e.status='interrupted' OR e.previous_status='interrupted')
  AND e.id>coalesce((SELECT max(id) FROM public.task_status_events WHERE task_id=t.id AND (event_kind='reset' OR (status='pending' AND previous_status IS NOT NULL))),0);
 IF (boundary_min IS NOT NULL AND (t.start_real_at>boundary_min OR until_at<boundary_max))
  OR (t.paused_total_seconds>0 AND boundary_min IS NULL) THEN RAISE EXCEPTION 'EXECUTION_CHRONOLOGY'; END IF;
 -- Explicit instants and the Madrid calendar date remain authoritative.
 -- Same-day early/late facts are correctable; planning hours are not a bound.
 -- No cross-midnight correction contract is introduced.
 IF day IS NULL OR (t.start_real_at AT TIME ZONE 'Europe/Madrid')::date<>day
  OR (t.end_real_at IS NOT NULL AND (t.end_real_at AT TIME ZONE 'Europe/Madrid')::date<>day) THEN RAISE EXCEPTION 'EXECUTION_WORKDAY'; END IF;
 UPDATE public.daily_tasks SET start_real_at=t.start_real_at,end_real_at=t.end_real_at,
  start_real=to_char(t.start_real_at AT TIME ZONE 'Europe/Madrid','HH24:MI'),start_real_seconds=floor(extract(second FROM t.start_real_at))::integer,
  end_real=to_char(t.end_real_at AT TIME ZONE 'Europe/Madrid','HH24:MI'),end_real_seconds=floor(extract(second FROM t.end_real_at))::integer,
  execution_version=execution_version+1 WHERE id=t.id RETURNING * INTO t;
 INSERT INTO public.task_status_events(plan_id,task_id,status,previous_status,changed_by,time_real,operational_at,clock_mode,task_snapshot,created_at,
  event_kind,execution_version,reason,corrected_field,old_value,new_value,previous_snapshot)
 VALUES(t.plan_id,t.id,t.status,t.status,p_actor::text,to_char(value_at AT TIME ZONE 'Europe/Madrid','HH24:MI'),
  (c->>'operationalAt')::timestamptz,c->>'mode',to_jsonb(t),(c->>'serverAt')::timestamptz,
  'time_correction',t.execution_version,btrim(p_reason),p_field,old_at,value_at,original);
 RETURN t;
END;
$$;
