ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS meal_mode text NOT NULL DEFAULT 'flexible_meal_window'
  CHECK (meal_mode IN ('global_hard_break', 'flexible_meal_window'));

ALTER TABLE program_settings
  ADD COLUMN IF NOT EXISTS meal_mode text NOT NULL DEFAULT 'flexible_meal_window'
  CHECK (meal_mode IN ('global_hard_break', 'flexible_meal_window'));

ALTER TABLE plan_breaks
  ADD COLUMN IF NOT EXISTS occupies_space boolean NOT NULL DEFAULT false;

ALTER TABLE planning_runs
  ADD COLUMN IF NOT EXISTS progress_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_progress_at timestamptz,
  ADD COLUMN IF NOT EXISTS candidates_evaluated integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS candidates_generated integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_best_reason text;
