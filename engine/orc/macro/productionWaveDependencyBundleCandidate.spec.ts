import test from "node:test";
import assert from "node:assert/strict";
import { buildProductionWaveDependencyBundleCandidates, applyProductionWaveDependencyBundleCandidate } from "./productionWaveDependencyBundleCandidate";
const state:any = (lock=false,status="pending") => ({ constraints:{ optimizer:{ mainFlowSpaceId:10 } }, tasks:[{id:1,status:"pending"},{id:2,status},{id:3,status:"pending",dependsOnTaskIds:[2]},{id:4,status:"pending"}], locks:lock?[{taskId:2}]:[], planning:[{taskId:1,startPlanned:"11:30",endPlanned:"12:05",spaceId:10,assignedResourceIds:[101],operationalRole:"productive_task"},{taskId:2,startPlanned:"12:20",endPlanned:"12:50",spaceId:20,assignedResourceIds:[102],operationalRole:"productive_task"},{taskId:3,startPlanned:"12:50",endPlanned:"13:20",spaceId:10,assignedResourceIds:[101],operationalRole:"productive_task"},{taskId:4,startPlanned:"13:20",endPlanned:"13:40",spaceId:10,assignedResourceIds:[101],operationalRole:"productive_task"}] });

test("detects macro-production-wave-dependency-bundle for main flow dependency gap",()=>{
 const r=buildProductionWaveDependencyBundleCandidates({operationalState:state()});
 assert.equal(r.candidates[0].metadata.family,"macro-production-wave-dependency-bundle");
 assert.deepEqual(r.candidates[0].metadata.movedMainZoneTaskIds,[3]);
 assert.deepEqual(r.candidates[0].metadata.movedPrerequisiteTaskIds,[2]);
 assert.deepEqual(r.summary.opportunities[0].blockingDependencyTaskIds,[2]);
});

test("candidate state keeps movement trace and explains changed tasks",()=>{
 const c=buildProductionWaveDependencyBundleCandidates({operationalState:state()}).candidates[0];
 const cs=applyProductionWaveDependencyBundleCandidate(state(), c);
 assert.equal(cs.plannedTransformations[0].kind,"MOVE_CHAIN");
 assert.equal(c.assignments.length, 2);
 assert.ok((c.metadata.movementTrace as any[]).every(m=>m.taskId));
});

test("rejects locked/done prerequisites",()=>{
 assert.equal(buildProductionWaveDependencyBundleCandidates({operationalState:state(true)}).summary.rejectionReasons[0],"LOCK_VIOLATION");
 assert.equal(buildProductionWaveDependencyBundleCandidates({operationalState:state(false,"done")}).summary.rejectionReasons[0],"DONE_OR_IN_PROGRESS_MODIFIED");
});
