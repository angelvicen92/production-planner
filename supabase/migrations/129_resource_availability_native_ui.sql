-- Generated with Supabase CLI 2.75.0; numbered according to the repository ledger.
-- Extend the existing CAS writer. No new RPC or revision system.
DO $migration$
DECLARE definition text; branch text;
BEGIN
 definition:=pg_get_functiondef('public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure);
 IF strpos(definition,'structure_selected:=')=0 OR strpos(definition,'resourceAvailability')>0
 THEN RAISE EXCEPTION 'RESOURCE_AVAILABILITY_PREDECESSOR_DRIFT'; END IF;
 branch:=$branch$
 IF p_diff ? 'resourceAvailabilityTransition' THEN RAISE EXCEPTION 'RESOURCE_AVAILABILITY_INVALID_DIFF'; END IF;
 IF p_payload ? 'resourceAvailability' AND p_operation<>'RESOURCE_AVAILABILITY' THEN RAISE EXCEPTION 'RESOURCE_AVAILABILITY_INVALID_OPERATION'; END IF;
 IF p_operation='RESOURCE_AVAILABILITY' AND p_payload ? 'resourceAvailability' THEN
  IF p_payload-ARRAY['resourceAvailability','expectedRevisionId']<>'{}'
   OR NOT p_payload ? 'expectedRevisionId'
   OR p_payload->'expectedRevisionId' IS DISTINCT FROM coalesce(to_jsonb(p_expected_revision),'null')
   OR jsonb_typeof(p_payload->'resourceAvailability') IS DISTINCT FROM 'object'
   OR (p_payload->'resourceAvailability')-ARRAY['id','availabilityStart','availabilityEnd']<>'{}'
   OR NOT (p_payload->'resourceAvailability' ?& ARRAY['id','availabilityStart','availabilityEnd'])
   OR jsonb_typeof(p_payload#>'{resourceAvailability,id}') IS DISTINCT FROM 'number'
   OR coalesce(p_payload#>>'{resourceAvailability,id}','')!~'^[1-9][0-9]*$'
  THEN RAISE EXCEPTION 'RESOURCE_AVAILABILITY_INVALID_OPERATION'; END IF;
  PERFORM public.assisted_read_bootstrap_sources(p_plan_id,true);
  -- Protect all accepted branches, actual execution and locks. This version does
  -- not offer post-placement grandfathering or recertification of resource edits.
  IF EXISTS(SELECT 1 FROM public.daily_tasks WHERE plan_id=p_plan_id AND
    (start_planned IS NOT NULL OR end_planned IS NOT NULL OR status IN ('done','in_progress') OR start_real IS NOT NULL OR end_real IS NOT NULL))
   OR EXISTS(SELECT 1 FROM public.locks WHERE plan_id=p_plan_id)
   OR EXISTS(SELECT 1 FROM public.assisted_planning_stages st,LATERAL jsonb_array_elements(st.snapshot_json->'tasks') t
     WHERE st.plan_id=p_plan_id AND (t->>'startPlanned' IS NOT NULL OR t->>'endPlanned' IS NOT NULL))
  THEN RAISE EXCEPTION 'RESOURCE_AVAILABILITY_PROTECTED_DECISIONS'; END IF;
  SELECT * INTO s FROM public.assisted_planning_sessions WHERE plan_id=p_plan_id AND status='ACTIVE' FOR NO KEY UPDATE NOWAIT;
  IF FOUND THEN
   IF s.draft_snapshot_json IS DISTINCT FROM s.working_snapshot_json OR s.draft_fingerprint IS DISTINCT FROM s.working_fingerprint OR s.draft_scope_json<>'{}'
   THEN RAISE EXCEPTION 'RESOURCE_AVAILABILITY_DIRTY_DRAFT'; END IF;
   IF (SELECT replay_snapshot_json FROM public.plan_config_revisions WHERE id=s.current_config_revision_id AND plan_id=p_plan_id) IS DISTINCT FROM p_expected_replay
    OR (SELECT identity_json FROM public.plan_config_revisions WHERE id=s.current_config_revision_id AND plan_id=p_plan_id) IS DISTINCT FROM p_expected_identity
   THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
   before_sources:=public.assisted_expected_obligation_sources(s.id);
   changed:=public.assisted_read_bootstrap_sources(p_plan_id);
   -- Same S0 codec normalization as the existing typed configuration writers.
   before_sources:=jsonb_set(before_sources,'{daily_tasks}',(SELECT coalesce(jsonb_agg(t||jsonb_build_object('assigned_resource_ids',coalesce(nullif(t->'assigned_resource_ids','null'),'[]')) ORDER BY t::text),'[]') FROM jsonb_array_elements(before_sources->'daily_tasks') t));
   changed:=jsonb_set(changed,'{daily_tasks}',(SELECT coalesce(jsonb_agg(t||jsonb_build_object('assigned_resource_ids',coalesce(nullif(t->'assigned_resource_ids','null'),'[]')) ORDER BY t::text),'[]') FROM jsonb_array_elements(changed->'daily_tasks') t));
   IF before_sources IS NULL OR before_sources IS DISTINCT FROM changed THEN RAISE EXCEPTION 'STALE_OBLIGATION_SOURCES'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.planning_runs r WHERE r.plan_id=p_plan_id AND
    (r.status IN ('queued','running','cancelling') OR (r.status='success' AND r.assisted_result_json->>'outcome'='PROPOSAL'
      AND NOT EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE proposal_run_id=r.id))))
  THEN RAISE EXCEPTION 'RESOURCE_AVAILABILITY_PENDING_PROPOSAL'; END IF;
  -- Authenticate the entire resource projection, including nullable ad hoc ID,
  -- against SQL before changing exactly the pair on one existing identity.
  IF jsonb_array_length(p_expected_replay#>'{authorities,resource_configuration}') IS DISTINCT FROM (SELECT count(*)::integer FROM public.plan_resource_items WHERE plan_id=p_plan_id)
   OR EXISTS(SELECT 1 FROM public.plan_resource_items r LEFT JOIN public.resource_types rt ON rt.id=r.type_id
     WHERE r.plan_id=p_plan_id AND NOT (p_expected_replay#>'{authorities,resource_configuration}' @> jsonb_build_array(jsonb_build_object(
      'id',r.id,'resourceItemId',r.resource_item_id,'typeId',r.type_id,'typeCode',rt.code,'typeName',rt.name,'name',r.name,
      'isAvailable',r.is_available,'availabilityStart',r.availability_start,'availabilityEnd',r.availability_end))))
  THEN RAISE EXCEPTION 'STALE_RESOURCE_AVAILABILITY'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.plan_resource_items WHERE plan_id=p_plan_id AND id=(p_payload#>>'{resourceAvailability,id}')::integer)
  THEN RAISE EXCEPTION 'RESOURCE_AVAILABILITY_NOT_FOUND'; END IF;
  -- Preserve the canonical array order supplied by the existing TS producer;
  -- prove it is a permutation of exactly the patched daily projection.
  SELECT jsonb_agg(CASE WHEN value->>'id'=p_payload#>>'{resourceAvailability,id}'
    THEN value||((p_payload->'resourceAvailability')-'id') ELSE value END) INTO changed
   FROM jsonb_array_elements(p_expected_replay#>'{authorities,resource_configuration}');
  new_chains:=p_candidate_replay#>'{authorities,resource_configuration}';
  IF jsonb_array_length(changed) IS DISTINCT FROM jsonb_array_length(new_chains) OR NOT (changed @> new_chains AND new_chains @> changed)
   OR jsonb_set(p_expected_replay,'{authorities,resource_configuration}',new_chains) IS DISTINCT FROM p_candidate_replay
  THEN RAISE EXCEPTION 'STALE_RESOURCE_AVAILABILITY_REPLAY'; END IF;
  work_fp:=encode(sha256(convert_to('{"contractVersion":1,"authority":"resource_configuration","availability":"AVAILABLE","semanticValue":'||public.round_structure_canonical_json(new_chains)||'}','UTF8')),'hex');
  SELECT value INTO component FROM jsonb_array_elements(p_candidate_identity->'components') WHERE value->>'authority'='resource_configuration';
  IF component->>'fingerprint' IS DISTINCT FROM work_fp
   OR jsonb_set(p_expected_identity,'{components}',(SELECT jsonb_agg(CASE WHEN value->>'authority'='resource_configuration' THEN jsonb_set(value,'{fingerprint}',to_jsonb(work_fp)) ELSE value END ORDER BY ordinality) FROM jsonb_array_elements(p_expected_identity->'components') WITH ORDINALITY))-'configurationFingerprint'
     IS DISTINCT FROM p_candidate_identity-'configurationFingerprint'
  THEN RAISE EXCEPTION 'STALE_RESOURCE_AVAILABILITY_IDENTITY'; END IF;
  SELECT encode(sha256(convert_to('{"contractVersion":1,"components":'||public.round_structure_canonical_json(jsonb_agg(jsonb_build_object('authority',value->'authority','availability',value->'availability','fingerprint',value->'fingerprint') ORDER BY ordinality))||'}','UTF8')),'hex') INTO all_fp
   FROM jsonb_array_elements(p_candidate_identity->'components') WITH ORDINALITY;
  IF p_candidate_identity->>'configurationFingerprint' IS DISTINCT FROM all_fp THEN RAISE EXCEPTION 'STALE_RESOURCE_AVAILABILITY_IDENTITY'; END IF;
  IF (SELECT fingerprint FROM public.plan_config_revisions WHERE id=p.current_config_revision_id AND plan_id=p_plan_id)
    IS DISTINCT FROM p_expected_identity->>'configurationFingerprint' THEN
   INSERT INTO public.plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json,created_by)
   VALUES(p_plan_id,p.current_config_revision_id,'CANONICAL_MATERIALIZATION',p_expected_identity->>'configurationFingerprint',p_expected_identity,p_expected_replay,
    jsonb_build_object('reason','legacy-or-stale-current-revision'),p_actor) RETURNING id INTO result;
   UPDATE public.plans SET current_config_revision_id=result WHERE id=p_plan_id;
   p_expected_revision:=result;
  END IF;
  guard:=current_setting('optiplan.resource_availability_operation',true);
  PERFORM set_config('optiplan.resource_availability_operation','versioned',true);
  UPDATE public.plan_resource_items SET availability_start=p_payload#>>'{resourceAvailability,availabilityStart}',availability_end=p_payload#>>'{resourceAvailability,availabilityEnd}'
   WHERE plan_id=p_plan_id AND id=(p_payload#>>'{resourceAvailability,id}')::integer;
  PERFORM set_config('optiplan.resource_availability_operation',coalesce(guard,''),true);
  p_diff:=p_diff||jsonb_build_object('resourceAvailabilityTransition',jsonb_build_object('contractVersion',1,'sessionId',s.id,
    'baseStageId',s.active_stage_id,'previousSessionRevisionId',s.current_config_revision_id,
    'previousPlanRevisionId',p.current_config_revision_id,'sources',public.assisted_read_bootstrap_sources(p_plan_id)));
  RETURN public.apply_day_config_operation_before_technical_chains(p_plan_id,p_actor,'EDIT','{}',p_expected_revision,
    p_expected_identity,p_expected_replay,p_candidate_identity,p_candidate_replay,p_diff);
 END IF;
 $branch$;
 definition:=replace(definition,'structure_selected:=',branch||E'\n structure_selected:=');
 EXECUTE definition;
 -- Consume the existing immutable revision/source transition in the same readers.
 FOREACH definition IN ARRAY ARRAY['public.assisted_expected_obligation_sources(bigint)','public.assisted_preview_s0_additions(integer)'] LOOP
  branch:=pg_get_functiondef(definition::regprocedure);
  IF strpos(branch,'coalesce(r.diff_json#>>''{resourceRouteTransition,sessionId}''')=0 THEN RAISE EXCEPTION 'RESOURCE_AVAILABILITY_PREDECESSOR_DRIFT'; END IF;
  branch:=replace(branch,'coalesce(r.diff_json#>>''{resourceRouteTransition,sessionId}''','coalesce(r.diff_json#>>''{resourceAvailabilityTransition,sessionId}'',r.diff_json#>>''{resourceRouteTransition,sessionId}''');
  branch:=replace(branch,'coalesce(transition_record.diff_json#>''{resourceRouteTransition,sources}''','coalesce(transition_record.diff_json#>''{resourceAvailabilityTransition,sources}'',transition_record.diff_json#>''{resourceRouteTransition,sources}''');
  EXECUTE branch;
 END LOOP;
END $migration$;

-- The REST service_role bypasses RLS. Close the old direct PATCH as well as
-- insert/delete/activation paths once a session has captured its authorities.
CREATE FUNCTION public.guard_resource_availability_operation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE pid integer;
BEGIN
 pid:=CASE WHEN TG_OP='DELETE' THEN OLD.plan_id ELSE NEW.plan_id END;
 PERFORM 1 FROM public.plans WHERE id=pid FOR UPDATE;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.availability_start,NEW.availability_end) IS DISTINCT FROM ROW(OLD.availability_start,OLD.availability_end) THEN
  IF current_user<>'service_role' OR current_setting('optiplan.resource_availability_operation',true) IS DISTINCT FROM 'versioned'
  THEN RAISE EXCEPTION 'RESOURCE_AVAILABILITY_REQUIRES_VERSIONED_OPERATION'; END IF;
 ELSIF EXISTS(SELECT 1 FROM public.assisted_planning_sessions WHERE plan_id=pid AND status='ACTIVE')
  OR EXISTS(SELECT 1 FROM public.daily_tasks WHERE plan_id=pid AND (start_planned IS NOT NULL OR end_planned IS NOT NULL OR status IN ('done','in_progress')))
  OR EXISTS(SELECT 1 FROM public.locks WHERE plan_id=pid) THEN
  RAISE EXCEPTION 'RESOURCE_AVAILABILITY_CAPTURED_SOURCES';
 END IF;
 IF TG_OP='INSERT' AND NEW.source='adhoc' AND NOT EXISTS(SELECT 1 FROM public.resource_types WHERE id=NEW.type_id AND is_active)
 THEN RAISE EXCEPTION 'RESOURCE_AVAILABILITY_INACTIVE_TYPE'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER resource_availability_operation BEFORE INSERT OR UPDATE OR DELETE ON public.plan_resource_items
 FOR EACH ROW EXECUTE FUNCTION public.guard_resource_availability_operation();
REVOKE ALL ON FUNCTION public.guard_resource_availability_operation() FROM PUBLIC,anon,authenticated,service_role;
