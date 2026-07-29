#!/usr/bin/env bash
set -uo pipefail
artifact=planner-next-space-meal-v2.json
legacy=planner-next-space-meal-v1.json
failed=planner-next-space-meal-v2.failed.json
tmp1=$(mktemp); tmp2=$(mktemp)
trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ local reason=$1; node -e 'require("fs").writeFileSync(process.argv[1],JSON.stringify({version:"planner-next-space-meal-v2",accepted:false,reason:process.argv[2]},null,2)+"\n")' "$failed" "$reason"; echo "$reason" >&2; exit 1; }
[[ -f "$artifact" || -f "$legacy" ]] || fail NO_CURRENT_OR_LEGACY_ARTIFACT
mode=legacy; before=""; [[ -f "$artifact" ]] && { mode=current; before=$(sha256sum "$artifact"|cut -d' ' -f1); }
npm run check || fail CHECK_FAILED
npx tsx --test engine/planner-next/*.spec.ts || fail PLANNER_NEXT_TESTS_FAILED
npm test || fail FULL_TEST_SUITE_FAILED
npx tsx engine/planner-next/benchmarks/runPlannerNextSpaceMealBenchmark.ts >"$tmp1" || fail BENCHMARK_FIRST_RUN_FAILED
npx tsx engine/planner-next/benchmarks/runPlannerNextSpaceMealBenchmark.ts >"$tmp2" || fail BENCHMARK_SECOND_RUN_FAILED
node - "$tmp1" "$tmp2" "$legacy" "$mode" <<'NODE' || fail BENCHMARK_ACCEPTANCE_FAILED
const fs=require('fs'),[aPath,bPath,legacyPath,mode]=process.argv.slice(2),a=JSON.parse(fs.readFileSync(aPath)),b=JSON.parse(fs.readFileSync(bPath)),clean=x=>{x=structuredClone(x);const walk=v=>{if(v&&typeof v==='object'){delete v.runtimeMs;Object.values(v).forEach(walk)}};walk(x);return x};
if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))process.exit(2);const ac=a.acceptance,e=a.spaceMealFutureFeasibilityEvidence,s=a.scenarios.spaceMeal,keys=['jointFutureFeasibilityEvidence','setupEvidence','boundedBlockConstruction','branchHistoryInvariance','technicalChainConstructorEvidence','technicalChainFutureFeasibilityEvidence'],fixture=JSON.parse(fs.readFileSync('engine/planner-next/benchmarks/fixtures/technicalChainV2Evidence.json'));
if(a.version!=='planner-next-space-meal-v2'||!ac.accepted||!ac.spaceMealAccepted||!ac.spaceMealFutureFeasibilityAccepted||!ac.historicalEvidenceRestored||Object.keys(a.scenarios).length!==18||keys.some(k=>JSON.stringify(a[k])!==JSON.stringify(fixture[k])))process.exit(3);
if(s.plannedTaskCount!==31||s.scheduledSpaceMeals?.[0]?.start!==620||s.scheduledSpaceMeals[0].end!==640||s.mealCandidateCount!==1||s.workItemSelectionOrder[0]!=='meal:meal-room'||s.internalGapMinutes!==0||s.occupiedBlockCount!==1||s.spaceMealBranchesExplored!==1||s.branchBudgetConsumed!==66237||s.fingerprint!=='2a2d3673496a042b66567422d01859cc28aefdec34ea7528b5a0675e7499e647'||s.violationCount!==0)process.exit(4);
if(!(e.blocker.branchesConsumed>0)||e.shortBudget.branchesConsumed!==2||!e.shortBudget.exhausted||e.shortBudget.assessments.length||e.shortBudget.budgetRemaining!==0||e.bestK.assessments[0].alternativeCount!==2||e.bestK.branchesConsumed<2)process.exit(5);
if(mode==='legacy'){const old=JSON.parse(fs.readFileSync(legacyPath));for(const [k,v] of Object.entries(old.scenarios))if(k!=='spaceMeal'&&JSON.stringify(clean(v))!==JSON.stringify(clean(a.scenarios[k])))process.exit(6)}
NODE
[[ $? == 0 ]] || fail BENCHMARK_DETERMINISM_FAILED
if [[ "$mode" == current ]]; then
  node - "$artifact" "$tmp1" <<'NODE' || fail CURRENT_ARTIFACT_LOGICAL_MISMATCH
const fs=require('fs'),clean=x=>{x=structuredClone(x);const w=v=>{if(v&&typeof v==='object'){delete v.runtimeMs;Object.values(v).forEach(w)}};w(x);return x},[a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))process.exit(1)
NODE
  [[ "$before" == "$(sha256sum "$artifact"|cut -d' ' -f1)" ]] || fail CURRENT_ARTIFACT_WAS_MODIFIED
else
  cp "$tmp1" "$artifact" || fail PUBLISHED_ARTIFACT_INVALID
  node -e 'const x=require("./planner-next-space-meal-v2.json");if(x.version!=="planner-next-space-meal-v2"||!x.acceptance.accepted)process.exit(1)' || fail PUBLISHED_ARTIFACT_INVALID
  rm -f "$legacy"
fi
rm -f "$failed"
