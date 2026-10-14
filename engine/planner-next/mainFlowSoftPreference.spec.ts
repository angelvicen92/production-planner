import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { executePlannerNext } from "./executePlannerNext";
import { effectiveMainBlockCount, type ExactItinerantPlanResult } from "./exactItinerantPlan";
import { ExactSearchTimeLimitReached } from "./exactMainAndFeederCore";
import { buildAssistedProblem, createPlanningScope } from "./assistedPlanning";
import { validatePlan, preflight } from "./validate";
import { coldFallbackFixture } from "../../script/demo/mainFlowSoftBlockDiagnostic";
import type { FutureJointCompletionWitnessV1, FutureStructuralWitness } from "./anonymousPipelineWitness";
import { createSupportedEngineInputAdapterFixture } from "./integration/engineInputAdapter.fixture";
import { adaptEngineInputToPlannerNextProblem } from "./integration/engineInputAdapter";

function execute(problem:PlannerNextProblem,options:Parameters<typeof executePlannerNext>[1]={}):ExactItinerantPlanResult {
  const before=structuredClone({problem,options}),result=executePlannerNext(problem,{causalDiagnostic:true,...options});
  assert.equal(result.kind,"EXACT_CONSTRUCTIVE");
  assert.deepEqual({problem,options},before);
  if(result.kind!=="EXACT_CONSTRUCTIVE")throw Error("Unexpected policy");
  assert.equal(result.result.evidence.branchesExplored,result.result.evidence.coreBranches+result.result.evidence.standaloneBranches);
  assert.ok(result.result.evidence.branchesExplored<=problem.budget.maxBranchExpansions);
  if(result.result.evidence.causalDiagnostic)assert.equal(Object.values(result.result.evidence.causalDiagnostic.waterfallByDepth)
    .reduce((sum,row)=>sum+row.total,0),result.result.evidence.branchesExplored);
  return result.result;
}
function feasibleFixture():PlannerNextProblem {
  const problem=coldFallbackFixture();
  problem.tasks=problem.tasks.filter(task=>task.kind!=="auxiliary");
  return problem;
}
function jointFixture():PlannerNextProblem {
  const problem=coldFallbackFixture();
  for(const task of problem.tasks.filter(task=>task.kind==="auxiliary"))task.availability=[{start:90,end:100}];
  problem.transportPolicy={arrival:{taskIds:[],minimumGroupSize:1,maximumGroupSize:2,minGapMinutes:0,groupingWeight:0},
    departure:{taskIds:problem.tasks.filter(task=>task.kind==="auxiliary").map(task=>task.id),
      minimumGroupSize:1,maximumGroupSize:2,minGapMinutes:0,groupingWeight:0}};
  return problem;
}
function projected(source:PlannerNextProblem,fixed:readonly ScheduledTask[]=[],prior:readonly FutureStructuralWitness[]=[]) {
  const scope=createPlanningScope({kind:"space",value:"main"},{},source.tasks.filter(task=>task.kind==="main").map(task=>task.id));
  const built=buildAssistedProblem(source,scope,fixed,new Set(source.tasks.map(task=>task.id)),[],[],[],[],prior);
  const result=execute(built.problem,{fixedPlacements:fixed,fixedPlacementsAsContext:true,priorFutureStructuralWitnesses:prior});
  return {built,result};
}
function joint(result:ExactItinerantPlanResult):FutureJointCompletionWitnessV1 {
  const witness=result.evidence.futureStructuralWitnesses.find(item=>item.kind==="JOINT_COMPLETION");
  assert.ok(witness?.kind==="JOINT_COMPLETION");
  return witness as FutureJointCompletionWitnessV1;
}

for(const budget of [51,95,102,1000])test(`cold SOFT retains AUTO's complete fingerprint under the same ${budget} branches`,()=>{
  const problem=coldFallbackFixture();problem.budget.maxBranchExpansions=budget;
  const auto=execute(problem);assert.equal(auto.complete,true);assert.equal(auto.evidence.branchesExplored,51);
  problem.mainFlow.preferredBlockCount=4;
  const first=execute(problem),second=execute(problem);
  assert.deepEqual(first,second);assert.equal(first.complete,true);
  assert.equal(first.evidence.fullFingerprint,auto.evidence.fullFingerprint);
  assert.equal(validatePlan(problem,first.scheduledTasks).hardValid,true);
  const soft=first.evidence.mainFlowSoftPreference!;
  assert.equal(soft.achieved,2);assert.equal(soft.incumbentAtBranch,51);assert.equal(soft.incumbentOrigin,"AUTO");
  assert.equal(soft.baseline.branches+(soft.improvement?.branches??0),first.evidence.branchesExplored);
  if(budget===51){assert.equal(soft.improvement,null);assert.equal(first.evidence.branchesExplored,51);}
  if(budget===95||budget===102){assert.equal(soft.improvement!.status,"BRANCH_BUDGET_EXHAUSTED");
    assert.ok(soft.improvement!.structuralRejections.FUTURE_DEPENDENCY_CAPACITY>0);}
});

for(const requested of [3,4])test(`a feasible ${requested}-block objective improves AUTO, including a one-pattern cap`,()=>{
  const problem=feasibleFixture();problem.budget.maxPatterns=1;
  const auto=execute(problem);assert.equal(effectiveMainBlockCount(auto.scheduledTasks),2);
  problem.mainFlow.preferredBlockCount=requested;
  const first=execute(problem);assert.deepEqual(first,execute(problem));assert.equal(first.complete,true);
  assert.equal(validatePlan(problem,first.scheduledTasks).hardValid,true);
  assert.equal(effectiveMainBlockCount(first.scheduledTasks),requested);
  assert.equal(first.evidence.mainFlowSoftPreference!.stopReason,"TARGET_ACHIEVED");
  assert.notEqual(first.evidence.fullFingerprint,auto.evidence.fullFingerprint);
});

test("a feasible objective still falls back if only AUTO's measured cost is available",()=>{
  const problem=feasibleFixture(),auto=execute(problem);
  problem.budget.maxBranchExpansions=auto.evidence.branchesExplored;problem.mainFlow.preferredBlockCount=4;
  const result=execute(problem);assert.equal(result.complete,true);
  assert.equal(result.evidence.fullFingerprint,auto.evidence.fullFingerprint);
  assert.equal(result.evidence.mainFlowSoftPreference!.stopReason,"BRANCH_BUDGET_EXHAUSTED");
});

test("exhaustion without a complete incumbent remains inconclusive",()=>{
  const problem=coldFallbackFixture();problem.mainFlow.preferredBlockCount=4;problem.budget.maxBranchExpansions=1;
  const result=execute(problem);assert.equal(result.complete,false);assert.equal(result.status,"BRANCH_BUDGET_EXHAUSTED");
  assert.equal(result.evidence.mainFlowSoftPreference!.incumbentOrigin,null);
  assert.equal(result.evidence.mainFlowSoftPreference!.stopReason,"NO_COMPLETE_INCUMBENT");
});

test("the same cooperative deadline preserves an incumbent, and never fabricates one before completion",()=>{
  const problem=feasibleFixture();let baselineCalls=0;
  const auto=executePlannerNext(problem,{checkpoint:()=>{baselineCalls++;}});
  assert.equal(auto.kind,"EXACT_CONSTRUCTIVE");
  problem.mainFlow.preferredBlockCount=4;let calls=0;
  const result=executePlannerNext(problem,{checkpoint:()=>{if(++calls>baselineCalls)throw new ExactSearchTimeLimitReached();}});
  assert.equal(result.kind,"EXACT_CONSTRUCTIVE");if(result.kind!=="EXACT_CONSTRUCTIVE"||auto.kind!=="EXACT_CONSTRUCTIVE")return;
  assert.equal(result.result.complete,true);assert.equal(result.result.evidence.fullFingerprint,auto.result.evidence.fullFingerprint);
  assert.equal(result.result.evidence.mainFlowSoftPreference!.stopReason,"TIME_LIMIT_REACHED");
  const noIncumbent=executePlannerNext(problem,{checkpoint:()=>{throw new ExactSearchTimeLimitReached();}});
  assert.equal(noIncumbent.kind,"EXACT_CONSTRUCTIVE");if(noIncumbent.kind!=="EXACT_CONSTRUCTIVE")return;
  assert.equal(noIncumbent.result.complete,false);assert.equal(noIncumbent.result.status,"TIME_LIMIT_REACHED");
});

test("valid joint replay is charged before improvement and remains ephemeral",()=>{
  const source=jointFixture(),initial=projected(source).result,witness=joint(initial);
  source.mainFlow.preferredBlockCount=4;
  const {built,result}=projected(source,[],[witness]);
  assert.equal(result.complete,true);assert.equal(result.evidence.mainFlowSoftPreference!.priorRevalidation,"PASS");
  assert.equal(result.evidence.mainFlowSoftPreference!.incumbentOrigin,"REVALIDATED_JOINT_COMPLETION");
  assert.ok(result.evidence.mainFlowSoftPreference!.baseline.branches>=source.tasks.length);
  assert.equal(effectiveMainBlockCount(joint(result).tasks),4);assert.equal(built.protectedPlacements.length,0);
  assert.deepEqual(result,projected(source,[],[witness]).result);
  const soft=structuredClone(source);soft.budget.maxBranchExpansions=result.evidence.mainFlowSoftPreference!.baseline.branches;
  const fallback=projected(soft,[],[witness]).result;
  assert.equal(fallback.complete,true);assert.equal(joint(fallback).fingerprint,witness.fingerprint);
});

test("obsolete joint task semantics/configuration never qualify as an incumbent",()=>{
  const source=jointFixture(),witness=joint(projected(source).result);
  source.tasks.find(task=>task.id==="finish-a1")!.duration=10;
  source.mainFlow.preferredBlockCount=4;
  const result=projected(source,[],[witness]).result;
  assert.equal(result.complete,true);assert.equal(result.evidence.mainFlowSoftPreference!.priorRevalidation,"STALE");
  assert.equal(result.evidence.mainFlowSoftPreference!.incumbentOrigin,"AUTO");
  assert.notEqual(joint(result).fingerprint,witness.fingerprint);
  assert.equal(joint(result).tasks.find(task=>task.id==="finish-a1")!.duration,10);
  const changed=structuredClone(source);changed.budget.maxBranchExpansions=1;
  const incomplete=projected(changed,[],[witness]).result;
  assert.equal(incomplete.complete,false);assert.equal(incomplete.evidence.mainFlowSoftPreference!.incumbentOrigin,null);
});

test("an accepted/protected Main overrides preference; rollback only removes the supplied protection",()=>{
  const source=jointFixture(),initial=projected(source).result,witness=joint(initial);
  const fixed=witness.tasks.filter(task=>task.kind==="main");source.mainFlow.preferredBlockCount=4;
  const {built,result}=projected(source,fixed,[witness]);
  assert.equal(result.complete,true);assert.equal(result.evidence.mainFlowSoftPreference!.stopReason,"MAIN_PROTECTED");
  assert.equal(effectiveMainBlockCount(joint(result).tasks),2);assert.equal(built.protectedPlacements.length,fixed.length);
  for(const task of fixed)assert.deepEqual(result.scheduledTasks.find(item=>item.id===task.id),task);
  const restored=projected(source,[],[witness]).result;
  assert.equal(restored.complete,true);assert.equal(effectiveMainBlockCount(joint(restored).tasks),4);
  assert.deepEqual(fixed,witness.tasks.filter(task=>task.kind==="main"));
});

test("partial Main protection preserves its exact placement while other Main tasks improve",()=>{
  const source=feasibleFixture(),auto=execute(source),fixed=auto.scheduledTasks.filter(task=>task.kind==="main").slice(0,1);
  source.mainFlow.preferredBlockCount=4;
  const result=execute(source,{fixedPlacements:fixed,fixedPlacementsAsContext:true});
  assert.equal(result.complete,true);assert.equal(effectiveMainBlockCount(result.scheduledTasks),4);
  assert.deepEqual(result.scheduledTasks.find(task=>task.id===fixed[0]!.id),fixed[0]);
});

test("an accepted preferred geometry remains fixed even outside AUTO's truncated pattern prefix",()=>{
  const source=feasibleFixture();source.budget.maxPatterns=1;source.mainFlow.preferredBlockCount=4;
  const preferred=execute(source),fixed=preferred.scheduledTasks.filter(task=>task.kind==="main");
  source.mainFlow.preferredBlockCount=3;
  const result=execute(source,{fixedPlacements:fixed,fixedPlacementsAsContext:true});
  assert.equal(result.complete,true);assert.equal(effectiveMainBlockCount(result.scheduledTasks),4);
  for(const task of fixed)assert.deepEqual(result.scheduledTasks.find(item=>item.id===task.id),task);
  assert.equal(result.evidence.mainFlowSoftPreference!.stopReason,"MAIN_PROTECTED");
});

test("adapted time/resource locks and done/in_progress intervals survive SOFT replanning",()=>{
  for(const status of ["pending","done","in_progress"] as const){
    const input=createSupportedEngineInputAdapterFixture();
    input.tasks=input.tasks.filter(task=>task.id!==105);input.locks=input.locks.filter(lock=>lock.taskId!==105);
    input.plannerNext!.searchBudget.maxBranchExpansions=1000;
    input.locks.push({id:30,planId:701,taskId:101,lockType:"time",lockedStart:"11:30",lockedEnd:"12:00"},
      {id:31,planId:701,taskId:101,lockType:"resource",lockedResourceId:503});
    Object.assign(input.tasks[0]!,{status,...(status==="pending"?{}:{startReal:"11:30",endReal:"12:00"})});
    const before=structuredClone(input),adapted=adaptEngineInputToPlannerNextProblem(input);
    assert.equal(adapted.status,"SUPPORTED");if(adapted.status!=="SUPPORTED")continue;
    const problem=structuredClone(adapted.problem);problem.mainFlow.preferredBlockCount=4;
    const result=execute(problem);assert.equal(result.complete,true);
    const main=result.scheduledTasks.find(task=>task.id==="task:101")!;
    assert.equal(main.start,690);assert.equal(main.end,720);assert.equal(main.spaceId,"space:301");
    assert.ok(main.requiredResourceIds?.includes("plan-resource:503"));
    assert.equal(validatePlan(problem,result.scheduledTasks).hardValid,true);assert.deepEqual(input,before);
  }
});

test("a deadline during joint replay returns no unvalidated proposal",()=>{
  const source=jointFixture(),witness=joint(projected(source).result);source.mainFlow.preferredBlockCount=4;
  const {built}=projected(source);
  const execution=executePlannerNext(built.problem,{fixedPlacementsAsContext:true,priorFutureStructuralWitnesses:[witness],
    checkpoint:()=>{throw new ExactSearchTimeLimitReached();}});
  assert.equal(execution.kind,"EXACT_CONSTRUCTIVE");if(execution.kind!=="EXACT_CONSTRUCTIVE")return;
  assert.equal(execution.result.complete,false);assert.equal(execution.result.status,"TIME_LIMIT_REACHED");
  assert.equal(execution.result.evidence.mainFlowSoftPreference!.incumbentOrigin,null);
});

test("logical blocks use coach/key changes across authorized meals, independent of task IDs",()=>{
  const tasks=execute(feasibleFixture()).scheduledTasks.filter(task=>task.kind==="main");
  tasks[1]!.start+=10;tasks[1]!.end+=10;tasks[2]!.start+=20;tasks[2]!.end+=20;
  tasks[3]!.start+=20;tasks[3]!.end+=20;
  assert.equal(effectiveMainBlockCount(tasks.map((task,index)=>({...task,id:`renamed-${index}`}))),2);
});

test("invalid SOFT objectives and incompatible policies are explicit rather than silently ignored",()=>{
  for(const value of [0,-1,1.5,NaN,Infinity]){
    const problem=feasibleFixture();problem.mainFlow.preferredBlockCount=value;
    assert.ok(preflight(problem).includes("INVALID_MAIN_FLOW_SOFT_BLOCK_COUNT"));
  }
  const problem=feasibleFixture();problem.mainFlow.preferredBlockCount=4;problem.searchPolicy="COMPATIBILITY_PRESERVING";
  const result=executePlannerNext(problem);assert.equal(result.kind,"POLICY_REJECTED");
  assert.deepEqual(result.policyResolution.unsupportedCapabilities,["MAIN_FLOW_SOFT_BLOCK_COUNT"]);
});
