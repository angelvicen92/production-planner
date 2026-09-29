import assert from "node:assert/strict";
import test from "node:test";
import { runA2P15P14WitnessProbe } from "./runA2P15P14WitnessProbe";

test("P15 to P14 cross-Stage witness transition reports causal Evidence",async()=>{
  const result=await runA2P15P14WitnessProbe();
  assert.equal(result.p15.proposalOutcome,"PROPOSAL");
  assert.equal(result.p15.completedObligations,111);
  assert.equal(result.p15.futureStructuralWitnessCount,1);
  assert.equal(result.p15.ephemeralSupportingPlacementCount,38);
  assert.equal(result.p15.acceptedSupportingPlacementCount,0);
  assert.deepEqual(result.p15.certifiedSupportingPlacements.find((item:{id:string})=>item.id==="task:10117"),
    {id:"task:10117",start:720,end:730,spaceId:"space:3018"});
  assert.equal(result.p14.priorFutureStructuralWitnessFound,true);
  assert.equal(result.p14.priorFutureStructuralWitnessRevalidation,"PASS");
  assert.equal(result.p14.priorFutureStructuralWitnessReused,true);
  assert.equal(result.p14.priorFutureStructuralWitnessRejectCause,null);
  assert.equal(result.p14.priorFutureStructuralWitnessFallbackEntered,false);
  assert.equal(result.p14.priorAttemptMatchingTraversals,0);
  assert.notEqual(result.p14.branchesBeforeCurrentContinuation,null);
});
