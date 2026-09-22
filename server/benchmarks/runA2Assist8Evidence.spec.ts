import assert from "node:assert/strict";
import test from "node:test";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";

test("A2-ASSIST-8 product request/run/apply accepts the canonical first stage",async()=>{
  const first=await runA2Assist8Evidence({branchBudget:5_000});
  const second=await runA2Assist8Evidence({branchBudget:5_000});
  assert.equal(first.status,"PASS");assert.equal(first.stageCount,1);assert.equal(first.scopeCount,1);
  const iteration=first.iterations[0]!;
  assert.equal(iteration.scopeSelector.kind,"SPACE");assert.equal(iteration.resolvedTaskIds.length,19);
  assert.equal(iteration.proposalOutcome,"PROPOSAL");assert.equal(iteration.newObligationCount,19);
  assert.deepEqual(iteration.visibleProposalTaskIds,iteration.resolvedTaskIds);
  assert.equal(iteration.protectedPlacementsPreserved,true);
  assert.equal(iteration.newHardViolationCount,0);assert.equal(iteration.newRequiredViolationCount,0);
  assert.deepEqual(iteration.unstructuredReasonCodes,[]);assert.equal(first.firstBlocker,null);
  assert.equal(iteration.technicalChainFutureReservation.constructive.residualDfsEntered,false);
  assert.ok(iteration.technicalChainFutureReservation.constructive.structuralCandidateFingerprintAtHardGate);
  assert.deepEqual({stage:iteration.acceptedStageFingerprint,fingerprint:first.deterministicFingerprint},
    {stage:second.iterations[0]!.acceptedStageFingerprint,fingerprint:second.deterministicFingerprint});
});
