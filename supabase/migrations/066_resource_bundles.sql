-- 066_resource_bundles.sql
-- ID 018: catálogo aditivo de resource bundles/equipos compuestos.
-- No sustituye resources, resource_items, pools, availability ni el modelo operativo actual.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.resource_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  bundle_type TEXT NOT NULL DEFAULT 'composite',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resource_bundle_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES public.resource_bundles(id) ON DELETE CASCADE,
  resource_id BIGINT REFERENCES public.resources(id) ON DELETE CASCADE,
  resource_item_id BIGINT REFERENCES public.resource_items(id) ON DELETE CASCADE,
  component_role TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT resource_bundle_components_single_source
    CHECK (num_nonnulls(resource_id, resource_item_id) = 1)
);

CREATE TABLE IF NOT EXISTS public.resource_bundle_space_affinities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES public.resource_bundles(id) ON DELETE CASCADE,
  space_id BIGINT NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  affinity_score INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT resource_bundle_space_affinities_bundle_space_key UNIQUE (bundle_id, space_id)
);

CREATE INDEX IF NOT EXISTS resource_bundles_is_active_idx
  ON public.resource_bundles(is_active);
CREATE INDEX IF NOT EXISTS resource_bundle_components_bundle_id_idx
  ON public.resource_bundle_components(bundle_id);
CREATE INDEX IF NOT EXISTS resource_bundle_components_resource_id_idx
  ON public.resource_bundle_components(resource_id)
  WHERE resource_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS resource_bundle_components_resource_item_id_idx
  ON public.resource_bundle_components(resource_item_id)
  WHERE resource_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS resource_bundle_space_affinities_bundle_id_idx
  ON public.resource_bundle_space_affinities(bundle_id);
CREATE INDEX IF NOT EXISTS resource_bundle_space_affinities_space_id_idx
  ON public.resource_bundle_space_affinities(space_id);

CREATE OR REPLACE FUNCTION public.set_resource_bundle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resource_bundles_set_updated_at ON public.resource_bundles;
CREATE TRIGGER resource_bundles_set_updated_at
BEFORE UPDATE ON public.resource_bundles
FOR EACH ROW
EXECUTE FUNCTION public.set_resource_bundle_updated_at();

ALTER TABLE public.resource_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_bundle_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_bundle_space_affinities ENABLE ROW LEVEL SECURITY;

-- Catálogo operativo: los cuatro roles autenticados pueden leer; solo admin gestiona.
-- No se concede ninguna policy ni privilegio a anon.
DROP POLICY IF EXISTS resource_bundles_read_all_roles ON public.resource_bundles;
CREATE POLICY resource_bundles_read_all_roles
ON public.resource_bundles
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS resource_bundles_admin_all ON public.resource_bundles;
CREATE POLICY resource_bundles_admin_all
ON public.resource_bundles
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS resource_bundle_components_read_all_roles ON public.resource_bundle_components;
CREATE POLICY resource_bundle_components_read_all_roles
ON public.resource_bundle_components
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS resource_bundle_components_admin_all ON public.resource_bundle_components;
CREATE POLICY resource_bundle_components_admin_all
ON public.resource_bundle_components
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS resource_bundle_space_affinities_read_all_roles ON public.resource_bundle_space_affinities;
CREATE POLICY resource_bundle_space_affinities_read_all_roles
ON public.resource_bundle_space_affinities
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS resource_bundle_space_affinities_admin_all ON public.resource_bundle_space_affinities;
CREATE POLICY resource_bundle_space_affinities_admin_all
ON public.resource_bundle_space_affinities
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));
