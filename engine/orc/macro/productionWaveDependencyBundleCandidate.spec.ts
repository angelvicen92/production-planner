import test from "node:test";
import assert from "node:assert/strict";
import { buildProductionWaveDependencyBundleCandidates, applyProductionWaveDependencyBundleCandidate } from "./productionWaveDependencyBundleCandidate";
import { resolveDirectDependencyBrokenPair, validateProductionWaveDownstreamDependentsAfterTransform } from "./productionWaveDownstreamDependencySafety";
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
 assert.equal(buildProductionWaveDependencyBundleCandidates({operationalState:state(true)}).summary.rejectionReasons[0],"dependency-closure-incomplete");
 assert.equal(buildProductionWaveDependencyBundleCandidates({operationalState:state(false,"done")}).summary.rejectionReasons[0],"dependency-closure-incomplete");
});

test("recursively closes transitive prerequisites before building dependency bundle",()=>{
 const r=buildProductionWaveDependencyBundleCandidates({operationalState:{ constraints:{ optimizer:{ mainFlowSpaceId:10 } }, tasks:[{id:1,status:"pending"},{id:2,status:"pending"},{id:3,status:"pending",dependsOnTaskIds:[2]},{id:4,status:"pending",dependsOnTaskIds:[3]}], locks:[], planning:[{taskId:1,startPlanned:"11:30",endPlanned:"12:05",spaceId:10,assignedResourceIds:[101],operationalRole:"productive_task"},{taskId:2,startPlanned:"12:10",endPlanned:"12:20",spaceId:20,assignedResourceIds:[102],operationalRole:"productive_task"},{taskId:3,startPlanned:"12:20",endPlanned:"12:50",spaceId:20,assignedResourceIds:[102],operationalRole:"productive_task"},{taskId:4,startPlanned:"12:50",endPlanned:"13:20",spaceId:10,assignedResourceIds:[101],operationalRole:"productive_task"}] } as any});
 assert.equal(r.summary.dependencyClosureComplete,true);
 assert.deepEqual(r.candidates[0].metadata.movedPrerequisiteTaskIds,[2,3]);
 assert.equal(r.candidates[0].metadata.movementTrace.find((m:any)=>m.taskId===2).dependencyDepth,2);
});

test("rejects protected transitive prerequisite with explainable closure details",()=>{
 const r=buildProductionWaveDependencyBundleCandidates({operationalState:{ constraints:{ optimizer:{ mainFlowSpaceId:10 } }, tasks:[{id:1,status:"pending"},{id:2,status:"done"},{id:3,status:"pending",dependsOnTaskIds:[2]},{id:4,status:"pending",dependsOnTaskIds:[3]}], locks:[], planning:[{taskId:1,startPlanned:"11:30",endPlanned:"12:05",spaceId:10,assignedResourceIds:[101],operationalRole:"productive_task"},{taskId:2,startPlanned:"12:10",endPlanned:"12:20",spaceId:20,assignedResourceIds:[102],operationalRole:"productive_task"},{taskId:3,startPlanned:"12:20",endPlanned:"12:50",spaceId:20,assignedResourceIds:[102],operationalRole:"productive_task"},{taskId:4,startPlanned:"12:50",endPlanned:"13:20",spaceId:10,assignedResourceIds:[101],operationalRole:"productive_task"}] } as any});
 assert.equal(r.candidates.length,0);
 assert.equal(r.summary.dependencyClosureComplete,false);
 assert.deepEqual(r.summary.rejectionReasons,["dependency-closure-incomplete"]);
 assert.equal(r.summary.rejectedCandidateDetails[0].detailReasons.includes("protected_prerequisite"),true);
 assert.deepEqual(r.summary.missingDependencyTaskIds,[2]);
 assert.match(r.summary.explanation,/2/);
});

test("plan 27 style 358 to 357 transitive prerequisite is not silently omitted",()=>{
 const r=buildProductionWaveDependencyBundleCandidates({operationalState:{ constraints:{ optimizer:{ mainFlowSpaceId:10 } }, tasks:[{id:305,status:"pending"},{id:357,status:"pending"},{id:358,status:"pending",dependsOnTaskIds:[357]},{id:363,status:"pending"},{id:366,status:"pending"},{id:365,status:"pending",dependsOnTaskIds:[358,363,366]}], locks:[], planning:[{taskId:305,startPlanned:"11:30",endPlanned:"12:05",spaceId:10,assignedResourceIds:[335],operationalRole:"productive_task"},{taskId:357,startPlanned:"12:05",endPlanned:"12:15",spaceId:20,assignedResourceIds:[336],operationalRole:"productive_task"},{taskId:358,startPlanned:"12:15",endPlanned:"12:25",spaceId:20,assignedResourceIds:[336],operationalRole:"productive_task"},{taskId:363,startPlanned:"12:25",endPlanned:"12:35",spaceId:20,assignedResourceIds:[336],operationalRole:"productive_task"},{taskId:366,startPlanned:"12:35",endPlanned:"12:50",spaceId:20,assignedResourceIds:[336],operationalRole:"productive_task"},{taskId:365,startPlanned:"12:50",endPlanned:"13:20",spaceId:10,assignedResourceIds:[335],operationalRole:"productive_task"}] } as any});
 assert.deepEqual(r.candidates[0].metadata.movedPrerequisiteTaskIds,[357,358,363,366]);
 assert.deepEqual(r.summary.rejectionReasons,[]);
});


test("plan 27 style nonmovable 357 resolves dependency direction before prefilter",()=>{
 const r=buildProductionWaveDependencyBundleCandidates({operationalState:{ constraints:{ optimizer:{ mainFlowSpaceId:10 } }, tasks:[{id:305,status:"pending"},{id:357,status:"done"},{id:358,status:"pending",dependsOnTaskIds:[357]},{id:363,status:"pending"},{id:366,status:"pending"},{id:365,status:"pending",dependsOnTaskIds:[358,363,366]}], locks:[], planning:[{taskId:305,startPlanned:"11:30",endPlanned:"12:05",spaceId:10,assignedResourceIds:[335],operationalRole:"productive_task"},{taskId:357,startPlanned:"12:40",endPlanned:"12:50",spaceId:20,assignedResourceIds:[336],operationalRole:"productive_task"},{taskId:358,startPlanned:"12:50",endPlanned:"13:00",spaceId:20,assignedResourceIds:[336],operationalRole:"productive_task"},{taskId:363,startPlanned:"12:25",endPlanned:"12:35",spaceId:20,assignedResourceIds:[336],operationalRole:"productive_task"},{taskId:366,startPlanned:"12:35",endPlanned:"12:50",spaceId:20,assignedResourceIds:[336],operationalRole:"productive_task"},{taskId:365,startPlanned:"13:00",endPlanned:"13:20",spaceId:10,assignedResourceIds:[335],operationalRole:"productive_task"}] } as any});
 assert.equal(r.candidates.length,0);
 assert.equal(r.summary.dependencyClosureComplete,false);
 assert.ok(r.summary.blockedByProtectedTaskIds.includes(357));
 assert.ok(r.summary.blockedDependencyPairs.some((p:any)=>(p.taskId===358&&p.dependsOnTaskId===357)||(p.dependentTaskId===358&&p.prerequisiteTaskId===357)));
 assert.notEqual(r.summary.opportunities[0].dependencyClosureComplete,true);
 assert.equal(r.summary.opportunities[0].closureVersion,"ID248");
});


test("ID248 resolves direct dependency broken affectedTaskIds as prerequisite then dependent",()=>{
 const operationalState:any={tasks:[{id:10,status:"pending"},{id:20,status:"pending",dependsOnTaskIds:[10]}],planning:[{taskId:10,startPlanned:"10:00",endPlanned:"11:00"},{taskId:20,startPlanned:"10:30",endPlanned:"11:30"}]};
 const r=resolveDirectDependencyBrokenPair({affectedTaskIds:[10,20],operationalState,originalPrefilterReason:"direct-dependency-broken"});
 assert.equal(r.prerequisiteTaskId,10); assert.equal(r.dependentTaskId,20); assert.equal(r.dependencyDirectionResolved,true);
});

test("ID248 leaves already satisfied prerequisites in place and excludes them from movedPrerequisiteTaskIds",()=>{
 const operationalState:any={ constraints:{ optimizer:{ mainFlowSpaceId:10 } }, tasks:[{id:1,status:"pending"},{id:2,status:"pending"},{id:3,status:"pending",dependsOnTaskIds:[2]},{id:4,status:"pending",dependsOnTaskIds:[2]},{id:5,status:"pending"}], locks:[], planning:[{taskId:1,startPlanned:"11:30",endPlanned:"12:05",spaceId:10,assignedResourceIds:[101],operationalRole:"productive_task"},{taskId:2,startPlanned:"11:40",endPlanned:"12:00",spaceId:20,assignedResourceIds:[102],operationalRole:"productive_task"},{taskId:4,startPlanned:"12:05",endPlanned:"12:20",spaceId:20,assignedResourceIds:[102],operationalRole:"productive_task"},{taskId:5,startPlanned:"12:05",endPlanned:"12:50",spaceId:30,assignedResourceIds:[101],operationalRole:"productive_task"},{taskId:3,startPlanned:"12:50",endPlanned:"13:10",spaceId:10,assignedResourceIds:[101],operationalRole:"productive_task"}] };
 const r=buildProductionWaveDependencyBundleCandidates({operationalState});
 assert.ok(r.summary.leftInPlaceCompatibleTaskIds.includes(2));
 assert.equal(r.candidates[0].metadata.movedPrerequisiteTaskIds.includes(2),false);
 assert.deepEqual(r.candidates[0].metadata.brokenDownstreamDependencyPairs,[]);
});

test("ID248 downstream safety rejects moved prerequisite before nonmoved dependent",()=>{
 const operationalState:any={tasks:[{id:1,status:"pending"},{id:2,status:"pending",dependsOnTaskIds:[1]}],locks:[],planning:[{taskId:1,startPlanned:"10:00",endPlanned:"10:20"},{taskId:2,startPlanned:"10:30",endPlanned:"11:00"}]};
 const r=validateProductionWaveDownstreamDependentsAfterTransform({operationalState,proposedMoves:[{taskId:1,startPlanned:"10:40",endPlanned:"11:00"}],movedTaskIds:[1],maxBundleSearchDepth:5,maxDependencyBundleSize:10});
 assert.equal(r.safe,false); assert.equal(r.brokenDownstreamDependencyPairs[0].prerequisiteTaskId,1); assert.equal(r.brokenDownstreamDependencyPairs[0].dependentTaskId,2); assert.equal(r.reasonCodes.includes("downstream-dependent-would-start-before-moved-prerequisite"),true);
});

test("ID248 downstream safety accepts dependent moved with bundle",()=>{
 const operationalState:any={tasks:[{id:1,status:"pending"},{id:2,status:"pending",dependsOnTaskIds:[1]}],locks:[],planning:[{taskId:1,startPlanned:"10:00",endPlanned:"10:20"},{taskId:2,startPlanned:"10:30",endPlanned:"11:00"}]};
 const r=validateProductionWaveDownstreamDependentsAfterTransform({operationalState,proposedMoves:[{taskId:1,startPlanned:"10:40",endPlanned:"11:00"},{taskId:2,startPlanned:"11:00",endPlanned:"11:30"}],movedTaskIds:[1,2],maxBundleSearchDepth:5,maxDependencyBundleSize:10});
 assert.equal(r.safe,true); assert.deepEqual(r.brokenDownstreamDependencyPairs,[]);
});

test("ID248 detects real resource blocker in production wave gap",()=>{
 const operationalState:any={ constraints:{ optimizer:{ mainFlowSpaceId:10 } }, tasks:[{id:1,status:"pending"},{id:2,status:"pending"},{id:3,status:"pending"}], locks:[], planning:[{taskId:1,startPlanned:"11:30",endPlanned:"12:05",spaceId:10,assignedResourceIds:[101],operationalRole:"productive_task"},{taskId:2,startPlanned:"12:05",endPlanned:"12:50",spaceId:20,assignedResourceIds:[101],operationalRole:"productive_task"},{taskId:3,startPlanned:"12:50",endPlanned:"13:10",spaceId:10,assignedResourceIds:[101],operationalRole:"productive_task"}] };
 const r=buildProductionWaveDependencyBundleCandidates({operationalState});
 assert.ok(r.summary.resourceBlockerTaskIds.includes(2));
 assert.equal(r.summary.blockingPrerequisiteTaskIds.length,0);
});
