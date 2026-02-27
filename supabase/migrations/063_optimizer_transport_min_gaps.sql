ALTER TABLE optimizer_settings
  ADD COLUMN IF NOT EXISTS arrival_min_gap_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS departure_min_gap_minutes integer NOT NULL DEFAULT 0;
