-- 027_optimizer_settings_levels.sql
-- Niveles amigables (0=Off, 1=Suave, 2=Medio, 3=Fuerte)

ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS main_zone_priority_level INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS grouping_level INTEGER NOT NULL DEFAULT 2;

-- Backfill coherente con booleans existentes (si el usuario ya tenía toggles)
UPDATE public.optimizer_settings
SET main_zone_priority_level = CASE WHEN prioritize_main_zone THEN 2 ELSE 0 END
WHERE id = 1 AND (main_zone_priority_level IS NULL OR main_zone_priority_level = 0);

UPDATE public.optimizer_settings
SET grouping_level = CASE WHEN group_by_space_and_template THEN 2 ELSE 0 END
WHERE id = 1 AND (grouping_level IS NULL OR grouping_level = 2);
