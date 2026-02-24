ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS minimize_changes_level integer NOT NULL DEFAULT 0;

ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS minimize_changes_min_chain integer NOT NULL DEFAULT 4;

ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS minimize_changes_level integer NOT NULL DEFAULT 0;

ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS minimize_changes_min_chain integer NOT NULL DEFAULT 4;
