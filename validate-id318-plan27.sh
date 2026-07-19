#!/usr/bin/env bash
set -u
OUTPUT="plan-27-orc-causal-checkpoint-reopen-v1.json"
RUN_A="/tmp/plan-27-id318-run-a.json"
RUN_B="/tmp/plan-27-id318-run-b.json"
TMP_OUTPUT="/tmp/plan-27-id318-consolidated.json"
rm -f "$OUTPUT" "$RUN_A" "$RUN_B" "$TMP_OUTPUT"
trap 'rm -f "$RUN_A" "$RUN_B" "$TMP_OUTPUT"' EXIT

failures=0
checks_json='[]'
add_check(){ local name="$1" status="$2"; checks_json=$(node -e 'const a=JSON.parse(process.argv[1]);a.push({name:process.argv[2],passed:process.argv[3]==="pass"});console.log(JSON.stringify(a))' "$checks_json" "$name" "$status"); }
run_check(){ local name="$1"; shift; if "$@"; then add_check "$name" pass; else add_check "$name" fail; failures=$((failures+1)); fi }

run_check "npm run check" npm run check
run_check "id318 focal tests" npx tsx --test engine/orc/active/initialConstructionCausalDecisionCheckpoint.spec.ts engine/orc/active/conflictDirectedInitialConstructionBackjump.spec.ts

SNAPSHOT="${PLAN27_SNAPSHOT:-${1:-}}"
BUDGET='{"constructionSearchStrategy":"critical_chain_retained_alternatives","criticalChainRetainedAlternatives":{"maxSuspendedPartialPlans":16,"maxExpandedPartialPlans":200,"maxGeneratedPartialPlans":600,"maxCrossCycleBacktracks":32,"maxElapsedMs":90000}}'
if [[ -n "$SNAPSHOT" && -f "$SNAPSHOT" ]]; then
  run_check "benchmark run A" npx tsx engine/tools/runInitialConstructionBenchmark.ts "$SNAPSHOT" "$BUDGET" > "$RUN_A"
  run_check "benchmark run B" npx tsx engine/tools/runInitialConstructionBenchmark.ts "$SNAPSHOT" "$BUDGET" > "$RUN_B"
else
  echo "PLAN27_SNAPSHOT or first argument must point to the Plan 27 snapshot" >&2
  echo '{}' > "$RUN_A"; echo '{}' > "$RUN_B"; failures=$((failures+1)); add_check "benchmark inputs" fail
fi

node <<'NODE' "$RUN_A" "$RUN_B" "$TMP_OUTPUT" "$checks_json"
const fs=require('node:fs'); const [aPath,bPath,outPath,checksRaw]=process.argv.slice(2);
const read=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8')||'{}')}catch{return {}}};
const a=read(aPath), b=read(bPath); const checks=JSON.parse(checksRaw);
const budgetPassed = Number(a.totalExpansionWorkUnitCount??a.expandedPartialPlanCount??Infinity)<=200 && Number(a.generatedAlternativeCount??Infinity)<=600 && Number(a.suspendedFrontierPeak??Infinity)<=16 && Number(a.crossCycleBacktrackCount??Infinity)<=32 && Number(a.exclusiveConstructiveRuntimeMs??Infinity)<90000;
const deterministic = JSON.stringify({fp:a.sessionFingerprint,sel:a.backtrackSelectionFingerprint,causal:a.causalEvidenceFingerprint})===JSON.stringify({fp:b.sessionFingerprint,sel:b.backtrackSelectionFingerprint,causal:b.causalEvidenceFingerprint});
const id317=read('plan-27-orc-window-causal-attribution-v1.json');
const contracts={deterministic,budgetPassed,checkpointResolved:Number(a.causalDecisionCheckpointResolvedCount??0)>0,causalAlternativeObserved:Number(a.existingCausalSiblingRecoveredCount??0)+Number(a.evictedCausalSiblingRecoveredCount??0)+Number(a.causalCheckpointReopenAcceptedCount??0)>0,totalExpansionWorkUnitCount:a.totalExpansionWorkUnitCount??null,expandedPartialPlanCount:a.expandedPartialPlanCount??null,generatedAlternativeCount:a.generatedAlternativeCount??null,suspendedFrontierPeak:a.suspendedFrontierPeak??null,crossCycleBacktrackCount:a.crossCycleBacktrackCount??null,exclusiveConstructiveRuntimeMs:a.exclusiveConstructiveRuntimeMs??null,productiveAssignmentsReached:a.productiveAssignmentsReached??null,productiveTasksRemaining:a.productiveTasksRemaining??null,baselineID317:{productiveAssignmentsReached:id317.productiveAssignmentsReached??null,productiveTasksRemaining:id317.productiveTasksRemaining??null,crossCycleBacktrackCount:id317.crossCycleBacktrackCount??null}};
fs.writeFileSync(outPath, JSON.stringify({id:318,artifact:'plan-27-orc-causal-checkpoint-reopen-v1',checks,contracts,runA:a,runB:b},null,2));
if(!deterministic||!budgetPassed||!contracts.checkpointResolved) process.exitCode=2;
NODE
node_status=$?
cp "$TMP_OUTPUT" "$OUTPUT"
if [[ $node_status -ne 0 ]]; then failures=$((failures+1)); fi
if [[ $failures -ne 0 ]]; then exit 1; fi
