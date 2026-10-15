# A2 27002 — causal configuration read audit

Base: `621303a3b3e1e3a2d745e35de9db0a0cbd28c7c9`.
Target: `codex/a2-27002-config-read-diagnostic`.

## Gate before behavior changes

**X está causado por Y y produce Z; el delta W debería permitir observar M.**

X: configuration GET returns 500, next-scope cannot recommend, and Autopilot
stops before proposing from S0/266. Y: `buildEngineInput` appends 52 unprotected
legacy `plan_breaks` as negative task IDs to 266 persisted obligations, then
`applyPlanPlannerNextConfiguration` requires the 266 positive-ID task operations
to cover all 318 entries. Z: `INVALID_PLANNER_NEXT_CONFIGURATION: incomplete task
operations`, before scope selection, representability or engine search.
W: use the existing structured-day meal authority at input projection, just as
`SupabaseStorage.syncPlanMealBreaks` already does: structured day policies own
their meals; legacy break projection belongs to legacy days. Preserve the rows,
and fail closed if a legacy break has an explicit locked boundary. M: the same
real 266 obligations/configuration load, recommend the main SPACE scope (19
obligations), and reach representability/search without the infrastructure error;
legacy days and protected breaks retain their existing authority.

Authority: official sources 00 v2.12, 03 v3.7, 04 v2.7 §§1–6,9–10,
05 v2.7 §§A2-ASSIST-0/1/8, 06 v2.9 and 07 v2.2 §4.4; `AGENTS.md`.
No solver ordering, matching, feasibility, budgets or planning contracts change.

## Observed baseline and falsification

Remote investigation used an enforced GET/HEAD-only transport guard on the
configured Supabase REST origin; RPCs and all mutations were rejected. 150 REST
requests completed without an HTTP error. No credentials, names, raw rows or
private captures are published. Full captures remain private under `/tmp`.

| Observation | 27002 | 27001 |
| --- | --- | --- |
| Date | 2026-10-31 | 2026-10-30 |
| Persisted obligations / configured operations | 266 / 266 | 266 / 266 |
| Missing positive operation identities | 0 | 0 |
| Legacy break rows | 52 (49 space, 3 itinerant) | 0 |
| Explicitly locked break boundaries | 0 | 0 |
| Active draft placed obligations | 0 | 266 |
| Real input/configuration/next-scope reads | same exception | succeed / succeed / empty completed scope |

All 52 breaks last 75 minutes; 49 have legacy planned times. These are not
accepted/protected obligation placements: the active snapshot contains only the
266 positive daily task identities. Neither restart nor this correction deletes
or rewrites those break rows. The audit establishes the projection conflict,
not which historical request originally inserted them.

The exact exception was reproduced offline using captured REST responses through
the real `SupabaseStorage` and `buildEngineInput`. Counterfactually omitting only
the 52 legacy projections produced 266 tasks, successful configuration read,
SPACE 48 / 19-task recommendation and `SUPPORTED` adapter with zero issues.
Configuration readiness remains `INCOMPATIBLE` when the existing optimizer
authority reports compatibility warnings; a successful read does not assert
that every optimization setting is supported.

## Real HTTP paths and first failure

1. `GET /api/plans/:id/effective-configuration` → role/auth boundary →
   `getEffectiveConfigurationResponse` → `buildEffectiveConfigurationView` →
   `buildEngineInput` → `applyPlanPlannerNextConfiguration` coverage check.
   The baseline maps its exception to `EFFECTIVE_CONFIGURATION_UNAVAILABLE`.
2. `GET /api/plans/:id/assisted/next-scope` → role/auth boundary →
   `assistedAction` → `AssistedPlanningService.recommendNextScope` → same input
   failure. `recommendNextAssistedScope` is never entered. Unexpected errors
   escape the Assisted-specific boundary to the generic server handler.
3. Complete automatically is client-side `AssistedAutopilot`, not a separate
   global planning endpoint: GET Assisted state → GET plan → GET next-scope →
   POST proposals → GET proposal run → POST apply/validate/accept. From the
   observed clean S0, next-scope is the shared failing input path, before POST
   proposals or any engine call. The baseline maps it to a generic stop message.

`GET /api/plans/:id` calls `syncPlanMealBreaks`; it was deliberately not invoked
against the shared database. Local HTTP tests may exercise it on disposable data.

Classification: source reads succeed; effective input composition fails;
representability and scope selection are not reached in the baseline; this is
not an infeasibility or search-budget certificate. 27001 is a preserved completed
baseline, not evidence that the cold 27002 search will complete.

## Delta and observed after-state

`legacyBreaksForEngineInput` selects the same meal authority as the existing
structured-day sync guard. It leaves legacy-day projection intact, and refuses
to omit any break with `locked_start`/`locked_end`. The stored structured schema,
positive task-operation coverage, protected decisions and search remain unchanged.
Known input-contract/coverage/locked-break failures now have a fixed
`PLANNING_CONFIGURATION_CONFLICT` HTTP category and a Spanish operational message.
Server diagnostics contain only reason categories and aggregate counts; the
response/Autopilot never copy Zod inputs, rows, SQL, IDs or raw exception text.

[Real input replay](A2-27002-real-input-replay.json) uses all the actual captured
reads through production storage/input/configuration/scope code, not a generated
canonical input. It confirms the existing persisted revision fingerprint matches
the repaired input. The full 27001 input and configuration view are deep-equal to
the base. Actual 27002 optimizer compatibility warnings remain visible.

The initial real-data engine execution finishes at its **unchanged 300-second
limit**, after 38,640 branches (6,782 core / 31,858 standalone; configured branch
limit 100,000), with `ASSISTED_SCOPE_INCOMPLETE` and `SEARCH_TIME_LIMIT_REACHED`.
There is no proposal and no infeasibility claim. This is a separate, measured
search limit, not the original infrastructure failure. No search work is changed
or opened in this unit.

## Validation

- TypeScript application and disposable integration harness: pass.
- Migration sequence validation and production build: pass; no migration diff.
- Focal coverage: input projection with the 52 observed rows, locked boundaries,
  missing positive operations, safe HTTP errors, Autopilot error handling,
  next-scope, native restart, snapshot authorities, A2 import and HTTP permissions.
  The ten affected test files pass (the HTTP middleware test needs socket access).
- Native disposable PostgreSQL/Auth/PostgREST/product HTTP comparison uses the
  entire migration ledger, the historical catalog, the observed 52-row fixture
  including its three old itinerant-unit references, 27001/11 Stages, and another
  day with 333 obligations. Its new day is 2026-10-31/S0/266. This separately
  exercises the native schema and real endpoints; it does not claim the generated
  local optimizer defaults are identical to the real captured configuration.
  Run: `CONFIG_READ_BASELINE_ROOT=<base checkout> node --import tsx
  script/demo/smokeA2Integration.ts <private output> --historical-topology
  --configuration-read-recovery`.
- CI adds this native regression and publishes only sanitized request/run
  Evidence. Private application logs and raw captures are excluded.

[Native HTTP before/after](A2-27002-native-http-recovery.json): **PASS**, using all
97 native migration files. Base: configuration 500, next-scope 500, Autopilot
stops at SELECTING. Candidate: configuration 200, next-scope 200 / 19 tasks,
proposal request 202 and run read 200. The persisted run returns
`NO_PROPOSAL / SEARCH_TIME_LIMIT_REACHED`; Autopilot consequently stops with
`RUN_NO_PROPOSAL`, with its result Evidence available. The harness uses the
existing Autopilot retry for aborted GET polling; no mutation is retried.
Native restart then preserves the full history/configuration, all 52 break rows,
all 266 obligations and the old 27001/11-Stage + 333-task other-day fixtures.

Remote validation is tracked on the
[target branch's CI runs](https://github.com/angelvicen92/production-planner/actions?query=branch%3Acodex%2Fa2-27002-config-read-diagnostic).
The base's [Baseline CI](https://github.com/angelvicen92/production-planner/actions/runs/38675793907)
was already green; its green build did not cover this persisted legacy-break
coexistence, which is now a native regression case.

No shared database writes, migrations, A2 regeneration or obligation changes.
No merge. GitHub currently has the specified branch at the base without an
associated PR; work remains on that branch and no parallel PR is created.

## CI follow-up (test boundary / diagnostic only)

The first [Planner Engine CI](https://github.com/angelvicen92/production-planner/actions/runs/38678378337)
passed 2,932 product tests but rejected the new server-side test's direct adapter
import through the existing isolation gate. The entire new test is moved to
`script/demo/a2ConfigurationReadRecovery.spec.ts`, retaining its assertions and
explicit CI execution. The isolation gate now passes; its allowlist is unchanged.
The complete preference/configuration/Stage integration and Baseline CI passed.

That run's new HTTP regression also stopped before observing a run result; its
original failure artifact did not include the controller stop code. No
production/search repair is inferred from that incomplete trace. Focused test
instrumentation now records only the controller code, request statuses/transport
error categories, and the disposable persisted run's status/result presence,
with URLs and bearer/JWT values redacted.

[The same regression on CI's Node 20.20.2](A2-27002-node20-http-recovery.json)
passes locally: a timed-out GET is retried by the existing Autopilot authority,
the run is persisted successfully with `SEARCH_TIME_LIMIT_REACHED`, and restart
and historical preservation pass. The remote failure has not reproduced, so
only diagnostic instrumentation is added for it. The productive correction is
unchanged from `ad5c1ed`; remote CI is rerun on the updated test/diagnostic head.
