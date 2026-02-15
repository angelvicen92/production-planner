-- 014_zone_resource_assignments.sql
-- Recursos anclados al PLATÓ (zona), no al espacio.
-- - Defaults globales (Settings) por zona
-- - Snapshot por plan por zona

-- A) Defaults globales (Settings) por zona
CREATE TABLE IF NOT EXISTS zone_resource_defaults (
  id BIGSERIAL PRIMARY KEY,
  zone_id BIGINT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  resource_item_id BIGINT NOT NULL REFERENCES resource_items(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_zone_resource_defaults
  ON zone_resource_defaults(zone_id, resource_item_id);

CREATE INDEX IF NOT EXISTS idx_zone_resource_defaults_zone
  ON zone_resource_defaults(zone_id);

CREATE INDEX IF NOT EXISTS idx_zone_resource_defaults_item
  ON zone_resource_defaults(resource_item_id);

-- B) Snapshot por plan por zona (congela recursos del día por plató)
CREATE TABLE IF NOT EXISTS plan_zone_resource_assignments (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  zone_id BIGINT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  plan_resource_item_id BIGINT NOT NULL REFERENCES plan_resource_items(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_zone_resource_assignment
  ON plan_zone_resource_assignments(plan_id, zone_id, plan_resource_item_id);

CREATE INDEX IF NOT EXISTS idx_plan_zone_resource_plan
  ON plan_zone_resource_assignments(plan_id);

CREATE INDEX IF NOT EXISTS idx_plan_zone_resource_zone
  ON plan_zone_resource_assignments(zone_id);

CREATE INDEX IF NOT EXISTS idx_plan_zone_resource_plan_item
  ON plan_zone_resource_assignments(plan_resource_item_id);

-- C) Migración de datos (si venías usando space_resource_defaults/plan_space_resource_assignments)
-- Pasamos defaults por espacio -> defaults por zona (unión)
INSERT INTO zone_resource_defaults (zone_id, resource_item_id)
SELECT DISTINCT s.zone_id, d.resource_item_id
FROM space_resource_defaults d
JOIN spaces s ON s.id = d.space_id
WHERE s.zone_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Pasamos snapshot por espacio -> snapshot por zona (unión)
INSERT INTO plan_zone_resource_assignments (plan_id, zone_id, plan_resource_item_id)
SELECT DISTINCT psa.plan_id, s.zone_id, psa.plan_resource_item_id
FROM plan_space_resource_assignments psa
JOIN spaces s ON s.id = psa.space_id
WHERE s.zone_id IS NOT NULL
ON CONFLICT DO NOTHING;
