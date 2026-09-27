# A2 Assisted — ARRIVAL self-boundary regression

- Base: `474482bdca104672611da5f784809f3d2e6a1a00`.
- Scenario: canonical A2 Assisted, with unchanged hard authorities, stage order, budgets, P15, and pipeline matching.
- Counterfactual: the core ARRIVAL feasibility gate derives participant obligations only from non-transport core rows, matching terminal transport materialization.

## Demonstrated cause

The Stage 2 regression was caused by treating an already materialized ARRIVAL row as its participant's own substantive obligation. Its start then replaced the first non-transport obligation as the ARRIVAL deadline, so the solver required that ARRIVAL to finish no later than its own start and returned a false `INFEASIBLE` result. The focused regression test reproduces the pre-fix deadline change, then proves that adding or reordering a materialized ARRIVAL leaves the substantive deadline and deterministic witness unchanged.

The production correction filters all IDs owned by the transport policy before computing core ARRIVAL boundaries and before passing core occupations to the contiguous ARRIVAL solver. Availability, transition margins, group sizes, minimum gap, and every other hard authority remain unchanged.

## Canonical waterfall after correction

| Stage | Operational unit | Result | Completed |
|---|---|---:|---:|
| S1 | Main pipeline | PROPOSAL | 19/266 |
| S2 | Main feeders | PROPOSAL | 38/266 |
| S3 | Reality C + EVA continuity | PROPOSAL | 46/266 |
| S4 | Totales rounds | PROPOSAL | 65/266 |
| S5 / P15 | P15 operations | NO_PROPOSAL | 65/266 |

At the recovered S2 gate, `coreLeafTransportPrunes=0`. ARRIVAL is materialized as packets `[3,3,3,3,3,3,1]` at starts `[545,575,605,635,665,695,725]`. The first hard-valid core still contains 82 tasks: 19 Main, 19 vocal, and 44 auxiliary/supporting rows. Thus the former 19/266 frontier is no longer current; the canonical run again reaches P15 and preserves zero new HARD and REQUIRED violations.

## Unchanged next blocker

P15 remains `NO_PROPOSAL` after 19 core branches and 99,981 standalone branches. The preferred-resource unit has 36 members (19 resource tasks and 17 setup tasks), enumerates 228 geometries, makes 652 matching attempts with 425 successes, and ends with `terminalFutureResult=PRUNE`. No P15 proposal is accepted, so Croma, Sillón, and Estrellas receive no accepted placements in this stage.

The first exact blocker is Planner Next standalone branch-budget exhaustion (`STANDALONE_BRANCH_BUDGET_EXHAUSTED`) at 65/266. This iteration does not modify or optimize that later blocker. The regenerated canonical Evidence is deterministic-equivalent and reports zero final HARD and REQUIRED violations.
