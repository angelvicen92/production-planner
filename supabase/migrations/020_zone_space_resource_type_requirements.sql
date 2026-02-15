-- 020_zone_space_resource_type_requirements.sql
-- Requisitos genéricos por TIPO de recurso en Zonas/Espacios:
-- - Defaults globales (Settings)
-- - Snapshot por plan (para que el plan "congele" lo que había en Settings)

-- A) Defaults globales (Settings) por ZONA
CREATE TABLE IF NOT EXISTS zone_resource_type_defaults (
  id BIGSERIAL PRIMARY KEY,
  zone_id BIGINT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  resource_type_id BIGINT NOT NULL REFERENCES resource_types(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_zone_resource_type_defaults
  ON zone_resource_type_defaults(zone_id, resource_type_id);

CREATE INDEX IF NOT EXISTS idx_zone_resource_type_defaults_zone
  ON zone_resource_type_defaults(zone_id);

CREATE INDEX IF NOT EXISTS idx_zone_resource_type_defaults_type
  ON zone_resource_type_defaults(resource_type_id);

-- B) Defaults globales (Settings) por ESPACIO
CREATE TABLE IF NOT EXISTS space_resource_type_defaults (
  id BIGSERIAL PRIMARY KEY,
  space_id BIGINT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  resource_type_id BIGINT NOT NULL REFERENCES resource_types(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_space_resource_type_defaults
  ON space_resource_type_defaults(space_id, resource_type_id);

CREATE INDEX IF NOT EXISTS idx_space_resource_type_defaults_space
  ON space_resource_type_defaults(space_id);

CREATE INDEX IF NOT EXISTS idx_space_resource_type_defaults_type
  ON space_resource_type_defaults(resource_type_id);

-- C) Snapshot por plan por ZONA
CREATE TABLE IF NOT EXISTS plan_zone_resource_type_requirements (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  zone_id BIGINT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  resource_type_id BIGINT NOT NULL REFERENCES resource_types(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_zone_resource_type_requirements
  ON plan_zone_resource_type_requirements(plan_id, zone_id, resource_type_id);

CREATE INDEX IF NOT EXISTS idx_plan_zone_resource_type_plan
  ON plan_zone_resource_type_requirements(plan_id);

CREATE INDEX IF NOT EXISTS idx_plan_zone_resource_type_zone
  ON plan_zone_resource_type_requirements(zone_id);

-- D) Snapshot por plan por ESPACIO
CREATE TABLE IF NOT EXISTS plan_space_resource_type_requirements (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  space_id BIGINT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  resource_type_id BIGINT NOT NULL REFERENCES resource_types(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_space_resource_type_requirements
  ON plan_space_resource_type_requirements(plan_id, space_id, resource_type_id);

CREATE INDEX IF NOT EXISTS idx_plan_space_resource_type_plan
  ON plan_space_resource_type_requirements(plan_id);

CREATE INDEX IF NOT EXISTS idx_plan_space_resource_type_space
  ON plan_space_resource_type_requirements(space_id);
