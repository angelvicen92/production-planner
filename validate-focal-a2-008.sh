#!/usr/bin/env bash
set -uo pipefail
MODE=${1:-current}
CURRENT=planner-next-focal-a2-itinerant-unit-audit-v2.json
LEGACY=planner-next-focal-a2-reality-baseline-v1.json
FAILED=planner-next-focal-a2-itinerant-unit-audit-v2.failed.json
MANIFEST=engine/planner-next/benchmarks/focal-a2/focalA2ItinerantUnitV2HistoricalManifest.json
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail() { printf '{"version":"planner-next-focal-a2-itinerant-unit-audit-v2.failed","status":"FAILED","reason":%s}\n' "$(printf %s "$1" | jq -Rs .)" > "$FAILED"; echo "$1" >&2; exit 1; }
run() { "$@" || fail "command failed: $*"; }
[[ "$MODE" == legacy || "$MODE" == current ]] || fail "mode must be legacy or current"
[[ ${SKIP_SUITES:-${FOCAL_A2_008_SKIP_SUITES:-0}} == 1 ]] || {
  run npm run check
  run npx tsx --test engine/planner-next/benchmarks/focal-a2/focalA2RealityReference.spec.ts
  run npx tsx --test engine/planner-next/benchmarks/focal-a2/evaluateFocalA2RealityUnits.spec.ts
  run npx tsx --test engine/planner-next/benchmarks/runPlannerNextFocalA2RealityBaselineBenchmark.spec.ts
  run npm test
}
[[ -f "$LEGACY" ]] || fail "legacy artifact missing"
[[ $(sha256sum "$LEGACY" | cut -d' ' -f1) == 979977b696ee80c8cb42b191a45f70a42efe0afd37cff2c03f2bc0523c68f6c4 ]] || fail "legacy SHA mismatch"
[[ -f "$MANIFEST" ]] || fail "v2 manifest missing"
[[ $(jq '.scenarioDigests | length' "$MANIFEST") == 27 ]] || fail "manifest does not protect 27 scenarios"
if [[ "$MODE" == current ]]; then
  [[ -f "$CURRENT" ]] || fail "current artifact missing"
  cp "$CURRENT" "$tmp/original.json"
fi
npm run benchmark:planner-next:focal-a2-itinerant-unit-audit 2>/dev/null | sed -n '/^{/,$p' > "$tmp/a.json" || fail "benchmark one failed"
npm run benchmark:planner-next:focal-a2-itinerant-unit-audit 2>/dev/null | sed -n '/^{/,$p' > "$tmp/b.json" || fail "benchmark two failed"
for name in a b; do jq -S 'walk(if type=="object" then del(.runtimeMs) else . end)' "$tmp/$name.json" > "$tmp/${name}c"; done
cmp -s "$tmp/ac" "$tmp/bc" || fail "nondeterministic output"
jq -e '
  .version == "planner-next-focal-a2-itinerant-unit-audit-v2" and
  .status == "FOCAL_A2_ITINERANT_UNIT_CONTRACT_AUDIT_ACCEPTED" and
  (.scenarios | length) == 28 and
  .referenceValidation.operationProfileCount == 12 and
  .referenceValidation.wrappedOperationCount == 3 and
  .referenceValidation.standaloneOperationCount == 9 and
  .referenceValidation.totalItinerantResourceMinutes == 375 and
  .standaloneControls.independentUnit.status == "SUPPORTED" and
  .standaloneControls.parallelUnits.status == "SUPPORTED" and
  .standaloneControls.recomposition.status == "SUPPORTED" and
  .wrappedMainControl.status == "GAP_CONFIRMED" and
  .wrappedAuxiliaryControl.status == "GAP_CONFIRMED" and
  (.invalidStandaloneSubstitutionControl.validProjection | not) and
  .withdrawnScenarioEvidence.status == "WITHDRAWN_INVALID_OPERATIONAL_PROJECTION" and
  .combinedRealityRun.status == "NOT_EXECUTED_UNREPRESENTABLE_INPUT" and
  (.confirmedGapCodes | length) == 2 and
  .historicalRegressionEvidence.protectedScenarioCount == 27 and
  .historicalRegressionEvidence.intact and
  .acceptance.accepted and (.acceptance.fullRealityBenchmarkPassed | not)
' "$tmp/a.json" >/dev/null || fail "artifact assertions failed"
if [[ "$MODE" == current ]]; then
  jq -S 'walk(if type=="object" then del(.runtimeMs) else . end)' "$tmp/original.json" > "$tmp/originalc"
  cmp -s "$tmp/ac" "$tmp/originalc" || fail "fresh output differs from current"
else
  cp "$tmp/a.json" "$tmp/publish"
  mv "$tmp/publish" "$CURRENT"
  jq -e '.acceptance.accepted' "$CURRENT" >/dev/null || fail "published artifact cannot reopen"
fi
rm -f "$FAILED"
echo "FOCAL-A2-008R $MODE validation passed"
