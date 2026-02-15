-- 028_optimizer_settings_compact_and_main_zone_modes.sql
-- Nuevas palancas amigables:
-- - Modos de prioridad del plató principal (pueden ser ambos)
-- - Compactar concursantes (0=Off, 1=Suave, 2=Medio, 3=Fuerte)

ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS main_zone_opt_finish_early BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS main_zone_opt_keep_busy BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS contestant_compact_level INTEGER NOT NULL DEFAULT 0;

-- Seguridad: clamp básico si alguien mete valores raros
UPDATE public.optimizer_settings
SET contestant_compact_level = 0
WHERE contestant_compact_level < 0 OR contestant_compact_level > 3;
