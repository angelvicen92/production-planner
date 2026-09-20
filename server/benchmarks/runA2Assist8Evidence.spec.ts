import assert from "node:assert/strict";
import test from "node:test";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";

test("ASST-011 walks canonical product scopes safely to completion or the first exact blocker", async () => {
  const first = await runA2Assist8Evidence({ branchBudget: 1_000 });
  const second = await runA2Assist8Evidence({ branchBudget: 1_000 });
  assert.equal(first.sourceObligationCount, 266);
  assert.equal(first.iterations[0]?.scopeSelector.kind, "SPACE");
  assert.equal(first.iterations[0]?.resolvedTaskIds.length, 19);
  assert.ok(first.iterations[0]?.visibleProposalTaskIds.length === 0 || first.iterations[0]?.visibleProposalTaskIds.length === 19);
  assert.equal(first.iterations[0]?.includePrerequisites, false);
  assert.equal(first.iterations[0]?.sodexoMeals.obligations.length, 19);
  assert.equal(new Set(first.iterations[0]?.sodexoMeals.obligations.map((meal:any)=>meal.sourceTaskId)).size, 19);
  assert.ok(first.iterations[0]?.sodexoMeals.obligations.every((meal:any)=>meal.participantId&&meal.durationMinutes>0&&meal.window&&meal.status&&meal.diagnostic&&meal.witness));
  const firstStandalone=first.iterations[0]?.standaloneDiagnostic;
  if(firstStandalone?.standaloneCompleteLeafCount>0&&firstStandalone.terminalTransportMaterializationAttempts===0){
    assert.notEqual(first.firstBlocker?.classification,"ORDINARY_COMPLETE_TERMINAL_TRANSPORT_REJECTED");
    assert.equal(firstStandalone.terminalTransportMaterializationFailures,0);
  }
  for (const row of first.iterations) {
    if (row.proposalOutcome === "PROPOSAL") {
      assert.deepEqual(row.visibleProposalTaskIds, row.resolvedTaskIds);
      assert.ok(row.sodexoMeals.obligations.every((meal:any)=>meal.status!=="NOT_REACHED"));
      assert.ok(row.operationalMeals.every((meal:any)=>meal.witness.status!=="ABSENT"));
    }
  }
  assert.equal(first.remainingObligationCount, 266 - first.completedObligationCount);
  assert.equal(first.manualChanges, 0); assert.equal(first.rollbackCount, 0);
  assert.equal(first.finalHardViolationCount, 0); assert.equal(first.finalRequiredViolationCount, 0);
  assert.deepEqual(first.finalUnstructuredReasonCodes, []);
  assert.ok(first.iterations.every(row => row.newHardViolationCount === 0 && row.newRequiredViolationCount === 0 && row.unstructuredReasonCodes.length === 0));
  assert.ok(first.iterations.every(row => row.protectedPlacementsPreserved !== false));
  assert.equal(first.dailyTasksMatchesLastAcceptedStage, true);
  assert.equal(first.duplicateFinalIds, 0);
  assert.deepEqual(first.finalObligationIds, [...new Set(first.finalObligationIds)].sort((a, b) => a - b));
  if (first.status === "PASS") {
    assert.equal(first.completedObligationCount, 266); assert.equal(first.remainingObligationCount, 0); assert.equal(first.firstBlocker, null);
    assert.equal(first.finalObligationIdsMatchSource, true);
  } else {
    assert.equal(first.status, "BLOCKED"); assert.ok(first.completedObligationCount < 266); assert.ok(first.firstBlocker);
    const blockerIteration=first.iterations.find(row=>row.baseStageId===first.firstBlocker!.baseStageId
      &&row.proposalOutcome==="NO_PROPOSAL");
    const diagnostic=blockerIteration?.standaloneDiagnostic;
    assert.ok(diagnostic?.firstTerminalCompletionRejection
      ||first.firstBlocker.classification==="PARTICIPANT_MEAL_FUTURE_FEASIBILITY_PRUNE"
      ||first.firstBlocker.classification==="SEARCH_CAPACITY_EXHAUSTED"
      ||(first.firstBlocker.classification==="INFEASIBILITY_REQUIRES_SEPARATE_CAUSAL_DELTA"
        &&first.firstBlocker.reasonCodes.includes("NO_COMPLETE_HARD_VALID_ITINERANT_PLAN")));
    if(first.firstBlocker.classification==="ORDINARY_COMPLETE_TERMINAL_TRANSPORT_REJECTED")
      assert.ok(diagnostic.terminalTransportMaterializationAttempts>0);
    if(diagnostic?.firstTerminalCompletionRejection)
      assert.ok(diagnostic.terminalCompletionRejectionsByCause[diagnostic.firstTerminalCompletionRejection.cause]>0);
    if(diagnostic?.firstTerminalCompletionRejection?.cause==="VALIDATION_REJECTED") {
      assert.equal(diagnostic.firstTerminalCompletionRejection.participantMealWitness.complete,true);
      assert.equal(diagnostic.firstTerminalCompletionRejection.operationalMealWitness.complete,true);
      assert.ok(diagnostic.firstTerminalCompletionRejection.validation.reasonCodes.length>0);
      assert.ok(diagnostic.firstTerminalCompletionRejection.validation.violations.length>0);
    }
    if(first.firstBlocker.classification==="PARTICIPANT_MEAL_FUTURE_FEASIBILITY_PRUNE") {
      assert.ok(first.firstBlocker.causingTask?.canonicalTaskId);
      assert.ok(first.firstBlocker.blockingMeal?.sourceTaskId);
      assert.equal(first.firstBlocker.participantMealPrune.candidateCount,0);
      assert.ok(first.firstBlocker.participantMealPrune.reasonCodes.length>0);
      assert.equal(first.firstBlocker.failureCategory,"FUTURE_FEASIBILITY");
      assert.equal(first.firstBlocker.firstCausalCheck,"participantMealFutureFeasibility probe");
      assert.equal(first.firstBlocker.rejectionReason,first.firstBlocker.participantMealPrune.reasonCodes[0]);
      assert.deepEqual(first.firstBlocker.blockingTaskIds,[first.firstBlocker.participantMealPrune.blockingMealTaskId]);
      assert.deepEqual(first.firstBlocker.blockers,[]);
    }
  }
  assert.deepEqual({ stages: first.iterations.map(row => [row.resolvedTaskIds, row.proposalOutcome, row.acceptedStageFingerprint]), fingerprint: first.deterministicFingerprint },
    { stages: second.iterations.map(row => [row.resolvedTaskIds, row.proposalOutcome, row.acceptedStageFingerprint]), fingerprint: second.deterministicFingerprint });
});
