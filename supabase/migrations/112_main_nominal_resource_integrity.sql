-- P0-U00l: ordinary Main physical choice, with an independently authenticated coach channel.
-- Incremental replacement only: same invoker function, trigger and privileges.
CREATE OR REPLACE FUNCTION nominal_resource_private.guard_nominal_physical_validation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 s public.assisted_planning_sessions%rowtype;
 r public.planning_runs%rowtype;
 p public.plans%rowtype;
 result jsonb; evidence jsonb; workday jsonb; candidate jsonb; row jsonb; meal_template bigint;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.daily_tasks d JOIN public.plan_task_template_snapshots t
   ON t.plan_id=d.plan_id AND t.source_template_id=d.template_id
   WHERE d.plan_id=NEW.plan_id AND d.status<>'cancelled' AND (jsonb_array_length(CASE WHEN jsonb_typeof(t.resource_requirements->'anyOf')='array' THEN t.resource_requirements->'anyOf' ELSE '[]'::jsonb END)>0 OR EXISTS (SELECT 1 FROM jsonb_object_keys(coalesce(t.resource_requirements->'byType','{}'::jsonb))))) THEN RETURN NEW; END IF;
 IF NEW.report_json->>'mode' IS DISTINCT FROM 'PROPOSAL_CERTIFIED_CLEAN_V1'
   OR coalesce(NEW.report_json->>'proposalRunId','') !~ '^[1-9][0-9]*$'
 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE id=NEW.session_id AND plan_id=NEW.plan_id FOR SHARE;
 IF NOT FOUND OR s.status<>'ACTIVE' OR s.draft_fingerprint IS DISTINCT FROM NEW.draft_fingerprint
   OR s.draft_base_stage_id IS DISTINCT FROM NEW.base_stage_id OR s.current_config_revision_id IS DISTINCT FROM NEW.config_revision_id
 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 SELECT * INTO r FROM public.planning_runs WHERE id=(NEW.report_json->>'proposalRunId')::bigint AND plan_id=NEW.plan_id FOR SHARE;
 IF NOT FOUND OR r.assisted_session_id IS DISTINCT FROM s.id OR r.config_revision_id IS DISTINCT FROM s.current_config_revision_id
   OR r.base_stage_id IS DISTINCT FROM s.draft_base_stage_id OR r.status<>'success' OR r.execution_kind<>'ASSISTED_SCOPE'
   OR r.assisted_result_json->'proposedDraftSnapshot' IS DISTINCT FROM s.draft_snapshot_json
   OR r.result_fingerprint IS DISTINCT FROM encode(extensions.digest(convert_to(r.assisted_result_json::text,'UTF8'),'sha256'),'hex')
 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=NEW.plan_id FOR SHARE;
 SELECT replay_snapshot_json#>'{authorities,plan_workday,0}' INTO workday FROM public.plan_config_revisions
   WHERE id=NEW.config_revision_id AND plan_id=NEW.plan_id;
 meal_template:=(workday#>>'{plannerNextAuthorities,mealTaskTemplateId}')::bigint;
 result:=r.assisted_result_json; evidence:=result->'evidence'; candidate:=s.draft_snapshot_json;
 -- Nominal opt-in: a full pending-work witness is ephemeral, never a Stage.
 IF EXISTS (SELECT 1 FROM public.daily_tasks d JOIN public.plan_task_template_snapshots t
   ON t.plan_id=d.plan_id AND t.source_template_id=d.template_id
   WHERE d.plan_id=r.plan_id AND d.status<>'cancelled' AND (jsonb_array_length(CASE WHEN jsonb_typeof(t.resource_requirements->'anyOf')='array' THEN t.resource_requirements->'anyOf' ELSE '[]'::jsonb END)>0 OR EXISTS (SELECT 1 FROM jsonb_object_keys(coalesce(t.resource_requirements->'byType','{}'::jsonb))))) THEN
  DECLARE
   proof jsonb:=evidence->'nominalPhysicalFutureWitness'->'tasks'; certified jsonb;
   source_row record; requirements jsonb; operation jsonb; domain_ids text[]; required_ids text[];
   item record; mapped_id bigint; fixed_id bigint; margin integer; requested_type text; typed boolean; independent_ids text[]; participant public.contestants%rowtype; nominal_expected_coach_id bigint; transport_contract record;
  BEGIN

   IF coalesce(workday#>>'{plannerNextAuthorities,plannerNext,profile}','MAIN_WITH_VOCAL_FEEDER') NOT IN ('STANDALONE_ONLY','MAIN_WITH_VOCAL_FEEDER')
     OR jsonb_typeof(proof) IS DISTINCT FROM 'array'
     OR jsonb_array_length(proof)<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(proof))
     OR EXISTS (SELECT 1 FROM public.daily_tasks d WHERE d.plan_id=r.plan_id AND d.status<>'cancelled'
       AND d.template_id IS DISTINCT FROM meal_template AND NOT EXISTS
       (SELECT 1 FROM jsonb_array_elements(proof) x WHERE x->>'id'='task:'||d.id))
   THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
   margin:=(workday#>>'{plannerNextAuthorities,plannerNext,resourceTransitionMinutes}')::integer;
   IF margin IS NULL OR margin<0 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
   FOR certified IN SELECT value FROM jsonb_array_elements(proof) LOOP
    IF coalesce(certified->>'id','') !~ '^task:[1-9][0-9]*$'
      OR coalesce(certified->>'start','') !~ '^[0-9]+$' OR coalesce(certified->>'end','') !~ '^[0-9]+$'
      OR jsonb_typeof(coalesce(certified->'requiredResourceIds','[]'::jsonb))<>'array'
    THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
    SELECT d.*,t.resource_requirements,t.default_duration,t.default_space_id,t.requires_auxiliar,t.requires_presenter INTO source_row
     FROM public.daily_tasks d JOIN public.plan_task_template_snapshots t
      ON t.plan_id=d.plan_id AND t.source_template_id=d.template_id
     WHERE d.plan_id=r.plan_id AND 'task:'||d.id=certified->>'id' AND d.status<>'cancelled';
    IF NOT FOUND OR certified->>'spaceId' IS DISTINCT FROM 'space:'||coalesce(source_row.space_id,source_row.default_space_id)
      OR (certified->>'end')::integer-(certified->>'start')::integer<>coalesce(source_row.duration_override,source_row.default_duration)
    THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
    requirements:=source_row.resource_requirements;
    SELECT value INTO operation FROM jsonb_array_elements(workday#>'{plannerNextAuthorities,taskOperations}')
      WHERE value->>'taskId'=source_row.id::text;
    -- The witness carries observations, never caller-controlled identities.
    IF certified->>'participantId' IS DISTINCT FROM (CASE WHEN source_row.contestant_id IS NULL THEN NULL ELSE 'participant:'||source_row.contestant_id END)
      OR certified->>'kind' IS DISTINCT FROM operation->>'plannerNextKind'
      OR coalesce(certified->>'blocksSpace','true') IS DISTINCT FROM coalesce(operation->>'blocksSpace','true')
      OR (certified->>'duration')::integer IS DISTINCT FROM coalesce(source_row.duration_override,source_row.default_duration)
      OR (SELECT coalesce(array_agg(value ORDER BY value),'{}'::text[]) FROM jsonb_array_elements_text(coalesce(certified->'dependencies','[]'::jsonb)))
        IS DISTINCT FROM (SELECT coalesce(array_agg('task:'||value ORDER BY 'task:'||value),'{}'::text[]) FROM jsonb_array_elements_text(coalesce(operation->'dependsOnTaskIds','[]'::jsonb)))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(operation->'dependsOnTaskIds') dep
        WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(proof) predecessor WHERE predecessor->>'id'='task:'||dep
          AND (predecessor->>'end')::integer<=(certified->>'start')::integer))
    THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: WITNESS_AUTHORITY'; END IF;
    -- Ordinary physical witnesses also retain day/space windows and real time locks.
    IF (certified->>'start')::integer<split_part(p.work_start,':',1)::integer*60+split_part(p.work_start,':',2)::integer
      OR (certified->>'end')::integer>split_part(p.work_end,':',1)::integer*60+split_part(p.work_end,':',2)::integer
      OR EXISTS (SELECT 1 FROM public.plan_space_settings sp JOIN public.plan_zone_settings z ON z.plan_id=sp.plan_id AND z.zone_id=sp.zone_id
        WHERE sp.plan_id=r.plan_id AND sp.space_id=coalesce(source_row.space_id,source_row.default_space_id)
          AND ((certified->>'start')::integer<split_part(greatest(coalesce(sp.availability_start,p.work_start),coalesce(z.availability_start,p.work_start)),':',1)::integer*60+split_part(greatest(coalesce(sp.availability_start,p.work_start),coalesce(z.availability_start,p.work_start)),':',2)::integer
            OR (certified->>'end')::integer>split_part(least(coalesce(sp.availability_end,p.work_end),coalesce(z.availability_end,p.work_end)),':',1)::integer*60+split_part(least(coalesce(sp.availability_end,p.work_end),coalesce(z.availability_end,p.work_end)),':',2)::integer))
      OR EXISTS (SELECT 1 FROM public.locks l WHERE l.plan_id=r.plan_id AND l.task_id=source_row.id AND l.lock_type IN ('time','full')
        AND ((l.locked_start IS NOT NULL AND (certified->>'start')::integer<>split_part(l.locked_start,':',1)::integer*60+split_part(l.locked_start,':',2)::integer)
          OR (l.locked_end IS NOT NULL AND (certified->>'end')::integer<>split_part(l.locked_end,':',1)::integer*60+split_part(l.locked_end,':',2)::integer)))
    THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: WITNESS_WINDOW_OR_LOCK'; END IF;
    IF source_row.contestant_id IS NOT NULL THEN
     SELECT * INTO participant FROM public.contestants WHERE id=source_row.contestant_id AND plan_id=r.plan_id;
     IF NOT FOUND OR (certified->>'start')::integer<split_part(coalesce(participant.availability_start,p.work_start),':',1)::integer*60+split_part(coalesce(participant.availability_start,p.work_start),':',2)::integer
       OR (certified->>'end')::integer>split_part(coalesce(participant.availability_end,p.work_end),':',1)::integer*60+split_part(coalesce(participant.availability_end,p.work_end),':',2)::integer
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: WITNESS_PARTICIPANT_AVAILABILITY'; END IF;
    END IF;
    nominal_expected_coach_id:=NULL;
    IF operation->>'plannerNextKind' IN ('main','vocal') THEN
     SELECT c.vocal_coach_plan_resource_item_id INTO nominal_expected_coach_id FROM public.contestants c
       WHERE c.id=source_row.contestant_id AND c.plan_id=r.plan_id;
     IF nominal_expected_coach_id IS NULL OR certified->>'coachId' IS DISTINCT FROM 'plan-resource:'||nominal_expected_coach_id
       OR NOT EXISTS (SELECT 1 FROM public.plan_resource_items q WHERE q.plan_id=r.plan_id AND q.id=nominal_expected_coach_id
         AND q.is_available
         AND (certified->>'start')::integer>=split_part(coalesce(q.availability_start,p.work_start),':',1)::integer*60+split_part(coalesce(q.availability_start,p.work_start),':',2)::integer
         AND (certified->>'end')::integer<=split_part(coalesce(q.availability_end,p.work_end),':',1)::integer*60+split_part(coalesce(q.availability_end,p.work_end),':',2)::integer)
       OR EXISTS (SELECT 1 FROM public.locks l JOIN public.contestants c ON c.plan_id=l.plan_id AND c.vocal_coach_plan_resource_item_id=l.locked_resource_id
         WHERE l.plan_id=r.plan_id AND l.task_id=source_row.id AND l.lock_type IN ('resource','full') AND l.locked_resource_id<>nominal_expected_coach_id)
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: WITNESS_COACH_AUTHORITY'; END IF;
    ELSIF certified->>'coachId' IS NOT NULL THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: WITNESS_COACH_AUTHORITY';
    END IF;
    SELECT coalesce(array_agg(value),'{}'::text[]) INTO required_ids
      FROM jsonb_array_elements_text(coalesce(certified->'requiredResourceIds','[]'::jsonb));
    IF nominal_expected_coach_id IS NOT NULL AND 'plan-resource:'||nominal_expected_coach_id=ANY(required_ids) THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: COACH_CHANNEL'; END IF;
    IF cardinality(required_ids)<>(SELECT count(DISTINCT x) FROM unnest(required_ids) x) THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: DUPLICATE_RESOURCE'; END IF;
    independent_ids:='{}'::text[];
    domain_ids:='{}'::text[];
    typed:=EXISTS (SELECT 1 FROM jsonb_object_keys(coalesce(requirements->'byType','{}'::jsonb)));
    IF jsonb_array_length(CASE WHEN jsonb_typeof(requirements->'anyOf')='array' THEN requirements->'anyOf' ELSE '[]'::jsonb END)>0 OR typed THEN
     IF operation->>'plannerNextKind' IS DISTINCT FROM (CASE WHEN coalesce(workday#>>'{plannerNextAuthorities,plannerNext,profile}','MAIN_WITH_VOCAL_FEEDER')='STANDALONE_ONLY' THEN 'auxiliary' ELSE 'main' END) OR source_row.requires_auxiliar OR source_row.requires_presenter
        OR operation->>'jointGroupId' IS NOT NULL OR operation->>'setupFamilyId' IS NOT NULL OR operation->>'itinerantTeamId' IS NOT NULL
        OR jsonb_array_length(coalesce(operation->'allowedItinerantTeamIds','[]'::jsonb))>0
        OR coalesce(operation->>'operationalRole','productive_task')<>'productive_task'
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(workday#>'{plannerNextAuthorities,setupPolicies}','[]'::jsonb)) g WHERE g->>'spaceId'=source_row.space_id::text)
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(workday#>'{plannerNextAuthorities,operationContinuityGroups}','[]'::jsonb)) g WHERE g->'taskIds' @> jsonb_build_array(source_row.id))
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(workday#>'{plannerNextAuthorities,technicalChains}','[]'::jsonb)) g WHERE g->'orderedTaskIds' @> jsonb_build_array(source_row.id))
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(workday#>'{plannerNextAuthorities,roundSynchronizations}','[]'::jsonb)) g,jsonb_array_elements(g->'lanes') lane WHERE lane->'taskIds' @> jsonb_build_array(source_row.id))
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(workday#>'{plannerNextAuthorities,anchoredAccompaniments}','[]'::jsonb)) g WHERE g->>'anchorTaskId'=source_row.id::text OR g->'beforeTaskIds' @> jsonb_build_array(source_row.id) OR g->'afterTaskIds' @> jsonb_build_array(source_row.id))
        OR workday#>>'{plannerNextAuthorities,plannerNext,searchPolicy}' IS DISTINCT FROM 'EXACT_CONSTRUCTIVE'
      THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: NOMINAL_CONTRACT'; END IF;
     IF typed THEN
      IF (SELECT count(*) FROM jsonb_object_keys(requirements->'byType'))<>1
        OR jsonb_array_length(coalesce(requirements->'anyOf','[]'::jsonb))<>0
      THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: BYTYPE_CONTRACT'; END IF;
      SELECT key INTO requested_type FROM jsonb_each(requirements->'byType');
      IF requirements->'byType'->requested_type IS DISTINCT FROM '1'::jsonb
        OR certified#>>'{nominalResourceChoice,requestedResourceTypeId}' IS DISTINCT FROM 'resource-type:'||requested_type
      THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: BYTYPE_IDENTITY'; END IF;
      -- Resolve the daily type, including ad hoc identities with no catalogue item.
      -- Shared auxiliary capacity and composite items never enter this domain.
      SELECT array_agg('plan-resource:'||q.id ORDER BY q.id) INTO domain_ids
       FROM public.plan_resource_items q JOIN public.resource_types rt ON rt.id=q.type_id
       WHERE q.plan_id=r.plan_id AND q.type_id::text=requested_type AND rt.code<>'auxiliar'
        AND coalesce(workday#>>ARRAY['plannerNextAuthorities','resourcePresenceConcentrationPolicies',q.id::text],'OFF')='OFF'
        AND NOT EXISTS (SELECT 1 FROM public.contestants c WHERE c.plan_id=r.plan_id AND c.vocal_coach_plan_resource_item_id=q.id)
        AND NOT EXISTS (SELECT 1 FROM public.resource_item_components c WHERE c.parent_resource_item_id=q.resource_item_id);
      IF coalesce(cardinality(domain_ids),0)=0 THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: BYTYPE_EMPTY_DOMAIN'; END IF;
      IF (SELECT coalesce(array_agg(value ORDER BY value),'{}'::text[]) FROM jsonb_array_elements_text(certified#>'{nominalResourceChoice,resourceIds}'))
        IS DISTINCT FROM (SELECT coalesce(array_agg(x ORDER BY x),'{}'::text[]) FROM unnest(domain_ids) x
          JOIN public.plan_resource_items q ON x='plan-resource:'||q.id WHERE q.is_available AND coalesce(q.availability_start,p.work_start)<p.work_end AND coalesce(q.availability_end,p.work_end)>p.work_start)
      THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: BYTYPE_DOMAIN'; END IF;
     ELSE
     IF jsonb_array_length(requirements->'anyOf')<>1 OR requirements#>>'{anyOf,0,quantity}' IS DISTINCT FROM '1'
       OR jsonb_array_length(requirements#>'{anyOf,0,resourceItemIds}')=0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(requirements#>'{anyOf,0,resourceItemIds}') g
          WHERE (SELECT count(*) FROM public.plan_resource_items q WHERE q.plan_id=r.plan_id AND q.resource_item_id::text=g)<>1)
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
     SELECT array_agg('plan-resource:'||q.id ORDER BY q.id) INTO domain_ids FROM public.plan_resource_items q
       WHERE q.plan_id=r.plan_id AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(requirements#>'{anyOf,0,resourceItemIds}') g WHERE q.resource_item_id::text=g);
     END IF;
     IF EXISTS (SELECT 1 FROM unnest(domain_ids) x JOIN public.plan_resource_items q ON x='plan-resource:'||q.id AND q.plan_id=r.plan_id
       JOIN public.resource_types rt ON rt.id=q.type_id
       WHERE rt.code='auxiliar' OR EXISTS (SELECT 1 FROM public.resource_item_components c WHERE c.parent_resource_item_id=q.resource_item_id)
         OR EXISTS (SELECT 1 FROM public.contestants c WHERE c.plan_id=r.plan_id AND c.vocal_coach_plan_resource_item_id=q.id)
         OR coalesce(workday#>>ARRAY['plannerNextAuthorities','resourcePresenceConcentrationPolicies',q.id::text],'OFF')<>'OFF')
       OR (SELECT coalesce(array_agg(value ORDER BY value),'{}'::text[]) FROM jsonb_array_elements_text(certified#>'{nominalResourceChoice,resourceIds}'))
         IS DISTINCT FROM (SELECT coalesce(array_agg(x ORDER BY x),'{}'::text[]) FROM unnest(domain_ids) x JOIN public.plan_resource_items q
           ON x='plan-resource:'||q.id WHERE q.is_available AND coalesce(q.availability_start,p.work_start)<p.work_end AND coalesce(q.availability_end,p.work_end)>p.work_start)
       OR NOT typed AND certified#>>'{nominalResourceChoice,requestedResourceTypeId}' IS NOT NULL
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: NOMINAL_DOMAIN'; END IF;
     IF (SELECT count(*) FROM unnest(required_ids) x WHERE x=ANY(domain_ids))<>1
       OR NOT coalesce((certified#>>'{nominalResourceChoice,selectedResourceId}')=ANY(domain_ids),false)
       OR NOT coalesce((certified#>>'{nominalResourceChoice,selectedResourceId}')=ANY(required_ids),false)
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: NOMINAL_SELECTION'; END IF;
    END IF;
    FOR item IN SELECT key,value FROM jsonb_each(coalesce(requirements->'byItem','{}'::jsonb)) LOOP
     SELECT min(q.id) INTO mapped_id FROM public.plan_resource_items q WHERE q.plan_id=r.plan_id AND q.resource_item_id::text=item.key;
     IF item.value<>'1'::jsonb OR mapped_id IS NULL OR (mapped_id IS DISTINCT FROM nominal_expected_coach_id AND NOT ('plan-resource:'||mapped_id=ANY(required_ids)))
       OR (SELECT count(*) FROM public.plan_resource_items q WHERE q.plan_id=r.plan_id AND q.resource_item_id::text=item.key)<>1
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: BYITEM_REQUIRED'; END IF;
     IF mapped_id IS DISTINCT FROM nominal_expected_coach_id THEN independent_ids:=array_append(independent_ids,'plan-resource:'||mapped_id); END IF;
    END LOOP;
    FOR fixed_id IN SELECT value::bigint FROM jsonb_array_elements_text(coalesce(source_row.assigned_resource_ids,'[]'::jsonb)) WHERE NOT ('plan-resource:'||value=ANY(domain_ids))
      UNION SELECT value::bigint FROM jsonb_array_elements_text(coalesce(operation->'declaredResourceIds','[]'::jsonb))
      UNION SELECT x.plan_resource_item_id FROM public.plan_space_resource_assignments x WHERE x.plan_id=r.plan_id
        AND x.space_id=coalesce(source_row.space_id,source_row.default_space_id) AND coalesce(operation->>'resourceInheritance','LOCATION')<>'OPERATION_ONLY'
      UNION SELECT x.plan_resource_item_id FROM public.plan_zone_resource_assignments x WHERE x.plan_id=r.plan_id
        AND x.zone_id=source_row.zone_id AND coalesce(operation->>'resourceInheritance','LOCATION')<>'OPERATION_ONLY'
      UNION SELECT x.locked_resource_id FROM public.locks x WHERE x.plan_id=r.plan_id AND x.task_id=source_row.id AND x.lock_type IN ('resource','full') AND x.locked_resource_id IS NOT NULL
    LOOP
     IF EXISTS (SELECT 1 FROM public.contestants c WHERE c.plan_id=r.plan_id AND c.vocal_coach_plan_resource_item_id=fixed_id)
       AND fixed_id IS DISTINCT FROM nominal_expected_coach_id THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: COACH_CHANNEL'; END IF;
     IF fixed_id=nominal_expected_coach_id THEN CONTINUE; END IF;
     independent_ids:=array_append(independent_ids,'plan-resource:'||fixed_id);
     IF NOT ('plan-resource:'||fixed_id=ANY(required_ids)) THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
    END LOOP;
    IF cardinality(domain_ids)>0 AND EXISTS (SELECT 1 FROM unnest(independent_ids) x
      WHERE coalesce(workday#>>ARRAY['plannerNextAuthorities','resourcePresenceConcentrationPolicies',split_part(x,':',2)],'OFF')<>'OFF')
    THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: NOMINAL_FIXED_MACRO_UNSUPPORTED'; END IF;
    IF cardinality(domain_ids)>0 AND (
      (SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}'::text[]) FROM unnest(independent_ids) x)
        IS DISTINCT FROM (SELECT coalesce(array_agg(value ORDER BY value),'{}'::text[]) FROM jsonb_array_elements_text(certified#>'{nominalResourceChoice,fixedResourceIds}'))
      OR (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(independent_ids||ARRAY[certified#>>'{nominalResourceChoice,selectedResourceId}']) x)
        IS DISTINCT FROM (SELECT array_agg(value ORDER BY value) FROM unnest(required_ids) value))
    THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: BYTYPE_FIXED_RESOURCES'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(required_ids) physical_id LEFT JOIN public.plan_resource_items q
       ON physical_id='plan-resource:'||q.id AND q.plan_id=r.plan_id
       WHERE q.id IS NULL OR NOT q.is_available
        OR (certified->>'start')::integer<split_part(coalesce(q.availability_start,p.work_start),':',1)::integer*60+split_part(coalesce(q.availability_start,p.work_start),':',2)::integer
        OR (certified->>'end')::integer>split_part(coalesce(q.availability_end,p.work_end),':',1)::integer*60+split_part(coalesce(q.availability_end,p.work_end),':',2)::integer)
    THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: RESOURCE_AVAILABILITY'; END IF;
    SELECT value INTO row FROM jsonb_array_elements(candidate->'tasks') x WHERE x->>'taskId'=source_row.id::text;
    IF row->>'startPlanned' IS NOT NULL THEN
     IF nominal_expected_coach_id IS NOT NULL AND coalesce(source_row.assigned_resource_ids,'[]'::jsonb) @> jsonb_build_array(nominal_expected_coach_id)
       AND NOT coalesce(row->'assignedResourceIds','[]'::jsonb) @> jsonb_build_array(nominal_expected_coach_id)
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: EXPLICIT_COACH_ASSIGNMENT'; END IF;
     IF (certified->>'start')::integer<>split_part(row->>'startPlanned',':',1)::integer*60+split_part(row->>'startPlanned',':',2)::integer
       OR (certified->>'end')::integer<>split_part(row->>'endPlanned',':',1)::integer*60+split_part(row->>'endPlanned',':',2)::integer
       OR (jsonb_array_length(CASE WHEN jsonb_typeof(requirements->'anyOf')='array' THEN requirements->'anyOf' ELSE '[]'::jsonb END)>0 OR typed) AND (SELECT coalesce(array_agg('plan-resource:'||value ORDER BY value),'{}'::text[]) FROM jsonb_array_elements_text(coalesce(row->'assignedResourceIds','[]'::jsonb)) WHERE value IS DISTINCT FROM nominal_expected_coach_id::text)
         IS DISTINCT FROM (SELECT coalesce(array_agg(value ORDER BY value),'{}'::text[]) FROM unnest(required_ids) value)
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
    END IF;
   END LOOP;
   -- Existing transport packets may share a space only when their persisted
   -- template, equal interval, HARD cardinality and inter-packet gap all agree.
   FOR transport_contract IN
    SELECT t.source_template_id AS template_id,coalesce(o.arrival_minimum_group_size,1) AS minimum_size,
      coalesce(o.arrival_maximum_group_size,o.van_capacity) AS maximum_size,o.arrival_min_gap_minutes AS gap_minutes
     FROM public.plan_optimizer_snapshots o JOIN public.plan_task_template_snapshots t ON t.id=o.arrival_plan_template_snapshot_id
     WHERE o.plan_id=r.plan_id
    UNION ALL
    SELECT t.source_template_id,coalesce(o.departure_minimum_group_size,1),
      coalesce(o.departure_maximum_group_size,o.van_capacity),o.departure_min_gap_minutes
     FROM public.plan_optimizer_snapshots o JOIN public.plan_task_template_snapshots t ON t.id=o.departure_plan_template_snapshot_id
     WHERE o.plan_id=r.plan_id
   LOOP
    IF transport_contract.maximum_size IS NULL OR transport_contract.maximum_size<transport_contract.minimum_size
      OR transport_contract.gap_minutes IS NULL OR transport_contract.gap_minutes<0
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(proof) x JOIN public.daily_tasks d ON x->>'id'='task:'||d.id
        WHERE d.plan_id=r.plan_id AND d.template_id=transport_contract.template_id
        GROUP BY x->>'start' HAVING count(*)<transport_contract.minimum_size OR count(*)>transport_contract.maximum_size
          OR count(DISTINCT x->>'end')<>1 OR count(DISTINCT x->>'spaceId')<>1)
      OR EXISTS (SELECT 1 FROM (
        SELECT DISTINCT (x->>'start')::integer AS start FROM jsonb_array_elements(proof) x JOIN public.daily_tasks d ON x->>'id'='task:'||d.id
         WHERE d.plan_id=r.plan_id AND d.template_id=transport_contract.template_id) a,
        (SELECT DISTINCT (x->>'start')::integer AS start FROM jsonb_array_elements(proof) x JOIN public.daily_tasks d ON x->>'id'='task:'||d.id
         WHERE d.plan_id=r.plan_id AND d.template_id=transport_contract.template_id) b
         WHERE a.start<b.start AND b.start-a.start<transport_contract.gap_minutes)
    THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: TRANSPORT_PACKET_AUTHORITY'; END IF;
   END LOOP;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements(proof) a,jsonb_array_elements(proof) b
     JOIN public.daily_tasks db ON b->>'id'='task:'||db.id AND db.plan_id=r.plan_id
     JOIN public.plan_task_template_snapshots tb ON tb.plan_id=db.plan_id AND tb.source_template_id=db.template_id,
     public.daily_tasks da JOIN public.plan_task_template_snapshots ta ON ta.plan_id=da.plan_id AND ta.source_template_id=da.template_id
     WHERE a->>'id'='task:'||da.id AND da.plan_id=r.plan_id AND a->>'id'<>b->>'id'
      AND ((a->>'spaceId'=b->>'spaceId' AND coalesce(a->>'blocksSpace','true')='true' AND coalesce(b->>'blocksSpace','true')='true'
        AND (a->>'start')::integer<(b->>'end')::integer AND (b->>'start')::integer<(a->>'end')::integer
        AND NOT (a->>'start'=b->>'start' AND a->>'end'=b->>'end' AND EXISTS (
          SELECT 1 FROM public.plan_optimizer_snapshots o JOIN public.plan_task_template_snapshots t
            ON t.id IN (o.arrival_plan_template_snapshot_id,o.departure_plan_template_snapshot_id)
          WHERE o.plan_id=r.plan_id AND da.template_id=t.source_template_id AND db.template_id=t.source_template_id)))
       OR (da.contestant_id=db.contestant_id AND (a->>'start')::integer<=(b->>'start')::integer
        AND (b->>'start')::integer-(a->>'end')::integer<coalesce(greatest(coalesce(da.participant_margin_after_minutes,ta.participant_margin_after_minutes),coalesce(db.participant_margin_before_minutes,tb.participant_margin_before_minutes)),(workday#>>'{plannerNextAuthorities,plannerNext,participantTransitionMinutes}')::integer,0))))
   THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: WITNESS_SPACE_OR_PARTICIPANT_OCCUPANCY'; END IF;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements(proof) a,jsonb_array_elements(proof) b
     WHERE a->>'id'<b->>'id' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(a->'requiredResourceIds','[]'::jsonb)) x
       JOIN jsonb_array_elements_text(coalesce(b->'requiredResourceIds','[]'::jsonb)) y ON x=y)
     AND ((a->>'start')::integer<(b->>'end')::integer AND (b->>'start')::integer<(a->>'end')::integer
       OR a->>'spaceId'<>b->>'spaceId' AND CASE WHEN (a->>'start')::integer<=(b->>'start')::integer
         THEN (b->>'start')::integer-(a->>'end')::integer ELSE (a->>'start')::integer-(b->>'end')::integer END<margin))
   THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: RESOURCE_OVERLAP_OR_TRANSITION'; END IF;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements(proof) a,jsonb_array_elements(proof) b
     WHERE a->>'id'<b->>'id' AND a->>'coachId'=b->>'coachId' AND a->>'coachId' IS NOT NULL
      AND ((a->>'start')::integer<(b->>'end')::integer AND (b->>'start')::integer<(a->>'end')::integer
       OR a->>'spaceId'<>b->>'spaceId' AND CASE WHEN (a->>'start')::integer<=(b->>'start')::integer
         THEN (b->>'start')::integer-(a->>'end')::integer ELSE (a->>'start')::integer-(b->>'end')::integer END
         <coalesce((SELECT (route->>'minutes')::integer FROM jsonb_array_elements(coalesce(workday#>'{plannerNextAuthorities,coachRouteTransitions}','[]'::jsonb)) route
           WHERE 'plan-resource:'||(route->>'coachPlanResourceItemId')=a->>'coachId'
             AND 'space:'||(route->>'fromSpaceId')=CASE WHEN (a->>'start')::integer<=(b->>'start')::integer THEN a->>'spaceId' ELSE b->>'spaceId' END
             AND 'space:'||(route->>'toSpaceId')=CASE WHEN (a->>'start')::integer<=(b->>'start')::integer THEN b->>'spaceId' ELSE a->>'spaceId' END),margin)))
   THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: COACH_OVERLAP_OR_TRANSITION'; END IF;
  END;
 END IF;
 NEW.report_json:=NEW.report_json||jsonb_build_object('nominalResourceFuture','CERTIFIED');
 RETURN NEW;
END $$;
