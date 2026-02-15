-- 019_daily_tasks_required_plan_resources.sql
-- Permite que una daily_task requiera recursos del snapshot del plan (plan_resource_items)
-- Ej: Reality 1 / Reality 2 / Reality Duo (u otros recursos)

ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS required_plan_resource_item_ids JSONB;

-- opcional: índice GIN para búsquedas futuras (no es obligatorio, pero barato)
CREATE INDEX IF NOT EXISTS idx_daily_tasks_required_plan_resource_item_ids
  ON daily_tasks
  USING GIN (required_plan_resource_item_ids);
