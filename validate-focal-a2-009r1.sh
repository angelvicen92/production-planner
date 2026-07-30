#!/usr/bin/env bash
set -uo pipefail
MODE="${1:-auto}"
CURRENT=planner-next-focal-a2-itinerant-spec08-foundation-v1.json
LEGACY=planner-next-focal-a2-itinerant-unit-audit-v3.json
FAILED=planner-next-focal-a2-itinerant-spec08-foundation-v1.failed.json
EXPECTED=c83abb8f91703a157520be46b9392815b59e12ddcb4e3aa4cf66fd72a0b65d3d
TMP1="${CURRENT}.tmp.$$.1"; TMP2="${CURRENT}.tmp.$$.2"
cleanup(){ rm -f "$TMP1" "$TMP2"; }; trap cleanup EXIT
fail(){ printf '{"version":"planner-next-focal-a2-itinerant-spec08-foundation-v1","status":"FAILED","reason":%s}\n' "$(node -p 'JSON.stringify(process.argv[1])' "$1")" > "$FAILED"; echo "$1" >&2; return 1; }
[[ "$MODE" == legacy || "$MODE" == current || "$MODE" == auto ]] || { fail "invalid mode"; exit 1; }
if [[ "$MODE" == legacy ]]; then [[ -f "$LEGACY" ]] || { fail "legacy missing"; exit 1; }; [[ "$(sha256sum "$LEGACY"|cut -d' ' -f1)" == "$EXPECTED" ]] || { fail "legacy SHA mismatch"; exit 1; }; fi
if [[ "$MODE" == current ]]; then [[ -f "$CURRENT" ]] || { fail "current missing"; exit 1; }; fi
node -e 'let m=require("./engine/planner-next/benchmarks/focal-a2/focalA2Spec08FoundationHistoricalManifest.json");if(Object.keys(m.scenarioDigests).length!==29||m.sourceArtifactSha256!==process.argv[1])process.exit(1)' "$EXPECTED" || { fail "manifest invalid"; exit 1; }
if [[ "${FOCAL_A2_VALIDATOR_SKIP_SUITES:-0}" != 1 ]]; then
 npm run check || { fail "check failed"; exit 1; }
 npx tsx --test engine/planner-next/taskAvailability.spec.ts engine/planner-next/placement.spec.ts engine/planner-next/mainFlowMeal.spec.ts engine/planner-next/planMainFlowAndFeeders.spec.ts engine/planner-next/feederClosure.spec.ts engine/planner-next/anchoredAccompaniment.spec.ts engine/planner-next/benchmarks/focal-a2/focalA2RealityReference.spec.ts engine/planner-next/benchmarks/focal-a2/evaluateFocalA2RealityUnits.spec.ts engine/planner-next/benchmarks/focal-a2/focalA2ItinerantCompositionControls.spec.ts || { fail "focal tests failed"; exit 1; }
 node script/run-test-suite.mjs engine/planner-next || { fail "Planner Next suite failed"; exit 1; }
 npm test || { fail "npm test failed"; exit 1; }
fi
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationBenchmark.ts > "$TMP1" || { fail "benchmark failed"; exit 1; }
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationBenchmark.ts > "$TMP2" || { fail "repeat benchmark failed"; exit 1; }
node - "$TMP1" "$TMP2" <<'NODE' || { fail "benchmark output mismatch"; exit 1; }
const fs=require('fs'),a=JSON.parse(fs.readFileSync(process.argv[2])),b=JSON.parse(fs.readFileSync(process.argv[3]));
const c=v=>Array.isArray(v)?v.map(c):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='runtimeMs').sort().map(k=>[k,c(v[k])])):v;
if(JSON.stringify(c(a))!==JSON.stringify(c(b))||a.scenarioCount!==30||!a.acceptance.accepted||a.acceptance.anchoredAccompanimentSupported!==false||a.acceptance.fullFocalA2ItinerantBenchmarkPassed!==false)process.exit(1);
NODE
if [[ "${FOCAL_A2_FORCE_FAILURE:-0}" == 1 ]]; then fail "forced failure-safe control"; exit 1; fi
mv "$TMP2" "$CURRENT"; node -e 'let x=require("./"+process.argv[1]);if(!x.acceptance.accepted||x.status!=="FOCAL_A2_SPEC08_FOUNDATION_ACCEPTED")process.exit(1)' "$CURRENT" || { fail "published artifact invalid"; exit 1; }
rm -f "$FAILED"; [[ -f "$LEGACY" ]] && rm "$LEGACY"; echo "FOCAL-A2-009R1 validated ($MODE)"
