# Assisted A2: shared views, spatial hierarchy and repeatable restart

Base: `main 56e2fde35b935e2d75cb86d84face0c08be4a087`, merged #1114,
verified against the remote at start. Read AGENTS, official 00/01/03/04/05/06/07,
capability catalog, #1110 views/history Evidence and #1114 fidelity Evidence.
One logical branch/PR; no merge or connected Supabase/Replit writes.

## Causal audit before implementation

`plan-details → AssistedPlanningWorkspace → buildAssistedPlanningView →
PlanningTimeline` shares the existing renderer with Legacy. Live rows own task
identity, participant/template/execution metadata; the selected Draft or preview
owns time, space, zone and explicit resource placements. Neither a view change nor
sorting builds a new plan or invokes the solver.

| Observed behavior X | Cause Y → consequence Z | Delta W → expected observation M |
| --- | --- | --- |
| Contestants render 266/266 | Lanes group planned tasks by contestant, independently of spatial UI ordering | Keep this path; all task identities remain after visual sorting and view changes |
| Spaces have planned tasks but no columns | Vertical renderer filters `zoneCols` by non-null integer `uiOrderIndex`; old A2 import omitted it on all 23 zones. Unlocated/itinerant groups also required global UI indices. #1110 smoke configured them before checking the view | Explicit ordered topology in the import; Assisted treats missing display order as fallback order, not operational exclusion. Untouched import renders Timeline and List |
| Resources initially show no tasks | Empty resource selection returns the selection prompt; global localStorage can also retain IDs from another day | Assisted defaults to the current catalog and removes stale selection IDs. Explicit subsets still filter; Legacy retains explicit-selection behavior |
| Resource tasks with only space/zone assignments are absent | Resource lane builder reads direct `assignedResources` only. EngineInput already unions direct + space + zone assignments. Existing `zoneResourceAssignments` prop was unused by this builder and space assignments were not wired | Read the exact existing effective union from current Draft location; deduplicate each task within a resource lane. No invented assignment or copied task row |
| A2 consists of 23 isolated one-space zones | `a2ImportRows` independently generated `6001+i` for every canonical space | Versioned import mapping groups those same spaces under 10 explicit parents; tasks/settings/templates agree on the parent |
| Reset Draft leaves a completed A2 completed | Reset restores the current base Stage, normally S10, rather than the session bootstrap | Confirmed restart calls a guarded wrapper around `assisted_move_stage(S0,false)`; full accepted daily material and Draft return to the immutable initial snapshot |

Classification: **A + B**, with incomplete **projection of existing resource
relationships**, rather than globally missing tasks/assignments (C). Canonical
input has 72 directly assigned task rows and 140 task rows with applicable
effective assignments. Tasks without an applicable resource are legitimately
absent from resource lanes. These are code/controlled A2 reproductions; no claim
is made that a private remote snapshot or browser's persisted filters were read.

Filters are visual only. A valid explicit zone/resource subset still restricts
the view. Assisted ignores stale cross-day IDs; empty zone selection means all
zones, empty resource selection means all current resources. Legacy keeps its
historical empty-resource and hidden-unordered-group behavior. Resource union is
shared because it expresses existing effective assignments in either renderer.
Missing/conflicting zone-space identity suppresses zone inheritance, matching the
existing engine authority; malformed assignment arrays/IDs fail closed. A parity
unit test compares the projection directly with that authority on valid, sparse
and conflicting identities without importing engine code into the product UI.

## Spatial mapping and adoption boundary

`script/demo/a2SpatialTopology.ts` is the complete V1 source-identity mapping,
validated against the exact canonical space set. P14 contains Giratuto, Pasillo,
Recursos and its Hall; P15 contains Croma and Estrellas/Sillón; Salas Totales,
Caracolas, Reality and Transporte also have explicit grouped children. Source
identities in this offline mapping are structured canonical keys, not string
matching of display labels or runtime name heuristics.

The import materializes the supported product hierarchy `zones → spaces` and
its day snapshots. Space IDs, task IDs, resource assignments, capacities,
operational policies, scopes and all 266 obligations remain available. Offset
translation still applies uniformly. Grouping a parent introduces no extra
resource assignment, shared capacity or continuity restriction.

`demo:a2:prepare-import -- YYYY-MM-DD directory` now prepares this grouped,
unscheduled dataset and SQL, with topology version in its dataset. Existing
insert-only/backup/approval/collision guards remain; populated-project tests
assert every previous row and both global defaults remain literal. This prepares
a reproducible demo day; it **does not rewrite an already imported S10**, mutate
immutable historical snapshots, or infer the IDs of a connected catalog. Live
adoption/replacement of an older demo remains a separately reviewed operation.

The previous native fingerprint cannot literally stay equal when task `zoneId`
changes. The integration gate restores only those parent identities in memory
and compares the complete fingerprint to the previously certified native
baseline. A difference in time, resource, duration, meal, block or preparation
still fails. The canonical benchmark/solver input builder is unchanged.

## Restart contract

The UI explicitly confirms restoration of the session's Etapa 0, discarding the
current Draft, and retaining history/current day configuration. Local selection,
proposal preview, run polling and previous Autopilot progress are cleared after
success, and the accepted day is refetched. Manual and Autopilot flows use the
normal APIs again.

`POST /assisted/restart` requires production/admin authorization, the existing
Draft fingerprint/base guards and `confirmation=RESTART_BOOTSTRAP`. Native
service-role-only RPC 091 locks the active session and execution material,
checks both guards, resolves the bootstrap inside that session, then delegates
to the existing atomic Stage move. It clears Draft validation/edit/redo ledgers
and reapplies exact accepted task assignments through 086. It preserves revision,
Stage snapshots, runs, validations and exceptions for audit. Normal redo remains
possible; accepting a new branch archives the former future via existing 086.

Restart rejects days with any executed/in-progress/cancelled task or explicit
human lock, and sessions with queued/running proposals. It never clears execution
or locks. This conservative full-day guard is intentional. A generic session
bootstrapped with pre-existing placements returns to those placements; only an
initially unscheduled day such as this canonical A2 returns to 0/266. It does not
silently manufacture an empty replacement snapshot.

## Deferred continuity / placement diagnosis

The current A2 adapter gives Estilismo (`space:3018`) **no** secondaryContinuity
policy. `engineInputAdapter` sets `REQUIRED` continuity only for spaces with setup
policies; A2's setup policy belongs to P15 Estrellas/Sillón. Therefore styling
compaction cannot be attributed to a styling REQUIRED-continuity validator.

Entry comes from `anonymousPipelineWitness`'s serial geometry: it creates all
styling spots as `start + ordinal * duration`, matches identities to them and
tries joint arrival-feasible block boundaries earliest-first. The certified
in-memory S10 has 19 entry tasks, 09:55–13:05, with 18 zero gaps. Capacity 1
prohibits overlap; **it does not require zero gaps**. The zero gaps come from
this geometry/packing choice. Arrival grouping, dependencies and participant
margins then constrain which early block is jointly feasible.

Exit is a separate terminal closure/OUT problem.
`futureCollectiveParticipantClosure` computes predecessor release bounds, viable
closure/OUT domains and a lexicographically earliest complete matching. The
certified fixture has one early exit at 15:20, a 120-minute gap, then 18
consecutive exits ending 18:55. This itself disproves global uninterrupted
styling continuity; dense remaining slots are a domain/matching effect. The
current A2 `exit.after=0 / OUT.before=0` boundary enables immediate departure;
other participant boundaries still resolve the existing explicit/max/default
hard margin contract. Those hard gaps are independent of space continuity.

The next delta needs an explicit, versioned product contract from configuration
snapshot/override through EngineInput/adapter, construction/domain ordering,
future witnesses, validation and Evidence: continuity NONE/PREFERRED/REQUIRED
(explicitly map NONE to engine OFF), allowed continuity bridges and scope of a
block; separately role/instance placement bias such as EARLIEST/LATEST and its
interaction with serial geometry and terminal matching. Participant margins must
retain current HARD resolution and remain distinct from a soft placement bias.
Changing a continuity enum alone cannot change a prebuilt contiguous witness.
No solver, continuity or margin behavior is changed in this iteration.

## Validation

Machine-readable results and runtime hashes:
[ASSISTED-A2-DEMO-READINESS.json](ASSISTED-A2-DEMO-READINESS.json).

Focal tests cover ordering/filter defaults, stale selections, direct/space/zone
union and location moves, exact mapping/offsets/drift rejection, UI consent/wiring,
and native SQL restart conservation, stale/protected/running rejection and branch
acceptance. Native SQL unit fixture omits foreign-key wiring to isolate workflow
transactions; the real PostgreSQL/Auth/PostgREST/Chromium smoke keeps the complete
unaltered migration ledger and its relational constraints.

The full smoke uses an untouched import (no test-side UI-order repair), renders
all three views, checks visual sorting and Legacy resource parity, exercises
#1114's manual Draft fidelity and history timings, repeats alternate Stage orders,
then dismisses and confirms the actual restart control on completed A2 and runs
Autopilot through all ten new accepted Stages. Scope selection separately uses
the imported multi-space P15 parent and a same-name decoy.

No production catalog, Replit runtime or connected Supabase was contacted.

The local complete rehearsal passed 63 integration checks with S1 in 99,762 ms.
It preceded final hardening of null fingerprint rejection, conflicted/malformed
resource projection and mixed explicit/fallback visual ordering. Those cases were
then covered by 76 passing focal tests, renewed check/build and the native scope
rehearsal. JSON retains that rehearsal's exact hashes rather than claiming it ran
on later bytes. CI reruns the complete native/Autopilot/order gate on the final PR
head, alongside the product suite and deterministic canonical benchmark.

The broad suite caught the parity test's direct engine import under `client/`,
which the existing isolation guard also scans for tests. The read-only comparison
was moved to `engine/planner-next/integration/planningViewResourceProjection.spec.ts`.
The guard stays unchanged; its focused follow-up and parity cases pass (13 tests).
This correction changes test placement only, with no production/solver delta.
