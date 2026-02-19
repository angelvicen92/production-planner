ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS contestant_total_span_level INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.optimizer_settings
  ADD COLUMN IF NOT EXISTS contestant_total_span_advanced_value INTEGER;

UPDATE public.optimizer_settings
SET contestant_total_span_level = GREATEST(0, LEAST(3, COALESCE(contestant_total_span_level, 0)));

UPDATE public.optimizer_settings
SET contestant_total_span_advanced_value = CASE contestant_total_span_level
  WHEN 1 THEN 3
  WHEN 2 THEN 6
  WHEN 3 THEN 9
  ELSE 0
END
WHERE contestant_total_span_advanced_value IS NULL
   OR contestant_total_span_advanced_value < 0
   OR contestant_total_span_advanced_value > 10;

ALTER TABLE public.planning_runs
  ADD COLUMN IF NOT EXISTS phase TEXT;

ALTER TABLE public.planning_runs
  ADD COLUMN IF NOT EXISTS last_task_id INTEGER;

ALTER TABLE public.planning_runs
  ADD COLUMN IF NOT EXISTS last_task_name TEXT;
