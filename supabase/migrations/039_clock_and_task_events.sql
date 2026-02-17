-- 039_clock_and_task_events.sql

ALTER TABLE IF EXISTS public.program_settings
  ADD COLUMN IF NOT EXISTS clock_mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS simulated_time text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'program_settings_clock_mode_check'
      AND conrelid = 'public.program_settings'::regclass
  ) THEN
    ALTER TABLE public.program_settings
      ADD CONSTRAINT program_settings_clock_mode_check
      CHECK (clock_mode IN ('auto', 'manual'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'program_settings_simulated_time_check'
      AND conrelid = 'public.program_settings'::regclass
  ) THEN
    ALTER TABLE public.program_settings
      ADD CONSTRAINT program_settings_simulated_time_check
      CHECK (simulated_time IS NULL OR simulated_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.task_status_events (
  id bigserial PRIMARY KEY,
  plan_id integer NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  task_id integer NOT NULL REFERENCES public.daily_tasks(id) ON DELETE CASCADE,
  status public.task_status NOT NULL,
  changed_by text,
  time_real text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_status_events_task_id ON public.task_status_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_status_events_plan_id ON public.task_status_events(plan_id);

ALTER TABLE IF EXISTS public.task_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_status_events_read_all_roles ON public.task_status_events;
CREATE POLICY task_status_events_read_all_roles
ON public.task_status_events
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS task_status_events_write_admin_production ON public.task_status_events;
CREATE POLICY task_status_events_write_admin_production
ON public.task_status_events
FOR ALL
TO authenticated
USING (public.has_role('admin') OR public.has_role('production'))
WITH CHECK (public.has_role('admin') OR public.has_role('production'));
