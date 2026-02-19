-- 047_control_room_settings_and_planning_runs.sql

CREATE TABLE IF NOT EXISTS public.control_room_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  idle_unexpected_threshold_min INTEGER NOT NULL DEFAULT 5 CHECK (idle_unexpected_threshold_min >= 0 AND idle_unexpected_threshold_min <= 180),
  delay_threshold_min INTEGER NOT NULL DEFAULT 10 CHECK (delay_threshold_min >= 0 AND delay_threshold_min <= 240),
  next_soon_threshold_min INTEGER NOT NULL DEFAULT 10 CHECK (next_soon_threshold_min >= 0 AND next_soon_threshold_min <= 240),
  enable_idle_alert BOOLEAN NOT NULL DEFAULT true,
  enable_delay_alert BOOLEAN NOT NULL DEFAULT true,
  enable_next_soon_alert BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT control_room_settings_single_row CHECK (id = 1)
);

INSERT INTO public.control_room_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.planning_runs (
  id BIGSERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'infeasible', 'error')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_pending INTEGER NOT NULL DEFAULT 0,
  planned_count INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  last_reasons JSONB,
  request_id UUID
);

CREATE INDEX IF NOT EXISTS planning_runs_plan_id_idx ON public.planning_runs(plan_id);
CREATE INDEX IF NOT EXISTS planning_runs_updated_at_idx ON public.planning_runs(updated_at DESC);

ALTER TABLE IF EXISTS public.control_room_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.planning_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS control_room_settings_read_all_roles ON public.control_room_settings;
CREATE POLICY control_room_settings_read_all_roles
ON public.control_room_settings
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS control_room_settings_admin_update ON public.control_room_settings;
CREATE POLICY control_room_settings_admin_update
ON public.control_room_settings
FOR UPDATE
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS planning_runs_read_all_roles ON public.planning_runs;
CREATE POLICY planning_runs_read_all_roles
ON public.planning_runs
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS planning_runs_write_admin_production ON public.planning_runs;
CREATE POLICY planning_runs_write_admin_production
ON public.planning_runs
FOR ALL
TO authenticated
USING (public.has_role('admin') OR public.has_role('production'))
WITH CHECK (public.has_role('admin') OR public.has_role('production'));

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.locks';
  EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.planning_runs';
  EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'ALTER TABLE public.locks REPLICA IDENTITY FULL';
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    EXECUTE 'ALTER TABLE public.planning_runs REPLICA IDENTITY FULL';
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;
