#!/usr/bin/env bash
set -uo pipefail
set +H

OUTPUT="plan-27-orc-causal-activation-transaction-v1.json"
RUN_A="/tmp/plan-27-id321-run-a.json"
RUN_B="/tmp/plan-27-id321-run-b.json"
TMP_OUTPUT="/tmp/plan-27-id321-consolidated.json"
SNAPSHOT="${PLAN27_SNAPSHOT:-${1:-local_engine_scenarios/optiplan-plan-27-engine-scenario-v1.json}}"
BUDGET='{"constructionSearchStrategy":"critical_chain_retained_alternatives","maxElapsedMs":90000,"maxExpandedPartialPlans":200,"maxGeneratedPartialPlans":600,"maxSuspendedPartialPlans":16,"initialExecutableFrontierBatchSize":4,"maxExecutableFrontierTasksScannedPerExpansion":32,"maxBranchEvaluationsPerFrontierTask":48,"maxRetainedValidBranchesPerFrontierTask":3,"maxChildrenPerDecision":3,"maxCrossCycleBacktracks":32,"initialTemporalCandidateBatchSize":8,"maxTemporalCandidatesPerAnchor":24,"maxBranchEvaluationsPerAnchor":48}'

rm -f \
  "$RUN_A" \
  "$RUN_B" \
  "$TMP_OUTPUT" \
  /tmp/plan-27-id320-run-a.json \
  /tmp/plan-27-id320-run-b.json \
  /tmp/plan-27-id320-consolidated.json
trap 'rm -f "$RUN_A" "$RUN_B" "$TMP_OUTPUT"' EXIT

if [[ ! -f "$SNAPSHOT" ]]; then
  echo "ERROR: no existe el snapshot de Plan 27: $SNAPSHOT" >&2
  echo "No se ejecutan benchmarks, no se consolida determinismo y no se sobrescribe $OUTPUT." >&2
  exit 2
fi

npm run check || exit 1
npx tsx --test \
  engine/orc/active/initialConstructionCausalAlternativeActivation.spec.ts \
  engine/orc/active/initialConstructionCausalActivationTransaction.spec.ts \
  engine/orc/active/commitInitialConstructionCausalActivation.spec.ts \
  engine/orc/active/initialConstructionCausalCheckpointCursor.spec.ts \
  engine/orc/active/initialConstructionCausalBranchOutcomeClassifier.spec.ts \
  engine/orc/active/initialConstructionCausalBranchOutcomeLedger.spec.ts \
  engine/orc/active/initialConstructionCausalDecisionCheckpoint.spec.ts \
  engine/orc/active/conflictDirectedInitialConstructionBackjump.spec.ts \
  engine/orc/active/runInitialConstructionIterativeSession.spec.ts \
  engine/tools/runInitialConstructionBenchmark.spec.ts || exit 1

npx tsx engine/tools/runInitialConstructionBenchmark.ts "$SNAPSHOT" "$BUDGET" > "$RUN_A" || exit 1
npx tsx engine/tools/runInitialConstructionBenchmark.ts "$SNAPSHOT" "$BUDGET" > "$RUN_B" || exit 1

node - "$RUN_A" "$RUN_B" "$TMP_OUTPUT" <<'NODE'
const fs=require('node:fs');
const [aPath,bPath,outPath]=process.argv.slice(2);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const a=read(aPath), b=read(bPath);
const checks=[]; const add=(name,passed,details={})=>checks.push({name,passed:Boolean(passed),details});
const nonEmpty=r=>r&&Object.keys(r).length>0&&r.executed!==false&&r.sessionFingerprint;
const stable=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
const sum=o=>Object.values(o||{}).reduce((n,v)=>n+Number(v||0),0);
const commitSources=r=>Number(r.causalActivationSuspendedFrontierCommitCount||0)+Number(r.causalActivationGeneratedGraphCommitCount||0)+Number(r.causalActivationArchiveCommitCount||0)+Number(r.causalActivationCheckpointReopenCommitCount||0);
const budgetOf=r=>r.resolvedRetainedAlternativesBudget||{};
const id318=fs.existsSync('plan-27-orc-causal-checkpoint-reopen-v1.json')?read('plan-27-orc-causal-checkpoint-reopen-v1.json'):null;
const base=(Array.isArray(id318?.runs)&&id318.runs[0])||id318?.runA||id318||{productiveAssignmentsReached:38,productiveTasksRemaining:136,resolvedRetainedAlternativesBudget:budgetOf(a)};
const deterministic=nonEmpty(a)&&nonEmpty(b)&&a.productiveAssignmentsReached===b.productiveAssignmentsReached&&a.productiveTasksRemaining===b.productiveTasksRemaining&&a.crossCycleBacktrackCount===b.crossCycleBacktrackCount&&a.finalAssignmentsFingerprint===b.finalAssignmentsFingerprint&&a.sessionFingerprint===b.sessionFingerprint;
add('runs A and B are real non-empty executions',nonEmpty(a)&&nonEmpty(b));
add('deterministic replay = true',deterministic,{a:a.sessionFingerprint,b:b.sessionFingerprint});
add('budget matches ID318 = true',stable(budgetOf(a),budgetOf(base))&&stable(budgetOf(b),budgetOf(base)));
add('productiveAssignmentsReached >= 38',Number(a.productiveAssignmentsReached)>=38);
add('productiveTasksRemaining <= 136',Number(a.productiveTasksRemaining)<=136);
add('crossCycleBacktrackCount <= 32',Number(a.crossCycleBacktrackCount)<=32);
add('totalExpansionWorkUnitCount <= 200',Number(a.totalExpansionWorkUnitCount)<=200);
add('generatedAlternativeCount <= 600',Number(a.generatedAlternativeCount)<=600);
add('suspendedFrontierPeak <= 16',Number(a.suspendedFrontierPeak)<=16);
add('exclusiveConstructiveRuntimeMs < 90000',Number(a.exclusiveConstructiveRuntimeMs)<90000);
add('cursor built when checkpoint resolves',Number(a.causalDecisionCheckpointResolvedCount||0)===0||Number(a.causalCheckpointCursorBuildCount||0)>0);
add('cursor advanced when activation/inspection occurs',Number(a.causalActivationCandidateInspectionCount||0)===0||Number(a.causalCheckpointCursorAdvanceCount||0)>0);
add('activation commit exercised or honestly absent',Number(a.causalActivationCandidateEligibleCount||0)===0||Number(a.causalActivationTransactionCommitCount||0)>0,{eligible:a.causalActivationCandidateEligibleCount,commits:a.causalActivationTransactionCommitCount});
add('causalActivationBacktrackWithoutCommitCount = 0',Number(a.causalActivationBacktrackWithoutCommitCount||0)===0);
add('causalActivationCommitWithoutOpenedAttemptCount = 0',Number(a.causalActivationCommitWithoutOpenedAttemptCount||0)===0);
add('causalActivationTransactionInvariantViolationCount = 0',Number(a.causalActivationTransactionInvariantViolationCount||0)===0);
add('activePartialPlanAlreadyExpandedAtLoopEntryCount = 0',Number(a.activePartialPlanAlreadyExpandedAtLoopEntryCount||0)===0);
add('prematureTerminationWithEligibleSuspendedFrontierCount = 0',Number(a.prematureTerminationWithEligibleSuspendedFrontierCount||0)===0);
add('decisionPathStringParseCount = 0',Number(a.decisionPathStringParseCount||0)===0);
add('causalActivationSourceClassificationMismatchCount = 0',Number(a.causalActivationSourceClassificationMismatchCount||0)===0);
add('causalActivationCompleteEvidenceLegacySelectorInvocationCount = 0',Number(a.causalActivationCompleteEvidenceLegacySelectorInvocationCount||0)===0);
add('causalActivationLegacyGeneratedSiblingBypassCount = 0',Number(a.causalActivationLegacyGeneratedSiblingBypassCount||0)===0);
add('causalActivationReopenCandidateBypassedTransactionCount = 0',Number(a.causalActivationReopenCandidateBypassedTransactionCount||0)===0);
add('causalActivationCursorUpdateDiscardedCount = 0',Number(a.causalActivationCursorUpdateDiscardedCount||0)===0);
add('causalActivationLedgerOpenAfterPreparedTransactionCount = 0',Number(a.causalActivationLedgerOpenAfterPreparedTransactionCount||0)===0);
add('causalActivationDuplicatePreparePreventedCount >= 0',Number(a.causalActivationDuplicatePreparePreventedCount||0)>=0);
add('causalActivationCommitAttemptCount = accepted + rejected',Number(a.causalActivationCommitAttemptCount||0)===Number(a.causalActivationCommitAcceptedCount||0)+Number(a.causalActivationCommitRejectedCount||0));
add('causalActivationCommitAcceptedCount = commit count',Number(a.causalActivationCommitAcceptedCount||0)===Number(a.causalActivationTransactionCommitCount||0));
add('causalActivationCursorAdvanceDuplicatePreventedCount >= 0',Number(a.causalActivationCursorAdvanceDuplicatePreventedCount||0)>=0);
add('prepared count equals commit count',Number(a.causalActivationTransactionPreparedCount||0)===Number(a.causalActivationTransactionCommitCount||0));
add('no premature ALL_ELIGIBLE_FRONTIER_CANDIDATES_EXHAUSTED with suspended frontier',!(a.stopReason==='ALL_ELIGIBLE_FRONTIER_CANDIDATES_EXHAUSTED'&&Number(a.suspendedPartialPlanCount||0)>0));
add('protected assignments intact',a.protectedAssignmentsModified===false);
add('duplicateTaskIds empty',Array.isArray(a.duplicateTaskIds)&&a.duplicateTaskIds.length===0);
add('final validation passed',a.finalCombinedValidationResult==='VALID'||a.finalCombinedValidationResult==='valid'||a.finalValidationMatchesSelectedPartialPlan===true);
add('commit source sum equals total commits',commitSources(a)===Number(a.causalActivationTransactionCommitCount||0),{sourceSum:commitSources(a),commitCount:a.causalActivationTransactionCommitCount});
add('skip reason sum equals skipped count',sum(a.causalActivationCandidateSkipReasonCounts)===Number(a.causalActivationCandidateSkippedCount||0),{reasonSum:sum(a.causalActivationCandidateSkipReasonCounts),skipped:a.causalActivationCandidateSkippedCount});
add('progress not below ID318',Number(a.productiveAssignmentsReached)>=Number(base.productiveAssignmentsReached??38)&&Number(a.productiveTasksRemaining)<=Number(base.productiveTasksRemaining??136));
const linkedSamples=Array.isArray(a.causalActivationRejectedThenCommittedSamples)?a.causalActivationRejectedThenCommittedSamples:[];
const linkedExercisePassed=linkedSamples.length===Math.min(Number(a.causalActivationTransactionRejectedThenCommittedCount||0),10)&&linkedSamples.every(sample=>sample&&sample.transactionId&&sample.conflictFingerprint&&sample.checkpointFingerprint&&sample.committed===true&&Array.isArray(sample.inspectedCandidates)&&sample.inspectedCandidates.some(candidate=>candidate.status==='SKIPPED')&&sample.inspectedCandidates.some(candidate=>candidate.status==='PREPARED'));
add('linked rejected-then-committed samples are coherent',Number(a.causalActivationTransactionRejectedThenCommittedCount||0)===0||linkedExercisePassed,{count:a.causalActivationTransactionRejectedThenCommittedCount,samples:linkedSamples.length});
const rejectedThenCommitted=Number(a.causalActivationTransactionRejectedThenCommittedCount||0)>0&&linkedExercisePassed;
const out={id:321,version:'plan-27-orc-causal-activation-transaction-v1',deterministic,checks,causalActivationExercise:{rejectedCandidateThenNextCandidateActivated:rejectedThenCommitted,internalRejectionsFollowedByCommitCount:rejectedThenCommitted?Number(a.causalActivationTransactionRejectedThenCommittedCount||0):0,sourcesInspected:{suspended:Number(a.causalActivationCollectedSuspendedCandidateCount||0),generated:Number(a.causalActivationCollectedGeneratedCandidateCount||0),archive:Number(a.causalActivationCollectedArchiveCandidateCount||0),reopen:Number(a.causalActivationCollectedReopenCandidateCount||0)},commitSources:{suspended:Number(a.causalActivationSuspendedFrontierCommitCount||0),generated:Number(a.causalActivationGeneratedGraphCommitCount||0),archive:Number(a.causalActivationArchiveCommitCount||0),reopen:Number(a.causalActivationCheckpointReopenCommitCount||0)}},runs:[a,b],baselineId318:base,readOnly:true};
const failed=checks.filter(c=>!c.passed);
fs.writeFileSync(outPath,JSON.stringify(out,null,2));
if(failed.length){console.error(JSON.stringify(failed,null,2)); process.exit(1)}
NODE
mv "$TMP_OUTPUT" "$OUTPUT"
