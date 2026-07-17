import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { runInitialConstructionStage1 } from "./runInitialConstructionStage1";
import { buildInitialConstructionCanonicalContext } from "../understanding/initialConstructionCanonicalContext";
import { evaluateInitialConstructionPartialPlanFutureFeasibility } from "./initialConstructionPartialPlanFutureFeasibility";
import { expandInitialConstructionPartialPlanOnce } from "./expandInitialConstructionPartialPlanOnce";
import { initialConstructionAssignmentFingerprint } from "./materializeInitialConstructionAnchorAttempt";

const input:any={planId:310,workDay:{start:"09:00",end:"14:00"},meal:{start:"13:00",end:"14:00"},contestantAvailabilityById:{1:{start:"09:00",end:"14:00"}},planResourceItems:[],tasks:[
 {id:1,planId:310,templateId:1,status:"pending",contestantId:1,spaceId:1,durationOverrideMin:20,dependsOnTaskIds:[2]},
 {id:2,planId:310,templateId:2,status:"pending",contestantId:1,spaceId:1,durationOverrideMin:20,dependsOnTaskIds:[3]},
 {id:3,planId:310,templateId:3,status:"pending",contestantId:1,spaceId:1,durationOverrideMin:20}
]};

test("uses the selector's complete canonical frontier anchor through the real pipeline",()=>{
 const state:any=buildOperationalStateFromEngineInput(input);
 const stage1:any=runInitialConstructionStage1({originInput:input,originOperationalState:state,createdAt:"fixed"});
 const canonical=buildInitialConstructionCanonicalContext({input,stage1}).context;
 const assignments:any[]=[];
 const parent:any={partialPlanId:"root",parentPartialPlanId:null,depth:0,assignments,assignmentsFingerprint:initialConstructionAssignmentFingerprint(assignments),goalTaskId:null,executionTaskId:null,executedFrontierTaskIds:[],minimalExecutionClosureTaskIds:[],decisionBranchFingerprint:"root",decisionPath:[],criticalChainMapFingerprint:"",anchorRankingFingerprint:"",futureFeasibility:evaluateInitialConstructionPartialPlanFutureFeasibility({criticalChains:[],residualProductiveTaskCount:3}),status:"ACTIVE",createdOrdinal:0,readOnly:true};
 const result:any=expandInitialConstructionPartialPlanOnce({originInput:input,originOperationalState:state,stage1,canonicalContext:canonical,parentPartialPlan:parent,budget:{maxCriticalChainsPerDecision:2,maxExecutableFrontierTasksPerChain:2,maxRetainedChainBranches:3,maxChildrenPerDecision:5},createdOrdinal:1,createdAt:"fixed"});
 assert.ok(result.canonicalAnchors.length>0);
 assert.ok(result.canonicalAnchors.every((anchor:any)=>Array.isArray(anchor.transitivePrerequisiteTaskIds)));
 assert.ok(result.searchSpacesBuilt>0);
 assert.ok(result.transformationsExecuted>0);
 assert.ok(result.simulationsExecuted>0);
 assert.ok(result.validationsExecuted>0);
 assert.ok(result.hardValidChildren.length>0);
 const child=result.hardValidChildren[0];
 assert.equal(child.goalTaskId,1);
 assert.equal(child.executionTaskId,3);
 assert.deepEqual(child.minimalExecutionClosureTaskIds,[3]);
 assert.deepEqual(child.assignments.map((a:any)=>a.taskId),[3]);
});
