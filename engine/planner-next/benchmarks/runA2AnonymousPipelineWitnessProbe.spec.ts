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
  assert.deepEqual(result.families.map(family=>family.runCount),[2,3,4,5]);
  assert.equal(result.families.find(family=>family.runCount===4)?.witness,"FEASIBLE");
  const feasibleRunCounts=result.families.filter(family=>family.witness==="FEASIBLE").map(family=>family.runCount);
  assert.ok(feasibleRunCounts.length>0);
  assert.equal(result.firstFeasibleRunCount,Math.min(...feasibleRunCounts));
  assert.ok(result.families
    .filter(family=>family.runCount<result.firstFeasibleRunCount!)
    .every(family=>family.witness==="INFEASIBLE"));
  assert.equal(result.firstRunCount4Inconclusive,null);
  assert.equal(result.bestRunCount4?.lastCompletedPhase,"FEASIBLE");
  assert.equal(result.bestRunCount4?.nextReason,null);
  // This bounded anonymous witness certifies only the pipeline and authorities
  // it evaluates; FEASIBLE does not certify globally completing the A2 day.
  assert.equal(result.inputImmutable,true);
  assert.equal(result.operationalMealPoliciesChecked,8);assert.equal(result.operationalMealFutureFeasible,true);
  assert.equal(result.participantMealsChecked,19);assert.equal(result.participantMealFutureFeasible,true);
  assert.ok(result.pipelineWitnessBuildMs<20_000);
});
