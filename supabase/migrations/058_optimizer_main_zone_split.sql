ALTER TABLE optimizer_settings
  ADD COLUMN IF NOT EXISTS main_zone_finish_early_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS main_zone_finish_early_advanced_value INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS main_zone_keep_busy_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS main_zone_keep_busy_advanced_value INTEGER NOT NULL DEFAULT 0;

UPDATE optimizer_settings
SET
  main_zone_finish_early_level = COALESCE(main_zone_finish_early_level, main_zone_priority_level, 0),
  main_zone_finish_early_advanced_value = COALESCE(main_zone_finish_early_advanced_value, main_zone_priority_advanced_value, 0),
  main_zone_keep_busy_level = COALESCE(main_zone_keep_busy_level, main_zone_priority_level, 0),
  main_zone_keep_busy_advanced_value = COALESCE(main_zone_keep_busy_advanced_value, main_zone_priority_advanced_value, 0)
WHERE id = 1;
