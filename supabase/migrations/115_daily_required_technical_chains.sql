-- P0-U00s: one daily REQUIRED chain authority; the profile and 088 stay immutable.
ALTER TABLE public.plans ADD COLUMN daily_technical_chains jsonb;
ALTER TABLE public.plans ADD CONSTRAINT daily_technical_chain_single_authority CHECK (
 daily_technical_chains IS NULL OR (planner_next_profile IS NOT NULL AND planner_next_configuration IS NULL));
CREATE FUNCTION public.guard_daily_technical_chains() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.daily_technical_chains IS NOT NULL) OR
 (TG_OP='UPDATE' AND NEW.daily_technical_chains IS DISTINCT FROM OLD.daily_technical_chains) THEN
  IF current_user<>'service_role' OR current_setting('optiplan.daily_technical_chain_operation',true) IS DISTINCT FROM 'versioned'
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_REQUIRES_VERSIONED_OPERATION'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_daily_technical_chains BEFORE INSERT OR UPDATE ON public.plans
 FOR EACH ROW EXECUTE FUNCTION public.guard_daily_technical_chains();
REVOKE ALL ON FUNCTION public.guard_daily_technical_chains() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.assert_daily_technical_chains(p_plan integer,p_structure jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE policy jsonb; member jsonb; resource jsonb; ids integer[]:='{}'; resources integer[]:='{}';
 t public.daily_tasks%rowtype; tpl public.plan_task_template_snapshots%rowtype; deps jsonb; previous_template integer; idx integer;
BEGIN
 IF jsonb_typeof(p_structure) IS DISTINCT FROM 'object' OR p_structure->'contractVersion' IS DISTINCT FROM '1'::jsonb
 OR p_structure-ARRAY['contractVersion','policies']<>'{}'::jsonb OR jsonb_typeof(p_structure->'policies') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_structure->'policies')>1 THEN RAISE EXCEPTION 'UNSUPPORTED_TECHNICAL_CHAIN_STRUCTURE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plans WHERE id=p_plan AND planner_next_configuration IS NULL
  AND planner_next_profile#>>'{configuration,scenario}'='STANDALONE_ONLY'
  AND planner_next_profile#>>'{configuration,setup}'='NONE' AND planner_next_profile#>>'{configuration,transport}'='NONE'
  AND coalesce(daily_round_synchronization->'policies','[]')='[]')
 OR public.effective_operation_continuity(p_plan,'[]')<>'[]'::jsonb
 OR EXISTS(SELECT 1 FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan)
 THEN RAISE EXCEPTION 'UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION'; END IF;
 FOR policy IN SELECT value FROM jsonb_array_elements(p_structure->'policies') LOOP
  IF policy-ARRAY['id','orderedTaskIds','adjacency','resourceContinuity','requiredResourceIds']<>'{}'
   OR jsonb_typeof(policy->'id') IS DISTINCT FROM 'string' OR length(btrim(policy->>'id')) NOT BETWEEN 1 AND 120
   OR btrim(policy->>'id')<>policy->>'id' OR policy->>'adjacency' IS DISTINCT FROM 'REQUIRED'
   OR policy->>'resourceContinuity' IS DISTINCT FROM 'REQUIRED'
   OR jsonb_typeof(policy->'orderedTaskIds') IS DISTINCT FROM 'array' OR jsonb_array_length(policy->'orderedTaskIds')<2
   OR jsonb_typeof(policy->'requiredResourceIds') IS DISTINCT FROM 'array' OR jsonb_array_length(policy->'requiredResourceIds')<1
  THEN RAISE EXCEPTION 'UNSUPPORTED_TECHNICAL_CHAIN_STRUCTURE'; END IF;
  FOR resource IN SELECT value FROM jsonb_array_elements(policy->'requiredResourceIds') LOOP
   IF jsonb_typeof(resource) IS DISTINCT FROM 'number' OR resource::text!~'^[1-9][0-9]*$'
    OR resource::text::integer=ANY(resources) OR NOT EXISTS(SELECT 1 FROM public.plan_resource_items WHERE plan_id=p_plan AND id=resource::text::integer)
   THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_INVALID_RESOURCE'; END IF;
   resources:=array_append(resources,resource::text::integer);
  END LOOP;
  idx:=0;
  FOR member IN SELECT value FROM jsonb_array_elements(policy->'orderedTaskIds') LOOP
   IF jsonb_typeof(member) IS DISTINCT FROM 'number' OR member::text!~'^[1-9][0-9]*$' OR member::text::integer=ANY(ids)
   THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_INVALID_MEMBER'; END IF;
   ids:=array_append(ids,member::text::integer);
   SELECT * INTO t FROM public.daily_tasks WHERE id=member::text::integer AND plan_id=p_plan;
   IF NOT FOUND OR t.contestant_id IS NOT NULL OR t.status='cancelled'
    OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings WHERE plan_id=p_plan AND space_id=t.space_id)
   THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_INVALID_MEMBER'; END IF;
   SELECT * INTO tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=t.template_id;
   IF NOT FOUND OR tpl.planner_next_operation->>'kind' IS DISTINCT FROM 'technical' OR tpl.setup_id IS NOT NULL
    OR tpl.itinerant_team_requirement<>'none' OR coalesce(t.duration_override,tpl.default_duration)<=0
    OR coalesce(tpl.planner_next_operation->>'blocksSpace','true')<>'true'
    OR tpl.planner_next_operation->>'agendaScope'='ITINERANT_UNIT' OR tpl.planner_next_operation->>'allowsSpaceOverlap'='true'
    OR coalesce(tpl.resource_requirements->'byType','{}')<>'{}' OR coalesce(tpl.resource_requirements->'anyOf','[]')<>'[]'
    OR EXISTS(SELECT 1 FROM jsonb_each(coalesce(tpl.resource_requirements->'byItem','{}')) q WHERE q.value<>'1'::jsonb)
   THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_INVALID_MEMBER'; END IF;
   deps:=tpl.dependency_template_ids;
   IF deps IS DISTINCT FROM (CASE WHEN idx=0 THEN '[]'::jsonb ELSE jsonb_build_array(previous_template) END)
    OR (SELECT count(*) FROM public.daily_tasks d WHERE d.plan_id=p_plan AND d.template_id=t.template_id AND d.contestant_id IS NULL AND d.status<>'cancelled')<>1
   THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_INCOMPATIBLE_DEPENDENCIES'; END IF;
   FOR resource IN SELECT value FROM jsonb_array_elements(policy->'requiredResourceIds') LOOP
    IF NOT EXISTS(SELECT 1 FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND r.id=resource::text::integer
     AND tpl.resource_requirements#>ARRAY['byItem',r.resource_item_id::text]='1'::jsonb)
    THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_RESOURCE_NOT_REQUIRED'; END IF;
   END LOOP;
   previous_template:=t.template_id;idx:=idx+1;
  END LOOP;
  -- No external successor or branch from this component.
  IF EXISTS(SELECT 1 FROM public.daily_tasks d JOIN public.plan_task_template_snapshots dep_tpl ON dep_tpl.plan_id=d.plan_id AND dep_tpl.source_template_id=d.template_id,
   LATERAL jsonb_array_elements(dep_tpl.dependency_template_ids) dep
   JOIN public.daily_tasks parent ON parent.plan_id=p_plan AND parent.template_id=dep::text::integer AND parent.contestant_id IS NULL
   WHERE d.plan_id=p_plan AND d.status<>'cancelled' AND parent.id=ANY(ids)
   AND (array_position(ids,parent.id)+1 IS DISTINCT FROM array_position(ids,d.id)))
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_INCOMPATIBLE_DEPENDENCIES'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_daily_technical_chains(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_daily_technical_chains(integer,jsonb) TO service_role;

-- Universal revision guard closes U00q's coherent-hash / absent-authority attack,
-- including initialization and older generic writers. No historical revision is updated.
CREATE FUNCTION public.guard_technical_chain_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE chains jsonb;
BEGIN
 SELECT nullif(coalesce(daily_technical_chains->'policies',planner_next_configuration->'technicalChains'),'[]') INTO chains FROM public.plans WHERE id=NEW.plan_id;
 IF nullif(NEW.replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities,technicalChains}','[]') IS DISTINCT FROM chains
 THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_AUTHORITY_NOT_MATERIALIZED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER technical_chain_revision BEFORE INSERT ON public.plan_config_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_technical_chain_revision();
REVOKE ALL ON FUNCTION public.guard_technical_chain_revision() FROM PUBLIC,anon,authenticated,service_role;

-- Keep v5's implementation once. The wrapper performs the narrowly typed chain delta;
-- delegates optimizer/continuity/rounds, revision insertion and session invalidation.
ALTER FUNCTION public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) RENAME TO apply_day_config_operation_before_technical_chains;
CREATE OR REPLACE FUNCTION public.apply_day_config_operation_v5(
 p_plan_id integer,p_actor uuid,p_operation text,p_payload jsonb,p_expected_revision bigint,
 p_expected_identity jsonb,p_expected_replay jsonb,p_candidate_identity jsonb,p_candidate_replay jsonb,p_diff jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; guard text; result bigint;
 structure_selected boolean; old_chains jsonb; new_chains jsonb; path text[]:=ARRAY['authorities','plan_workday','0','plannerNextAuthorities','technicalChains'];
 s public.assisted_planning_sessions%rowtype; before_sources jsonb; changed jsonb; expected_candidate jsonb; component jsonb; work_fp text; all_fp text;
BEGIN
 PERFORM 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
 WHERE u.user_id=p_actor AND r.key IN ('admin','production') FOR SHARE OF u;
 IF NOT FOUND THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;

 structure_selected:=p_operation='EDIT' AND p_payload ? 'technicalChains';
 IF p_diff ? 'technicalChainTransition' THEN RAISE EXCEPTION 'INVALID_TECHNICAL_CHAIN_DIFF'; END IF;
 IF structure_selected THEN
  IF p_payload-ARRAY['technicalChains','expectedRevisionId']<>'{}' OR p_payload->'expectedRevisionId' IS DISTINCT FROM coalesce(to_jsonb(p_expected_revision),'null')
  THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
  SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR NO KEY UPDATE NOWAIT;
  IF FOUND THEN
   IF s.draft_snapshot_json IS DISTINCT FROM s.working_snapshot_json OR s.draft_fingerprint IS DISTINCT FROM s.working_fingerprint
    OR s.draft_scope_json<>'{}' THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_DIRTY_DRAFT'; END IF;
   IF (SELECT replay_snapshot_json FROM public.plan_config_revisions WHERE id=s.current_config_revision_id AND plan_id=p_plan_id) IS DISTINCT FROM p_expected_replay
    OR (SELECT identity_json FROM public.plan_config_revisions WHERE id=s.current_config_revision_id AND plan_id=p_plan_id) IS DISTINCT FROM p_expected_identity
   THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
   before_sources:=public.assisted_expected_obligation_sources(s.id);
   changed:=public.assisted_read_bootstrap_sources(p_plan_id);
   -- S0 stores empty assignments as [] in its codec; raw pending rows may use null.
   -- Normalize only this documented representation, preserving every other field/row.
   before_sources:=jsonb_set(before_sources,'{daily_tasks}',(SELECT jsonb_agg(t||jsonb_build_object('assigned_resource_ids',coalesce(nullif(t->'assigned_resource_ids','null'),'[]')) ORDER BY t::text) FROM jsonb_array_elements(before_sources->'daily_tasks') t));
   changed:=jsonb_set(changed,'{daily_tasks}',(SELECT jsonb_agg(t||jsonb_build_object('assigned_resource_ids',coalesce(nullif(t->'assigned_resource_ids','null'),'[]')) ORDER BY t::text) FROM jsonb_array_elements(changed->'daily_tasks') t));
   IF before_sources IS DISTINCT FROM changed
   THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.planning_runs r WHERE r.plan_id=p_plan_id AND (r.status IN ('queued','running','cancelling') OR (r.status='success' AND r.assisted_result_json->>'outcome'='PROPOSAL' AND NOT EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE proposal_run_id=r.id))))
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_PENDING_PROPOSAL'; END IF;
  PERFORM public.assert_daily_technical_chains(p_plan_id,p_payload->'technicalChains');
  old_chains:=nullif(p.daily_technical_chains->'policies','[]');
  new_chains:=nullif(p_payload#>'{technicalChains,policies}','[]');
  IF old_chains IS NOT DISTINCT FROM new_chains THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_NO_CHANGES'; END IF;
  IF p_expected_replay#>path IS DISTINCT FROM old_chains THEN RAISE EXCEPTION 'STALE_TECHNICAL_CHAIN'; END IF;
  -- A policy touching protected decisions can only remain literally identical.
  FOR changed IN SELECT value FROM jsonb_array_elements(coalesce(old_chains,'[]')) UNION SELECT value FROM jsonb_array_elements(coalesce(new_chains,'[]')) LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(changed->'orderedTaskIds') m JOIN public.daily_tasks t ON t.id=m::text::integer AND t.plan_id=p_plan_id
    WHERE t.start_planned IS NOT NULL OR t.status IN ('done','in_progress') OR EXISTS(SELECT 1 FROM public.locks WHERE plan_id=p_plan_id AND task_id=t.id))
    OR EXISTS(SELECT 1 FROM public.assisted_planning_stages st,LATERAL jsonb_array_elements(st.snapshot_json->'tasks') t
     WHERE st.plan_id=p_plan_id AND t->>'startPlanned' IS NOT NULL AND changed->'orderedTaskIds' @> jsonb_build_array(t->'taskId'))
   THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_PROTECTED_DECISIONS'; END IF;
  END LOOP;
  expected_candidate:=CASE WHEN new_chains IS NULL THEN p_expected_replay #- path ELSE jsonb_set(p_expected_replay,path,new_chains,true) END;
  IF expected_candidate IS DISTINCT FROM p_candidate_replay THEN RAISE EXCEPTION 'STALE_TECHNICAL_CHAIN_REPLAY'; END IF;
  work_fp:=encode(sha256(convert_to('{"contractVersion":1,"authority":"plan_workday","availability":"AVAILABLE","semanticValue":'||public.round_structure_canonical_json(p_candidate_replay#>'{authorities,plan_workday}')||'}','UTF8')),'hex');
  SELECT value INTO component FROM jsonb_array_elements(p_candidate_identity->'components') WHERE value->>'authority'='plan_workday';
  IF component->>'fingerprint' IS DISTINCT FROM work_fp
   OR jsonb_set(p_expected_identity,'{components}',(SELECT jsonb_agg(CASE WHEN value->>'authority'='plan_workday' THEN jsonb_set(value,'{fingerprint}',to_jsonb(work_fp)) ELSE value END ORDER BY ordinality) FROM jsonb_array_elements(p_expected_identity->'components') WITH ORDINALITY)) - 'configurationFingerprint'
    IS DISTINCT FROM p_candidate_identity-'configurationFingerprint'
  THEN RAISE EXCEPTION 'STALE_TECHNICAL_CHAIN_IDENTITY'; END IF;
  SELECT encode(sha256(convert_to('{"contractVersion":1,"components":'||public.round_structure_canonical_json(jsonb_agg(jsonb_build_object('authority',value->'authority','availability',value->'availability','fingerprint',value->'fingerprint') ORDER BY ordinality))||'}','UTF8')),'hex') INTO all_fp
   FROM jsonb_array_elements(p_candidate_identity->'components') WITH ORDINALITY;
  IF p_candidate_identity->>'configurationFingerprint' IS DISTINCT FROM all_fp THEN RAISE EXCEPTION 'STALE_TECHNICAL_CHAIN_IDENTITY'; END IF;
  -- Same CANONICAL_MATERIALIZATION contract as 104, before authority mutation.
  -- This prevents the delegate from capturing an old replay against a new rule.
  IF (SELECT fingerprint FROM public.plan_config_revisions WHERE id=p.current_config_revision_id AND plan_id=p_plan_id)
    IS DISTINCT FROM p_expected_identity->>'configurationFingerprint' THEN
   INSERT INTO public.plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json,created_by)
   VALUES(p_plan_id,p.current_config_revision_id,'CANONICAL_MATERIALIZATION',p_expected_identity->>'configurationFingerprint',p_expected_identity,p_expected_replay,
    jsonb_build_object('reason','legacy-or-stale-current-revision'),p_actor) RETURNING id INTO result;
   UPDATE public.plans SET current_config_revision_id=result WHERE id=p_plan_id;
   p_expected_revision:=result;
  END IF;
  guard:=current_setting('optiplan.daily_technical_chain_operation',true);
  PERFORM set_config('optiplan.daily_technical_chain_operation','versioned',true);
  UPDATE public.plans SET daily_technical_chains=p_payload->'technicalChains'||jsonb_build_object('by',p_actor,'at',now()) WHERE id=p_plan_id;
  PERFORM set_config('optiplan.daily_technical_chain_operation',coalesce(guard,''),true);
  -- Reuse the immutable revision diff for the explicit configuration transition.
  -- No admission row, replacement session, mutable bootstrap capture or new table.
  p_diff:=p_diff||jsonb_build_object('technicalChainTransition',jsonb_build_object('contractVersion',1,
   'sessionId',s.id,'baseStageId',s.active_stage_id,'previousSessionRevisionId',s.current_config_revision_id,
   'previousPlanRevisionId',p.current_config_revision_id,'before',p.daily_technical_chains,
   'after',(SELECT daily_technical_chains FROM public.plans WHERE id=p_plan_id),
   'sources',public.assisted_read_bootstrap_sources(p_plan_id)));
 END IF;
 result:=public.apply_day_config_operation_before_technical_chains(p_plan_id,p_actor,p_operation,p_payload-'technicalChains'-CASE WHEN structure_selected THEN 'expectedRevisionId' ELSE '__unused' END,p_expected_revision,
  p_expected_identity,p_expected_replay,p_candidate_identity,p_candidate_replay,p_diff);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.assisted_expected_obligation_sources(p_session bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; result jsonb; tasks jsonb; participants jsonb; transition_record public.plan_config_revisions%rowtype; admission_revision bigint;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE id=p_session;
 SELECT sources_json INTO result FROM public.assisted_obligation_transitions WHERE id=s.obligation_transition_id AND session_id=s.id;
 IF result IS NULL THEN SELECT sources_json INTO result FROM public.assisted_bootstrap_sources WHERE session_id=s.id; END IF;

 SELECT config_revision_id INTO admission_revision FROM public.assisted_obligation_transitions WHERE id=s.obligation_transition_id;
 SELECT * INTO transition_record FROM public.plan_config_revisions r WHERE r.plan_id=s.plan_id AND r.id<=s.current_config_revision_id
  AND r.id>coalesce(admission_revision,0) AND coalesce(r.diff_json#>>'{technicalChainTransition,sessionId}',r.diff_json#>>'{roundSynchronizationTransition,sessionId}')=s.id::text ORDER BY r.id DESC LIMIT 1;
 IF FOUND THEN
  result:=coalesce(transition_record.diff_json#>'{technicalChainTransition,sources}',transition_record.diff_json#>'{roundSynchronizationTransition,sources}');
  result:=jsonb_set(result,'{plans,0,current_config_revision_id}',to_jsonb(transition_record.id));
 END IF;
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


CREATE OR REPLACE FUNCTION public.assisted_preview_s0_additions(p_plan_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype; base public.assisted_planning_stages%rowtype;
 old_sources jsonb; current_sources jsonb; added jsonb; reason text; item jsonb; transition_record public.plan_config_revisions%rowtype;
BEGIN
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE';
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 SELECT * INTO base FROM public.assisted_planning_stages WHERE id=s.active_stage_id AND session_id=s.id;
 -- S0 has no consolidated planning changes: preserve its literal capture.
 SELECT sources_json INTO old_sources FROM public.assisted_bootstrap_sources WHERE session_id=s.id;
 SELECT * INTO transition_record FROM public.plan_config_revisions r WHERE r.plan_id=s.plan_id AND r.id<=s.current_config_revision_id
  AND coalesce(r.diff_json#>>'{technicalChainTransition,sessionId}',r.diff_json#>>'{roundSynchronizationTransition,sessionId}')=s.id::text ORDER BY r.id DESC LIMIT 1;
 IF FOUND THEN
  old_sources:=coalesce(transition_record.diff_json#>'{technicalChainTransition,sources}',transition_record.diff_json#>'{roundSynchronizationTransition,sources}');
  old_sources:=jsonb_set(old_sources,'{plans,0,current_config_revision_id}',to_jsonb(transition_record.id));
 END IF;
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

-- A null new authority must not stale historical source tokens merely on migration.
CREATE OR REPLACE FUNCTION public.assisted_read_bootstrap_sources(p_plan_id integer,p_lock boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE tab text; rows jsonb; result jsonb:='{}'; predicate text; projection text;
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
  projection:=CASE WHEN tab='plans' THEN '(to_jsonb(t) - CASE WHEN t.daily_round_synchronization IS NULL THEN ''daily_round_synchronization'' ELSE ''__absent'' END) - CASE WHEN t.daily_technical_chains IS NULL THEN ''daily_technical_chains'' ELSE ''__absent'' END' ELSE 'to_jsonb(t)' END;
  EXECUTE format('SELECT coalesce(jsonb_agg(v ORDER BY v::text),''[]''::jsonb) FROM (SELECT (%s)-''created_at''-''updated_at'' AS v FROM public.%I t WHERE %s) q',projection,tab,predicate) INTO rows USING p_plan_id;
  result:=result||jsonb_build_object(tab,rows);
 END LOOP;
 RETURN result;
END $$;

-- Material certificate: proof rows remain context-only when absent from Draft.
CREATE FUNCTION public.assert_daily_technical_chain_snapshot(p_plan integer,p_snapshot jsonb,p_revision bigint,p_run bigint DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; r public.planning_runs%rowtype; policy jsonb; proof jsonb; row jsonb; actual jsonb; member jsonb;
 task_row public.daily_tasks%rowtype; tpl public.plan_task_template_snapshots%rowtype; resource public.plan_resource_items%rowtype;
 planned integer; total integer; previous_end integer; previous_space integer; start_min integer; end_min integer; rid jsonb; missing_seen boolean:=false; margin integer;
BEGIN
 SELECT * INTO p FROM public.plans WHERE id=p_plan;
 IF p.daily_technical_chains IS NULL OR p.daily_technical_chains->'policies'='[]' THEN RETURN; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_revision OR (SELECT replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities,technicalChains}' FROM public.plan_config_revisions WHERE id=p_revision AND plan_id=p_plan)
  IS DISTINCT FROM p.daily_technical_chains->'policies' THEN RAISE EXCEPTION 'STALE_TECHNICAL_CHAIN_REPLAY'; END IF;
 PERFORM public.assert_daily_technical_chains(p_plan,p.daily_technical_chains-ARRAY['by','at']);
 policy:=p.daily_technical_chains#>'{policies,0}';total:=jsonb_array_length(policy->'orderedTaskIds');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'orderedTaskIds') m WHERE (SELECT count(*) FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE t->'taskId'=m)<>1)
 THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
 SELECT count(*) INTO planned FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE policy->'orderedTaskIds' @> jsonb_build_array(t->'taskId') AND t->>'startPlanned' IS NOT NULL;
 IF planned=total THEN proof:=p_snapshot->'tasks';
 ELSE
  SELECT * INTO r FROM public.planning_runs WHERE id=p_run AND plan_id=p_plan AND status='success' AND execution_kind='ASSISTED_SCOPE';
  IF NOT FOUND OR r.config_revision_id IS DISTINCT FROM p_revision OR r.assisted_result_json->'proposedDraftSnapshot' IS DISTINCT FROM p_snapshot
   OR r.assisted_result_json#>>'{evidence,technicalChainCertificate,status}' IS DISTINCT FROM 'WITNESS'
   OR r.assisted_result_json#>>'{evidence,technicalChainCertificate,contextOnly}' IS DISTINCT FROM 'true'
   OR r.result_fingerprint IS DISTINCT FROM encode(sha256(convert_to(r.assisted_result_json::text,'UTF8')),'hex')
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_FUTURE_CERTIFICATE_REQUIRED'; END IF;
  proof:=r.assisted_result_json#>'{evidence,technicalChainCertificate,tasks}';
  IF jsonb_typeof(proof) IS DISTINCT FROM 'array' OR jsonb_array_length(proof)<>total
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
 END IF;
 margin:=coalesce((p.planner_next_profile#>>'{configuration,resourceTransitionMinutes}')::integer,0);
 -- Every placed competitor must carry its real physical requirements. Otherwise
 -- removing its resource IDs could make a forged future witness appear sound.
 FOR actual IN SELECT value FROM jsonb_array_elements(p_snapshot->'tasks') WHERE value->>'startPlanned' IS NOT NULL LOOP
  SELECT * INTO task_row FROM public.daily_tasks WHERE plan_id=p_plan AND id=(actual->>'taskId')::integer;
  IF NOT FOUND THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
  SELECT * INTO tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=task_row.template_id;
  start_min:=public.hhmm_to_minutes(actual->>'startPlanned');end_min:=public.hhmm_to_minutes(actual->>'endPlanned');
  IF NOT FOUND OR actual->'spaceId' IS DISTINCT FROM to_jsonb(task_row.space_id)
   OR end_min-start_min IS DISTINCT FROM coalesce(task_row.duration_override,tpl.default_duration)
   OR jsonb_typeof(actual->'assignedResourceIds') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(coalesce(tpl.resource_requirements->'byItem','{}')) req WHERE req.value<>'1'::jsonb OR NOT EXISTS(
   SELECT 1 FROM public.plan_resource_items res WHERE res.plan_id=p_plan AND res.resource_item_id::text=req.key
    AND (actual->'assignedResourceIds') @> jsonb_build_array(res.id)))
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
  IF coalesce(tpl.planner_next_operation->>'resourceInheritance','LOCATION')<>'OPERATION_ONLY' AND EXISTS(
   SELECT 1 FROM (
    SELECT a.plan_resource_item_id AS id FROM public.plan_space_resource_assignments a WHERE a.plan_id=p_plan AND a.space_id=task_row.space_id
    UNION SELECT a.plan_resource_item_id FROM public.plan_zone_resource_assignments a JOIN public.plan_space_settings sp
     ON sp.plan_id=a.plan_id AND sp.zone_id=a.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=task_row.space_id
   ) required WHERE NOT (actual->'assignedResourceIds') @> jsonb_build_array(required.id))
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
  FOR rid IN SELECT value FROM jsonb_array_elements(actual->'assignedResourceIds') LOOP
   SELECT * INTO resource FROM public.plan_resource_items WHERE plan_id=p_plan AND id=rid::text::integer;
   IF NOT FOUND OR NOT resource.is_available OR start_min<public.hhmm_to_minutes(coalesce(resource.availability_start,p.work_start))
    OR end_min>public.hhmm_to_minutes(coalesce(resource.availability_end,p.work_end)) THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
  END LOOP;
 END LOOP;
 FOR member IN SELECT value FROM jsonb_array_elements(policy->'orderedTaskIds') LOOP
  IF (SELECT count(*) FROM jsonb_array_elements(proof) t WHERE t->'taskId'=member)<>1 THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
  SELECT value INTO row FROM jsonb_array_elements(proof) t WHERE t->'taskId'=member;
  SELECT value INTO actual FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE t->'taskId'=member;
  IF actual->>'startPlanned' IS NULL THEN missing_seen:=true;
  ELSIF missing_seen OR row->'startPlanned' IS DISTINCT FROM actual->'startPlanned' OR row->'endPlanned' IS DISTINCT FROM actual->'endPlanned'
   OR row->'spaceId' IS DISTINCT FROM actual->'spaceId' OR row->'assignedResourceIds' IS DISTINCT FROM actual->'assignedResourceIds'
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_INVALID_PREFIX'; END IF;
  SELECT * INTO task_row FROM public.daily_tasks WHERE id=member::text::integer AND plan_id=p_plan;
  SELECT * INTO tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=task_row.template_id;
  start_min:=public.hhmm_to_minutes(row->>'startPlanned');end_min:=public.hhmm_to_minutes(row->>'endPlanned');
  IF start_min IS NULL OR end_min IS NULL OR end_min-start_min IS DISTINCT FROM coalesce(task_row.duration_override,tpl.default_duration)
   OR row->'spaceId' IS DISTINCT FROM to_jsonb(task_row.space_id) OR start_min%5<>0
   OR start_min<public.hhmm_to_minutes(p.work_start) OR end_min>public.hhmm_to_minutes(p.work_end)
   OR (previous_end IS NOT NULL AND (previous_end<>start_min OR (previous_space IS DISTINCT FROM task_row.space_id AND margin>0)))
   OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings sp JOIN public.plan_zone_settings z ON z.plan_id=sp.plan_id AND z.zone_id=sp.zone_id
    WHERE sp.plan_id=p_plan AND sp.space_id=task_row.space_id AND start_min>=greatest(public.hhmm_to_minutes(coalesce(sp.availability_start,p.work_start)),public.hhmm_to_minutes(coalesce(z.availability_start,p.work_start)))
    AND end_min<=least(public.hhmm_to_minutes(coalesce(sp.availability_end,p.work_end)),public.hhmm_to_minutes(coalesce(z.availability_end,p.work_end))))
   OR (p.meal_mode='global_hard_break' AND start_min<public.hhmm_to_minutes(p.meal_end) AND end_min>public.hhmm_to_minutes(p.meal_start))
   OR jsonb_typeof(row->'assignedResourceIds') IS DISTINCT FROM 'array'
   OR NOT (row->'assignedResourceIds') @> (policy->'requiredResourceIds')
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(coalesce(tpl.resource_requirements->'byItem','{}')) req WHERE NOT EXISTS(
   SELECT 1 FROM public.plan_resource_items res WHERE res.plan_id=p_plan AND res.resource_item_id::text=req.key AND row->'assignedResourceIds' @> jsonb_build_array(res.id)))
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
  -- Inherited physical requirements are effective daily authority too. A
  -- coherent result hash cannot omit equipment assigned to a member's location.
  IF coalesce(tpl.planner_next_operation->>'resourceInheritance','LOCATION')<>'OPERATION_ONLY' AND EXISTS(
   SELECT 1 FROM (
    SELECT a.plan_resource_item_id AS id FROM public.plan_space_resource_assignments a WHERE a.plan_id=p_plan AND a.space_id=task_row.space_id
    UNION SELECT a.plan_resource_item_id FROM public.plan_zone_resource_assignments a JOIN public.plan_space_settings sp
     ON sp.plan_id=a.plan_id AND sp.zone_id=a.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=task_row.space_id
   ) required WHERE NOT (row->'assignedResourceIds') @> jsonb_build_array(required.id))
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
  FOR rid IN SELECT value FROM jsonb_array_elements(row->'assignedResourceIds') LOOP
   SELECT * INTO resource FROM public.plan_resource_items WHERE plan_id=p_plan AND id=rid::text::integer;
   IF NOT FOUND OR NOT resource.is_available OR start_min<public.hhmm_to_minutes(coalesce(resource.availability_start,p.work_start))
    OR end_min>public.hhmm_to_minutes(coalesce(resource.availability_end,p.work_end)) THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_snapshot->'tasks') other WHERE other->>'startPlanned' IS NOT NULL
   AND NOT policy->'orderedTaskIds' @> jsonb_build_array(other->'taskId') AND (
    (other->'spaceId'=row->'spaceId' AND public.hhmm_to_minutes(other->>'startPlanned')<end_min AND public.hhmm_to_minutes(other->>'endPlanned')>start_min)
    OR (EXISTS(SELECT 1 FROM jsonb_array_elements(row->'assignedResourceIds') res WHERE coalesce(other->'assignedResourceIds','[]') @> jsonb_build_array(res))
     AND public.hhmm_to_minutes(other->>'startPlanned')<end_min+margin AND public.hhmm_to_minutes(other->>'endPlanned')>start_min-margin)))
  THEN RAISE EXCEPTION 'TECHNICAL_CHAIN_CERTIFICATE_INVALID'; END IF;
  previous_end:=end_min;previous_space:=task_row.space_id;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_daily_technical_chain_snapshot(integer,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_daily_technical_chain_snapshot(integer,jsonb,bigint,bigint) TO service_role;

CREATE FUNCTION public.guard_daily_technical_chain_stage() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.assisted_planning_sessions%rowtype;
BEGIN
 IF TG_TABLE_NAME='planning_stage_validations' THEN
  SELECT * INTO s FROM public.assisted_planning_sessions WHERE id=NEW.session_id AND plan_id=NEW.plan_id;
  PERFORM public.assert_daily_technical_chain_snapshot(NEW.plan_id,s.draft_snapshot_json,NEW.config_revision_id,(NEW.report_json->>'proposalRunId')::bigint);
 ELSIF NEW.ordinal>0 THEN
  PERFORM public.assert_daily_technical_chain_snapshot(NEW.plan_id,NEW.snapshot_json,NEW.config_revision_id,NEW.proposal_run_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER technical_chain_validation BEFORE INSERT ON public.planning_stage_validations FOR EACH ROW EXECUTE FUNCTION public.guard_daily_technical_chain_stage();
CREATE TRIGGER technical_chain_stage BEFORE INSERT ON public.assisted_planning_stages FOR EACH ROW EXECUTE FUNCTION public.guard_daily_technical_chain_stage();
REVOKE ALL ON FUNCTION public.guard_daily_technical_chain_stage() FROM PUBLIC,anon,authenticated,service_role;
