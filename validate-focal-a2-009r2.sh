#!/usr/bin/env bash
set -uo pipefail
CURRENT=planner-next-focal-a2-itinerant-spec08-foundation-v2.json
LEGACY=planner-next-focal-a2-itinerant-spec08-foundation-v1.json
FAILED=planner-next-focal-a2-itinerant-spec08-foundation-v2.failed.json
mode=${1:-auto}; tmp1=$(mktemp); tmp2=$(mktemp); trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ printf '{"status":"FAILED","reason":%s}\n' "$(printf %s "$1"|jq -Rs .)" > "$FAILED"; exit 1; }
[[ "$mode" =~ ^(legacy|current|auto)$ ]] || fail 'invalid mode'
if [[ "$mode" == legacy ]]; then [[ -f "$LEGACY" ]] || fail 'legacy artifact absent'; [[ $(sha256sum "$LEGACY"|cut -d' ' -f1) == ae30d0c7fcde3e13c4ab64a318b4d32f6c2b439fc7118d07fdc943065c242d6e ]] || fail 'legacy SHA mismatch'; fi
[[ -f "$CURRENT" ]] || fail 'current artifact absent'
npm run check || fail check
node script/run-test-suite.mjs engine/planner-next || fail planner-next
npm test || fail npm-test
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationV2Benchmark.ts >"$tmp1" || fail benchmark-1
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationV2Benchmark.ts >"$tmp2" || fail benchmark-2
jq -S 'walk(if type=="object" then del(.runtimeMs) else . end)' "$tmp1" >"$tmp1.c"; jq -S 'walk(if type=="object" then del(.runtimeMs) else . end)' "$tmp2" >"$tmp2.c"; cmp "$tmp1.c" "$tmp2.c" || fail nondeterministic
jq -e '.scenarioCount==31 and .acceptance.accepted and ([.requiredPositiveChecks[] as $k | .checks[$k].passed] | all)' "$CURRENT" >/dev/null || fail acceptance
rm -f "$LEGACY" "$FAILED" "$tmp1.c" "$tmp2.c"
node script/run-test-suite.mjs engine/planner-next || fail final-planner-next
