#!/usr/bin/env bash
set -uo pipefail
artifact=planner-next-required-space-meal-v2.json
legacy=planner-next-required-space-meal-v1.json
failed=planner-next-required-space-meal-v2.failed.json
tmp1=$(mktemp); tmp2=$(mktemp)
trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ local reason=$1; node -e 'require("fs").writeFileSync(process.argv[1],JSON.stringify({version:"planner-next-required-space-meal-v2",accepted:false,reason:process.argv[2]},null,2)+"\n")' "$failed" "$reason"; echo "$reason" >&2; exit 1; }
[[ -f "$artifact" || -f "$legacy" ]] || fail NO_CURRENT_OR_LEGACY_ARTIFACT
mode=legacy; before=""; [[ -f "$artifact" ]] && { mode=current; before=$(sha256sum "$artifact"|cut -d' ' -f1); }
npm run check || fail CHECK_FAILED
npx tsx --test engine/planner-next/*.spec.ts || fail PLANNER_NEXT_TESTS_FAILED
npm test || fail FULL_TEST_SUITE_FAILED
npx tsx engine/planner-next/benchmarks/runPlannerNextRequiredSpaceMealBenchmark.ts >"$tmp1" || fail BENCHMARK_FIRST_RUN_FAILED
npx tsx engine/planner-next/benchmarks/runPlannerNextRequiredSpaceMealBenchmark.ts >"$tmp2" || fail BENCHMARK_SECOND_RUN_FAILED
node - "$tmp1" "$tmp2" "$legacy" "$mode" <<'NODE' || fail BENCHMARK_ACCEPTANCE_FAILED
const fs=require('fs'),[aPath,bPath,legacyPath,mode]=process.argv.slice(2),a=JSON.parse(fs.readFileSync(aPath)),b=JSON.parse(fs.readFileSync(bPath)),clean=x=>{x=structuredClone(x);const walk=v=>{if(v&&typeof v==='object'){delete v.runtimeMs;Object.values(v).forEach(walk)}};walk(x);return x};
if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))process.exit(2);
const ac=a.acceptance,s=a.scenarios.requiredSpaceMeal,e=a.requiredSpaceMealFutureFeasibilityEvidence,p=a.requiredSpaceMealProbeEvidence,historical=['jointFutureFeasibilityEvidence','setupEvidence','boundedBlockConstruction','branchHistoryInvariance','technicalChainConstructorEvidence','technicalChainFutureFeasibilityEvidence','spaceMealFutureFeasibilityEvidence','requiredSpaceMealFutureFeasibilityEvidence'];
if(a.version!=='planner-next-required-space-meal-v2'||!ac.accepted||!ac.requiredSpaceMealAccepted||!ac.requiredSpaceMealFutureFeasibilityAccepted||!ac.requiredSpaceMealProbeAccepted||Object.keys(a.scenarios).length!==19||historical.some(k=>a[k]===undefined))process.exit(3);
if(s.plannedTaskCount!==35||s.scheduledSpaceMeals.length!==2||s.ordinaryMeal.start!==620||s.ordinaryMeal.end!==640||s.requiredMeal.start!==700||s.requiredMeal.end!==720||s.requiredRoomTasks.length!==4||JSON.stringify(s.requiredRoomTasks.map(x=>[x.start,x.end]))!==JSON.stringify([[660,680],[680,700],[720,740],[740,760]])||s.productiveTaskMinutes!==80||s.mealMinutes!==20||s.occupiedSpanMinutes!==100||s.internalGapMinutes!==0||s.occupiedBlockCount!==1||!s.workItemSelectionOrder.includes('space:required-meal-room')||s.workItemSelectionOrder.includes('meal:required-meal-room')||!s.originalProjectionEqual||s.violationCount!==0||s.runtimeMs>=2000||s.branchBudgetConsumed>s.branchBudgetMaximum)process.exit(4);
if(s.constructorDiagnostics.search.consumed!==51||s.constructorDiagnostics.search.candidates.length!==5||s.constructorDiagnostics.probeLimit1.candidates.length!==1||s.constructorDiagnostics.probeLimit1.consumed>=51||s.constructorDiagnostics.probeLimit2.candidates.length!==2||s.constructorDiagnostics.probeLimit2.consumed>51||s.constructorDiagnostics.probeBestK.candidates.length!==5||s.constructorDiagnostics.probeBestK.consumed>51||!p.firstCandidateEqual||!p.firstTwoCandidatesEqual||!p.deterministic)process.exit(5);
if(e.valid.exhausted||!e.valid.feasible||e.valid.assessments.length!==1||e.valid.assessments[0].key!=='space:required-meal-room'||e.impossible.exhausted||e.impossible.feasible||e.impossible.blockingWorkItemKeys[0]!=='space:required-meal-room'||!e.shortBudget.exhausted||e.shortBudget.assessments.length||e.shortBudget.budgetRemaining!==0)process.exit(10);
if(e.valid.branchesConsumed!==51||e.valid.assessments[0]?.alternativeCount!==5||e.shortBudget.branchesConsumed!==3)process.exit(11);
const runtimes=[];(function walk(v){if(v&&typeof v==='object'){if(typeof v.runtimeMs==='number')runtimes.push(v.runtimeMs);Object.values(v).forEach(walk)}})(a);if(runtimes.some(x=>x>=2000))process.exit(12);
const frozen={spaceMeal:['2a2d3673496a042b66567422d01859cc28aefdec34ea7528b5a0675e7499e647',66237],technicalChain:['daacd49a1279bb6f14607f36a642b3c347af7e10b7540011dfe0efbd79e58bb9',53730],technicalOperation:['9f7f153973f414a7b48dbe92f41872794b3335a896cba9f2175b3200e3ff5cf3',33071],requiredSpaceMeal:['deefc694a142b8d35ebd20cbda15f5fb9d786ef3c43fa8519d50fe5817cda3b9',95247]};for(const [key,[fp,branches]] of Object.entries(frozen)){const x=a.scenarios[key];if(x.fingerprint!==fp||x.branchBudgetConsumed!==branches)process.exit(6)}
if(a.scenarios.itinerantUnits.logicalMetrics.branchBudgetConsumed>285317||a.scenarios.itinerantUnits.logicalMetrics.branchBudgetMaximum!==300000)process.exit(7);
if(mode==='legacy'){const old=JSON.parse(fs.readFileSync(legacyPath));for(const [key,value] of Object.entries(old.scenarios))if(key!=='requiredSpaceMeal'&&JSON.stringify(clean(value))!==JSON.stringify(clean(a.scenarios[key])))process.exit(8);for(const key of historical)if(JSON.stringify(old[key])!==JSON.stringify(a[key]))process.exit(9);const omit=new Set(['constructorDiagnostics','runtimeMs']),project=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!omit.has(k)));if(JSON.stringify(project(old.scenarios.requiredSpaceMeal))!==JSON.stringify(project(a.scenarios.requiredSpaceMeal)))process.exit(13);if(JSON.stringify(old.scenarios.requiredSpaceMeal.constructorDiagnostics.search)!==JSON.stringify(a.scenarios.requiredSpaceMeal.constructorDiagnostics.search))process.exit(14)}
NODE
if [[ "$mode" == current ]]; then
  node - "$artifact" "$tmp1" <<'NODE' || fail CURRENT_ARTIFACT_LOGICAL_MISMATCH
const fs=require('fs'),clean=x=>{x=structuredClone(x);const w=v=>{if(v&&typeof v==='object'){delete v.runtimeMs;Object.values(v).forEach(w)}};w(x);return x},[a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))process.exit(1)
NODE
  [[ "$before" == "$(sha256sum "$artifact"|cut -d' ' -f1)" ]] || fail CURRENT_ARTIFACT_WAS_MODIFIED
else
  cp "$tmp1" "$artifact" || fail PUBLISH_FAILED
  node -e 'const x=require("./planner-next-required-space-meal-v2.json");if(x.version!=="planner-next-required-space-meal-v2"||!x.acceptance.accepted)process.exit(1)' || fail PUBLISHED_ARTIFACT_INVALID
  rm -f "$legacy"
fi
rm -f "$failed"
