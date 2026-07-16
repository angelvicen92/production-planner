import test from "node:test";
import assert from "node:assert/strict";
import { auditInitialConstructionRepairNeighborhoodPreservation } from "./runInitialConstructionRepairNeighborhoodSession";

test("repair neighborhood preservation audit computes exterior modifications and duplicates",()=>{
  const a:any={taskId:1,startPlanned:"08:00",endPlanned:"08:10",resourceIds:[]};
  const r=auditInitialConstructionRepairNeighborhoodPreservation({before:[a,{taskId:2,startPlanned:"08:10",endPlanned:"08:20",resourceIds:[]}],after:[a,{taskId:2,startPlanned:"09:10",endPlanned:"09:20",resourceIds:[]},{taskId:2,startPlanned:"09:10",endPlanned:"09:20",resourceIds:[]}],repairNeighborhoodTaskIds:[1],protectedTaskIds:[1],productiveTaskIds:[1,2]});
  assert.equal(r.protectedAssignmentsModified,false);
  assert.equal(r.outsideNeighborhoodAssignmentsModified,1);
  assert.deepEqual(r.duplicateTaskIds,[2]);
});
import { auditInitialConstructionRepairSearchNodeTransition, expandInitialConstructionRepairSearchNode } from "./runInitialConstructionRepairNeighborhoodSession";
import { profileFromAnchorPlacementEvidence } from "./initialConstructionRepairProblem";

const ctx:any={topologicalTaskIds:[1,2,3,9],dependentsByTaskId:new Map([[1,[]],[2,[]],[3,[]],[9,[]]]),prerequisitesByTaskId:new Map(),dependencyGraph:{edges:[]}};
const baseArgs:any={originInput:{tasks:[1,2,3,9].map(id=>({id,status:"pending"}))},originOperationalState:{planning:[],constraints:{},availability:{},spaces:{}},canonicalContext:ctx,combinedPartialPlan:{assignments:[1,2,3].map(taskId=>({taskId,startPlanned:"08:00",endPlanned:"08:10",resourceIds:[]}))},repairProblem:{residualFingerprint:"r",blockedAnchorClosureTaskIds:[9],protectedTaskIds:[],immutableTaskIds:[]},blockedAnchorTaskId:9,localBudget:{maxEjectedAssignments:4,maxRepairNeighborhoodTasks:12,maxRepairExpansionDepth:3,maxRepairChildNodesPerFailure:8}};
const node=(e:number[], depth=0, parent:string|null=null):any=>({rootCandidateProfileFingerprint:"root",triggeringFailedTaskId:null,triggeringCandidateProfileFingerprint:"root",cumulativeEjectedTaskIds:e,newlyEjectedTaskIds:e,cumulativeRepairDependencyClosureTaskIds:e,repairNeighborhoodTaskIds:[9,...e].sort((a,b)=>a-b),repairNeighborhoodTopologicalTaskIds:[...e,9],expansionDepth:depth,parentNodeFingerprint:parent,baseAssignmentsFingerprint:"base",candidateRank:0,fingerprint:`n:${depth}:${e.join(",")}`,readOnly:true});
const profile=(failed:number, blockers:number[])=>profileFromAnchorPlacementEvidence({blockedAnchorTaskId:failed,evidence:{candidateRank:0,startPlanned:"08:00",endPlanned:"08:10",causalConflictEvidence:{causalConflictTaskIds:blockers,evidenceComplete:true},reasonCodes:["CONTESTANT_OVERLAP"]},provisionalTaskIds:[1,2,3],immutableTaskIds:[]});

test("repair search transition audit validates cumulative child state",()=>{
  const parent=node([1]); const child={...node([1,2],1,parent.fingerprint),newlyEjectedTaskIds:[2],parentNodeFingerprint:parent.fingerprint};
  const audit=auditInitialConstructionRepairSearchNodeTransition(parent,child);
  assert.equal(audit.valid,true);
  assert.equal(audit.dependencyClosureMonotonic,true);
  assert.equal(audit.neighborhoodMonotonic,true);
});

test("expansion accumulates ejected blockers through depth two",()=>{
  const first=expandInitialConstructionRepairSearchNode(baseArgs,node([1]),{failedTaskId:9,failedRepairCandidateProfiles:[profile(9,[2])]});
  assert.deepEqual(first.children[0].cumulativeEjectedTaskIds,[1,2]);
  assert.deepEqual(first.children[0].newlyEjectedTaskIds,[2]);
  const second=expandInitialConstructionRepairSearchNode(baseArgs,first.children[0],{failedTaskId:9,failedRepairCandidateProfiles:[profile(9,[3])]});
  assert.deepEqual(second.children[0].cumulativeEjectedTaskIds,[1,2,3]);
  assert.ok(second.children[0].cumulativeRepairDependencyClosureTaskIds.includes(1));
  assert.ok(second.children[0].cumulativeRepairDependencyClosureTaskIds.includes(2));
});

test("expansion enforces cumulative ejection limit",()=>{
  const limited={...baseArgs,localBudget:{...baseArgs.localBudget,maxEjectedAssignments:2}};
  const expansion=expandInitialConstructionRepairSearchNode(limited,node([1]),{failedTaskId:9,failedRepairCandidateProfiles:[profile(9,[2,3])]});
  assert.equal(expansion.children.length,0);
  assert.equal(expansion.stopReasonCounts.CUMULATIVE_EJECTION_LIMIT,1);
});
