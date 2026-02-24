ALTER TABLE zones ADD COLUMN IF NOT EXISTS grouping_level integer NOT NULL DEFAULT 0;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS grouping_min_chain integer NOT NULL DEFAULT 4;

ALTER TABLE spaces ADD COLUMN IF NOT EXISTS grouping_level integer NOT NULL DEFAULT 0;
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS grouping_min_chain integer NOT NULL DEFAULT 4;
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS grouping_apply_to_descendants boolean NOT NULL DEFAULT false;
