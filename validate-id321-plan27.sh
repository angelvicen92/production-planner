#!/usr/bin/env bash
set -uo pipefail
set +H

OUTPUT="plan-27-orc-causal-activation-transaction-v1.json"
RUN_A="/tmp/plan-27-id321-run-a.json"
RUN_B="/tmp/plan-27-id321-run-b.json"
TMP_OUTPUT="/tmp/plan-27-id321-consolidated.json"

rm -f \
  "$OUTPUT" \
  "$RUN_A" \
  "$RUN_B" \
  "$TMP_OUTPUT" \
  /tmp/plan-27-id320-run-a.json \
  /tmp/plan-27-id320-run-b.json \
  /tmp/plan-27-id320-consolidated.json
trap 'rm -f "$RUN_A" "$RUN_B" "$TMP_OUTPUT"' EXIT

failures=0
checks_json='[]'
add_check(){ checks_json=$(node -e 'const c=JSON.parse(process.argv[1]); c.push({name:process.argv[2],passed:process.argv[3]==="pass"}); console.log(JSON.stringify(c));' "$checks_json" "$1" "$2"); }
run_check(){ local name="$1"; shift; if "$@"; then add_check "$name" pass; else add_check "$name" fail; failures=$((failures+1)); fi; }

SNAPSHOT="${PLAN27_SNAPSHOT:-${1:-local_engine_scenarios/optiplan-plan-27-engine-scenario-v1.json}}"
BUDGET='{"constructionSearchStrategy":"critical_chain_retained_alternatives","maxElapsedMs":90000,"maxExpandedPartialPlans":200,"maxGeneratedPartialPlans":600,"maxSuspendedPartialPlans":16,"initialExecutableFrontierBatchSize":4,"maxExecutableFrontierTasksScannedPerExpansion":32,"maxBranchEvaluationsPerFrontierTask":48,"maxRetainedValidBranchesPerFrontierTask":3,"maxChildrenPerDecision":3,"maxCrossCycleBacktracks":32,"initialTemporalCandidateBatchSize":8,"maxTemporalCandidatesPerAnchor":24,"maxBranchEvaluationsPerAnchor":48}'

run_check "npm run check" npm run check
run_check "id321 focal activation/cursor tests" npx tsx --test engine/orc/active/initialConstructionCausalAlternativeActivation.spec.ts engine/orc/active/initialConstructionCausalCheckpointCursor.spec.ts
TEST_FILES=(
  engine/orc/active/initialConstructionCausalBranchOutcomeClassifier.spec.ts
  engine/orc/active/initialConstructionCausalBranchOutcomeLedger.spec.ts
  engine/orc/active/initialConstructionCausalDecisionCheckpoint.spec.ts
  engine/orc/active/conflictDirectedInitialConstructionBackjump.spec.ts
  engine/orc/active/runInitialConstructionIterativeSession.spec.ts
  engine/tools/runInitialConstructionBenchmark.spec.ts
)
run_check "ORC focal causal branch suite" npx tsx --test --test-reporter=dot "${TEST_FILES[@]}"

if [[ -f "$SNAPSHOT" ]]; then
  run_check "benchmark run A" npx tsx engine/tools/runInitialConstructionBenchmark.ts "$SNAPSHOT" "$BUDGET" > "$RUN_A"
  run_check "benchmark run B" npx tsx engine/tools/runInitialConstructionBenchmark.ts "$SNAPSHOT" "$BUDGET" > "$RUN_B"
else
  echo "ERROR: no existe el snapshot de Plan 27: $SNAPSHOT" >&2
  echo '{}' > "$RUN_A"; echo '{}' > "$RUN_B"; add_check "benchmark inputs" fail; failures=$((failures+1))
fi

node - "$RUN_A" "$RUN_B" "$TMP_OUTPUT" "$checks_json" <<'NODE'
const fs=require('node:fs');
const [aPath,bPath,outPath,checksRaw]=process.argv.slice(2);
const read=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8')||'{}')}catch{return {}}};
const a=read(aPath), b=read(bPath), checks=JSON.parse(checksRaw);
const id318=read('plan-27-orc-causal-checkpoint-reopen-v1.json');
const base=(Array.isArray(id318.runs)&&id318.runs[0])||id318.runA||id318;
const stable=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
const add=(name,passed,details={})=>checks.push({name,passed:Boolean(passed),details});
const samples=r=>[...(r.causalBranchOutcomeClassificationSamples||r.causalBranchOutcomeSamples||[])];
const repeatedOk=r=>samples(r).filter(s=>['REPEATED_SAME_CONFLICT','PROGRESSED_BUT_REPEATED_SAME_CONFLICT'].includes(s.status)).every(s=>s.conflictFingerprint===s.resultingConflictFingerprint);
const differentOk=r=>samples(r).filter(s=>s.status==='ADVANCED_TO_DIFFERENT_CONFLICT').every(s=>s.conflictFingerprint!==s.resultingConflictFingerprint);
const skipTotal=r=>Number(r.causalBranchTransitionCandidateSkippedCount??0);
const bySourceTotal=r=>Object.values(r.causalBranchTransitionSkipBySource||{}).reduce((n,v)=>n+Number(v||0),0);
const deterministic=a.productiveAssignmentsReached===b.productiveAssignmentsReached&&a.productiveTasksRemaining===b.productiveTasksRemaining&&a.crossCycleBacktrackCount===b.crossCycleBacktrackCount&&a.finalAssignmentsFingerprint===b.finalAssignmentsFingerprint&&a.sessionFingerprint===b.sessionFingerprint;
const budgetOf=r=>r.resolvedRetainedAlternativesBudget||{};
add('deterministic replay',deterministic,{a:a.sessionFingerprint,b:b.sessionFingerprint});
add('budget matches ID318',stable(budgetOf(a),budgetOf(base))&&stable(budgetOf(b),budgetOf(base)));
add('repeated outcomes have equal fingerprints',repeatedOk(a)&&repeatedOk(b));
add('different-conflict outcomes have different fingerprints',differentOk(a)&&differentOk(b));
add('not all outcomes forced to repeated',Number(a.causalBranchAdvancedToDifferentConflictCount??0)>0||Number(a.causalBranchResolvedBlockedFrontierCount??0)>0||Number(a.causalBranchBudgetInterruptedOutcomeCount??0)>0||samples(a).length===0);
add('no-good registration is exhausting-only',Number(a.causalBranchNoGoodRegisteredCount??0)===Number(a.causalBranchRepeatedSameConflictCount??0)+Number(a.causalBranchProgressedButRepeatedSameConflictCount??0));
add('skip samples back skip counters',skipTotal(a)===0||((a.causalBranchTransitionSkipSamples||[]).length>0&&Number(a.nogoodTransitionActuallySkippedCount??0)===skipTotal(a)));
add('skip by source sum coherent',bySourceTotal(a)===skipTotal(a));
add('resolution counters separated from skips',Number(a.nogoodTransitionActuallySkippedCount??0)<=Number(a.causalBranchTransitionCandidateSkippedCount??0));
add('cursor is built when checkpoints resolve',Number(a.causalDecisionCheckpointResolvedCount??0)===0||Number(a.causalCheckpointCursorBuildCount??0)>0);
add('progress not below ID318',Number(a.productiveAssignmentsReached??0)>=Number(base.productiveAssignmentsReached??38)&&Number(a.productiveTasksRemaining??Infinity)<=Number(base.productiveTasksRemaining??136));
add('work budgets respected',Number(a.totalExpansionWorkUnitCount??Infinity)<=200&&Number(a.generatedAlternativeCount??Infinity)<=600&&Number(a.suspendedFrontierPeak??Infinity)<=16&&Number(a.crossCycleBacktrackCount??Infinity)<=32&&Number(a.exclusiveConstructiveRuntimeMs??Infinity)<90000);
const out={id:321,deterministic,checks,runs:[a,b],baselineId318:base,readOnly:true};
fs.writeFileSync(outPath,JSON.stringify(out,null,2));
NODE
cp "$TMP_OUTPUT" "$OUTPUT"
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); const failed=r.checks.filter(c=>!c.passed); if(failed.length){console.error(JSON.stringify(failed,null,2)); process.exit(1)}' "$OUTPUT" || failures=$((failures+1))
exit "$failures"
