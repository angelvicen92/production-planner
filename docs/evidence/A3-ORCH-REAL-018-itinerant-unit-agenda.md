# A3-ORCH-REAL-018 — itinerant unit agendas

Base: `c219c4b8104435479ed6314f1f1ffd6619b47db3`  
Candidate command: `PLANNER_NEXT_FULL_A2_BRANCH_BUDGET=5000 PLANNER_NEXT_FULL_A2_CAUSAL_DIAGNOSTIC=false npx tsx engine/planner-next/benchmarks/runFullA2FirstExecutionBenchmark.ts`

## Implemented contract

`itinerantUnitId` now creates an `ITINERANT_UNIT` selector scope only for residual standalone tasks that are not already owned by joint, technical-chain, round, setup, transport, or anchored/core authorities. The scope keeps the original tasks and their original resources; it creates neither an aggregate task nor a resource alias. Its explorer chooses the next member from the current exact dynamic domains and explores each real placement through the normal macro continuation. Consequently every member placement consumes the shared ledger and reruns pending-prerequisite/Future Feasibility, virtual IN reservation, operational-meal reservation, participant-meal probe where applicable, and the remaining dynamic domains.

The top-level probe does not enumerate agendas. It reports the minimum individual dynamic domain as a conservative signal; it is exact only when an individual exact domain is empty, which is a sound zero certificate. No span, adjacency, contiguity, ID order, or resource-derived grouping was introduced.

## Focused evidence

`npx tsx --test engine/planner-next/itinerantUnitAgenda.spec.ts` passes four focused cases:

- two members of one explicit unit become one scope, remain individual scheduled tasks, and retain a ten-minute free gap;
- internal MRV can choose `z` before `a`, proving that ID does not impose operation order;
- two explicit units with disjoint members overlap, while a shared member resource is kept non-overlapping by existing placement authority;
- joint authority takes precedence, a task without `itinerantUnitId` remains `RESOURCE_TASK`, inputs are immutable, fingerprints are input-order invariant, and no fictitious/duplicate task or unit resource is emitted.

## Full A2, 5k

The canonical runner completed in approximately **28 s wall-clock** in this environment and stopped, as expected at this budget, with `BRANCH_BUDGET_EXHAUSTED`. It preserved exact accounting at **5,000 = 1,599 CORE + 3,401 STANDALONE**, reached standalone frontier **129**, and retained blockers `task:10085` and `task:10144` (four observations each).

The baseline had **84** initial macros, including nine itinerant standalone `RESOURCE_TASK` macros. The candidate has **78** initial macros: **3 `ITINERANT_UNIT`**, 70 `RESOURCE_TASK`, 2 `JOINT`, and one each of setup, round, and technical chain. Thus the only structural delta is the expected six-macro reduction: nine operations are represented by three explicit scopes.

First selection:

- scope: `itinerant:itinerant-team:5003`;
- reason: `mixed-domain-semantic-policy` with conservative domain signal 54;
- first internal operation: `task:10169`;
- internal reason: `minimum-dynamic-domain` (54 starts).

Visited agenda evidence (real placements, gaps preserved):

- `itinerant-team:5003`: `task:10169` 555–585, `task:10154` 590–620, `task:10081` 625–655, `task:10041` 660–675, `task:10173` 675–690;
- `itinerant-team:5001`: `task:10263` 705–735, `task:10124` 740–770;
- `itinerant-team:5002`: `task:10139` 695–725, `task:10237` 730–760.

The two latter units overlap from 705–725 because their member authorities permit it. Agenda accounting was **3 visits, 12 branches, 3 backtracks**. Operational propagation remained active: nine operational-meal prunes, no participant-meal prune, and the first macro forward blocker was the existing pending-arrival deadline (deadline 530) while visiting unit 5003. Setup/round preparations were not committed before budget exhaustion. CAM1/CAM2, coaches, setup, meals, transport, spaces, participants, prerequisites, and member resources continued through their existing authorities; no candidate plan was published and therefore no claim of terminal hard validity is made. Diagnostic on/off invariance remained exact, and the focused complete scenarios passed terminal hard validation and deterministic input-order invariance.

No 10k run was needed: the 5k result has the requested structural change without an ambiguous accounting or frontier regression. No phase gate was added.
