-- 013_space_resource_assignments.sql
-- Asignación de recursos (resource_items) a espacios:
-- - Defaults globales (Settings)
-- - Snapshot por plan (para que el plan "congele" lo que había en Settings)

-- A) Defaults globales (Settings)
CREATE TABLE IF NOT EXISTS space_resource_defaults (
  id BIGSERIAL PRIMARY KEY,
  space_id BIGINT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  resource_item_id BIGINT NOT NULL REFERENCES resource_items(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_space_resource_defaults
  ON space_resource_defaults(space_id, resource_item_id);

CREATE INDEX IF NOT EXISTS idx_space_resource_defaults_space
  ON space_resource_defaults(space_id);

CREATE INDEX IF NOT EXISTS idx_space_resource_defaults_item
  ON space_resource_defaults(resource_item_id);

-- B) Snapshot por plan (congela recursos del día por espacio)
CREATE TABLE IF NOT EXISTS plan_space_resource_assignments (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  space_id BIGINT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  plan_resource_item_id BIGINT NOT NULL REFERENCES plan_resource_items(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_space_resource_assignment
  ON plan_space_resource_assignments(plan_id, space_id, plan_resource_item_id);

CREATE INDEX IF NOT EXISTS idx_plan_space_resource_plan
  ON plan_space_resource_assignments(plan_id);

CREATE INDEX IF NOT EXISTS idx_plan_space_resource_space
  ON plan_space_resource_assignments(space_id);

CREATE INDEX IF NOT EXISTS idx_plan_space_resource_plan_item
  ON plan_space_resource_assignments(plan_resource_item_id);
