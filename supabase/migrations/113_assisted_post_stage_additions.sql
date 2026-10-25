-- Created with Supabase CLI v2.75.0, renamed to the repository's sequential ledger.
-- P0-U00n. Historical checkpoints remain immutable. Operational origins explicitly
-- project the current obligations onto those checkpoints without accepting them.
CREATE TABLE public.assisted_obligation_transitions (
 id bigserial PRIMARY KEY,
 contract_version integer NOT NULL DEFAULT 1 CHECK(contract_version=1),
 session_id bigint NOT NULL, plan_id integer NOT NULL,
 base_stage_id bigint NOT NULL, previous_revision_id bigint NOT NULL,
 config_revision_id bigint NOT NULL, previous_fingerprint text NOT NULL,
 source_token text NOT NULL, sources_json jsonb NOT NULL,
 added_task_ids_json jsonb NOT NULL CHECK(public.positive_integer_jsonb_array(added_task_ids_json)),
 pending_tasks_json jsonb NOT NULL CHECK(jsonb_typeof(pending_tasks_json)='array'),
 projections_json jsonb NOT NULL CHECK(jsonb_typeof(projections_json)='object'),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,session_id,plan_id),
 FOREIGN KEY(session_id,plan_id) REFERENCES public.assisted_planning_sessions(id,plan_id),
 FOREIGN KEY(base_stage_id,session_id,plan_id) REFERENCES public.assisted_planning_stages(id,session_id,plan_id),
 FOREIGN KEY(previous_revision_id,plan_id) REFERENCES public.plan_config_revisions(id,plan_id),
 FOREIGN KEY(config_revision_id,plan_id) REFERENCES public.plan_config_revisions(id,plan_id)
);
CREATE INDEX assisted_obligation_transitions_session_idx ON public.assisted_obligation_transitions(session_id,id DESC);
ALTER TABLE public.assisted_obligation_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assisted_obligation_transitions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.assisted_obligation_transitions TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.assisted_obligation_transitions_id_seq TO service_role;
ALTER TABLE public.assisted_planning_sessions
 ADD COLUMN working_snapshot_json jsonb, ADD COLUMN working_fingerprint text,
 ADD COLUMN obligation_transition_id bigint,
 ADD CONSTRAINT assisted_session_transition_fk FOREIGN KEY(obligation_transition_id,id,plan_id)
 REFERENCES public.assisted_obligation_transitions(id,session_id,plan_id);
UPDATE public.assisted_planning_sessions s SET working_snapshot_json=b.snapshot_json,working_fingerprint=b.snapshot_fingerprint
 FROM public.assisted_planning_stages b WHERE b.id=s.active_stage_id AND b.session_id=s.id;
ALTER TABLE public.planning_runs ADD COLUMN source_origin_snapshot_json jsonb, ADD COLUMN source_token text;
ALTER TABLE public.planning_stage_validations ADD COLUMN source_token text;

-- The only fields consolidated by the existing acceptance/snapshot contract.
CREATE FUNCTION public.assisted_task_planning_fields(p_task jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('start_planned',p_task->'startPlanned','end_planned',p_task->'endPlanned',
 'zone_id',p_task->'zoneId','space_id',p_task->'spaceId','location_label',p_task->'locationLabel',
 'duration_override',p_task->'durationOverride','cameras_override',p_task->'camerasOverride')
 || CASE WHEN p_task ? 'assignedResourceIds' THEN jsonb_build_object('assigned_resource_ids',p_task->'assignedResourceIds') ELSE '{}'::jsonb END
$$;

-- Reconstruct accepted planning differences only; all other raw authority fields
-- still come from the demonstrable bootstrap/admission capture.
CREATE FUNCTION public.assisted_expected_obligation_sources(p_session bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; result jsonb; tasks jsonb; participants jsonb;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE id=p_session;
 SELECT sources_json INTO result FROM public.assisted_obligation_transitions WHERE id=s.obligation_transition_id AND session_id=s.id;
 IF result IS NULL THEN SELECT sources_json INTO result FROM public.assisted_bootstrap_sources WHERE session_id=s.id; END IF;
 IF result IS NULL OR NOT (result ?& ARRAY['plans','daily_tasks','contestants','locks','plan_breaks','plan_task_template_snapshots','plan_optimizer_snapshots','plan_optimizer_snapshot_heuristics','plan_optimizer_snapshot_grouping_zones','plan_zone_settings','plan_space_settings','plan_resource_items','plan_resource_bundle_snapshots','plan_zone_resource_assignments','plan_space_resource_assignments','plan_zone_resource_type_requirements','plan_space_resource_type_requirements','resource_availability','plan_itinerant_unit_snapshots','program_settings','resource_types','resource_item_components'])
 OR EXISTS(SELECT 1 FROM jsonb_each(result) WHERE jsonb_typeof(value)<>'array') THEN RETURN NULL; END IF;
 -- A capture with all keys but missing rows cannot prove a pure addition.
 IF (SELECT jsonb_agg(t->'id' ORDER BY (t->>'id')::bigint) FROM jsonb_array_elements(result->'daily_tasks') t)
  IS DISTINCT FROM (SELECT jsonb_agg(t->'taskId' ORDER BY (t->>'taskId')::bigint) FROM jsonb_array_elements(s.working_snapshot_json->'tasks') t)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'daily_tasks') t WHERE t->>'contestant_id' IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'contestants') c WHERE c->'id'=t->'contestant_id'))
 THEN RETURN NULL; END IF;
 SELECT replay_snapshot_json->'authorities'->'contestant_availability' INTO participants
  FROM public.plan_config_revisions WHERE id=s.current_config_revision_id AND plan_id=s.plan_id;
 IF jsonb_typeof(participants) IS DISTINCT FROM 'array' OR EXISTS(
  SELECT 1 FROM jsonb_array_elements(participants) p WHERE NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(result->'contestants') c WHERE c->'id'=p->'contestantId')) THEN RETURN NULL; END IF;
 SELECT jsonb_agg(t || public.assisted_task_planning_fields(p) ORDER BY (t->>'id')::bigint) INTO tasks
 FROM jsonb_array_elements(result->'daily_tasks') t JOIN jsonb_array_elements(s.working_snapshot_json->'tasks') p ON t->'id'=p->'taskId';
 IF jsonb_array_length(coalesce(tasks,'[]'))<>jsonb_array_length(result->'daily_tasks') THEN RETURN NULL; END IF;
 RETURN jsonb_set(result,'{daily_tasks}',coalesce(tasks,'[]'));
END $$;

ALTER FUNCTION public.assisted_preview_bootstrap_additions(integer) RENAME TO assisted_preview_s0_additions;
CREATE FUNCTION public.assisted_preview_bootstrap_additions(p_plan_id integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; old_sources jsonb; current_sources jsonb;
 added jsonb; reason text; pending jsonb;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE';
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE session_id=s.id AND ordinal>0) THEN
  RETURN public.assisted_preview_s0_additions(p_plan_id)||jsonb_build_object('mode','S0_REPLACEMENT');
 END IF;
 old_sources:=public.assisted_expected_obligation_sources(s.id);
 current_sources:=public.assisted_read_bootstrap_sources(p_plan_id);
 SELECT coalesce(jsonb_agg(t->'id' ORDER BY (t->>'id')::bigint),'[]') INTO added
 FROM jsonb_array_elements(current_sources->'daily_tasks') t WHERE NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(s.working_snapshot_json->'tasks') b WHERE b->'taskId'=t->'id');
 SELECT coalesce(jsonb_agg(t ORDER BY (t->>'taskId')::bigint),'[]') INTO pending
 FROM public.assisted_obligation_transitions a,jsonb_array_elements(a.pending_tasks_json) t WHERE a.session_id=s.id;
 IF s.draft_snapshot_json IS DISTINCT FROM s.working_snapshot_json OR s.draft_fingerprint IS DISTINCT FROM s.working_fingerprint
  OR s.draft_scope_json<>'{}' OR s.draft_validation_id IS NOT NULL THEN reason:='REBOOTSTRAP_DIRTY_DRAFT';
 ELSIF EXISTS(SELECT 1 FROM public.planning_runs r WHERE r.plan_id=p_plan_id AND r.execution_kind<>'ASSISTED_SCOPE' AND r.status IN ('queued','running','cancelling'))
  THEN reason:='REBOOTSTRAP_PENDING_PROPOSAL';
 ELSIF EXISTS(SELECT 1 FROM public.daily_tasks WHERE plan_id=p_plan_id AND (status NOT IN ('pending','interrupted') OR start_real IS NOT NULL OR end_real IS NOT NULL
   OR to_jsonb(daily_tasks)->>'start_real_at' IS NOT NULL OR to_jsonb(daily_tasks)->>'end_real_at' IS NOT NULL))
  OR EXISTS(SELECT 1 FROM public.locks WHERE plan_id=p_plan_id) THEN reason:='REBOOTSTRAP_PROTECTED_DAY';
 ELSIF old_sources IS NULL THEN reason:='REBOOTSTRAP_BASELINE_UNAVAILABLE';
 ELSIF old_sources-ARRAY['daily_tasks','contestants'] IS DISTINCT FROM current_sources-ARRAY['daily_tasks','contestants'] THEN reason:='REBOOTSTRAP_AUTHORITY_CHANGED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(old_sources->'daily_tasks') old WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(current_sources->'daily_tasks') current_row WHERE current_row=old)) THEN reason:='REBOOTSTRAP_TASK_CHANGED_OR_REMOVED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(old_sources->'contestants') old WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(current_sources->'contestants') current_row WHERE current_row=old)) THEN reason:='REBOOTSTRAP_PARTICIPANT_CHANGED_OR_REMOVED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(current_sources->'daily_tasks') t WHERE added @> jsonb_build_array(t->'id')
   AND (t->>'status'<>'pending' OR t->>'start_planned' IS NOT NULL OR t->>'end_planned' IS NOT NULL)) THEN reason:='REBOOTSTRAP_PROTECTED_DAY';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(current_sources->'contestants') c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old_sources->'contestants') old_row WHERE old_row=c)
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(current_sources->'daily_tasks') t WHERE t->'contestant_id'=c->'id' AND added @> jsonb_build_array(t->'id')))
  THEN reason:='REBOOTSTRAP_AUTHORITY_CHANGED';
 ELSIF jsonb_array_length(added)=0 THEN reason:='REBOOTSTRAP_NO_ADDITIONS'; END IF;
 RETURN jsonb_build_object('allowed',reason IS NULL,'reason',reason,'mode','POST_STAGE','addedTaskIds',added,'pendingTaskSnapshots',pending,
 'pendingProposalIds','[]'::jsonb,'expectedSessionId',s.id,'expectedBaseStageId',s.draft_base_stage_id,
 'expectedDraftFingerprint',s.draft_fingerprint,'expectedConfigRevisionId',s.current_config_revision_id,
 'sourceToken',encode(sha256(convert_to(current_sources::text,'UTF8')),'hex'));
END $$;

CREATE FUNCTION public.assisted_incorporate_stage_additions(p_plan_id integer,p_user_id uuid,p_expected_session bigint,
 p_expected_base bigint,p_expected_fingerprint text,p_expected_config bigint,p_source_token text,
 p_identity jsonb,p_replay jsonb,p_snapshot jsonb,p_fingerprint text,p_added_task_ids jsonb,p_projections jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; preview jsonb; revision_id bigint; transition_id bigint;
 pending jsonb; all_pending jsonb; origin jsonb; b public.assisted_planning_stages%rowtype; expected jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p_user_id AND r.key IN ('admin','production')) THEN RAISE EXCEPTION 'ASSISTED_ACCEPT_FORBIDDEN'; END IF;
 PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
 PERFORM pg_catalog.pg_advisory_xact_lock(78004,p_plan_id);
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.id IS DISTINCT FROM p_expected_session OR s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 IF s.current_config_revision_id IS DISTINCT FROM p_expected_config THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
 preview:=public.assisted_preview_bootstrap_additions(p_plan_id);
 IF preview->>'sourceToken' IS DISTINCT FROM p_source_token OR preview->'addedTaskIds' IS DISTINCT FROM p_added_task_ids THEN RAISE EXCEPTION 'REBOOTSTRAP_STALE_SOURCES'; END IF;
 IF NOT (preview->>'allowed')::boolean THEN RAISE EXCEPTION '%',preview->>'reason'; END IF;
 IF preview->>'mode'<>'POST_STAGE' THEN RAISE EXCEPTION 'REBOOTSTRAP_ACCEPTED_STAGE'; END IF;
 SELECT coalesce(jsonb_agg(t ORDER BY (t->>'taskId')::bigint),'[]') INTO pending
 FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE p_added_task_ids @> jsonb_build_array(t->'taskId');
 IF jsonb_array_length(pending)<>jsonb_array_length(p_added_task_ids) OR EXISTS(
  SELECT 1 FROM jsonb_array_elements(pending) t JOIN public.daily_tasks d ON d.id=(t->>'taskId')::bigint AND d.plan_id=p_plan_id
  WHERE t-ARRAY['taskId','startPlanned','endPlanned','zoneId','spaceId','locationLabel','durationOverride','camerasOverride','assignedResourceIds']<>'{}'::jsonb
  OR public.assisted_task_planning_fields(t) IS DISTINCT FROM public.assisted_task_planning_fields(jsonb_build_object(
  'startPlanned',d.start_planned,'endPlanned',d.end_planned,'zoneId',d.zone_id,'spaceId',d.space_id,'locationLabel',d.location_label,
  'durationOverride',d.duration_override,'camerasOverride',d.cameras_override,'assignedResourceIds',coalesce(d.assigned_resource_ids,'[]'))))
 THEN RAISE EXCEPTION 'TASK_SET_MISMATCH'; END IF;
 all_pending:=preview->'pendingTaskSnapshots'||pending;
 IF (SELECT count(*) FROM jsonb_object_keys(p_projections))<>(SELECT count(*) FROM public.assisted_planning_stages WHERE session_id=s.id) THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 FOR b IN SELECT * FROM public.assisted_planning_stages WHERE session_id=s.id LOOP
  origin:=p_projections->b.id::text;
  SELECT jsonb_agg(t ORDER BY (t->>'taskId')::bigint) INTO expected FROM (
   SELECT value t FROM jsonb_array_elements(b.snapshot_json->'tasks')
   UNION ALL SELECT t FROM jsonb_array_elements(all_pending) t WHERE NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(b.snapshot_json->'tasks') old WHERE old->'taskId'=t->'taskId')) q;
  expected:=jsonb_set(b.snapshot_json,'{tasks}',expected);
  IF origin->'snapshot' IS DISTINCT FROM expected OR coalesce(origin->>'fingerprint','') !~ '^[0-9a-f]{64}$'
   OR (SELECT jsonb_agg(t->'taskId' ORDER BY (t->>'taskId')::bigint) FROM jsonb_array_elements(expected->'tasks') t)
    IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(id) ORDER BY id) FROM public.daily_tasks WHERE plan_id=p_plan_id)
  THEN RAISE EXCEPTION 'TASK_SET_MISMATCH'; END IF;
 END LOOP;
 INSERT INTO public.plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json,created_by)
 VALUES(p_plan_id,s.current_config_revision_id,'ASSISTED_OBLIGATION_ADMISSION',p_identity->>'configurationFingerprint',p_identity,p_replay,
 jsonb_build_object('contractVersion',1,'addedTaskIds',p_added_task_ids,'baseStageId',s.active_stage_id,'sourceToken',p_source_token),p_user_id) RETURNING id INTO revision_id;
 INSERT INTO public.assisted_obligation_transitions(session_id,plan_id,base_stage_id,previous_revision_id,config_revision_id,previous_fingerprint,
 source_token,sources_json,added_task_ids_json,pending_tasks_json,projections_json,created_by)
 VALUES(s.id,p_plan_id,s.active_stage_id,s.current_config_revision_id,revision_id,s.working_fingerprint,p_source_token,
 public.assisted_read_bootstrap_sources(p_plan_id),p_added_task_ids,pending,p_projections,p_user_id) RETURNING id INTO transition_id;
 origin:=p_projections->s.active_stage_id::text;
 UPDATE public.assisted_planning_sessions SET current_config_revision_id=revision_id,obligation_transition_id=transition_id,
 working_snapshot_json=origin->'snapshot',working_fingerprint=origin->>'fingerprint',draft_snapshot_json=origin->'snapshot',
 draft_fingerprint=origin->>'fingerprint',draft_scope_json='{}',draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
 -- The Stage's run remains historical provenance. All other earlier work becomes
 -- explicitly stale, including a run completing while admission is committed.
 UPDATE public.planning_runs r SET status='error',message='STALE_CONFIG_REVISION',cancel_reason='OBLIGATION_ADMISSION',cancelled_at=now()
 WHERE r.assisted_session_id=s.id AND r.status IN ('queued','running','cancelling','success')
 AND NOT EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE proposal_run_id=r.id);
 RETURN transition_id;
END $$;

-- Acceptance and navigation use a projection belonging to the latest admission.
-- For Stages accepted later the full checkpoint itself is already the origin.
CREATE FUNCTION public.assisted_set_working_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE origin jsonb; b public.assisted_planning_stages%rowtype;
BEGIN
 IF NEW.active_stage_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO b FROM public.assisted_planning_stages WHERE id=NEW.active_stage_id AND session_id=NEW.id;
 SELECT projections_json->b.id::text INTO origin FROM public.assisted_obligation_transitions WHERE id=NEW.obligation_transition_id AND session_id=NEW.id;
 NEW.working_snapshot_json:=coalesce(origin->'snapshot',b.snapshot_json);
 NEW.working_fingerprint:=coalesce(origin->>'fingerprint',b.snapshot_fingerprint);
 IF NEW.draft_snapshot_json=b.snapshot_json THEN
  NEW.draft_snapshot_json:=NEW.working_snapshot_json; NEW.draft_fingerprint:=NEW.working_fingerprint;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assisted_set_working_origin BEFORE UPDATE OF active_stage_id ON public.assisted_planning_sessions
 FOR EACH ROW EXECUTE FUNCTION public.assisted_set_working_origin();

-- Read-only comparison for execution reality. Restoring a checkpoint never writes
-- over a task already running or done, even when restoring an older universe.
CREATE FUNCTION public.assisted_assert_execution_compatible(p_plan_id integer,p_snapshot jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.daily_tasks d LEFT JOIN jsonb_array_elements(p_snapshot->'tasks') t ON t->>'taskId'=d.id::text
 WHERE d.plan_id=p_plan_id AND d.status IN ('done','in_progress')
 AND (t IS NULL OR public.assisted_task_planning_fields(t) IS DISTINCT FROM public.assisted_task_planning_fields(jsonb_build_object(
  'startPlanned',d.start_planned,'endPlanned',d.end_planned,'zoneId',d.zone_id,'spaceId',d.space_id,'locationLabel',d.location_label,
  'durationOverride',d.duration_override,'camerasOverride',d.cameras_override,'assignedResourceIds',coalesce(d.assigned_resource_ids,'[]')))))
 THEN RAISE EXCEPTION 'RESTORE_EXECUTION_CONFLICT'; END IF;
END $$;

CREATE FUNCTION public.assisted_guard_obligation_validation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; r public.planning_runs%rowtype;
BEGIN
 PERFORM public.assisted_read_bootstrap_sources(NEW.plan_id,true);
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE id=NEW.session_id AND plan_id=NEW.plan_id FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND OR s.status<>'ACTIVE' OR s.current_config_revision_id IS DISTINCT FROM NEW.config_revision_id
  OR s.draft_base_stage_id IS DISTINCT FROM NEW.base_stage_id OR s.draft_fingerprint IS DISTINCT FROM NEW.draft_fingerprint THEN RAISE EXCEPTION 'STALE_VALIDATION'; END IF;
 IF (SELECT jsonb_agg(t->'taskId' ORDER BY (t->>'taskId')::bigint) FROM jsonb_array_elements(s.draft_snapshot_json->'tasks') t)
  IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(id) ORDER BY id) FROM public.daily_tasks WHERE plan_id=NEW.plan_id)
 THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
 NEW.source_token:=public.assisted_bootstrap_source_token(NEW.plan_id);
 IF NEW.report_json->>'mode' IN ('MANUAL_DELTA_CLEAN_V1','MANUAL_STAGE_VALIDATION_V1') AND NEW.report_json->>'sourceToken' IS DISTINCT FROM NEW.source_token THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
 IF NEW.report_json->>'mode'='PROPOSAL_CERTIFIED_CLEAN_V1' THEN
  SELECT * INTO r FROM public.planning_runs WHERE id=(NEW.report_json->>'proposalRunId')::bigint;
  IF r.source_token IS DISTINCT FROM NEW.source_token OR r.source_origin_snapshot_json IS DISTINCT FROM s.working_snapshot_json THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assisted_obligation_validation BEFORE INSERT ON public.planning_stage_validations
 FOR EACH ROW EXECUTE FUNCTION public.assisted_guard_obligation_validation();

CREATE OR REPLACE FUNCTION public.assisted_guard_new_run_session() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype;
BEGIN
 IF NEW.execution_kind IS DISTINCT FROM 'ASSISTED_SCOPE' THEN
  PERFORM 1 FROM public.assisted_planning_sessions WHERE plan_id=NEW.plan_id AND status='ACTIVE' FOR NO KEY UPDATE;
  RETURN NEW;
 END IF;
 PERFORM public.assisted_read_bootstrap_sources(NEW.plan_id,true);
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE id=NEW.assisted_session_id AND plan_id=NEW.plan_id FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND OR s.status<>'ACTIVE' THEN RAISE EXCEPTION 'RUN_SESSION_MISMATCH'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM NEW.base_stage_id OR s.draft_fingerprint IS DISTINCT FROM NEW.source_draft_fingerprint
  OR s.draft_snapshot_json IS DISTINCT FROM s.working_snapshot_json THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 IF s.current_config_revision_id IS DISTINCT FROM NEW.config_revision_id THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.scope_task_ids_json) t WHERE NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(s.working_snapshot_json->'tasks') d WHERE d->'taskId'=t)) THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
 IF EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE session_id=s.id AND ordinal>0) AND
  (SELECT jsonb_agg(t->'taskId' ORDER BY (t->>'taskId')::bigint) FROM jsonb_array_elements(s.working_snapshot_json->'tasks') t)
  IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(id) ORDER BY id) FROM public.daily_tasks WHERE plan_id=NEW.plan_id) THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
 NEW.source_token:=public.assisted_bootstrap_source_token(NEW.plan_id);
 NEW.source_origin_snapshot_json:=s.working_snapshot_json;
 RETURN NEW;
END $$;

CREATE FUNCTION public.assisted_guard_run_origin_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF OLD.execution_kind='ASSISTED_SCOPE' AND
 (to_jsonb(NEW)-ARRAY['status','message','finished_at','updated_at','assisted_result_json','result_fingerprint','cancelled_at','cancel_reason','progress_json','heartbeat_at','result_json','progress','progress_phase','progress_percent'])
 IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['status','message','finished_at','updated_at','assisted_result_json','result_fingerprint','cancelled_at','cancel_reason','progress_json','heartbeat_at','result_json','progress','progress_phase','progress_percent'])
 THEN RAISE EXCEPTION 'RUN_ORIGIN_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assisted_run_origin_immutable BEFORE UPDATE ON public.planning_runs
 FOR EACH ROW EXECUTE FUNCTION public.assisted_guard_run_origin_immutable();


-- Reuse the AcceptedException authority. Only literal material identities from
-- the active lineage may certify pre-existing deviations; never a rule-wide skip.
CREATE FUNCTION public.assisted_inherited_violation_report(p_session bigint,p_base bigint,p_snapshot jsonb,p_details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE detail jsonb; material jsonb; exception public.planning_accepted_exceptions%rowtype;
 violations jsonb:='[]'; hard_count integer:=0; required_count integer:=0;
BEGIN
 IF jsonb_typeof(p_details) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 FOR detail IN SELECT value FROM jsonb_array_elements(p_details) WHERE value->>'severity' IN ('HARD','REQUIRED') LOOP
  material:=jsonb_build_object('ruleCode',detail->'ruleCode','dimensions',coalesce(detail->'dimensions','{}'),
   'taskIds',(SELECT coalesce(jsonb_agg(to_jsonb(split_part(value,':',2)::bigint) ORDER BY split_part(value,':',2)::bigint),'[]') FROM jsonb_array_elements_text(detail->'affectedTaskIds')),
   'resourceIds',(SELECT coalesce(jsonb_agg(to_jsonb(split_part(value,':',2)::bigint) ORDER BY split_part(value,':',2)::bigint),'[]') FROM jsonb_array_elements_text(detail->'affectedResourceIds')),
   'spaceIds',(SELECT coalesce(jsonb_agg(to_jsonb(split_part(value,':',2)::bigint) ORDER BY split_part(value,':',2)::bigint),'[]') FROM jsonb_array_elements_text(detail->'affectedSpaceIds')));
  WITH RECURSIVE lineage AS (
   SELECT id,parent_stage_id,snapshot_json FROM public.assisted_planning_stages WHERE id=p_base AND session_id=p_session
   UNION ALL SELECT b.id,b.parent_stage_id,b.snapshot_json FROM public.assisted_planning_stages b JOIN lineage c ON b.id=c.parent_stage_id WHERE b.session_id=p_session
  ) SELECT e.* INTO exception FROM public.planning_accepted_exceptions e JOIN lineage b ON b.id=e.stage_id
   WHERE e.status='ACTIVE' AND e.severity=detail->>'severity' AND e.violation_key::jsonb=material
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e.affected_task_ids_json) task_id WHERE
     (SELECT t FROM jsonb_array_elements(b.snapshot_json->'tasks') t WHERE t->'taskId'=task_id)
     IS DISTINCT FROM (SELECT t FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE t->'taskId'=task_id))
   ORDER BY e.id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'VALIDATION_NOT_ACCEPTABLE'; END IF;
  hard_count:=hard_count+CASE WHEN exception.severity='HARD' THEN 1 ELSE 0 END;
  required_count:=required_count+CASE WHEN exception.severity='REQUIRED' THEN 1 ELSE 0 END;
  violations:=violations||jsonb_build_array(jsonb_build_object('ruleCode',exception.rule_code,'severity',exception.severity,
   'violationKey',exception.violation_key,'affectedTaskIds',exception.affected_task_ids_json,'affectedResourceIds',exception.affected_resource_ids_json,
   'affectedSpaceIds',exception.affected_space_ids_json,'details',exception.details_json,'inheritedAcceptedExceptionId',exception.id));
 END LOOP;
 RETURN jsonb_build_object('hardValid',hard_count=0,'hardCount',hard_count,'requiredCount',required_count,'newHardCount',0,'newRequiredCount',0,'violations',violations);
END $$;
REVOKE ALL ON FUNCTION public.assisted_inherited_violation_report(bigint,bigint,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.assisted_inherited_violation_report(bigint,bigint,jsonb,jsonb) TO service_role;

-- Existing contracts retained with the operational-origin/freshness substitutions.

CREATE OR REPLACE FUNCTION public.assisted_rebootstrap_additions(p_plan_id integer,p_user_id uuid,p_expected_session bigint,
 p_expected_base bigint,p_expected_fingerprint text,p_expected_config bigint,p_source_token text,
 p_identity jsonb,p_replay jsonb,p_snapshot jsonb,p_fingerprint text)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; preview jsonb; new_id bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p_user_id AND r.key IN ('admin','production')) THEN RAISE EXCEPTION 'ASSISTED_ACCEPT_FORBIDDEN'; END IF;
 -- Same lock order as bootstrap. Existing mutators complete or fail atomically.
 PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
 PERFORM pg_catalog.pg_advisory_xact_lock(78004,p_plan_id);
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.id IS DISTINCT FROM p_expected_session OR s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 IF s.current_config_revision_id IS DISTINCT FROM p_expected_config THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
 IF EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE session_id=s.id AND ordinal>0) THEN RAISE EXCEPTION 'REBOOTSTRAP_ACCEPTED_STAGE'; END IF;
 preview:=public.assisted_preview_bootstrap_additions(p_plan_id);
 IF preview->>'sourceToken' IS DISTINCT FROM p_source_token THEN RAISE EXCEPTION 'REBOOTSTRAP_STALE_SOURCES'; END IF;
 IF NOT (preview->>'allowed')::boolean THEN RAISE EXCEPTION '%',preview->>'reason'; END IF;
 UPDATE public.assisted_planning_sessions SET status='CLOSED',updated_at=now() WHERE id=s.id;
 new_id:=public.assisted_bootstrap_session(p_plan_id,p_user_id,p_identity,p_replay,p_snapshot,p_fingerprint);
 RETURN new_id;
END $$;

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
  IF evidence->>'requiredValid' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'VALIDATION_NOT_ACCEPTABLE'; END IF;
  IF evidence->>'hardValid' IS DISTINCT FROM 'true' OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(evidence->'violations','[]')) v WHERE v->>'severity' IN ('HARD','REQUIRED')) THEN
    report:=public.assisted_inherited_violation_report(s.id,s.draft_base_stage_id,s.draft_snapshot_json,evidence->'violations');
    IF (report->>'hardCount')::integer<>coalesce((evidence->>'inheritedAcceptedHardViolationCount')::integer,0)
      OR evidence->>'hardValid' IS DISTINCT FROM ((report->>'hardCount')::integer=0)::text
      OR (report->>'requiredCount')::integer<>coalesce((evidence->>'inheritedAcceptedRequiredViolationCount')::integer,0)
      OR coalesce(evidence->'unstructuredReasonCodes','[]')<>'[]'::jsonb THEN RAISE EXCEPTION 'VALIDATION_NOT_ACCEPTABLE'; END IF;
  END IF;

  -- Reuse the existing server-only RPC: no additional exposed SQL endpoint.
  DECLARE
 b public.assisted_planning_stages%rowtype;
 p public.plans%rowtype;
 candidate jsonb; previous jsonb; row jsonb; placement jsonb;
 witnesses jsonb; meal jsonb; workday jsonb; meal_template bigint;
 task public.daily_tasks%rowtype; participant public.contestants%rowtype;
 start_min integer; end_min integer; duration_min integer; changed integer:=0;
BEGIN
 SELECT * INTO b FROM public.assisted_planning_stages WHERE id=r.base_stage_id
   AND session_id=r.assisted_session_id AND plan_id=r.plan_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 b.snapshot_json:=r.source_origin_snapshot_json; b.snapshot_fingerprint:=r.source_draft_fingerprint;
 IF b.snapshot_json IS DISTINCT FROM s.working_snapshot_json OR b.snapshot_fingerprint IS DISTINCT FROM s.working_fingerprint
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
     SELECT coalesce(CASE WHEN task.duration_override>0 THEN task.duration_override END,default_duration)
       INTO duration_min FROM public.plan_task_template_snapshots
       WHERE plan_id=r.plan_id AND source_template_id=task.template_id;
     IF duration_min IS NULL THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
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
END;

  report := coalesce(report,'{}'::jsonb)||jsonb_build_object(
    'mode','PROPOSAL_CERTIFIED_CLEAN_V1', 'proposalRunId',proposal_run_id,
    'scopeTaskIds',r.scope_task_ids_json, 'includePrerequisites',r.include_prerequisites,
    'hardAssessment',CASE WHEN coalesce((report->>'hardCount')::integer,0)>0 THEN 'ACCEPTED_EXCEPTIONS' ELSE 'CLEAN' END, 'requiredAssessment',CASE WHEN coalesce((report->>'requiredCount')::integer,0)>0 THEN 'ACCEPTED_EXCEPTIONS' ELSE 'CLEAN' END,
    'preferredAssessment',CASE WHEN evidence ? 'operationContinuity' THEN 'OPERATION_CONTINUITY_QUANTIFIED' ELSE 'NOT_CLASSIFIED' END)
    || CASE WHEN evidence ? 'operationContinuity' THEN jsonb_build_object('operationContinuity',evidence->'operationContinuity') ELSE '{}'::jsonb END;
  INSERT INTO public.planning_stage_validations(plan_id,session_id,base_stage_id,draft_fingerprint,
    config_revision_id,hard_count,required_count,preferred_count,report_json)
  VALUES(p_plan_id,s.id,s.draft_base_stage_id,s.draft_fingerprint,s.current_config_revision_id,
    coalesce((report->>'hardCount')::integer,0),coalesce((report->>'requiredCount')::integer,0),(SELECT count(*) FROM jsonb_array_elements(coalesce(evidence->'operationContinuity','[]'::jsonb)) g WHERE g->>'policy'='PREFERRED' AND (g->>'gapMinutes')::integer>0),report) RETURNING id INTO validation_id;
  UPDATE public.assisted_planning_sessions SET draft_validation_id=validation_id,updated_at=now() WHERE id=s.id;
  RETURN validation_id;
END $$;

CREATE OR REPLACE FUNCTION public.assisted_apply_proposal(p_plan_id integer,p_run_id bigint,p_expected_fingerprint text,p_expected_base bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s assisted_planning_sessions%rowtype; r planning_runs%rowtype; result jsonb; proposed jsonb; proposed_fingerprint text; trace jsonb;
BEGIN
 PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
 SELECT * INTO s FROM assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE NOWAIT;
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
 IF r.source_token IS DISTINCT FROM public.assisted_bootstrap_source_token(p_plan_id) OR r.source_origin_snapshot_json IS DISTINCT FROM s.working_snapshot_json THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
 IF r.result_fingerprint IS NULL OR r.result_fingerprint<>encode(extensions.digest(convert_to(result::text,'UTF8'),'sha256'),'hex') THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 proposed:=result->'proposedDraftSnapshot'; proposed_fingerprint:=result->>'proposedDraftFingerprint';
 IF jsonb_typeof(proposed)<>'object' OR proposed->>'contractVersion'<>'1' OR jsonb_typeof(proposed->'tasks')<>'array'
   OR proposed_fingerprint !~ '^[0-9a-f]{64}$' OR jsonb_typeof(result->'proposal')<>'array' THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(proposed->'tasks'))<>(SELECT count(DISTINCT (item->>'taskId')::integer) FROM jsonb_array_elements(proposed->'tasks') item)
   OR (SELECT coalesce(array_agg((item->>'taskId')::integer ORDER BY (item->>'taskId')::integer),'{}') FROM jsonb_array_elements(proposed->'tasks') item)
      IS DISTINCT FROM
      (SELECT coalesce(array_agg((item->>'taskId')::integer ORDER BY (item->>'taskId')::integer),'{}') FROM jsonb_array_elements(s.draft_snapshot_json->'tasks') item)
   OR EXISTS (SELECT 1 FROM jsonb_array_elements(result->'proposal') item WHERE NOT (r.scope_task_ids_json @> jsonb_build_array((item->>'taskId')::integer)))
 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 trace:=jsonb_build_object('contractVersion',1,'selector',r.scope_json->'selector','metadata',r.scope_json->'metadata','resolvedTaskIds',r.scope_task_ids_json,'includePrerequisites',r.include_prerequisites,'proposalRunId',r.id);
 UPDATE assisted_planning_sessions SET draft_snapshot_json=proposed,draft_fingerprint=proposed_fingerprint,draft_scope_json=trace,draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
 RETURN s.id;
END $$;

CREATE OR REPLACE FUNCTION public.assisted_finish_proposal(p_plan_id integer,p_run_id bigint,p_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.assisted_planning_sessions%rowtype; r public.planning_runs%rowtype;
BEGIN
 PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR NO KEY UPDATE NOWAIT;
 SELECT * INTO r FROM public.planning_runs WHERE id=p_run_id AND plan_id=p_plan_id;
 IF s.id IS DISTINCT FROM r.assisted_session_id OR s.current_config_revision_id IS DISTINCT FROM r.config_revision_id THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
 IF s.draft_fingerprint IS DISTINCT FROM r.source_draft_fingerprint OR s.draft_base_stage_id IS DISTINCT FROM r.base_stage_id THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 IF r.source_token IS DISTINCT FROM public.assisted_bootstrap_source_token(p_plan_id) OR r.source_origin_snapshot_json IS DISTINCT FROM s.working_snapshot_json THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
 IF jsonb_typeof(p_result)<>'object' OR (p_result->>'contractVersion')::integer<>1 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 UPDATE planning_runs SET status='success',assisted_result_json=p_result,
   result_fingerprint=encode(extensions.digest(convert_to(p_result::text,'UTF8'),'sha256'),'hex'),finished_at=now(),updated_at=now()
 WHERE id=p_run_id AND plan_id=p_plan_id AND execution_kind='ASSISTED_SCOPE' AND status='running';
 IF NOT FOUND THEN RAISE EXCEPTION 'RUN_NOT_READY'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assisted_accept_stage(p_plan_id integer,p_user_id uuid,p_expected_fingerprint text,p_expected_base bigint,p_confirmation text DEFAULT 'NONE')
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; v public.planning_stage_validations%rowtype; new_id bigint; next_ordinal integer; item jsonb; task_item jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p_user_id AND r.key IN ('admin','production')) THEN RAISE EXCEPTION 'ASSISTED_ACCEPT_FORBIDDEN'; END IF;
 PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
 IF p_confirmation NOT IN ('NONE','REQUIRED_DEVIATIONS','HARD_EXCEPTIONS') THEN RAISE EXCEPTION 'INVALID_CONFIRMATION'; END IF;
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 SELECT * INTO v FROM public.planning_stage_validations WHERE id=s.draft_validation_id AND session_id=s.id AND plan_id=p_plan_id;
 IF NOT FOUND OR v.draft_fingerprint<>s.draft_fingerprint OR v.config_revision_id<>s.current_config_revision_id OR v.base_stage_id IS DISTINCT FROM s.draft_base_stage_id THEN RAISE EXCEPTION 'STALE_VALIDATION'; END IF;
 IF v.source_token IS DISTINCT FROM public.assisted_bootstrap_source_token(p_plan_id) THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
 -- Exception lifecycle is also current authority. A resolved/stale/superseded
 -- exception cannot be reused between validation and consolidation.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(v.report_json->'violations','[]')) violation
  WHERE violation->>'inheritedAcceptedExceptionId' IS NOT NULL AND NOT EXISTS(
   WITH RECURSIVE lineage AS (
    SELECT id,parent_stage_id,snapshot_json FROM public.assisted_planning_stages WHERE id=s.draft_base_stage_id AND session_id=s.id
    UNION ALL SELECT b.id,b.parent_stage_id,b.snapshot_json FROM public.assisted_planning_stages b JOIN lineage c ON b.id=c.parent_stage_id WHERE b.session_id=s.id
   ) SELECT 1 FROM public.planning_accepted_exceptions e JOIN lineage b ON e.stage_id=b.id
    WHERE e.id=(violation->>'inheritedAcceptedExceptionId')::bigint AND e.status='ACTIVE'
     AND e.severity=violation->>'severity' AND e.violation_key=violation->>'violationKey'
     AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e.affected_task_ids_json) task_id WHERE
      (SELECT t FROM jsonb_array_elements(b.snapshot_json->'tasks') t WHERE t->'taskId'=task_id)
      IS DISTINCT FROM (SELECT t FROM jsonb_array_elements(s.draft_snapshot_json->'tasks') t WHERE t->'taskId'=task_id))))
 THEN RAISE EXCEPTION 'STALE_VALIDATION'; END IF;

 IF coalesce((v.report_json->>'newHardCount')::integer,v.hard_count)>0 AND NOT EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p_user_id AND r.key='admin') THEN RAISE EXCEPTION 'HARD_ADMIN_AUTHORIZATION_REQUIRED'; END IF;
 PERFORM public.assisted_assert_execution_compatible(p_plan_id,s.draft_snapshot_json);
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

CREATE OR REPLACE FUNCTION public.assisted_apply_snapshot(p_plan_id integer, p_snapshot jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; expected_ids bigint[]; actual_ids bigint[];
BEGIN
 PERFORM public.assisted_assert_execution_compatible(p_plan_id,p_snapshot);
  SELECT coalesce(array_agg((x->>'taskId')::bigint ORDER BY (x->>'taskId')::bigint),'{}')
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

CREATE OR REPLACE FUNCTION public.assisted_move_stage(p_plan_id integer,p_target bigint,p_redo boolean)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s assisted_planning_sessions%rowtype; target assisted_planning_stages%rowtype; cursor_id bigint; origin jsonb;
BEGIN
 PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
 SELECT * INTO s FROM assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE NOWAIT;
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
 SELECT projections_json->target.id::text INTO origin FROM public.assisted_obligation_transitions WHERE id=s.obligation_transition_id AND session_id=s.id;
 PERFORM public.assisted_apply_snapshot(p_plan_id,coalesce(origin->'snapshot',target.snapshot_json));
 UPDATE assisted_planning_sessions SET active_stage_id=target.id,draft_base_stage_id=target.id,draft_snapshot_json=target.snapshot_json,
 draft_fingerprint=target.snapshot_fingerprint,draft_scope_json='{}',draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
 RETURN target.id;
END $$;

CREATE OR REPLACE FUNCTION public.assisted_patch_draft(p_plan_id integer,p_expected_fingerprint text,p_expected_base bigint,p_snapshot jsonb,p_fingerprint text)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; changed_ids jsonb; forward_rows jsonb; inverse_rows jsonb; trace jsonb;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
 IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 IF (p_snapshot-'tasks'-'planningBlocks') IS DISTINCT FROM
    (s.draft_snapshot_json-'tasks'-'planningBlocks')
 THEN RAISE EXCEPTION 'UNSUPPORTED_MANUAL_FIELD'; END IF;
 IF jsonb_typeof(p_snapshot->'tasks') IS DISTINCT FROM 'array' OR
   (SELECT array_agg((x->>'taskId')::integer ORDER BY (x->>'taskId')::integer) FROM jsonb_array_elements(p_snapshot->'tasks') x)
   IS DISTINCT FROM
   (SELECT array_agg((x->>'taskId')::integer ORDER BY (x->>'taskId')::integer) FROM jsonb_array_elements(s.draft_snapshot_json->'tasks') x)
 THEN RAISE EXCEPTION 'TASK_SET_MISMATCH'; END IF;
 SELECT coalesce(jsonb_agg((next->>'taskId')::integer ORDER BY (next->>'taskId')::integer),'[]'::jsonb),
        coalesce(jsonb_agg(next ORDER BY (next->>'taskId')::integer),'[]'::jsonb),
        coalesce(jsonb_agg(previous ORDER BY (previous->>'taskId')::integer),'[]'::jsonb)
 INTO changed_ids,forward_rows,inverse_rows
 FROM jsonb_array_elements(p_snapshot->'tasks') next
 JOIN jsonb_array_elements(s.draft_snapshot_json->'tasks') previous ON previous->>'taskId'=next->>'taskId'
 WHERE next IS DISTINCT FROM previous;
 IF coalesce(p_snapshot->'planningBlocks','[]'::jsonb) IS DISTINCT FROM coalesce(s.draft_snapshot_json->'planningBlocks','[]'::jsonb) THEN
   SELECT (SELECT coalesce(jsonb_agg(DISTINCT id ORDER BY id),'[]'::jsonb) FROM (
     SELECT (id#>>'{}')::integer id FROM jsonb_array_elements(changed_ids) id
     UNION
     SELECT (member#>>'{}')::integer id FROM jsonb_array_elements(coalesce(p_snapshot->'planningBlocks','[]')) block,
       jsonb_array_elements(block->'memberTaskIds') member
     UNION
     SELECT (member#>>'{}')::integer id FROM jsonb_array_elements(coalesce(s.draft_snapshot_json->'planningBlocks','[]')) block,
       jsonb_array_elements(block->'memberTaskIds') member) members) INTO changed_ids;
 END IF;
 IF jsonb_array_length(changed_ids)=0 THEN RAISE EXCEPTION 'VALIDATION_REQUIRED'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->'tasks') next
   JOIN jsonb_array_elements(s.draft_snapshot_json->'tasks') previous ON previous->>'taskId'=next->>'taskId'
   WHERE next IS DISTINCT FROM previous AND
    (next-'startPlanned'-'endPlanned') IS DISTINCT FROM (previous-'startPlanned'-'endPlanned'))
 THEN RAISE EXCEPTION 'UNSUPPORTED_MANUAL_FIELD'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->'tasks') next
   JOIN jsonb_array_elements(s.draft_snapshot_json->'tasks') previous ON previous->>'taskId'=next->>'taskId'
   WHERE next IS DISTINCT FROM previous AND (
    ((next->'startPlanned'='null'::jsonb) IS DISTINCT FROM (next->'endPlanned'='null'::jsonb)) OR
    (next->'startPlanned'='null'::jsonb AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(s.working_snapshot_json->'tasks') base_task
      WHERE true AND base_task->>'taskId'=next->>'taskId'
        AND base_task->'startPlanned'='null'::jsonb AND base_task->'endPlanned'='null'::jsonb)) OR
    (next->'startPlanned'<>'null'::jsonb AND ((next->>'endPlanned')::time-(next->>'startPlanned')::time IS DISTINCT FROM
      (previous->>'endPlanned')::time-(previous->>'startPlanned')::time))))
 THEN RAISE EXCEPTION 'INVALID_MANUAL_DURATION'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(changed_ids) x JOIN public.daily_tasks t ON t.id=(x#>>'{}')::integer
   WHERE t.plan_id=p_plan_id AND t.status NOT IN ('pending','interrupted')) THEN RAISE EXCEPTION 'IMMUTABLE_TASK'; END IF;
 trace:=coalesce(s.draft_scope_json,'{}'::jsonb);
 trace:=trace || jsonb_build_object('editKind','MANUAL','originProposalRunId',coalesce(trace->'originProposalRunId',trace->'proposalRunId'),
   'originalScope',coalesce(trace->'originalScope',trace-'proposalRunId'-'editLedger'-'redoLedger'),
   'manualTouchedTaskIds',(SELECT coalesce(jsonb_agg(DISTINCT id ORDER BY id),'[]'::jsonb) FROM
      (SELECT (x#>>'{}')::integer id FROM jsonb_array_elements(coalesce(trace->'manualTouchedTaskIds','[]')) x
       UNION SELECT (x#>>'{}')::integer FROM jsonb_array_elements(changed_ids) x) touched),
   'editLedger',coalesce(trace->'editLedger','[]') || jsonb_build_array(jsonb_build_object(
     'beforeFingerprint',s.draft_fingerprint,'afterFingerprint',p_fingerprint,'forward',forward_rows,'inverse',inverse_rows,
     'forwardBlocks',coalesce(p_snapshot->'planningBlocks','[]'::jsonb),'inverseBlocks',coalesce(s.draft_snapshot_json->'planningBlocks','[]'::jsonb),
     'forwardHasBlocks',p_snapshot ? 'planningBlocks','inverseHasBlocks',s.draft_snapshot_json ? 'planningBlocks')),
   'redoLedger','[]'::jsonb)-'proposalRunId';
 UPDATE public.assisted_planning_sessions SET draft_snapshot_json=p_snapshot,draft_fingerprint=p_fingerprint,
   draft_scope_json=CASE WHEN p_snapshot=s.working_snapshot_json AND p_fingerprint=s.working_fingerprint THEN '{}'::jsonb ELSE trace END,draft_validation_id=NULL,updated_at=now() WHERE id=s.id;
 RETURN s.id;
END $$;

REVOKE ALL ON FUNCTION public.assisted_task_planning_fields(jsonb),public.assisted_expected_obligation_sources(bigint),
 public.assisted_preview_bootstrap_additions(integer),public.assisted_set_working_origin(),public.assisted_assert_execution_compatible(integer,jsonb),
 public.assisted_guard_obligation_validation(),public.assisted_guard_run_origin_immutable(),
 public.assisted_incorporate_stage_additions(integer,uuid,bigint,bigint,text,bigint,text,jsonb,jsonb,jsonb,text,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.assisted_task_planning_fields(jsonb),public.assisted_expected_obligation_sources(bigint),
 public.assisted_preview_bootstrap_additions(integer),public.assisted_set_working_origin(),public.assisted_assert_execution_compatible(integer,jsonb),
 public.assisted_guard_obligation_validation(),public.assisted_guard_run_origin_immutable(),
 public.assisted_incorporate_stage_additions(integer,uuid,bigint,bigint,text,bigint,text,jsonb,jsonb,jsonb,text,jsonb,jsonb)
 TO service_role;

-- Exact nested task/participant data, also in the retained S0-only profile.
CREATE OR REPLACE FUNCTION public.assisted_preview_s0_additions(p_plan_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; base public.assisted_planning_stages%rowtype;
 old_sources jsonb; current_sources jsonb; added jsonb; reason text; item jsonb;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE';
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 SELECT * INTO base FROM public.assisted_planning_stages WHERE id=s.active_stage_id AND session_id=s.id;
 SELECT sources_json INTO old_sources FROM public.assisted_bootstrap_sources WHERE session_id=s.id;
 current_sources:=public.assisted_read_bootstrap_sources(p_plan_id);
 SELECT coalesce(jsonb_agg((t->>'id')::integer ORDER BY (t->>'id')::integer),'[]') INTO added
 FROM jsonb_array_elements(current_sources->'daily_tasks') t
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(base.snapshot_json->'tasks') b WHERE b->>'taskId'=t->>'id');
 IF base.ordinal IS DISTINCT FROM 0 OR s.draft_base_stage_id IS DISTINCT FROM base.id
  OR EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE session_id=s.id AND ordinal>0) THEN reason:='REBOOTSTRAP_ACCEPTED_STAGE';
 ELSIF s.draft_snapshot_json IS DISTINCT FROM base.snapshot_json OR s.draft_fingerprint IS DISTINCT FROM base.snapshot_fingerprint
  OR s.draft_scope_json<>'{}' OR s.draft_validation_id IS NOT NULL THEN reason:='REBOOTSTRAP_DIRTY_DRAFT';
 ELSIF EXISTS(SELECT 1 FROM public.planning_runs WHERE plan_id=p_plan_id AND
  (status IN ('queued','running','cancelling') OR (assisted_session_id=s.id AND status='success' AND assisted_result_json->>'outcome'='PROPOSAL'))) THEN reason:='REBOOTSTRAP_PENDING_PROPOSAL';
 ELSIF EXISTS(SELECT 1 FROM public.daily_tasks WHERE plan_id=p_plan_id AND
  (status NOT IN ('pending','interrupted') OR start_real IS NOT NULL OR end_real IS NOT NULL
   OR to_jsonb(daily_tasks)->>'start_real_at' IS NOT NULL OR to_jsonb(daily_tasks)->>'end_real_at' IS NOT NULL))
  OR EXISTS(SELECT 1 FROM public.locks WHERE plan_id=p_plan_id) THEN reason:='REBOOTSTRAP_PROTECTED_DAY';
 ELSIF old_sources IS NULL OR public.assisted_expected_obligation_sources(s.id) IS NULL THEN reason:='REBOOTSTRAP_BASELINE_UNAVAILABLE';
 ELSIF old_sources-ARRAY['daily_tasks','contestants'] IS DISTINCT FROM current_sources-ARRAY['daily_tasks','contestants'] THEN reason:='REBOOTSTRAP_AUTHORITY_CHANGED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(old_sources->'daily_tasks') old WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(current_sources->'daily_tasks') current_row WHERE current_row=old)) THEN reason:='REBOOTSTRAP_TASK_CHANGED_OR_REMOVED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(old_sources->'contestants') old WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(current_sources->'contestants') current_row WHERE current_row=old)) THEN reason:='REBOOTSTRAP_PARTICIPANT_CHANGED_OR_REMOVED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(current_sources->'contestants') c
  WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old_sources->'contestants') old_row WHERE old_row=c) AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(current_sources->'daily_tasks') t WHERE t->>'contestant_id'=c->>'id' AND added @> jsonb_build_array((t->>'id')::integer))) THEN reason:='REBOOTSTRAP_AUTHORITY_CHANGED';
 ELSIF jsonb_array_length(added)=0 THEN reason:='REBOOTSTRAP_NO_ADDITIONS'; END IF;
 RETURN jsonb_build_object('allowed',reason IS NULL,'reason',reason,'addedTaskIds',added,
  'pendingProposalIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM public.planning_runs WHERE assisted_session_id=s.id AND status='success' AND assisted_result_json->>'outcome'='PROPOSAL'),
  'expectedSessionId',s.id,'expectedBaseStageId',s.draft_base_stage_id,'expectedDraftFingerprint',s.draft_fingerprint,
  'expectedConfigRevisionId',s.current_config_revision_id,
  'sourceToken',encode(sha256(convert_to(current_sources::text,'UTF8')),'hex'));
END $$;
