import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem } from "./contracts";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "./assistedPlanning";
import { revalidateJointCompletionWitness } from "./jointCompletionWitness";

function fixture():PlannerNextProblem {
  const availability=[{start:0,end:100}];
  return {day:availability[0]!,spaces:["main","vocal","exit"].map(id=>({id,availability})),resources:[],
    participants:["a","b"].map(id=>({id,availability})),coaches:[{id:"coach",availability}],
    tasks:["a","b"].flatMap(id=>[
      {id:`vocal-${id}`,kind:"vocal" as const,participantId:id,coachId:"coach",duration:5,spaceId:"vocal",dependencies:[]},
      {id:`main-${id}`,kind:"main" as const,participantId:id,coachId:"coach",duration:5,spaceId:"main",dependencies:[`vocal-${id}`],blockKey:"coach"},
      {id:`out-${id}`,kind:"auxiliary" as const,participantId:id,duration:5,spaceId:"exit",dependencies:[`main-${id}`]}]),
    mainFlow:{spaceId:"main",preferredEnd:50,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
    participantTransitionMinutes:0,resourceTransitionMinutes:0,auxiliaryPolicy:{participantPresencePreference:"OFF"},
    transportPolicy:{arrival:{taskIds:[],minimumGroupSize:1,maximumGroupSize:2,minGapMinutes:0,groupingWeight:0},
      departure:{taskIds:["out-a","out-b"],minimumGroupSize:1,maximumGroupSize:2,minGapMinutes:0,groupingWeight:0}},
    budget:{bestK:1,maxPatterns:20,maxBacktracks:0,maxBranchExpansions:1000},searchPolicy:"EXACT_CONSTRUCTIVE"};
}

test("single Main builds and certifies pending core through an ephemeral projection only",()=>{
  const source=fixture(),eligible=new Set(source.tasks.map(task=>task.id)),saved=structuredClone(source);
  const scope=createPlanningScope({kind:"TASK_IDS",value:"main-a"},{},["main-a"]);
  const built=buildAssistedProblem(source,scope,[],eligible),before=structuredClone(built);
  assert.deepEqual(built.scope,scope);
  assert.deepEqual(built.problem.tasks.map(task=>task.id),["vocal-a","main-a"]);
  assert.deepEqual(built.supportingTaskIds,["vocal-a"]);
  assert.deepEqual(built.protectedPlacements,[]);
  assert.ok(built.collectiveCoreProjection?.problem.tasks.some(task=>task.id==="main-b"));
  const first=executeAssistedPlanning(built),second=executeAssistedPlanning(built);
  assert.deepEqual(first,second);assert.deepEqual(source,saved);assert.deepEqual(built,before);
  assert.deepEqual(first.proposal?.map(task=>task.id),["main-a"]);
  assert.equal(first.evidence.requiredValid,true);assert.equal(first.evidence.protectedPlacementCount,0);
  assert.deepEqual(first.evidence.supportingTaskIds,["vocal-a"]);
  const witness=first.evidence.futureStructuralWitnesses?.find(item=>item.kind==="JOINT_COMPLETION");
  assert.ok(witness&&witness.kind==="JOINT_COMPLETION");
  assert.equal(revalidateJointCompletionWitness(source,witness,[],()=>true),"PASS");
  assert.deepEqual(witness.tasks.map(task=>task.id).sort(),source.tasks.map(task=>task.id).sort());
  assert.ok(first.evidence.standaloneDiagnostic?.futureCollectiveClosureLastCertificate);
  assert.equal(first.evidence.work.branchesExplored,first.evidence.work.coreBranches+first.evidence.work.standaloneBranches);
  assert.ok(first.evidence.work.branchesExplored<=source.budget.maxBranchExpansions);
  // A future witness can advance another explicit selection; only the accepted
  // Main is protected, and its feeder remains an ephemeral pending obligation.
  const next=buildAssistedProblem(source,createPlanningScope({kind:"TASK_IDS",value:"main-b"},{},["main-b"]),
    first.proposal!,eligible,[],[],[],[],[witness]);
  const result=executeAssistedPlanning(next);
  assert.deepEqual(result.proposal?.map(task=>task.id),["main-b"]);
  assert.deepEqual(next.protectedPlacements,first.proposal);
  assert.equal(result.evidence.protectedPlacementsPreserved,true);
});

test("future core requires explicit eligibility and cannot promote missing proof",()=>{
  const source=fixture(),scope=createPlanningScope({kind:"TASK_IDS",value:"main-a"},{},["main-a"]);
  const eligible=new Set(source.tasks.filter(task=>task.id!=="main-b").map(task=>task.id));
  const built=buildAssistedProblem(source,scope,[],eligible);
  assert.equal(built.problem.analyticalFutureCollectiveContinuation,undefined);
  assert.equal(built.collectiveCoreProjection,undefined);
  const result=executeAssistedPlanning(built);
  assert.equal(result.proposal,null);
  assert.ok(result.evidence.reasonCodes.includes("FUTURE_COLLECTIVE_CLOSURE_INCONCLUSIVE"));
});

test("changed future feeder semantics rebuild the certificate while preserving the accepted Main",()=>{
  const source=fixture(),eligible=new Set(source.tasks.map(task=>task.id));
  const first=executeAssistedPlanning(buildAssistedProblem(source,
    createPlanningScope({kind:"TASK_IDS",value:"main-a"},{},["main-a"]),[],eligible));
  assert.ok(first.proposal);
  const prior=first.evidence.futureStructuralWitnesses!.find(item=>item.kind==="JOINT_COMPLETION")!;
  assert.ok(prior.kind==="JOINT_COMPLETION");
  source.tasks.find(task=>task.id==="vocal-b")!.duration=10;
  assert.equal(revalidateJointCompletionWitness(source,prior,first.proposal,()=>true),"STALE");
  const next=buildAssistedProblem(source,createPlanningScope({kind:"TASK_IDS",value:"main-b"},{},["main-b"]),
    first.proposal,eligible,[],[],[],[],[prior]);
  const result=executeAssistedPlanning(next);
  assert.deepEqual(result.proposal?.map(task=>task.id),["main-b"]);
  assert.equal(result.evidence.protectedPlacementsPreserved,true);
  const witness=result.evidence.futureStructuralWitnesses?.find(item=>item.kind==="JOINT_COMPLETION");
  assert.ok(witness&&witness.kind==="JOINT_COMPLETION");
  assert.equal(witness.tasks.find(task=>task.id==="vocal-b")!.duration,10);
  assert.equal(revalidateJointCompletionWitness(source,witness,first.proposal,()=>true),"PASS");
});

test("Assisted enforces one interactive ledger ceiling while retaining smaller configured budgets",()=>{
  for(const configured of [10,1000,300000]){
    const source=fixture();source.budget.maxBranchExpansions=configured;
    const input=buildAssistedProblem(source,createPlanningScope({kind:"TASK_IDS",value:"main-a"},{},["main-a"]),[],
      new Set(source.tasks.map(task=>task.id)));
    const before=structuredClone(input),result=executeAssistedPlanning(input);
    assert.equal(result.evidence.work.branchBudgetLimit,Math.min(configured,100000));
    assert.ok(result.evidence.work.branchesExplored<=result.evidence.work.branchBudgetLimit);
    assert.equal(result.evidence.work.branchesExplored,result.evidence.work.coreBranches+result.evidence.work.standaloneBranches);
    assert.deepEqual(input,before);assert.equal(source.budget.maxBranchExpansions,configured);
    if(configured===10){assert.equal(result.proposal,null);assert.ok(result.evidence.reasonCodes.some(code=>code.includes("BUDGET_EXHAUSTED")),JSON.stringify(result.evidence.reasonCodes));}
    else assert.deepEqual(result.proposal?.map(task=>task.id),["main-a"]);
  }
});
