import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { executePlannerNext } from "./executePlannerNext";
import { effectiveMainBlockCount, type ExactItinerantPlanResult } from "./exactItinerantPlan";
import { ExactSearchTimeLimitReached } from "./exactMainAndFeederCore";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "./assistedPlanning";
import { validatePlan, preflight } from "./validate";
import { generateMainFlowPatterns } from "./mainFlowPatterns";
import { coldFallbackFixture } from "../../script/demo/mainFlowSoftBlockDiagnostic";
import type { FutureJointCompletionWitnessV1, FutureStructuralWitness } from "./anonymousPipelineWitness";
import { createSupportedEngineInputAdapterFixture } from "./integration/engineInputAdapter.fixture";
import { adaptEngineInputToPlannerNextProblem } from "./integration/engineInputAdapter";

function execute(problem:PlannerNextProblem,options:Parameters<typeof executePlannerNext>[1]={}):ExactItinerantPlanResult {
  const {checkpoint,...dataOptions}=options;
  const before=structuredClone({problem,options:dataOptions}),result=executePlannerNext(problem,{causalDiagnostic:true,...options});
  assert.equal(result.kind,"EXACT_CONSTRUCTIVE");
  const {checkpoint:afterCheckpoint,...afterOptions}=options;
  assert.deepEqual({problem,options:afterOptions},before);assert.equal(afterCheckpoint,checkpoint);
  if(result.kind!=="EXACT_CONSTRUCTIVE")throw Error("Unexpected policy");
  assert.equal(result.result.evidence.branchesExplored,result.result.evidence.coreBranches+result.result.evidence.standaloneBranches);
  assert.ok(result.result.evidence.branchesExplored<=problem.budget.maxBranchExpansions);
  const soft=result.result.evidence.mainFlowSoftPreference;
  if(soft){
    assert.equal((soft.revalidation?.branches??0)+(soft.search?.branches??0),soft.branches.total);
    assert.equal(soft.branches.total,result.result.evidence.branchesExplored);
    assert.equal(soft.branches.core+soft.branches.standalone,soft.branches.total);
  }
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

for(const budget of [51,95,102,1000])test(`cold SOFT explores 4, 3, 2 under one ${budget}-branch limit`,()=>{
  const problem=coldFallbackFixture();problem.budget.maxBranchExpansions=budget;
  const auto=execute(problem);assert.equal(auto.complete,true);assert.equal(auto.evidence.branchesExplored,51);
  problem.mainFlow.preferredBlockCount=4;
  const first=execute(problem);assert.deepEqual(first,execute(problem));
  const soft=first.evidence.mainFlowSoftPreference!;
  assert.equal(soft.mode,"SOFT");assert.equal(soft.revalidation,null);assert.equal(soft.targetAchieved,false);
  assert.deepEqual(soft.familiesExplored.map(row=>row.blocks),[4,3,2]);
  assert.equal(soft.familiesExplored[0]!.atBranch,0);assert.equal(soft.hardCertificate,null);
  assert.equal(soft.search!.branches,first.evidence.branchesExplored);
  if(budget===51){
    assert.equal(first.complete,false);assert.equal(first.status,"BRANCH_BUDGET_EXHAUSTED");
    assert.equal(soft.outcome,"NO_COMPLETE_ALTERNATIVE");assert.equal(soft.firstComplete,null);
    assert.equal(soft.preferredSearchStatus,"NOT_FOUND_WITHIN_LIMITS");assert.equal(soft.fallbackUsed,false);
  }else{
    assert.equal(first.complete,true);assert.equal(first.evidence.branchesExplored,95);
    assert.equal(first.evidence.fullFingerprint,auto.evidence.fullFingerprint);
    assert.equal(validatePlan(problem,first.scheduledTasks).hardValid,true);
    assert.equal(soft.achieved,2);assert.equal(soft.outcome,"COMPLETE_ALTERNATIVE");
    assert.equal(soft.firstComplete!.origin,"ALTERNATIVE_FAMILY");assert.equal(soft.firstComplete!.atBranch,95);
    assert.equal(soft.fallbackUsed,true);assert.equal(soft.fallbackReason,"NO_TARGET_COMPLETION");
    assert.ok(soft.search!.structuralRejections.FUTURE_DEPENDENCY_CAPACITY>0);
  }
});

for(const requested of [2,3,4])for(const cap of [1,200])test(`cold feasible ${requested}-block objective is first, maxPatterns=${cap}`,()=>{
  const problem=feasibleFixture();problem.budget.maxPatterns=cap;problem.mainFlow.preferredBlockCount=requested;
  const first=execute(problem);assert.deepEqual(first,execute(problem));assert.equal(first.complete,true);
  assert.equal(validatePlan(problem,first.scheduledTasks).hardValid,true);
  assert.equal(effectiveMainBlockCount(first.scheduledTasks),requested);
  const soft=first.evidence.mainFlowSoftPreference!;
  assert.equal(soft.stopReason,"TARGET_ACHIEVED");assert.equal(soft.outcome,"TARGET_ACHIEVED");
  assert.equal(soft.fallbackUsed,false);assert.equal(soft.firstComplete!.origin,"REQUESTED_FAMILY");
  assert.equal(soft.revalidation,null);assert.equal(soft.familiesExplored[0]!.blocks,requested);
  assert.equal(soft.familiesExplored[0]!.atBranch,0);
});

test("SOFT does not promise AUTO's fallback when only AUTO's measured cost is available",()=>{
  const problem=feasibleFixture(),auto=execute(problem);
  problem.budget.maxBranchExpansions=auto.evidence.branchesExplored;problem.mainFlow.preferredBlockCount=4;
  const result=execute(problem);assert.equal(result.complete,false);
  assert.equal(result.status,"BRANCH_BUDGET_EXHAUSTED");
  assert.equal(result.evidence.mainFlowSoftPreference!.outcome,"NO_COMPLETE_ALTERNATIVE");
  assert.equal(result.evidence.mainFlowSoftPreference!.hardCertificate,null);
});

test("exhaustion without a complete incumbent remains inconclusive",()=>{
  const problem=coldFallbackFixture();problem.mainFlow.preferredBlockCount=4;problem.budget.maxBranchExpansions=1;
  const result=execute(problem);assert.equal(result.complete,false);assert.equal(result.status,"BRANCH_BUDGET_EXHAUSTED");
  assert.equal(result.evidence.mainFlowSoftPreference!.firstComplete,null);
  assert.equal(result.evidence.mainFlowSoftPreference!.stopReason,"BRANCH_BUDGET_EXHAUSTED");
});

test("a cooperative deadline keeps a revalidated incumbent and never fabricates a cold fallback",()=>{
  const source=jointFixture(),witness=joint(projected(source).result);
  source.mainFlow.preferredBlockCount=2;
  const replayBuilt=projected(source,[],[witness]).built;let replayCalls=0;
  const replay=execute(replayBuilt.problem,{fixedPlacementsAsContext:true,priorFutureStructuralWitnesses:[witness],
    checkpoint:()=>{replayCalls++;}});
  assert.equal(replay.evidence.mainFlowSoftPreference!.search,null);
  source.mainFlow.preferredBlockCount=4;
  const built=projected(source,[],[witness]).built;let calls=0;
  const result=execute(built.problem,{fixedPlacementsAsContext:true,priorFutureStructuralWitnesses:[witness],
    checkpoint:()=>{if(++calls>replayCalls)throw new ExactSearchTimeLimitReached();}});
  assert.equal(result.complete,true);assert.equal(joint(result).fingerprint,witness.fingerprint);
  assert.equal(result.evidence.mainFlowSoftPreference!.fallbackReason,"TIME_LIMIT_REACHED");
  assert.equal(result.evidence.mainFlowSoftPreference!.search!.status,"TIME_LIMIT_REACHED");
  const noIncumbent=execute(built.problem,{checkpoint:()=>{throw new ExactSearchTimeLimitReached();}});
  assert.equal(noIncumbent.complete,false);assert.equal(noIncumbent.status,"TIME_LIMIT_REACHED");
  assert.equal(noIncumbent.evidence.mainFlowSoftPreference!.firstComplete,null);
});

test("valid joint replay is charged once before preferred construction and remains ephemeral",()=>{
  const source=jointFixture(),initial=projected(source).result,witness=joint(initial);
  source.mainFlow.preferredBlockCount=4;
  const {built,result}=projected(source,[],[witness]);
  assert.equal(result.complete,true);assert.equal(result.evidence.mainFlowSoftPreference!.priorRevalidation,"PASS");
  assert.equal(result.evidence.mainFlowSoftPreference!.firstComplete!.origin,"REVALIDATED_JOINT_COMPLETION");
  assert.ok(result.evidence.mainFlowSoftPreference!.revalidation!.branches>=source.tasks.length);
  assert.equal(effectiveMainBlockCount(joint(result).tasks),4);assert.equal(built.protectedPlacements.length,0);
  assert.deepEqual(result,projected(source,[],[witness]).result);
  const soft=structuredClone(source);soft.budget.maxBranchExpansions=result.evidence.mainFlowSoftPreference!.revalidation!.branches;
  const fallback=projected(soft,[],[witness]).result;
  assert.equal(fallback.complete,true);assert.equal(joint(fallback).fingerprint,witness.fingerprint);
});

test("obsolete joint task semantics/configuration never qualify as an incumbent",()=>{
  const source=jointFixture(),witness=joint(projected(source).result);
  source.tasks.find(task=>task.id==="finish-a1")!.duration=10;
  source.mainFlow.preferredBlockCount=4;
  const result=projected(source,[],[witness]).result;
  assert.equal(result.complete,true);assert.equal(result.evidence.mainFlowSoftPreference!.priorRevalidation,"STALE");
  assert.equal(result.evidence.mainFlowSoftPreference!.firstComplete!.origin,"REQUESTED_FAMILY");
  assert.notEqual(joint(result).fingerprint,witness.fingerprint);
  assert.equal(joint(result).tasks.find(task=>task.id==="finish-a1")!.duration,10);
  const changed=structuredClone(source);changed.budget.maxBranchExpansions=1;
  const incomplete=projected(changed,[],[witness]).result;
  assert.equal(incomplete.complete,false);assert.equal(incomplete.evidence.mainFlowSoftPreference!.firstComplete,null);
});

test("an accepted/protected Main overrides preference; rollback only removes the supplied protection",()=>{
  const source=jointFixture(),initial=projected(source).result,witness=joint(initial);
  const fixed=witness.tasks.filter(task=>task.kind==="main");source.mainFlow.preferredBlockCount=4;
  const {built,result}=projected(source,fixed,[witness]);
  assert.equal(result.complete,true);assert.equal(result.evidence.mainFlowSoftPreference!.stopReason,"MAIN_PROTECTED");
  assert.equal(result.evidence.mainFlowSoftPreference!.outcome,"HARD_INCOMPATIBLE");
  assert.equal(result.evidence.mainFlowSoftPreference!.hardCertificate!.authority,"PROTECTED_MAIN_GEOMETRY");
  assert.deepEqual(result.evidence.mainFlowSoftPreference!.familiesExplored,[]);
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
  assert.equal(execution.result.evidence.mainFlowSoftPreference!.firstComplete,null);
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

test("a failed four-block family falls back to a complete three-block geometry",()=>{
  const problem=feasibleFixture();problem.mainFlow.preferredBlockCount=4;
  for(const task of problem.tasks.filter(task=>task.kind==="main"&&task.blockKey==="a"))
    task.availability=[{start:65,end:75}];
  const result=execute(problem);assert.deepEqual(result,execute(problem));
  assert.equal(result.complete,true);assert.equal(validatePlan(problem,result.scheduledTasks).hardValid,true);
  const soft=result.evidence.mainFlowSoftPreference!;
  assert.equal(soft.achieved,3);assert.equal(soft.outcome,"COMPLETE_ALTERNATIVE");
  assert.equal(soft.fallbackUsed,true);assert.equal(soft.hardCertificate,null);
  assert.deepEqual(soft.familiesExplored.map(row=>row.blocks),[4,3]);
});

test("distance-ranked families prefer fewer blocks at a tie, before truncation",()=>{
  const mains=feasibleFixture().tasks.filter(task=>task.kind==="main");
  const runs=(pattern:readonly string[])=>pattern.reduce((count,key,index)=>count+(index===0||key!==pattern[index-1]?1:0),0);
  const patterns=generateMainFlowPatterns(mains,1,2,200,[],3);
  assert.deepEqual([...new Set(patterns.patterns.map(runs))],[3,2,4]);
  const capped=generateMainFlowPatterns(mains,1,2,1,[],4);
  assert.equal(capped.patterns.length,1);assert.equal(runs(capped.patterns[0]!),4);assert.equal(capped.exhausted,true);
  assert.deepEqual(capped,generateMainFlowPatterns([...mains].reverse(),1,2,1,[],4));
});

test("SOFT family tracing is neutral to causal diagnostics and input ordering",()=>{
  const input=coldFallbackFixture();input.mainFlow.preferredBlockCount=4;
  const diagnosed=execute(input),plain=execute(input,{causalDiagnostic:false});
  assert.equal(plain.evidence.fullFingerprint,diagnosed.evidence.fullFingerprint);
  assert.equal(plain.evidence.branchesExplored,diagnosed.evidence.branchesExplored);
  assert.deepEqual(plain.evidence.mainFlowSoftPreference!.familiesExplored,diagnosed.evidence.mainFlowSoftPreference!.familiesExplored);
  const reversed=structuredClone(input);reversed.tasks.reverse();
  assert.deepEqual(execute(reversed),diagnosed);
});

test("a meal inside the requested logical block is tried before another family's preferred cuts",()=>{
  const problem=feasibleFixture();problem.mainFlow.preferredBlockCount=3;problem.mainFlow.preferredEnd=70;
  const space=problem.spaces.find(item=>item.id==="main")!;
  space.availability=[{start:55,end:85}];
  problem.operationalMealPolicies=[{id:"main-pause",window:{start:70,end:75},duration:5,resourceIds:[],spaceIds:[space.id]}];
  for(const task of problem.tasks.filter(task=>task.kind==="main"))
    task.availability=task.blockKey==="a"?[{start:60,end:85}]:[{start:60,end:70},{start:75,end:80}];
  const auto=structuredClone(problem);delete auto.mainFlow.preferredBlockCount;
  assert.equal(effectiveMainBlockCount(execute(auto).scheduledTasks),2);
  const result=execute(problem);assert.equal(result.complete,true);
  assert.equal(effectiveMainBlockCount(result.scheduledTasks),3);
  assert.equal(validatePlan(problem,result.scheduledTasks,[],result.scheduledSpaceMeals,[],[],[],[],result.scheduledOperationalMeals).hardValid,true);
  assert.deepEqual(result.evidence.mainFlowSoftPreference!.familiesExplored.map(row=>row.blocks),[3]);
  assert.deepEqual(result.scheduledTasks.filter(task=>task.kind==="main").sort((a,b)=>a.start-b.start).map(task=>task.start),[60,65,75,80]);
});

test("changed availability invalidates a prior witness without constructing AUTO",()=>{
  const source=jointFixture(),witness=joint(projected(source).result);
  source.tasks.find(task=>task.id==="finish-a1")!.availability=[{start:95,end:100}];
  source.mainFlow.preferredBlockCount=4;
  const result=projected(source,[],[witness]).result,soft=result.evidence.mainFlowSoftPreference!;
  assert.equal(result.complete,true);assert.equal(soft.priorRevalidation,"STALE");
  assert.equal(soft.firstComplete!.origin,"REQUESTED_FAMILY");assert.equal(soft.achieved,4);
  assert.equal(soft.familiesExplored[0]!.blocks,4);
  assert.equal(soft.familiesExplored[0]!.atBranch,soft.revalidation!.branches);
  assert.notEqual(joint(result).fingerprint,witness.fingerprint);
});

test("Assisted records the owning runtime's elapsed time and existing deadline",()=>{
  const source=jointFixture();source.mainFlow.preferredBlockCount=4;
  const built=projected(source).built;
  const result=executeAssistedPlanning(built,undefined,{now:()=>123});
  assert.deepEqual(result.evidence.mainFlowSoftPreference!.runtime,{elapsedMs:0,limitMs:300_000});
  assert.equal(result.evidence.mainFlowSoftPreference!.targetAchieved,true);
});
