-- 004_task_locations.sql
-- Adds: spaces tree + task location fields (templates + daily_tasks)

-- A) Spaces: add parent_space_id (tree)
ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS parent_space_id BIGINT REFERENCES spaces(id);

-- B) Task templates: optional default location
ALTER TABLE task_templates
  ADD COLUMN IF NOT EXISTS zone_id BIGINT REFERENCES zones(id),
  ADD COLUMN IF NOT EXISTS space_id BIGINT REFERENCES spaces(id);

-- C) Daily tasks: per-task override + fallback label for deleted spaces
ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS zone_id BIGINT REFERENCES zones(id),
  ADD COLUMN IF NOT EXISTS space_id BIGINT REFERENCES spaces(id),
  ADD COLUMN IF NOT EXISTS location_label TEXT;

-- Helpful indexes (optional but cheap)
CREATE INDEX IF NOT EXISTS idx_spaces_parent ON spaces(parent_space_id);
CREATE INDEX IF NOT EXISTS idx_task_templates_zone ON task_templates(zone_id);
CREATE INDEX IF NOT EXISTS idx_task_templates_space ON task_templates(space_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_zone ON daily_tasks(zone_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_space ON daily_tasks(space_id);
