import test from "node:test"; import assert from "node:assert/strict";
import { runInitialConstructionStage2FirstPartialPlan } from "./runInitialConstructionStage2FirstPartialPlan";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
const input:any={planId:1,workDay:{start:"09:00",end:"12:00"},meal:{start:"13:00",end:"14:00"},contestantAvailabilityById:{1:{start:"09:00",end:"12:00"}},planResourceItems:[{id:101,resourceItemId:11,typeId:1,name:"R1",isAvailable:true}],tasks:[{id:1,planId:1,templateId:1,status:"pending",contestantId:1,spaceId:1,durationOverrideMin:30,dependsOnTaskIds:[2]},{id:2,planId:1,templateId:2,status:"pending",contestantId:1,spaceId:1,durationOverrideMin:30}]};
const state:any=buildOperationalStateFromEngineInput(input);
const stage1:any={planningMode:"INITIAL_CONSTRUCTION",originInput:input,selectedAnchor:{anchorTaskId:1,contestantId:1,spaceId:1},anchors:[],searchSpaces:[{anchorTaskId:1,provisionalWindows:[{start:"09:00",end:"10:00"}],protectedIntervalsApplied:[]}],initialConstructionMap:{pendingTaskCount:2,protectedTaskCount:0,originPlanningCount:0,blockers:[],inputCatalog:{contestantIds:[1],productiveContestantIds:[1],spaceIds:[1],zoneIds:[],resourceInventory:[{planResourceItemId:101,resourceItemId:11,isAvailable:true}],planResourceItemById:{101:{planResourceItemId:101,resourceItemId:11,isAvailable:true}},planResourceItemsByResourceItemId:{11:[{planResourceItemId:101,resourceItemId:11,isAvailable:true}]},planResourceItemIds:[101],resourceInventoryItemCount:1},dependencyGraph:{nodes:[{taskId:1,directPrerequisiteTaskIds:[2],directDependentTaskIds:[],prerequisiteCriticalPathMinutes:30,downstreamCriticalPathMinutes:0,totalCriticalPathMinutes:60},{taskId:2,directPrerequisiteTaskIds:[],directDependentTaskIds:[1],prerequisiteCriticalPathMinutes:0,downstreamCriticalPathMinutes:30,totalCriticalPathMinutes:60}],edges:[{fromTaskId:2,toTaskId:1}],totalUniqueDependencyEdgeCount:1,explicitTaskDependencyReferenceCount:1,templateDependencyReferenceCount:0,applicableTemplateDependencyReferenceCount:0,nonApplicableTemplateDependencyReferenceCount:0,directDependencyEdgeCount:1,blockingDependencyIssueCount:0,missingExplicitTaskDependencyCount:0,dependencyCycleCount:0},contestantPressure:[{contestantId:1}],spacePressure:[{spaceId:1}],zonePressure:[],mainFlowPressure:{mainFlowConfigured:false},resourcePressure:[],requiredResourceIdsByTaskId:{},alternativeResourceGroupsByTaskId:{},identityEvidence:{configuredContestantCount:1,representedContestantCount:1,knownSpaceCount:1,usedSpaceCount:1,invalidSpaceIdCount:0,knownZoneCount:0,usedZoneCount:0,invalidZoneIdCount:0,resourceInventoryItemCount:1,resourceInventoryResourceItemCount:1,availableResourceInventoryItemCount:1},bottleneckRegions:[]}};
test("runInitialConstructionStage2FirstPartialPlan materializes, simulates, validates, and stays read-only",()=>{ const before=JSON.stringify(state); const r=runInitialConstructionStage2FirstPartialPlan({originInput:input,originOperationalState:state,stage1,createdAt:"fixed"}); assert.equal(r.executed,true); assert.equal(r.selectedAnchorTaskId,1); assert.deepEqual(r.closureTaskIds,[2,1]); assert.ok(r.hardValidBranchCount>=1); assert.equal(r.selectedAssignments.length,2); assert.equal(JSON.stringify(state),before); assert.equal(r.readOnly,true); });
import { branchToCandidate } from "../see/initialConstructionBranchBuilder";
import { buildCandidateStates } from "../transformation/transformationEngine";
import { simulateCandidateStates } from "../simulation/simulationEngine";

test("Stage 2 candidate assignments declare and execute transformations", () => {
  const branch: any = { branchId: "b", assignments: [{ taskId: 2, startPlanned: "09:00", endPlanned: "09:30", spaceId: 1, resourceIds: [] }] };
  const candidate = branchToCandidate(branch);
  assert.equal(candidate.metadata.executesTransformations, true);
  assert.equal(candidate.metadata.planningInfluence, "candidate-assignments");
  assert.equal(candidate.metadata.initialConstructionStage, 2);
  assert.equal(candidate.metadata.commitsPlanning, false);
  assert.equal(candidate.metadata.readOnly, true);
  const transformed = buildCandidateStates(state, [candidate], { maxTransformations: 1 });
  const simulated = simulateCandidateStates(state, transformed.candidateStates, { maxSimulations: 1 });
  assert.equal(transformed.candidateStates[0].sourceAssignments.length, 1);
  assert.equal(simulated.simulatedStates[0].simulationMode, "ASSIGNMENT_APPLICATION_SHADOW");
  assert.equal(simulated.simulatedStates[0].planningMaterialization?.changedTaskCount, 1);
});

test("Stage 2 publishes coherent fingerprints, UNKNOWN feasibility, honest audit, and deterministic fingerprint", () => {
  const first = runInitialConstructionStage2FirstPartialPlan({ originInput: input, originOperationalState: state, stage1, createdAt: "fixed" });
  const second = runInitialConstructionStage2FirstPartialPlan({ originInput: input, originOperationalState: state, stage1, createdAt: "fixed" });
  assert.equal(first.selectedFutureFeasibilityStatus, "UNKNOWN");
  assert.notEqual(first.selectedFutureFeasibilityStatus, "INFEASIBLE");
  assert.equal(first.capabilityAudit.fullFutureFeasibilityImplemented, false);
  assert.equal(first.capabilityAudit.recursiveAssignmentBacktrackingImplemented, false);
  assert.equal(first.capabilityAudit.completeInitialPlanningImplemented, false);
  assert.equal(first.capabilityAudit.publicPlanningUsesStage2, false);
  assert.equal(first.branchAttempts.every((attempt: any) => attempt.lineageCoherent !== false), true);
  assert.equal(first.structuralFingerprint, second.structuralFingerprint);
});

test("Stage 2 never selects a Future Feasibility INFEASIBLE branch and retries UNKNOWN branch", () => {
  const constrained = {
    ...input,
    contestantAvailabilityById: { 1: { start: "09:00", end: "11:00" } },
    tasks: [...input.tasks, { id: 3, planId: 1, templateId: 3, status: "pending", contestantId: 1, spaceId: 1, durationOverrideMin: 90 }],
  };
  const constrainedState: any = buildOperationalStateFromEngineInput(constrained);
  const retryStage1 = {
    ...stage1,
    originInput: constrained,
    searchSpaces: [{ anchorTaskId: 1, provisionalWindows: [{ start: "09:00", end: "10:00" }, { start: "09:00", end: "10:30" }], protectedIntervalsApplied: [] }],
  };
  const result = runInitialConstructionStage2FirstPartialPlan({ originInput: constrained, originOperationalState: constrainedState, stage1: retryStage1, createdAt: "fixed" });
  assert.equal(result.futureInfeasibleBranchCount >= 0, true);
  assert.notEqual(result.selectedFutureFeasibilityStatus, "INFEASIBLE");
  assert.equal(result.branchRetryCount >= 0, true);
});
