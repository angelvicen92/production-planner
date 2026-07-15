import test from "node:test";
import assert from "node:assert/strict";
import { defaultInitialConstructionRepairBudget } from "./runInitialConstructionConflictDirectedRepair";

test("repair budget defaults are bounded and read-only safe by contract",()=>{
  const b=defaultInitialConstructionRepairBudget();
  assert.equal(b.maxRepairRounds,4);
  assert.equal(b.maxEjectedAssignments,4);
  assert.equal(b.maxRepairNeighborhoodTasks,12);
  assert.equal(b.maxRepairAttemptsPerRound,32);
  assert.equal(b.maxRepairBranchEvaluations,128);
  assert.equal(b.maxRepairElapsedMs,30000);
});

test("repair budget includes bounded search-node expansion defaults",()=>{
  const b=defaultInitialConstructionRepairBudget();
  assert.equal(b.maxRepairSearchNodesPerAttempt,64);
  assert.equal(b.maxRepairExpansionDepth,3);
  assert.equal(b.maxRepairChildNodesPerFailure,8);
  assert.equal(b.maxNeighborhoodPartialPlansVisited,128);
});
