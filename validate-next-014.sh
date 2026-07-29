#!/usr/bin/env bash
set -euo pipefail
artifact=planner-next-technical-chain-v1.json
legacy=planner-next-technical-operation-v1.json
failed=planner-next-technical-chain-v1.failed.json
tmp1=$(mktemp); tmp2=$(mktemp)
trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ printf '{"version":"planner-next-technical-chain-v1","accepted":false,"reason":%s}\n' "$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1")" > "$failed"; echo "$1" >&2; exit 1; }
[[ -f "$artifact" || -f "$legacy" ]] || fail "NO_CURRENT_OR_LEGACY_ARTIFACT"
sha=""; [[ ! -f "$artifact" ]] || sha=$(sha256sum "$artifact"|cut -d' ' -f1)
npm run check || fail "CHECK_FAILED"
npx tsx --test engine/planner-next/*.spec.ts || fail "PLANNER_NEXT_TESTS_FAILED"
npm test || fail "FULL_TEST_SUITE_FAILED"
npx tsx engine/planner-next/benchmarks/runPlannerNextTechnicalChainBenchmark.ts > "$tmp1" || fail "BENCHMARK_FIRST_RUN_FAILED"
npx tsx engine/planner-next/benchmarks/runPlannerNextTechnicalChainBenchmark.ts > "$tmp2" || fail "BENCHMARK_SECOND_RUN_FAILED"
node - "$tmp1" "$tmp2" <<'NODE' || fail "BENCHMARK_ACCEPTANCE_OR_DETERMINISM_FAILED"
const fs=require('fs'),[a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));const strip=v=>Array.isArray(v)?v.map(strip):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='runtimeMs').map(([k,x])=>[k,strip(x)])):v;const t=a.scenarios?.technicalChain;if(!a.acceptance?.accepted||Object.keys(a.scenarios??{}).length!==17||JSON.stringify(strip(a))!==JSON.stringify(strip(b))||t.plannedTaskCount!==29||t.technicalOperationCount!==3||t.technicalChainCount!==1||t.technicalChainPlannedCount!==1||t.technicalChainScheduledTaskCount!==2||t.rootStandaloneStartCount!==3||t.completeChainCandidateCount!==2||t.scheduledMembers?.[0]?.start!==545||t.scheduledMembers?.[0]?.end!==565||t.scheduledMembers?.[1]?.start!==570||t.scheduledMembers?.[1]?.end!==585||t.resourcePresence!==40||t.resourceInternalGap!==5||t.violationCount!==0||t.branchBudgetMaximum!==300000||t.runtimeMs>=2000)process.exit(1);
NODE
if [[ -f "$artifact" ]]; then
 node - "$artifact" "$tmp1" <<'NODE' || fail "CURRENT_ARTIFACT_LOGICAL_MISMATCH"
const fs=require('fs'),[a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));const strip=v=>Array.isArray(v)?v.map(strip):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='runtimeMs').map(([k,x])=>[k,strip(x)])):v;if(JSON.stringify(strip(a))!==JSON.stringify(strip(b)))process.exit(1);
NODE
 [[ "$sha" == "$(sha256sum "$artifact"|cut -d' ' -f1)" ]] || fail "CURRENT_ARTIFACT_WAS_MODIFIED"
else
 node - "$legacy" "$tmp1" <<'NODE' || fail "LEGACY_REGRESSION_MISMATCH"
const fs=require('fs'),[old,next]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));const strip=v=>Array.isArray(v)?v.map(strip):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='runtimeMs').map(([k,x])=>[k,strip(x)])):v;for(const [name,value] of Object.entries(old.scenarios))if(JSON.stringify(strip(value))!==JSON.stringify(strip(next.scenarios[name])))process.exit(1);
NODE
 cp "$tmp1" "$artifact"; node -e 'if(!require("./planner-next-technical-chain-v1.json").acceptance.accepted)process.exit(1)' || fail "PUBLISHED_ARTIFACT_INVALID"; rm -f "$legacy"
fi
rm -f "$failed"
echo "NEXT-014 validation accepted: $artifact"
