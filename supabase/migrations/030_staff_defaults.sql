-- 030_staff_defaults

-- Defaults globales: por cada plató (zone) se decide si se asigna por PLATÓ o por ESPACIOS
-- (Reality NO es modo del plató; Reality se gestiona aparte como equipos itinerantes)

CREATE TABLE IF NOT EXISTS staff_zone_mode_defaults (
  zone_id BIGINT PRIMARY KEY REFERENCES zones(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'zone',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT staff_zone_mode_defaults_mode_check CHECK (mode IN ('zone', 'space'))
);

-- Defaults globales: asignaciones multi-persona por scope (zone/space/reality_team)
CREATE TABLE IF NOT EXISTS staff_assignment_defaults (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_role staff_role_type NOT NULL,
  staff_person_id BIGINT NOT NULL REFERENCES staff_people(id),
  scope_type staff_scope_type NOT NULL,
  zone_id BIGINT REFERENCES zones(id) ON DELETE CASCADE,
  space_id BIGINT REFERENCES spaces(id) ON DELETE CASCADE,
  reality_team_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT staff_assignment_defaults_scope_check CHECK (
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

CREATE INDEX IF NOT EXISTS idx_staff_assignment_defaults_role ON staff_assignment_defaults(staff_role);
CREATE INDEX IF NOT EXISTS idx_staff_assignment_defaults_scope ON staff_assignment_defaults(scope_type);

-- RLS (MVP igual que lo demás: authenticated read/write)
ALTER TABLE staff_zone_mode_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_assignment_defaults ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow authenticated read staff_zone_mode_defaults" ON staff_zone_mode_defaults
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow authenticated write staff_zone_mode_defaults" ON staff_zone_mode_defaults
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow authenticated read staff_assignment_defaults" ON staff_assignment_defaults
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow authenticated write staff_assignment_defaults" ON staff_assignment_defaults
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
