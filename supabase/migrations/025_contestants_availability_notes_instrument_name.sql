-- 025_contestants_availability_notes_instrument_name.sql
-- Añade: observaciones, disponibilidad por concursante, y nombre libre del instrumento

ALTER TABLE public.contestants
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.contestants
  ADD COLUMN IF NOT EXISTS availability_start TEXT;

ALTER TABLE public.contestants
  ADD COLUMN IF NOT EXISTS availability_end TEXT;

ALTER TABLE public.contestants
  ADD COLUMN IF NOT EXISTS instrument_name TEXT;

CREATE INDEX IF NOT EXISTS contestants_availability_idx
  ON public.contestants(plan_id, availability_start, availability_end);
