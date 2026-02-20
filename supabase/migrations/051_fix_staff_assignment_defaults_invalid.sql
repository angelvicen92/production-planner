-- 051_fix_staff_assignment_defaults_invalid
-- Elimina defaults corruptos para evitar errores al snapshotear en createPlan.

DELETE FROM staff_assignment_defaults
WHERE NOT (
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
