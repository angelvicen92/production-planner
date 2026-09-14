-- ASST-004: server-only atomic assisted-planning workflow.
CREATE UNIQUE INDEX assisted_planning_stages_one_live_child
  ON public.assisted_planning_stages(session_id, parent_stage_id)
  WHERE archived_at IS NULL AND parent_stage_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assisted_apply_snapshot(p_plan_id integer, p_snapshot jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item jsonb; expected_ids integer[]; actual_ids integer[];
BEGIN
  SELECT coalesce(array_agg((x->>'taskId')::integer ORDER BY (x->>'taskId')::integer), '{}')
    INTO expected_ids FROM jsonb_array_elements(p_snapshot->'tasks') x;
  SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO actual_ids FROM daily_tasks WHERE plan_id=p_plan_id;
  IF expected_ids IS DISTINCT FROM actual_ids THEN RAISE EXCEPTION 'TASK_SET_MISMATCH'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_snapshot->'tasks') LOOP
    UPDATE daily_tasks SET start_planned=item->>'startPlanned', end_planned=item->>'endPlanned',
      zone_id=(item->>'zoneId')::integer, space_id=(item->>'spaceId')::integer,
      location_label=item->>'locationLabel', duration_override=(item->>'durationOverride')::integer,
      cameras_override=(item->>'camerasOverride')::integer
    WHERE plan_id=p_plan_id AND id=(item->>'taskId')::integer;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.assisted_bootstrap_session(
  p_plan_id integer, p_user_id uuid, p_identity jsonb, p_replay jsonb, p_snapshot jsonb, p_fingerprint text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s assisted_planning_sessions%rowtype; revision_id bigint; parent_id bigint; stage_id bigint; current_snapshot jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(78004, p_plan_id);
  SELECT * INTO s FROM assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE';
  IF FOUND THEN RETURN s.id; END IF;
  PERFORM 1 FROM daily_tasks WHERE plan_id=p_plan_id FOR SHARE;
  SELECT jsonb_build_object('contractVersion',1,'tasks',coalesce(jsonb_agg(jsonb_build_object(
    'taskId',id,'startPlanned',start_planned,'endPlanned',end_planned,'zoneId',zone_id,'spaceId',space_id,
    'locationLabel',location_label,'durationOverride',duration_override,'camerasOverride',cameras_override) ORDER BY id),'[]'::jsonb))
    INTO current_snapshot FROM daily_tasks WHERE plan_id=p_plan_id;
  IF current_snapshot IS DISTINCT FROM p_snapshot THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
  SELECT id INTO parent_id FROM plan_config_revisions WHERE plan_id=p_plan_id ORDER BY created_at DESC,id DESC LIMIT 1;
  IF parent_id IS NOT NULL AND EXISTS (SELECT 1 FROM plan_config_revisions WHERE id=parent_id AND fingerprint=p_identity->>'configurationFingerprint') THEN
    revision_id:=parent_id;
  ELSE
    INSERT INTO plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,created_by)
    VALUES(p_plan_id,parent_id,'ASSISTED_BOOTSTRAP',p_identity->>'configurationFingerprint',p_identity,p_replay,p_user_id) RETURNING id INTO revision_id;
  END IF;
  INSERT INTO assisted_planning_sessions(plan_id,status,current_config_revision_id,draft_scope_json,draft_snapshot_json,draft_fingerprint)
    VALUES(p_plan_id,'ACTIVE',revision_id,'{}',p_snapshot,p_fingerprint) RETURNING id INTO s.id;
  INSERT INTO assisted_planning_stages(session_id,plan_id,ordinal,parent_stage_id,scope_json,scope_task_ids_json,include_prerequisites,
    config_revision_id,proposal_run_id,snapshot_json,snapshot_fingerprint,validation_summary_json,accepted_by,accepted_at)
    VALUES(s.id,p_plan_id,0,NULL,'{}','[]',false,revision_id,NULL,p_snapshot,p_fingerprint,'{"hardCount":0,"requiredCount":0,"preferredCount":0,"bootstrap":true}',p_user_id,now()) RETURNING id INTO stage_id;
  UPDATE assisted_planning_sessions SET active_stage_id=stage_id,draft_base_stage_id=stage_id WHERE id=s.id;
  RETURN s.id;
END $$;

CREATE OR REPLACE FUNCTION public.assisted_patch_draft(p_plan_id integer,p_expected_fingerprint text,p_expected_base bigint,p_snapshot jsonb,p_fingerprint text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s assisted_planning_sessions%rowtype;
BEGIN
 SELECT * INTO s FROM assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 UPDATE assisted_planning_sessions SET draft_snapshot_json=p_snapshot,draft_fingerprint=p_fingerprint,draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
 RETURN s.id;
END $$;

CREATE OR REPLACE FUNCTION public.assisted_accept_stage(p_plan_id integer,p_user_id uuid,p_expected_fingerprint text,p_expected_base bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s assisted_planning_sessions%rowtype; v planning_stage_validations%rowtype; new_id bigint; next_ordinal integer;
BEGIN
 SELECT * INTO s FROM assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 IF s.draft_validation_id IS NULL THEN RAISE EXCEPTION 'VALIDATION_REQUIRED'; END IF;
 SELECT * INTO v FROM planning_stage_validations WHERE id=s.draft_validation_id AND session_id=s.id AND plan_id=p_plan_id;
 IF NOT FOUND OR v.draft_fingerprint<>s.draft_fingerprint OR v.config_revision_id<>s.current_config_revision_id OR v.base_stage_id IS DISTINCT FROM s.draft_base_stage_id THEN RAISE EXCEPTION 'STALE_VALIDATION'; END IF;
 IF v.hard_count<>0 OR v.required_count<>0 THEN RAISE EXCEPTION 'VALIDATION_NOT_ACCEPTABLE'; END IF;
 PERFORM assisted_apply_snapshot(p_plan_id,s.draft_snapshot_json);
 WITH RECURSIVE obsolete AS (
   SELECT id FROM assisted_planning_stages WHERE session_id=s.id AND parent_stage_id=s.draft_base_stage_id AND archived_at IS NULL
   UNION ALL SELECT child.id FROM assisted_planning_stages child JOIN obsolete parent ON child.parent_stage_id=parent.id
     WHERE child.session_id=s.id AND child.archived_at IS NULL
 ) UPDATE assisted_planning_stages SET archived_at=now() WHERE id IN (SELECT id FROM obsolete);
 SELECT coalesce(max(ordinal),-1)+1 INTO next_ordinal FROM assisted_planning_stages WHERE session_id=s.id;
 INSERT INTO assisted_planning_stages(session_id,plan_id,ordinal,parent_stage_id,scope_json,scope_task_ids_json,include_prerequisites,config_revision_id,proposal_run_id,snapshot_json,snapshot_fingerprint,validation_summary_json,accepted_by,accepted_at)
 VALUES(s.id,p_plan_id,next_ordinal,s.draft_base_stage_id,'{}','[]',false,s.current_config_revision_id,NULL,s.draft_snapshot_json,s.draft_fingerprint,
 jsonb_build_object('hardCount',v.hard_count,'requiredCount',v.required_count,'preferredCount',v.preferred_count,'validationId',v.id),p_user_id,now()) RETURNING id INTO new_id;
 UPDATE assisted_planning_sessions SET active_stage_id=new_id,draft_base_stage_id=new_id,draft_scope_json='{}',draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
 RETURN new_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CONCURRENT_ACCEPT'; END $$;

CREATE OR REPLACE FUNCTION public.assisted_move_stage(p_plan_id integer,p_target bigint,p_redo boolean)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s assisted_planning_sessions%rowtype; target assisted_planning_stages%rowtype; cursor_id bigint;
BEGIN
 SELECT * INTO s FROM assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF p_redo THEN
   SELECT * INTO target FROM assisted_planning_stages WHERE session_id=s.id AND plan_id=p_plan_id AND parent_stage_id=s.active_stage_id AND archived_at IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'NO_REDO_AVAILABLE'; END IF;
 ELSE
   SELECT * INTO target FROM assisted_planning_stages WHERE id=p_target AND session_id=s.id AND plan_id=p_plan_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STAGE_TARGET'; END IF;
   cursor_id:=s.active_stage_id;
   LOOP EXIT WHEN cursor_id=target.id; SELECT parent_stage_id INTO cursor_id FROM assisted_planning_stages WHERE id=cursor_id AND session_id=s.id; IF cursor_id IS NULL THEN RAISE EXCEPTION 'INVALID_STAGE_TARGET'; END IF; END LOOP;
 END IF;
 PERFORM assisted_apply_snapshot(p_plan_id,target.snapshot_json);
 UPDATE assisted_planning_sessions SET active_stage_id=target.id,draft_base_stage_id=target.id,draft_snapshot_json=target.snapshot_json,
 draft_fingerprint=target.snapshot_fingerprint,draft_scope_json='{}',draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
 RETURN target.id;
END $$;

REVOKE ALL ON FUNCTION public.assisted_apply_snapshot(integer,jsonb), public.assisted_bootstrap_session(integer,uuid,jsonb,jsonb,jsonb,text),
 public.assisted_patch_draft(integer,text,bigint,jsonb,text), public.assisted_accept_stage(integer,uuid,text,bigint), public.assisted_move_stage(integer,bigint,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.assisted_apply_snapshot(integer,jsonb), public.assisted_bootstrap_session(integer,uuid,jsonb,jsonb,jsonb,text),
 public.assisted_patch_draft(integer,text,bigint,jsonb,text), public.assisted_accept_stage(integer,uuid,text,bigint), public.assisted_move_stage(integer,bigint,boolean) FROM service_role;
GRANT EXECUTE ON FUNCTION public.assisted_bootstrap_session(integer,uuid,jsonb,jsonb,jsonb,text), public.assisted_patch_draft(integer,text,bigint,jsonb,text),
 public.assisted_accept_stage(integer,uuid,text,bigint), public.assisted_move_stage(integer,bigint,boolean) TO service_role;
