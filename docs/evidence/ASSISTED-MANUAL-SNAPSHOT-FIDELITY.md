# Assisted manual Draft snapshot fidelity

Base: `main 138900801c27fad3bd53e75ce83e86f884fda53c`, verified remotely at start.
Branch: `fix/assisted-manual-draft-snapshot-fidelity`. No merge or production writes.
Authorities: official sources 00 v2.10, 03 v3.6, 04 v2.5 §§5–6,9–12,
05 v2.6, 06 v2.7 and 07 v2.2; existing capability catalog and execution protocol.

## Reproduction before implementation

The fixture was captured from the unmodified ten-stage `runA2Assist8Evidence`
service flow. It contains 266 placed obligations (247 productive tasks + 19
participant meals), 8 operational meals, 17 round preparations and 1 setup
preparation. Task 10048 is OUT C04, originally 18:55–19:00. Participant C04 ends
availability at 19:00; the global day ends at 21:00.

This is a representative canonical S10 replay, **not an export of the remote
Supabase S10**. No remote snapshot or validation report was supplied. Therefore
no inference is made about pre-existing violations in the remote Stage. The
canonical baseline has none. The recovery generator requires a later exact
export and rejects any difference outside the single specified edit.

Machine-readable reason codes, anonymous codes and exact canonical/product
violations: [ASSISTED-MANUAL-SNAPSHOT-FIDELITY.json](ASSISTED-MANUAL-SNAPSHOT-FIDELITY.json).
Replay: `node --import tsx engine/planner-next/benchmarks/runAssistedManualSnapshotFidelityEvidence.ts work/manual-evidence.json`.

| Case, with canonical authorities | Reasons | Anonymous reasons |
|---|---|---|
| A. Original S10, all entities | none | none |
| B. C04 OUT 19:00–19:05, all entities | availability, transport grouping | transport grouping |
| C. Same Draft, both preparation arrays omitted | availability, round preparation, secondary continuity, setup preparation, transport grouping | all except availability |

The old manual call path also omitted participant and operational meal
arguments, even when those placements existed in the snapshot. Before the
change, validating the intact canonical Stage generated seven spurious families.
Isolated omission tests establish their causes:

| Omitted context | Resulting reasons on otherwise intact S10 |
|---|---|
| Setup preparation | SETUP_PREPARATION_VIOLATION, SECONDARY_CONTINUITY_VIOLATION |
| Round preparations | ROUND_PREPARATION_VIOLATION |
| Operational meals | OPERATIONAL_MEAL_VIOLATION, BLOCK_VIOLATION, ROUND_PREPARATION_VIOLATION |
| Participant meals | PARTICIPANT_MEAL_VIOLATION, DEPENDENCY_VIOLATION |

The complete moved Draft exposes a real availability violation with product
identity `taskId=10048`, `spaceId=3023`, interval `[1140,1145]`, severity HARD.
Moving this OUT also splits the 18:55 departure packet, introducing a 19:00
packet only 5 minutes later; its configured minimum separation is 20 minutes.
`validateTransportGrouping` reports a count and packet groups, but `validatePlan`
does not emit an exact `ValidationViolationDetail` for that family. Its aggregate
cannot become an AcceptedException.

**Stop condition reached:** transport identity remains unsupported even with
complete occupations. This PR does not extend that validator, grandfather an
aggregate, suppress a reason, or accept S11. `/assisted/validate` continues to
return `ASSISTED_DELTA_VALIDATION_UNSUPPORTED` for this particular moved Draft.

## Cause and implementation

`PATCH /assisted/draft` → `AssistedPlanningService.patchDraft` → snapshot builder
previously forwarded only tasks, blocks and operational meals. Block edits and
reset repeated that incomplete reconstruction. The new shared snapshot rebuild
passes every current SnapshotV1 field; reset reproduces the base fingerprint.

Manual validation previously materialized productive tasks, projected Assisted
without protected auxiliary context, executed planning, then called
`validatePlan` with tasks alone. It now uses the same product-to-canonical
materializer as automatic proposals and passes operational meals, participant
meals, setup/round preparations and configured fixed resource/unit meals through
the existing Assisted projection and canonical validator. No solver search runs
for a manual replay. Participant meal source identities remain product identities
through the adapter. Automatic proposal materialization was lifted literally and
its solver, rules, budgets and fingerprint contracts are unchanged.

SnapshotV1 has no field for a separately scheduled space meal. No such interval
is invented; a required but unrepresented occupation remains fail-closed.
Unknown or unprojectable authorities are likewise not given invented identities.
Existing exact AcceptedException inheritance and changed-task checks remain in
the service. An unchanged accepted Stage without an ACTIVE exact exception does
not authorize grandfathering a newly discovered violation.

Migration `090_assisted_manual_snapshot_fidelity.sql` retains the 081 task/block
edit ledger and locks, but rejects any difference in all other top-level fields
before any write. This protects existing meals/preparations and future structural
fields against omission, mutation or insertion by a stale producer. Undo/Redo
modify only the task/block deltas, so those fields remain unchanged. A historically
truncated Draft requires explicit reviewed recovery; 090 does not silently repair
it. The SQL contract catalog now points to 090 for preflight/adoption parity.
The migration was executed only in disposable test databases.

## Tests and verification

`server/assistedManualSnapshotFidelity.spec.ts` exercises the real 081/090 SQL
functions in PGlite: complete A/B/C validation, isolated omissions, task move,
block edits, Draft Undo/Redo, exact S10 reset, atomic rejection of structural
changes, no validation record for an anonymous family, and unchanged Stage/
accepted daily material. Existing workflow/proposal/snapshot/block tests cover
exact AcceptedException inheritance and the automatic boundary.

`script/demo/a2DraftPreparationRecovery.spec.ts` verifies the offline preflight,
default rollback, backup/review gates, native SQL repair in a disposable database,
concurrent edit rejection, immutable base requirement and preservation of all
accepted/audit/other-day material.

The full disposable A2 journey additionally exercises these manual operations
through the actual product HTTP API, PostgREST, Auth and native PostgreSQL after
building the ten accepted Stages via Chromium. It then runs the existing
alternate-order and Autopilot gates. No accepted task is written during manual
editing or validation.

The isolation gate adds only the new manual-validation spec to its explicit test
allowlist. The new replay probe lives under `engine/planner-next/benchmarks`; no
new production entry point is permitted.

The in-memory automatic baseline remains
`22d728894bd73c9cddc7acb5dbd1f518d60f36f910ec2895b3035f07be95d679`.
The native baseline remains the previously certified
`557d0efe105e7a2257f4f7754150e8aff814581ec943e5f623dbbc3640f147b9` from
`docs/demo/A2-STAGE-ORDER-EVIDENCE.json`. These are different representations:
the native import persists duration overrides on 266 rows and direct resource
assignments absent/different on 248 in-memory rows. A read-only comparison of
the disposable native S10 proves every placement and all other task fields,
meals and preparations identical. See
[representation comparison](ASSISTED-MANUAL-SNAPSHOT-REPRESENTATION.json).
Neither baseline fingerprint is changed by this PR.

[Native manual replay](ASSISTED-MANUAL-SNAPSHOT-NATIVE.json) records zero baseline
reasons, the two genuine moved-Draft reasons, exact product identity, preserved
accepted material and passing task/block Undo/Redo/reset.

Final verification on the candidate:

- `npm run check`, integration TypeScript and explicit replay/recovery TypeScript: PASS.
- `npm run check:migrations` (through 090), `npm run build`, `git diff --check`: PASS.
- Product CI selection: 372 spec files executed; 367 initially passed. The five
  initial failures were resolved and verified without disabling assertions:
  the new spec needed its explicit isolation allowlist entry; capability audit,
  replay workers and HTTP authorization required local subprocess/socket access;
  the untouched V3 scenario suite required the preconfigured OR-Tools venv
  (`/workspace/.venvs/production-planner`, OR-Tools 9.15.6755), rather than the
  system Python without OR-Tools. All five final follow-ups pass. The two
  historical diagnostics excluded by the existing CI workflow remain excluded.
- Focused workflow/proposal/snapshot/block tests, six native-SQL fidelity cases,
  five recovery cases, existing import/catalog/security tests and ten UI test
  files: PASS. Null active-stage and concurrent-change recovery preflights fail
  closed as expected.
- Canonical template benchmark repeated twice: identical stdout, Evidence,
  coverage artifacts and fingerprints; no certified artifact diff.
- Causal manual replay repeated: byte-identical Evidence.
- `npm run demo:a2:smoke -- work/a2-manual-integration --full --stage-order --autopilot`:
  PASS, 62 integration checks, native migrations through 090, 266/266, all 8
  meals and 18 preparations, exact certified fingerprint, both alternate-order
  experiments repeated and all Autopilot scenarios. Native first-stage generation
  was 102372 ms, below the 120000 ms objective. The original in-memory capture
  was 76341 ms; these are different execution/representation contexts, not a
  same-runtime performance comparison. No solver budget was changed.

[Integration summary](ASSISTED-MANUAL-SNAPSHOT-INTEGRATION.json) includes source
hashes, native migration hashes, stage timings and the actual manual report.
An early native run correctly flagged a missing 090 SQL-catalog registration,
and an early test import initialized the parent client before its local setup;
both harness dependencies were corrected. Another attempt overlapped the global
suite in this two-CPU environment and timed out waiting for its first proposal.
The final complete rehearsal ran without that suite and passed the existing
budgets. No production fix was used to hide those failures.

## Recovery, prepared only

See [the recovery procedure](ASSISTED-MANUAL-DRAFT-RECOVERY.md). It restores exact
preparations from the immutable base while preserving C04's moved interval,
clears the now-stale Draft validation pointer and changes only that session's
Draft snapshot/fingerprint/timestamp. It does not execute on Supabase from Codex,
modify Stage S10, accepted daily_tasks, another day, history or AcceptedExceptions.
The old corrupted edit ledger remains untouched; its Undo is consequently
blocked by `CORRUPT_EDIT_LEDGER`, an explicitly documented recovery limitation.
