-- ASST-008: current validation reports may contain human-authored deviations.
ALTER TABLE public.planning_accepted_exceptions
  ADD COLUMN config_revision_id bigint REFERENCES public.plan_config_revisions(id),
  ADD COLUMN snapshot_fingerprint text,
  ADD COLUMN affected_resource_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN affected_space_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.planning_accepted_exceptions exception SET
  config_revision_id=stage.config_revision_id,
  snapshot_fingerprint=stage.snapshot_fingerprint
FROM public.assisted_planning_stages stage WHERE stage.id=exception.stage_id;
ALTER TABLE public.planning_accepted_exceptions ALTER COLUMN config_revision_id SET NOT NULL, ALTER COLUMN snapshot_fingerprint SET NOT NULL;

ALTER TABLE public.planning_accepted_exceptions
  ADD CONSTRAINT planning_accepted_exceptions_config_plan_fk FOREIGN KEY (config_revision_id,plan_id)
    REFERENCES public.plan_config_revisions(id,plan_id),
  ADD CONSTRAINT planning_accepted_exceptions_snapshot_fingerprint_check CHECK (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT planning_accepted_exceptions_resource_ids_check CHECK (public.is_positive_integer_jsonb_array(affected_resource_ids_json)),
  ADD CONSTRAINT planning_accepted_exceptions_space_ids_check CHECK (public.is_positive_integer_jsonb_array(affected_space_ids_json)),
  ADD CONSTRAINT planning_accepted_exceptions_hard_only_check CHECK (severity='HARD');
CREATE UNIQUE INDEX planning_accepted_exceptions_stage_violation_key
  ON public.planning_accepted_exceptions(stage_id,violation_key);

CREATE OR REPLACE FUNCTION public.assisted_record_stage_validation(
  p_plan_id integer,p_expected_fingerprint text,p_expected_base bigint,p_expected_config bigint,p_report jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; validation_id bigint;
BEGIN
  SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
  IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
  IF s.current_config_revision_id<>p_expected_config THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  IF p_report->>'contractVersion'<>'1' OR jsonb_typeof(p_report->'violations') IS DISTINCT FROM 'array'
    OR coalesce(p_report->>'hardCount','') !~ '^\d+$' OR coalesce(p_report->>'requiredCount','') !~ '^\d+$'
    OR (p_report->>'hardCount')::integer<>(SELECT count(*) FROM jsonb_array_elements(p_report->'violations') x WHERE x->>'severity'='HARD')
    OR (p_report->>'requiredCount')::integer<>(SELECT count(*) FROM jsonb_array_elements(p_report->'violations') x WHERE x->>'severity'='REQUIRED')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_report->'violations') x WHERE x->>'severity' NOT IN ('HARD','REQUIRED','PREFERRED') OR coalesce(x->>'ruleCode','')='' OR coalesce(x->>'violationKey','')='')
  THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
  INSERT INTO public.planning_stage_validations(plan_id,session_id,base_stage_id,draft_fingerprint,config_revision_id,hard_count,required_count,preferred_count,report_json)
    VALUES(p_plan_id,s.id,s.draft_base_stage_id,s.draft_fingerprint,s.current_config_revision_id,
      (p_report->>'hardCount')::integer,(p_report->>'requiredCount')::integer,coalesce((p_report->>'preferredCount')::integer,0),p_report)
    RETURNING id INTO validation_id;
  UPDATE public.assisted_planning_sessions SET draft_validation_id=validation_id,updated_at=now() WHERE id=s.id;
  RETURN validation_id;
END $$;

DROP FUNCTION public.assisted_accept_stage(integer,uuid,text,bigint);
CREATE FUNCTION public.assisted_accept_stage(p_plan_id integer,p_user_id uuid,p_expected_fingerprint text,p_expected_base bigint,p_confirmation text DEFAULT 'NONE')
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
     space_id=(task_item->>'spaceId')::integer,location_label=task_item->>'locationLabel',duration_override=(task_item->>'durationOverride')::integer,cameras_override=(task_item->>'camerasOverride')::integer
   WHERE plan_id=p_plan_id AND id=(task_item->>'taskId')::integer;
 END LOOP;
 WITH RECURSIVE obsolete AS (SELECT id FROM public.assisted_planning_stages WHERE session_id=s.id AND parent_stage_id=s.draft_base_stage_id AND archived_at IS NULL UNION ALL SELECT child.id FROM public.assisted_planning_stages child JOIN obsolete parent ON child.parent_stage_id=parent.id WHERE child.session_id=s.id AND child.archived_at IS NULL)
 UPDATE public.assisted_planning_stages SET archived_at=now() WHERE id IN (SELECT id FROM obsolete);
 SELECT coalesce(max(ordinal),-1)+1 INTO next_ordinal FROM public.assisted_planning_stages WHERE session_id=s.id;
 INSERT INTO public.assisted_planning_stages(session_id,plan_id,ordinal,parent_stage_id,scope_json,scope_task_ids_json,include_prerequisites,config_revision_id,proposal_run_id,snapshot_json,snapshot_fingerprint,validation_summary_json,accepted_by,accepted_at)
 VALUES(s.id,p_plan_id,next_ordinal,s.draft_base_stage_id,'{}','[]',false,s.current_config_revision_id,NULL,s.draft_snapshot_json,s.draft_fingerprint,
   jsonb_build_object('hardValid',v.hard_count=0,'hardCount',v.hard_count,'requiredCount',v.required_count,'preferredCount',v.preferred_count,'validationId',v.id,'report',v.report_json),p_user_id,now()) RETURNING id INTO new_id;
 FOR item IN SELECT value FROM jsonb_array_elements(v.report_json->'violations') WHERE value->>'severity'='HARD' AND value->>'inheritedAcceptedExceptionId' IS NULL LOOP
   INSERT INTO public.planning_accepted_exceptions(plan_id,stage_id,severity,rule_code,violation_key,config_revision_id,snapshot_fingerprint,affected_task_ids_json,affected_resource_ids_json,affected_space_ids_json,details_json,status,accepted_by,accepted_at)
   VALUES(p_plan_id,new_id,'HARD',item->>'ruleCode',item->>'violationKey',s.current_config_revision_id,s.draft_fingerprint,item->'affectedTaskIds',coalesce(item->'affectedResourceIds','[]'),coalesce(item->'affectedSpaceIds','[]'),coalesce(item->'details','{}'),'ACTIVE',p_user_id,now());
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

REVOKE ALL ON FUNCTION public.assisted_record_stage_validation(integer,text,bigint,bigint,jsonb), public.assisted_accept_stage(integer,uuid,text,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.assisted_record_stage_validation(integer,text,bigint,bigint,jsonb), public.assisted_accept_stage(integer,uuid,text,bigint,text) TO service_role;
