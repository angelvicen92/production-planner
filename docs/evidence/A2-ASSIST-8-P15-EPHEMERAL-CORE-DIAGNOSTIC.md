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
