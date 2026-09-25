import assert from "node:assert/strict";
import test from "node:test";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";

test("A2-ASSIST-8 product request/run/apply accepts the canonical first stage",async()=>{
  const first=await runA2Assist8Evidence({stopAfterFirstProposal:true});
  const second=await runA2Assist8Evidence({stopAfterFirstProposal:true});
  assert.equal(first.status,"BLOCKED");assert.equal(first.completedObligationCount,19);
  assert.equal(first.remainingObligationCount,247);assert.equal(first.stageCount,1);assert.equal(first.scopeCount,1);
  const iteration=first.iterations[0]!;
  assert.equal(iteration.scopeSelector.kind,"SPACE");assert.equal(iteration.resolvedTaskIds.length,19);
  assert.equal(iteration.proposalOutcome,"PROPOSAL");assert.equal(iteration.newObligationCount,19);
  assert.deepEqual(iteration.visibleProposalTaskIds,iteration.resolvedTaskIds);
  assert.equal(iteration.protectedPlacementsPreserved,true);
  assert.equal(iteration.newHardViolationCount,0);assert.equal(iteration.newRequiredViolationCount,0);
  assert.deepEqual(iteration.unstructuredReasonCodes,[]);assert.equal(first.firstBlocker,null);
  // The operational-meal witness now crosses the core/standalone boundary,
  // avoiding the eight-policy terminal rematerialization without changing placements.
  assert.equal(iteration.ordinal,1);assert.ok(iteration.branchesExplored<=100_000);
  assert.equal(iteration.technicalChainFutureReservation.constructive.residualDfsEntered,false);
  assert.ok(iteration.technicalChainFutureReservation.constructive.structuralCandidateFingerprintAtHardGate);
  assert.deepEqual({stage:iteration.acceptedStageFingerprint,fingerprint:first.deterministicFingerprint},
    {stage:second.iterations[0]!.acceptedStageFingerprint,fingerprint:second.deterministicFingerprint});
});
