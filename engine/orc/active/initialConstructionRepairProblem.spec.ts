import test from "node:test";
import assert from "node:assert/strict";
import { buildInitialConstructionRepairProblem } from "./initialConstructionRepairProblem";

const state:any={planning:[{taskId:99,startPlanned:"08:00",endPlanned:"08:30"}],constraints:{},availability:{},spaces:{}};

test("repair problem builds deterministic minimal causal ejection sets and dependency closure",()=>{
  const input:any={tasks:[{id:1,status:"pending"},{id:2,status:"pending",dependsOnTaskIds:[1]},{id:3,status:"done"},{id:4,status:"pending"}],locks:[{taskId:4}]};
  const p=buildInitialConstructionRepairProblem({input,originOperationalState:state,residualFingerprint:"r",blockedAnchorTaskId:10,terminalEvidence:{contestantConflictTaskIds:[1,3,4]},provisionalAssignments:[{taskId:1,startPlanned:"08:00",endPlanned:"08:10",resourceIds:[]},{taskId:2,startPlanned:"08:10",endPlanned:"08:20",resourceIds:[]},{taskId:4,startPlanned:"08:20",endPlanned:"08:30",resourceIds:[]}],maxEjectedAssignments:2});
  assert.deepEqual(p.directConflictTaskIds,[1]);
  assert.deepEqual(p.candidateEjectionSets[0].repairDependencyClosureTaskIds,[1,2]);
  assert.ok(p.immutableTaskIds.includes(3));
  assert.ok(p.immutableTaskIds.includes(4));
  assert.equal(p.readOnly,true);
});
