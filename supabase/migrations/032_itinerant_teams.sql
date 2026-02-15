-- 032_itinerant_teams

CREATE TABLE IF NOT EXISTS itinerant_teams (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_itinerant_teams_active
  ON itinerant_teams(is_active);

ALTER TABLE itinerant_teams ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow authenticated read itinerant_teams"
  ON itinerant_teams
  FOR SELECT TO authenticated
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow authenticated write itinerant_teams"
  ON itinerant_teams
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
