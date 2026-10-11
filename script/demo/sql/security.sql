-- PREPARED ONLY. API writes use service_role after application authorization.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ DECLARE t text; BEGIN
 IF current_setting('optiplan.confirmed_demo_project',true) IS DISTINCT FROM 'dyqusivzgxebkxkwohwn' THEN RAISE EXCEPTION 'WRONG_DEMO_PROJECT'; END IF;
 IF coalesce(current_setting('optiplan.security_approved',true),'') <> 'yes' THEN RAISE EXCEPTION 'SECURITY_APPROVAL_REQUIRED'; END IF;
 IF coalesce(current_setting('optiplan.backup_sha256',true),'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'VERIFIED_BACKUP_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN RAISE EXCEPTION 'SERVER_ROLE_MUST_BYPASS_RLS'; END IF;
 FOREACH t IN ARRAY ARRAY['spaces','daily_tasks','resource_pools','plan_resource_pools','resource_types','resource_items','plan_resource_items','space_resource_defaults','plan_space_resource_assignments','zone_resource_type_defaults','space_resource_type_defaults','plan_zone_resource_type_requirements','plan_space_resource_type_requirements','plan_vocal_coach_rules','vocal_coach_rules'] LOOP
  -- Restrictive policies bound any existing permissive policy, including TO PUBLIC.
  EXECUTE format('CREATE POLICY a2_api_read_boundary ON public.%I AS RESTRICTIVE FOR SELECT TO PUBLIC USING (public.has_role(''admin'') OR public.has_role(''production'') OR public.has_role(''aux'') OR public.has_role(''viewer''))',t);
  EXECUTE format('CREATE POLICY a2_authorized_read ON public.%I FOR SELECT TO authenticated USING (public.has_role(''admin'') OR public.has_role(''production'') OR public.has_role(''aux'') OR public.has_role(''viewer''))',t);
  EXECUTE format('CREATE POLICY a2_api_insert_boundary ON public.%I AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (false)',t);
  EXECUTE format('CREATE POLICY a2_api_update_boundary ON public.%I AS RESTRICTIVE FOR UPDATE TO PUBLIC USING (false) WITH CHECK (false)',t);
  EXECUTE format('CREATE POLICY a2_api_delete_boundary ON public.%I AS RESTRICTIVE FOR DELETE TO PUBLIC USING (false)',t);
  EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated',t);
  -- No grants to service_role are widened: preserve its established application boundary.
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
