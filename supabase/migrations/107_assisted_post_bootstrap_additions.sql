-- U00c: capture additional authority without changing historical Stage/replay contracts.
CREATE TABLE public.assisted_bootstrap_sources (
 session_id bigint PRIMARY KEY REFERENCES public.assisted_planning_sessions(id) ON DELETE CASCADE,
 sources_json jsonb NOT NULL, previous_session_id bigint REFERENCES public.assisted_planning_sessions(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assisted_bootstrap_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assisted_bootstrap_sources FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.assisted_bootstrap_sources TO service_role;

-- Fixed allowlist shared by capture and locking. Timestamps do not define obligations.
CREATE FUNCTION public.assisted_read_bootstrap_sources(p_plan_id integer,p_lock boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE tab text; rows jsonb; result jsonb:='{}'; predicate text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['plans','daily_tasks','contestants','locks','plan_breaks',
  'plan_task_template_snapshots','plan_optimizer_snapshots','plan_optimizer_snapshot_heuristics','plan_optimizer_snapshot_grouping_zones',
  'plan_zone_settings','plan_space_settings','plan_resource_items','plan_resource_bundle_snapshots',
  'plan_zone_resource_assignments','plan_space_resource_assignments','plan_zone_resource_type_requirements','plan_space_resource_type_requirements',
  'resource_availability','plan_itinerant_unit_snapshots','program_settings','resource_types','resource_item_components'] LOOP
  -- SHARE prevents both row changes and phantom insertions during the short commit.
  IF p_lock THEN EXECUTE format('LOCK TABLE public.%I IN SHARE MODE NOWAIT',tab); END IF;
  predicate:=CASE WHEN tab='plans' THEN 't.id=$1'
   WHEN tab IN ('plan_optimizer_snapshot_heuristics','plan_optimizer_snapshot_grouping_zones') THEN 't.snapshot_id IN (SELECT id FROM public.plan_optimizer_snapshots WHERE plan_id=$1)'
   WHEN tab='program_settings' THEN 't.id=1'
   WHEN tab='resource_types' THEN 't.id IN (SELECT type_id FROM public.plan_resource_items WHERE plan_id=$1)'
   WHEN tab='resource_item_components' THEN 't.parent_resource_item_id IN (SELECT resource_item_id FROM public.plan_resource_items WHERE plan_id=$1)'
   ELSE 't.plan_id=$1' END;
  EXECUTE format('SELECT coalesce(jsonb_agg(v ORDER BY v::text),''[]''::jsonb) FROM (SELECT to_jsonb(t)-''created_at''-''updated_at'' AS v FROM public.%I t WHERE %s) q',tab,predicate) INTO rows USING p_plan_id;
  result:=result||jsonb_build_object(tab,rows);
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION public.assisted_bootstrap_source_token(p_plan_id integer)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT encode(sha256(convert_to(public.assisted_read_bootstrap_sources(p_plan_id)::text,'UTF8')),'hex')
$$;

CREATE FUNCTION public.assisted_capture_bootstrap_sources() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 INSERT INTO public.assisted_bootstrap_sources(session_id,sources_json,previous_session_id)
 VALUES(NEW.id,public.assisted_read_bootstrap_sources(NEW.plan_id),(SELECT max(id) FROM public.assisted_planning_sessions WHERE plan_id=NEW.plan_id AND status='CLOSED'));
 RETURN NEW;
END $$;
CREATE TRIGGER assisted_capture_bootstrap_sources AFTER INSERT ON public.assisted_planning_sessions
 FOR EACH ROW EXECUTE FUNCTION public.assisted_capture_bootstrap_sources();

-- No historical backfill: missing task/participant fields cannot be invented.
CREATE FUNCTION public.assisted_preview_bootstrap_additions(p_plan_id integer)
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
 ELSIF old_sources IS NULL THEN reason:='REBOOTSTRAP_BASELINE_UNAVAILABLE';
 ELSIF old_sources-ARRAY['daily_tasks','contestants'] IS DISTINCT FROM current_sources-ARRAY['daily_tasks','contestants'] THEN reason:='REBOOTSTRAP_AUTHORITY_CHANGED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(old_sources->'daily_tasks') old WHERE NOT (current_sources->'daily_tasks') @> jsonb_build_array(old)) THEN reason:='REBOOTSTRAP_TASK_CHANGED_OR_REMOVED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(old_sources->'contestants') old WHERE NOT (current_sources->'contestants') @> jsonb_build_array(old)) THEN reason:='REBOOTSTRAP_PARTICIPANT_CHANGED_OR_REMOVED';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(current_sources->'contestants') c
  WHERE NOT (old_sources->'contestants') @> jsonb_build_array(c) AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(current_sources->'daily_tasks') t WHERE t->>'contestant_id'=c->>'id' AND added @> jsonb_build_array((t->>'id')::integer))) THEN reason:='REBOOTSTRAP_AUTHORITY_CHANGED';
 ELSIF jsonb_array_length(added)=0 THEN reason:='REBOOTSTRAP_NO_ADDITIONS'; END IF;
 RETURN jsonb_build_object('allowed',reason IS NULL,'reason',reason,'addedTaskIds',added,
  'pendingProposalIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM public.planning_runs WHERE assisted_session_id=s.id AND status='success' AND assisted_result_json->>'outcome'='PROPOSAL'),
  'expectedSessionId',s.id,'expectedBaseStageId',s.draft_base_stage_id,'expectedDraftFingerprint',s.draft_fingerprint,
  'expectedConfigRevisionId',s.current_config_revision_id,
  'sourceToken',encode(sha256(convert_to(current_sources::text,'UTF8')),'hex'));
END $$;

CREATE FUNCTION public.assisted_guarded_bootstrap_session(p_plan_id integer,p_user_id uuid,p_source_token text,
 p_identity jsonb,p_replay jsonb,p_snapshot jsonb,p_fingerprint text)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
 IF public.assisted_bootstrap_source_token(p_plan_id) IS DISTINCT FROM p_source_token THEN RAISE EXCEPTION 'REBOOTSTRAP_STALE_SOURCES'; END IF;
 RETURN public.assisted_bootstrap_session(p_plan_id,p_user_id,p_identity,p_replay,p_snapshot,p_fingerprint);
END $$;

CREATE FUNCTION public.assisted_rebootstrap_additions(p_plan_id integer,p_user_id uuid,p_expected_session bigint,
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
 preview:=public.assisted_preview_bootstrap_additions(p_plan_id);
 IF preview->>'sourceToken' IS DISTINCT FROM p_source_token THEN RAISE EXCEPTION 'REBOOTSTRAP_STALE_SOURCES'; END IF;
 IF NOT (preview->>'allowed')::boolean THEN RAISE EXCEPTION '%',preview->>'reason'; END IF;
 UPDATE public.assisted_planning_sessions SET status='CLOSED',updated_at=now() WHERE id=s.id;
 new_id:=public.assisted_bootstrap_session(p_plan_id,p_user_id,p_identity,p_replay,p_snapshot,p_fingerprint);
 RETURN new_id;
END $$;

-- Runs cannot race past session replacement or refer to obligations absent from S0.
CREATE FUNCTION public.assisted_guard_new_run_session() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype;
BEGIN
 IF NEW.execution_kind IS DISTINCT FROM 'ASSISTED_SCOPE' THEN
  -- Serialize other planner starts too: replacement must never miss a run
  -- already started on the same day. Later runs retain their existing contract.
  PERFORM 1 FROM public.assisted_planning_sessions WHERE plan_id=NEW.plan_id AND status='ACTIVE' FOR NO KEY UPDATE;
  RETURN NEW;
 END IF;
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE id=NEW.assisted_session_id AND plan_id=NEW.plan_id FOR NO KEY UPDATE;
 IF NOT FOUND OR s.status<>'ACTIVE' THEN RAISE EXCEPTION 'RUN_SESSION_MISMATCH'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM NEW.base_stage_id OR s.draft_fingerprint IS DISTINCT FROM NEW.source_draft_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 IF s.current_config_revision_id IS DISTINCT FROM NEW.config_revision_id THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.scope_task_ids_json) t WHERE NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(s.draft_snapshot_json->'tasks') d WHERE d->>'taskId'=t#>>'{}')) THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assisted_guard_new_run_session BEFORE INSERT ON public.planning_runs
 FOR EACH ROW EXECUTE FUNCTION public.assisted_guard_new_run_session();

REVOKE ALL ON FUNCTION public.assisted_read_bootstrap_sources(integer,boolean),public.assisted_bootstrap_source_token(integer),public.assisted_capture_bootstrap_sources(),public.assisted_preview_bootstrap_additions(integer),public.assisted_guarded_bootstrap_session(integer,uuid,text,jsonb,jsonb,jsonb,text),public.assisted_rebootstrap_additions(integer,uuid,bigint,bigint,text,bigint,text,jsonb,jsonb,jsonb,text),public.assisted_guard_new_run_session() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assisted_read_bootstrap_sources(integer,boolean),public.assisted_bootstrap_source_token(integer),public.assisted_capture_bootstrap_sources(),public.assisted_preview_bootstrap_additions(integer),public.assisted_guarded_bootstrap_session(integer,uuid,text,jsonb,jsonb,jsonb,text),public.assisted_rebootstrap_additions(integer,uuid,bigint,bigint,text,bigint,text,jsonb,jsonb,jsonb,text),public.assisted_guard_new_run_session() TO service_role;

CREATE FUNCTION public.assisted_discard_pending_proposal(p_plan_id integer,p_run_id bigint,p_expected_base bigint,p_expected_fingerprint text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base OR s.draft_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
 UPDATE public.planning_runs SET status='error',cancelled_at=now(),cancel_reason='OPERATOR_DISCARDED_PROPOSAL'
 WHERE id=p_run_id AND assisted_session_id=s.id AND plan_id=p_plan_id AND status='success'
  AND assisted_result_json->>'outcome'='PROPOSAL'
  AND NOT EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE proposal_run_id=p_run_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'RUN_NOT_READY'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assisted_discard_pending_proposal(integer,bigint,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assisted_discard_pending_proposal(integer,bigint,bigint,text) TO service_role;
