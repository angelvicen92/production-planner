import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem } from "./contracts";
import { executePlannerNext } from "./executePlannerNext";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "./assistedPlanning";
import { preflight, validatePlan } from "./validate";
import { fingerprintPlannerNextProblem } from "./integration/engineInputAdapter";

function auxiliary():PlannerNextProblem {
  const availability=[{start:0,end:120}];
  return {profile:"STANDALONE_ONLY",searchPolicy:"EXACT_CONSTRUCTIVE",day:{start:0,end:120},
    protectedMeal:{start:55,end:65},spaces:[{id:"a",availability},{id:"b",availability}],
    participants:[{id:"one",availability:[{start:0,end:50}]},{id:"two",availability:[{start:20,end:100}]},{id:"three",availability:[{start:65,end:120}]}],
    coaches:[],resources:[],auxiliaryPolicy:{participantPresencePreference:"OFF"},tasks:["one","two","three"].flatMap(id=>[
      {id:`${id}-prepare`,kind:"auxiliary" as const,duration:10,spaceId:"a",participantId:id,dependencies:[]},
      {id:`${id}-record`,kind:"auxiliary" as const,duration:15,spaceId:"b",participantId:id,dependencies:[`${id}-prepare`]},
    ]),participantTransitionMinutes:5,resourceTransitionMinutes:5,
    budget:{bestK:2,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10_000}};
}
function solve(problem:PlannerNextProblem){
  const execution=executePlannerNext(problem,{fixedPlacementsAsContext:true});
  assert.equal(execution.kind,"EXACT_CONSTRUCTIVE");
  if(execution.kind!=="EXACT_CONSTRUCTIVE")throw new Error("Wrong policy");
  return execution.result;
}
test("explicit empty core reuses standalone search: dependencies, windows, meals, accounting and replay",()=>{
  const problem=auxiliary(),before=structuredClone(problem);
  assert.deepEqual(preflight(problem),[]);
  const a=solve(problem),b=solve(problem);
  assert.equal(a.complete,true,JSON.stringify(a.evidence.reasonCodes));
  assert.equal(a.scheduledTasks.length,6);assert.equal(a.evidence.coreBranches,0);
  assert.ok(a.evidence.standaloneBranches>0);
  assert.equal(a.evidence.branchesExplored,a.evidence.standaloneBranches);
  assert.ok(validatePlan(problem,a.scheduledTasks).hardValid);
  assert.deepEqual(a.scheduledTasks,b.scheduledTasks);assert.equal(a.evidence.fullFingerprint,b.evidence.fullFingerprint);
  assert.deepEqual(problem,before);assert.equal("mainFlow" in problem,false);
});
test("technical-only operations need no participant or coach and share physical resources",()=>{
  const problem=auxiliary();problem.participants=[];
  problem.resources=[{id:"kit",availability:[{start:10,end:110}],presencePreference:"OFF"}];
  problem.tasks=[{id:"install",kind:"technical",duration:15,spaceId:"a",dependencies:[],requiredResourceIds:["kit"],availability:[{start:10,end:40}]},
    {id:"calibrate",kind:"technical",duration:20,spaceId:"b",dependencies:["install"],requiredResourceIds:["kit"],availability:[{start:30,end:110}]},
    {id:"verify",kind:"technical",duration:10,spaceId:"a",dependencies:["calibrate"],requiredResourceIds:["kit"]}];
  assert.deepEqual(preflight(problem),[]);const result=solve(problem);
  assert.equal(result.complete,true,JSON.stringify(result.evidence.reasonCodes));
  assert.equal(result.scheduledTasks.length,3);assert.ok(validatePlan(problem,result.scheduledTasks).hardValid);
  assert.ok(result.scheduledTasks.every(task=>!("participantId" in task)&&!("coachId" in task)));
  assert.deepEqual(solve(problem).scheduledTasks,result.scheduledTasks);
});
test("Assisted scopes complete dependencies and preserve accepted placements without a main",()=>{
  const problem=auxiliary();
  const first=executeAssistedPlanning(buildAssistedProblem(problem,createPlanningScope({kind:"TASK_IDS",value:"first"},{},["one-prepare","one-record"]),[]));
  assert.equal(first.evidence.completeForScope,true,first.evidence.reasonCodes.join(","));assert.ok(first.proposal);
  const second=executeAssistedPlanning(buildAssistedProblem(problem,createPlanningScope({kind:"DAY",value:"rest"},{},["two-prepare","two-record","three-prepare","three-record"]),first.proposal!));
  assert.equal(second.evidence.completeForScope,true,second.evidence.reasonCodes.join(","));assert.ok(second.proposal);
  assert.equal(second.evidence.protectedPlacementsPreserved,true);
  assert.equal(second.proposal!.length,4);
  assert.ok(second.proposal!.every(task=>!first.proposal!.some(fixed=>fixed.id===task.id)));
});
test("intentional standalone, incomplete main and contradictory profiles remain distinct",()=>{
  const problem=auxiliary();const historical={...problem};delete historical.profile;
  assert.ok(preflight(historical).includes("MISSING_MAIN_FLOW_SPACE"));
  assert.ok(preflight({...problem,mainFlow:{spaceId:"a",preferredEnd:50,continuity:"REQUIRED",minTasksPerBlock:1,maxBlocksByKey:1}}).includes("STANDALONE_MAIN_FLOW_CONFLICT"));
  const mixed=structuredClone(problem);(mixed.tasks[0] as any).kind="vocal";
  assert.ok(preflight(mixed).includes("STANDALONE_TASK_KIND_UNSUPPORTED"));
  assert.ok(preflight({...problem,searchPolicy:"COMPATIBILITY_PRESERVING"}).includes("STANDALONE_SEARCH_POLICY_UNSUPPORTED"));
  assert.notEqual(fingerprintPlannerNextProblem(historical),fingerprintPlannerNextProblem(problem));
});
test("invalid references/cycles/resources are rejected; infeasibility and budgets expose no partial success",()=>{
  const broken=auxiliary();broken.tasks[0].dependencies=["absent"];
  assert.ok(preflight(broken).length);
  const cycle=auxiliary();cycle.tasks[0].dependencies=[cycle.tasks[1].id];assert.equal(solve(cycle).complete,false);
  const missing=auxiliary();missing.tasks[0].requiredResourceIds=["absent"];assert.ok(preflight(missing).length);
  const impossible=auxiliary();impossible.participants[0].availability=[{start:0,end:5}];
  const no=solve(impossible);assert.equal(no.complete,false);assert.equal(no.status,"INFEASIBLE");
  assert.deepEqual(no.scheduledTasks,[]);assert.ok(no.evidence.reasonCodes.length);
  const small=auxiliary();small.budget.maxBranchExpansions=1;const exhausted=solve(small);
  assert.equal(exhausted.complete,false);assert.equal(exhausted.status,"BRANCH_BUDGET_EXHAUSTED");
  assert.deepEqual(exhausted.scheduledTasks,[]);assert.ok(exhausted.evidence.branchesExplored<=1);
});

test("configured REQUIRED auxiliary continuity is enforced with an empty core",()=>{
  const problem=auxiliary();
  problem.participants.forEach(p=>p.availability=[{start:0,end:120}]);
  problem.tasks=problem.tasks.filter(task=>task.dependencies.length===0);
  problem.operationContinuityGroups=[{id:"independent-group",policy:"REQUIRED",gapWeight:1,taskIds:problem.tasks.map(task=>task.id)}];
  const result=solve(problem);assert.equal(result.complete,true,result.evidence.reasonCodes.join(","));
  assert.ok(validatePlan(problem,result.scheduledTasks).hardValid);
  const ordered=[...result.scheduledTasks].sort((a,b)=>a.start-b.start);
  assert.ok(ordered.slice(1).every((task,i)=>task.start===ordered[i].end));
  problem.participants[2].availability=[{start:100,end:120}];
  problem.participants[0].availability=[{start:0,end:20}];
  const impossible=solve(problem);assert.equal(impossible.complete,false);assert.deepEqual(impossible.scheduledTasks,[]);
});
