# A3-ORCH-REAL-022 — participant presence closure reset

## Candidate

Base `9209e782a934070befc336763be7b67e722cadab`. The candidate introduces an explicit
boundary-role contract, removes those canonical tasks from productive DFS, applies a
necessary-only collective boundary probe, and invokes one exact terminal closure after
operational-meal materialization.

## Full A2 gate evidence

| measurement | 5k | 20k |
|---|---:|---:|
| preflight / adapter | SUPPORTED / SUPPORTED | SUPPORTED / SUPPORTED |
| productive maximum depth | 130 | 130 |
| productive-complete leaves | 193 | 1,420 |
| analytic presence checks / prunes | active; not yet serialized by the legacy benchmark | active; not yet serialized by the legacy benchmark |
| boundary collective capacity checks / prunes | active; not yet serialized by the legacy benchmark | active; not yet serialized by the legacy benchmark |
| terminal closure attempts | 0 | 0 |
| arrival witnesses tried | 0 | 0 |
| exact ENTRY / meal / EXIT branches | 0 / 0 / 0 | 0 / 0 / 0 |
| departure witnesses tried | 0 | 0 |
| terminal backtracks | 0 | 0 |
| first exact terminal failure | none (closure not entered) | none (closure not entered) |
| deepest terminal stage | not entered | not entered |
| CORE / productive / closure branches | 1,599 / 3,401 / 0 | not separately emitted / 20k total / 0 |
| wall clock | approximately 55 s | approximately 190 s |
| final hard validity | false (budget exhausted) | false (budget exhausted) |

The 20k run increased productive-complete leaves but did not cross the same
operational-authority boundary or materialize ENTRY, EXIT, or departure. In accordance
with the gate, no 50k run was made. Both runs published zero canonical obligations;
there is no partial-plan publication. The target remains 269 obligations exactly once.

## Result and residual risk

The architectural reset and isolated closure tests are implemented, including atomic
budget exhaustion and collective ENTRY overload. The Full A2 acceptance target is **not
met**: both permitted runs ended `BRANCH_BUDGET_EXHAUSTED` before the closure was entered,
so `COMPLETE + FULL_HARD_VALID` is not claimed. The next causal unit is the terminal
operational-meal authority cost; it must be resolved without raising the budget or
persisting exact participant-presence witnesses during construction.
