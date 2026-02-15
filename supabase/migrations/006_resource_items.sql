-- 006_resource_items.sql
-- Nuevo modelo: recursos 1 a 1 (items) agrupados por tipo.
-- Mantiene 005_resource_pools.sql sin borrarlo para compatibilidad temporal.

-- A) Tipos (grupo): Cámara, Sonido, Vocal Coach...
CREATE TABLE IF NOT EXISTS resource_types (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

-- B) Unidades (item): Cámara 1, Cámara 2, Lucía...
CREATE TABLE IF NOT EXISTS resource_items (
  id BIGSERIAL PRIMARY KEY,
  type_id BIGINT NOT NULL REFERENCES resource_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_resource_items_type ON resource_items(type_id);

-- C) Snapshot por plan (unidad a unidad) + disponibilidad
-- - resource_item_id puede ser NULL para recursos "solo de ese plan" (ad hoc)
CREATE TABLE IF NOT EXISTS plan_resource_items (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  type_id BIGINT NOT NULL REFERENCES resource_types(id),
  resource_item_id BIGINT REFERENCES resource_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'default' -- default | adhoc
);

CREATE INDEX IF NOT EXISTS idx_plan_resource_items_plan ON plan_resource_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_resource_items_type ON plan_resource_items(type_id);
CREATE INDEX IF NOT EXISTS idx_plan_resource_items_item ON plan_resource_items(resource_item_id);

-- D) MIGRACIÓN desde resource_pools -> resource_types + resource_items
-- 1) Tipos
INSERT INTO resource_types (code, name)
SELECT rp.code, rp.name
FROM resource_pools rp
ON CONFLICT (code) DO NOTHING;

-- 2) Items por nombres explícitos (default_names)
INSERT INTO resource_items (type_id, name, is_active)
SELECT rt.id, n.value, TRUE
FROM resource_pools rp
JOIN resource_types rt ON rt.code = rp.code
JOIN LATERAL jsonb_array_elements_text(COALESCE(rp.default_names, '[]'::jsonb)) AS n(value) ON TRUE;

-- 3) Items restantes (si quantity > nº de names)
WITH counts AS (
  SELECT
    rp.code,
    rp.name AS pool_name,
    rp.default_quantity AS qty,
    COALESCE(jsonb_array_length(rp.default_names), 0) AS named_count,
    rt.id AS type_id
  FROM resource_pools rp
  JOIN resource_types rt ON rt.code = rp.code
)
INSERT INTO resource_items (type_id, name, is_active)
SELECT
  c.type_id,
  (c.pool_name || ' ' || gs.i)::text,
  TRUE
FROM counts c
JOIN LATERAL generate_series(c.named_count + 1, c.qty) AS gs(i) ON TRUE;

-- E) MIGRACIÓN (opcional) desde plan_resource_pools -> plan_resource_items
-- Si tienes planes ya creados con snapshot antiguo, los volcamos a unidad-a-unidad.
INSERT INTO plan_resource_items (plan_id, type_id, resource_item_id, name, is_available, source)
SELECT
  prp.plan_id,
  rt.id AS type_id,
  NULL::bigint AS resource_item_id,
  n.value AS name,
  TRUE AS is_available,
  'default' AS source
FROM plan_resource_pools prp
JOIN resource_pools rp ON rp.id = prp.pool_id
JOIN resource_types rt ON rt.code = rp.code
JOIN LATERAL jsonb_array_elements_text(COALESCE(prp.names, '[]'::jsonb)) AS n(value) ON TRUE;

-- Si quantity > nº de names en el snapshot del plan, generamos nombres de relleno
WITH c AS (
  SELECT
    prp.plan_id,
    rt.id AS type_id,
    rp.name AS pool_name,
    prp.quantity AS qty,
    COALESCE(jsonb_array_length(prp.names), 0) AS named_count
  FROM plan_resource_pools prp
  JOIN resource_pools rp ON rp.id = prp.pool_id
  JOIN resource_types rt ON rt.code = rp.code
)
INSERT INTO plan_resource_items (plan_id, type_id, resource_item_id, name, is_available, source)
SELECT
  c.plan_id,
  c.type_id,
  NULL::bigint,
  (c.pool_name || ' ' || gs.i)::text,
  TRUE,
  'default'
FROM c
JOIN LATERAL generate_series(c.named_count + 1, c.qty) AS gs(i) ON TRUE;
