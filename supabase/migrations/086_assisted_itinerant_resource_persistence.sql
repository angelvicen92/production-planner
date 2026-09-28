-- Persist the explicit physical resource assignment carried by Assisted snapshot v1.
CREATE OR REPLACE FUNCTION public.assisted_apply_snapshot(p_plan_id integer, p_snapshot jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; expected_ids integer[]; actual_ids integer[];
BEGIN
  SELECT coalesce(array_agg((x->>'taskId')::integer ORDER BY (x->>'taskId')::integer),'{}')
    INTO expected_ids FROM jsonb_array_elements(p_snapshot->'tasks') x;
  SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO actual_ids FROM public.daily_tasks WHERE plan_id=p_plan_id;
  IF expected_ids IS DISTINCT FROM actual_ids THEN RAISE EXCEPTION 'TASK_SET_MISMATCH'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_snapshot->'tasks') LOOP
    UPDATE public.daily_tasks SET start_planned=item->>'startPlanned',end_planned=item->>'endPlanned',
      zone_id=(item->>'zoneId')::integer,space_id=(item->>'spaceId')::integer,
      location_label=item->>'locationLabel',duration_override=(item->>'durationOverride')::integer,
      cameras_override=(item->>'camerasOverride')::integer,
      assigned_resource_ids=CASE WHEN item ? 'assignedResourceIds' THEN item->'assignedResourceIds' ELSE assigned_resource_ids END
    WHERE plan_id=p_plan_id AND id=(item->>'taskId')::integer;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.assisted_bootstrap_session(
  p_plan_id integer,p_user_id uuid,p_identity jsonb,p_replay jsonb,p_snapshot jsonb,p_fingerprint text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; revision_id bigint; parent_id bigint; stage_id bigint; current_snapshot jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(78004,p_plan_id);
  SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE';
  IF FOUND THEN RETURN s.id; END IF;
  PERFORM 1 FROM public.daily_tasks WHERE plan_id=p_plan_id FOR SHARE;
  SELECT jsonb_build_object('contractVersion',1,'tasks',coalesce(jsonb_agg(jsonb_build_object(
    'taskId',id,'startPlanned',start_planned,'endPlanned',end_planned,'zoneId',zone_id,'spaceId',space_id,
    'locationLabel',location_label,'durationOverride',duration_override,'camerasOverride',cameras_override,
    'assignedResourceIds',coalesce(assigned_resource_ids,'[]'::jsonb)) ORDER BY id),'[]'::jsonb))
    INTO current_snapshot FROM public.daily_tasks WHERE plan_id=p_plan_id;
  IF current_snapshot IS DISTINCT FROM p_snapshot THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
  SELECT id INTO parent_id FROM public.plan_config_revisions WHERE plan_id=p_plan_id ORDER BY created_at DESC,id DESC LIMIT 1;
  IF parent_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.plan_config_revisions WHERE id=parent_id AND fingerprint=p_identity->>'configurationFingerprint') THEN revision_id:=parent_id;
  ELSE
    INSERT INTO public.plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,created_by)
    VALUES(p_plan_id,parent_id,'ASSISTED_BOOTSTRAP',p_identity->>'configurationFingerprint',p_identity,p_replay,p_user_id) RETURNING id INTO revision_id;
  END IF;
  INSERT INTO public.assisted_planning_sessions(plan_id,status,current_config_revision_id,draft_scope_json,draft_snapshot_json,draft_fingerprint)
    VALUES(p_plan_id,'ACTIVE',revision_id,'{}',p_snapshot,p_fingerprint) RETURNING id INTO s.id;
  INSERT INTO public.assisted_planning_stages(session_id,plan_id,ordinal,parent_stage_id,scope_json,scope_task_ids_json,include_prerequisites,config_revision_id,proposal_run_id,snapshot_json,snapshot_fingerprint,validation_summary_json,accepted_by,accepted_at)
    VALUES(s.id,p_plan_id,0,NULL,'{}','[]',false,revision_id,NULL,p_snapshot,p_fingerprint,'{"hardCount":0,"requiredCount":0,"preferredCount":0,"bootstrap":true}',p_user_id,now()) RETURNING id INTO stage_id;
  UPDATE public.assisted_planning_sessions SET active_stage_id=stage_id,draft_base_stage_id=stage_id WHERE id=s.id;
  RETURN s.id;
END $$;

CREATE OR REPLACE FUNCTION public.assisted_accept_stage(p_plan_id integer,p_user_id uuid,p_expected_fingerprint text,p_expected_base bigint,p_confirmation text DEFAULT 'NONE')
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; v public.planning_stage_validations%rowtype; new_id bigint; next_ordinal integer; item jsonb; task_item jsonb;
BEGIN
 IF p_confirmation NOT IN ('NONE','REQUIRED_DEVIATIONS','HARD_EXCEPTIONS') THEN RAISE EXCEPTION 'INVALID_CONFIRMATION'; END IF;
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 SELECT * INTO v FROM public.planning_stage_validations WHERE id=s.draft_validation_id AND session_id=s.id AND plan_id=p_plan_id FOR SHARE;
 IF NOT FOUND OR v.draft_fingerprint<>s.draft_fingerprint OR v.config_revision_id<>s.current_config_revision_id OR v.base_stage_id IS DISTINCT FROM s.draft_base_stage_id THEN RAISE EXCEPTION 'STALE_VALIDATION'; END IF;
 IF coalesce((v.report_json->>'newHardCount')::integer,v.hard_count)>0 AND p_confirmation<>'HARD_EXCEPTIONS' THEN RAISE EXCEPTION 'HARD_CONFIRMATION_REQUIRED'; END IF;
 IF coalesce((v.report_json->>'newRequiredCount')::integer,v.required_count)>0 AND p_confirmation NOT IN ('REQUIRED_DEVIATIONS','HARD_EXCEPTIONS') THEN RAISE EXCEPTION 'REQUIRED_CONFIRMATION_REQUIRED'; END IF;
 IF (SELECT coalesce(array_agg((x->>'taskId')::integer ORDER BY (x->>'taskId')::integer),'{}') FROM jsonb_array_elements(s.draft_snapshot_json->'tasks') x)
    IS DISTINCT FROM (SELECT coalesce(array_agg(id ORDER BY id),'{}') FROM public.daily_tasks WHERE plan_id=p_plan_id)
 THEN RAISE EXCEPTION 'TASK_SET_MISMATCH'; END IF;
 FOR task_item IN SELECT value FROM jsonb_array_elements(s.draft_snapshot_json->'tasks') LOOP
   UPDATE public.daily_tasks SET start_planned=task_item->>'startPlanned',end_planned=task_item->>'endPlanned',zone_id=(task_item->>'zoneId')::integer,
     space_id=(task_item->>'spaceId')::integer,location_label=task_item->>'locationLabel',duration_override=(task_item->>'durationOverride')::integer,
     cameras_override=(task_item->>'camerasOverride')::integer,
     assigned_resource_ids=CASE WHEN task_item ? 'assignedResourceIds' THEN task_item->'assignedResourceIds' ELSE assigned_resource_ids END
   WHERE plan_id=p_plan_id AND id=(task_item->>'taskId')::integer;
 END LOOP;
 WITH RECURSIVE obsolete AS (SELECT id FROM public.assisted_planning_stages WHERE session_id=s.id AND parent_stage_id=s.draft_base_stage_id AND archived_at IS NULL UNION ALL SELECT child.id FROM public.assisted_planning_stages child JOIN obsolete parent ON child.parent_stage_id=parent.id WHERE child.session_id=s.id AND child.archived_at IS NULL)
 UPDATE public.assisted_planning_stages SET archived_at=now() WHERE id IN (SELECT id FROM obsolete);
 SELECT coalesce(max(ordinal),-1)+1 INTO next_ordinal FROM public.assisted_planning_stages WHERE session_id=s.id;
 INSERT INTO public.assisted_planning_stages(session_id,plan_id,ordinal,parent_stage_id,scope_json,scope_task_ids_json,include_prerequisites,config_revision_id,proposal_run_id,snapshot_json,snapshot_fingerprint,validation_summary_json,accepted_by,accepted_at)
 VALUES(s.id,p_plan_id,next_ordinal,s.draft_base_stage_id,s.draft_scope_json,
   coalesce(s.draft_scope_json->'resolvedTaskIds',s.draft_scope_json->'originalScope'->'resolvedTaskIds','[]'::jsonb),
   coalesce((s.draft_scope_json->>'includePrerequisites')::boolean,(s.draft_scope_json->'originalScope'->>'includePrerequisites')::boolean,false),
   s.current_config_revision_id,
   CASE WHEN s.draft_scope_json->>'editKind' IS DISTINCT FROM 'MANUAL' THEN (s.draft_scope_json->>'proposalRunId')::bigint ELSE NULL END,
   s.draft_snapshot_json,s.draft_fingerprint,
   jsonb_build_object('hardValid',v.hard_count=0,'hardCount',v.hard_count,'requiredCount',v.required_count,'preferredCount',v.preferred_count,'validationId',v.id,'report',v.report_json),p_user_id,now()) RETURNING id INTO new_id;
 FOR item IN SELECT value FROM jsonb_array_elements(v.report_json->'violations') WHERE value->>'severity' IN ('HARD','REQUIRED') AND value->>'inheritedAcceptedExceptionId' IS NULL LOOP
   INSERT INTO public.planning_accepted_exceptions(plan_id,stage_id,severity,rule_code,violation_key,config_revision_id,snapshot_fingerprint,affected_task_ids_json,affected_resource_ids_json,affected_space_ids_json,details_json,status,accepted_by,accepted_at)
   VALUES(p_plan_id,new_id,item->>'severity',item->>'ruleCode',item->>'violationKey',s.current_config_revision_id,s.draft_fingerprint,item->'affectedTaskIds',coalesce(item->'affectedResourceIds','[]'),coalesce(item->'affectedSpaceIds','[]'),coalesce(item->'details','{}'),'ACTIVE',p_user_id,now());
 END LOOP;
 WITH RECURSIVE lineage AS (
   SELECT id,parent_stage_id,snapshot_json FROM public.assisted_planning_stages WHERE id=s.draft_base_stage_id AND session_id=s.id
   UNION ALL SELECT parent.id,parent.parent_stage_id,parent.snapshot_json FROM public.assisted_planning_stages parent JOIN lineage child ON parent.id=child.parent_stage_id WHERE parent.session_id=s.id
 ) UPDATE public.planning_accepted_exceptions exception SET status='SUPERSEDED',resolved_at=now()
 FROM lineage origin WHERE exception.stage_id=origin.id AND exception.status='ACTIVE'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(exception.affected_task_ids_json) affected WHERE
     (SELECT task FROM jsonb_array_elements(origin.snapshot_json->'tasks') task WHERE task->>'taskId'=affected#>>'{}') IS DISTINCT FROM
     (SELECT task FROM jsonb_array_elements(s.draft_snapshot_json->'tasks') task WHERE task->>'taskId'=affected#>>'{}'));
 UPDATE public.assisted_planning_sessions SET active_stage_id=new_id,draft_base_stage_id=new_id,draft_scope_json='{}',draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
 RETURN new_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CONCURRENT_ACCEPT'; END $$;


REVOKE ALL ON FUNCTION public.assisted_apply_snapshot(integer,jsonb), public.assisted_bootstrap_session(integer,uuid,jsonb,jsonb,jsonb,text), public.assisted_accept_stage(integer,uuid,text,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.assisted_bootstrap_session(integer,uuid,jsonb,jsonb,jsonb,text), public.assisted_accept_stage(integer,uuid,text,bigint,text) TO service_role;
