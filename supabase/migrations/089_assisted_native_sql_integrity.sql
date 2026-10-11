-- 086 uses an empty search_path for its RPCs. Their stage trigger must resolve
-- the proposal authority independently of the caller's search_path, including S0.
CREATE OR REPLACE FUNCTION public.guard_assisted_stage_proposal_plan()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.proposal_run_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.planning_runs r WHERE r.id=NEW.proposal_run_id AND r.plan_id=NEW.plan_id
   AND r.assisted_session_id=NEW.session_id AND r.base_stage_id IS NOT DISTINCT FROM NEW.parent_stage_id
   AND r.config_revision_id=NEW.config_revision_id AND r.scope_task_ids_json=NEW.scope_task_ids_json
   AND r.include_prerequisites=NEW.include_prerequisites AND r.execution_kind='ASSISTED_SCOPE'
   AND r.status='success' AND r.assisted_result_json->>'outcome'='PROPOSAL') THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 RETURN NEW;
END $$;

-- Session FOR UPDATE already serializes acceptance and pins draft_validation_id.
-- Validation rows have SELECT/INSERT privileges only. FOR SHARE would require
-- UPDATE on this immutable authority; read it without widening those grants.
CREATE OR REPLACE FUNCTION public.assisted_accept_stage(p_plan_id integer,p_user_id uuid,p_expected_fingerprint text,p_expected_base bigint,p_confirmation text DEFAULT 'NONE')
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; v public.planning_stage_validations%rowtype; new_id bigint; next_ordinal integer; item jsonb; task_item jsonb;
BEGIN
 IF p_confirmation NOT IN ('NONE','REQUIRED_DEVIATIONS','HARD_EXCEPTIONS') THEN RAISE EXCEPTION 'INVALID_CONFIRMATION'; END IF;
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 SELECT * INTO v FROM public.planning_stage_validations WHERE id=s.draft_validation_id AND session_id=s.id AND plan_id=p_plan_id;
 IF NOT FOUND OR v.draft_fingerprint<>s.draft_fingerprint OR v.config_revision_id<>s.current_config_revision_id OR v.base_stage_id IS DISTINCT FROM s.draft_base_stage_id THEN RAISE EXCEPTION 'STALE_VALIDATION'; END IF;
 IF coalesce((v.report_json->>'newHardCount')::integer,v.hard_count)>0 AND p_confirmation<>'HARD_EXCEPTIONS' THEN RAISE EXCEPTION 'HARD_CONFIRMATION_REQUIRED'; END IF;
 IF coalesce((v.report_json->>'newRequiredCount')::integer,v.required_count)>0 AND p_confirmation NOT IN ('REQUIRED_DEVIATIONS','HARD_EXCEPTIONS') THEN RAISE EXCEPTION 'REQUIRED_CONFIRMATION_REQUIRED'; END IF;
 -- daily_tasks.id is bigint in the native ledger; both arrays use that domain.
 IF (SELECT coalesce(array_agg((x->>'taskId')::bigint ORDER BY (x->>'taskId')::bigint),'{}') FROM jsonb_array_elements(s.draft_snapshot_json->'tasks') x)
    IS DISTINCT FROM (SELECT coalesce(array_agg(id::bigint ORDER BY id),'{}') FROM public.daily_tasks WHERE plan_id=p_plan_id)
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
