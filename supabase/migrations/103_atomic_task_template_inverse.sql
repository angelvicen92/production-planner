-- Global catalog only: existing day snapshots and planning are never updated.
-- CLI-generated migration renamed to the repository's forward-only NNN sequence.
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.bump_task_template_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS task_template_revision ON public.task_templates;
CREATE TRIGGER task_template_revision BEFORE UPDATE ON public.task_templates
FOR EACH ROW EXECUTE FUNCTION public.bump_task_template_revision();
REVOKE ALL ON FUNCTION public.bump_task_template_revision() FROM PUBLIC, anon, authenticated;

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
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE NOT k=ANY(ARRAY['participant_margin_before_minutes','participant_margin_after_minutes','name','requires_auxiliar','requires_coach','requires_presenter','exclusive_auxiliar','setup_id','rules_json','resource_requirements','default_duration','default_cameras','auto_create_on_contestant_create','abbrev','default_comment1_color','default_comment2_color','ui_color','ui_color_secondary','depends_on_template_ids','has_dependency','depends_on_template_id','itinerant_team_requirement','itinerant_team_id','zone_id','space_id'])) THEN
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
