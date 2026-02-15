-- 026_optimizer_settings.sql
-- Ajustes globales de optimización (no por plan)

CREATE TABLE IF NOT EXISTS public.optimizer_settings (
  id INTEGER PRIMARY KEY,
  main_zone_id INTEGER NULL REFERENCES public.zones(id) ON DELETE SET NULL,
  prioritize_main_zone BOOLEAN NOT NULL DEFAULT FALSE,
  group_by_space_and_template BOOLEAN NOT NULL DEFAULT TRUE
);

-- singleton
INSERT INTO public.optimizer_settings (id, main_zone_id, prioritize_main_zone, group_by_space_and_template)
VALUES (1, NULL, FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;
