-- ASST-006: certify an applied ASST-005 proposal without claiming full-day completeness.
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

  SELECT * INTO r FROM public.planning_runs WHERE id=proposal_run_id;
  IF NOT FOUND OR r.plan_id<>p_plan_id OR r.execution_kind<>'ASSISTED_SCOPE'
    OR r.assisted_session_id<>s.id OR r.base_stage_id IS DISTINCT FROM s.draft_base_stage_id
    OR r.config_revision_id<>s.current_config_revision_id OR r.status<>'success'
    OR r.assisted_result_json IS NULL
  THEN RAISE EXCEPTION 'VALIDATION_REQUIRED'; END IF;

  result := r.assisted_result_json;
  evidence := result->'evidence';
  IF r.result_fingerprint IS NULL
    OR r.result_fingerprint<>encode(digest(convert_to(result::text,'UTF8'),'sha256'),'hex')
    OR result->>'contractVersion' IS DISTINCT FROM '1' OR result->>'outcome' IS DISTINCT FROM 'PROPOSAL'
    OR jsonb_typeof(result->'proposal') IS DISTINCT FROM 'array'
    OR jsonb_array_length(result->'proposal')=0
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

  report := jsonb_build_object(
    'mode','PROPOSAL_CERTIFIED_CLEAN_V1', 'proposalRunId',proposal_run_id,
    'scopeTaskIds',r.scope_task_ids_json, 'includePrerequisites',r.include_prerequisites,
    'hardAssessment','CLEAN', 'requiredAssessment','CLEAN',
    'preferredAssessment','NOT_CLASSIFIED');
  INSERT INTO public.planning_stage_validations(plan_id,session_id,base_stage_id,draft_fingerprint,
    config_revision_id,hard_count,required_count,preferred_count,report_json)
  VALUES(p_plan_id,s.id,s.draft_base_stage_id,s.draft_fingerprint,s.current_config_revision_id,
    0,0,0,report) RETURNING id INTO validation_id;
  UPDATE public.assisted_planning_sessions SET draft_validation_id=validation_id,updated_at=now() WHERE id=s.id;
  RETURN validation_id;
END $$;
REVOKE ALL ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) FROM anon;
REVOKE ALL ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) FROM authenticated;
REVOKE ALL ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) FROM service_role;
GRANT EXECUTE ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) TO service_role;

-- Assisted workflow mutations are server-only. Keep authenticated reads governed
-- by the existing RLS policies, but close the historical direct-write grants from 077.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.plan_config_revisions,
  public.assisted_planning_sessions,
  public.assisted_planning_stages,
  public.planning_stage_validations,
  public.planning_accepted_exceptions
FROM authenticated;
