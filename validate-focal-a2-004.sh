#!/usr/bin/env bash
set -uo pipefail

artifact="planner-next-focal-a2-band-preferred-v2.json"
legacy="planner-next-focal-a2-band-preferred-v1.json"
failed="planner-next-focal-a2-band-preferred-v2.failed.json"
manifest="engine/planner-next/benchmarks/focal-a2/focalA2BandPreferredV2HistoricalManifest.json"
requested_mode="${1:-auto}"
tmp1="$(mktemp)"
tmp2="$(mktemp)"
trap 'rm -f "$tmp1" "$tmp2"' EXIT

fail() {
  local reason="${1:-UNKNOWN_FAILURE}"
  node - "$failed" "$reason" <<'NODE'
const fs = require("node:fs");
const [path, reason] = process.argv.slice(2);
fs.writeFileSync(path, `${JSON.stringify({
  version: "planner-next-focal-a2-band-preferred-v2",
  accepted: false,
  reason,
}, null, 2)}\n`);
NODE
  exit 1
}

if [[ -f "$artifact" ]]; then
  mode="current"
elif [[ -f "$legacy" ]]; then
  mode="legacy"
else
  fail "NO_CURRENT_OR_LEGACY_ARTIFACT"
fi
if [[ "$requested_mode" != "auto" && "$requested_mode" != "$mode" ]]; then
  fail "MODE_ARTIFACT_MISMATCH"
fi
[[ -f "$manifest" ]] || fail "MISSING_HISTORICAL_MANIFEST"

protected_path="$artifact"
[[ "$mode" == "legacy" ]] && protected_path="$legacy"
protected_sha="$(sha256sum "$protected_path" | cut -d' ' -f1)"

npm run check || fail "NPM_CHECK_FAILED"
node script/run-test-suite.mjs engine/planner-next || fail "PLANNER_NEXT_TESTS_FAILED"
npm test || fail "NPM_TEST_FAILED"
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2BandPreferredBenchmark.ts >"$tmp1" || fail "BENCHMARK_FIRST_RUN_FAILED"
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2BandPreferredBenchmark.ts >"$tmp2" || fail "BENCHMARK_SECOND_RUN_FAILED"

node - "$tmp1" "$tmp2" "$manifest" <<'NODE' || fail "ARTIFACT_GATES_FAILED"
const fs = require("node:fs");
const [firstPath, secondPath, manifestPath] = process.argv.slice(2);
const clean = (value) => Array.isArray(value)
  ? value.map(clean)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).filter((key) => key !== "runtimeMs").sort().map((key) => [key, clean(value[key])]))
    : value;
const first = JSON.parse(fs.readFileSync(firstPath));
const second = JSON.parse(fs.readFileSync(secondPath));
const manifest = JSON.parse(fs.readFileSync(manifestPath));
const expect = (condition, code) => { if (!condition) throw new Error(code); };
expect(JSON.stringify(clean(first)) === JSON.stringify(clean(second)), "NON_DETERMINISTIC_ARTIFACT");
expect(first.version === "planner-next-focal-a2-band-preferred-v2", "VERSION");
expect(first.status === "BAND_PREFERRED_POLICY_ACCEPTED", "STATUS");
const a = first.acceptance;
expect(a.accepted === true && a.preferredPolicyAccepted === true, "ACCEPTANCE");
expect(a.currentPlannerMeetsPreferredBandBenchmark === true, "PREFERRED_BENCHMARK");
expect(a.currentPlannerMeetsFullBandBenchmark === false && a.fullBandBenchmarkPassed === false, "FULL_BAND");
expect(Object.keys(first.scenarios).length === 23, "SCENARIO_COUNT");
const h = first.historicalRegressionEvidence;
expect(h.intact === true && h.sourceArtifactSha256Matches === true, "HISTORICAL_REGRESSION");
for (const key of ["scenarioDigestMismatchIds", "evidenceDigestMismatchIds", "fingerprintMismatchIds", "branchBudgetMismatchIds", "currentOffMismatchFields", "preferredPlanMismatchFields"]) expect(h[key].length === 0, key);
const off = first.currentOff;
expect(off.fingerprint === manifest.frozenCurrentOff.fingerprint && off.branches === 64558, "CURRENT_OFF");
expect(JSON.stringify(off.bandPresence.preferredLexicographicTuple) === JSON.stringify([6, 345, 75]), "CURRENT_OFF_BAND");
expect(off.focalMakespanMinutes === 450, "CURRENT_OFF_MAKESPAN");
const preferred = first.preferredPlan;
expect(preferred.fingerprint === manifest.frozenPreferredPlan.fingerprint && preferred.branches === 15599, "PREFERRED_FROZEN");
expect(preferred.plannedTaskCount === 38, "TASK_COUNT");
expect(JSON.stringify(preferred.bandPresence.preferredLexicographicTuple) === JSON.stringify([4, 330, 60]), "PREFERRED_BAND");
expect(preferred.bandPresence.authorizedMealMinutesInsideSpan === 75, "AUTHORIZED_MEAL");
expect(preferred.totalParticipantPresenceMinutes === 2345 && preferred.maxParticipantPresenceMinutes === 155, "PRESENCE");
expect(preferred.mainFlowSpanMinutes === 360 && preferred.focalMakespanMinutes === 450, "SPANS");
expect(preferred.validation.hardValid === true && preferred.validation.reasonCodes.length === 0, "VALIDATE_PLAN");
expect(preferred.focalValidation.hardValid === true && preferred.focalValidation.violations.length === 0, "FOCAL_VALIDATION");
const e = first.preferredEvidence;
expect(e.deterministic && e.orderInvariant && e.inputUnchanged && e.independentValidationHardValid, "FRESH_EVIDENCE");
expect(preferred.branchBudgetConsumed <= 300000 && preferred.runtimeMs < 2000, "BUDGET_OR_RUNTIME");
expect(JSON.stringify(first.resolvedGapCodes) === JSON.stringify(["AUTHORIZED_SPACE_MEAL_COUNTED_AS_RESOURCE_GAP", "RESOURCE_PRESENCE_SCORING_IGNORES_BLOCK_COUNT_PRIORITY"]), "RESOLVED_GAPS");
expect(JSON.stringify(first.remainingGapCodes) === JSON.stringify(["MAIN_FLOW_INSTRUMENT_REQUIREMENT_NOT_REPRESENTABLE", "REQUIRED_RESOURCE_PRESENCE_NOT_HARD_VALIDATED", "OFF_PREFERRED_REQUIRED_POLICY_NOT_EXPRESSIBLE"]), "REMAINING_GAPS");
NODE

if [[ "$mode" == "current" ]]; then
  node - "$tmp1" "$artifact" <<'NODE' || fail "CURRENT_ARTIFACT_DIFFERS_FROM_FRESH_RUN"
const fs = require("node:fs");
const clean = (value) => Array.isArray(value) ? value.map(clean) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).filter((key) => key !== "runtimeMs").sort().map((key) => [key, clean(value[key])])) : value;
const [fresh, published] = process.argv.slice(2).map((path) => JSON.parse(fs.readFileSync(path)));
if (JSON.stringify(clean(fresh)) !== JSON.stringify(clean(published))) throw new Error("CURRENT_ARTIFACT_DIFFERS_FROM_FRESH_RUN");
NODE
  [[ "$(sha256sum "$artifact" | cut -d' ' -f1)" == "$protected_sha" ]] || fail "CURRENT_ARTIFACT_SHA_CHANGED"
else
  [[ "$(sha256sum "$legacy" | cut -d' ' -f1)" == "$protected_sha" ]] || fail "LEGACY_ARTIFACT_SHA_CHANGED"
  publish_tmp="${artifact}.new.$$"
  cp "$tmp1" "$publish_tmp" || fail "PUBLICATION_COPY_FAILED"
  mv "$publish_tmp" "$artifact" || fail "ATOMIC_PUBLICATION_FAILED"
  node - "$artifact" <<'NODE' || fail "PUBLISHED_ARTIFACT_INVALID"
const value = JSON.parse(require("node:fs").readFileSync(process.argv[2]));
if (value.version !== "planner-next-focal-a2-band-preferred-v2" || value.status !== "BAND_PREFERRED_POLICY_ACCEPTED" || value.acceptance?.accepted !== true) throw new Error("PUBLISHED_ARTIFACT_INVALID");
NODE
  rm -f "$legacy" engine/planner-next/benchmarks/focal-a2/focalA2BandPreferredHistoricalManifest.json
fi

active_count="$(find . -maxdepth 1 -type f -name 'planner-next-*.json' ! -name '*.failed.json' | wc -l)"
[[ "$active_count" -eq 1 ]] || fail "MULTIPLE_ACTIVE_PLANNER_NEXT_ARTIFACTS"
rm -f "$failed"
