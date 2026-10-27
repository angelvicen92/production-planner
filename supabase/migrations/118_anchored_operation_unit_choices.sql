-- P0-U00w: explicit v2 adoption. Historical 001–117 and v1 authorities stay literal.
ALTER FUNCTION public.assert_daily_anchored_accompaniments(integer,jsonb) RENAME TO assert_daily_anchored_accompaniments_v1;
CREATE FUNCTION public.assert_daily_anchored_accompaniments(p_plan integer,p_structure jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE policy jsonb; domain jsonb; uid jsonb; seen jsonb:='[]'; identities jsonb:='[]';
BEGIN
 IF p_structure->'contractVersion'='1' THEN PERFORM public.assert_daily_anchored_accompaniments_v1(p_plan,p_structure); RETURN; END IF;
 IF jsonb_typeof(p_structure) IS DISTINCT FROM 'object' OR p_structure->'contractVersion' IS DISTINCT FROM '2'::jsonb
  OR p_structure-ARRAY['contractVersion','policies']<>'{}' OR jsonb_typeof(p_structure->'policies') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'ANCHORED_INVALID_STRUCTURE'; END IF;
 PERFORM public.assert_daily_anchored_accompaniments_v1(p_plan,'{"contractVersion":1,"policies":[]}');
 FOR policy IN SELECT value FROM jsonb_array_elements(p_structure->'policies') LOOP
  IF identities @> jsonb_build_array(policy->'id') OR EXISTS(SELECT 1 FROM jsonb_array_elements(public.anchored_member_ids(policy)) m WHERE seen @> jsonb_build_array(m))
  THEN RAISE EXCEPTION 'ANCHORED_DUPLICATE_MEMBER_OR_OPERATION'; END IF;
  identities:=identities||jsonb_build_array(policy->'id');seen:=seen||public.anchored_member_ids(policy);
  IF policy ? 'itinerantUnitId' THEN
   IF policy ? 'eligibleItinerantUnitIds' THEN RAISE EXCEPTION 'ANCHORED_AMBIGUOUS_UNIT_AUTHORITY'; END IF;
   domain:=jsonb_build_array(policy->'itinerantUnitId');
  ELSE
   domain:=policy->'eligibleItinerantUnitIds';
   IF jsonb_typeof(domain) IS DISTINCT FROM 'array' OR jsonb_array_length(domain)=0
    OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(domain))<>jsonb_array_length(domain)
   THEN RAISE EXCEPTION 'ANCHORED_INVALID_UNIT_DOMAIN'; END IF;
  END IF;
  FOR uid IN SELECT value FROM jsonb_array_elements(domain) LOOP
   PERFORM public.assert_daily_anchored_accompaniments_v1(p_plan,jsonb_build_object('contractVersion',1,'policies',jsonb_build_array(
    (policy-'eligibleItinerantUnitIds')||jsonb_build_object('itinerantUnitId',uid))));
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_daily_anchored_accompaniments_v1(integer,jsonb),public.assert_daily_anchored_accompaniments(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_daily_anchored_accompaniments_v1(integer,jsonb),public.assert_daily_anchored_accompaniments(integer,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.anchored_contracts(policies jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT nullif(coalesce(jsonb_agg(value-ARRAY['itinerantUnitId','eligibleItinerantUnitIds'] ORDER BY ordinality),'[]'),'[]')
 FROM jsonb_array_elements(coalesce(policies,'[]')) WITH ORDINALITY
$$;

CREATE OR REPLACE FUNCTION public.anchored_task_operations(p_plan integer,operations jsonb,old_policies jsonb,new_policies jsonb,capture_direct boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE op jsonb; result jsonb:='[]'; policy jsonb; tpl public.plan_task_template_snapshots%rowtype; unit_id integer; allowed jsonb; direct_ids jsonb; dependencies jsonb;
BEGIN
 FOR op IN SELECT value FROM jsonb_array_elements(operations) LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(old_policies,'[]')) p WHERE public.anchored_member_ids(p) @> jsonb_build_array(op->'taskId')) THEN
   SELECT s.* INTO STRICT tpl FROM public.daily_tasks d JOIN public.plan_task_template_snapshots s ON s.plan_id=d.plan_id AND s.source_template_id=d.template_id WHERE d.plan_id=p_plan AND d.id=(op->>'taskId')::integer;
   SELECT id INTO unit_id FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND source_team_id=tpl.itinerant_team_id;
   SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO allowed FROM public.plan_itinerant_unit_snapshots
    WHERE plan_id=p_plan AND tpl.allowed_itinerant_team_ids @> jsonb_build_array(source_team_id);
   op:=(op-ARRAY['blocksSpace','agendaScope','resourceInheritance','itinerantTeamId','itinerantTeamRequirement','allowedItinerantTeamIds','declaredResourceIds'])
    ||jsonb_build_object('itinerantTeamId',unit_id,'itinerantTeamRequirement',tpl.itinerant_team_requirement,'allowedItinerantTeamIds',allowed);
   SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO direct_ids FROM (
    SELECT c.vocal_coach_plan_resource_item_id id FROM public.contestants c JOIN public.daily_tasks d ON d.contestant_id=c.id WHERE d.plan_id=p_plan AND d.id=(op->>'taskId')::integer AND tpl.requires_coach AND c.vocal_coach_plan_resource_item_id IS NOT NULL
    UNION SELECT r.id FROM public.plan_resource_items r WHERE r.plan_id=p_plan AND tpl.itinerant_team_requirement<>'none' AND tpl.resource_requirements#>ARRAY['byItem',r.resource_item_id::text]='1'
   ) direct;
   IF direct_ids<>'[]' THEN op:=op||jsonb_build_object('declaredResourceIds',direct_ids); END IF;

  END IF;
  SELECT p INTO policy FROM jsonb_array_elements(coalesce(new_policies,'[]')) p WHERE public.anchored_member_ids(p) @> jsonb_build_array(op->'taskId');
  IF FOUND THEN
   SELECT coalesce(jsonb_agg(d.id ORDER BY dep.ordinality,d.id),'[]') INTO dependencies
    FROM public.daily_tasks own_task JOIN public.plan_task_template_snapshots own_template ON own_template.plan_id=own_task.plan_id AND own_template.source_template_id=own_task.template_id,
    LATERAL jsonb_array_elements(own_template.dependency_template_ids) WITH ORDINALITY dep(value,ordinality),public.daily_tasks d
    WHERE own_task.plan_id=p_plan AND own_task.id=(op->>'taskId')::integer AND d.plan_id=p_plan
     AND d.contestant_id=own_task.contestant_id AND d.template_id=dep.value::text::integer AND d.status<>'cancelled';
   op:=(op-ARRAY['jointGroupId','setupFamilyId','breakKind','mealOccupiesSpace'])||jsonb_build_object(
    'plannerNextKind',CASE WHEN op->'taskId'=policy->'anchorTaskId' THEN 'main' ELSE 'auxiliary' END,
    'operationalRole','productive_task','dependsOnTaskIds',dependencies);
   IF capture_direct THEN
    SELECT coalesce(jsonb_agg(value ORDER BY value::text::integer),'[]') INTO direct_ids FROM (
     SELECT value FROM jsonb_array_elements(coalesce(op->'declaredResourceIds','[]'))
     UNION SELECT value FROM public.daily_tasks d,LATERAL jsonb_array_elements(coalesce(nullif(to_jsonb(d)->'assigned_resource_ids','null'),'[]')) WHERE d.plan_id=p_plan AND d.id=(op->>'taskId')::integer
    ) direct;
    op:=op||jsonb_build_object('declaredResourceIds',direct_ids);
   ELSE op:=op||jsonb_build_object('declaredResourceIds',coalesce(op->'declaredResourceIds','[]')); END IF;
   op:=op||jsonb_build_object('itinerantTeamId',coalesce(policy->'itinerantUnitId','null'),'itinerantTeamRequirement',CASE WHEN policy ? 'eligibleItinerantUnitIds' THEN 'any' ELSE 'specific' END,'allowedItinerantTeamIds',coalesce(policy->'eligibleItinerantUnitIds',jsonb_build_array(policy->'itinerantUnitId')),
    'agendaScope',CASE WHEN op->'taskId'=policy->'anchorTaskId' THEN 'PHYSICAL_SPACE' ELSE 'ITINERANT_UNIT' END,
    'resourceInheritance',CASE WHEN op->'taskId'=policy->'anchorTaskId' THEN 'LOCATION' ELSE 'OPERATION_ONLY' END);
   IF op->'taskId'<>policy->'anchorTaskId' THEN op:=op||'{"blocksSpace":false}'; ELSE op:=op-'blocksSpace'; END IF;
  END IF;
  result:=result||jsonb_build_array(op);
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.anchored_task_operations(integer,jsonb,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.anchored_task_operations(integer,jsonb,jsonb,jsonb,boolean) TO service_role;


CREATE FUNCTION public.assert_anchored_selected_snapshot(p_plan integer,p_snapshot jsonb,p_revision bigint,p_policy jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; policy jsonb; member jsonb; actual jsonb; other jsonb; unit public.plan_itinerant_unit_snapshots%rowtype;
 task_row public.daily_tasks%rowtype; tpl public.plan_task_template_snapshots%rowtype; resource public.plan_resource_items%rowtype;
 start_min integer; end_min integer; previous_end integer; operation_start integer; operation_end integer; members jsonb; rid jsonb; placed_count integer;
 anchor_start integer; anchor_end integer; anchor_space integer; participant integer; selected_unit public.plan_itinerant_unit_snapshots%rowtype; selected_members jsonb; same_unit boolean;
BEGIN
 SELECT * INTO p FROM public.plans WHERE id=p_plan;
 IF p.daily_anchored_accompaniments IS NULL OR p.daily_anchored_accompaniments->'policies'='[]' THEN RETURN; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_revision OR (SELECT replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities,anchoredAccompaniments}' FROM public.plan_config_revisions WHERE id=p_revision AND plan_id=p_plan)
  IS DISTINCT FROM public.anchored_contracts(p.daily_anchored_accompaniments->'policies') THEN RAISE EXCEPTION 'STALE_ANCHORED_REPLAY'; END IF;
 PERFORM public.assert_daily_anchored_accompaniments(p_plan,p.daily_anchored_accompaniments-ARRAY['by','at']);
 policy:=p_policy;
 SELECT * INTO STRICT unit FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND id=(policy->>'itinerantUnitId')::bigint;
 SELECT jsonb_agg(value->'planResourceItemId' ORDER BY (value->>'planResourceItemId')::integer) INTO members FROM jsonb_array_elements(unit.members);
 SELECT count(*) INTO placed_count FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE public.anchored_member_ids(policy) @> jsonb_build_array(t->'taskId') AND t->>'startPlanned' IS NOT NULL;
 -- This bounded native contract admits the anchored unit before other scopes.
 -- Never silently certify a detached future operation using individual task spots.
 IF placed_count=0 THEN RAISE EXCEPTION 'ANCHORED_FUTURE_STRUCTURAL_WITNESS_REQUIRED'; END IF;
 IF placed_count<>3 THEN RAISE EXCEPTION 'ANCHORED_INCOMPLETE_OPERATION'; END IF;
 FOR member IN SELECT value FROM jsonb_array_elements(public.anchored_member_ids(policy)) LOOP
  IF (SELECT count(*) FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE t->'taskId'=member)<>1 THEN RAISE EXCEPTION 'ANCHORED_CERTIFICATE_INVALID'; END IF;
  SELECT value INTO actual FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE t->'taskId'=member;
  SELECT * INTO STRICT task_row FROM public.daily_tasks WHERE plan_id=p_plan AND id=member::text::integer;
  SELECT * INTO STRICT tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=task_row.template_id;
  start_min:=public.hhmm_to_minutes(actual->>'startPlanned');end_min:=public.hhmm_to_minutes(actual->>'endPlanned');
  IF start_min IS NULL OR end_min IS NULL OR start_min%5<>0 OR end_min-start_min IS DISTINCT FROM coalesce(task_row.duration_override,tpl.default_duration)
   OR (previous_end IS NOT NULL AND previous_end<>start_min) OR actual->'spaceId' IS DISTINCT FROM to_jsonb(task_row.space_id)
   OR actual->'itinerantTeamId' IS DISTINCT FROM policy->'itinerantUnitId' OR jsonb_typeof(actual->'assignedResourceIds') IS DISTINCT FROM 'array'
   OR NOT actual->'assignedResourceIds' @> members OR start_min<public.hhmm_to_minutes(p.work_start) OR end_min>public.hhmm_to_minutes(p.work_end)
   OR NOT EXISTS(SELECT 1 FROM public.contestants c WHERE c.plan_id=p_plan AND c.id=task_row.contestant_id AND start_min>=public.hhmm_to_minutes(coalesce(c.availability_start,p.work_start)) AND end_min<=public.hhmm_to_minutes(coalesce(c.availability_end,p.work_end)))
   OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings sp JOIN public.plan_zone_settings z ON z.plan_id=sp.plan_id AND z.zone_id=sp.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=task_row.space_id
    AND start_min>=greatest(public.hhmm_to_minutes(coalesce(sp.availability_start,p.work_start)),public.hhmm_to_minutes(coalesce(z.availability_start,p.work_start)))
    AND end_min<=least(public.hhmm_to_minutes(coalesce(sp.availability_end,p.work_end)),public.hhmm_to_minutes(coalesce(z.availability_end,p.work_end))))
   OR (p.meal_mode='global_hard_break' AND start_min<public.hhmm_to_minutes(p.meal_end) AND end_min>public.hhmm_to_minutes(p.meal_start))
  THEN RAISE EXCEPTION 'ANCHORED_CERTIFICATE_INVALID'; END IF;
  IF member=policy->'anchorTaskId' AND EXISTS(SELECT 1 FROM (
    SELECT a.plan_resource_item_id id FROM public.plan_space_resource_assignments a WHERE a.plan_id=p_plan AND a.space_id=task_row.space_id
    UNION SELECT a.plan_resource_item_id FROM public.plan_zone_resource_assignments a JOIN public.plan_space_settings sp ON sp.plan_id=a.plan_id AND sp.zone_id=a.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=task_row.space_id
   ) required WHERE NOT actual->'assignedResourceIds' @> jsonb_build_array(required.id))
   OR EXISTS(SELECT 1 FROM jsonb_each(coalesce(tpl.resource_requirements->'byItem','{}')) req WHERE req.value<>'1'::jsonb OR NOT EXISTS(SELECT 1 FROM public.plan_resource_items res WHERE res.plan_id=p_plan AND res.resource_item_id::text=req.key AND actual->'assignedResourceIds' @> jsonb_build_array(res.id)))
  THEN RAISE EXCEPTION 'ANCHORED_CERTIFICATE_INVALID'; END IF;
  FOR rid IN SELECT value FROM jsonb_array_elements(actual->'assignedResourceIds') LOOP
   SELECT * INTO resource FROM public.plan_resource_items WHERE plan_id=p_plan AND id=rid::text::integer;
   IF NOT FOUND OR NOT resource.is_available OR start_min<public.hhmm_to_minutes(coalesce(resource.availability_start,p.work_start)) OR end_min>public.hhmm_to_minutes(coalesce(resource.availability_end,p.work_end)) THEN RAISE EXCEPTION 'ANCHORED_CERTIFICATE_INVALID'; END IF;
  END LOOP;
  operation_start:=coalesce(operation_start,start_min);operation_end:=end_min;previous_end:=end_min;
  IF member=policy->'anchorTaskId' THEN anchor_start:=start_min;anchor_end:=end_min;anchor_space:=task_row.space_id;participant:=task_row.contestant_id; END IF;
 END LOOP;
 IF unit.availability_windows IS NOT NULL AND NOT (SELECT range_agg(int4range(public.hhmm_to_minutes(w->>'start'),public.hhmm_to_minutes(w->>'end'),'[)')) @> int4range(operation_start,operation_end,'[)') FROM jsonb_array_elements(unit.availability_windows) w) THEN RAISE EXCEPTION 'ANCHORED_UNIT_UNAVAILABLE'; END IF;
 -- Capacity of the nominal unit and its physical members cannot be duplicated.
 FOR other IN SELECT value FROM jsonb_array_elements(p_snapshot->'tasks') t WHERE NOT public.anchored_member_ids(policy) @> jsonb_build_array(t->'taskId') AND t->>'startPlanned' IS NOT NULL LOOP
  SELECT * INTO STRICT task_row FROM public.daily_tasks WHERE id=(other->>'taskId')::integer AND plan_id=p_plan;
  SELECT * INTO STRICT tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=task_row.template_id;
  IF tpl.itinerant_team_requirement<>'none' THEN
   SELECT * INTO selected_unit FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND id=(other->>'itinerantTeamId')::bigint;
   IF NOT FOUND OR (tpl.itinerant_team_requirement='specific' AND selected_unit.source_team_id IS DISTINCT FROM tpl.itinerant_team_id)
    OR (tpl.itinerant_team_requirement='any' AND NOT tpl.allowed_itinerant_team_ids @> jsonb_build_array(selected_unit.source_team_id))
   THEN RAISE EXCEPTION 'ANCHORED_COMPETITOR_UNIT_INVALID'; END IF;
   SELECT jsonb_agg(value->'planResourceItemId') INTO selected_members FROM jsonb_array_elements(selected_unit.members);
   IF NOT coalesce(other->'assignedResourceIds','[]') @> selected_members THEN RAISE EXCEPTION 'ANCHORED_COMPETITOR_UNIT_INVALID'; END IF;
  END IF;
  IF public.hhmm_to_minutes(other->>'startPlanned')<operation_end AND public.hhmm_to_minutes(other->>'endPlanned')>operation_start AND (
   other->'itinerantTeamId'=policy->'itinerantUnitId' OR (tpl.itinerant_team_requirement='specific' AND tpl.itinerant_team_id=unit.source_team_id)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(members) member_resource(value) WHERE coalesce(other->'assignedResourceIds','[]') @> jsonb_build_array(member_resource.value))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(members) member_resource(value) JOIN public.plan_resource_items res ON res.plan_id=p_plan AND res.id=member_resource.value::text::integer WHERE tpl.resource_requirements#>ARRAY['byItem',res.resource_item_id::text]='1')
  ) THEN RAISE EXCEPTION 'ANCHORED_UNIT_CAPACITY_CONFLICT'; END IF;
  same_unit:=coalesce(other->'itinerantTeamId'=policy->'itinerantUnitId' OR (tpl.itinerant_team_requirement='specific' AND tpl.itinerant_team_id=unit.source_team_id),false);
  IF same_unit AND public.hhmm_to_minutes(other->>'startPlanned')<operation_end+coalesce(unit.transition_minutes,0)
   AND public.hhmm_to_minutes(other->>'endPlanned')+coalesce(unit.transition_minutes,0)>operation_start
  THEN RAISE EXCEPTION 'ANCHORED_UNIT_TRANSITION_CONFLICT'; END IF;
  IF task_row.contestant_id=participant AND public.hhmm_to_minutes(other->>'startPlanned')<operation_end AND public.hhmm_to_minutes(other->>'endPlanned')>operation_start
  THEN RAISE EXCEPTION 'ANCHORED_PARTICIPANT_CAPACITY_CONFLICT'; END IF;
  IF (other->>'spaceId')::integer=anchor_space
   AND coalesce((SELECT op->>'blocksSpace' FROM public.plan_config_revisions rev,LATERAL jsonb_array_elements(rev.replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}') op WHERE rev.id=p_revision AND rev.plan_id=p_plan AND op->'taskId'=other->'taskId'),'true')='true'
   AND public.hhmm_to_minutes(other->>'startPlanned')<anchor_end AND public.hhmm_to_minutes(other->>'endPlanned')>anchor_start
  THEN RAISE EXCEPTION 'ANCHORED_PHYSICAL_SPACE_CONFLICT'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_anchored_selected_snapshot(integer,jsonb,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_anchored_selected_snapshot(integer,jsonb,bigint,jsonb) TO service_role;
-- A v2 Stage certifies one full physical witness. Pending operations are never
-- copied into its snapshot. All identities and consumption are rebuilt from SQL.
CREATE FUNCTION public.assert_anchored_choice_witness(p_plan integer,p_snapshot jsonb,p_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; r public.planning_runs%rowtype; replay jsonb; operations jsonb; proof jsonb;
 task public.daily_tasks%rowtype; tpl public.plan_task_template_snapshots%rowtype; person public.contestants%rowtype;
 item jsonb; other jsonb; op jsonb; policy jsonb; actual jsonb; certified jsonb; dep jsonb; full_snapshot jsonb;
 unit public.plan_itinerant_unit_snapshots%rowtype; required jsonb; resource_ids jsonb; effective_ids jsonb; persisted_required jsonb;
 start_min integer; end_min integer; coach integer; selected integer; rid jsonb; resource public.plan_resource_items%rowtype;
 margin integer; participant_margin integer; gap integer; same_operation boolean; main_flow jsonb;
BEGIN
 SELECT * INTO STRICT p FROM public.plans WHERE id=p_plan;
 IF p.current_config_revision_id IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'STALE_ANCHORED_REPLAY'; END IF;
 PERFORM public.assert_daily_anchored_accompaniments(p_plan,p.daily_anchored_accompaniments-ARRAY['by','at']);
 SELECT replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities}' INTO replay FROM public.plan_config_revisions WHERE id=p_revision AND plan_id=p_plan;
 IF replay->'anchoredAccompaniments' IS DISTINCT FROM public.anchored_contracts(p.daily_anchored_accompaniments->'policies') THEN RAISE EXCEPTION 'STALE_ANCHORED_REPLAY'; END IF;
 operations:=replay->'taskOperations';main_flow:=replay#>'{plannerNext,mainFlow}';margin:=coalesce((replay#>>'{plannerNext,resourceTransitionMinutes}')::integer,0);
 SELECT * INTO r FROM public.planning_runs WHERE plan_id=p_plan AND config_revision_id=p_revision AND status='success'
  AND execution_kind='ASSISTED_SCOPE' AND assisted_result_json->>'outcome'='PROPOSAL'
  AND assisted_result_json->'proposedDraftSnapshot'=p_snapshot ORDER BY id DESC LIMIT 1;
 IF NOT FOUND OR r.result_fingerprint IS DISTINCT FROM encode(extensions.digest(convert_to(r.assisted_result_json::text,'UTF8'),'sha256'),'hex')
 THEN RAISE EXCEPTION 'ANCHORED_AUTHENTIC_PROPOSAL_REQUIRED'; END IF;
 proof:=r.assisted_result_json#>'{evidence,nominalPhysicalFutureWitness,tasks}';
 IF jsonb_typeof(proof) IS DISTINCT FROM 'array' OR jsonb_array_length(proof)<>(SELECT count(*) FROM public.daily_tasks WHERE plan_id=p_plan AND status<>'cancelled')
  OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(proof))<>jsonb_array_length(proof)
 THEN RAISE EXCEPTION 'ANCHORED_FUTURE_STRUCTURAL_WITNESS_REQUIRED'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(proof) LOOP
  SELECT * INTO task FROM public.daily_tasks WHERE plan_id=p_plan AND 'task:'||id=item->>'id' AND status<>'cancelled';
  IF NOT FOUND THEN RAISE EXCEPTION 'ANCHORED_WITNESS_IDENTITY'; END IF;
  SELECT * INTO STRICT tpl FROM public.plan_task_template_snapshots WHERE plan_id=p_plan AND source_template_id=task.template_id;
  SELECT value INTO op FROM jsonb_array_elements(operations) WHERE value->>'taskId'=task.id::text;
  start_min:=(item->>'start')::integer;end_min:=(item->>'end')::integer;coach:=NULL;selected:=NULL;unit:=NULL;
  IF op IS NULL OR item->>'kind' IS DISTINCT FROM op->>'plannerNextKind'
   OR item->>'spaceId' IS DISTINCT FROM 'space:'||task.space_id OR item->>'participantId' IS DISTINCT FROM (CASE WHEN task.contestant_id IS NULL THEN NULL ELSE 'participant:'||task.contestant_id END)
   OR (item->>'duration')::integer IS DISTINCT FROM coalesce(task.duration_override,tpl.default_duration)
   OR end_min-start_min IS DISTINCT FROM coalesce(task.duration_override,tpl.default_duration) OR start_min%5<>0 OR end_min%5<>0
   OR coalesce(item->>'blocksSpace','true') IS DISTINCT FROM coalesce(op->>'blocksSpace','true')
   OR (SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM jsonb_array_elements_text(coalesce(item->'dependencies','[]')))
    IS DISTINCT FROM (SELECT coalesce(jsonb_agg('task:'||value ORDER BY 'task:'||value),'[]') FROM jsonb_array_elements_text(op->'dependsOnTaskIds'))
  THEN RAISE EXCEPTION 'ANCHORED_WITNESS_IDENTITY'; END IF;
  IF start_min<public.hhmm_to_minutes(p.work_start) OR end_min>public.hhmm_to_minutes(p.work_end)
   OR NOT EXISTS(SELECT 1 FROM public.plan_space_settings sp JOIN public.plan_zone_settings z ON z.plan_id=sp.plan_id AND z.zone_id=sp.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=task.space_id
    AND start_min>=greatest(public.hhmm_to_minutes(coalesce(sp.availability_start,p.work_start)),public.hhmm_to_minutes(coalesce(z.availability_start,p.work_start)))
    AND end_min<=least(public.hhmm_to_minutes(coalesce(sp.availability_end,p.work_end)),public.hhmm_to_minutes(coalesce(z.availability_end,p.work_end))))
   OR (p.meal_mode='global_hard_break' AND start_min<public.hhmm_to_minutes(p.meal_end) AND end_min>public.hhmm_to_minutes(p.meal_start))
   OR EXISTS(SELECT 1 FROM public.locks l WHERE l.plan_id=p_plan AND l.task_id=task.id AND l.lock_type IN ('time','full')
    AND (l.locked_start IS NOT NULL AND start_min<>public.hhmm_to_minutes(l.locked_start) OR l.locked_end IS NOT NULL AND end_min<>public.hhmm_to_minutes(l.locked_end)))
  THEN RAISE EXCEPTION 'ANCHORED_WITNESS_AVAILABILITY_OR_LOCK'; END IF;
  IF task.contestant_id IS NOT NULL THEN
   SELECT * INTO STRICT person FROM public.contestants WHERE id=task.contestant_id AND plan_id=p_plan;
   IF start_min<public.hhmm_to_minutes(coalesce(person.availability_start,p.work_start)) OR end_min>public.hhmm_to_minutes(coalesce(person.availability_end,p.work_end)) THEN RAISE EXCEPTION 'ANCHORED_WITNESS_PARTICIPANT_AVAILABILITY'; END IF;
  END IF;
  IF item->>'kind' IN ('main','vocal') THEN
   coach:=person.vocal_coach_plan_resource_item_id;
   IF coach IS NULL OR item->>'coachId' IS DISTINCT FROM 'plan-resource:'||coach OR item->>'kind'='main' AND item->>'blockKey' IS DISTINCT FROM 'plan-resource:'||coach
   THEN RAISE EXCEPTION 'ANCHORED_WITNESS_COACH'; END IF;
  ELSIF item->>'coachId' IS NOT NULL THEN RAISE EXCEPTION 'ANCHORED_WITNESS_COACH'; END IF;
  IF op->>'itinerantTeamRequirement' IN ('specific','any') THEN
   IF (SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM jsonb_array_elements_text(coalesce(item->'allowedItinerantUnitIds','[]')))
    IS DISTINCT FROM (SELECT coalesce(jsonb_agg('itinerant-team:'||value ORDER BY 'itinerant-team:'||value),'[]') FROM jsonb_array_elements_text(coalesce(op->'allowedItinerantTeamIds','[]')))
   THEN RAISE EXCEPTION 'ANCHORED_WITNESS_DOMAIN'; END IF;
   SELECT * INTO unit FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan AND 'itinerant-team:'||id=item->>'itinerantUnitId';
   IF NOT FOUND OR jsonb_array_length(unit.members)=0
    OR op->>'itinerantTeamRequirement'='specific' AND op->'itinerantTeamId' IS DISTINCT FROM to_jsonb(unit.id)
    OR op->>'itinerantTeamRequirement'='any' AND NOT coalesce(op->'allowedItinerantTeamIds','[]') @> jsonb_build_array(unit.id)
   THEN RAISE EXCEPTION 'ANCHORED_UNIT_NOT_ELIGIBLE'; END IF;
   selected:=unit.id;
   IF unit.availability_windows IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(unit.availability_windows) w WHERE public.hhmm_to_minutes(w->>'start')<=start_min AND public.hhmm_to_minutes(w->>'end')>=end_min)
   THEN RAISE EXCEPTION 'ANCHORED_UNIT_UNAVAILABLE'; END IF;
  ELSIF item->>'itinerantUnitId' IS NOT NULL THEN RAISE EXCEPTION 'ANCHORED_UNIT_NOT_ELIGIBLE'; END IF;
  SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO required FROM (
   SELECT value::text::integer id FROM jsonb_array_elements(coalesce(op->'declaredResourceIds','[]'))
   UNION SELECT q.id FROM public.plan_resource_items q WHERE q.plan_id=p_plan AND tpl.resource_requirements#>ARRAY['byItem',q.resource_item_id::text]='1'
   UNION SELECT a.plan_resource_item_id FROM public.plan_space_resource_assignments a WHERE a.plan_id=p_plan AND a.space_id=task.space_id AND coalesce(op->>'resourceInheritance','LOCATION')='LOCATION'
   UNION SELECT a.plan_resource_item_id FROM public.plan_zone_resource_assignments a JOIN public.plan_space_settings sp ON sp.plan_id=a.plan_id AND sp.zone_id=a.zone_id WHERE sp.plan_id=p_plan AND sp.space_id=task.space_id AND coalesce(op->>'resourceInheritance','LOCATION')='LOCATION'
   UNION SELECT (value->>'planResourceItemId')::integer FROM jsonb_array_elements(coalesce(unit.members,'[]'))
   UNION SELECT l.locked_resource_id FROM public.locks l WHERE l.plan_id=p_plan AND l.task_id=task.id AND l.lock_type IN ('resource','full') AND l.locked_resource_id IS NOT NULL
  ) ids WHERE id IS DISTINCT FROM coach;
  SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') INTO resource_ids FROM jsonb_array_elements_text(coalesce(item->'requiredResourceIds','[]'));
  IF resource_ids IS DISTINCT FROM (SELECT coalesce(jsonb_agg('plan-resource:'||value ORDER BY 'plan-resource:'||value),'[]') FROM jsonb_array_elements_text(required))
   OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(coalesce(item->'requiredResourceIds','[]')))<>jsonb_array_length(coalesce(item->'requiredResourceIds','[]'))
   OR EXISTS(SELECT 1 FROM jsonb_each(coalesce(tpl.resource_requirements->'byItem','{}')) req WHERE req.value<>'1'::jsonb OR NOT EXISTS(SELECT 1 FROM public.plan_resource_items q WHERE q.plan_id=p_plan AND q.resource_item_id::text=req.key))
  THEN RAISE EXCEPTION 'ANCHORED_WITNESS_PHYSICAL_RESOURCES'; END IF;
  effective_ids:=required||CASE WHEN coach IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(coach) END;
  SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO persisted_required FROM (
   SELECT value::text::integer id FROM jsonb_array_elements(coalesce(op->'declaredResourceIds','[]'))
   UNION SELECT q.id FROM public.plan_resource_items q WHERE q.plan_id=p_plan AND tpl.resource_requirements#>ARRAY['byItem',q.resource_item_id::text]='1'
   UNION SELECT (value->>'planResourceItemId')::integer FROM jsonb_array_elements(coalesce(unit.members,'[]'))
   UNION SELECT coach WHERE coach IS NOT NULL
  ) ids WHERE id IS DISTINCT FROM coach;
  FOR rid IN SELECT value FROM jsonb_array_elements(effective_ids) LOOP
   SELECT * INTO resource FROM public.plan_resource_items WHERE plan_id=p_plan AND id=rid::text::integer;
   IF NOT FOUND OR NOT resource.is_available OR start_min<public.hhmm_to_minutes(coalesce(resource.availability_start,p.work_start)) OR end_min>public.hhmm_to_minutes(coalesce(resource.availability_end,p.work_end)) THEN RAISE EXCEPTION 'ANCHORED_WITNESS_RESOURCE_AVAILABILITY'; END IF;
  END LOOP;
  FOR dep IN SELECT value FROM jsonb_array_elements(op->'dependsOnTaskIds') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(proof) predecessor WHERE predecessor->>'id'='task:'||dep::text AND (predecessor->>'end')::integer<=start_min) THEN RAISE EXCEPTION 'ANCHORED_WITNESS_DEPENDENCY'; END IF;
  END LOOP;
  SELECT value INTO actual FROM jsonb_array_elements(p_snapshot->'tasks') x WHERE x->>'taskId'=task.id::text;
  IF actual IS NULL THEN RAISE EXCEPTION 'ANCHORED_WITNESS_SNAPSHOT_IDENTITY'; END IF;
  IF actual->>'startPlanned' IS NOT NULL AND (public.hhmm_to_minutes(actual->>'startPlanned') IS DISTINCT FROM start_min OR public.hhmm_to_minutes(actual->>'endPlanned') IS DISTINCT FROM end_min
   OR actual->'spaceId' IS DISTINCT FROM to_jsonb(task.space_id) OR nullif(actual->'itinerantTeamId','null') IS DISTINCT FROM to_jsonb(selected)
   OR NOT coalesce(actual->'assignedResourceIds','[]') @> persisted_required
   OR NOT effective_ids @> coalesce(actual->'assignedResourceIds','[]'))
  THEN RAISE EXCEPTION 'ANCHORED_SELECTION_SNAPSHOT_MISMATCH'; END IF;
  -- A witness cannot alter a decision already accepted in the active SQL projection.
  IF task.start_planned IS NOT NULL AND (start_min<>public.hhmm_to_minutes(task.start_planned) OR end_min<>public.hhmm_to_minutes(task.end_planned)
   OR actual->>'startPlanned' IS NULL) THEN RAISE EXCEPTION 'ANCHORED_PROTECTED_DECISIONS'; END IF;
 END LOOP;
 -- Whole-operation continuity and choice, including pending operations in the witness.
 SELECT jsonb_build_object('tasks',jsonb_agg(jsonb_build_object('taskId',substring(x->>'id' FROM 6)::integer,
  'spaceId',substring(x->>'spaceId' FROM 7)::integer,
  'startPlanned',lpad(((x->>'start')::integer/60)::text,2,'0')||':'||lpad(((x->>'start')::integer%60)::text,2,'0'),
  'endPlanned',lpad(((x->>'end')::integer/60)::text,2,'0')||':'||lpad(((x->>'end')::integer%60)::text,2,'0'),
  'itinerantTeamId',CASE WHEN x->>'itinerantUnitId' IS NULL THEN NULL ELSE substring(x->>'itinerantUnitId' FROM 16)::integer END,
  'assignedResourceIds',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]') FROM (
   SELECT substring(value FROM 15)::integer v FROM jsonb_array_elements_text(coalesce(x->'requiredResourceIds','[]'))
   UNION SELECT substring(x->>'coachId' FROM 15)::integer WHERE x->>'coachId' IS NOT NULL) ids)))) INTO full_snapshot FROM jsonb_array_elements(proof) x;
 FOR policy IN SELECT value FROM jsonb_array_elements(p.daily_anchored_accompaniments->'policies') LOOP
  SELECT value INTO certified FROM jsonb_array_elements(full_snapshot->'tasks') x WHERE x->'taskId'=policy->'anchorTaskId';
  IF policy ? 'itinerantUnitId' AND policy->'itinerantUnitId' IS DISTINCT FROM certified->'itinerantTeamId'
   OR policy ? 'eligibleItinerantUnitIds' AND NOT policy->'eligibleItinerantUnitIds' @> jsonb_build_array(certified->'itinerantTeamId') THEN RAISE EXCEPTION 'ANCHORED_UNIT_NOT_ELIGIBLE'; END IF;
  PERFORM public.assert_anchored_selected_snapshot(p_plan,full_snapshot,p_revision,(policy-'eligibleItinerantUnitIds')||jsonb_build_object('itinerantUnitId',certified->'itinerantTeamId'));
  IF (SELECT count(*) FROM jsonb_array_elements(p_snapshot->'tasks') x WHERE public.anchored_member_ids(policy) @> jsonb_build_array(x->'taskId') AND x->>'startPlanned' IS NOT NULL) NOT IN (0,3) THEN RAISE EXCEPTION 'ANCHORED_INCOMPLETE_OPERATION'; END IF;
 END LOOP;
 -- Check competition once, against authentic physical channels. Internal phases
 -- are indivisible and validated above; their transition is INCLUDED.
 FOR item IN SELECT value FROM jsonb_array_elements(proof) LOOP
  FOR other IN SELECT value FROM jsonb_array_elements(proof) x WHERE x->>'id'>item->>'id' LOOP
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(p.daily_anchored_accompaniments->'policies') c WHERE public.anchored_member_ids(c) @> jsonb_build_array(substring(item->>'id' FROM 6)::integer,substring(other->>'id' FROM 6)::integer)) INTO same_operation;
   IF NOT same_operation THEN
    gap:=CASE WHEN (item->>'start')::integer<=(other->>'start')::integer THEN (other->>'start')::integer-(item->>'end')::integer ELSE (item->>'start')::integer-(other->>'end')::integer END;
    IF item->>'spaceId'=other->>'spaceId' AND coalesce(item->>'blocksSpace','true')='true' AND coalesce(other->>'blocksSpace','true')='true' AND gap<0 THEN RAISE EXCEPTION 'ANCHORED_WITNESS_SPACE_CONFLICT'; END IF;
    IF item->>'participantId'=other->>'participantId' AND item->>'participantId' IS NOT NULL THEN
     SELECT coalesce(greatest(coalesce(da.participant_margin_after_minutes,ta.participant_margin_after_minutes),coalesce(db.participant_margin_before_minutes,tb.participant_margin_before_minutes)),p.participant_transition_minutes,0) INTO participant_margin
      FROM public.daily_tasks da JOIN public.plan_task_template_snapshots ta ON ta.plan_id=da.plan_id AND ta.source_template_id=da.template_id,
       public.daily_tasks db JOIN public.plan_task_template_snapshots tb ON tb.plan_id=db.plan_id AND tb.source_template_id=db.template_id
      WHERE da.plan_id=p_plan AND db.plan_id=p_plan AND 'task:'||da.id=CASE WHEN (item->>'start')::integer<=(other->>'start')::integer THEN item->>'id' ELSE other->>'id' END
       AND 'task:'||db.id=CASE WHEN (item->>'start')::integer<=(other->>'start')::integer THEN other->>'id' ELSE item->>'id' END;
     IF gap<participant_margin THEN RAISE EXCEPTION 'ANCHORED_WITNESS_PARTICIPANT_CONFLICT'; END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(item->'requiredResourceIds','[]')||CASE WHEN item->>'coachId' IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(item->>'coachId') END) a
     JOIN jsonb_array_elements_text(coalesce(other->'requiredResourceIds','[]')||CASE WHEN other->>'coachId' IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(other->>'coachId') END) b ON a=b)
     AND (gap<0 OR item->>'spaceId'<>other->>'spaceId' AND gap<margin) THEN RAISE EXCEPTION 'ANCHORED_WITNESS_RESOURCE_CONFLICT'; END IF;
    IF item->>'coachId'=other->>'coachId' AND item->>'coachId' IS NOT NULL AND (gap<0 OR item->>'spaceId'<>other->>'spaceId' AND gap<margin) THEN RAISE EXCEPTION 'ANCHORED_WITNESS_COACH_CONFLICT'; END IF;
   END IF;
  END LOOP;
 END LOOP;
 -- Native Main is REQUIRED; no operational meals/transport/setup are admitted by this version.
 IF EXISTS(WITH ordered AS (SELECT x,lag((x->>'end')::integer) OVER(ORDER BY (x->>'start')::integer,x->>'id') previous_end FROM jsonb_array_elements(proof) x WHERE x->>'kind'='main')
  SELECT 1 FROM ordered WHERE previous_end IS NOT NULL AND previous_end<>(x->>'start')::integer
   AND NOT(p.meal_mode='global_hard_break' AND previous_end=public.hhmm_to_minutes(p.meal_start) AND (x->>'start')::integer=public.hhmm_to_minutes(p.meal_end)))
 THEN RAISE EXCEPTION 'ANCHORED_WITNESS_MAIN_CONTINUITY'; END IF;
 IF EXISTS(WITH ordered AS (SELECT x,lag(x->>'coachId') OVER(ORDER BY (x->>'start')::integer,x->>'id') previous_coach FROM jsonb_array_elements(proof) x WHERE x->>'kind'='main'),
  numbered AS (SELECT x,sum(CASE WHEN previous_coach IS DISTINCT FROM x->>'coachId' THEN 1 ELSE 0 END) OVER(ORDER BY (x->>'start')::integer,x->>'id') run FROM ordered),
  runs AS (SELECT x->>'coachId' coach_key,count(*) size FROM numbered GROUP BY run,x->>'coachId')
  SELECT 1 FROM runs GROUP BY coach_key HAVING min(size)<(main_flow->>'minTasksPerBlock')::integer OR count(*)>(main_flow->>'maxBlocksByKey')::integer)
 THEN RAISE EXCEPTION 'ANCHORED_WITNESS_MAIN_BLOCKS'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_anchored_choice_witness(integer,jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_anchored_choice_witness(integer,jsonb,bigint) TO service_role;
ALTER FUNCTION public.assert_daily_anchored_snapshot(integer,jsonb,bigint) RENAME TO assert_daily_anchored_snapshot_v1;
CREATE FUNCTION public.assert_daily_anchored_snapshot(p_plan integer,p_snapshot jsonb,p_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF (SELECT daily_anchored_accompaniments->'contractVersion' FROM public.plans WHERE id=p_plan)='2' THEN
  IF (SELECT daily_anchored_accompaniments->'policies' FROM public.plans WHERE id=p_plan)<>'[]' THEN PERFORM public.assert_anchored_choice_witness(p_plan,p_snapshot,p_revision); END IF;
 ELSE PERFORM public.assert_daily_anchored_snapshot_v1(p_plan,p_snapshot,p_revision); END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_daily_anchored_snapshot_v1(integer,jsonb,bigint),public.assert_daily_anchored_snapshot(integer,jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_daily_anchored_snapshot_v1(integer,jsonb,bigint),public.assert_daily_anchored_snapshot(integer,jsonb,bigint) TO service_role;
