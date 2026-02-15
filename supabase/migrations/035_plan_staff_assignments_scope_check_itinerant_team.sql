-- 035_plan_staff_assignments_scope_check_itinerant_team
-- Permite scope_type = 'itinerant_team' en plan_staff_assignments

ALTER TABLE plan_staff_assignments
  DROP CONSTRAINT IF EXISTS plan_staff_assignments_scope_check;

ALTER TABLE plan_staff_assignments
  ADD CONSTRAINT plan_staff_assignments_scope_check CHECK (
    (
      scope_type = 'zone'
      AND zone_id IS NOT NULL
      AND space_id IS NULL
      AND reality_team_code IS NULL
      AND itinerant_team_id IS NULL
    )
    OR (
      scope_type = 'space'
      AND zone_id IS NULL
      AND space_id IS NOT NULL
      AND reality_team_code IS NULL
      AND itinerant_team_id IS NULL
    )
    OR (
      scope_type = 'reality_team'
      AND zone_id IS NULL
      AND space_id IS NULL
      AND reality_team_code IS NOT NULL
      AND length(trim(reality_team_code)) > 0
      AND itinerant_team_id IS NULL
    )
    OR (
      scope_type = 'itinerant_team'
      AND zone_id IS NULL
      AND space_id IS NULL
      AND reality_team_code IS NULL
      AND itinerant_team_id IS NOT NULL
    )
  );