-- Confirmed restart is a guarded move to the session's immutable bootstrap.
-- History, revisions, exceptions and runs remain available for audit/redo.
CREATE OR REPLACE FUNCTION public.assisted_restart_bootstrap(
 p_plan_id integer, p_expected_fingerprint text, p_expected_base bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; target_id bigint;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 SELECT id INTO target_id FROM public.assisted_planning_stages
  WHERE session_id=s.id AND plan_id=p_plan_id AND ordinal=0 AND parent_stage_id IS NULL;
 IF target_id IS NULL THEN RAISE EXCEPTION 'INVALID_STAGE_TARGET'; END IF;
 -- Lock execution/lock material until the snapshot move commits. Restart is
 -- deliberately unavailable on a day with execution or explicit human locks.
 PERFORM 1 FROM public.daily_tasks WHERE plan_id=p_plan_id FOR UPDATE;
 LOCK TABLE public.locks IN SHARE MODE;
 IF EXISTS(SELECT 1 FROM public.daily_tasks WHERE plan_id=p_plan_id AND status NOT IN ('pending','interrupted'))
  OR EXISTS(SELECT 1 FROM public.locks WHERE plan_id=p_plan_id)
 THEN RAISE EXCEPTION 'RESTART_PROTECTED_DAY'; END IF;
 IF EXISTS(SELECT 1 FROM public.planning_runs WHERE plan_id=p_plan_id AND assisted_session_id=s.id AND status IN ('queued','running'))
 THEN RAISE EXCEPTION 'RESTART_RUNNING_PROPOSAL'; END IF;
 RETURN public.assisted_move_stage(p_plan_id,target_id,false);
END $$;
REVOKE ALL ON FUNCTION public.assisted_restart_bootstrap(integer,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assisted_restart_bootstrap(integer,text,bigint) TO service_role;
