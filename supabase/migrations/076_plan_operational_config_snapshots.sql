-- ASST-002B: freeze the operational spatial catalog and optional bundle signal per plan.

ALTER TABLE public.plan_zone_settings
  ADD COLUMN IF NOT EXISTS config_source TEXT NOT NULL DEFAULT 'INHERITED',
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS meal_start_preferred TEXT,
  ADD COLUMN IF NOT EXISTS meal_end_preferred TEXT,
  ADD COLUMN IF NOT EXISTS grouping_level INTEGER,
  ADD COLUMN IF NOT EXISTS grouping_min_chain INTEGER,
  ADD COLUMN IF NOT EXISTS max_template_changes INTEGER,
  ADD COLUMN IF NOT EXISTS space_meal_break_minutes INTEGER;

ALTER TABLE public.plan_space_settings
  ADD COLUMN IF NOT EXISTS config_source TEXT NOT NULL DEFAULT 'INHERITED',
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS parent_space_id INTEGER,
  ADD COLUMN IF NOT EXISTS priority_level INTEGER,
  ADD COLUMN IF NOT EXISTS grouping_level INTEGER,
  ADD COLUMN IF NOT EXISTS grouping_min_chain INTEGER,
  ADD COLUMN IF NOT EXISTS grouping_apply_to_descendants BOOLEAN;

-- Migration-time catalog state is the only deterministic reconstruction available for legacy days.
UPDATE public.plan_zone_settings snapshot
SET config_source = 'LEGACY_BACKFILL',
    name = catalog.name,
    meal_start_preferred = catalog.meal_start_preferred,
    meal_end_preferred = catalog.meal_end_preferred,
    grouping_level = catalog.grouping_level,
    grouping_min_chain = catalog.grouping_min_chain,
    max_template_changes = catalog.max_template_changes,
    space_meal_break_minutes = catalog.space_meal_break_minutes
FROM public.zones catalog
WHERE catalog.id = snapshot.zone_id
  AND snapshot.name IS NULL;

UPDATE public.plan_space_settings snapshot
SET config_source = 'LEGACY_BACKFILL',
    name = catalog.name,
    parent_space_id = catalog.parent_space_id,
    priority_level = catalog.priority_level,
    grouping_level = catalog.grouping_level,
    grouping_min_chain = catalog.grouping_min_chain,
    grouping_apply_to_descendants = catalog.grouping_apply_to_descendants
FROM public.spaces catalog
WHERE catalog.id = snapshot.space_id
  AND snapshot.name IS NULL;

ALTER TABLE public.plan_zone_settings
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN grouping_level SET DEFAULT 0,
  ALTER COLUMN grouping_level SET NOT NULL,
  ALTER COLUMN grouping_min_chain SET DEFAULT 4,
  ALTER COLUMN grouping_min_chain SET NOT NULL,
  ALTER COLUMN max_template_changes SET DEFAULT 4,
  ALTER COLUMN max_template_changes SET NOT NULL,
  ADD CONSTRAINT plan_zone_settings_config_source_check CHECK (config_source IN ('INHERITED', 'LEGACY_BACKFILL', 'DAY_OVERRIDE'));

ALTER TABLE public.plan_space_settings
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN priority_level SET DEFAULT 1,
  ALTER COLUMN priority_level SET NOT NULL,
  ALTER COLUMN grouping_level SET DEFAULT 0,
  ALTER COLUMN grouping_level SET NOT NULL,
  ALTER COLUMN grouping_min_chain SET DEFAULT 4,
  ALTER COLUMN grouping_min_chain SET NOT NULL,
  ALTER COLUMN grouping_apply_to_descendants SET DEFAULT false,
  ALTER COLUMN grouping_apply_to_descendants SET NOT NULL,
  ADD CONSTRAINT plan_space_settings_config_source_check CHECK (config_source IN ('INHERITED', 'LEGACY_BACKFILL', 'DAY_OVERRIDE'));

CREATE TABLE IF NOT EXISTS public.plan_resource_bundle_snapshots (
  id BIGSERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  contract_version INTEGER NOT NULL DEFAULT 1 CHECK (contract_version = 1),
  source TEXT NOT NULL CHECK (source IN ('INHERITED', 'LEGACY_BACKFILL', 'DAY_OVERRIDE')),
  bundles JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(bundles) = 'array'),
  components JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(components) = 'array'),
  space_affinities JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(space_affinities) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_resource_bundle_snapshots_plan_key UNIQUE (plan_id)
);

INSERT INTO public.plan_resource_bundle_snapshots (plan_id, source, bundles, components, space_affinities)
SELECT p.id, 'LEGACY_BACKFILL',
  COALESCE((SELECT jsonb_agg(to_jsonb(b) - 'created_at' - 'updated_at' ORDER BY b.id) FROM public.resource_bundles b WHERE b.is_active), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(to_jsonb(c) - 'created_at' ORDER BY c.bundle_id, c.component_role, c.id) FROM public.resource_bundle_components c JOIN public.resource_bundles b ON b.id = c.bundle_id WHERE b.is_active), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.bundle_id, a.space_id) FROM public.resource_bundle_space_affinities a JOIN public.resource_bundles b ON b.id = a.bundle_id WHERE b.is_active), '[]'::jsonb)
FROM public.plans p
ON CONFLICT (plan_id) DO NOTHING;

ALTER TABLE public.plan_resource_bundle_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.plan_resource_bundle_snapshots FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.plan_resource_bundle_snapshots_id_seq FROM anon, authenticated;
GRANT ALL ON TABLE public.plan_resource_bundle_snapshots TO service_role;
GRANT ALL ON SEQUENCE public.plan_resource_bundle_snapshots_id_seq TO service_role;
