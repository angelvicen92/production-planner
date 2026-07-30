#!/usr/bin/env bash
set -uo pipefail
MODE=${1:-auto}
CURRENT=planner-next-focal-a2-itinerant-unit-audit-v3.json
LEGACY_V2=planner-next-focal-a2-itinerant-unit-audit-v2.json
LEGACY_V1=planner-next-focal-a2-reality-baseline-v1.json
FAILED=planner-next-focal-a2-itinerant-unit-audit-v3.failed.json
MANIFEST=engine/planner-next/benchmarks/focal-a2/focalA2ItinerantUnitV3HistoricalManifest.json
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail() { node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({version:"planner-next-focal-a2-itinerant-unit-audit-v3.failed",status:"FAILED",reason:process.argv[2]},null,2)+"\n")' "$FAILED" "$1"; echo "$1" >&2; exit 1; }
run() { "$@" || fail "command failed: $*"; }
json() { jq -e . "$1" >/dev/null 2>&1 || fail "invalid JSON: $1"; }
canonical() { jq -S 'walk(if type=="object" then del(.runtimeMs) else . end)' "$1" > "$2" || fail "canonicalization failed: $1"; }
[[ "$MODE" == auto ]] && { [[ -f "$CURRENT" ]] && MODE=current || MODE=legacy; }
[[ "$MODE" == legacy || "$MODE" == current ]] || fail "mode must be legacy, current, or auto"
[[ -f "$MANIFEST" ]] || fail "v3 manifest missing"; json "$MANIFEST"
[[ $(jq '.scenarioDigests|length' "$MANIFEST") == 28 ]] || fail "manifest must protect 28 scenarios"
if [[ ${SKIP_SUITES:-${FOCAL_A2_008_SKIP_SUITES:-0}} != 1 ]]; then
  run npm run check
  run npx tsx --test engine/planner-next/benchmarks/focal-a2/focalA2RealityReference.spec.ts
  run npx tsx --test engine/planner-next/benchmarks/focal-a2/evaluateFocalA2RealityUnits.spec.ts
  run npx tsx --test engine/planner-next/benchmarks/focal-a2/focalA2ItinerantUnitBehavioralControls.spec.ts
  run npx tsx --test engine/planner-next/benchmarks/runPlannerNextFocalA2ItinerantUnitAuditBenchmark.spec.ts
fi
if [[ "$MODE" == legacy ]]; then
  [[ -f "$LEGACY_V2" ]] || fail "v2 artifact missing"
  [[ $(sha256sum "$LEGACY_V2" | cut -d' ' -f1) == baddefda190c01e352a85f386be9392372ff94ee25c4527dcbb09f2e4a3c3cc6 ]] || fail "v2 SHA mismatch"
  SOURCE=$LEGACY_V2
else
  [[ -f "$CURRENT" ]] || fail "v3 artifact missing"
  [[ ! -e "$LEGACY_V1" && ! -e "$LEGACY_V2" ]] || fail "current mode forbids legacy artifacts"
  cp "$CURRENT" "$tmp/original.json"; original_sha=$(sha256sum "$CURRENT" | cut -d' ' -f1); SOURCE=$CURRENT
fi
for run_id in a b; do
  FOCAL_A2_HISTORICAL_SOURCE="$SOURCE" npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2ItinerantUnitAuditBenchmark.ts > "$tmp/$run_id.json" || fail "benchmark $run_id failed"
  json "$tmp/$run_id.json"; canonical "$tmp/$run_id.json" "$tmp/${run_id}c.json"
done
cmp -s "$tmp/ac.json" "$tmp/bc.json" || fail "nondeterministic output"
jq -e '.version=="planner-next-focal-a2-itinerant-unit-audit-v3" and .status=="FOCAL_A2_ITINERANT_UNIT_AUDIT_REPAIRED" and (.scenarios|length)==29 and .historicalRegressionEvidence.intact and (.historicalRegressionEvidence.scenarioMismatchIds|length)==0 and (.historicalRegressionEvidence.historicalEvidenceMismatchIds|length)==0 and .standaloneRealityRun.complete and .standaloneRealityRun.hardValid and .standaloneRealityRun.deterministic and .standaloneRealityRun.orderInvariant and .standaloneRealityRun.evaluation.exactMembershipSatisfied and .behavioralControls.status=="BEHAVIORALLY_SUPPORTED" and (.confirmedGapCodes|length)==2 and .combinedRealityRun.status=="NOT_EXECUTED_UNREPRESENTABLE_INPUT" and .acceptance.accepted and (.acceptance.combinedInputRepresentable|not) and (.acceptance.fullRealityBenchmarkPassed|not)' "$tmp/a.json" >/dev/null || fail "v3 assertions failed"
if [[ "$MODE" == legacy ]]; then
  cp "$tmp/a.json" "$tmp/publish.json"; mv "$tmp/publish.json" "$CURRENT"; json "$CURRENT"
  canonical "$CURRENT" "$tmp/publishedc.json"; cmp -s "$tmp/ac.json" "$tmp/publishedc.json" || fail "published v3 differs"
  rm -f "$LEGACY_V2" "$LEGACY_V1"
else
  canonical "$tmp/original.json" "$tmp/originalc.json"; cmp -s "$tmp/ac.json" "$tmp/originalc.json" || fail "fresh output differs from v3"
  [[ $(sha256sum "$CURRENT" | cut -d' ' -f1) == "$original_sha" ]] || fail "current artifact was modified"
fi
[[ ! -e "$LEGACY_V1" && ! -e "$LEGACY_V2" && -f "$CURRENT" ]] || fail "root artifact closure failed"
rm -f "$FAILED"; echo "FOCAL-A2-008R2 $MODE validation passed"
