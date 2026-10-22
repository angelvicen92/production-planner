-- CLI-generated; renamed to the repository's forward-only NNN sequence.
-- No backfill/adoption: historical snapshots and frozen 088 JSON stay intact.
CREATE TABLE public.operation_continuity_groups (
 id uuid PRIMARY KEY, name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 policy text NOT NULL CHECK(policy IN ('OFF','PREFERRED','REQUIRED')),
 gap_weight integer NOT NULL CHECK(gap_weight BETWEEN 1 AND 1000),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0)
);
ALTER TABLE public.operation_continuity_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY operation_continuity_read ON public.operation_continuity_groups FOR SELECT TO authenticated
 USING(public.has_role('admin') OR public.has_role('production') OR public.has_role('aux') OR public.has_role('viewer'));
REVOKE ALL ON public.operation_continuity_groups FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.operation_continuity_groups TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.operation_continuity_groups TO service_role;
ALTER TABLE public.task_templates ADD COLUMN continuity_group_id uuid REFERENCES public.operation_continuity_groups(id);
ALTER TABLE public.plan_task_template_snapshots ADD COLUMN continuity_group jsonb;
ALTER TABLE public.plans ADD COLUMN operation_continuity_overrides jsonb NOT NULL DEFAULT '[]'::jsonb
 CHECK(jsonb_typeof(operation_continuity_overrides)='array');

CREATE FUNCTION public.save_operation_continuity_group(p_id uuid,p_actor uuid,p_value jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.operation_continuity_groups%rowtype;
BEGIN
 PERFORM 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
 WHERE u.user_id=p_actor AND r.key='admin' FOR SHARE OF u;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPERATION_CONTINUITY_FORBIDDEN'; END IF;
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_value))<>4
 OR NOT p_value ?& ARRAY['name','policy','gapWeight','expectedRevision']
 OR jsonb_typeof(p_value->'name') IS DISTINCT FROM 'string'
 OR length(btrim(p_value->>'name')) NOT BETWEEN 1 AND 120
 OR coalesce(p_value->>'policy','') NOT IN ('OFF','PREFERRED','REQUIRED')
 OR jsonb_typeof(p_value->'gapWeight') IS DISTINCT FROM 'number'
 OR (p_value->>'gapWeight')!~'^[1-9][0-9]*$' OR (p_value->>'gapWeight')::numeric>1000
 THEN RAISE EXCEPTION 'INVALID_OPERATION_CONTINUITY_GROUP'; END IF;
 IF p_value->'expectedRevision'='null'::jsonb THEN
  INSERT INTO public.operation_continuity_groups(id,name,policy,gap_weight)
  VALUES(p_id,btrim(p_value->>'name'),p_value->>'policy',(p_value->>'gapWeight')::integer)
  ON CONFLICT(id) DO NOTHING RETURNING * INTO saved;
 ELSE
  IF jsonb_typeof(p_value->'expectedRevision') IS DISTINCT FROM 'number'
   OR (p_value->>'expectedRevision')!~'^[0-9]+$' THEN RAISE EXCEPTION 'INVALID_OPERATION_CONTINUITY_GROUP'; END IF;
  UPDATE public.operation_continuity_groups SET name=btrim(p_value->>'name'),policy=p_value->>'policy',
   gap_weight=(p_value->>'gapWeight')::integer,revision=revision+1
   WHERE id=p_id AND revision=(p_value->>'expectedRevision')::integer RETURNING * INTO saved;
 END IF;
 IF saved.id IS NULL THEN RAISE EXCEPTION 'OPERATION_CONTINUITY_CONFLICT'; END IF;
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.save_operation_continuity_group(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_operation_continuity_group(uuid,uuid,jsonb) TO service_role;

-- Extend U06b atomically: membership shares its CAS, lock, single revision bump and rollback.
CREATE OR REPLACE FUNCTION public.save_task_template_with_inverse(
  p_template_id bigint, p_actor uuid, p_patch jsonb, p_expected jsonb,
  p_added bigint[], p_removed bigint[]
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  affected bigint[];
  observed jsonb;
  expected jsonb;
  main public.task_templates%rowtype;
  dependent public.task_templates%rowtype;
  deps jsonb;
  dep_id bigint;
  changed_id bigint;
BEGIN
  PERFORM 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
    WHERE u.user_id=p_actor AND r.key='admin' FOR SHARE OF u;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_FORBIDDEN'; END IF;

  IF p_template_id IS NULL OR p_added IS NULL OR p_removed IS NULL
    OR p_patch IS NULL OR jsonb_typeof(p_patch)<>'object'
    OR p_expected IS NULL OR jsonb_typeof(p_expected)<>'array' THEN
    RAISE EXCEPTION 'TEMPLATE_INVALID';
  END IF;
  affected := ARRAY[p_template_id] || p_added || p_removed;
  IF EXISTS (SELECT 1 FROM unnest(affected) x WHERE x IS NULL OR x<=0 OR x>2147483647)
    OR cardinality(affected)<>(SELECT count(DISTINCT x) FROM unnest(affected) x)
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE NOT k=ANY(ARRAY['participant_margin_before_minutes','participant_margin_after_minutes','name','requires_auxiliar','requires_coach','requires_presenter','exclusive_auxiliar','setup_id','rules_json','resource_requirements','default_duration','default_cameras','auto_create_on_contestant_create','abbrev','default_comment1_color','default_comment2_color','ui_color','ui_color_secondary','depends_on_template_ids','has_dependency','depends_on_template_id','itinerant_team_requirement','itinerant_team_id','zone_id','space_id','continuity_group_id'])) THEN
    RAISE EXCEPTION 'TEMPLATE_INVALID';
  END IF;

  -- Catalog saves are short and infrequent. Serialize catalog writers, including
  -- legacy PATCH/DELETE, so references and membership cannot change between
  -- validation and writes; this also avoids cross-template row-lock deadlocks.
  LOCK TABLE public.task_templates IN SHARE ROW EXCLUSIVE MODE;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision) ORDER BY id),'[]'::jsonb)
    INTO observed FROM public.task_templates WHERE id=ANY(affected);
  SELECT coalesce(jsonb_agg(value ORDER BY (value->>'id')::bigint),'[]'::jsonb)
    INTO expected FROM jsonb_array_elements(p_expected);
  IF jsonb_array_length(observed)<>cardinality(affected) OR observed IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'TEMPLATE_CONFLICT';
  END IF;

  SELECT * INTO main FROM public.task_templates WHERE id=p_template_id;
  main := jsonb_populate_record(main,p_patch);
  -- Array is authoritative when supplied; otherwise preserve legacy PATCH intent.
  IF p_patch ? 'depends_on_template_ids' THEN
    deps := main.depends_on_template_ids;
  ELSIF p_patch ? 'has_dependency' OR p_patch ? 'depends_on_template_id' THEN
    deps := CASE WHEN main.has_dependency AND main.depends_on_template_id IS NOT NULL
      THEN jsonb_build_array(main.depends_on_template_id) ELSE '[]'::jsonb END;
  ELSE
    -- Like the UI reader, fall back to legacy for stored NULL/empty arrays.
    -- An explicitly supplied empty array above still means clear dependencies.
    deps := coalesce(nullif(main.depends_on_template_ids,'[]'::jsonb),
      CASE WHEN main.depends_on_template_id IS NOT NULL THEN jsonb_build_array(main.depends_on_template_id) ELSE '[]'::jsonb END);
  END IF;
  IF deps IS NULL OR jsonb_typeof(deps)<>'array' THEN RAISE EXCEPTION 'TEMPLATE_INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(deps) v WHERE jsonb_typeof(v)<>'number' OR v::text !~ '^[0-9]+$') THEN
    RAISE EXCEPTION 'TEMPLATE_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(deps) v WHERE v::numeric<=0 OR v::numeric>2147483647 OR v::numeric=p_template_id)
    OR jsonb_array_length(deps)<>(SELECT count(DISTINCT v) FROM jsonb_array_elements(deps) v)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(deps) v WHERE NOT EXISTS (SELECT 1 FROM public.task_templates WHERE id=v::bigint)) THEN
    RAISE EXCEPTION 'TEMPLATE_INVALID';
  END IF;
  main.depends_on_template_ids := deps;
  main.has_dependency := jsonb_array_length(deps)>0;
  main.depends_on_template_id := (deps->>0)::bigint;

  UPDATE public.task_templates SET
    participant_margin_before_minutes=main.participant_margin_before_minutes,
    participant_margin_after_minutes=main.participant_margin_after_minutes,
    name=main.name,
    requires_auxiliar=main.requires_auxiliar,
    requires_coach=main.requires_coach,
    requires_presenter=main.requires_presenter,
    exclusive_auxiliar=main.exclusive_auxiliar,
    setup_id=main.setup_id,
    rules_json=main.rules_json,
    resource_requirements=main.resource_requirements,
    default_duration=main.default_duration,
    default_cameras=main.default_cameras,
    auto_create_on_contestant_create=main.auto_create_on_contestant_create,
    abbrev=main.abbrev,
    default_comment1_color=main.default_comment1_color,
    default_comment2_color=main.default_comment2_color,
    ui_color=main.ui_color,
    ui_color_secondary=main.ui_color_secondary,
    depends_on_template_ids=main.depends_on_template_ids,
    has_dependency=main.has_dependency,
    depends_on_template_id=main.depends_on_template_id,
    itinerant_team_requirement=main.itinerant_team_requirement,
    itinerant_team_id=main.itinerant_team_id,
    zone_id=main.zone_id,
    continuity_group_id=main.continuity_group_id,
    space_id=main.space_id
    WHERE id=p_template_id RETURNING * INTO main;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_WRITE_FAILED'; END IF;

  FOR dep_id IN SELECT unnest(p_added || p_removed) ORDER BY 1 LOOP
    SELECT * INTO dependent FROM public.task_templates WHERE id=dep_id;
    deps := coalesce(nullif(dependent.depends_on_template_ids,'[]'::jsonb),
      CASE WHEN dependent.depends_on_template_id IS NOT NULL THEN jsonb_build_array(dependent.depends_on_template_id) ELSE '[]'::jsonb END);
    IF jsonb_typeof(deps)<>'array' THEN RAISE EXCEPTION 'TEMPLATE_INVALID'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(deps) v WHERE jsonb_typeof(v)<>'number' OR v::text !~ '^[0-9]+$') THEN
      RAISE EXCEPTION 'TEMPLATE_INVALID';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(deps) v WHERE v::numeric<=0 OR v::numeric>2147483647 OR v::numeric=dep_id)
      OR jsonb_array_length(deps)<>(SELECT count(DISTINCT v) FROM jsonb_array_elements(deps) v)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(deps) v WHERE NOT EXISTS (SELECT 1 FROM public.task_templates WHERE id=v::bigint)) THEN
      RAISE EXCEPTION 'TEMPLATE_INVALID';
    END IF;
    IF dep_id=ANY(p_added) THEN
      IF NOT deps @> jsonb_build_array(p_template_id) THEN deps := deps || jsonb_build_array(p_template_id); END IF;
    ELSE
      SELECT coalesce(jsonb_agg(v ORDER BY ord),'[]'::jsonb) INTO deps
        FROM jsonb_array_elements(deps) WITH ORDINALITY a(v,ord) WHERE v<>to_jsonb(p_template_id);
    END IF;
    UPDATE public.task_templates SET depends_on_template_ids=deps,
      has_dependency=jsonb_array_length(deps)>0, depends_on_template_id=(deps->>0)::bigint
      WHERE id=dep_id RETURNING id INTO changed_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_WRITE_FAILED'; END IF;
  END LOOP;
  -- No exception handler: every failure rolls back the main UPDATE and all peers.
  RETURN to_jsonb(main);
END;
$$;
REVOKE ALL ON FUNCTION public.save_task_template_with_inverse(bigint,uuid,jsonb,jsonb,bigint[],bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_task_template_with_inverse(bigint,uuid,jsonb,jsonb,bigint[],bigint[]) TO service_role;

CREATE FUNCTION public.effective_operation_continuity(p_plan_id integer,p_overrides jsonb) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE groups jsonb; item jsonb; keys text[]:='{}'; n integer;
BEGIN
 -- Explicit per-day policies supersede inherited membership for the same ID.
 WITH inherited AS (
  SELECT s.continuity_group->>'id' id,s.continuity_group->>'policy' policy,
   (s.continuity_group->>'gapWeight')::integer weight,jsonb_agg(d.id ORDER BY d.id) tasks
  FROM public.plan_task_template_snapshots s JOIN public.daily_tasks d ON d.plan_id=s.plan_id AND d.template_id=s.source_template_id
  WHERE s.plan_id=p_plan_id AND s.continuity_group IS NOT NULL
  GROUP BY s.continuity_group->>'id',s.continuity_group->>'policy',s.continuity_group->>'gapWeight'
 ), explicit AS (
  SELECT value FROM public.plans p,LATERAL jsonb_array_elements(coalesce(p.planner_next_configuration->'operationContinuityGroups','[]'::jsonb))
  WHERE p.id=p_plan_id
 ), combined AS (
  SELECT jsonb_build_object('id',i.id,'policy',i.policy,'gapWeight',i.weight,'taskIds',i.tasks) value FROM inherited i
  WHERE NOT EXISTS(SELECT 1 FROM explicit e WHERE e.value->>'id'=i.id)
  UNION ALL SELECT value FROM explicit
 ) SELECT coalesce(jsonb_agg(value ORDER BY value->>'id'),'[]'::jsonb) INTO groups FROM combined;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(groups) g GROUP BY g->>'id' HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'OPERATION_CONTINUITY_CONFIGURATION_CONFLICT'; END IF;
 IF jsonb_typeof(p_overrides) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_OPERATION_CONTINUITY_OVERRIDE'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_overrides) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>5
   OR NOT item ?& ARRAY['groupId','policy','gapWeight','by','at']
   OR coalesce(item->>'policy','') NOT IN ('OFF','PREFERRED','REQUIRED')
   OR jsonb_typeof(item->'gapWeight') IS DISTINCT FROM 'number' OR (item->>'gapWeight')!~'^[1-9][0-9]*$'
   OR (item->>'gapWeight')::numeric>1000 THEN RAISE EXCEPTION 'INVALID_OPERATION_CONTINUITY_OVERRIDE'; END IF;
  PERFORM (item->>'groupId')::uuid,(item->>'by')::uuid,(item->>'at')::timestamptz;
  IF item->>'groupId'=ANY(keys) THEN RAISE EXCEPTION 'DUPLICATE_OPERATION_CONTINUITY_OVERRIDE'; END IF;
  keys:=array_append(keys,item->>'groupId');
  SELECT count(*) INTO n FROM jsonb_array_elements(groups) g WHERE g->>'id'=item->>'groupId';
  IF n<>1 THEN RAISE EXCEPTION 'OPERATION_CONTINUITY_CONFIGURATION_CONFLICT'; END IF;
  SELECT jsonb_agg(CASE WHEN g->>'id'=item->>'groupId' THEN g||jsonb_build_object('policy',item->>'policy','gapWeight',item->'gapWeight') ELSE g END ORDER BY g->>'id')
   INTO groups FROM jsonb_array_elements(groups) g;
 END LOOP;
 RETURN groups;
END $$;
REVOKE ALL ON FUNCTION public.effective_operation_continuity(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.effective_operation_continuity(integer,jsonb) TO service_role;

CREATE FUNCTION public.guard_operation_continuity_overrides() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.operation_continuity_overrides<>'[]'::jsonb)
 OR (TG_OP='UPDATE' AND NEW.operation_continuity_overrides IS DISTINCT FROM OLD.operation_continuity_overrides) THEN
  IF current_user<>'service_role' OR current_setting('optiplan.operation_continuity_operation',true) IS DISTINCT FROM 'versioned'
  THEN RAISE EXCEPTION 'OPERATION_CONTINUITY_REQUIRES_VERSIONED_OPERATION'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_operation_continuity_overrides BEFORE INSERT OR UPDATE ON public.plans
 FOR EACH ROW EXECUTE FUNCTION public.guard_operation_continuity_overrides();
REVOKE ALL ON FUNCTION public.guard_operation_continuity_overrides() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.apply_day_config_operation_v5(
 p_plan_id integer,p_actor uuid,p_operation text,p_payload jsonb,p_expected_revision bigint,
 p_expected_identity jsonb,p_expected_replay jsonb,p_candidate_identity jsonb,p_candidate_replay jsonb,p_diff jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.plans%rowtype; target jsonb; overrides jsonb; groups jsonb; selected boolean; guard text; result bigint;
BEGIN
 PERFORM 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
 WHERE u.user_id=p_actor AND r.key IN ('admin','production') FOR SHARE OF u;
 IF NOT FOUND THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
 IF p.current_config_revision_id IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
 groups:=public.effective_operation_continuity(p_plan_id,p.operation_continuity_overrides);
 selected:=(p_operation='EDIT' AND p_payload ? 'operationContinuity') OR (p_operation='RESTORE' AND p_payload->>'capability'='OPERATION_CONTINUITY');
 IF coalesce(p_expected_replay#>'{authorities,plan_workday,0,plannerNextAuthorities,operationContinuityGroups}','[]'::jsonb) IS DISTINCT FROM groups
 THEN RAISE EXCEPTION 'STALE_OPERATION_CONTINUITY_CANDIDATE'; END IF;
 IF selected THEN
  IF NOT p_payload ? 'expectedRevisionId' OR p_payload->'expectedRevisionId' IS DISTINCT FROM coalesce(to_jsonb(p_expected_revision),'null'::jsonb)
  THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('operationContinuity','expectedRevisionId','capability'))
  THEN RAISE EXCEPTION 'INVALID_OPERATION_CONTINUITY_OVERRIDE'; END IF;
  target:=p_payload->'operationContinuity';
  IF jsonb_typeof(target) IS DISTINCT FROM 'object' OR NOT target ? 'groupId'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(target) k WHERE k NOT IN ('groupId','policy','gapWeight'))
  THEN RAISE EXCEPTION 'INVALID_OPERATION_CONTINUITY_OVERRIDE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(groups) g WHERE g->>'id'=target->>'groupId')
  THEN RAISE EXCEPTION 'OPERATION_CONTINUITY_CONFIGURATION_CONFLICT'; END IF;
  IF p_operation='RESTORE' AND (target ? 'policy' OR target ? 'gapWeight' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.operation_continuity_overrides) v WHERE v->>'groupId'=target->>'groupId'))
  THEN RAISE EXCEPTION 'OPERATION_CONTINUITY_RESTORE_NOT_AVAILABLE'; END IF;
  SELECT coalesce(jsonb_agg(value),'[]'::jsonb) INTO overrides FROM jsonb_array_elements(p.operation_continuity_overrides) WHERE value->>'groupId'<>target->>'groupId';
  IF p_operation='EDIT' THEN overrides:=overrides||jsonb_build_array(target||jsonb_build_object('by',p_actor,'at',now())); END IF;
  groups:=public.effective_operation_continuity(p_plan_id,overrides);
  guard:=current_setting('optiplan.operation_continuity_operation',true);
  PERFORM set_config('optiplan.operation_continuity_operation','versioned',true);
  UPDATE public.plans SET operation_continuity_overrides=overrides WHERE id=p_plan_id;
  PERFORM set_config('optiplan.operation_continuity_operation',coalesce(guard,''),true);
 END IF;
 IF coalesce(p_candidate_replay#>'{authorities,plan_workday,0,plannerNextAuthorities,operationContinuityGroups}','[]'::jsonb) IS DISTINCT FROM groups
 THEN RAISE EXCEPTION 'STALE_OPERATION_CONTINUITY_CANDIDATE'; END IF;
 result:=public.apply_day_config_operation_v4(p_plan_id,p_actor,p_operation,p_payload-'operationContinuity',p_expected_revision,
  p_expected_identity,p_expected_replay,p_candidate_identity,p_candidate_replay,p_diff);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;

-- Config refresh/replay copies the authority captured in the supplied immutable
-- revision, including an explicit absence; it never rereads the global group.
ALTER FUNCTION public.assisted_apply_config_refresh(integer,uuid,bigint,jsonb,jsonb,jsonb) RENAME TO assisted_apply_config_refresh_v1;
CREATE FUNCTION public.assisted_apply_config_refresh(p_plan_id integer,p_user_id uuid,p_expected_revision bigint,p_identity jsonb,p_replay jsonb,p_diff jsonb)
 RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result bigint;
BEGIN
 PERFORM 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id WHERE u.user_id=p_user_id AND r.key IN ('admin','production') FOR SHARE OF u;
 IF NOT FOUND THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
 PERFORM 1 FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 result:=public.assisted_apply_config_refresh_v1(p_plan_id,p_user_id,p_expected_revision,p_identity,p_replay,p_diff);
 UPDATE public.plan_task_template_snapshots s SET continuity_group=nullif(item->'continuityGroup','null'::jsonb)
 FROM jsonb_array_elements(p_replay->'taskTemplateSnapshots') item
 WHERE s.plan_id=p_plan_id AND s.source_template_id=(item->>'sourceTemplateId')::integer;
 IF coalesce(p_replay#>'{authorities,plan_workday,0,plannerNextAuthorities,operationContinuityGroups}','[]'::jsonb)
 IS DISTINCT FROM public.effective_operation_continuity(p_plan_id,(SELECT operation_continuity_overrides FROM public.plans WHERE id=p_plan_id))
 THEN RAISE EXCEPTION 'STALE_OPERATION_CONTINUITY_CANDIDATE'; END IF;
 UPDATE public.plans SET current_config_revision_id=result WHERE id=p_plan_id;

 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.assisted_apply_config_refresh(integer,uuid,bigint,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assisted_apply_config_refresh(integer,uuid,bigint,jsonb,jsonb,jsonb) TO service_role;

-- Extend RESTORE dispatch only; other categories retain their existing writer.
CREATE OR REPLACE FUNCTION public.apply_day_config_operation(
  p_plan_id integer, p_actor uuid, p_operation text, p_payload jsonb,
  p_expected_revision bigint, p_expected_identity jsonb, p_expected_replay jsonb,
  p_candidate_identity jsonb, p_candidate_replay jsonb, p_diff jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p public.plans%ROWTYPE; g public.program_settings%ROWTYPE; cap text;
  parent_revision bigint; new_revision bigint; persisted_fingerprint text;
BEGIN
  SELECT * INTO p FROM public.plans WHERE id=p_plan_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  IF p.current_config_revision_id IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;
  IF p_expected_identity->>'contractVersion'<>'1' OR (p_expected_identity->>'planId')::integer<>p_plan_id
     OR p_expected_replay->>'contractVersion'<>'1' OR p_expected_identity->>'configurationFingerprint' IS NULL
     OR p_candidate_identity->>'contractVersion'<>'1' OR (p_candidate_identity->>'planId')::integer<>p_plan_id
     OR p_candidate_replay->>'contractVersion'<>'1' OR p_candidate_identity->>'configurationFingerprint' IS NULL
     THEN RAISE EXCEPTION 'INVALID_CONFIG_REVISION_CONTRACT'; END IF;

  parent_revision:=p.current_config_revision_id;
  IF parent_revision IS NOT NULL THEN
    SELECT fingerprint INTO persisted_fingerprint FROM public.plan_config_revisions
      -- The plan lock pins this immutable revision; SELECT needs no UPDATE grant.
      WHERE id=parent_revision AND plan_id=p_plan_id;
  END IF;
  -- A missing or stale legacy pointer is repaired only with a full canonical
  -- snapshot of the pre-mutation effective configuration.
  IF persisted_fingerprint IS DISTINCT FROM p_expected_identity->>'configurationFingerprint' THEN
    INSERT INTO public.plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json,created_by)
    VALUES(p_plan_id,parent_revision,'CANONICAL_MATERIALIZATION',p_expected_identity->>'configurationFingerprint',p_expected_identity,p_expected_replay,
      jsonb_build_object('reason','legacy-or-stale-current-revision'),p_actor) RETURNING id INTO parent_revision;
  END IF;

  IF p_operation='EDIT' THEN
    IF p_payload ? 'workday' THEN UPDATE public.plans SET work_start=p_payload#>>'{workday,start}',work_end=p_payload#>>'{workday,end}',work_config_source='DAY_OVERRIDE',work_override_by=p_actor,work_override_at=now() WHERE id=p_plan_id; END IF;
    IF p_payload ? 'meal' THEN UPDATE public.plans SET meal_start=p_payload#>>'{meal,start}',meal_end=p_payload#>>'{meal,end}',meal_mode=p_payload#>>'{meal,mode}',meal_config_source='DAY_OVERRIDE',meal_override_by=p_actor,meal_override_at=now() WHERE id=p_plan_id; END IF;
    IF p_payload ? 'participantTransitionMinutes' THEN UPDATE public.plans SET participant_transition_minutes=(p_payload->>'participantTransitionMinutes')::int,participant_transition_config_source='DAY_OVERRIDE',participant_transition_override_by=p_actor,participant_transition_override_at=now() WHERE id=p_plan_id; END IF;
  ELSIF p_operation='RESTORE' THEN
    cap:=p_payload->>'capability';
    IF cap='WORKDAY_WINDOW' THEN UPDATE public.plans SET work_start=work_baseline_start,work_end=work_baseline_end,work_config_source='INHERITED',work_override_by=NULL,work_override_at=NULL WHERE id=p_plan_id;
    ELSIF cap='GLOBAL_MEAL_BREAK' THEN UPDATE public.plans SET meal_start=meal_baseline_start,meal_end=meal_baseline_end,meal_mode=meal_baseline_mode,meal_config_source='INHERITED',meal_override_by=NULL,meal_override_at=NULL WHERE id=p_plan_id;
    ELSIF cap='PARTICIPANT_TRANSITION' THEN UPDATE public.plans SET participant_transition_minutes=participant_transition_baseline_minutes,participant_transition_config_source='INHERITED',participant_transition_override_by=NULL,participant_transition_override_at=NULL WHERE id=p_plan_id;
    -- v3 already restored the separate Main authority under the plan lock.
    ELSIF cap IN ('BLOCK_COUNT_POLICY','OPTIMIZATION','SYNCHRONIZED_ROUNDS','OPERATION_CONTINUITY') THEN NULL;
    ELSE RAISE EXCEPTION 'INVALID_CAPABILITY'; END IF;
  ELSIF p_operation='REFRESH' THEN
    SELECT * INTO g FROM public.program_settings WHERE id=1;
    IF p_payload->'capabilities' ? 'WORKDAY_WINDOW' AND (p.work_config_source<>'LEGACY_BACKFILL' OR p_payload->>'legacyTreatment'='ADOPT_GENERAL_AS_INHERITED') THEN
      UPDATE public.plans SET work_baseline_start=g.default_work_start,work_baseline_end=g.default_work_end,
        work_start=CASE WHEN p.work_config_source='DAY_OVERRIDE' THEN work_start ELSE g.default_work_start END,
        work_end=CASE WHEN p.work_config_source='DAY_OVERRIDE' THEN work_end ELSE g.default_work_end END,
        work_config_source=CASE WHEN p.work_config_source='LEGACY_BACKFILL' THEN 'INHERITED' ELSE p.work_config_source END,
        work_override_by=CASE WHEN p.work_config_source='DAY_OVERRIDE' THEN work_override_by ELSE NULL END,
        work_override_at=CASE WHEN p.work_config_source='DAY_OVERRIDE' THEN work_override_at ELSE NULL END WHERE id=p_plan_id;
    END IF;
    IF p_payload->'capabilities' ? 'GLOBAL_MEAL_BREAK' AND (p.meal_config_source<>'LEGACY_BACKFILL' OR p_payload->>'legacyTreatment'='ADOPT_GENERAL_AS_INHERITED') THEN
      UPDATE public.plans SET meal_baseline_start=g.meal_start,meal_baseline_end=g.meal_end,meal_baseline_mode=g.meal_mode,
        meal_start=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_start ELSE g.meal_start END,
        meal_end=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_end ELSE g.meal_end END,
        meal_mode=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_mode ELSE g.meal_mode END,
        meal_config_source=CASE WHEN p.meal_config_source='LEGACY_BACKFILL' THEN 'INHERITED' ELSE p.meal_config_source END,
        meal_override_by=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_override_by ELSE NULL END,
        meal_override_at=CASE WHEN p.meal_config_source='DAY_OVERRIDE' THEN meal_override_at ELSE NULL END WHERE id=p_plan_id;
    END IF;
    IF p_payload->'capabilities' ? 'PARTICIPANT_TRANSITION' AND (p.participant_transition_config_source<>'LEGACY_BACKFILL' OR p_payload->>'legacyTreatment'='ADOPT_GENERAL_AS_INHERITED') THEN
      UPDATE public.plans SET participant_transition_baseline_minutes=g.default_participant_transition_minutes,
        participant_transition_minutes=CASE WHEN p.participant_transition_config_source='DAY_OVERRIDE' THEN participant_transition_minutes ELSE g.default_participant_transition_minutes END,
        participant_transition_config_source=CASE WHEN p.participant_transition_config_source='LEGACY_BACKFILL' THEN 'INHERITED' ELSE p.participant_transition_config_source END,
        participant_transition_override_by=CASE WHEN p.participant_transition_config_source='DAY_OVERRIDE' THEN participant_transition_override_by ELSE NULL END,
        participant_transition_override_at=CASE WHEN p.participant_transition_config_source='DAY_OVERRIDE' THEN participant_transition_override_at ELSE NULL END WHERE id=p_plan_id;
    END IF;
  ELSE RAISE EXCEPTION 'INVALID_OPERATION'; END IF;

  -- Re-lock/read after mutation and reject a server candidate built for any
  -- different effective workday/meal state. Contestant values are never inferred.
  SELECT * INTO p FROM public.plans WHERE id=p_plan_id;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_candidate_replay#>'{authorities,plan_workday}') w
    WHERE w#>>'{workDay,start}'=p.work_start AND w#>>'{workDay,end}'=p.work_end
      AND w->>'mealMode'=p.meal_mode
      AND (w#>>'{mealWindow,start}'=p.meal_start OR w#>>'{meal,start}'=p.meal_start)
      AND (w#>>'{mealWindow,end}'=p.meal_end OR w#>>'{meal,end}'=p.meal_end)
      AND (w->>'defaultParticipantTransitionMinutes')::int=p.participant_transition_minutes)
    THEN RAISE EXCEPTION 'STALE_CONFIG_CANDIDATE'; END IF;

  INSERT INTO public.plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json,created_by)
  VALUES(p_plan_id,parent_revision,p_operation,p_candidate_identity->>'configurationFingerprint',p_candidate_identity,p_candidate_replay,p_diff,p_actor)
  RETURNING id INTO new_revision;
  UPDATE public.plans SET current_config_revision_id=new_revision WHERE id=p_plan_id;
  UPDATE public.assisted_planning_sessions SET current_config_revision_id=new_revision,draft_validation_id=NULL,updated_at=now()
    WHERE plan_id=p_plan_id AND status='ACTIVE';
  RETURN new_revision;
END $$;


-- Preserve the certified clean gate and carry quantified continuity into Draft/Stage.
-- ASST-006: certify an applied ASST-005 proposal without claiming full-day completeness.
CREATE OR REPLACE FUNCTION public.assisted_record_proposal_clean_validation(
  p_plan_id integer, p_expected_fingerprint text, p_expected_base bigint,
  p_expected_config bigint
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  s public.assisted_planning_sessions%rowtype;
  r public.planning_runs%rowtype;
  result jsonb;
  evidence jsonb;
  proposal_run_id bigint;
  validation_id bigint;
  report jsonb;
BEGIN
  SELECT * INTO s FROM public.assisted_planning_sessions
    WHERE plan_id=p_plan_id AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF s.draft_fingerprint<>p_expected_fingerprint THEN RAISE EXCEPTION 'STALE_DRAFT'; END IF;
  IF s.draft_base_stage_id IS DISTINCT FROM p_expected_base THEN RAISE EXCEPTION 'STALE_BASE_STAGE'; END IF;
  IF s.current_config_revision_id<>p_expected_config THEN RAISE EXCEPTION 'STALE_CONFIG_REVISION'; END IF;

  IF jsonb_typeof(s.draft_scope_json) IS DISTINCT FROM 'object'
    OR coalesce(s.draft_scope_json->>'proposalRunId','') !~ '^[1-9][0-9]*$'
    OR jsonb_typeof(s.draft_scope_json->'resolvedTaskIds') IS DISTINCT FROM 'array'
    OR jsonb_typeof(s.draft_scope_json->'includePrerequisites') IS DISTINCT FROM 'boolean'
  THEN RAISE EXCEPTION 'VALIDATION_REQUIRED'; END IF;
  proposal_run_id := (s.draft_scope_json->>'proposalRunId')::bigint;

  SELECT * INTO r FROM public.planning_runs WHERE id=proposal_run_id;
  IF NOT FOUND OR r.plan_id<>p_plan_id OR r.execution_kind<>'ASSISTED_SCOPE'
    OR r.assisted_session_id<>s.id OR r.base_stage_id IS DISTINCT FROM s.draft_base_stage_id
    OR r.config_revision_id<>s.current_config_revision_id OR r.status<>'success'
    OR r.assisted_result_json IS NULL
  THEN RAISE EXCEPTION 'VALIDATION_REQUIRED'; END IF;

  result := r.assisted_result_json;
  evidence := result->'evidence';
  IF r.result_fingerprint IS NULL
    OR r.result_fingerprint<>encode(extensions.digest(convert_to(result::text,'UTF8'),'sha256'),'hex')
    OR result->>'contractVersion' IS DISTINCT FROM '1' OR result->>'outcome' IS DISTINCT FROM 'PROPOSAL'
    OR jsonb_typeof(result->'proposal') IS DISTINCT FROM 'array'
    OR jsonb_array_length(result->'proposal')=0
    OR jsonb_typeof(result->'proposedDraftSnapshot') IS DISTINCT FROM 'object'
    OR result->'proposedDraftSnapshot' IS DISTINCT FROM s.draft_snapshot_json
    OR result->>'proposedDraftFingerprint' IS DISTINCT FROM s.draft_fingerprint
    OR result->'scopeTaskIds' IS DISTINCT FROM r.scope_task_ids_json
    OR result->'scopeTaskIds' IS DISTINCT FROM s.draft_scope_json->'resolvedTaskIds'
    OR result->'includePrerequisites' IS DISTINCT FROM to_jsonb(r.include_prerequisites)
    OR result->'includePrerequisites' IS DISTINCT FROM s.draft_scope_json->'includePrerequisites'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(result->'proposal') item
      WHERE jsonb_typeof(item) IS DISTINCT FROM 'object' OR coalesce(item->>'taskId','') !~ '^[1-9][0-9]*$'
      OR coalesce(item->>'startPlanned','')='' OR coalesce(item->>'endPlanned','')=''
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.scope_task_ids_json) scope_id
        WHERE scope_id #>> '{}' = item->>'taskId'))
    OR (SELECT count(*) FROM jsonb_array_elements(result->'proposal'))
      <> (SELECT count(DISTINCT item->>'taskId') FROM jsonb_array_elements(result->'proposal') item)
  THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;

  IF jsonb_typeof(evidence) IS DISTINCT FROM 'object'
    OR evidence->>'proposalCount' IS DISTINCT FROM '1'
    OR evidence->>'completeForScope' IS DISTINCT FROM 'true'
    OR evidence->>'protectedPlacementsPreserved' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'RUN_RESULT_INVALID'; END IF;
  IF evidence->>'hardValid' IS DISTINCT FROM 'true' OR evidence->>'requiredValid' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'VALIDATION_NOT_ACCEPTABLE'; END IF;

  report := jsonb_build_object(
    'mode','PROPOSAL_CERTIFIED_CLEAN_V1', 'proposalRunId',proposal_run_id,
    'scopeTaskIds',r.scope_task_ids_json, 'includePrerequisites',r.include_prerequisites,
    'hardAssessment','CLEAN', 'requiredAssessment','CLEAN',
    'preferredAssessment',CASE WHEN evidence ? 'operationContinuity' THEN 'OPERATION_CONTINUITY_QUANTIFIED' ELSE 'NOT_CLASSIFIED' END)
    || CASE WHEN evidence ? 'operationContinuity' THEN jsonb_build_object('operationContinuity',evidence->'operationContinuity') ELSE '{}'::jsonb END;
  INSERT INTO public.planning_stage_validations(plan_id,session_id,base_stage_id,draft_fingerprint,
    config_revision_id,hard_count,required_count,preferred_count,report_json)
  VALUES(p_plan_id,s.id,s.draft_base_stage_id,s.draft_fingerprint,s.current_config_revision_id,
    0,0,(SELECT count(*) FROM jsonb_array_elements(coalesce(evidence->'operationContinuity','[]'::jsonb)) g WHERE g->>'policy'='PREFERRED' AND (g->>'gapMinutes')::integer>0),report) RETURNING id INTO validation_id;
  UPDATE public.assisted_planning_sessions SET draft_validation_id=validation_id,updated_at=now() WHERE id=s.id;
  RETURN validation_id;
END $$;
REVOKE ALL ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) FROM anon;
REVOKE ALL ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) FROM authenticated;
REVOKE ALL ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) FROM service_role;
GRANT EXECUTE ON FUNCTION public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint) TO service_role;

-- Assisted workflow mutations are server-only. Keep authenticated reads governed
-- by the existing RLS policies, but close the historical direct-write grants from 077.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.plan_config_revisions,
  public.assisted_planning_sessions,
  public.assisted_planning_stages,
  public.planning_stage_validations,
  public.planning_accepted_exceptions
FROM authenticated;
REVOKE UPDATE (archived_at) ON TABLE public.assisted_planning_stages FROM authenticated;
REVOKE UPDATE (status, resolved_at) ON TABLE public.planning_accepted_exceptions FROM authenticated;
