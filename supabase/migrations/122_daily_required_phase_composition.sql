-- P0-U01b: extend the existing daily authority and physical certificate.
-- No historical migration, writer, table, trigger, RLS or grant is replaced.
DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_technical_chains(integer,jsonb)'::regprocedure);
 definition:=replace(definition,'previous_template integer; idx integer;',
  'previous_template integer; idx integer; p public.plans%rowtype; phase jsonb; flat jsonb; phase_ids jsonb; g jsonb;');
 needle:='BEGIN
 IF jsonb_typeof(p_structure)';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'PHASE_UNEXPECTED_AUTHORITY'; END IF;
 definition:=replace(definition,needle,'BEGIN
 -- Absence of phases retains the complete historical linear implementation.
 IF p_structure#>''{policies,0,phases}'' IS NOT NULL THEN
  SELECT * INTO STRICT p FROM public.plans WHERE id=p_plan;
  policy:=p_structure#>''{policies,0}'';
  IF p_structure-ARRAY[''contractVersion'',''policies'']<>''{}'' OR p_structure->''contractVersion'' IS DISTINCT FROM ''1''::jsonb
   OR jsonb_typeof(p_structure->''policies'') IS DISTINCT FROM ''array'' OR jsonb_array_length(p_structure->''policies'')<>1
   OR policy-ARRAY[''id'',''orderedTaskIds'',''phases'',''adjacency'',''resourceContinuity'',''requiredResourceIds'']<>''{}''
   OR jsonb_typeof(policy->''id'') IS DISTINCT FROM ''string'' OR length(btrim(policy->>''id'')) NOT BETWEEN 1 AND 120 OR btrim(policy->>''id'')<>policy->>''id''
   OR policy->>''adjacency'' IS DISTINCT FROM ''REQUIRED'' OR policy->>''resourceContinuity'' IS DISTINCT FROM ''REQUIRED''
   OR jsonb_typeof(policy->''phases'') IS DISTINCT FROM ''array'' OR jsonb_array_length(policy->''phases'')=0
   OR jsonb_typeof(policy->''orderedTaskIds'') IS DISTINCT FROM ''array'' OR jsonb_array_length(policy->''orderedTaskIds'')<2
   OR jsonb_typeof(policy->''requiredResourceIds'') IS DISTINCT FROM ''array'' OR jsonb_array_length(policy->''requiredResourceIds'')=0
  THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_INVALID_PHASES''; END IF;
  IF p.planner_next_configuration IS NOT NULL OR p.planner_next_profile#>>''{configuration,scenario}'' IS DISTINCT FROM ''STANDALONE_ONLY''
   OR p.planner_next_profile#>>''{configuration,setup}'' IS DISTINCT FROM ''NONE'' OR p.planner_next_profile#>>''{configuration,transport}'' IS DISTINCT FROM ''NONE''
   OR p.meal_mode IS DISTINCT FROM ''global_hard_break'' OR coalesce(p.daily_round_synchronization->''policies'',''[]'')<>''[]''
   OR coalesce(p.daily_anchored_accompaniments->''policies'',''[]'')<>''[]'' OR coalesce(p.daily_task_operation_scopes->''policies'',''[]'')<>''[]''
   OR public.effective_operation_continuity(p_plan,''[]'')<>''[]'' OR EXISTS(SELECT 1 FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan)
   OR EXISTS(SELECT 1 FROM public.daily_tasks d JOIN public.plan_task_template_snapshots s ON s.plan_id=d.plan_id AND s.source_template_id=d.template_id
    WHERE d.plan_id=p_plan AND d.status<>''cancelled'' AND (s.setup_id IS NOT NULL OR s.itinerant_team_requirement<>''none''
     OR coalesce(s.resource_requirements->''byType'',''{}'')<>''{}'' OR coalesce(s.resource_requirements->''anyOf'',''[]'')<>''[]''
     OR coalesce(s.planner_next_operation->>''blocksSpace'',''true'')<>''true'' OR s.planner_next_operation->>''agendaScope''=''ITINERANT_UNIT''
     OR s.planner_next_operation->>''allowsSpaceOverlap''=''true''))
  THEN RAISE EXCEPTION ''UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION''; END IF;
  flat:=''[]'';phase_ids:=''{}'';idx:=0;
  FOR phase IN SELECT value FROM jsonb_array_elements(policy->''phases'') LOOP
   IF jsonb_typeof(phase) IS DISTINCT FROM ''array'' OR jsonb_array_length(phase)=0 THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_INVALID_PHASES''; END IF;
   flat:=flat||phase;
   FOR member IN SELECT value FROM jsonb_array_elements(phase) LOOP
    IF jsonb_typeof(member) IS DISTINCT FROM ''number'' OR member::text!~''^[1-9][0-9]*$'' OR member::text::integer=ANY(ids) THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_INVALID_MEMBER''; END IF;
    ids:=array_append(ids,member::text::integer);phase_ids:=phase_ids||jsonb_build_object(member::text,idx);
   END LOOP;idx:=idx+1;
  END LOOP;
  IF flat IS DISTINCT FROM policy->''orderedTaskIds'' THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_INVALID_PHASES''; END IF;
  FOR g IN SELECT value FROM jsonb_array_elements(coalesce(p.daily_joint_groups->''groups'',''[]'')) LOOP
   IF (SELECT count(*) FROM jsonb_array_elements(g->''taskIds'') m WHERE flat @> jsonb_build_array(m))>1 THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_DUPLICATE_PHYSICAL_OPERATION''; END IF;
   SELECT phase_ids->(m::text) INTO phase FROM jsonb_array_elements(g->''taskIds'') m WHERE flat @> jsonb_build_array(m);
   IF FOUND THEN FOR member IN SELECT value FROM jsonb_array_elements(g->''taskIds'') LOOP phase_ids:=phase_ids||jsonb_build_object(member::text,phase); END LOOP; END IF;
  END LOOP;
  FOR resource IN SELECT value FROM jsonb_array_elements(policy->''requiredResourceIds'') LOOP
   IF jsonb_typeof(resource) IS DISTINCT FROM ''number'' OR resource::text!~''^[1-9][0-9]*$'' OR resource::text::integer=ANY(resources)
    OR NOT EXISTS(SELECT 1 FROM public.plan_resource_items WHERE plan_id=p_plan AND id=resource::text::integer) THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_INVALID_RESOURCE''; END IF;
   resources:=array_append(resources,resource::text::integer);
  END LOOP;
  FOR member IN SELECT to_jsonb(key::integer) FROM jsonb_each(phase_ids) LOOP
   SELECT * INTO t FROM public.daily_tasks WHERE plan_id=p_plan AND id=member::text::integer;
   IF NOT FOUND OR t.status=''cancelled'' OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings WHERE plan_id=p_plan AND space_id=t.space_id) THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_INVALID_MEMBER''; END IF;
   SELECT * INTO STRICT tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=t.template_id;
   IF tpl.planner_next_operation->>''kind'' NOT IN (''technical'',''auxiliary'') OR tpl.planner_next_operation->>''kind'' IS NULL
    OR coalesce(t.duration_override,tpl.default_duration)<=0 OR coalesce(t.duration_override,tpl.default_duration)%5<>0
    OR EXISTS(SELECT 1 FROM jsonb_each(coalesce(tpl.resource_requirements->''byItem'',''{}'')) q WHERE q.value<>''1'')
   THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_INVALID_MEMBER''; END IF;
   IF NOT (public.joint_task_resources(p_plan,t.id) @> (policy->''requiredResourceIds'')) THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_RESOURCE_NOT_REQUIRED''; END IF;
  END LOOP;
  -- Check dependency identity, cycles and backwards phase edges, including peers
  -- and paths through external prerequisites. The realized order is checked later.
  IF EXISTS(WITH RECURSIVE edges AS (
    SELECT d.id child,parent.id parent FROM public.daily_tasks d JOIN public.plan_task_template_snapshots s ON s.plan_id=d.plan_id AND s.source_template_id=d.template_id
    CROSS JOIN LATERAL jsonb_array_elements(s.dependency_template_ids) dep
    LEFT JOIN public.daily_tasks parent ON parent.plan_id=d.plan_id AND parent.contestant_id IS NOT DISTINCT FROM d.contestant_id AND parent.template_id=dep::text::integer AND parent.status<>''cancelled''
    WHERE d.plan_id=p_plan AND d.status<>''cancelled''),
   paths AS (SELECT child,parent,ARRAY[child] visited FROM edges WHERE phase_ids ? child::text
    UNION ALL SELECT paths.child,e.parent,visited||paths.parent FROM paths JOIN edges e ON e.child=paths.parent WHERE NOT paths.parent=ANY(visited))
   SELECT 1 FROM paths WHERE parent IS NULL OR parent=ANY(visited)
    OR phase_ids ? parent::text AND (phase_ids->>parent::text)::integer>(phase_ids->>child::text)::integer)
  THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_INCOMPATIBLE_DEPENDENCIES''; END IF;
  RETURN;
 END IF;
 IF jsonb_typeof(p_structure)');
 EXECUTE definition;
 -- Admit phases in both authoring directions. Their authority still applies all
 -- material restrictions above, and the joint/meal validators keep their checks.
 definition:=pg_get_functiondef('public.assert_daily_joint_groups(integer,jsonb)'::regprocedure);
 needle:='coalesce(p.daily_technical_chains->''policies'',''[]'')<>''[]''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'PHASE_UNEXPECTED_JOINT_GUARD'; END IF;
 definition:=replace(definition,needle,'(coalesce(p.daily_technical_chains->''policies'',''[]'')<>''[]'' AND p.daily_technical_chains#>''{policies,0,phases}'' IS NULL)');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.assert_daily_operational_meals(integer,jsonb)'::regprocedure);
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'PHASE_UNEXPECTED_MEAL_GUARD'; END IF;
 definition:=replace(definition,needle,'(coalesce(p.daily_technical_chains->''policies'',''[]'')<>''[]'' AND p.daily_technical_chains#>''{policies,0,phases}'' IS NULL)');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_technical_chain_snapshot(integer,jsonb,bigint,bigint)'::regprocedure);
 definition:=replace(definition,'missing_seen boolean:=false; margin integer;',
  'missing_seen boolean:=false; margin integer; phase_index integer; previous_phase integer;');
 needle:=' policy:=p.daily_technical_chains#>''{policies,0}'';total:=';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'PHASE_UNEXPECTED_SNAPSHOT_CONSUMER'; END IF;
 definition:=replace(definition,needle,' policy:=p.daily_technical_chains#>''{policies,0}'';
 IF policy ? ''phases'' THEN
  -- The same authenticated global witness used by joints and physical pauses.
  -- A prefix is acceptable only if this complete realization preserves it.
  PERFORM public.assert_anchored_choice_witness(p_plan,p_snapshot,p_revision);
  PERFORM public.assert_operational_meal_snapshot(p_plan,p_snapshot,p_revision);
  SELECT * INTO r FROM public.planning_runs WHERE plan_id=p_plan AND config_revision_id=p_revision AND status=''success'' AND execution_kind=''ASSISTED_SCOPE''
   AND assisted_result_json->>''outcome''=''PROPOSAL'' AND assisted_result_json->''proposedDraftSnapshot''=p_snapshot ORDER BY id DESC LIMIT 1;
  IF p_run IS NOT NULL AND r.id IS DISTINCT FROM p_run OR r.assisted_result_json#>>''{evidence,technicalChainCertificate,status}'' IS DISTINCT FROM ''WITNESS''
   OR r.assisted_result_json#>>''{evidence,technicalChainCertificate,contextOnly}'' IS DISTINCT FROM ''true''
  THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_FUTURE_CERTIFICATE_REQUIRED''; END IF;
  proof:=r.assisted_result_json#>''{evidence,nominalPhysicalFutureWitness,tasks}'';
  FOR row,phase_index IN SELECT x,phase.ordinality::integer FROM jsonb_array_elements(policy->''phases'') WITH ORDINALITY phase(value,ordinality)
   CROSS JOIN LATERAL jsonb_array_elements(phase.value) mid
   JOIN jsonb_array_elements(proof) x ON x->>''id''=''task:''||mid::text
   ORDER BY (x->>''start'')::integer,x->>''id''
  LOOP
   IF previous_end IS NOT NULL AND previous_end<>(row->>''start'')::integer THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_PHASE_GAP''; END IF;
   IF previous_phase IS NOT NULL AND phase_index<previous_phase THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_PHASE_ORDER''; END IF;
   IF NOT (row->''requiredResourceIds'') @> (SELECT jsonb_agg(''plan-resource:''||v) FROM jsonb_array_elements_text(policy->''requiredResourceIds'') v)
   THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_RESOURCE_NOT_REQUIRED''; END IF;
   previous_end:=(row->>''end'')::integer;previous_phase:=phase_index;
  END LOOP;
  IF previous_end IS NULL THEN RAISE EXCEPTION ''TECHNICAL_CHAIN_CERTIFICATE_INVALID''; END IF;
  RETURN;
 END IF;
 total:=');
 EXECUTE definition;
 -- Authenticate material source operations for phases even when there is no joint.
 definition:=pg_get_functiondef('public.assert_joint_revision(integer,jsonb)'::regprocedure);
 needle:=' IF groups IS NOT NULL THEN';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'PHASE_UNEXPECTED_REVISION_CONSUMER'; END IF;
 definition:=replace(definition,needle,' IF groups IS NOT NULL OR p.daily_technical_chains#>''{policies,0,phases}'' IS NOT NULL THEN');
 definition:=replace(definition,'  PERFORM public.assert_daily_joint_groups(p_plan,p.daily_joint_groups-ARRAY[''by'',''at'']);',
  '  IF groups IS NOT NULL THEN PERFORM public.assert_daily_joint_groups(p_plan,p.daily_joint_groups-ARRAY[''by'',''at'']); END IF;
  IF p.daily_technical_chains#>''{policies,0,phases}'' IS NOT NULL THEN PERFORM public.assert_daily_technical_chains(p_plan,p.daily_technical_chains-ARRAY[''by'',''at'']); END IF;');
 EXECUTE definition;
END $migration$;

-- A non-representative joint peer is also a protected member of the unit.
DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.apply_day_config_operation_before_anchored_accompaniments(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure);
 definition:=replace(definition,'component jsonb; work_fp text; all_fp text;','component jsonb; work_fp text; all_fp text; protected_ids jsonb;');
 needle:='  FOR changed IN SELECT value FROM jsonb_array_elements(coalesce(old_chains,''[]'')) UNION SELECT value FROM jsonb_array_elements(coalesce(new_chains,''[]'')) LOOP';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'PHASE_UNEXPECTED_PROTECTION_CONSUMER'; END IF;
 definition:=replace(definition,needle,needle||'
   protected_ids:=changed->''orderedTaskIds'';
   IF changed ? ''phases'' THEN
    SELECT coalesce(jsonb_agg(DISTINCT mid),''[]'') INTO protected_ids FROM (
     SELECT value mid FROM jsonb_array_elements(protected_ids)
     UNION SELECT mid FROM jsonb_array_elements(coalesce(p.daily_joint_groups->''groups'',''[]'')) g,
      LATERAL jsonb_array_elements(g->''taskIds'') mid
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(g->''taskIds'') peer WHERE changed->''orderedTaskIds'' @> jsonb_build_array(peer))
    ) members;
   END IF;');
 definition:=replace(definition,'jsonb_array_elements(changed->''orderedTaskIds'') m JOIN','jsonb_array_elements(protected_ids) m JOIN');
 definition:=replace(definition,'AND changed->''orderedTaskIds'' @> jsonb_build_array(t->''taskId'')','AND protected_ids @> jsonb_build_array(t->''taskId'')');
 EXECUTE definition;
END $migration$;
