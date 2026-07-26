#!/usr/bin/env bash
set -euo pipefail
set +H

VALID_ARTIFACT="plan-27-orc-goal-coupled-single-path-recovery-v1.json"
FAILED_ARTIFACT="plan-27-orc-goal-coupled-single-path-recovery-v1.failed.json"
SNAPSHOT="local_engine_scenarios/optiplan-plan-27-engine-scenario-v1.json"
TMP_DIR="/tmp/id324-plan27-$$"
mkdir -p "$TMP_DIR"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

fail(){
  local reason="$1"
  printf '{"benchmarkOutcome":"FAILED","failureReason":"%s","readOnly":true}\n' "$reason" > "$TMP_DIR/failed.json"
  mv "$TMP_DIR/failed.json" "$FAILED_ARTIFACT"
  echo "ID 324 validation failed: $reason" >&2
  exit 1
}

[ -f "$SNAPSHOT" ] || fail "SNAPSHOT_MISSING"
npm run check || fail "NPM_CHECK_FAILED"
npx tsx --test engine/orc/active/initialConstructionGoalCoupledAnchor.spec.ts engine/orc/active/runInitialConstructionStage2FirstPartialPlan.spec.ts || fail "FOCAL_TESTS_FAILED"
npm test || fail "NPM_TEST_FAILED"

BUDGET='{"constructionSearchStrategy":"single_path","maxElapsedMs":90000,"maxAcceptedCycles":80,"anchorBatchSize":12,"maxAnchorRanksScannedPerCycle":128,"initialTemporalCandidateBatchSize":8,"maxTemporalCandidatesPerAnchor":24,"maxBranchEvaluationsPerAnchor":48,"maxResourceAlternativesPerTemporalCandidate":8}'
npx tsx engine/tools/runInitialConstructionBenchmark.ts "$SNAPSHOT" "$BUDGET" > "$TMP_DIR/run1.json" || fail "BENCHMARK_RUN1_FAILED"
npx tsx engine/tools/runInitialConstructionBenchmark.ts "$SNAPSHOT" "$BUDGET" > "$TMP_DIR/run2.json" || fail "BENCHMARK_RUN2_FAILED"
set +e
node - "$TMP_DIR/run1.json" "$TMP_DIR/run2.json" "$TMP_DIR/consolidated.json" <<'NODE'
const fs=require('fs');
const [a,b,out]=process.argv.slice(2);
const r1=JSON.parse(fs.readFileSync(a,'utf8'));
const r2=JSON.parse(fs.readFileSync(b,'utf8'));
const same=(k)=>JSON.stringify(r1[k])===JSON.stringify(r2[k]);
const checks={
 benchmarkOutcome:r1.benchmarkOutcome==='EXECUTED', eligible:r1.benchmarkComparisonEligible===true,
 productive:(r1.productiveAssignmentsReached??0)>=170, remaining:(r1.productiveTasksRemaining??999)<=4,
 cycles:(r1.acceptedCycleCount??r1.cycles??999)<=80, valid:r1.finalValidationResult==='VALID', noV4:r1.v4SeedUsed===false,
 noCommits:(r1.commitsExecuted??0)===0, stage2Goal:r1.stage2GoalIncludedInSelectedAssignments===true,
 resolutions:(r1.goalCoupledAnchorResolutionCount??0)>0, diff:(r1.priorityCarrierDifferentFromGoalCount??0)>0,
 attempts:(r1.goalCoupledPackageAttemptCount??0)>0, accepted:(r1.goalCoupledPackageAcceptedCount??0)>0,
 missing:(r1.acceptedPackageMissingGoalCount??1)===0, multi:(r1.multiTaskAcceptedPackageCount??0)>0,
 deterministic:['stage2PriorityCarrierTaskId','stage2ConstructionGoalTaskId','stage2GoalCoupledClosureTaskIds','stage2SelectedBranchId','stage2GoalCoupledFingerprint','productiveAssignmentsReached','productiveTasksRemaining','acceptedCycleCount','finalCombinedAssignmentsFingerprint','sessionFingerprint','stopReason','terminalBlockerEvidenceFingerprint'].every(same),
 runtime:(r1.exclusiveConstructiveRuntimeMs??999999)<80000 && r2.exclusiveConstructiveRuntimeMs<80000,
 notElapsed:r1.stopReason!=='MAX_ELAPSED_MS'
};
const ok=Object.values(checks).every(Boolean);
fs.writeFileSync(out, JSON.stringify({id:'ID 324',ok,checks,run1:r1,run2:r2,readOnly:true}, null, 2));
process.exit(ok?0:2);
NODE
node_status=$?
set -e
if [ $node_status -eq 0 ]; then
  mv "$TMP_DIR/consolidated.json" "$VALID_ARTIFACT"
else
  cp "$TMP_DIR/consolidated.json" "$FAILED_ARTIFACT"
  exit 1
fi
