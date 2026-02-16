-- 037_rbac_auth_magic_link.sql
-- RBAC base tables + strict RLS for critical tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (key IN ('admin', 'production', 'aux', 'viewer')),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id)
);

INSERT INTO public.roles (key, name)
VALUES
  ('admin', 'Administrador'),
  ('production', 'Producción'),
  ('aux', 'Auxiliar'),
  ('viewer', 'Visualizador')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(role_key TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.key = role_key
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(TEXT) TO authenticated;

DROP POLICY IF EXISTS roles_read_authenticated ON public.roles;
CREATE POLICY roles_read_authenticated
ON public.roles
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS user_roles_read_self_or_admin ON public.user_roles;
CREATE POLICY user_roles_read_self_or_admin
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role('admin'));

DROP POLICY IF EXISTS user_roles_admin_manage ON public.user_roles;
CREATE POLICY user_roles_admin_manage
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

-- Critical settings: only admin
ALTER TABLE IF EXISTS public.program_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.optimizer_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_settings_admin_all ON public.program_settings;
CREATE POLICY program_settings_admin_all
ON public.program_settings
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS optimizer_settings_admin_all ON public.optimizer_settings;
CREATE POLICY optimizer_settings_admin_all
ON public.optimizer_settings
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

-- Templates / global configuration: only admin
DROP POLICY IF EXISTS "Allow authenticated read templates" ON public.task_templates;
DROP POLICY IF EXISTS task_templates_admin_all ON public.task_templates;
CREATE POLICY task_templates_admin_all
ON public.task_templates
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

-- Plans: admin + production full access, aux/viewer read only
DROP POLICY IF EXISTS "Allow authenticated read all" ON public.plans;
DROP POLICY IF EXISTS "Allow authenticated insert plans" ON public.plans;
DROP POLICY IF EXISTS "Allow authenticated update plans" ON public.plans;
DROP POLICY IF EXISTS plans_read_all_roles ON public.plans;
DROP POLICY IF EXISTS plans_write_admin_production ON public.plans;

CREATE POLICY plans_read_all_roles
ON public.plans
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

CREATE POLICY plans_write_admin_production
ON public.plans
FOR ALL
TO authenticated
USING (public.has_role('admin') OR public.has_role('production'))
WITH CHECK (public.has_role('admin') OR public.has_role('production'));

-- Locks: admin + production full access, aux/viewer read only
DROP POLICY IF EXISTS "Allow authenticated read locks" ON public.locks;
DROP POLICY IF EXISTS "Allow authenticated write locks" ON public.locks;
DROP POLICY IF EXISTS locks_read_all_roles ON public.locks;
DROP POLICY IF EXISTS locks_write_admin_production ON public.locks;

CREATE POLICY locks_read_all_roles
ON public.locks
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

CREATE POLICY locks_write_admin_production
ON public.locks
FOR ALL
TO authenticated
USING (public.has_role('admin') OR public.has_role('production'))
WITH CHECK (public.has_role('admin') OR public.has_role('production'));
