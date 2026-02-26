ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS max_template_changes integer NOT NULL DEFAULT 4;
