# Legacy engine cleanup note

The legacy engine entrypoint is `engine/solve.ts` (`generatePlan`).

## Current status
- Main planning endpoint `/api/plans/:id/generate` now selects `v2`/`v3` via plan feature flag and does not use legacy solve directly.
- Legacy solve is still referenced by debug/validation helpers and should be removed in a dedicated cleanup PR after V3 is stable.

## Candidate files for removal in follow-up PR
- `engine/solve.ts`
- `engine/solve.spec.ts`
- any route/debug wiring that still imports `generatePlan` from `engine/solve`
