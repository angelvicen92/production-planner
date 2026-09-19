import assert from "node:assert/strict";
import test from "node:test";
import { runA2AnonymousPipelineWitnessProbe } from "./runA2AnonymousPipelineWitnessProbe";

test("A2 anonymous pipeline probe separates structural authorities and identifies the deepest four-run blocker",()=>{
  const result=runA2AnonymousPipelineWitnessProbe();
  assert.deepEqual(result.families.map(family=>[family.runCount,family.architecturesTried,family.witness]),
    [[2,14,"INFEASIBLE"],[3,119,"INFEASIBLE"],[4,980,"INCONCLUSIVE"]]);
  assert.equal(result.families[0]?.structuralRejectionsBySubauthority.TRANSPORT,4);
  assert.equal(result.families[1]?.structuralRejectionsBySubauthority.FEEDER_PREFIX,3);
  assert.equal(result.families[2]?.witnessOutcomesByStatusAndReason["INCONCLUSIVE:FEEDER_RUN_GEOMETRY"],3);
  assert.equal(result.firstRunCount4Inconclusive?.reason,"FEEDER_RUN_GEOMETRY");
  assert.equal(result.firstRunCount4Inconclusive?.mainMatchingCompleted,true);
  assert.equal(result.firstRunCount4Inconclusive?.anchorsCompleted,true);
  assert.equal(result.firstRunCount4Inconclusive?.feederGeometryCompleted,false);
  assert.equal(result.bestRunCount4?.lastCompletedPhase,"anchors");
  assert.equal(result.bestRunCount4?.nextReason,"FEEDER_RUN_GEOMETRY");
  assert.equal(result.firstFeasibleRunCount,null);assert.equal(result.inputImmutable,true);
});
