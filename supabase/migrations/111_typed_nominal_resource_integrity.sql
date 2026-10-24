-- P0-U00j: extend the existing private nominal guard to quantity-one byType.
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
   item record; mapped_id bigint; fixed_id bigint; margin integer; requested_type text; typed boolean; independent_ids text[]; participant public.contestants%rowtype;
  BEGIN

   IF workday#>>'{plannerNextAuthorities,plannerNext,profile}' IS DISTINCT FROM 'STANDALONE_ONLY'
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
      OR (certified->>'duration')::integer IS DISTINCT FROM coalesce(source_row.duration_override,source_row.default_duration)
      OR (SELECT coalesce(array_agg(value ORDER BY value),'{}'::text[]) FROM jsonb_array_elements_text(coalesce(certified->'dependencies','[]'::jsonb)))
        IS DISTINCT FROM (SELECT coalesce(array_agg('task:'||value ORDER BY 'task:'||value),'{}'::text[]) FROM jsonb_array_elements_text(coalesce(operation->'dependsOnTaskIds','[]'::jsonb)))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(operation->'dependsOnTaskIds') dep
        WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(proof) predecessor WHERE predecessor->>'id'='task:'||dep
          AND (predecessor->>'end')::integer<=(certified->>'start')::integer))
    THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: WITNESS_AUTHORITY'; END IF;
    IF source_row.contestant_id IS NOT NULL THEN
     SELECT * INTO participant FROM public.contestants WHERE id=source_row.contestant_id AND plan_id=r.plan_id;
     IF NOT FOUND OR (certified->>'start')::integer<split_part(coalesce(participant.availability_start,p.work_start),':',1)::integer*60+split_part(coalesce(participant.availability_start,p.work_start),':',2)::integer
       OR (certified->>'end')::integer>split_part(coalesce(participant.availability_end,p.work_end),':',1)::integer*60+split_part(coalesce(participant.availability_end,p.work_end),':',2)::integer
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: WITNESS_PARTICIPANT_AVAILABILITY'; END IF;
    END IF;
    SELECT coalesce(array_agg(value),'{}'::text[]) INTO required_ids
      FROM jsonb_array_elements_text(coalesce(certified->'requiredResourceIds','[]'::jsonb));
    IF cardinality(required_ids)<>(SELECT count(DISTINCT x) FROM unnest(required_ids) x) THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: DUPLICATE_RESOURCE'; END IF;
    independent_ids:='{}'::text[];
    domain_ids:='{}'::text[];
    typed:=EXISTS (SELECT 1 FROM jsonb_object_keys(coalesce(requirements->'byType','{}'::jsonb)));
    IF jsonb_array_length(CASE WHEN jsonb_typeof(requirements->'anyOf')='array' THEN requirements->'anyOf' ELSE '[]'::jsonb END)>0 OR typed THEN
     IF typed THEN
      IF operation->>'plannerNextKind' IS DISTINCT FROM 'auxiliary' OR source_row.requires_auxiliar OR source_row.requires_presenter
        OR operation->>'jointGroupId' IS NOT NULL OR operation->>'setupFamilyId' IS NOT NULL OR operation->>'itinerantTeamId' IS NOT NULL
        OR coalesce(operation->>'operationalRole','productive_task')<>'productive_task'
        OR (SELECT count(*) FROM jsonb_object_keys(requirements->'byType'))<>1
        OR jsonb_array_length(coalesce(requirements->'anyOf','[]'::jsonb))<>0
        OR workday#>>'{plannerNextAuthorities,plannerNext,searchPolicy}' IS DISTINCT FROM 'EXACT_CONSTRUCTIVE'
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
     IF (SELECT count(*) FROM unnest(required_ids) x WHERE x=ANY(domain_ids))<>1
       OR NOT coalesce((certified#>>'{nominalResourceChoice,selectedResourceId}')=ANY(domain_ids),false)
       OR NOT coalesce((certified#>>'{nominalResourceChoice,selectedResourceId}')=ANY(required_ids),false)
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: NOMINAL_SELECTION'; END IF;
    END IF;
    FOR item IN SELECT key,value FROM jsonb_each(coalesce(requirements->'byItem','{}'::jsonb)) LOOP
     SELECT min(q.id) INTO mapped_id FROM public.plan_resource_items q WHERE q.plan_id=r.plan_id AND q.resource_item_id::text=item.key;
     IF item.value<>'1'::jsonb OR mapped_id IS NULL OR NOT ('plan-resource:'||mapped_id=ANY(required_ids))
       OR (SELECT count(*) FROM public.plan_resource_items q WHERE q.plan_id=r.plan_id AND q.resource_item_id::text=item.key)<>1
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: BYITEM_REQUIRED'; END IF;
     independent_ids:=array_append(independent_ids,'plan-resource:'||mapped_id);
    END LOOP;
    FOR fixed_id IN SELECT value::bigint FROM jsonb_array_elements_text(coalesce(source_row.assigned_resource_ids,'[]'::jsonb)) WHERE NOT ('plan-resource:'||value=ANY(domain_ids))
      UNION SELECT value::bigint FROM jsonb_array_elements_text(coalesce(operation->'declaredResourceIds','[]'::jsonb))
      UNION SELECT x.plan_resource_item_id FROM public.plan_space_resource_assignments x WHERE x.plan_id=r.plan_id
        AND x.space_id=coalesce(source_row.space_id,source_row.default_space_id) AND coalesce(operation->>'resourceInheritance','LOCATION')<>'OPERATION_ONLY'
      UNION SELECT x.plan_resource_item_id FROM public.plan_zone_resource_assignments x WHERE x.plan_id=r.plan_id
        AND x.zone_id=source_row.zone_id AND coalesce(operation->>'resourceInheritance','LOCATION')<>'OPERATION_ONLY'
      UNION SELECT x.locked_resource_id FROM public.locks x WHERE x.plan_id=r.plan_id AND x.task_id=source_row.id AND x.lock_type IN ('resource','full') AND x.locked_resource_id IS NOT NULL
    LOOP
     independent_ids:=array_append(independent_ids,'plan-resource:'||fixed_id);
     IF NOT ('plan-resource:'||fixed_id=ANY(required_ids)) THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
    END LOOP;
    IF typed AND (
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
     IF (certified->>'start')::integer<>split_part(row->>'startPlanned',':',1)::integer*60+split_part(row->>'startPlanned',':',2)::integer
       OR (certified->>'end')::integer<>split_part(row->>'endPlanned',':',1)::integer*60+split_part(row->>'endPlanned',':',2)::integer
       OR (jsonb_array_length(CASE WHEN jsonb_typeof(requirements->'anyOf')='array' THEN requirements->'anyOf' ELSE '[]'::jsonb END)>0 OR typed) AND (SELECT coalesce(array_agg('plan-resource:'||value ORDER BY value),'{}'::text[]) FROM jsonb_array_elements_text(coalesce(row->'assignedResourceIds','[]'::jsonb)))
         IS DISTINCT FROM (SELECT coalesce(array_agg(value ORDER BY value),'{}'::text[]) FROM unnest(required_ids) value)
     THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
    END IF;
   END LOOP;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements(proof) a,jsonb_array_elements(proof) b
     WHERE a->>'id'<b->>'id' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(a->'requiredResourceIds','[]'::jsonb)) x
       JOIN jsonb_array_elements_text(coalesce(b->'requiredResourceIds','[]'::jsonb)) y ON x=y)
     AND ((a->>'start')::integer<(b->>'end')::integer AND (b->>'start')::integer<(a->>'end')::integer
       OR a->>'spaceId'<>b->>'spaceId' AND CASE WHEN (a->>'start')::integer<=(b->>'start')::integer
         THEN (b->>'start')::integer-(a->>'end')::integer ELSE (a->>'start')::integer-(b->>'end')::integer END<margin))
   THEN RAISE EXCEPTION 'RUN_RESULT_INVALID: RESOURCE_OVERLAP_OR_TRANSITION'; END IF;
  END;
 END IF;
 NEW.report_json:=NEW.report_json||jsonb_build_object('nominalResourceFuture','CERTIFIED');
 RETURN NEW;
END $$;
