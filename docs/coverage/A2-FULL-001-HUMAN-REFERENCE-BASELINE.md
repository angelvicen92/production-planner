# A2-FULL-001 — Human reference baseline and quality-evaluator checkpoint

## Purpose

This checkpoint normalizes the official human A2 planning into a versioned, anonymous, reference-only object keyed by canonical task identity. It is deliberately separated from Planner Next input: human times are forbidden as seed, lock, ordering hint, availability or fallback.

The same `evaluatePlanningQuality` function accepts any complete normalized A2 interval set, so human and generated plans use one KPI implementation rather than parallel formulas.

## Canonical coverage

- 19 anonymous participants (`C01`–`C19`).
- 266 participant-linked obligations.
- 3 technical obligations without participant.
- 269 canonical intervals total.
- Exact task-identity equality with the canonical Full A2 corpus.
- Canonical durations and 5-minute grid preserved.
- Explicit Master corrections preserved (C09 Sodexo, C12 40-minute Sodexo, C13 styling-out correction, C06/C10 joint sequence, C16 Alfombra-only correction, technical Reality/EVA chain).

Reference fingerprint:

`fcac15d561bea3f85c8f363c28cd5c7f3e338f109af5c556336b15caf1a5d149`

## Human baseline currently measurable without inventing configuration

### P01 — Main-flow continuity

- first Estudio 7 obligation: 11:15;
- last Estudio 7 end: 17:15;
- productive minutes: 285;
- authorized pause: 14:00–15:15 (75 minutes);
- unauthorized gap minutes: 0;
- unauthorized gap count: 0;
- continuity ratio: 1.0.

### P02 — Canonical makespan

- first canonical obligation: 09:00;
- last canonical obligation: 18:35;
- makespan: 575 minutes;
- main-flow end: 17:15.

### P03 — Participant presence

- aggregate presence: 7,585 minutes;
- mean: 399.2105263157895 minutes;
- median: 385 minutes;
- P90: 515 minutes;
- maximum: 545 minutes.

### P09 — Special operations

- 3/3 anchored Reality Plató operations preserve required adjacency;
- 2/2 joint groups are synchronized;
- 1/1 technical chain is contiguous;
- 9 paired Totales rounds start together;
- Totales 1 has one residual tenth round after Coreo is exhausted.

## KPIs intentionally blocked

The evaluator returns `BLOCKED_BY_CONFIGURATION`, never an approximation, for:

- P04 avoidable participant wait: requires explicit decomposition of mandatory vs avoidable waiting;
- P05 critical-resource presence: requires effective resource assignments, relevance/presence policy and avoidable resource-wait classification;
- P06 space continuity/utilization: requires effective capacities, continuity policies and authorized occupations;
- P07 blocks/setups: requires explicit scheduled setup/preparation occupations and effective block policies;
- P08 moves/zones: requires effective spatial hierarchy and transition contracts;
- P10 robustness/slack: requires the configured robustness threshold and effective transition slack.

P01 is also blocked if authorized main-flow breaks are not supplied to the evaluator.

## Source/configuration ambiguities that must not be silently repaired

### Styling capacity

The normalized human reference contains simultaneous styling-out intervals. The A2 Master specifies duration and ordering for styling but, unlike Croma, Redes, Pasillo and Corners, does not state a one-person capacity. The current canonical manifest's `styling capacity=1` therefore cannot be used as unquestioned source truth for the human comparison.

### Plató 14 — Recursos overlap

The contestant reference places `C01.redes` at 11:55–12:00 while the spaces reference places `C11.corner_influencer` at 11:50–12:00. Both map canonically to `p14-recursos`, and the Master states that Redes/Corners are single-person there. The normalized reference preserves both source timings and flags the conflict; it does not move either task.

Until these points are clarified by explicit effective configuration or authoritative source correction, the benchmark must not claim complete human hard-validity for space capacity.

## Direction

This checkpoint does not change Planner Next search, scoring, budgets, DB, UI or publication. Its value is measurement: it creates the stable human baseline and prevents the next motor iteration from being selected by intuition rather than by the Full A2 limiting gate/KPI.
