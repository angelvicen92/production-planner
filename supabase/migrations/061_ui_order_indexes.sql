-- 061_ui_order_indexes.sql
ALTER TABLE IF EXISTS public.zones
  ADD COLUMN IF NOT EXISTS ui_order_index integer;

ALTER TABLE IF EXISTS public.program_settings
  ADD COLUMN IF NOT EXISTS ui_itinerant_group_order_index integer,
  ADD COLUMN IF NOT EXISTS ui_unlocated_group_order_index integer;
