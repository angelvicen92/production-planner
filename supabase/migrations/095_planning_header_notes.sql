-- Informational day metadata. Never part of planner configuration/snapshots.
CREATE OR REPLACE FUNCTION public.valid_planning_header_lines(lines jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE line jsonb; total integer:=0;
BEGIN
 IF lines IS NULL OR jsonb_typeof(lines)<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(lines)>20 THEN RETURN false; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(lines) LOOP
  IF jsonb_typeof(line)<>'object' OR (line - 'label' - 'text')<>'{}'::jsonb
   OR jsonb_typeof(line->'text') IS DISTINCT FROM 'string'
   OR length(btrim(line->>'text', E' \t\n\r'))<1 OR length(line->>'text')>4000
   OR (line ? 'label' AND (jsonb_typeof(line->'label') IS DISTINCT FROM 'string' OR length(line->>'label')>80)) THEN RETURN false; END IF;
  total:=total+length(line->>'text')+coalesce(length(line->>'label'),0);
 END LOOP;
 RETURN total<=16000;
END;
$$;
CREATE TABLE IF NOT EXISTS public.plan_header_notes (
 plan_id bigint NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
 scope_type text NOT NULL CHECK(scope_type IN ('zone','space','itinerant_team')),
 scope_id bigint NOT NULL CHECK(scope_id>0),
 lines jsonb NOT NULL CHECK(public.valid_planning_header_lines(lines)),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(plan_id,scope_type,scope_id)
);
ALTER TABLE public.plan_header_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_header_notes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.plan_header_notes TO authenticated,service_role;
GRANT INSERT ON public.plan_header_notes TO service_role;
GRANT UPDATE(lines,version,updated_by,updated_at) ON public.plan_header_notes TO service_role;
DROP POLICY IF EXISTS planning_header_read ON public.plan_header_notes;
CREATE POLICY planning_header_read ON public.plan_header_notes FOR SELECT TO authenticated
 USING(public.has_role('admin') OR public.has_role('production') OR public.has_role('aux') OR public.has_role('viewer'));

CREATE OR REPLACE FUNCTION public.planning_header_scope_valid() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.scope_type='zone' AND NOT EXISTS(SELECT 1 FROM public.plan_zone_settings WHERE plan_id=NEW.plan_id AND zone_id=NEW.scope_id)
  OR NEW.scope_type='space' AND NOT EXISTS(SELECT 1 FROM public.plan_space_settings WHERE plan_id=NEW.plan_id AND space_id=NEW.scope_id)
  OR NEW.scope_type='itinerant_team' AND NOT (EXISTS(SELECT 1 FROM public.itinerant_teams WHERE id=NEW.scope_id) AND (
   EXISTS(SELECT 1 FROM public.plan_breaks WHERE plan_id=NEW.plan_id AND itinerant_team_id=NEW.scope_id)
   OR EXISTS(SELECT 1 FROM public.plan_staff_assignments WHERE plan_id=NEW.plan_id AND itinerant_team_id=NEW.scope_id AND scope_type='itinerant_team')
   OR EXISTS(SELECT 1 FROM public.plans p, jsonb_array_elements(coalesce(p.planner_next_configuration->'itinerantTeamAvailability','[]'::jsonb)) t WHERE p.id=NEW.plan_id AND t->>'itinerantTeamId'=NEW.scope_id::text)
  )) THEN RAISE EXCEPTION 'HEADER_INVALID_SCOPE'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS planning_header_scope_valid ON public.plan_header_notes;
CREATE TRIGGER planning_header_scope_valid BEFORE INSERT OR UPDATE ON public.plan_header_notes FOR EACH ROW EXECUTE FUNCTION public.planning_header_scope_valid();

CREATE OR REPLACE FUNCTION public.save_planning_header_notes(p_plan bigint,p_actor uuid,p_scope text,p_scope_id bigint,p_version integer,p_lines jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.plan_header_notes%rowtype;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id WHERE u.user_id=p_actor AND r.key IN ('admin','production')) THEN RAISE EXCEPTION 'HEADER_FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plans WHERE id=p_plan) THEN RAISE EXCEPTION 'HEADER_NOT_FOUND'; END IF;
 IF p_scope IS NULL OR p_scope NOT IN ('zone','space','itinerant_team') OR p_scope_id IS NULL OR p_scope_id<=0 OR p_version IS NULL OR p_version<0 OR p_version>=2147483647 OR NOT public.valid_planning_header_lines(p_lines) THEN RAISE EXCEPTION 'HEADER_INVALID'; END IF;
 IF p_version=0 THEN
  INSERT INTO public.plan_header_notes(plan_id,scope_type,scope_id,lines,updated_by)
   VALUES(p_plan,p_scope,p_scope_id,p_lines,p_actor) ON CONFLICT DO NOTHING RETURNING * INTO saved;
 ELSE
  UPDATE public.plan_header_notes SET lines=p_lines,version=version+1,updated_by=p_actor,updated_at=clock_timestamp()
   WHERE plan_id=p_plan AND scope_type=p_scope AND scope_id=p_scope_id AND version=p_version RETURNING * INTO saved;
 END IF;
 IF saved.plan_id IS NULL THEN RAISE EXCEPTION 'HEADER_STALE'; END IF;
 RETURN jsonb_build_object('scopeType',saved.scope_type,'scopeId',saved.scope_id,'version',saved.version,'lines',saved.lines);
END;
$$;
REVOKE ALL ON FUNCTION public.save_planning_header_notes(bigint,uuid,text,bigint,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_planning_header_notes(bigint,uuid,text,bigint,integer,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
