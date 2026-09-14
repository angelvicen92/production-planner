-- ASST-005: planning_runs is the sole assisted execution/result authority.
ALTER TABLE public.planning_runs
  ADD COLUMN execution_kind text NOT NULL DEFAULT 'FULL_PLAN',
  ADD COLUMN assisted_session_id bigint,
  ADD COLUMN base_stage_id bigint,
  ADD COLUMN config_revision_id bigint,
  ADD COLUMN scope_json jsonb,
  ADD COLUMN scope_task_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN include_prerequisites boolean NOT NULL DEFAULT false,
  ADD COLUMN source_draft_fingerprint text,
  ADD COLUMN result_fingerprint text,
  ADD COLUMN assisted_result_json jsonb;

CREATE FUNCTION public.positive_integer_jsonb_array(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT jsonb_typeof(value)='array' AND NOT EXISTS (
   SELECT 1 FROM jsonb_array_elements(value) item
   WHERE jsonb_typeof(item)<>'number' OR (item #>> '{}')::numeric<=0 OR (item #>> '{}')::numeric<>trunc((item #>> '{}')::numeric));
$$;
ALTER TABLE public.planning_runs
 ADD CONSTRAINT planning_runs_execution_kind_check CHECK (execution_kind IN ('FULL_PLAN','ASSISTED_SCOPE')),
 ADD CONSTRAINT planning_runs_scope_task_ids_check CHECK (positive_integer_jsonb_array(scope_task_ids_json)),
 ADD CONSTRAINT planning_runs_source_draft_fingerprint_check CHECK (source_draft_fingerprint IS NULL OR source_draft_fingerprint ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT planning_runs_result_fingerprint_check CHECK (result_fingerprint IS NULL OR result_fingerprint ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT planning_runs_assisted_session_fk FOREIGN KEY (assisted_session_id,plan_id) REFERENCES assisted_planning_sessions(id,plan_id),
 ADD CONSTRAINT planning_runs_base_stage_fk FOREIGN KEY (base_stage_id,assisted_session_id,plan_id) REFERENCES assisted_planning_stages(id,session_id,plan_id),
 ADD CONSTRAINT planning_runs_config_revision_fk FOREIGN KEY (config_revision_id,plan_id) REFERENCES plan_config_revisions(id,plan_id),
 ADD CONSTRAINT planning_runs_assisted_authority_check CHECK (execution_kind<>'ASSISTED_SCOPE' OR
   assisted_session_id IS NOT NULL AND base_stage_id IS NOT NULL AND config_revision_id IS NOT NULL AND scope_json IS NOT NULL AND source_draft_fingerprint IS NOT NULL);
CREATE INDEX planning_runs_assisted_session_created_idx ON public.planning_runs(assisted_session_id,created_at DESC);

-- The client supplies only optimistic concurrency guards. The proposal and trace
-- are read under the same session lock from planning_runs.
CREATE OR REPLACE FUNCTION public.assisted_apply_proposal(p_plan_id integer,p_run_id bigint,p_expected_fingerprint text,p_expected_base bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s assisted_planning_sessions%rowtype; r planning_runs%rowtype; result jsonb; item jsonb; next_snapshot jsonb; next_fingerprint text; trace jsonb;
BEGIN
 SELECT * INTO s FROM assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 SELECT * INTO r FROM planning_runs WHERE id=p_run_id AND plan_id=p_plan_id AND execution_kind='ASSISTED_SCOPE';
 IF NOT FOUND THEN RAISE EXCEPTION 'RUN_NOT_FOUND'; END IF;
 IF r.assisted_session_id<>s.id THEN RAISE EXCEPTION 'RUN_SESSION_MISMATCH'; END IF;
 IF r.status<>'success' OR r.assisted_result_json IS NULL THEN RAISE EXCEPTION 'RUN_NOT_READY'; END IF;
 result:=r.assisted_result_json;
 IF result->>'outcome'<>'PROPOSAL' THEN RAISE EXCEPTION 'RUN_HAS_NO_PROPOSAL'; END IF;
 IF r.base_stage_id IS DISTINCT FROM p_expected_base OR s.draft_base_stage_id IS DISTINCT FROM r.base_stage_id THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint<>p_expected_fingerprint OR s.draft_fingerprint<>r.source_draft_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 IF s.current_config_revision_id<>r.config_revision_id THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
 IF r.result_fingerprint IS NULL THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 next_snapshot:=s.draft_snapshot_json;
 FOR item IN SELECT * FROM jsonb_array_elements(result->'proposal') LOOP
   IF NOT EXISTS(SELECT 1 FROM daily_tasks WHERE id=(item->>'taskId')::integer AND plan_id=p_plan_id) THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
   next_snapshot:=jsonb_set(next_snapshot,ARRAY['tasks',(SELECT (ordinality-1)::text FROM jsonb_array_elements(next_snapshot->'tasks') WITH ORDINALITY x WHERE (x.value->>'taskId')::integer=(item->>'taskId')::integer)],
     (SELECT value FROM jsonb_array_elements(next_snapshot->'tasks') value WHERE (value->>'taskId')::integer=(item->>'taskId')::integer) || item,true);
 END LOOP;
 next_fingerprint:=encode(digest(convert_to(next_snapshot::text,'UTF8'),'sha256'),'hex');
 trace:=jsonb_build_object('contractVersion',1,'selector',r.scope_json->'selector','metadata',r.scope_json->'metadata','resolvedTaskIds',r.scope_task_ids_json,'includePrerequisites',r.include_prerequisites,'proposalRunId',r.id);
 UPDATE assisted_planning_sessions SET draft_snapshot_json=next_snapshot,draft_fingerprint=next_fingerprint,draft_scope_json=trace,draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
 RETURN s.id;
END $$;
REVOKE ALL ON FUNCTION public.assisted_apply_proposal(integer,bigint,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assisted_apply_proposal(integer,bigint,text,bigint) TO service_role;

-- Preserve proposal authority when a traced draft is accepted. Existing function
-- body remains authoritative; these substitutions are implemented in ASST-005's
-- additive migration rather than modifying 078.
CREATE OR REPLACE FUNCTION public.guard_assisted_stage_proposal_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.proposal_run_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM planning_runs r WHERE r.id=NEW.proposal_run_id AND r.plan_id=NEW.plan_id
   AND r.assisted_session_id=NEW.session_id AND r.base_stage_id IS NOT DISTINCT FROM NEW.parent_stage_id
   AND r.config_revision_id=NEW.config_revision_id AND r.scope_task_ids_json=NEW.scope_task_ids_json
   AND r.include_prerequisites=NEW.include_prerequisites AND r.execution_kind='ASSISTED_SCOPE'
   AND r.status='success' AND r.assisted_result_json->>'outcome'='PROPOSAL') THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 RETURN NEW;
END $$;

-- Replacement of ASST-004 acceptance persists proposal provenance from the locked draft.
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
 VALUES(s.id,p_plan_id,next_ordinal,s.draft_base_stage_id,s.draft_scope_json,coalesce(s.draft_scope_json->'resolvedTaskIds','[]'::jsonb),coalesce((s.draft_scope_json->>'includePrerequisites')::boolean,false),s.current_config_revision_id,(s.draft_scope_json->>'proposalRunId')::bigint,s.draft_snapshot_json,s.draft_fingerprint,
 jsonb_build_object('hardCount',v.hard_count,'requiredCount',v.required_count,'preferredCount',v.preferred_count,'validationId',v.id),p_user_id,now()) RETURNING id INTO new_id;
 UPDATE assisted_planning_sessions SET active_stage_id=new_id,draft_base_stage_id=new_id,draft_scope_json='{}',draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
 RETURN new_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CONCURRENT_ACCEPT'; END $$;
