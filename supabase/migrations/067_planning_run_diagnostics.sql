-- ID 021: compact, additive diagnostics for Engine V3 planning runs.
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS engine_version TEXT;
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS solution_source TEXT;
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS planned_tasks INTEGER;
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS unplanned_tasks INTEGER;
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS hard_constraint_violations INTEGER;
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS main_stage_gap_minutes INTEGER;
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS main_stage_gap_count INTEGER;
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS coach_switch_count INTEGER;
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS restrictive_talent_average_start_offset INTEGER;
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS selected_candidate_metrics JSONB;
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS engine_metadata JSONB;
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS diagnostic_warnings JSONB;
ALTER TABLE IF EXISTS public.planning_runs
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS planning_runs_plan_created_at_idx
  ON public.planning_runs(plan_id, created_at DESC);

ALTER TABLE IF EXISTS public.planning_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.planning_runs FROM anon;

COMMENT ON COLUMN public.planning_runs.engine_metadata IS
  'Compact V3 orchestration metadata only; never the full engine input/output.';
COMMENT ON COLUMN public.planning_runs.diagnostic_warnings IS
  'Bounded resource and bundle warning summaries; never full solver payloads.';
