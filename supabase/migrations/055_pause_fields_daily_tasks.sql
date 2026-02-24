ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS paused_total_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_at_seconds integer NULL,
  ADD COLUMN IF NOT EXISTS paused_at_hhmm text NULL;
