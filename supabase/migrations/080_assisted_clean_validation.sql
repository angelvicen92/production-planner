-- ASST-006: atomically persist server-computed clean-only draft validation.
CREATE OR REPLACE FUNCTION public.assisted_record_clean_validation(
  p_plan_id integer, p_expected_fingerprint text, p_expected_base bigint,
  p_expected_config bigint, p_report jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s assisted_planning_sessions%rowtype; validation_id bigint;
BEGIN
  SELECT * INTO s FROM assisted_planning_sessions
    WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
  IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
  IF s.current_config_revision_id<>p_expected_config THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  IF jsonb_typeof(p_report)<>'object' OR p_report->>'mode'<>'CLEAN_ONLY_V1'
    OR p_report->>'hardValid'<>'true' THEN RAISE EXCEPTION 'VALIDATION_NOT_ACCEPTABLE'; END IF;
  INSERT INTO planning_stage_validations(plan_id,session_id,base_stage_id,draft_fingerprint,
    config_revision_id,hard_count,required_count,preferred_count,report_json)
  VALUES(p_plan_id,s.id,s.draft_base_stage_id,s.draft_fingerprint,s.current_config_revision_id,
    0,0,0,p_report) RETURNING id INTO validation_id;
  UPDATE assisted_planning_sessions SET draft_validation_id=validation_id,updated_at=now() WHERE id=s.id;
  RETURN validation_id;
END $$;
REVOKE ALL ON FUNCTION public.assisted_record_clean_validation(integer,text,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assisted_record_clean_validation(integer,text,bigint,bigint,jsonb) TO service_role;
