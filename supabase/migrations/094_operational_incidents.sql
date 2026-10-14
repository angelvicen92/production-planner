-- P3: operational facts only. No writes to tasks, planning, locks or clock.
-- Idempotent DDL; commands are service-only invokers and verify actor authority.
CREATE TABLE IF NOT EXISTS public.operational_incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id bigint NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 type text NOT NULL CHECK(type IN ('delay','resource_unavailable','space_blocked','contestant_missing','task_interrupted','editorial_change','technical','priority_change','meal_break','other')),
 severity text NOT NULL CHECK(severity IN ('info','warn','critical')),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 4000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','escalated','resolved')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 author_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 resolved_at timestamptz, resolution_note text,
 task_id bigint REFERENCES public.daily_tasks(id) ON DELETE RESTRICT,
 contestant_id bigint REFERENCES public.contestants(id) ON DELETE RESTRICT,
 zone_id bigint REFERENCES public.zones(id) ON DELETE RESTRICT,
 space_id bigint REFERENCES public.spaces(id) ON DELETE RESTRICT,
 resource_id bigint REFERENCES public.plan_resource_items(id) ON DELETE RESTRICT,
 responsible_id bigint REFERENCES public.staff_people(id) ON DELETE RESTRICT,
 cause text CHECK(length(cause)<=4000), context text CHECK(length(context)<=4000),
 CHECK((status='resolved')=(resolved_at IS NOT NULL)),
 CHECK(status<>'resolved' OR (resolution_note IS NOT NULL AND length(btrim(resolution_note)) BETWEEN 1 AND 4000)),
 UNIQUE(plan_id,author_id,request_id), UNIQUE(id,plan_id)
);
CREATE INDEX IF NOT EXISTS operational_incidents_day_state_date ON public.operational_incidents(plan_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS operational_incidents_day_date ON public.operational_incidents(plan_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.operational_incident_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 incident_id uuid NOT NULL REFERENCES public.operational_incidents(id) ON DELETE RESTRICT,
 plan_id bigint NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
 version integer NOT NULL, action text NOT NULL CHECK(action IN ('created','updated','resolved','reopened','escalated')),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, actor_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), note text,
 snapshot jsonb NOT NULL, UNIQUE(incident_id,version),
 FOREIGN KEY(incident_id,plan_id) REFERENCES public.operational_incidents(id,plan_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS operational_incident_events_day_date ON public.operational_incident_events(plan_id,created_at);
ALTER TABLE public.operational_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_incident_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operational_incidents,public.operational_incident_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.operational_incidents,public.operational_incident_events TO authenticated,service_role;
GRANT INSERT ON public.operational_incidents TO service_role;
GRANT UPDATE(type,severity,description,status,version,updated_at,resolved_at,resolution_note,task_id,contestant_id,zone_id,space_id,resource_id,responsible_id,cause,context) ON public.operational_incidents TO service_role;
GRANT INSERT ON public.operational_incident_events TO service_role;
REVOKE ALL ON SEQUENCE public.operational_incident_events_id_seq FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SEQUENCE public.operational_incident_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.incident_role(p_actor uuid) RETURNS text
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT r.key FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id WHERE u.user_id=p_actor;
$$;
CREATE OR REPLACE FUNCTION public.incident_actor_name(p_actor uuid,p_fallback text DEFAULT NULL) RETURNS text
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT s.name FROM public.user_entity_links l JOIN public.staff_people s ON l.entity_type='staff_person' AND s.id=l.entity_id WHERE l.user_id=p_actor AND l.is_primary AND s.is_active ORDER BY l.id LIMIT 1),
  (SELECT i.name FROM public.user_entity_links l JOIN public.resource_items i ON l.entity_type='resource_item' AND i.id=l.entity_id WHERE l.user_id=p_actor AND l.is_primary AND i.is_active ORDER BY l.id LIMIT 1),
  nullif(left(btrim(p_fallback),320),''),'Operador sin nombre vinculado');
$$;
CREATE OR REPLACE FUNCTION public.incident_visible(p_plan bigint,p_task bigint,p_actor uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(public.incident_role(p_actor) IN ('admin','production','viewer') OR
  (public.incident_role(p_actor)='aux' AND EXISTS(SELECT 1 FROM public.daily_tasks WHERE id=p_task AND plan_id=p_plan) AND public.execution_task_scope(p_task,p_actor)),false);
$$;
CREATE OR REPLACE FUNCTION public.incident_manageable(p_plan bigint,p_task bigint,p_actor uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(public.incident_role(p_actor) IN ('admin','production') OR
  (public.incident_role(p_actor)='aux' AND EXISTS(SELECT 1 FROM public.daily_tasks WHERE id=p_task AND plan_id=p_plan) AND public.execution_task_scope(p_task,p_actor)),false);
$$;
-- Only this private, fixed-identity read predicate needs definer privileges:
-- authenticated cannot read the service-only daily snapshots used by scope.
CREATE SCHEMA IF NOT EXISTS incident_private;
REVOKE ALL ON SCHEMA incident_private FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA incident_private TO authenticated;
CREATE OR REPLACE FUNCTION incident_private.visible(p_plan bigint,p_task bigint) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND public.incident_visible(p_plan,p_task,(SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION incident_private.visible(bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION incident_private.visible(bigint,bigint) TO authenticated;
DROP POLICY IF EXISTS incidents_read_scope ON public.operational_incidents;
CREATE POLICY incidents_read_scope ON public.operational_incidents FOR SELECT TO authenticated
 USING(incident_private.visible(plan_id,task_id));
DROP POLICY IF EXISTS incident_events_read_scope ON public.operational_incident_events;
CREATE POLICY incident_events_read_scope ON public.operational_incident_events FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.operational_incidents i WHERE i.id=incident_id AND i.plan_id=operational_incident_events.plan_id) AND incident_private.visible(plan_id,(snapshot->>'taskId')::bigint));

CREATE OR REPLACE FUNCTION public.incident_validate_links() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.daily_tasks%rowtype; z bigint;
BEGIN
 IF NEW.task_id IS NOT NULL THEN
  SELECT * INTO t FROM public.daily_tasks WHERE id=NEW.task_id AND plan_id=NEW.plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INCIDENT_INVALID_LINK'; END IF;
  SELECT zone_id INTO z FROM public.plan_space_settings WHERE plan_id=NEW.plan_id AND space_id=t.space_id;
  IF (NEW.space_id IS NOT NULL AND NEW.space_id IS DISTINCT FROM t.space_id)
   OR (NEW.zone_id IS NOT NULL AND NEW.zone_id IS DISTINCT FROM coalesce(t.zone_id,z))
   OR (NEW.contestant_id IS NOT NULL AND NEW.contestant_id IS DISTINCT FROM t.contestant_id) THEN RAISE EXCEPTION 'INCIDENT_INVALID_LINK'; END IF;
 END IF;
 IF NEW.contestant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.contestants c WHERE c.id=NEW.contestant_id AND
  (c.plan_id=NEW.plan_id OR (c.plan_id IS NULL AND EXISTS(SELECT 1 FROM public.daily_tasks dt WHERE dt.plan_id=NEW.plan_id AND dt.contestant_id=c.id)))) THEN RAISE EXCEPTION 'INCIDENT_INVALID_LINK'; END IF;
 IF NEW.zone_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.plan_zone_settings WHERE plan_id=NEW.plan_id AND zone_id=NEW.zone_id) THEN RAISE EXCEPTION 'INCIDENT_INVALID_LINK'; END IF;
 IF NEW.space_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.plan_space_settings WHERE plan_id=NEW.plan_id AND space_id=NEW.space_id AND (NEW.zone_id IS NULL OR zone_id=NEW.zone_id)) THEN RAISE EXCEPTION 'INCIDENT_INVALID_LINK'; END IF;
 IF NEW.resource_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.plan_resource_items WHERE id=NEW.resource_id AND plan_id=NEW.plan_id) THEN RAISE EXCEPTION 'INCIDENT_INVALID_LINK'; END IF;
 IF NEW.resource_id IS NOT NULL AND NEW.task_id IS NOT NULL AND NOT (
  coalesce(t.assigned_resource_ids,'[]'::jsonb) @> jsonb_build_array(NEW.resource_id)
  OR EXISTS(SELECT 1 FROM public.plan_space_resource_assignments WHERE plan_id=NEW.plan_id AND space_id=t.space_id AND plan_resource_item_id=NEW.resource_id)
  OR EXISTS(SELECT 1 FROM public.plan_zone_resource_assignments WHERE plan_id=NEW.plan_id AND zone_id=coalesce(t.zone_id,z) AND plan_resource_item_id=NEW.resource_id)
 ) THEN RAISE EXCEPTION 'INCIDENT_INVALID_LINK'; END IF;
 IF NEW.responsible_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.plan_staff_assignments a JOIN public.staff_people s ON s.id=a.staff_person_id AND s.is_active WHERE a.plan_id=NEW.plan_id AND a.staff_person_id=NEW.responsible_id) THEN RAISE EXCEPTION 'INCIDENT_INVALID_LINK'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS incident_validate_links ON public.operational_incidents;
CREATE TRIGGER incident_validate_links BEFORE INSERT OR UPDATE ON public.operational_incidents FOR EACH ROW EXECUTE FUNCTION public.incident_validate_links();

CREATE OR REPLACE FUNCTION public.incident_document(i public.operational_incidents,p_actor uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',i.id,'planId',i.plan_id,'type',i.type,'severity',i.severity,'description',i.description,'status',i.status,'version',i.version,
  'authorId',i.author_id,'authorName',i.author_name,'createdAt',i.created_at,'updatedAt',i.updated_at,'resolvedAt',i.resolved_at,'resolutionNote',i.resolution_note,
  'taskId',i.task_id,'contestantId',i.contestant_id,'zoneId',i.zone_id,'spaceId',i.space_id,'resourceId',i.resource_id,'responsibleId',i.responsible_id,'cause',i.cause,'context',i.context,
  'canManage',public.incident_manageable(i.plan_id,i.task_id,p_actor),
  'taskName',(SELECT name FROM public.task_templates WHERE id=(SELECT template_id FROM public.daily_tasks WHERE id=i.task_id)),
  'contestantName',(SELECT name FROM public.contestants WHERE id=i.contestant_id),'zoneName',(SELECT name FROM public.plan_zone_settings WHERE plan_id=i.plan_id AND zone_id=i.zone_id),
  'spaceName',(SELECT name FROM public.plan_space_settings WHERE plan_id=i.plan_id AND space_id=i.space_id),'resourceName',(SELECT name FROM public.plan_resource_items WHERE id=i.resource_id),
  'responsibleName',(SELECT name FROM public.staff_people WHERE id=i.responsible_id));
$$;

CREATE OR REPLACE FUNCTION public.incident_query(p_plan bigint,p_actor uuid,p_id uuid DEFAULT NULL,p_context boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE role_key text:=public.incident_role(p_actor); i public.operational_incidents%rowtype;
BEGIN
 IF role_key IS NULL OR role_key NOT IN ('admin','production','aux','viewer') THEN RAISE EXCEPTION 'INCIDENT_FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plans WHERE id=p_plan) THEN RAISE EXCEPTION 'INCIDENT_NOT_FOUND'; END IF;
 IF p_context THEN
  RETURN jsonb_build_object('role',role_key,'canCreate',role_key IN ('admin','production') OR (role_key='aux' AND EXISTS(SELECT 1 FROM public.daily_tasks t WHERE t.plan_id=p_plan AND public.execution_task_scope(t.id,p_actor))),
   'tasks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',tt.name||coalesce(' · '||c.name,''),'spaceId',t.space_id,'zoneId',coalesce(t.zone_id,s.zone_id),'contestantId',t.contestant_id,'canReport',public.incident_manageable(p_plan,t.id,p_actor)) ORDER BY t.id)
    FROM public.daily_tasks t JOIN public.task_templates tt ON tt.id=t.template_id LEFT JOIN public.contestants c ON c.id=t.contestant_id LEFT JOIN public.plan_space_settings s ON s.plan_id=t.plan_id AND s.space_id=t.space_id WHERE t.plan_id=p_plan),'[]'::jsonb),
   'zones',coalesce((SELECT jsonb_agg(jsonb_build_object('id',zone_id,'name',name) ORDER BY name) FROM public.plan_zone_settings WHERE plan_id=p_plan),'[]'::jsonb),
   'spaces',coalesce((SELECT jsonb_agg(jsonb_build_object('id',space_id,'name',name,'zoneId',zone_id) ORDER BY name) FROM public.plan_space_settings WHERE plan_id=p_plan),'[]'::jsonb),
   'contestants',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) ORDER BY c.name) FROM public.contestants c WHERE c.plan_id=p_plan OR (c.plan_id IS NULL AND EXISTS(SELECT 1 FROM public.daily_tasks t WHERE t.plan_id=p_plan AND t.contestant_id=c.id))),'[]'::jsonb),
   'resources',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM public.plan_resource_items WHERE plan_id=p_plan),'[]'::jsonb),
   'responsibles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.name) FROM public.staff_people s WHERE s.is_active AND EXISTS(SELECT 1 FROM public.plan_staff_assignments a WHERE a.plan_id=p_plan AND a.staff_person_id=s.id)),'[]'::jsonb));
 END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO i FROM public.operational_incidents WHERE id=p_id AND plan_id=p_plan;
  IF NOT FOUND THEN RAISE EXCEPTION 'INCIDENT_NOT_FOUND'; END IF;
  IF NOT public.incident_visible(p_plan,i.task_id,p_actor) THEN RAISE EXCEPTION 'INCIDENT_FORBIDDEN'; END IF;
  RETURN jsonb_build_object('incident',public.incident_document(i,p_actor),'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'version',e.version,'action',e.action,'actorName',e.actor_name,'createdAt',e.created_at,'note',e.note,'snapshot',e.snapshot) ORDER BY e.version) FROM public.operational_incident_events e WHERE incident_id=p_id AND public.incident_visible(p_plan,(e.snapshot->>'taskId')::bigint,p_actor)),'[]'::jsonb));
 END IF;
 RETURN coalesce((SELECT jsonb_agg(public.incident_document(r,p_actor) ORDER BY r.created_at DESC,r.id) FROM public.operational_incidents r WHERE r.plan_id=p_plan AND public.incident_visible(p_plan,r.task_id,p_actor)),'[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.incident_command(p_plan bigint,p_actor uuid,p_action text,p_fields jsonb,p_id uuid DEFAULT NULL,p_version integer DEFAULT NULL,p_actor_label text DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE i public.operational_incidents%rowtype; role_key text:=public.incident_role(p_actor); event_action text; at_time timestamptz; memo text; original_request uuid;
BEGIN
 IF role_key IS NULL OR role_key NOT IN ('admin','production','aux') THEN RAISE EXCEPTION 'INCIDENT_FORBIDDEN'; END IF;
 IF p_action NOT IN ('create','update','resolve','reopen','escalate') OR jsonb_typeof(p_fields)<>'object' THEN RAISE EXCEPTION 'INCIDENT_INVALID'; END IF;
 -- Same ordering as execution; never writes planning. Serializes idempotent creates
 -- and protects day reference checks from concurrent catalog/plan operations.
 PERFORM 1 FROM public.plans WHERE id=p_plan FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INCIDENT_NOT_FOUND'; END IF;
 IF p_action='create' THEN
  original_request:=(p_fields->>'requestId')::uuid;
  IF original_request IS NULL THEN RAISE EXCEPTION 'INCIDENT_INVALID'; END IF;
  SELECT * INTO i FROM public.operational_incidents WHERE plan_id=p_plan AND author_id=p_actor AND request_id=original_request;
  IF FOUND THEN
   IF NOT public.incident_visible(p_plan,i.task_id,p_actor) THEN RAISE EXCEPTION 'INCIDENT_FORBIDDEN'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_each(p_fields-'requestId') f
    WHERE f.value IS DISTINCT FROM (SELECT e.snapshot->f.key FROM public.operational_incident_events e WHERE e.incident_id=i.id AND e.version=1)) THEN
    RAISE EXCEPTION 'INCIDENT_REQUEST_CONFLICT';
   END IF;
   RETURN public.incident_document(i,p_actor);
  END IF;
  i.id:=gen_random_uuid();i.plan_id:=p_plan;i.author_id:=p_actor;i.author_name:=public.incident_actor_name(p_actor,p_actor_label);i.request_id:=original_request;i.status:='open';i.version:=1;
 ELSE
  SELECT * INTO i FROM public.operational_incidents WHERE id=p_id AND plan_id=p_plan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INCIDENT_NOT_FOUND'; END IF;
  IF NOT public.incident_manageable(p_plan,i.task_id,p_actor) THEN RAISE EXCEPTION 'INCIDENT_FORBIDDEN'; END IF;
  IF p_version IS NULL OR p_version<>i.version THEN RAISE EXCEPTION 'INCIDENT_STALE'; END IF;
  i.version:=i.version+1;
 END IF;
 IF p_action IN ('create','update') THEN
  IF i.status='resolved' THEN RAISE EXCEPTION 'INCIDENT_TRANSITION'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_fields) k WHERE k NOT IN ('type','severity','description','taskId','contestantId','zoneId','spaceId','resourceId','responsibleId','cause','context','requestId')) THEN RAISE EXCEPTION 'INCIDENT_INVALID'; END IF;
  IF role_key='aux' AND p_fields ? 'responsibleId' AND (p_fields->>'responsibleId')::bigint IS DISTINCT FROM i.responsible_id THEN RAISE EXCEPTION 'INCIDENT_FORBIDDEN'; END IF;
  i.type:=coalesce(p_fields->>'type',i.type);i.severity:=coalesce(p_fields->>'severity',i.severity);i.description:=btrim(coalesce(p_fields->>'description',i.description));
  IF p_fields ? 'taskId' THEN i.task_id:=(p_fields->>'taskId')::bigint; END IF;
  IF p_fields ? 'contestantId' THEN i.contestant_id:=(p_fields->>'contestantId')::bigint; END IF;
  IF p_fields ? 'zoneId' THEN i.zone_id:=(p_fields->>'zoneId')::bigint; END IF;
  IF p_fields ? 'spaceId' THEN i.space_id:=(p_fields->>'spaceId')::bigint; END IF;
  IF p_fields ? 'resourceId' THEN i.resource_id:=(p_fields->>'resourceId')::bigint; END IF;
  IF p_fields ? 'responsibleId' THEN i.responsible_id:=(p_fields->>'responsibleId')::bigint; END IF;
  IF p_fields ? 'cause' THEN i.cause:=p_fields->>'cause'; END IF;
  IF p_fields ? 'context' THEN i.context:=p_fields->>'context'; END IF;
  event_action:=CASE WHEN p_action='create' THEN 'created' ELSE 'updated' END;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_fields) k WHERE k<>'note') THEN RAISE EXCEPTION 'INCIDENT_INVALID'; END IF;
  memo:=btrim(p_fields->>'note');IF memo IS NULL OR length(memo) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'INCIDENT_INVALID'; END IF;
  IF p_action='resolve' AND i.status IN ('open','escalated') THEN i.status:='resolved';i.resolution_note:=memo;event_action:='resolved';
  ELSIF p_action='reopen' AND i.status='resolved' THEN i.status:='open';i.resolved_at:=NULL;i.resolution_note:=NULL;event_action:='reopened';
  ELSIF p_action='escalate' AND i.status='open' THEN i.status:='escalated';event_action:='escalated';
  ELSE RAISE EXCEPTION 'INCIDENT_TRANSITION'; END IF;
 END IF;
 IF NOT public.incident_manageable(p_plan,i.task_id,p_actor) THEN RAISE EXCEPTION 'INCIDENT_FORBIDDEN'; END IF;
 at_time:=clock_timestamp();i.updated_at:=at_time;
 IF p_action='create' THEN i.created_at:=at_time; END IF;
 IF p_action='resolve' THEN i.resolved_at:=at_time; END IF;
 IF p_action='create' THEN INSERT INTO public.operational_incidents SELECT (i).*;
 ELSE UPDATE public.operational_incidents SET type=i.type,severity=i.severity,description=i.description,status=i.status,version=i.version,updated_at=i.updated_at,resolved_at=i.resolved_at,resolution_note=i.resolution_note,
  task_id=i.task_id,contestant_id=i.contestant_id,zone_id=i.zone_id,space_id=i.space_id,resource_id=i.resource_id,responsible_id=i.responsible_id,cause=i.cause,context=i.context WHERE id=i.id; END IF;
 INSERT INTO public.operational_incident_events(incident_id,plan_id,version,action,actor_id,actor_name,created_at,note,snapshot)
  VALUES(i.id,p_plan,i.version,event_action,p_actor,public.incident_actor_name(p_actor,p_actor_label),at_time,memo,public.incident_document(i,p_actor));
 RETURN public.incident_document(i,p_actor);
END;
$$;
REVOKE ALL ON FUNCTION public.incident_role(uuid), public.incident_actor_name(uuid,text),public.incident_visible(bigint,bigint,uuid),public.incident_manageable(bigint,bigint,uuid),public.incident_validate_links(),public.incident_document(public.operational_incidents,uuid),public.incident_query(bigint,uuid,uuid,boolean),public.incident_command(bigint,uuid,text,jsonb,uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.incident_role(uuid), public.incident_actor_name(uuid,text),public.incident_visible(bigint,bigint,uuid),public.incident_manageable(bigint,bigint,uuid),public.incident_validate_links(),public.incident_document(public.operational_incidents,uuid),public.incident_query(bigint,uuid,uuid,boolean),public.incident_command(bigint,uuid,text,jsonb,uuid,integer,text) TO service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime' AND NOT puballtables)
  AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='operational_incidents') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.operational_incidents;
 END IF;
END $$;
