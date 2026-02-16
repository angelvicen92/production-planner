-- 036_optimizer_settings_mode_and_advanced.sql
-- Add optimization mode + advanced values while preserving legacy/basic fields.

ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS optimization_mode TEXT NOT NULL DEFAULT 'basic';

ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS main_zone_priority_advanced_value INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS grouping_advanced_value INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS contestant_compact_advanced_value INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS contestant_stay_in_zone_level INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS contestant_stay_in_zone_advanced_value INTEGER NOT NULL DEFAULT 0;

UPDATE public.optimizer_settings
SET optimization_mode = CASE
  WHEN optimization_mode IN ('basic', 'advanced') THEN optimization_mode
  ELSE 'basic'
END;

UPDATE public.optimizer_settings
SET main_zone_priority_advanced_value = CASE main_zone_priority_level
  WHEN 1 THEN 3
  WHEN 2 THEN 6
  WHEN 3 THEN 9
  ELSE 0
END
WHERE main_zone_priority_advanced_value < 0
   OR main_zone_priority_advanced_value > 10
   OR main_zone_priority_advanced_value IS NULL;

UPDATE public.optimizer_settings
SET grouping_advanced_value = CASE grouping_level
  WHEN 1 THEN 3
  WHEN 2 THEN 6
  WHEN 3 THEN 9
  ELSE 0
END
WHERE grouping_advanced_value < 0
   OR grouping_advanced_value > 10
   OR grouping_advanced_value IS NULL;

UPDATE public.optimizer_settings
SET contestant_compact_advanced_value = CASE contestant_compact_level
  WHEN 1 THEN 3
  WHEN 2 THEN 6
  WHEN 3 THEN 9
  ELSE 0
END
WHERE contestant_compact_advanced_value < 0
   OR contestant_compact_advanced_value > 10
   OR contestant_compact_advanced_value IS NULL;

UPDATE public.optimizer_settings
SET contestant_stay_in_zone_level = GREATEST(0, LEAST(3, contestant_stay_in_zone_level));

UPDATE public.optimizer_settings
SET contestant_stay_in_zone_advanced_value = CASE contestant_stay_in_zone_level
  WHEN 1 THEN 3
  WHEN 2 THEN 6
  WHEN 3 THEN 9
  ELSE 0
END
WHERE contestant_stay_in_zone_advanced_value < 0
   OR contestant_stay_in_zone_advanced_value > 10
   OR contestant_stay_in_zone_advanced_value IS NULL;
