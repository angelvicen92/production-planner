import assert from "node:assert/strict";
import test from "node:test";
import { runA2AnonymousPipelineWitnessProbe } from "./runA2AnonymousPipelineWitnessProbe";

test("A2 pipeline carries the canonical Main meal and reaches feeder geometry without changing run count",()=>{
  const result=runA2AnonymousPipelineWitnessProbe();
  assert.equal(result.mainFlowMealAuthorityPresent,true);
  assert.deepEqual(result.mainFlowMealWindow,{start:780,end:990});assert.equal(result.mainFlowMealDuration,75);
  assert.equal(result.mainFlowMealSource,"OPERATIONAL_MEAL_POLICY");
  assert.deepEqual([result.mainFlowMealStart,result.mainFlowMealEnd],[780,855]);
  assert.equal(result.runCountAfterMeal,result.runCountBeforeMeal);
  assert.deepEqual(result.families.map(family=>[family.runCount,family.architecturesTried,family.witness]),
    [[2,38,"INFEASIBLE"],[3,90,"FEASIBLE"],[4,565,"FEASIBLE"]]);
  assert.equal(result.firstRunCount4Inconclusive,null);
  assert.equal(result.firstRunCount4FeederFailure,null);
  assert.equal(result.bestRunCount4?.lastCompletedPhase,"FEASIBLE");
  assert.equal(result.bestRunCount4?.nextReason,null);
  assert.equal(result.firstFeasibleRunCount,3);assert.equal(result.inputImmutable,true);
  assert.ok(result.pipelineWitnessBuildMs<10_000);
});
