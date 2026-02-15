-- Initial Migration for Production Planning

-- 1. Plans
CREATE TABLE IF NOT EXISTS plans (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  work_start TEXT NOT NULL,
  work_end TEXT NOT NULL,
  meal_start TEXT NOT NULL,
  meal_end TEXT NOT NULL,
  cameras_available INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Zones
CREATE TABLE IF NOT EXISTS zones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL
);

-- 3. Spaces
CREATE TABLE IF NOT EXISTS spaces (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  zone_id BIGINT NOT NULL REFERENCES zones(id),
  priority_level INTEGER NOT NULL DEFAULT 1
);

-- 4. Resources
CREATE TYPE resource_type AS ENUM ('auxiliar', 'coach', 'presenter');
CREATE TABLE IF NOT EXISTS resources (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type resource_type NOT NULL,
  name TEXT NOT NULL
);

-- 5. Resource Availability
CREATE TABLE IF NOT EXISTS resource_availability (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource_id BIGINT NOT NULL REFERENCES resources(id),
  plan_id BIGINT NOT NULL REFERENCES plans(id),
  start TEXT NOT NULL,
  "end" TEXT NOT NULL
);

-- 6. Task Templates
CREATE TABLE IF NOT EXISTS task_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  default_duration INTEGER NOT NULL,
  requires_auxiliar BOOLEAN NOT NULL DEFAULT FALSE,
  requires_coach BOOLEAN NOT NULL DEFAULT FALSE,
  requires_presenter BOOLEAN NOT NULL DEFAULT FALSE,
  default_cameras INTEGER NOT NULL DEFAULT 0,
  exclusive_auxiliar BOOLEAN NOT NULL DEFAULT FALSE,
  setup_id BIGINT,
  rules_json JSONB
);

-- 7. Daily Tasks
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'done', 'interrupted', 'cancelled');
CREATE TABLE IF NOT EXISTS daily_tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans(id),
  template_id BIGINT NOT NULL REFERENCES task_templates(id),
  contestant_id BIGINT,
  duration_override INTEGER,
  cameras_override INTEGER,
  status task_status NOT NULL DEFAULT 'pending',
  start_planned TEXT,
  end_planned TEXT,
  start_real TEXT,
  end_real TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Locks
CREATE TYPE lock_type AS ENUM ('time', 'space', 'resource', 'full');
CREATE TABLE IF NOT EXISTS locks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans(id),
  task_id BIGINT NOT NULL REFERENCES daily_tasks(id),
  lock_type lock_type NOT NULL,
  locked_start TEXT,
  locked_end TEXT,
  locked_resource_id BIGINT REFERENCES resources(id),
  created_by TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_plan_id ON daily_tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_locks_plan_id ON locks(plan_id);
CREATE INDEX IF NOT EXISTS idx_locks_task_id ON locks(task_id);
CREATE INDEX IF NOT EXISTS idx_avail_plan_id ON resource_availability(plan_id);
CREATE INDEX IF NOT EXISTS idx_avail_res_id ON resource_availability(resource_id);

-- RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

-- Minimal Policy: Authenticated users can read and write for MVP
CREATE POLICY "Allow authenticated read all" ON plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert plans" ON plans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update plans" ON plans FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read tasks" ON daily_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated write tasks" ON daily_tasks FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated read locks" ON locks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated write locks" ON locks FOR ALL TO authenticated USING (true);

-- Repeat for other tables if needed for full access, keeping it minimal for now
CREATE POLICY "Allow authenticated read static" ON zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read spaces" ON spaces FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read resources" ON resources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read availability" ON resource_availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read templates" ON task_templates FOR SELECT TO authenticated USING (true);
