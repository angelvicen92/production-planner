-- 002_contestants.sql

-- 1) contestants
CREATE TABLE IF NOT EXISTS contestants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  instrument BOOLEAN NOT NULL DEFAULT FALSE,
  coach_id BIGINT REFERENCES resources(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contestants_coach_id ON contestants(coach_id);

-- RLS
ALTER TABLE contestants ENABLE ROW LEVEL SECURITY;

-- Minimal policy: authenticated users can read/write for MVP
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contestants' AND policyname='Allow authenticated read contestants'
  ) THEN
    CREATE POLICY "Allow authenticated read contestants"
      ON contestants FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contestants' AND policyname='Allow authenticated insert contestants'
  ) THEN
    CREATE POLICY "Allow authenticated insert contestants"
      ON contestants FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contestants' AND policyname='Allow authenticated update contestants'
  ) THEN
    CREATE POLICY "Allow authenticated update contestants"
      ON contestants FOR UPDATE
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contestants' AND policyname='Allow authenticated delete contestants'
  ) THEN
    CREATE POLICY "Allow authenticated delete contestants"
      ON contestants FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;
