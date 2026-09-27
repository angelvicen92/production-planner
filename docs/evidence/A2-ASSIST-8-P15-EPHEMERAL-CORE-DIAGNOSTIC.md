# A2 Assist 8 — P15 ephemeral-core diagnostic

Date: 2026-09-27  
Baseline: `5f24e9b3dff5e2b09197f6f6ac5563c0816ebc17`

## Observation

The canonical benchmark remains blocked at Stage 5 (`NO_PROPOSAL`) after 65 accepted placements. The first hard-valid core reports 109 tasks: 65 protected placements and 44 additional pipeline placements. The preferred-resource macro is then entered with that core and evaluates 429 complete candidates, selecting `PREFERRED_RESOURCE_UNIT` as its only macro unit.

The generated benchmark Evidence does **not** contain `standaloneDiagnostic.firstHardValidCoreTasks`, despite the field being listed by the Assisted evidence projection. Consequently this checkout cannot produce the requested identity-level split (the 19 IN rows, 19 Estilismo Entrada rows, and any other ephemeral rows) from the canonical command. The aggregate `firstHardValidCoreLeaf` is present, but it is insufficient to prove which 44 placements are provisional or to compare them with the 65 accepted IDs.

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
