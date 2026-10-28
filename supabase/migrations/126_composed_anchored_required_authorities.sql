-- P0-U02d: disjoint native anchors/scopes with fixed REQUIRED phases, joints and pauses.
-- Incremental body edits retain owners, invoker security, search_path and private ACLs.
-- Historical rows, Stages, writers and materializers remain authoritative.
DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_anchored_accompaniments_v1(integer,jsonb)'::regprocedure);
 needle:='coalesce(daily_technical_chains->''policies'',''[]'')=''[]''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'(coalesce(daily_technical_chains->''policies'',''[]'')=''[]'' OR daily_technical_chains#>''{policies,0,phases}'' IS NOT NULL)');
 needle:='FOR policy IN SELECT value FROM jsonb_array_elements(p_structure->''policies'') LOOP';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'FOR policy IN SELECT value FROM jsonb_array_elements(p_structure->''policies'') LOOP
  IF EXISTS(SELECT 1 FROM public.plans authority_day WHERE authority_day.id=p_plan AND (coalesce(authority_day.daily_technical_chains->''policies'',''[]'')<>''[]'' OR coalesce(authority_day.daily_joint_groups->''groups'',''[]'')<>''[]'' OR coalesce(authority_day.daily_operational_meal_policies->''policies'',''[]'')<>''[]'')) AND NOT EXISTS(SELECT 1 FROM public.plan_itinerant_unit_snapshots u WHERE u.plan_id=p_plan AND u.id=(policy->>''itinerantUnitId'')::integer AND u.transition_minutes=0) THEN RAISE EXCEPTION ''UNSUPPORTED_ANCHORED_COMBINATION''; END IF;
  IF EXISTS(SELECT 1 FROM public.plans authority_day,LATERAL jsonb_array_elements(coalesce(authority_day.daily_technical_chains->''policies'',''[]'')) c,LATERAL jsonb_array_elements(c->''orderedTaskIds'') mid WHERE authority_day.id=p_plan AND public.anchored_member_ids(policy) @> jsonb_build_array(mid))
   OR EXISTS(SELECT 1 FROM public.plans authority_day,LATERAL jsonb_array_elements(coalesce(authority_day.daily_joint_groups->''groups'',''[]'')) g,LATERAL jsonb_array_elements(g->''taskIds'') mid WHERE authority_day.id=p_plan AND public.anchored_member_ids(policy) @> jsonb_build_array(mid))
  THEN RAISE EXCEPTION ''REALITY_AUTHORITY_TASK_OVERLAP''; END IF;');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_anchored_accompaniments(integer,jsonb)'::regprocedure);
 needle:='IF policy ? ''itinerantUnitId'' THEN';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'IF EXISTS(SELECT 1 FROM public.plans authority_day WHERE authority_day.id=p_plan AND (coalesce(authority_day.daily_technical_chains->''policies'',''[]'')<>''[]'' OR coalesce(authority_day.daily_joint_groups->''groups'',''[]'')<>''[]'' OR coalesce(authority_day.daily_operational_meal_policies->''policies'',''[]'')<>''[]'')) AND NOT policy ? ''itinerantUnitId'' THEN RAISE EXCEPTION ''UNSUPPORTED_ANCHORED_COMBINATION''; END IF;
  IF policy ? ''itinerantUnitId'' THEN');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_task_operation_scopes(integer,jsonb)'::regprocedure);
 needle:='coalesce(daily_technical_chains->''policies'',''[]'')=''[]''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'(coalesce(daily_technical_chains->''policies'',''[]'')=''[]'' OR daily_technical_chains#>''{policies,0,phases}'' IS NOT NULL)');
 needle:='seen:=array_append(seen,(policy->>''taskId'')::integer);';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'seen:=array_append(seen,(policy->>''taskId'')::integer);
  IF EXISTS(SELECT 1 FROM public.plans authority_day,LATERAL jsonb_array_elements(coalesce(authority_day.daily_technical_chains->''policies'',''[]'')) c WHERE authority_day.id=p_plan AND c->''orderedTaskIds'' @> jsonb_build_array(policy->''taskId''))
   OR EXISTS(SELECT 1 FROM public.plans authority_day,LATERAL jsonb_array_elements(coalesce(authority_day.daily_joint_groups->''groups'',''[]'')) g WHERE authority_day.id=p_plan AND g->''taskIds'' @> jsonb_build_array(policy->''taskId''))
  THEN RAISE EXCEPTION ''REALITY_AUTHORITY_TASK_OVERLAP''; END IF;');
 needle:='IF NOT FOUND OR jsonb_array_length(unit.members)=0 OR EXISTS';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'IF NOT FOUND OR (EXISTS(SELECT 1 FROM public.plans authority_day WHERE authority_day.id=p_plan AND (coalesce(authority_day.daily_technical_chains->''policies'',''[]'')<>''[]'' OR coalesce(authority_day.daily_joint_groups->''groups'',''[]'')<>''[]'' OR coalesce(authority_day.daily_operational_meal_policies->''policies'',''[]'')<>''[]'')) AND unit.transition_minutes IS DISTINCT FROM 0) OR jsonb_array_length(unit.members)=0 OR EXISTS');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_technical_chains(integer,jsonb)'::regprocedure);
 needle:='OR coalesce(p.daily_anchored_accompaniments->''policies'',''[]'')<>''[]'' OR coalesce(p.daily_task_operation_scopes->''policies'',''[]'')<>''[]''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'');
 needle:='SELECT * INTO t FROM public.daily_tasks WHERE plan_id=p_plan AND id=member::text::integer;';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'IF EXISTS(SELECT 1 FROM public.plans authority_day, LATERAL jsonb_array_elements(coalesce(authority_day.daily_anchored_accompaniments->''policies'',''[]'')) a WHERE authority_day.id=p_plan AND public.anchored_member_ids(a) @> jsonb_build_array(member)) OR EXISTS(SELECT 1 FROM public.plans authority_day,LATERAL jsonb_array_elements(coalesce(authority_day.daily_task_operation_scopes->''policies'',''[]'')) s WHERE authority_day.id=p_plan AND s->''taskId''=member) THEN RAISE EXCEPTION ''REALITY_AUTHORITY_TASK_OVERLAP''; END IF;
   SELECT * INTO t FROM public.daily_tasks WHERE plan_id=p_plan AND id=member::text::integer;');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_joint_groups(integer,jsonb)'::regprocedure);
 needle:='OR coalesce(p.daily_anchored_accompaniments->''policies'',''[]'')<>''[]''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'');
 needle:='OR coalesce(p.daily_task_operation_scopes->''policies'',''[]'')<>''[]''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'');
 needle:='seen:=array_append(seen,mid::text::integer);';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'seen:=array_append(seen,mid::text::integer);
   IF EXISTS(SELECT 1 FROM public.plans authority_day, LATERAL jsonb_array_elements(coalesce(authority_day.daily_anchored_accompaniments->''policies'',''[]'')) a WHERE authority_day.id=p_plan AND public.anchored_member_ids(a) @> jsonb_build_array(mid)) OR EXISTS(SELECT 1 FROM public.plans authority_day,LATERAL jsonb_array_elements(coalesce(authority_day.daily_task_operation_scopes->''policies'',''[]'')) s WHERE authority_day.id=p_plan AND s->''taskId''=mid) THEN RAISE EXCEPTION ''REALITY_AUTHORITY_TASK_OVERLAP''; END IF;');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_daily_operational_meals(integer,jsonb)'::regprocedure);
 needle:='OR coalesce(p.daily_anchored_accompaniments->''policies'',''[]'')<>''[]''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_task_scope_snapshot(integer,jsonb,bigint)'::regprocedure);
 needle:='PERFORM public.assert_task_scope_revision(p_plan,replay);';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'PERFORM public.assert_task_scope_revision(p_plan,replay);
 IF coalesce(p.daily_joint_groups->''groups'',''[]'')<>''[]'' THEN PERFORM public.assert_joint_revision(p_plan,replay); END IF;');
 needle:='gap:=(other->>''start'')::integer-(actual->>''end'')::integer;';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'-- Only authentic peers may share this occupation. Every peer still competes with every third task.
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.daily_joint_groups->''groups'',''[]'')) g WHERE g->''taskIds'' @> jsonb_build_array(actual->''task'',other->''task'')) THEN
    IF actual->''start'' IS DISTINCT FROM other->''start'' OR actual->''end'' IS DISTINCT FROM other->''end''
     OR actual->''space'' IS DISTINCT FROM other->''space'' OR actual->''resources'' IS DISTINCT FROM other->''resources''
     OR actual->''unit'' IS DISTINCT FROM other->''unit'' OR actual->''blocks''<>''true'' OR other->''blocks''<>''true''
     OR actual->''participant''=other->''participant''
    THEN RAISE EXCEPTION ''JOINT_SYNCHRONIZATION''; END IF;
    CONTINUE;
   END IF;
   gap:=(other->>''start'')::integer-(actual->>''end'')::integer;');
 EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_anchored_choice_witness(integer,jsonb,bigint)'::regprocedure);
 needle:='ELSIF coalesce(p.daily_anchored_accompaniments->''policies'',''[]'')<>''[]'' THEN';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'END IF;
 IF coalesce(p.daily_anchored_accompaniments->''policies'',''[]'')<>''[]'' THEN');
 needle:='operations:=replay->''taskOperations'';';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'IF coalesce(p.daily_task_operation_scopes->''policies'',''[]'')<>''[]'' THEN
  PERFORM public.assert_task_scope_revision(p_plan,(SELECT replay_snapshot_json FROM public.plan_config_revisions WHERE id=p_revision AND plan_id=p_plan));
 END IF;
 operations:=replay->''taskOperations'';');
 needle:='WHERE coalesce(p.daily_joint_groups->''groups'',''[]'')<>''[]''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'WHERE coalesce(p.daily_joint_groups->''groups'',''[]'')<>''[]'' AND NOT op ? ''declaredResourceIds''');
 needle:='x->''requiredResourceIds'' IS DISTINCT FROM certified->''requiredResourceIds''';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'COMPOSED_AUTHORITIES_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'x->''requiredResourceIds'' IS DISTINCT FROM certified->''requiredResourceIds'' OR x->''itinerantUnitId'' IS DISTINCT FROM certified->''itinerantUnitId''');
 EXECUTE definition;
END $migration$;
