-- 033_staff_assignments_itinerant_team

ALTER TABLE staff_assignment_defaults
  ADD COLUMN IF NOT EXISTS itinerant_team_id BIGINT REFERENCES itinerant_teams(id) ON DELETE CASCADE;

ALTER TABLE plan_staff_assignments
  ADD COLUMN IF NOT EXISTS itinerant_team_id BIGINT REFERENCES itinerant_teams(id) ON DELETE CASCADE;

-- Nuevo scope_type válido
ALTER TYPE staff_scope_type ADD VALUE IF NOT EXISTS 'itinerant_team';
