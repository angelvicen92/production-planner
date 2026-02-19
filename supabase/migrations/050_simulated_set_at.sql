ALTER TABLE IF EXISTS public.program_settings
  ADD COLUMN IF NOT EXISTS simulated_set_at timestamptz;
