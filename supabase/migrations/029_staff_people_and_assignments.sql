-- 029_staff_people_and_assignments

-- Staff catalog (Producción / Redacción)
DO $$ BEGIN
  CREATE TYPE staff_role_type AS ENUM ('production', 'editorial');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE staff_scope_type AS ENUM ('zone', 'space', 'reality_team');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE staff_zone_mode AS ENUM ('zone', 'space', 'reality');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


CREATE TABLE IF NOT EXISTS staff_people (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  role_type staff_role_type NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- Per-plan decision: for each zone (plató), assign staff by zone OR by spaces (no inheritance)
CREATE TABLE IF NOT EXISTS plan_zone_staff_mode (
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  zone_id BIGINT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  mode staff_zone_mode NOT NULL DEFAULT 'zone',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (plan_id, zone_id)
);


-- Per-plan staff assignments (multi-person allowed)
CREATE TABLE IF NOT EXISTS plan_staff_assignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  staff_role staff_role_type NOT NULL,
  staff_person_id BIGINT NOT NULL REFERENCES staff_people(id),
  scope_type staff_scope_type NOT NULL,
  zone_id BIGINT REFERENCES zones(id) ON DELETE CASCADE,
  space_id BIGINT REFERENCES spaces(id) ON DELETE CASCADE,
  reality_team_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT plan_staff_assignments_scope_check CHECK (
    (
      scope_type = 'zone'
      AND zone_id IS NOT NULL
      AND space_id IS NULL
      AND reality_team_code IS NULL
    )
    OR (
      scope_type = 'space'
      AND zone_id IS NULL
      AND space_id IS NOT NULL
      AND reality_team_code IS NULL
    )
    OR (
      scope_type = 'reality_team'
      AND zone_id IS NULL
      AND space_id IS NULL
      AND reality_team_code IS NOT NULL
      AND length(trim(reality_team_code)) > 0
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_staff_people_role_type ON staff_people(role_type);
CREATE INDEX IF NOT EXISTS idx_plan_staff_assignments_plan ON plan_staff_assignments(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_zone_staff_mode_plan ON plan_zone_staff_mode(plan_id);


-- RLS
ALTER TABLE staff_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_zone_staff_mode ENABLE ROW LEVEL SECURITY;

-- MVP: authenticated can read/write
DO $$ BEGIN
  CREATE POLICY "Allow authenticated read staff_people" ON staff_people
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow authenticated write staff_people" ON staff_people
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow authenticated read plan_staff_assignments" ON plan_staff_assignments
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow authenticated write plan_staff_assignments" ON plan_staff_assignments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow authenticated read plan_zone_staff_mode" ON plan_zone_staff_mode
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow authenticated write plan_zone_staff_mode" ON plan_zone_staff_mode
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
