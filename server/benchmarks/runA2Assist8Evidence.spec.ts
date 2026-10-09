import assert from "node:assert/strict";
import test from "node:test";
import { acceptedVisibleObligationCounts, runA2Assist8Evidence } from "./runA2Assist8Evidence";

test("stage metrics include Sodexo obligations and exclude supporting and witness placements",()=>{
  let accepted:Array<{taskId:number}>=[];
  const sizes=[19,19,8,19,10,36,58,38,2,57];
  for(const [index,size] of sizes.entries()){
    const ids=Array.from({length:size},(_,offset)=>accepted.length+offset+1);
    const mealIds=new Set(index===9?ids.slice(-19):[]);
    const after=[...accepted,...ids.map(taskId=>({taskId}))];
    const metrics=acceptedVisibleObligationCounts(accepted,after,ids,ids.filter(id=>!mealIds.has(id)),mealIds);
    assert.equal(after.length-accepted.length,metrics.newObligationCount);
    assert.equal(metrics.newObligationCount,metrics.visibleScopeCount);
    if(index===9){assert.equal(metrics.newObligationCount,57);assert.equal(metrics.newTaskPlacementCount,38);
      assert.equal(metrics.newParticipantMealPlacementCount,19);}
    accepted=after;
  }
  assert.equal(accepted.length,266);
  assert.throws(()=>acceptedVisibleObligationCounts([{taskId:1}],[{taskId:1},{taskId:2},{taskId:3}],
    [2],[2],new Set()),/accepted delta must equal the visible scope/);
  assert.throws(()=>acceptedVisibleObligationCounts([{taskId:1}],[{taskId:2}],
    [2],[2],new Set()),/accepted obligations cannot disappear/);
});

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
