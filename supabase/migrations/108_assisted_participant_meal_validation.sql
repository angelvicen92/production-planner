-- P0-U00g: certify materialized obligations, including participant meals.
-- Historical 104 remains unchanged. No caller-supplied evidence or scope.
CREATE FUNCTION public.assisted_assert_scope_materialization(p_run_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 r public.planning_runs%rowtype;
 b public.assisted_planning_stages%rowtype;
 p public.plans%rowtype;
 result jsonb; candidate jsonb; previous jsonb; row jsonb; placement jsonb;
 witnesses jsonb; meal jsonb; workday jsonb; meal_template bigint;
 task public.daily_tasks%rowtype; participant public.contestants%rowtype;
 start_min integer; end_min integer; duration_min integer; changed integer:=0;
BEGIN
 SELECT * INTO r FROM public.planning_runs WHERE id=p_run_id FOR SHARE;
 SELECT * INTO b FROM public.assisted_planning_stages WHERE id=r.base_stage_id
   AND session_id=r.assisted_session_id AND plan_id=r.plan_id;
 IF NOT FOUND OR b.snapshot_fingerprint IS DISTINCT FROM r.source_draft_fingerprint
   OR NOT public.positive_integer_jsonb_array(r.scope_task_ids_json)
   OR jsonb_array_length(r.scope_task_ids_json)=0
   OR jsonb_array_length(r.scope_task_ids_json)<>(SELECT count(DISTINCT value) FROM jsonb_array_elements(r.scope_task_ids_json))
 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=r.plan_id FOR SHARE;
 result:=r.assisted_result_json; candidate:=result->'proposedDraftSnapshot';
 IF jsonb_array_length(result->'proposal')=0 AND
   (candidate-'tasks') IS DISTINCT FROM (b.snapshot_json-'tasks')
 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 IF jsonb_typeof(candidate->'tasks') IS DISTINCT FROM 'array'
   OR jsonb_array_length(candidate->'tasks')<>jsonb_array_length(b.snapshot_json->'tasks')
   OR jsonb_array_length(candidate->'tasks')<>(SELECT count(DISTINCT value->>'taskId') FROM jsonb_array_elements(candidate->'tasks'))
 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 SELECT replay_snapshot_json->'authorities'->'plan_workday'->0 INTO workday
   FROM public.plan_config_revisions WHERE id=r.config_revision_id AND plan_id=r.plan_id;
 meal_template:=(workday->'plannerNextAuthorities'->>'mealTaskTemplateId')::bigint;
 witnesses:=coalesce(result->'evidence'->'selectedMealWitnesses'->'participant'->'scheduled','[]'::jsonb);
 IF jsonb_typeof(witnesses) IS DISTINCT FROM 'array'
   OR jsonb_array_length(witnesses)<>(SELECT count(DISTINCT value->>'sourceTaskId') FROM jsonb_array_elements(witnesses))
   OR jsonb_array_length(witnesses)<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(witnesses))
 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(candidate->'tasks') LOOP
   SELECT value INTO previous FROM jsonb_array_elements(b.snapshot_json->'tasks') WHERE value->'taskId'=row->'taskId';
   IF previous IS NULL THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
   IF row IS DISTINCT FROM previous THEN
     changed:=changed+1;
     -- Accepted placements are automatically protected, independent of execution.
     IF previous->>'startPlanned' IS NOT NULL OR previous->>'endPlanned' IS NOT NULL
       OR NOT (r.scope_task_ids_json @> jsonb_build_array(row->'taskId'))
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
     SELECT value INTO placement FROM jsonb_array_elements(result->'proposal') WHERE value->'taskId'=row->'taskId';
     SELECT * INTO task FROM public.daily_tasks WHERE id=(row->>'taskId')::bigint AND plan_id=r.plan_id;
     IF NOT FOUND OR task.status IN ('done','in_progress','cancelled') THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
     IF placement IS NOT NULL THEN
       IF row->'startPlanned' IS DISTINCT FROM placement->'startPlanned'
         OR row->'endPlanned' IS DISTINCT FROM placement->'endPlanned'
         OR row->'spaceId' IS DISTINCT FROM placement->'spaceId'
         OR row->'zoneId' IS DISTINCT FROM placement->'zoneId'
        OR (row - ARRAY['startPlanned','endPlanned','spaceId','zoneId','itinerantTeamId','assignedResourceIds'])
          IS DISTINCT FROM (previous - ARRAY['startPlanned','endPlanned','spaceId','zoneId','itinerantTeamId','assignedResourceIds'])
       THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
     ELSIF task.template_id IS DISTINCT FROM meal_template OR p.meal_mode<>'flexible_meal_window' THEN
       RAISE EXCEPTION 'RUN_RESULT_INVALID';
     END IF;
   END IF;
   -- Every persisted meal must have an exact, genuine witness under this revision.
   IF row->>'startPlanned' IS NOT NULL AND EXISTS (SELECT 1 FROM public.daily_tasks d
       WHERE d.id=(row->>'taskId')::bigint AND d.plan_id=r.plan_id AND d.template_id=meal_template) THEN
     SELECT * INTO task FROM public.daily_tasks WHERE id=(row->>'taskId')::bigint AND plan_id=r.plan_id;
     SELECT * INTO participant FROM public.contestants WHERE id=task.contestant_id AND plan_id=r.plan_id;
     IF NOT FOUND OR task.status='cancelled' THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
     SELECT value INTO meal FROM jsonb_array_elements(witnesses) WHERE value->>'sourceTaskId'='task:'||task.id;
     IF meal IS NULL OR meal->>'id' IS DISTINCT FROM 'participant-meal:'||task.id
       OR meal->>'participantId' IS DISTINCT FROM 'participant:'||task.contestant_id
       OR coalesce(row->>'startPlanned','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR coalesce(row->>'endPlanned','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR row->'spaceId' IS DISTINCT FROM 'null'::jsonb
       OR (row - ARRAY['startPlanned','endPlanned','spaceId']) IS DISTINCT FROM (previous - ARRAY['startPlanned','endPlanned','spaceId'])
       OR result->'evidence'->>'globalMealGate' IS DISTINCT FROM 'PASS'
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
     IF EXISTS (SELECT 1 FROM jsonb_array_elements(candidate->'tasks') other JOIN public.daily_tasks d
       ON d.id=(other->>'taskId')::bigint AND d.plan_id=r.plan_id AND d.contestant_id=task.contestant_id
       WHERE d.id<>task.id AND other->>'startPlanned'<row->>'endPlanned' AND other->>'endPlanned'>row->>'startPlanned')
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
     IF EXISTS (SELECT 1 FROM jsonb_array_elements(workday->'plannerNextAuthorities'->'taskOperations') operation,
       jsonb_array_elements(operation->'dependsOnTaskIds') dependency,
       jsonb_array_elements(candidate->'tasks') predecessor
       WHERE operation->'taskId'=row->'taskId' AND predecessor->'taskId'=dependency
         AND predecessor->>'endPlanned'>row->>'startPlanned')
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
     start_min:=split_part(row->>'startPlanned',':',1)::integer*60+split_part(row->>'startPlanned',':',2)::integer;
     end_min:=split_part(row->>'endPlanned',':',1)::integer*60+split_part(row->>'endPlanned',':',2)::integer;
     duration_min:=coalesce(nullif(task.duration_override,0),p.contestant_meal_duration_minutes);
     IF meal->>'start' IS DISTINCT FROM start_min::text OR meal->>'end' IS DISTINCT FROM end_min::text
       OR meal->>'duration' IS DISTINCT FROM duration_min::text OR end_min-start_min<>duration_min
       OR row->>'startPlanned'<greatest(p.work_start,p.meal_start,participant.availability_start)
       OR row->>'endPlanned'>least(p.work_end,p.meal_end,participant.availability_end)
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
   END IF;
 END LOOP;
 IF changed=0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(r.scope_task_ids_json) scope_id
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(candidate->'tasks') t
     WHERE t->'taskId'=scope_id AND t->>'startPlanned' IS NOT NULL AND t->>'endPlanned' IS NOT NULL))
 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 -- Capacity covers accepted and newly materialized meals together. Half-open intervals.
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(candidate->'tasks') anchor
   WHERE (SELECT count(*) FROM jsonb_array_elements(candidate->'tasks') t JOIN public.daily_tasks d
     ON d.id=(t->>'taskId')::bigint AND d.plan_id=r.plan_id AND d.template_id=meal_template
     WHERE t->>'startPlanned'<=anchor->>'startPlanned' AND t->>'endPlanned'>anchor->>'startPlanned')>p.contestant_meal_max_simultaneous)
 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assisted_assert_scope_materialization(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.assisted_assert_scope_materialization(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.assisted_record_proposal_clean_validation(
  p_plan_id integer, p_expected_fingerprint text, p_expected_base bigint,
  p_expected_config bigint
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  s public.assisted_planning_sessions%rowtype;
  r public.planning_runs%rowtype;
  result jsonb;
  evidence jsonb;
  proposal_run_id bigint;
  validation_id bigint;
  report jsonb;
BEGIN
  SELECT * INTO s FROM public.assisted_planning_sessions
    WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
  IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
  IF s.current_config_revision_id<>p_expected_config THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;

  IF jsonb_typeof(s.draft_scope_json) IS DISTINCT FROM 'object'
    OR coalesce(s.draft_scope_json->>'proposalRunId','') !~ '^[1-9][0-9]*$'
    OR jsonb_typeof(s.draft_scope_json->'resolvedTaskIds') IS DISTINCT FROM 'array'
    OR jsonb_typeof(s.draft_scope_json->'includePrerequisites') IS DISTINCT FROM 'boolean'
  THEN RAISE EXCEPTION 'VALIDATION_REQUIRED'; END IF;
  proposal_run_id := (s.draft_scope_json->>'proposalRunId')::bigint;

  SELECT * INTO r FROM public.planning_runs WHERE id=proposal_run_id FOR SHARE;
  IF NOT FOUND OR r.plan_id<>p_plan_id OR r.execution_kind<>'ASSISTED_SCOPE'
    OR r.assisted_session_id<>s.id OR r.base_stage_id IS DISTINCT FROM s.draft_base_stage_id
    OR r.config_revision_id<>s.current_config_revision_id OR r.status<>'success'
    OR r.assisted_result_json IS NULL
  THEN RAISE EXCEPTION 'VALIDATION_REQUIRED'; END IF;

  result := r.assisted_result_json;
  evidence := result->'evidence';
  IF r.result_fingerprint IS NULL
    OR r.result_fingerprint<>encode(extensions.digest(convert_to(result::text,'UTF8'),'sha256'),'hex')
    OR result->>'contractVersion' IS DISTINCT FROM '1' OR result->>'outcome' IS DISTINCT FROM 'PROPOSAL'
    OR jsonb_typeof(result->'proposal') IS DISTINCT FROM 'array'
    OR jsonb_typeof(result->'proposedDraftSnapshot') IS DISTINCT FROM 'object'
    OR result->'proposedDraftSnapshot' IS DISTINCT FROM s.draft_snapshot_json
    OR result->>'proposedDraftFingerprint' IS DISTINCT FROM s.draft_fingerprint
    OR result->'scopeTaskIds' IS DISTINCT FROM r.scope_task_ids_json
    OR result->'scopeTaskIds' IS DISTINCT FROM s.draft_scope_json->'resolvedTaskIds'
    OR result->'includePrerequisites' IS DISTINCT FROM to_jsonb(r.include_prerequisites)
    OR result->'includePrerequisites' IS DISTINCT FROM s.draft_scope_json->'includePrerequisites'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(result->'proposal') item
      WHERE jsonb_typeof(item) IS DISTINCT FROM 'object' OR coalesce(item->>'taskId','') !~ '^[1-9][0-9]*$'
      OR coalesce(item->>'startPlanned','')='' OR coalesce(item->>'endPlanned','')=''
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.scope_task_ids_json) scope_id
        WHERE scope_id #>> '{}' = item->>'taskId'))
    OR (SELECT count(*) FROM jsonb_array_elements(result->'proposal'))
      <> (SELECT count(DISTINCT item->>'taskId') FROM jsonb_array_elements(result->'proposal') item)
  THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;

  IF jsonb_typeof(evidence) IS DISTINCT FROM 'object'
    OR evidence->>'proposalCount' IS DISTINCT FROM '1'
    OR evidence->>'completeForScope' IS DISTINCT FROM 'true'
    OR evidence->>'protectedPlacementsPreserved' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
  IF evidence->>'hardValid' IS DISTINCT FROM 'true' OR evidence->>'requiredValid' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'VALIDATION_NOT_ACCEPTABLE'; END IF;

  PERFORM public.assisted_assert_scope_materialization(r.id);

  report := jsonb_build_object(
    'mode','PROPOSAL_CERTIFIED_CLEAN_V1', 'proposalRunId',proposal_run_id,
    'scopeTaskIds',r.scope_task_ids_json, 'includePrerequisites',r.include_prerequisites,
    'hardAssessment','CLEAN', 'requiredAssessment','CLEAN',
    'preferredAssessment',CASE WHEN evidence ? 'operationContinuity' THEN 'OPERATION_CONTINUITY_QUANTIFIED' ELSE 'NOT_CLASSIFIED' END)
    || CASE WHEN evidence ? 'operationContinuity' THEN jsonb_build_object('operationContinuity',evidence->'operationContinuity') ELSE '{}'::jsonb END;
  INSERT INTO public.planning_stage_validations(plan_id,session_id,base_stage_id,draft_fingerprint,
    config_revision_id,hard_count,required_count,preferred_count,report_json)
  VALUES(p_plan_id,s.id,s.draft_base_stage_id,s.draft_fingerprint,s.current_config_revision_id,
    0,0,(SELECT count(*) FROM jsonb_array_elements(coalesce(evidence->'operationContinuity','[]'::jsonb)) g WHERE g->>'policy'='PREFERRED' AND (g->>'gapMinutes')::integer>0),report) RETURNING id INTO validation_id;
  UPDATE public.assisted_planning_sessions SET draft_validation_id=validation_id,updated_at=now() WHERE id=s.id;
  RETURN validation_id;
END $$;
REVOKE ALL ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) FROM anon;
REVOKE ALL ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) FROM authenticated;
REVOKE ALL ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) FROM service_role;
GRANT EXECUTE ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) TO service_role;
