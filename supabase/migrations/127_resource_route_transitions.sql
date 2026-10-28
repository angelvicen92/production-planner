-- P0-G02: one daily directional authority, using the existing v5 CAS/replay transition.
ALTER TABLE public.plans ADD COLUMN daily_resource_route_transitions jsonb;
ALTER TABLE public.plans ADD CONSTRAINT resource_route_single_authority CHECK (
 daily_resource_route_transitions IS NULL OR (planner_next_profile IS NOT NULL AND planner_next_configuration IS NULL));

CREATE FUNCTION public.assert_daily_resource_routes(p_plan integer,structure jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; route jsonb; key text; seen text[]:='{}'; rid integer; origin integer; destination integer; duration integer;
BEGIN
 SELECT * INTO STRICT p FROM public.plans WHERE id=p_plan;
 IF jsonb_typeof(structure) IS DISTINCT FROM 'object' OR structure->'contractVersion' IS DISTINCT FROM '1'::jsonb
  OR structure-ARRAY['contractVersion','routes']<>'{}' OR jsonb_typeof(structure->'routes') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_INVALID_STRUCTURE'; END IF;
 IF nullif(p.planner_next_profile->'configuration','null') IS NULL OR p.planner_next_configuration IS NOT NULL
 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_AUTHORITY_CONFLICT'; END IF;
 IF structure->'routes' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(value ORDER BY (value->>'planResourceItemId')::integer,(value->>'fromSpaceId')::integer,(value->>'toSpaceId')::integer),'[]') FROM jsonb_array_elements(structure->'routes'))
 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_NONCANONICAL'; END IF;
 FOR route IN SELECT value FROM jsonb_array_elements(structure->'routes') LOOP
  IF jsonb_typeof(route) IS DISTINCT FROM 'object' OR route-ARRAY['planResourceItemId','fromSpaceId','toSpaceId','minutes']<>'{}'
   OR jsonb_typeof(route->'planResourceItemId') IS DISTINCT FROM 'number' OR coalesce(route->>'planResourceItemId','')!~'^[1-9][0-9]*$'
   OR jsonb_typeof(route->'fromSpaceId') IS DISTINCT FROM 'number' OR coalesce(route->>'fromSpaceId','')!~'^[1-9][0-9]*$'
   OR jsonb_typeof(route->'toSpaceId') IS DISTINCT FROM 'number' OR coalesce(route->>'toSpaceId','')!~'^[1-9][0-9]*$'
   OR jsonb_typeof(route->'minutes') IS DISTINCT FROM 'number' OR coalesce(route->>'minutes','')!~'^[1-9][0-9]*$'
  THEN RAISE EXCEPTION 'RESOURCE_ROUTE_INVALID_STRUCTURE'; END IF;
  rid:=(route->>'planResourceItemId')::integer;origin:=(route->>'fromSpaceId')::integer;destination:=(route->>'toSpaceId')::integer;duration:=(route->>'minutes')::integer;
  key:=rid||':'||origin||':'||destination;
  IF origin=destination OR duration%5<>0 OR key=ANY(seen) THEN RAISE EXCEPTION 'RESOURCE_ROUTE_INVALID_OR_DUPLICATE'; END IF;
  seen:=array_append(seen,key);
  IF NOT EXISTS(SELECT 1 FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND r.id=rid AND r.is_available
    AND ((r.availability_start IS NULL AND r.availability_end IS NULL) OR (r.availability_start IS NOT NULL AND r.availability_end IS NOT NULL
     AND r.availability_start<r.availability_end))
    AND greatest(coalesce(r.availability_start,p.work_start),p.work_start)<least(coalesce(r.availability_end,p.work_end),p.work_end))
   OR (SELECT count(*) FROM public.plan_space_settings sp JOIN public.plan_zone_settings z ON z.plan_id=sp.plan_id AND z.zone_id=sp.zone_id
     WHERE sp.plan_id=p_plan AND sp.space_id IN (origin,destination)
      AND greatest(coalesce(sp.availability_start,p.work_start),coalesce(z.availability_start,p.work_start),p.work_start)
       <least(coalesce(sp.availability_end,p.work_end),coalesce(z.availability_end,p.work_end),p.work_end))<>2
  THEN RAISE EXCEPTION 'RESOURCE_ROUTE_UNAVAILABLE_CATALOG'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_daily_resource_routes(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_daily_resource_routes(integer,jsonb) TO service_role;

-- SQL mirror of the existing physical resolver. The revision is the only source of routes.
CREATE FUNCTION public.resource_transition_minutes(authority jsonb,rid text,origin text,destination text,fallback integer) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE count_rules integer; minutes integer;
BEGIN
 IF origin=destination THEN RETURN 0; END IF;
 SELECT count(*),min(value) INTO count_rules,minutes FROM (
  SELECT (route->>'minutes')::integer value FROM jsonb_array_elements(coalesce(authority->'resourceRouteTransitions','[]')) route
   WHERE 'plan-resource:'||(route->>'planResourceItemId')=rid AND 'space:'||(route->>'fromSpaceId')=origin AND 'space:'||(route->>'toSpaceId')=destination
  UNION ALL SELECT (route->>'minutes')::integer FROM jsonb_array_elements(coalesce(authority->'coachRouteTransitions','[]')) route
   WHERE 'plan-resource:'||(route->>'coachPlanResourceItemId')=rid AND 'space:'||(route->>'fromSpaceId')=origin AND 'space:'||(route->>'toSpaceId')=destination
 ) declarations;
 IF count_rules>1 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_AMBIGUOUS_DECLARATION'; END IF;
 RETURN coalesce(minutes,fallback);
END $$;
CREATE FUNCTION public.resource_transition_pair_minutes(authority jsonb,a jsonb,b jsonb,fallback integer) RETURNS integer
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(max(public.resource_transition_minutes(authority,rid,
  CASE WHEN (a->>'start')::integer<=(b->>'start')::integer THEN a->>'spaceId' ELSE b->>'spaceId' END,
  CASE WHEN (a->>'start')::integer<=(b->>'start')::integer THEN b->>'spaceId' ELSE a->>'spaceId' END,fallback)),0)
 FROM (SELECT DISTINCT value rid FROM jsonb_array_elements_text(coalesce(a->'requiredResourceIds','[]')||CASE WHEN a->>'coachId' IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(a->>'coachId') END)
  INTERSECT SELECT DISTINCT value FROM jsonb_array_elements_text(coalesce(b->'requiredResourceIds','[]')||CASE WHEN b->>'coachId' IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(b->>'coachId') END)) shared
$$;
REVOKE ALL ON FUNCTION public.resource_transition_minutes(jsonb,text,text,text,integer),public.resource_transition_pair_minutes(jsonb,jsonb,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resource_transition_minutes(jsonb,text,text,text,integer),public.resource_transition_pair_minutes(jsonb,jsonb,jsonb,integer) TO service_role;

-- Extend the shared writer; retain actor checks, source locks, CAS, identity hashing,
-- session transition and immutable source capture. No additional configuration RPC.
DO $migration$
DECLARE definition text; old_text text;
BEGIN
 definition:=pg_get_functiondef('public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure);
 old_text:='structure_selected boolean; meal_selected boolean;';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,old_text,old_text||' route_selected boolean;');
 definition:=replace(definition,'meal_selected:=p_operation=''EDIT'' AND p_payload ? ''operationalMealPolicies'';',
  'route_selected:=p_operation=''EDIT'' AND p_payload ? ''resourceRouteTransitions''; meal_selected:=p_operation=''EDIT'' AND p_payload ? ''operationalMealPolicies'';');
 definition:=replace(definition,'capability_key:=CASE WHEN meal_selected','capability_key:=CASE WHEN route_selected THEN ''resourceRouteTransitions'' WHEN meal_selected');
 definition:=replace(definition,'authority_key:=CASE WHEN meal_selected','authority_key:=CASE WHEN route_selected THEN ''resourceRouteTransitions'' WHEN meal_selected');
 definition:=replace(definition,'transition_key:=CASE WHEN meal_selected','transition_key:=CASE WHEN route_selected THEN ''resourceRouteTransition'' WHEN meal_selected');
 definition:=replace(definition,'previous_authority:=CASE WHEN meal_selected','previous_authority:=CASE WHEN route_selected THEN p.daily_resource_route_transitions WHEN meal_selected');
 definition:=replace(definition,'p_diff ? ''jointGroupTransition'' OR','p_diff ? ''resourceRouteTransition'' OR p_diff ? ''jointGroupTransition'' OR');
 definition:=replace(definition,'IF meal_selected THEN PERFORM public.assert_daily_operational_meals',
  'IF route_selected THEN PERFORM public.assert_daily_resource_routes(p_plan_id,p_payload->capability_key); ELSIF meal_selected THEN PERFORM public.assert_daily_operational_meals');
 definition:=replace(definition,'->CASE WHEN meal_selected THEN ''policies'' ELSE ''groups'' END','->CASE WHEN route_selected THEN ''routes'' WHEN meal_selected THEN ''policies'' ELSE ''groups'' END');
 old_text:='IF meal_selected THEN
    IF EXISTS(SELECT 1 FROM public.assisted_planning_stages';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,old_text,'IF route_selected THEN
    IF EXISTS(SELECT 1 FROM public.daily_tasks WHERE plan_id=p_plan_id AND (start_planned IS NOT NULL OR status IN (''done'',''in_progress'')))
     OR EXISTS(SELECT 1 FROM public.assisted_planning_stages st,LATERAL jsonb_array_elements(st.snapshot_json->''tasks'') t WHERE st.plan_id=p_plan_id AND t->>''startPlanned'' IS NOT NULL)
    THEN RAISE EXCEPTION ''RESOURCE_ROUTE_PROTECTED_DECISIONS''; END IF;
   ELSIF meal_selected THEN
    IF EXISTS(SELECT 1 FROM public.assisted_planning_stages');
 definition:=replace(definition,'IF NOT meal_selected THEN','IF NOT meal_selected AND NOT route_selected THEN');
 old_text:='expected_candidate:=CASE WHEN new_chains IS NULL THEN expected_candidate #- ARRAY[''authorities'',''plan_workday'',''0'',''plannerNextAuthorities'',version_key] ELSE jsonb_set(expected_candidate,ARRAY[''authorities'',''plan_workday'',''0'',''plannerNextAuthorities'',version_key],''1''::jsonb,true) END;';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,old_text,'IF NOT route_selected THEN '||old_text||' END IF;');
 old_text:='IF meal_selected THEN UPDATE public.plans SET daily_operational_meal_policies=';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,old_text,'IF route_selected THEN UPDATE public.plans SET daily_resource_route_transitions=(p_payload->capability_key)||jsonb_build_object(''by'',p_actor,''at'',now()) WHERE id=p_plan_id; ELSIF meal_selected THEN UPDATE public.plans SET daily_operational_meal_policies=');
 definition:=replace(definition,'SELECT CASE WHEN meal_selected THEN daily_operational_meal_policies','SELECT CASE WHEN route_selected THEN daily_resource_route_transitions WHEN meal_selected THEN daily_operational_meal_policies');
 EXECUTE definition;
 -- The existing transition readers also own route edits made after S0.
 FOREACH old_text IN ARRAY ARRAY['public.assisted_expected_obligation_sources(bigint)','public.assisted_preview_s0_additions(integer)'] LOOP
  definition:=pg_get_functiondef(old_text::regprocedure);
  IF strpos(definition,'coalesce(r.diff_json#>>''{operationalMealTransition,sessionId}''')=0 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PREDECESSOR_DRIFT'; END IF;
  definition:=replace(definition,'coalesce(r.diff_json#>>''{operationalMealTransition,sessionId}''','coalesce(r.diff_json#>>''{resourceRouteTransition,sessionId}'',r.diff_json#>>''{operationalMealTransition,sessionId}''');
  definition:=replace(definition,'coalesce(transition_record.diff_json#>''{operationalMealTransition,sources}''','coalesce(transition_record.diff_json#>''{resourceRouteTransition,sources}'',transition_record.diff_json#>''{operationalMealTransition,sources}''');
  EXECUTE definition;
 END LOOP;
 definition:=pg_get_functiondef('public.assisted_read_bootstrap_sources(integer,boolean)'::regprocedure);
 old_text:='- CASE WHEN t.daily_operational_meal_policies IS NULL THEN ''''daily_operational_meal_policies'''' ELSE ''''__absent'''' END';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PREDECESSOR_DRIFT'; END IF;
 EXECUTE replace(definition,old_text,old_text||' - CASE WHEN t.daily_resource_route_transitions IS NULL THEN ''''daily_resource_route_transitions'''' ELSE ''''__absent'''' END');
END $migration$;

-- Reuse the authenticated full physical witness validator (120/126). Ordinary
-- nominal choices retain the 112 validator rather than inventing identity selection here.
CREATE FUNCTION public.guard_daily_resource_routes() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; authority jsonb; routes jsonb; snapshot jsonb; s public.assisted_planning_sessions%rowtype;
BEGIN
 IF TG_TABLE_NAME='plans' THEN
  IF (TG_OP='INSERT' AND NEW.daily_resource_route_transitions IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.daily_resource_route_transitions IS DISTINCT FROM OLD.daily_resource_route_transitions) THEN
   IF current_user<>'service_role' OR current_setting('optiplan.daily_joint_group_operation',true) IS DISTINCT FROM 'versioned' THEN RAISE EXCEPTION 'RESOURCE_ROUTE_REQUIRES_VERSIONED_OPERATION'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='daily_tasks' THEN
  SELECT * INTO STRICT p FROM public.plans WHERE id=OLD.plan_id;
  IF coalesce(p.daily_resource_route_transitions->'routes','[]')<>'[]' AND (OLD.start_planned IS NOT NULL OR EXISTS(SELECT 1 FROM public.assisted_planning_stages st,LATERAL jsonb_array_elements(st.snapshot_json->'tasks') t WHERE st.plan_id=OLD.plan_id AND t->'taskId'=to_jsonb(OLD.id) AND t->>'startPlanned' IS NOT NULL)) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PROTECTED_SOURCE'; END IF;
   IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.contestant_id IS DISTINCT FROM OLD.contestant_id OR NEW.space_id IS DISTINCT FROM OLD.space_id OR NEW.duration_override IS DISTINCT FROM OLD.duration_override OR NEW.status='cancelled' THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PROTECTED_SOURCE'; END IF;
   IF (NEW.start_planned IS DISTINCT FROM OLD.start_planned OR NEW.end_planned IS DISTINCT FROM OLD.end_planned OR NEW.assigned_resource_ids IS DISTINCT FROM OLD.assigned_resource_ids)
    AND current_setting('optiplan.anchored_task_materialization',true) IS DISTINCT FROM txid_current()::text THEN RAISE EXCEPTION 'RESOURCE_ROUTE_REQUIRES_ASSISTED_MATERIALIZATION'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
 END IF;
 SELECT * INTO STRICT p FROM public.plans WHERE id=NEW.plan_id;
 IF p.daily_resource_route_transitions IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='plan_config_revisions' THEN authority:=NEW.replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities}';
 ELSE SELECT replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities}' INTO authority FROM public.plan_config_revisions WHERE id=NEW.config_revision_id AND plan_id=NEW.plan_id;
 END IF;
 PERFORM public.assert_daily_resource_routes(NEW.plan_id,p.daily_resource_route_transitions-ARRAY['by','at']);
 routes:=nullif(p.daily_resource_route_transitions->'routes','[]');
 IF authority->'resourceRouteTransitions' IS DISTINCT FROM routes THEN RAISE EXCEPTION 'RESOURCE_ROUTE_REVISION_NOT_MATERIALIZED'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(routes,'[]')) a,jsonb_array_elements(coalesce(authority->'coachRouteTransitions','[]')) b
  WHERE a->'planResourceItemId'=b->'coachPlanResourceItemId' AND a->'fromSpaceId'=b->'fromSpaceId' AND a->'toSpaceId'=b->'toSpaceId') THEN RAISE EXCEPTION 'RESOURCE_ROUTE_AMBIGUOUS_DECLARATION'; END IF;
 IF TG_TABLE_NAME='plan_config_revisions' OR routes IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='planning_stage_validations' THEN
  SELECT * INTO STRICT s FROM public.assisted_planning_sessions WHERE id=NEW.session_id AND plan_id=NEW.plan_id;snapshot:=s.draft_snapshot_json;
 ELSIF NEW.ordinal>0 THEN snapshot:=NEW.snapshot_json;ELSE RETURN NEW;END IF;
 IF EXISTS(SELECT 1 FROM public.daily_tasks d JOIN public.plan_task_template_snapshots t ON t.plan_id=d.plan_id AND t.source_template_id=d.template_id
   WHERE d.plan_id=NEW.plan_id AND d.status<>'cancelled' AND (coalesce(t.resource_requirements->'byType','{}')<>'{}' OR coalesce(t.resource_requirements->'anyOf','[]')<>'[]')) THEN
  -- 112 authenticates the witness during validation; Stage must consume that
  -- exact clean validation and its immutable proposal (the existing acceptance guard).
  IF TG_TABLE_NAME='assisted_planning_stages' AND NOT EXISTS(SELECT 1 FROM public.planning_stage_validations v WHERE v.id=(NEW.validation_summary_json->>'validationId')::bigint AND v.session_id=NEW.session_id AND v.draft_fingerprint=NEW.snapshot_fingerprint AND v.hard_count=0 AND v.required_count=0 AND v.plan_id=NEW.plan_id AND v.config_revision_id=NEW.config_revision_id AND v.report_json->>'nominalResourceFuture'='CERTIFIED') THEN RAISE EXCEPTION 'RESOURCE_ROUTE_AUTHENTIC_VALIDATION_REQUIRED'; END IF;
 ELSE PERFORM public.assert_anchored_choice_witness(NEW.plan_id,snapshot,NEW.config_revision_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER resource_route_authority BEFORE INSERT OR UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.guard_daily_resource_routes();
CREATE TRIGGER resource_route_revision BEFORE INSERT ON public.plan_config_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_daily_resource_routes();
CREATE TRIGGER resource_route_validation BEFORE INSERT ON public.planning_stage_validations FOR EACH ROW EXECUTE FUNCTION public.guard_daily_resource_routes();
CREATE TRIGGER resource_route_stage BEFORE INSERT ON public.assisted_planning_stages FOR EACH ROW EXECUTE FUNCTION public.guard_daily_resource_routes();
CREATE TRIGGER resource_route_source BEFORE UPDATE OR DELETE ON public.daily_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_daily_resource_routes();
REVOKE ALL ON FUNCTION public.guard_daily_resource_routes() FROM PUBLIC,anon,authenticated,service_role;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('nominal_resource_private.guard_nominal_physical_validation()'::regprocedure);
 needle:='END<margin';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PREDECESSOR_DRIFT: nominal_resource_private.guard_nominal_physical_validation()'; END IF;
 definition:=replace(definition,needle,'END<public.resource_transition_pair_minutes(workday->''plannerNextAuthorities'',a,b,margin)');
 needle:='coalesce((SELECT (route->>''minutes'')::integer FROM jsonb_array_elements(coalesce(workday#>''{plannerNextAuthorities,coachRouteTransitions}'',''[]''::jsonb)) route
           WHERE ''plan-resource:''||(route->>''coachPlanResourceItemId'')=a->>''coachId''
             AND ''space:''||(route->>''fromSpaceId'')=CASE WHEN (a->>''start'')::integer<=(b->>''start'')::integer THEN a->>''spaceId'' ELSE b->>''spaceId'' END
             AND ''space:''||(route->>''toSpaceId'')=CASE WHEN (a->>''start'')::integer<=(b->>''start'')::integer THEN b->>''spaceId'' ELSE a->>''spaceId'' END),margin)';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PREDECESSOR_DRIFT: nominal_resource_private.guard_nominal_physical_validation()'; END IF;
 definition:=replace(definition,needle,'public.resource_transition_pair_minutes(workday->''plannerNextAuthorities'',a,b,margin)');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_anchored_choice_witness(integer,jsonb,bigint)'::regprocedure);
 needle:='gap<margin';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PREDECESSOR_DRIFT: public.assert_anchored_choice_witness(integer,jsonb,bigint)'; END IF;
 definition:=replace(definition,needle,'gap<public.resource_transition_pair_minutes(replay,item,other,margin)');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_task_scope_snapshot(integer,jsonb,bigint)'::regprocedure);
 needle:='gap<transition_min AND EXISTS(SELECT 1 FROM jsonb_array_elements(actual->''resources'') rid WHERE other->''resources'' @> jsonb_build_array(rid))';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PREDECESSOR_DRIFT: public.assert_task_scope_snapshot(integer,jsonb,bigint)'; END IF;
 definition:=replace(definition,needle,'EXISTS(SELECT 1 FROM jsonb_array_elements(actual->''resources'') rid WHERE other->''resources'' @> jsonb_build_array(rid) AND gap<public.resource_transition_minutes((SELECT replay_snapshot_json#>''{authorities,plan_workday,0,plannerNextAuthorities}'' FROM public.plan_config_revisions WHERE id=p_revision AND plan_id=p_plan),''plan-resource:''||rid::text,''space:''||(actual->>''space''),''space:''||(other->>''space''),transition_min))');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_technical_chain_snapshot(integer,jsonb,bigint,bigint)'::regprocedure);
 needle:='public.hhmm_to_minutes(other->>''startPlanned'')<end_min+margin AND public.hhmm_to_minutes(other->>''endPlanned'')>start_min-margin';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PREDECESSOR_DRIFT: public.assert_daily_technical_chain_snapshot(integer,jsonb,bigint,bigint)'; END IF;
 definition:=replace(definition,needle,'((public.hhmm_to_minutes(other->>''startPlanned'')<end_min AND public.hhmm_to_minutes(other->>''endPlanned'')>start_min) OR (public.hhmm_to_minutes(other->>''startPlanned'')>=end_min AND public.hhmm_to_minutes(other->>''startPlanned'')-end_min<public.resource_transition_pair_minutes((SELECT replay_snapshot_json#>''{authorities,plan_workday,0,plannerNextAuthorities}'' FROM public.plan_config_revisions WHERE id=p_revision AND plan_id=p_plan),jsonb_build_object(''start'',public.hhmm_to_minutes(row->>''startPlanned''),''spaceId'',''space:''||(row->>''spaceId''),''requiredResourceIds'',(SELECT coalesce(jsonb_agg(''plan-resource:''||value),''[]'') FROM jsonb_array_elements_text(row->''assignedResourceIds''))),jsonb_build_object(''start'',public.hhmm_to_minutes(other->>''startPlanned''),''spaceId'',''space:''||(other->>''spaceId''),''requiredResourceIds'',(SELECT coalesce(jsonb_agg(''plan-resource:''||value),''[]'') FROM jsonb_array_elements_text(other->''assignedResourceIds''))),margin)) OR (public.hhmm_to_minutes(other->>''endPlanned'')<=start_min AND start_min-public.hhmm_to_minutes(other->>''endPlanned'')<public.resource_transition_pair_minutes((SELECT replay_snapshot_json#>''{authorities,plan_workday,0,plannerNextAuthorities}'' FROM public.plan_config_revisions WHERE id=p_revision AND plan_id=p_plan),jsonb_build_object(''start'',public.hhmm_to_minutes(row->>''startPlanned''),''spaceId'',''space:''||(row->>''spaceId''),''requiredResourceIds'',(SELECT coalesce(jsonb_agg(''plan-resource:''||value),''[]'') FROM jsonb_array_elements_text(row->''assignedResourceIds''))),jsonb_build_object(''start'',public.hhmm_to_minutes(other->>''startPlanned''),''spaceId'',''space:''||(other->>''spaceId''),''requiredResourceIds'',(SELECT coalesce(jsonb_agg(''plan-resource:''||value),''[]'') FROM jsonb_array_elements_text(other->''assignedResourceIds''))),margin)))');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_anchored_choice_witness(integer,jsonb,bigint)'::regprocedure);
 needle:='WHERE coalesce(p.daily_joint_groups->''groups'',''[]'')<>''[]'' AND NOT op ? ''declaredResourceIds''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'RESOURCE_ROUTE_PREDECESSOR_DRIFT: public.assert_anchored_choice_witness(integer,jsonb,bigint)'; END IF;
 definition:=replace(definition,needle,'WHERE (coalesce(p.daily_joint_groups->''groups'',''[]'')<>''[]'' OR coalesce(p.daily_resource_route_transitions->''routes'',''[]'')<>''[]'') AND NOT op ? ''declaredResourceIds''');
 EXECUTE definition;
END $migration$;
