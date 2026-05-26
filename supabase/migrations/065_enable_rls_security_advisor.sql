-- 065_enable_rls_security_advisor.sql
-- ID 002: cierre integral de alertas críticas RLS en tablas públicas.

-- 1) Asegurar RLS activo en tablas públicas sensibles/operativas.
ALTER TABLE IF EXISTS public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.zone_resource_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plan_zone_resource_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resource_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resource_item_components ENABLE ROW LEVEL SECURITY;

-- 2) plans/locks/task_templates ya tienen modelo RBAC en migraciones previas;
-- solo reforzamos ENABLE RLS arriba para cerrar casos "policy exists + rls disabled".

-- 3) Configuración global: zones/resources
DROP POLICY IF EXISTS zones_read_all_roles ON public.zones;
CREATE POLICY zones_read_all_roles
ON public.zones
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS zones_admin_all ON public.zones;
CREATE POLICY zones_admin_all
ON public.zones
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS resources_read_all_roles ON public.resources;
CREATE POLICY resources_read_all_roles
ON public.resources
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS resources_admin_all ON public.resources;
CREATE POLICY resources_admin_all
ON public.resources
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

-- 4) Operativa por plan: resource_availability
DROP POLICY IF EXISTS resource_availability_read_all_roles ON public.resource_availability;
CREATE POLICY resource_availability_read_all_roles
ON public.resource_availability
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS resource_availability_write_admin_production ON public.resource_availability;
CREATE POLICY resource_availability_write_admin_production
ON public.resource_availability
FOR ALL
TO authenticated
USING (public.has_role('admin') OR public.has_role('production'))
WITH CHECK (public.has_role('admin') OR public.has_role('production'));

-- 5) Defaults por zona (settings): lectura operativa, escritura admin.
DROP POLICY IF EXISTS zone_resource_defaults_read_all_roles ON public.zone_resource_defaults;
CREATE POLICY zone_resource_defaults_read_all_roles
ON public.zone_resource_defaults
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS zone_resource_defaults_admin_all ON public.zone_resource_defaults;
CREATE POLICY zone_resource_defaults_admin_all
ON public.zone_resource_defaults
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

-- 6) Snapshot operativo por plan/zona: admin + production escriben.
DROP POLICY IF EXISTS plan_zone_resource_assignments_read_all_roles ON public.plan_zone_resource_assignments;
CREATE POLICY plan_zone_resource_assignments_read_all_roles
ON public.plan_zone_resource_assignments
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS plan_zone_resource_assignments_write_admin_production ON public.plan_zone_resource_assignments;
CREATE POLICY plan_zone_resource_assignments_write_admin_production
ON public.plan_zone_resource_assignments
FOR ALL
TO authenticated
USING (public.has_role('admin') OR public.has_role('production'))
WITH CHECK (public.has_role('admin') OR public.has_role('production'));

-- 7) Recursos compuestos (catálogo): lectura operativa, escritura admin.
DROP POLICY IF EXISTS resource_item_components_read_all_roles ON public.resource_item_components;
CREATE POLICY resource_item_components_read_all_roles
ON public.resource_item_components
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS resource_item_components_admin_all ON public.resource_item_components;
CREATE POLICY resource_item_components_admin_all
ON public.resource_item_components
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

-- 8) Vista agregada: evaluar como invoker para evitar alertas de exposición.
ALTER VIEW IF EXISTS public.plan_summaries SET (security_invoker = true);
