-- Explicit daily operational availability. 001–120, including 088, stay literal.
ALTER TABLE public.plans ADD COLUMN daily_operational_meal_policies jsonb;
ALTER TABLE public.plans ADD CONSTRAINT operational_meal_single_authority CHECK (
 daily_operational_meal_policies IS NULL OR (planner_next_profile IS NOT NULL AND planner_next_configuration IS NULL));

CREATE FUNCTION public.assert_daily_operational_meals(p_plan integer,structure jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; policy jsonb; member jsonb; names text[]:='{}'; resources integer[]:='{}'; spaces integer[];
 start_min integer; end_min integer; duration integer;
BEGIN
 SELECT * INTO STRICT p FROM public.plans WHERE id=p_plan;
 IF jsonb_typeof(structure) IS DISTINCT FROM 'object' OR structure->'contractVersion' IS DISTINCT FROM '1'::jsonb
  OR structure-ARRAY['contractVersion','policies']<>'{}' OR jsonb_typeof(structure->'policies') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_INVALID_STRUCTURE'; END IF;
 IF nullif(p.planner_next_profile->'configuration','null') IS NULL OR p.planner_next_configuration IS NOT NULL THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_AUTHORITY_CONFLICT'; END IF;
 IF structure->'policies'='[]' THEN RETURN; END IF;
 IF p.planner_next_profile#>>'{configuration,setup}'<>'NONE' OR p.planner_next_profile#>>'{configuration,transport}'<>'NONE'
  OR coalesce(p.daily_round_synchronization->'policies','[]')<>'[]' OR coalesce(p.daily_technical_chains->'policies','[]')<>'[]'
  OR coalesce(p.daily_anchored_accompaniments->'policies','[]')<>'[]'
  OR public.effective_operation_continuity(p_plan,'[]')<>'[]'
 THEN RAISE EXCEPTION 'UNSUPPORTED_OPERATIONAL_MEAL_COMBINATION'; END IF;
 IF structure->'policies' IS DISTINCT FROM (SELECT jsonb_agg(value ORDER BY (value->>'id') COLLATE "C") FROM jsonb_array_elements(structure->'policies')) THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_NONCANONICAL'; END IF;
 FOR policy IN SELECT value FROM jsonb_array_elements(structure->'policies') LOOP
  IF policy-ARRAY['id','window','durationMinutes','planResourceItemIds','spaceIds']<>'{}'
   OR jsonb_typeof(policy->'id') IS DISTINCT FROM 'string' OR length(policy->>'id') NOT BETWEEN 1 AND 120
   OR policy->>'id'!~'^[A-Za-z0-9_.:-]+$' OR policy->>'id'=ANY(names)
   OR jsonb_typeof(policy->'window') IS DISTINCT FROM 'object' OR (policy->'window')-ARRAY['start','end']<>'{}'
   OR coalesce(policy#>>'{window,start}','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(policy#>>'{window,end}','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR jsonb_typeof(policy->'durationMinutes') IS DISTINCT FROM 'number' OR coalesce(policy->>'durationMinutes','')!~'^[1-9][0-9]*$'
   OR jsonb_typeof(policy->'planResourceItemIds') IS DISTINCT FROM 'array' OR jsonb_typeof(policy->'spaceIds') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_INVALID_STRUCTURE'; END IF;
  names:=array_append(names,policy->>'id');start_min:=public.hhmm_to_minutes(policy#>>'{window,start}');end_min:=public.hhmm_to_minutes(policy#>>'{window,end}');duration:=(policy->>'durationMinutes')::integer;
  IF start_min>=end_min OR duration>end_min-start_min OR duration%5<>0 OR start_min%5<>0 OR end_min%5<>0
   OR start_min<public.hhmm_to_minutes(p.work_start) OR end_min>public.hhmm_to_minutes(p.work_end)
   OR jsonb_array_length(policy->'planResourceItemIds')+jsonb_array_length(policy->'spaceIds')=0
  THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_INVALID_WINDOW'; END IF;
  IF policy->'planResourceItemIds' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(value ORDER BY value::text::integer),'[]') FROM jsonb_array_elements(policy->'planResourceItemIds'))
   OR policy->'spaceIds' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(value ORDER BY value::text::integer),'[]') FROM jsonb_array_elements(policy->'spaceIds')) THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_NONCANONICAL'; END IF;
  FOR member IN SELECT value FROM jsonb_array_elements(policy->'planResourceItemIds') LOOP
   IF jsonb_typeof(member) IS DISTINCT FROM 'number' OR member::text!~'^[1-9][0-9]*$' OR member::text::integer=ANY(resources)
    OR NOT EXISTS(SELECT 1 FROM public.plan_resource_items WHERE plan_id=p_plan AND id=member::text::integer)
   THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_INVALID_OR_DUPLICATE_RESOURCE'; END IF;
   resources:=array_append(resources,member::text::integer);
  END LOOP;
  spaces:='{}';
  FOR member IN SELECT value FROM jsonb_array_elements(policy->'spaceIds') LOOP
   IF jsonb_typeof(member) IS DISTINCT FROM 'number' OR member::text!~'^[1-9][0-9]*$' OR member::text::integer=ANY(spaces)
    OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings WHERE plan_id=p_plan AND space_id=member::text::integer)
   THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_INVALID_SPACE'; END IF;
   spaces:=array_append(spaces,member::text::integer);
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_daily_operational_meals(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_daily_operational_meals(integer,jsonb) TO service_role;

-- Extend the existing v5 writer in place: one CAS, source lock, fingerprint and
-- session transition implementation for both explicit daily authorities.
DO $migration$
DECLARE definition text; old_text text; new_text text;
BEGIN
 definition:=pg_get_functiondef('public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure);
 old_text:='structure_selected boolean;';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_UNEXPECTED_WRITER'; END IF;
 definition:=replace(definition,old_text,'structure_selected boolean; meal_selected boolean; capability_key text; authority_key text; transition_key text; version_key text; previous_authority jsonb;');
 definition:=replace(definition,'structure_selected:=p_operation=''EDIT'' AND p_payload ? ''jointGroups'';',
  'meal_selected:=p_operation=''EDIT'' AND p_payload ? ''operationalMealPolicies'';
  capability_key:=CASE WHEN meal_selected THEN ''operationalMealPolicies'' ELSE ''jointGroups'' END;
  authority_key:=CASE WHEN meal_selected THEN ''operationalMealPolicies'' ELSE ''dailyJointGroups'' END;
  transition_key:=CASE WHEN meal_selected THEN ''operationalMealTransition'' ELSE ''jointGroupTransition'' END;
  version_key:=CASE WHEN meal_selected THEN ''dailyOperationalMealsVersion'' ELSE ''dailyJointGroupsVersion'' END;
  previous_authority:=CASE WHEN meal_selected THEN p.daily_operational_meal_policies ELSE p.daily_joint_groups END;
  path:=ARRAY[''authorities'',''plan_workday'',''0'',''plannerNextAuthorities'',authority_key];
  structure_selected:=p_operation=''EDIT'' AND p_payload ? capability_key;');
 definition:=replace(definition,'p_diff ? ''jointGroupTransition''','(p_diff ? ''jointGroupTransition'' OR p_diff ? ''operationalMealTransition'')');
 definition:=replace(definition,'ARRAY[''jointGroups'',''expectedRevisionId'']','ARRAY[capability_key,''expectedRevisionId'']');
 definition:=replace(definition,'p_payload->''jointGroups''','p_payload->capability_key');
 definition:=replace(definition,'PERFORM public.assert_daily_joint_groups(p_plan_id,p_payload->capability_key);',
  'IF meal_selected THEN PERFORM public.assert_daily_operational_meals(p_plan_id,p_payload->capability_key); ELSE PERFORM public.assert_daily_joint_groups(p_plan_id,p_payload->capability_key); END IF;');
 definition:=replace(definition,'nullif(p.daily_joint_groups->''groups'',''[]'')','nullif(previous_authority->CASE WHEN meal_selected THEN ''policies'' ELSE ''groups'' END,''[]'')');
 definition:=replace(definition,'nullif(p_payload#>''{jointGroups,groups}'',''[]'')','nullif(p_payload->capability_key->CASE WHEN meal_selected THEN ''policies'' ELSE ''groups'' END,''[]'')');
 old_text:='IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.joint_member_ids(changed))';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_UNEXPECTED_PROTECTION'; END IF;
 definition:=replace(definition,old_text,'IF meal_selected THEN
    IF EXISTS(SELECT 1 FROM public.assisted_planning_stages st,LATERAL jsonb_array_elements(coalesce(st.snapshot_json->''operationalMeals'',''[]'')) m
      WHERE st.plan_id=p_plan_id AND m->>''policyId''=''break:''||(changed->>''id''))
     OR EXISTS(SELECT 1 FROM public.daily_tasks t WHERE t.plan_id=p_plan_id AND (t.start_planned IS NOT NULL OR t.status IN (''done'',''in_progress'')) AND
      (coalesce(changed->''spaceIds'',''[]'') @> jsonb_build_array(t.space_id) OR EXISTS(SELECT 1 FROM jsonb_array_elements(public.joint_task_resources(p_plan_id,t.id)) r WHERE changed->''planResourceItemIds'' @> jsonb_build_array(r))))
    THEN RAISE EXCEPTION ''OPERATIONAL_MEAL_PROTECTED_DECISIONS''; END IF;
   ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(public.joint_member_ids(changed))');
 old_text:='expected_candidate:=jsonb_set(expected_candidate,''{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}'',public.joint_task_operations(p_plan_id,p_expected_replay#>''{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}'',old_chains,new_chains));';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_UNEXPECTED_REPLAY'; END IF;
 definition:=replace(definition,old_text,'IF NOT meal_selected THEN '||old_text||' END IF;');
 definition:=replace(definition,'''dailyJointGroupsVersion'']','version_key]');
 old_text:='UPDATE public.plans SET daily_joint_groups=p_payload->capability_key||jsonb_build_object(''by'',p_actor,''at'',now()) WHERE id=p_plan_id;';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_UNEXPECTED_MUTATION'; END IF;
 definition:=replace(definition,old_text,'IF meal_selected THEN UPDATE public.plans SET daily_operational_meal_policies=p_payload->capability_key||jsonb_build_object(''by'',p_actor,''at'',now()) WHERE id=p_plan_id; ELSE '||old_text||' END IF;');
 definition:=replace(definition,'''jointGroupTransition'',jsonb_build_object','transition_key,jsonb_build_object');
 definition:=replace(definition,'''before'',p.daily_joint_groups','''before'',previous_authority');
 definition:=replace(definition,'''after'',(SELECT daily_joint_groups FROM public.plans WHERE id=p_plan_id)',
  '''after'',(SELECT CASE WHEN meal_selected THEN daily_operational_meal_policies ELSE daily_joint_groups END FROM public.plans WHERE id=p_plan_id)');
 definition:=replace(definition,'p_payload->capability_key||','(p_payload->capability_key)||');
 definition:=replace(definition,'p_payload-''jointGroups''-CASE','p_payload-capability_key-CASE');
 EXECUTE definition;
 -- The same source transition reader consumes the immutable revision diff.
 FOREACH old_text IN ARRAY ARRAY['public.assisted_expected_obligation_sources(bigint)','public.assisted_preview_s0_additions(integer)'] LOOP
  definition:=pg_get_functiondef(old_text::regprocedure);
  IF strpos(definition,'coalesce(r.diff_json#>>''{jointGroupTransition,sessionId}''')=0 THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_UNEXPECTED_TRANSITION_READER'; END IF;
  definition:=replace(definition,'coalesce(r.diff_json#>>''{jointGroupTransition,sessionId}''','coalesce(r.diff_json#>>''{operationalMealTransition,sessionId}'',r.diff_json#>>''{jointGroupTransition,sessionId}''');
  definition:=replace(definition,'coalesce(transition_record.diff_json#>''{jointGroupTransition,sources}''','coalesce(transition_record.diff_json#>''{operationalMealTransition,sources}'',transition_record.diff_json#>''{jointGroupTransition,sources}''');
  EXECUTE definition;
 END LOOP;
 definition:=pg_get_functiondef('public.assisted_read_bootstrap_sources(integer,boolean)'::regprocedure);
 old_text:='- CASE WHEN t.daily_joint_groups IS NULL THEN ''''daily_joint_groups'''' ELSE ''''__absent'''' END';
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_UNEXPECTED_SOURCE_READER'; END IF;
 EXECUTE replace(definition,old_text,old_text||' - CASE WHEN t.daily_operational_meal_policies IS NULL THEN ''''daily_operational_meal_policies'''' ELSE ''''__absent'''' END');
END $migration$;

-- Reuse the existing SQL physical witness consumer. Its name is historical;
-- this branch has an explicit daily authority and never adopts 088 implicitly.
DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_anchored_choice_witness(integer,jsonb,bigint)'::regprocedure);
 needle:='ELSE
  PERFORM public.assert_daily_anchored_accompaniments(p_plan,p.daily_anchored_accompaniments-ARRAY[''by'',''at'']);';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_UNEXPECTED_PHYSICAL_CONSUMER'; END IF;
 definition:=replace(definition,needle,'ELSIF coalesce(p.daily_anchored_accompaniments->''policies'',''[]'')<>''[]'' THEN
  PERFORM public.assert_daily_anchored_accompaniments(p_plan,p.daily_anchored_accompaniments-ARRAY[''by'',''at'']);');
 needle:='AND NOT(p.meal_mode=''global_hard_break'' AND previous_end=public.hhmm_to_minutes(p.meal_start) AND (x->>''start'')::integer=public.hhmm_to_minutes(p.meal_end)))';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_UNEXPECTED_MAIN_CONTINUITY'; END IF;
 definition:=replace(definition,needle,'AND NOT((p.meal_mode=''global_hard_break'' AND previous_end=public.hhmm_to_minutes(p.meal_start) AND (x->>''start'')::integer=public.hhmm_to_minutes(p.meal_end))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(r.assisted_result_json#>''{evidence,nominalPhysicalFutureWitness,operationalMeals}'',''[]'')) m
    JOIN jsonb_array_elements(coalesce(p.daily_operational_meal_policies->''policies'',''[]'')) declared_policy ON m->>''id''=''break:''||(declared_policy->>''id'')
    WHERE declared_policy->''spaceIds'' @> jsonb_build_array((main_flow->>''spaceId'')::integer)
     AND (m->>''start'')::integer=previous_end AND (m->>''end'')::integer=(x->>''start'')::integer
     AND (m->>''end'')::integer-(m->>''start'')::integer=(declared_policy->>''durationMinutes'')::integer)))');
 EXECUTE definition;
END $migration$;

CREATE FUNCTION public.assert_operational_meal_snapshot(p_plan integer,snapshot jsonb,revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; r public.planning_runs%rowtype; authority jsonb; policies jsonb; policy jsonb; meals jsonb; meal jsonb; other jsonb; row jsonb; proof jsonb;
 start_min integer; end_min integer; physical jsonb; closed boolean;
BEGIN
 SELECT * INTO STRICT p FROM public.plans WHERE id=p_plan;
 IF coalesce(p.daily_operational_meal_policies->'policies','[]')='[]' THEN RETURN; END IF;
 PERFORM public.assert_daily_operational_meals(p_plan,p.daily_operational_meal_policies-ARRAY['by','at']);
 SELECT replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities}' INTO authority FROM public.plan_config_revisions WHERE plan_id=p_plan AND id=revision;
 policies:=p.daily_operational_meal_policies->'policies';
 IF p.current_config_revision_id IS DISTINCT FROM revision OR authority->'operationalMealPolicies' IS DISTINCT FROM policies OR authority->'dailyOperationalMealsVersion' IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_STALE_REPLAY'; END IF;
 PERFORM public.assert_anchored_choice_witness(p_plan,snapshot,revision);
 SELECT * INTO r FROM public.planning_runs WHERE plan_id=p_plan AND config_revision_id=revision AND status='success' AND execution_kind='ASSISTED_SCOPE'
  AND assisted_result_json->>'outcome'='PROPOSAL' AND assisted_result_json->'proposedDraftSnapshot'=snapshot ORDER BY id DESC LIMIT 1;
 proof:=r.assisted_result_json#>'{evidence,nominalPhysicalFutureWitness,tasks}';
 meals:=r.assisted_result_json#>'{evidence,nominalPhysicalFutureWitness,operationalMeals}';
 IF jsonb_typeof(meals) IS DISTINCT FROM 'array' OR jsonb_array_length(meals)<>jsonb_array_length(policies)
  OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(meals))<>jsonb_array_length(meals)
 THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_GLOBAL_WITNESS_REQUIRED'; END IF;
 FOR policy IN SELECT value FROM jsonb_array_elements(policies) LOOP
  SELECT value INTO meal FROM jsonb_array_elements(meals) WHERE value->>'id'='break:'||(policy->>'id');
  start_min:=(meal->>'start')::integer;end_min:=(meal->>'end')::integer;
  IF meal IS NULL OR start_min IS NULL OR end_min IS NULL OR start_min%5<>0 OR end_min%5<>0 OR end_min-start_min IS DISTINCT FROM (policy->>'durationMinutes')::integer
   OR meal->'duration' IS DISTINCT FROM policy->'durationMinutes' OR start_min<public.hhmm_to_minutes(policy#>>'{window,start}') OR end_min>public.hhmm_to_minutes(policy#>>'{window,end}')
   OR (SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM jsonb_array_elements_text(meal->'resourceIds')) IS DISTINCT FROM (SELECT coalesce(jsonb_agg('plan-resource:'||value ORDER BY 'plan-resource:'||value),'[]') FROM jsonb_array_elements_text(policy->'planResourceItemIds'))
   OR (SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM jsonb_array_elements_text(meal->'spaceIds')) IS DISTINCT FROM (SELECT coalesce(jsonb_agg('space:'||value ORDER BY 'space:'||value),'[]') FROM jsonb_array_elements_text(policy->'spaceIds'))
  THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_MATERIAL_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM public.plan_resource_items x WHERE x.plan_id=p_plan AND policy->'planResourceItemIds' @> jsonb_build_array(x.id)
   AND (NOT x.is_available OR start_min<public.hhmm_to_minutes(coalesce(x.availability_start,p.work_start)) OR end_min>public.hhmm_to_minutes(coalesce(x.availability_end,p.work_end))))
   OR EXISTS(SELECT 1 FROM public.plan_space_settings x JOIN public.plan_zone_settings z ON z.plan_id=x.plan_id AND z.zone_id=x.zone_id WHERE x.plan_id=p_plan AND policy->'spaceIds' @> jsonb_build_array(x.space_id)
    AND (start_min<greatest(public.hhmm_to_minutes(coalesce(x.availability_start,p.work_start)),public.hhmm_to_minutes(coalesce(z.availability_start,p.work_start))) OR end_min>least(public.hhmm_to_minutes(coalesce(x.availability_end,p.work_end)),public.hhmm_to_minutes(coalesce(z.availability_end,p.work_end)))))
  THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_OUTSIDE_AVAILABILITY'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(proof) x WHERE (x->>'start')::integer<end_min AND (x->>'end')::integer>start_min
   AND ((coalesce(x->>'blocksSpace','true')='true' AND meal->'spaceIds' @> jsonb_build_array(x->'spaceId')) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(x->'requiredResourceIds','[]')||CASE WHEN x->>'coachId' IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(x->>'coachId') END) rid WHERE meal->'resourceIds' @> jsonb_build_array(rid))))
  THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_PHYSICAL_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(meals) x WHERE x->>'id'<>meal->>'id' AND (x->>'start')::integer<end_min AND (x->>'end')::integer>start_min
    AND (EXISTS(SELECT 1 FROM jsonb_array_elements(meal->'spaceIds') mid WHERE x->'spaceIds' @> jsonb_build_array(mid)) OR EXISTS(SELECT 1 FROM jsonb_array_elements(meal->'resourceIds') mid WHERE x->'resourceIds' @> jsonb_build_array(mid))))
  THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_DUPLICATE_OCCUPATION'; END IF;
  SELECT value INTO row FROM jsonb_array_elements(coalesce(snapshot->'operationalMeals','[]')) WHERE value->>'policyId'=meal->>'id';
  SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(proof) x JOIN jsonb_array_elements(snapshot->'tasks') t ON 'task:'||(t->>'taskId')=x->>'id'
   WHERE t->>'startPlanned' IS NULL AND ((coalesce(x->>'blocksSpace','true')='true' AND meal->'spaceIds' @> jsonb_build_array(x->'spaceId')) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(x->'requiredResourceIds','[]')||CASE WHEN x->>'coachId' IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(x->>'coachId') END) rid WHERE meal->'resourceIds' @> jsonb_build_array(rid)))) INTO closed;
  IF closed AND row IS NULL OR row IS NOT NULL AND (public.hhmm_to_minutes(row->>'startPlanned') IS DISTINCT FROM start_min OR public.hhmm_to_minutes(row->>'endPlanned') IS DISTINCT FROM end_min)
  THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_SNAPSHOT_MISMATCH'; END IF;
  IF EXISTS(SELECT 1 FROM public.assisted_planning_sessions s,LATERAL jsonb_array_elements(coalesce(s.working_snapshot_json->'operationalMeals','[]')) m WHERE s.plan_id=p_plan AND s.status='ACTIVE' AND m->>'policyId'=meal->>'id' AND m IS DISTINCT FROM row)
  THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_PROTECTED_DECISIONS'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(snapshot->'operationalMeals','[]')) m WHERE (SELECT count(*) FROM jsonb_array_elements(policies) declared_policy(value) WHERE 'break:'||(declared_policy.value->>'id')=m->>'policyId')<>1)
  OR (SELECT count(DISTINCT value->>'policyId') FROM jsonb_array_elements(coalesce(snapshot->'operationalMeals','[]')))<>jsonb_array_length(coalesce(snapshot->'operationalMeals','[]'))
 THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_SNAPSHOT_IDENTITY'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_operational_meal_snapshot(integer,jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_operational_meal_snapshot(integer,jsonb,bigint) TO service_role;

-- One guard, shared by authority, revision and the two Stage certificate gates.
CREATE FUNCTION public.guard_daily_operational_meals() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; authority jsonb; policies jsonb; snapshot jsonb; s public.assisted_planning_sessions%rowtype;
BEGIN
 IF TG_TABLE_NAME='daily_tasks' THEN
  SELECT * INTO STRICT p FROM public.plans WHERE id=OLD.plan_id;
  IF coalesce(p.daily_operational_meal_policies->'policies','[]')='[]' THEN
   IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
  END IF;
  IF OLD.start_planned IS NOT NULL OR EXISTS(SELECT 1 FROM public.assisted_planning_stages st,LATERAL jsonb_array_elements(st.snapshot_json->'tasks') t WHERE st.plan_id=OLD.plan_id AND t->'taskId'=to_jsonb(OLD.id) AND t->>'startPlanned' IS NOT NULL) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_PROTECTED_SOURCE'; END IF;
   IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.contestant_id IS DISTINCT FROM OLD.contestant_id OR NEW.space_id IS DISTINCT FROM OLD.space_id OR NEW.duration_override IS DISTINCT FROM OLD.duration_override OR NEW.status='cancelled'
   THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_PROTECTED_SOURCE'; END IF;
   IF (NEW.start_planned IS DISTINCT FROM OLD.start_planned OR NEW.end_planned IS DISTINCT FROM OLD.end_planned OR NEW.assigned_resource_ids IS DISTINCT FROM OLD.assigned_resource_ids)
    AND current_setting('optiplan.anchored_task_materialization',true) IS DISTINCT FROM txid_current()::text THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_REQUIRES_ASSISTED_MATERIALIZATION'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
 END IF;
 IF TG_TABLE_NAME='plans' THEN
  IF (TG_OP='INSERT' AND NEW.daily_operational_meal_policies IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.daily_operational_meal_policies IS DISTINCT FROM OLD.daily_operational_meal_policies) THEN
   IF current_user<>'service_role' OR current_setting('optiplan.daily_joint_group_operation',true) IS DISTINCT FROM 'versioned' THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_REQUIRES_VERSIONED_OPERATION'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO STRICT p FROM public.plans WHERE id=NEW.plan_id;
 IF TG_TABLE_NAME='plan_config_revisions' THEN
  IF p.daily_operational_meal_policies IS NULL THEN RETURN NEW; END IF;
  PERFORM public.assert_daily_operational_meals(NEW.plan_id,p.daily_operational_meal_policies-ARRAY['by','at']);
  policies:=nullif(p.daily_operational_meal_policies->'policies','[]');authority:=NEW.replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities}';
  IF authority->'operationalMealPolicies' IS DISTINCT FROM policies OR authority->'dailyOperationalMealsVersion' IS DISTINCT FROM (CASE WHEN policies IS NULL THEN NULL ELSE '1'::jsonb END)
  THEN RAISE EXCEPTION 'OPERATIONAL_MEAL_REVISION_NOT_MATERIALIZED'; END IF;
  RETURN NEW;
 END IF;
 IF coalesce(p.daily_operational_meal_policies->'policies','[]')='[]' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='planning_stage_validations' THEN
  SELECT * INTO STRICT s FROM public.assisted_planning_sessions WHERE id=NEW.session_id AND plan_id=NEW.plan_id;snapshot:=s.draft_snapshot_json;
 ELSIF NEW.ordinal>0 THEN snapshot:=NEW.snapshot_json;ELSE RETURN NEW;END IF;
 PERFORM public.assert_operational_meal_snapshot(NEW.plan_id,snapshot,NEW.config_revision_id);
 RETURN NEW;
END $$;
CREATE TRIGGER operational_meal_authority BEFORE INSERT OR UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.guard_daily_operational_meals();
CREATE TRIGGER operational_meal_revision BEFORE INSERT ON public.plan_config_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_daily_operational_meals();
CREATE TRIGGER operational_meal_validation BEFORE INSERT ON public.planning_stage_validations FOR EACH ROW EXECUTE FUNCTION public.guard_daily_operational_meals();
CREATE TRIGGER operational_meal_stage BEFORE INSERT ON public.assisted_planning_stages FOR EACH ROW EXECUTE FUNCTION public.guard_daily_operational_meals();
CREATE TRIGGER operational_meal_source BEFORE UPDATE OR DELETE ON public.daily_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_daily_operational_meals();
REVOKE ALL ON FUNCTION public.guard_daily_operational_meals() FROM PUBLIC,anon,authenticated,service_role;
