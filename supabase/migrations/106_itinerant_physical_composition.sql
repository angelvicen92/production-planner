-- U04a: reusable physical compositions. No backfill or historical ID inference.
ALTER TABLE public.itinerant_teams
  ADD COLUMN revision integer NOT NULL DEFAULT 0,
  ADD COLUMN availability_windows jsonb,
  ADD COLUMN transition_minutes integer CHECK (transition_minutes BETWEEN 0 AND 1440);
CREATE TABLE public.itinerant_team_members (
  team_id bigint NOT NULL REFERENCES public.itinerant_teams(id) ON DELETE CASCADE,
  resource_item_id bigint NOT NULL REFERENCES public.resource_items(id) ON DELETE RESTRICT,
  PRIMARY KEY(team_id,resource_item_id)
);
ALTER TABLE public.plans ADD COLUMN itinerant_composition_version integer CHECK (itinerant_composition_version=1);
CREATE TABLE public.plan_itinerant_unit_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id integer NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  source_team_id bigint NOT NULL REFERENCES public.itinerant_teams(id) ON DELETE RESTRICT,
  source_revision integer NOT NULL CHECK (source_revision>=0),
  code text NOT NULL, name text NOT NULL,
  availability_windows jsonb,
  transition_minutes integer CHECK (transition_minutes BETWEEN 0 AND 1440),
  members jsonb NOT NULL CHECK (jsonb_typeof(members)='array' AND jsonb_array_length(members)>0),
  UNIQUE(plan_id,source_team_id)
);
-- The catalog is written through actor-checked service RPCs. Historical broad
-- authenticated policies must not provide a second direct Data API write path.
REVOKE ALL ON public.itinerant_teams FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.itinerant_teams_id_seq FROM PUBLIC,anon,authenticated;
ALTER TABLE public.itinerant_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_itinerant_unit_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.itinerant_team_members,public.plan_itinerant_unit_snapshots FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.itinerant_team_members TO service_role;
GRANT SELECT,INSERT,DELETE ON public.plan_itinerant_unit_snapshots TO service_role;
REVOKE ALL ON SEQUENCE public.plan_itinerant_unit_snapshots_id_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE,SELECT ON SEQUENCE public.plan_itinerant_unit_snapshots_id_seq TO service_role;

CREATE FUNCTION public.validate_itinerant_windows(p_windows jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN p_windows IS NULL THEN true
   WHEN jsonb_typeof(p_windows)<>'array' THEN false
   ELSE jsonb_array_length(p_windows)>0 AND NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(p_windows) w WHERE jsonb_typeof(w)<>'object'
       OR NOT (w ? 'start' AND w ? 'end') OR w - 'start' - 'end' <> '{}'::jsonb
       OR coalesce(w->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR coalesce(w->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR w->>'start'>=w->>'end') END
$$;
ALTER TABLE public.itinerant_teams ADD CHECK(public.validate_itinerant_windows(availability_windows));
ALTER TABLE public.plan_itinerant_unit_snapshots ADD CHECK(public.validate_itinerant_windows(availability_windows));

CREATE FUNCTION public.preserve_itinerant_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='plans' THEN
   IF NEW.itinerant_composition_version IS DISTINCT FROM OLD.itinerant_composition_version THEN
     RAISE EXCEPTION 'ITINERANT_SNAPSHOT_IMMUTABLE';
   END IF;
   RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' OR EXISTS(SELECT 1 FROM public.plans WHERE id=OLD.plan_id) THEN
   RAISE EXCEPTION 'ITINERANT_SNAPSHOT_IMMUTABLE';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER preserve_itinerant_snapshot BEFORE UPDATE OR DELETE ON public.plan_itinerant_unit_snapshots
 FOR EACH ROW EXECUTE FUNCTION public.preserve_itinerant_snapshot();
CREATE TRIGGER preserve_itinerant_version BEFORE UPDATE ON public.plans
 FOR EACH ROW EXECUTE FUNCTION public.preserve_itinerant_snapshot();

CREATE FUNCTION public.guard_itinerant_team_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.task_templates t WHERE t.itinerant_team_id=OLD.id
   OR coalesce(t.rules_json,'{}'::jsonb)->'itinerantTeamAllowedIds' @> jsonb_build_array(OLD.id))
   OR EXISTS(SELECT 1 FROM public.staff_assignment_defaults WHERE itinerant_team_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.plan_staff_assignments WHERE itinerant_team_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.plan_breaks WHERE itinerant_team_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.plan_task_template_snapshots t WHERE t.itinerant_team_id=OLD.id
     OR t.allowed_itinerant_team_ids @> jsonb_build_array(OLD.id)) THEN
   RAISE EXCEPTION 'ITINERANT_TEAM_REFERENCED' USING ERRCODE='23503';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER guard_itinerant_team_delete BEFORE DELETE ON public.itinerant_teams
 FOR EACH ROW EXECUTE FUNCTION public.guard_itinerant_team_delete();

CREATE FUNCTION public.save_itinerant_composition(p_id bigint,p_actor uuid,p_expected_revision integer,p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.itinerant_teams%rowtype; resource_ids bigint[]; windows jsonb;
BEGIN
 PERFORM 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
   WHERE u.user_id=p_actor AND r.key='admin' FOR SHARE OF u;
 IF NOT FOUND THEN RAISE EXCEPTION 'ITINERANT_FORBIDDEN'; END IF;
 IF p_value IS NULL OR jsonb_typeof(p_value)<>'object' OR coalesce(btrim(p_value->>'code'),'')=''
   OR coalesce(btrim(p_value->>'name'),'')='' OR jsonb_typeof(p_value->'resourceItemIds') IS DISTINCT FROM 'array'
   OR jsonb_typeof(p_value->'isActive') IS DISTINCT FROM 'boolean'
   OR NOT(p_value ? 'availabilityWindows' AND p_value ? 'transitionMinutes') THEN RAISE EXCEPTION 'ITINERANT_INVALID'; END IF;
 IF jsonb_typeof(p_value->'transitionMinutes') NOT IN ('number','null')
   OR (p_value->>'transitionMinutes' IS NOT NULL AND (p_value->>'transitionMinutes' !~ '^[0-9]+$'
     OR (p_value->>'transitionMinutes')::numeric>1440))
   OR (p_value ? 'orderIndex' AND (jsonb_typeof(p_value->'orderIndex')<>'number'
     OR p_value->>'orderIndex' !~ '^-?[0-9]+$'))
   THEN RAISE EXCEPTION 'ITINERANT_INVALID'; END IF;
 windows:=nullif(p_value->'availabilityWindows','null');
 IF NOT public.validate_itinerant_windows(windows) THEN RAISE EXCEPTION 'ITINERANT_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_value->'resourceItemIds') v
   WHERE jsonb_typeof(v)<>'number' OR v::text !~ '^[1-9][0-9]*$') THEN RAISE EXCEPTION 'ITINERANT_INVALID'; END IF;
 SELECT array_agg(v::bigint ORDER BY v::bigint) INTO resource_ids FROM jsonb_array_elements_text(p_value->'resourceItemIds') v;
 IF resource_ids IS NULL OR cardinality(resource_ids)<>(SELECT count(DISTINCT x) FROM unnest(resource_ids) x)
   THEN RAISE EXCEPTION 'ITINERANT_INVALID'; END IF;
 -- Serialize both saves and snapshots; member sets and revisions stay atomic.
 LOCK TABLE public.itinerant_teams IN SHARE ROW EXCLUSIVE MODE;
 PERFORM 1 FROM public.resource_items WHERE id=ANY(resource_ids) AND is_active FOR SHARE;
 IF (SELECT count(*) FROM public.resource_items WHERE id=ANY(resource_ids) AND is_active)<>cardinality(resource_ids)
   THEN RAISE EXCEPTION 'ITINERANT_INVALID'; END IF;
 IF p_id IS NULL THEN
   INSERT INTO public.itinerant_teams(code,name,is_active,order_index,availability_windows,transition_minutes)
     VALUES(btrim(p_value->>'code'),btrim(p_value->>'name'),(p_value->>'isActive')::boolean,
       coalesce((p_value->>'orderIndex')::integer,0),windows,(p_value->>'transitionMinutes')::integer) RETURNING * INTO saved;
 ELSE
   SELECT * INTO saved FROM public.itinerant_teams WHERE id=p_id FOR UPDATE;
   IF saved.id IS NULL OR saved.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'ITINERANT_CONFLICT'; END IF;
   IF saved.code<>p_value->>'code' THEN RAISE EXCEPTION 'ITINERANT_INVALID'; END IF;
   UPDATE public.itinerant_teams SET name=btrim(p_value->>'name'),is_active=(p_value->>'isActive')::boolean,
     order_index=coalesce((p_value->>'orderIndex')::integer,0),availability_windows=windows,
     transition_minutes=(p_value->>'transitionMinutes')::integer,revision=revision+1
     WHERE id=p_id RETURNING * INTO saved;
   DELETE FROM public.itinerant_team_members WHERE team_id=p_id;
 END IF;
 INSERT INTO public.itinerant_team_members SELECT saved.id,x FROM unnest(resource_ids) x;
 RETURN to_jsonb(saved)||jsonb_build_object('itinerant_team_members',
   (SELECT jsonb_agg(jsonb_build_object('resource_item_id',x) ORDER BY x) FROM unnest(resource_ids) x));
END $$;

CREATE FUNCTION public.snapshot_plan_itinerant_units(p_plan_id integer,p_actor uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE day public.plans%rowtype;
BEGIN
 PERFORM 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id
   WHERE u.user_id=p_actor AND r.key IN ('admin','production') FOR SHARE OF u;
 IF NOT FOUND THEN RAISE EXCEPTION 'ITINERANT_FORBIDDEN'; END IF;
 SELECT * INTO day FROM public.plans WHERE id=p_plan_id FOR UPDATE;
 IF day.itinerant_composition_version IS DISTINCT FROM 1 OR day.planner_next_configuration IS NOT NULL
   OR day.current_config_revision_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.plan_itinerant_unit_snapshots WHERE plan_id=p_plan_id)
   THEN RAISE EXCEPTION 'ITINERANT_SNAPSHOT_IMMUTABLE'; END IF;
 LOCK TABLE public.itinerant_teams IN SHARE MODE;
 LOCK TABLE public.itinerant_team_members IN SHARE MODE;
 -- An absent or ambiguous FK mapping is a configuration error, never a guess.
 IF EXISTS(SELECT 1 FROM public.itinerant_teams t JOIN public.itinerant_team_members m ON m.team_id=t.id
   WHERE t.is_active AND (SELECT count(*) FROM public.plan_resource_items r
     WHERE r.plan_id=p_plan_id AND r.resource_item_id=m.resource_item_id)<>1) THEN
   RAISE EXCEPTION 'ITINERANT_INVALID_RESOURCE_MAPPING';
 END IF;
 INSERT INTO public.plan_itinerant_unit_snapshots(plan_id,source_team_id,source_revision,code,name,availability_windows,transition_minutes,members)
 SELECT p_plan_id,t.id,t.revision,t.code,t.name,t.availability_windows,t.transition_minutes,
   jsonb_agg(jsonb_build_object('resourceItemId',m.resource_item_id,'planResourceItemId',r.id) ORDER BY m.resource_item_id)
 FROM public.itinerant_teams t JOIN public.itinerant_team_members m ON m.team_id=t.id
 JOIN public.plan_resource_items r ON r.plan_id=p_plan_id AND r.resource_item_id=m.resource_item_id
 WHERE t.is_active GROUP BY t.id;
 -- Template snapshots keep catalog identity. Mapping is required when an
 -- actual daily task consumes a composition (buildEngineInput), so an unused
 -- legacy template cannot prevent an otherwise unrelated new day.

END $$;

REVOKE ALL ON FUNCTION public.validate_itinerant_windows(jsonb),public.preserve_itinerant_snapshot(),public.guard_itinerant_team_delete(),
 public.save_itinerant_composition(bigint,uuid,integer,jsonb),public.snapshot_plan_itinerant_units(integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_itinerant_windows(jsonb),public.save_itinerant_composition(bigint,uuid,integer,jsonb),
 public.snapshot_plan_itinerant_units(integer,uuid) TO service_role;
