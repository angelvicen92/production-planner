-- 018_resource_item_components.sql
-- Recursos compuestos: un recurso (item) puede "consumir" otros resource_items con cantidades.
-- Ej: Reality 1 = CAM 3 (x1) + SON 1 (x1)
--     Reality Duo = CAM 3 (x1) + CAM 4 (x1) + SON 1 (x1)

CREATE TABLE IF NOT EXISTS resource_item_components (
  id BIGSERIAL PRIMARY KEY,
  parent_resource_item_id BIGINT NOT NULL REFERENCES resource_items(id) ON DELETE CASCADE,
  component_resource_item_id BIGINT NOT NULL REFERENCES resource_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  CONSTRAINT uq_resource_item_components UNIQUE (parent_resource_item_id, component_resource_item_id),
  CONSTRAINT chk_resource_item_components_not_self CHECK (parent_resource_item_id <> component_resource_item_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_item_components_parent
  ON resource_item_components(parent_resource_item_id);

CREATE INDEX IF NOT EXISTS idx_resource_item_components_component
  ON resource_item_components(component_resource_item_id);
