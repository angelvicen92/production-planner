# A3-ORCH-REAL-021 — Participant boundary pipeline

## Decision

`participantBoundaryRole` is an optional, explicit source identity.  No task name,
template id, space, duration, or observed Full A2 ordering participates in its
classification.  The canonical Full A2 source marks its 19 entry-styling tasks as
`ENTRY_PREREQUISITE` and its 19 exit-styling tasks as `EXIT_PREREQUISITE`.

Boundary tasks remain canonical real tasks.  Exact construction partitions pending
work into `productivePending` and `boundaryPending`; boundary work is absent from
macro units and ordinary DFS.  At a productive leaf the terminal authority schedules
arrival, latest feasible entry tasks, earliest feasible exit tasks, and departure,
then exact coverage and the normal hard validator remain the publication gates.
Historical inputs without the role retain the former terminal-transport path.

## Viability and cost

The existing deferred prerequisite reservation continues to propagate productive
deadlines through the explicit entry dependency chain and reserves/reuses or repairs
the grouped arrival witness.  Boundary materialization uses canonical hard start
domains and `canPlaceTask`, so participant availability, spaces, resources,
transitions, fixed availability and materialized meals remain hard.  It consumes the
shared search ledger per exact boundary candidate; exhaustion is reported as
`BUDGET_EXHAUSTED`, never as infeasibility.  Productive placements are never moved.

## Full A2 5k gate

Baseline A3-020: CORE 1,599 + standalone 3,401 branches, frontier 129, and first
ordinary blocker `task:10044 -> task:10148`.

Candidate (`PLANNER_NEXT_FULL_A2_BRANCH_BUDGET=5000`): EngineInput preflight and
adapter are `SUPPORTED`; canonical obligation count remains 269; 19 entry and 19 exit
tasks are deferred.  The former `task:10044 -> task:10148` ordinary-DFS phenomenon is
absent.  Productive depth reaches 130 and terminal materialization is attempted 78
times.  The run still ends `BRANCH_BUDGET_EXHAUSTED` at 5,000 branches: each terminal
attempt must repair the arrival witness after participant meals and exhausts the
remaining ledger before the first entry candidate (reported entry/exit branches: 0/0).
Consequently this candidate did **not** reach `COMPLETE + FULL_HARD_VALID`, and the
20k allowance was not used because exhaustion is not isolated to a single terminal
leaf (715 productive reservation prunes are also recorded).  The persisted record is
`docs/evidence/A2-FULL-EXEC-001-first-execution.json`.

This is a material causal shift rather than a claim of completion: boundary depth is
removed from productive DFS, but terminal participant meals invalidate the reusable
arrival witness.  A follow-up must include final meal geometry in the reparable virtual
reservation rather than repeatedly reaching terminal with a stale witness; raising the
budget would hide that causal problem and was deliberately avoided.
