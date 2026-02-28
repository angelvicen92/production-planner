ALTER TABLE optimizer_settings
  ADD COLUMN IF NOT EXISTS near_hard_breaks_max integer NOT NULL DEFAULT 0;

UPDATE optimizer_settings
SET near_hard_breaks_max = GREATEST(0, LEAST(10, COALESCE(near_hard_breaks_max, 0)))
WHERE near_hard_breaks_max IS DISTINCT FROM GREATEST(0, LEAST(10, COALESCE(near_hard_breaks_max, 0)));
