ALTER TABLE public.daily_tasks
  ADD COLUMN IF NOT EXISTS is_manual_block boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_title text NULL,
  ADD COLUMN IF NOT EXISTS manual_color text NULL,
  ADD COLUMN IF NOT EXISTS manual_scope_type text NULL,
  ADD COLUMN IF NOT EXISTS manual_scope_id integer NULL;

CREATE INDEX IF NOT EXISTS idx_daily_tasks_manual_scope
  ON public.daily_tasks(plan_id, manual_scope_type, manual_scope_id)
  WHERE is_manual_block = true;
