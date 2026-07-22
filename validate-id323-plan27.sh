#!/usr/bin/env bash
set -u -o pipefail
set +H

SNAPSHOT="local_engine_scenarios/optiplan-plan-27-engine-scenario-v1.json"
VALID_ARTIFACT="plan-27-orc-single-path-baseline-recovery-v1.json"
FAILED_ARTIFACT="plan-27-orc-single-path-baseline-recovery-v1.failed.json"
BUDGET='{"constructionSearchStrategy":"single_path","maxElapsedMs":90000,"maxAcceptedCycles":80,"anchorBatchSize":12,"maxAnchorRanksScannedPerCycle":128,"initialTemporalCandidateBatchSize":8,"maxTemporalCandidatesPerAnchor":24,"maxBranchEvaluationsPerAnchor":48,"maxResourceAlternativesPerTemporalCandidate":8}'
RUN_ID="id323-$$-$(date +%s)"
TMP1="/tmp/${RUN_ID}.run1.json"
TMP2="/tmp/${RUN_ID}.run2.json"
TMP_OUT="/tmp/${RUN_ID}.result.json"
TMP_FAIL="/tmp/${RUN_ID}.failed.json"
cleanup() { rm -f "$TMP1" "$TMP2" "$TMP_OUT" "$TMP_FAIL"; }
trap cleanup EXIT

if [ ! -f "$SNAPSHOT" ]; then
  echo "Missing required snapshot: $SNAPSHOT" >&2
  exit 2
fi

CHECK_STATUS=0
npm run check || CHECK_STATUS=$?
if [ "$CHECK_STATUS" -eq 0 ]; then npx tsx --test engine/orc/active/initialConstructionStage2PreliminaryFutureFeasibility.spec.ts engine/tools/runInitialConstructionBenchmark.spec.ts || CHECK_STATUS=$?; fi
if [ "$CHECK_STATUS" -eq 0 ]; then npm test || CHECK_STATUS=$?; fi

npx tsx engine/tools/runInitialConstructionBenchmark.ts "$SNAPSHOT" "$BUDGET" > "$TMP1" || exit $?
npx tsx engine/tools/runInitialConstructionBenchmark.ts "$SNAPSHOT" "$BUDGET" > "$TMP2" || exit $?

BUDGET_JSON="$BUDGET" node - "$TMP1" "$TMP2" "$TMP_OUT" "$TMP_FAIL" "$CHECK_STATUS" <<'NODE'
const fs=require('fs');
const [run1Path,run2Path,outPath,failPath,checkStatusRaw]=process.argv.slice(2);
const a=JSON.parse(fs.readFileSync(run1Path,'utf8'));
const b=JSON.parse(fs.readFileSync(run2Path,'utf8'));
const checkStatus=Number(checkStatusRaw)||0;
const same=(path)=>JSON.stringify(path(a))===JSON.stringify(path(b));
const deterministic = same(x=>x.stage2SelectedBranchId) && same(x=>x.stage2SelectedAssignmentCount) && same(x=>x.stage2SelectedFutureFeasibilityStatus) && same(x=>x.productiveAssignmentsReached) && same(x=>x.productiveTasksRemaining) && same(x=>x.cycles) && same(x=>x.stopReason) && same(x=>x.finalCombinedAssignmentsFingerprint) && same(x=>x.sessionFingerprint) && same(x=>x.terminalBlockerEvidenceFingerprint) && same(x=>x.repairFingerprint);
const acceptance = checkStatus===0 && deterministic && [a,b].every(x => x.stage2Executed===true && x.stage2HardValidBranchCount>=1 && x.stage2SelectedValidationResult==='VALID' && x.stage2SelectedAssignmentCount>0 && x.stage2SelectedFutureFeasibilityStatus!=='INFEASIBLE' && x.iterativeSessionExecuted===true && x.benchmarkComparisonEligible===true && x.benchmarkOutcome==='EXECUTED' && x.productiveAssignmentsReached>=170 && x.productiveTasksRemaining<=4 && x.finalValidationResult==='VALID' && x.v4SeedUsed===false && x.commitsExecuted===0 && x.protectedAssignmentsModified===false && (x.duplicateTaskIds??[]).length===0 && x.exclusiveConstructiveRuntimeMs<80000 && x.stopReason!=='MAX_ELAPSED_MS');
const payload={version:'ID-323-PLAN-27-SINGLE-PATH-BASELINE-RECOVERY-V1',budget:JSON.parse(process.env.BUDGET_JSON||'{}'),checkStatus,deterministic,acceptance,run1:a,run2:b,readOnly:true};
fs.writeFileSync(acceptance?outPath:failPath, JSON.stringify(payload,null,2));
process.exit(acceptance?0:1);
NODE
RESULT=$?
if [ "$RESULT" -eq 0 ]; then
  mv "$TMP_OUT" "$VALID_ARTIFACT"
  rm -f "$FAILED_ARTIFACT"
  echo "Wrote $VALID_ARTIFACT"
  exit 0
fi
if [ -f "$TMP_FAIL" ]; then
  mv "$TMP_FAIL" "$FAILED_ARTIFACT"
  echo "Wrote $FAILED_ARTIFACT; preserved any existing valid artifact." >&2
fi
exit 1
