ALTER TABLE public.daily_tasks
  ADD COLUMN IF NOT EXISTS start_real_seconds integer,
  ADD COLUMN IF NOT EXISTS end_real_seconds integer;
