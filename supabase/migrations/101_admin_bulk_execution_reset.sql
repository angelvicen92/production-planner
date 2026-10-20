-- Administrative execution correction only. Planning and audit history remain authoritative.
-- The CLI-generated file uses the repository's forward-only NNN sequence.
CREATE OR REPLACE FUNCTION public.reset_plan_execution(p_plan_id bigint, p_actor uuid, p_expected_tasks jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  observed jsonb;
  expected jsonb;
  t public.daily_tasks%rowtype;
  changed public.daily_tasks%rowtype;
  reset_count integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
    WHERE u.user_id=p_actor AND r.key='admin') THEN RAISE EXCEPTION 'EXECUTION_FORBIDDEN'; END IF;

  -- Same lock order as individual transitions/corrections/resets. Inserting a task
  -- also needs a parent FK lock, so it cannot join the confirmed day midway.
  PERFORM 1 FROM public.plans WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND'; END IF;
  -- Revalidate after any plan-lock wait and retain the grant until completion.
  PERFORM 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
    WHERE u.user_id=p_actor AND r.key='admin' FOR SHARE OF u;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_FORBIDDEN'; END IF;
  PERFORM 1 FROM public.daily_tasks WHERE plan_id=p_plan_id ORDER BY id FOR UPDATE;

  IF p_expected_tasks IS NULL OR jsonb_typeof(p_expected_tasks)<>'array' THEN
    RAISE EXCEPTION 'EXECUTION_STALE';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'executionVersion',execution_version) ORDER BY id),'[]'::jsonb)
    INTO observed FROM public.daily_tasks WHERE plan_id=p_plan_id;
  SELECT coalesce(jsonb_agg(value ORDER BY value->'id'),'[]'::jsonb)
    INTO expected FROM jsonb_array_elements(p_expected_tasks);
  -- Exact membership, status and version, including pending tasks. Detects ABA
  -- (reset then restart), inserted/deleted tasks, duplicates and partial lists.
  IF observed IS DISTINCT FROM expected THEN RAISE EXCEPTION 'EXECUTION_STALE'; END IF;

  FOR t IN SELECT * FROM public.daily_tasks WHERE plan_id=p_plan_id AND status<>'pending' ORDER BY id LOOP
    SELECT * INTO changed FROM public.reset_task_execution(t.id,p_actor);
    IF changed.id IS DISTINCT FROM t.id OR changed.status IS DISTINCT FROM 'pending'::public.task_status
      OR changed.execution_version IS DISTINCT FROM t.execution_version+1 THEN
      RAISE EXCEPTION 'EXECUTION_RESET_INCOMPLETE';
    END IF;
    reset_count := reset_count+1;
  END LOOP;
  -- Exceptions propagate: every nested reset, event and lock removal rolls back.
  RETURN jsonb_build_object('resetCount',reset_count);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_plan_execution(bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_plan_execution(bigint,uuid,jsonb) TO service_role;
