-- P0-G04a. Share the existing nominal transport authority with the global
-- physical witness. Historical migrations, schedules and accepted stages stay literal.
CREATE FUNCTION public.authenticated_transport_packets(p_plan integer,p_proof jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; o public.plan_optimizer_snapshots%rowtype; cfg jsonb; replay jsonb;
 c record; packet record; packets jsonb:='[]'; expected integer; actual integer;
BEGIN
 SELECT * INTO STRICT p FROM public.plans WHERE id=p_plan;
 IF p.planner_next_profile#>>'{configuration,transport}'='NONE' THEN RETURN packets; END IF;
 SELECT * INTO o FROM public.plan_optimizer_snapshots WHERE plan_id=p_plan;
 IF NOT FOUND OR o.arrival_plan_template_snapshot_id IS NULL AND o.departure_plan_template_snapshot_id IS NULL THEN
  IF p.planner_next_profile IS NOT NULL THEN RAISE EXCEPTION 'TRANSPORT_PACKET_AUTHORITY'; END IF;
  RETURN packets;
 END IF;
 IF o.arrival_plan_template_snapshot_id IS NULL OR o.departure_plan_template_snapshot_id IS NULL
  OR o.arrival_plan_template_snapshot_id=o.departure_plan_template_snapshot_id OR jsonb_typeof(p_proof) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'TRANSPORT_PACKET_AUTHORITY'; END IF;
 IF (SELECT count(*) FROM public.plan_task_template_snapshots t WHERE t.plan_id=p_plan AND t.id IN (o.arrival_plan_template_snapshot_id,o.departure_plan_template_snapshot_id))<>2 THEN RAISE EXCEPTION 'TRANSPORT_PACKET_AUTHORITY'; END IF;
 SELECT replay_snapshot_json INTO replay FROM public.plan_config_revisions WHERE id=p.current_config_revision_id AND plan_id=p_plan;
 cfg:=replay#>'{optimizerSnapshot,transport}';
 -- Native profiles bind persisted snapshot IDs and all HARD parameters to the
 -- effective revision. Legacy nominal consumers keep their persisted authority.
 IF p.planner_next_profile IS NOT NULL AND (
  jsonb_typeof(p.planner_next_profile#>'{configuration,transport}') IS DISTINCT FROM 'object'
  OR (cfg->>'arrivalPlanTemplateSnapshotId')::bigint IS DISTINCT FROM o.arrival_plan_template_snapshot_id
  OR (cfg->>'departurePlanTemplateSnapshotId')::bigint IS DISTINCT FROM o.departure_plan_template_snapshot_id
  OR (cfg->>'arrivalMinimumGroupSize')::integer IS DISTINCT FROM o.arrival_minimum_group_size
  OR (cfg->>'departureMinimumGroupSize')::integer IS DISTINCT FROM o.departure_minimum_group_size
  OR (cfg->>'arrivalMaximumGroupSize')::integer IS DISTINCT FROM o.arrival_maximum_group_size
  OR (cfg->>'departureMaximumGroupSize')::integer IS DISTINCT FROM o.departure_maximum_group_size
  OR (cfg->>'arrivalMinGapMinutes')::integer IS DISTINCT FROM o.arrival_min_gap_minutes
  OR (cfg->>'departureMinGapMinutes')::integer IS DISTINCT FROM o.departure_min_gap_minutes
  OR (cfg->>'vanCapacity')::integer IS DISTINCT FROM o.van_capacity)
 THEN RAISE EXCEPTION 'TRANSPORT_REVISION_AUTHORITY'; END IF;
 FOR c IN
  SELECT 'arrival' direction,t.source_template_id template_id,coalesce(o.arrival_minimum_group_size,1) minimum_size,
   coalesce(o.arrival_maximum_group_size,o.van_capacity) maximum_size,o.arrival_min_gap_minutes gap_minutes
   FROM public.plan_task_template_snapshots t WHERE t.id=o.arrival_plan_template_snapshot_id AND t.plan_id=p_plan
  UNION ALL
  SELECT 'departure',t.source_template_id,coalesce(o.departure_minimum_group_size,1),
   coalesce(o.departure_maximum_group_size,o.van_capacity),o.departure_min_gap_minutes
   FROM public.plan_task_template_snapshots t WHERE t.id=o.departure_plan_template_snapshot_id AND t.plan_id=p_plan
 LOOP
  IF c.minimum_size<1 OR c.maximum_size IS NULL OR c.maximum_size<c.minimum_size OR c.gap_minutes IS NULL OR c.gap_minutes<0
   OR p.planner_next_profile IS NOT NULL AND c.template_id IS DISTINCT FROM (p.planner_next_profile#>>ARRAY['configuration','transport',c.direction||'TemplateId'])::integer
  THEN RAISE EXCEPTION 'TRANSPORT_PACKET_AUTHORITY'; END IF;
  SELECT count(*) INTO expected FROM public.daily_tasks d WHERE d.plan_id=p_plan AND d.template_id=c.template_id AND d.status<>'cancelled';
  SELECT count(*) INTO actual FROM jsonb_array_elements(p_proof) x JOIN public.daily_tasks d ON x->>'id'='task:'||d.id
   WHERE d.plan_id=p_plan AND d.template_id=c.template_id AND d.status<>'cancelled';
  IF actual<>expected OR EXISTS(SELECT 1 FROM public.daily_tasks d WHERE d.plan_id=p_plan AND d.template_id=c.template_id AND d.status<>'cancelled'
   AND (d.contestant_id IS NULL OR (SELECT count(*) FROM jsonb_array_elements(p_proof) x WHERE x->>'id'='task:'||d.id)<>1))
   OR EXISTS(SELECT 1 FROM public.daily_tasks d WHERE d.plan_id=p_plan AND d.template_id=c.template_id AND d.status<>'cancelled'
    GROUP BY d.contestant_id HAVING count(*)<>1)
  THEN RAISE EXCEPTION 'TRANSPORT_WITNESS_IDENTITY'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_proof) x JOIN public.daily_tasks d ON x->>'id'='task:'||d.id
   WHERE d.plan_id=p_plan AND d.template_id=c.template_id AND (x->>'participantId' IS DISTINCT FROM 'participant:'||d.contestant_id
    OR x->>'kind' IS DISTINCT FROM 'auxiliary'))
  THEN RAISE EXCEPTION 'TRANSPORT_WITNESS_IDENTITY'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_proof) x JOIN public.daily_tasks d ON x->>'id'='task:'||d.id
   WHERE d.plan_id=p_plan AND d.template_id=c.template_id
   GROUP BY x->>'start' HAVING count(*)<c.minimum_size OR count(*)>c.maximum_size
    OR count(DISTINCT x->>'end')<>1 OR count(DISTINCT x->>'spaceId')<>1)
   OR EXISTS(SELECT 1 FROM
    (SELECT DISTINCT (x->>'start')::integer start FROM jsonb_array_elements(p_proof) x JOIN public.daily_tasks d ON x->>'id'='task:'||d.id WHERE d.plan_id=p_plan AND d.template_id=c.template_id) a,
    (SELECT DISTINCT (x->>'start')::integer start FROM jsonb_array_elements(p_proof) x JOIN public.daily_tasks d ON x->>'id'='task:'||d.id WHERE d.plan_id=p_plan AND d.template_id=c.template_id) b
    WHERE a.start<b.start AND b.start-a.start<c.gap_minutes)
  THEN RAISE EXCEPTION 'TRANSPORT_PACKET_AUTHORITY'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_proof) x JOIN public.daily_tasks d ON x->>'id'='task:'||d.id,
   jsonb_array_elements(p_proof) other
   WHERE d.plan_id=p_plan AND d.template_id=c.template_id AND other->>'id'<>x->>'id' AND other->>'participantId'=x->>'participantId'
    AND (c.direction='arrival' AND (other->>'start')::integer<(x->>'end')::integer
     OR c.direction='departure' AND (other->>'end')::integer>(x->>'start')::integer))
  THEN RAISE EXCEPTION 'TRANSPORT_PARTICIPANT_BOUNDARY'; END IF;
  FOR packet IN SELECT jsonb_agg(x->'id' ORDER BY x->>'id') ids,min((x->>'start')::integer) start,min((x->>'end')::integer) finish,min(x->>'spaceId') space
   FROM jsonb_array_elements(p_proof) x JOIN public.daily_tasks d ON x->>'id'='task:'||d.id
   WHERE d.plan_id=p_plan AND d.template_id=c.template_id GROUP BY x->>'start' ORDER BY min((x->>'start')::integer)
  LOOP packets:=packets||jsonb_build_array(jsonb_build_object('direction',c.direction,'taskIds',packet.ids,'start',packet.start,'end',packet.finish,'spaceId',packet.space)); END LOOP;
 END LOOP;
 RETURN packets;
END $$;
REVOKE ALL ON FUNCTION public.authenticated_transport_packets(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authenticated_transport_packets(integer,jsonb) TO service_role;

DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('public.assert_anchored_choice_witness(integer,jsonb,bigint)'::regprocedure);
 needle:='main_flow jsonb;';
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'TRANSPORT_WITNESS_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'main_flow jsonb; transport_packets jsonb;');
 needle:=' -- Check competition once, against authentic physical channels.';
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'TRANSPORT_COMPETITION_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,' transport_packets:=public.authenticated_transport_packets(p_plan,proof);
 -- Check competition once, against authentic physical channels.');
 needle:='   IF NOT same_operation THEN';
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'TRANSPORT_PAIR_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'   same_operation:=same_operation OR EXISTS(SELECT 1 FROM jsonb_array_elements(transport_packets) packet
    WHERE packet->''taskIds'' @> jsonb_build_array(item->''id'',other->''id''));
   IF NOT same_operation THEN');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.assert_daily_technical_chains(integer,jsonb)'::regprocedure);
 needle:=' OR p.planner_next_profile#>>''{configuration,transport}'' IS DISTINCT FROM ''NONE''';
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'TRANSPORT_PHASE_ADMISSION_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,' OR (p.planner_next_profile#>>''{configuration,transport}''<>''NONE'' AND (coalesce(p.daily_anchored_accompaniments->''policies'',''[]'')<>''[]'' OR coalesce(p.daily_task_operation_scopes->''policies'',''[]'')<>''[]'' OR coalesce(p.daily_operational_meal_policies->''policies'',''[]'')<>''[]'' OR coalesce(p.daily_resource_route_transitions->''routes'',''[]'')<>''[]''))');
 -- A transport obligation is independently owned, never a phase representative.
 needle:='IF tpl.planner_next_operation->>''kind'' NOT IN (''technical'',''auxiliary'')';
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'TRANSPORT_PHASE_MEMBER_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'IF EXISTS(SELECT 1 FROM public.plan_optimizer_snapshots o WHERE o.plan_id=p_plan
    AND tpl.id IN (o.arrival_plan_template_snapshot_id,o.departure_plan_template_snapshot_id)
    AND p.planner_next_profile#>>''{configuration,transport}''<>''NONE'') OR tpl.planner_next_operation->>''kind'' NOT IN (''technical'',''auxiliary'')');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.assert_daily_joint_groups(integer,jsonb)'::regprocedure);
 needle:=' OR p.planner_next_profile#>>''{configuration,transport}''<>''NONE''';
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'TRANSPORT_JOINT_ADMISSION_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,' OR (p.planner_next_profile#>>''{configuration,transport}''<>''NONE'' AND (p.daily_technical_chains#>''{policies,0,phases}'' IS NULL OR coalesce(p.daily_anchored_accompaniments->''policies'',''[]'')<>''[]'' OR coalesce(p.daily_task_operation_scopes->''policies'',''[]'')<>''[]'' OR coalesce(p.daily_operational_meal_policies->''policies'',''[]'')<>''[]'' OR coalesce(p.daily_resource_route_transitions->''routes'',''[]'')<>''[]''))');
 EXECUTE definition;
END $migration$;

-- Factor the packet check already present in the nominal trigger. Its remaining
-- identity, availability, dependencies, resource and coach checks are unchanged.
DO $migration$
DECLARE definition text; needle text;
BEGIN
 definition:=pg_get_functiondef('nominal_resource_private.guard_nominal_physical_validation()'::regprocedure);
 needle:=substring(definition FROM '   -- Existing transport packets[\s\S]*?   END LOOP;');
 IF needle IS NULL OR strpos(needle,'TRANSPORT_PACKET_AUTHORITY')=0 THEN RAISE EXCEPTION 'NOMINAL_TRANSPORT_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,needle,'   PERFORM public.authenticated_transport_packets(r.plan_id,proof||coalesce(evidence#>''{nominalPhysicalFutureWitness,participantMeals}'',''[]''));');
 EXECUTE definition;
END $migration$;
