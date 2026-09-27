# A2 Assist 8 — P15 ephemeral-core diagnostic

Date: 2026-09-27  
Baseline: `5f24e9b3dff5e2b09197f6f6ac5563c0816ebc17`

## Observation

The canonical benchmark remains blocked at Stage 5 (`NO_PROPOSAL`) after 65 accepted placements. The first hard-valid core reports 109 tasks: 65 protected placements and 44 additional pipeline placements. The preferred-resource macro is then entered with that core and evaluates 429 complete candidates, selecting `PREFERRED_RESOURCE_UNIT` as its only macro unit.

The generated benchmark Evidence now persists `standaloneDiagnostic.firstHardValidCoreTasks`. At the blocked fifth iteration it records all 109 immutable-core placements with `id`, `kind`, `participantId`, `spaceId`, `start`, `end`, and `protected`: 65 are protected and 44 are unprotected pipeline supporting placements. The aggregate records 109 pipeline-materialized tasks, 109 immutable-core tasks, 65 protected tasks, and zero excluded pipeline-only tasks after the counterfactual was reverted.

The canonical result remains `NO_PROPOSAL` at 65/266 completed obligations. The preferred-resource unit reaches 425 complete matching candidates and ends in `PRUNE`; the subsequent exact blocker remains standalone branch-budget exhaustion (19 core branches plus 99,981 standalone branches). No P15 placement is accepted, so the accepted Croma block count remains zero; the previously accepted 65 placements are unchanged. The benchmark reports `deterministicEquivalent: true`.

## Causal boundary in the current architecture

The execution order is:

1. `materializePipelineBundleMatching` materializes the real participant pipeline bundle.
2. Its tasks become `structuralTasks`.
3. `structuralTasks` plus the fixed placements become `immutableCoreTasks`.
4. `searchStandaloneForCoreCandidate` closes over that core for the entire standalone search.
5. `exactPreferredResourceUnit` receives `[...coreTasks, ...placed]`; therefore every pipeline placement in the core is an occupied interval while the future structural unit is evaluated.

`analyticalReservedPlacements` already filters a **prepared pipeline matching graph** against a structural reservation. However, the prepared graph and rematerialization callback are not carried across the core/standalone boundary. Once standalone begins, `coreTasks` is fixed and all of its domain caches, macro checks, terminal validation, meals, transport, and future authorities reference that fixed array.

## Stop decision

This iteration stops under gate C. Applying `analyticalReservedPlacements` only inside `exactPreferredResourceUnit` would establish that an alternative matching exists, but could not substitute the rematched supporting placements into the state validated by the continuation. Doing so correctly requires a narrow new seam: the core boundary must pass a prepared pipeline graph plus a deterministic `reserve-and-rematerialize` operation into standalone, and standalone must evaluate a macro continuation against the returned core while retaining fixed/protected placements verbatim. Without that seam, a local patch would either be diagnostic-only or would require broad mutable-core/threading changes across standalone recursion and caches.

No search policy, budget, hard constraint, placement, database, API, or UI was changed.

## Follow-up audit — smaller seam candidate

A subsequent source/code audit found a narrower candidate than making the core mutable after standalone begins.

`runExactItinerantPlanSearch` already computes `standaloneTasks` as all non-core, non-fixed tasks. Arrival transport and entry styling therefore naturally remain pending unless `onHardValidCoreLeaf` promotes them from `pipeline.scheduledTasks` into `structuralTasks` and then `immutableCoreTasks`.

The current placement authority allows a task whose predecessor is not yet materialized, provided any already-materialized endpoints remain temporally consistent. Arrival transport is then materialized terminally against the substantive obligations. Therefore a smaller generic counterfactual exists:

- preserve every fixed/protected placement verbatim;
- preserve the pipeline matching as a feasibility witness;
- do not promote pipeline-only, unprotected supporting tasks into the immutable core;
- leave those supporting tasks in the existing standalone/terminal machinery so they can be materialized around the selected structural macro.

This is not yet a product conclusion. It must be tested causally before introducing a prepared-graph rematerialization seam. If the smaller seam cannot preserve the pipeline contract or fails to rescue P15, only then should the broader reserve-and-rematerialize seam be reconsidered.

## Counterfactual result — smallest exclusion seam

The identity-based counterfactual was executed on 2026-09-27: only the `main`/`vocal`/anchored structural authority and fixed placements were retained in the immutable core, while the 44 unprotected pipeline-only placements were returned to the existing standalone machinery. The focused exact-itinerant suite remained green, but the canonical `benchmark:planner-next:a2-assist-8` did not complete its contractual waterfall. It spent more than 25 minutes inside the newly enlarged standalone search and then failed the benchmark invariant `A2 must attempt the scarce Reality C + EVA continuity unit`; it never produced canonical Stage 5 Evidence or a P15 proposal.

This is gate C, not a sound production seam. The pipeline-only rows are not equivalent to unrelated standalone tasks: their feasible identities are coupled by the prepared pipeline perfect matching. Dropping only their placements also drops the matching cohort/edge choice that makes the pipeline witness executable, so ordinary standalone DFS has neither a bounded rematerialization unit nor the prepared matching state needed to repair it around a later macro.

The productive exclusion was therefore reverted. The state that must survive the core/standalone frontier for a future broader seam is narrowly identified as:

- the prepared pipeline graph and current deterministic perfect-matching witness;
- the fixed/protected placements, retained byte-for-byte as hard exclusions;
- the set of pipeline-only unprotected supporting identities eligible for rematerialization;
- a deterministic reservation/rematerialization operation returning a coherent replacement cohort after a structural macro reservation.

No mutable core, broad prepared-graph threading, budget change, HARD relaxation, or `reserveAndRematerialize` implementation is retained in this iteration. The only code change retained is read-only observability: the first hard-valid core snapshot is captured before later arrival/future-reservation exits, and its aggregate now reports pipeline materialization count, immutable-core count, protected count, and excluded pipeline-only count (zero after reverting the counterfactual).
