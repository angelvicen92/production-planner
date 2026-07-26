import test from "node:test";
import assert from "node:assert/strict";
import { resolveInitialConstructionGoalCoupledAnchor } from "./initialConstructionGoalCoupledAnchor";

const tasks=[1,2,3,4].map(id=>({id,status:"pending"}));
const map:any={
 provisionallyAssignedTaskIds:[],
 classification:{taskUniverse:{constructiveExecutionTaskIds:[1,2,3,4],constructiveTargetTaskIds:[1,2,3,4]},constructiveExecutionTasks:[1,2,3,4].map(id=>({id})),constructiveTargetTasks:[1,2,3,4].map(id=>({id}))},
 dependencyGraph:{nodes:[{taskId:3,transitivePrerequisiteTaskIds:[1,2]},{taskId:4,transitivePrerequisiteTaskIds:[1]}]},
 criticalChains:[{goalTaskId:3,topologicalPendingChainTaskIds:[1,2,3],executableFrontierTaskIds:[1,2],fingerprint:"c3"},{goalTaskId:4,topologicalPendingChainTaskIds:[1,4],executableFrontierTaskIds:[1],fingerprint:"c4"}]
};

test("ID 324 A resolves a priority carrier to a separate construction goal and topological closure",()=>{
 const r=resolveInitialConstructionGoalCoupledAnchor({anchor:{anchorTaskId:1,primarySupportedGoalTaskId:3,goalTaskId:3,supportedGoalTaskIds:[3]},initialConstructionMap:map,inputTasks:tasks,targetConstructiveTaskIds:[1,2,3,4],constructionSearchStrategy:"single_path"});
 assert.equal(r.priorityCarrierTaskId,1);
 assert.equal(r.constructionGoalTaskId,3);
 assert.deepEqual(r.topologicalPendingGoalClosureTaskIds,[1,2,3]);
 assert.equal(r.goalIncludedInPendingClosure,true);
});

test("ID 324 D skips an already satisfied primary goal and tries the next supported goal",()=>{
 const r=resolveInitialConstructionGoalCoupledAnchor({anchor:{anchorTaskId:1,primarySupportedGoalTaskId:3,goalTaskId:3,supportedGoalTaskIds:[3,4]},initialConstructionMap:map,inputTasks:tasks,provisionalAssignedTaskIds:[3],targetConstructiveTaskIds:[1,2,3,4],constructionSearchStrategy:"single_path"});
 assert.equal(r.goalAlreadySatisfied,true);
 assert.equal(r.constructionGoalTaskId,4);
 assert.deepEqual(r.topologicalPendingGoalClosureTaskIds,[1,4]);
});

test("ID 324 F treats protected prerequisites as satisfied without dropping the goal",()=>{
 const r=resolveInitialConstructionGoalCoupledAnchor({anchor:{anchorTaskId:1,primarySupportedGoalTaskId:3,goalTaskId:3,supportedGoalTaskIds:[3]},initialConstructionMap:map,inputTasks:[{id:1,status:"done"},{id:2,status:"pending"},{id:3,status:"pending"}],targetConstructiveTaskIds:[1,2,3],constructionSearchStrategy:"single_path"});
 assert.deepEqual(r.alreadySatisfiedClosureTaskIds,[1]);
 assert.deepEqual(r.topologicalPendingGoalClosureTaskIds,[2,3]);
 assert.equal(r.goalIncludedInPendingClosure,true);
});

test("ID 324 H is deterministic under physical order inversion",()=>{
 const args={anchor:{anchorTaskId:1,primarySupportedGoalTaskId:3,goalTaskId:3,supportedGoalTaskIds:[3]},initialConstructionMap:{...map,criticalChains:[...map.criticalChains].reverse()},inputTasks:[...tasks].reverse(),targetConstructiveTaskIds:[4,3,2,1],constructionSearchStrategy:"single_path" as const};
 const a=resolveInitialConstructionGoalCoupledAnchor({...args, initialConstructionMap:map, inputTasks:tasks});
 const b=resolveInitialConstructionGoalCoupledAnchor(args);
 assert.deepEqual(b.topologicalPendingGoalClosureTaskIds,a.topologicalPendingGoalClosureTaskIds);
 assert.equal(b.fingerprint,a.fingerprint);
});

test("ID 324 I falls back to self anchor when no critical chain exists",()=>{
 const r=resolveInitialConstructionGoalCoupledAnchor({anchor:{anchorTaskId:2,supportedGoalTaskIds:[]},initialConstructionMap:{...map,criticalChains:[]},inputTasks:tasks,targetConstructiveTaskIds:[1,2,3,4],constructionSearchStrategy:"single_path"});
 assert.equal(r.goalResolutionSource,"SELF_ANCHOR_FALLBACK");
 assert.equal(r.constructionGoalTaskId,2);
});
