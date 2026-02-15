-- 005_resource_pools.sql
-- Admin defaults (Settings) + per-plan overrides snapshot

-- A) Catálogo de pools de recursos (por defecto global)
CREATE TABLE IF NOT EXISTS resource_pools (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,              -- ej: cameras, sound, presenter, vocal_coach
  name TEXT NOT NULL,                     -- ej: "Cámaras", "Sonido", "Presentadora"
  default_quantity INTEGER NOT NULL DEFAULT 0,
  default_names JSONB                     -- array opcional: ["Jose Maria","Lucía"]
);

-- B) Valores por plan (override del día)
CREATE TABLE IF NOT EXISTS plan_resource_pools (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans(id),
  pool_id BIGINT NOT NULL REFERENCES resource_pools(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  names JSONB                             -- override opcional (array)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_pool ON plan_resource_pools(plan_id, pool_id);
CREATE INDEX IF NOT EXISTS idx_plan_resource_pools_plan ON plan_resource_pools(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_resource_pools_pool ON plan_resource_pools(pool_id);
