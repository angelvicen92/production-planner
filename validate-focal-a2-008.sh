#!/usr/bin/env bash
set -uo pipefail
MODE=${1:-current}; NEW=planner-next-focal-a2-reality-baseline-v1.json; OLD=planner-next-focal-a2-band-semantics-v4.json; FAILED=planner-next-focal-a2-reality-baseline-v1.failed.json
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail(){ printf '{"version":"planner-next-focal-a2-reality-baseline-v1.failed","status":"FAILED","reason":%s}\n' "$(printf %s "$1"|jq -Rs .)" > "$FAILED"; echo "$1" >&2; exit 1; }
run(){ "$@" || fail "command failed: $*"; }
[[ "$MODE" == legacy || "$MODE" == current ]] || fail "mode must be legacy or current"
[[ ${FOCAL_A2_008_SKIP_SUITES:-0} == 1 ]] || { run npm run check; run npx tsx --test engine/planner-next/benchmarks/focal-a2/focalA2RealityReference.spec.ts; run npx tsx --test engine/planner-next/benchmarks/focal-a2/evaluateFocalA2RealityUnits.spec.ts; run npx tsx --test engine/planner-next/benchmarks/runPlannerNextFocalA2RealityBaselineBenchmark.spec.ts; run npm test; }
[[ -f engine/planner-next/benchmarks/focal-a2/focalA2RealityBaselineHistoricalManifest.json ]] || fail "manifest missing"
if [[ "$MODE" == legacy ]]; then [[ -f "$OLD" ]] || fail "legacy artifact missing"; [[ $(sha256sum "$OLD"|cut -d' ' -f1) == c197ae517fa478ac68ee964eb513e671027acdd9dc807f8dcb62dc0de56d7160 ]] || fail "legacy SHA mismatch"; rm -f "$NEW"; else [[ -f "$NEW" ]] || fail "current artifact missing"; cp "$NEW" "$tmp/original.json"; fi
run npm run benchmark:planner-next:focal-a2-reality-baseline; npm run benchmark:planner-next:focal-a2-reality-baseline 2>/dev/null | sed -n '/^{/,$p' > "$tmp/a.json" || fail "benchmark one failed"
npm run benchmark:planner-next:focal-a2-reality-baseline 2>/dev/null | sed -n '/^{/,$p' > "$tmp/b.json" || fail "benchmark two failed"
jq -S 'walk(if type=="object" then del(.runtimeMs) else . end)' "$tmp/a.json" > "$tmp/ac"; jq -S 'walk(if type=="object" then del(.runtimeMs) else . end)' "$tmp/b.json" > "$tmp/bc"; cmp -s "$tmp/ac" "$tmp/bc" || fail "nondeterministic output"
jq -e '.version=="planner-next-focal-a2-reality-baseline-v1" and .status=="FOCAL_A2_REALITY_EXPRESSIBILITY_AUDIT_ACCEPTED" and (.scenarios|length)==27 and (.realityReference|length)==12 and .referenceRealityValidation.totalProductiveMinutes==375 and .projectedRealityInput.humanTimesPresent==false and .acceptance.accepted and .acceptance.realityRunDeterministic and .acceptance.realityRunOrderInvariant and .acceptance.impossibleRealityAtomic and .historicalRegressionEvidence.intact and (.expressibilityAudit|length)==15' "$tmp/a.json" >/dev/null || fail "artifact assertions failed"
if [[ "$MODE" == current ]]; then jq -S 'walk(if type=="object" then del(.runtimeMs) else . end)' "$tmp/original.json" > "$tmp/oc"; cmp -s "$tmp/ac" "$tmp/oc" || fail "fresh output differs from current"; else cp "$tmp/a.json" "$tmp/publish"; mv "$tmp/publish" "$NEW"; jq -e '.acceptance.accepted' "$NEW" >/dev/null || fail "published artifact cannot reopen"; rm "$OLD"; fi
rm -f "$FAILED"; echo "FOCAL-A2-008 $MODE validation passed"
