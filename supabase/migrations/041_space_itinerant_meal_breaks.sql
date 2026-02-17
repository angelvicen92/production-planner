-- 041_space_itinerant_meal_breaks.sql

ALTER TABLE public.program_settings
  ADD COLUMN IF NOT EXISTS space_meal_break_minutes INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS itinerant_meal_break_minutes INTEGER NOT NULL DEFAULT 45;

CREATE TABLE IF NOT EXISTS public.plan_breaks (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('space_meal','itinerant_meal')),
  space_id BIGINT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  itinerant_team_id BIGINT NULL REFERENCES public.itinerant_teams(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  earliest_start TEXT NULL,
  latest_end TEXT NULL,
  locked_start TEXT NULL,
  locked_end TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_breaks_kind_scope_chk CHECK (
    (kind = 'space_meal' AND space_id IS NOT NULL AND itinerant_team_id IS NULL)
    OR (kind = 'itinerant_meal' AND itinerant_team_id IS NOT NULL AND space_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_breaks_unique_space_meal
  ON public.plan_breaks(plan_id, space_id)
  WHERE kind = 'space_meal';

CREATE UNIQUE INDEX IF NOT EXISTS plan_breaks_unique_itinerant_meal
  ON public.plan_breaks(plan_id, itinerant_team_id)
  WHERE kind = 'itinerant_meal';

ALTER TABLE public.plan_breaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_breaks_read_all_roles ON public.plan_breaks;
CREATE POLICY plan_breaks_read_all_roles
ON public.plan_breaks
FOR SELECT
TO authenticated
USING (
  public.has_role('admin')
  OR public.has_role('production')
  OR public.has_role('aux')
  OR public.has_role('viewer')
);

DROP POLICY IF EXISTS plan_breaks_write_admin_production ON public.plan_breaks;
CREATE POLICY plan_breaks_write_admin_production
ON public.plan_breaks
FOR ALL
TO authenticated
USING (public.has_role('admin') OR public.has_role('production'))
WITH CHECK (public.has_role('admin') OR public.has_role('production'));
