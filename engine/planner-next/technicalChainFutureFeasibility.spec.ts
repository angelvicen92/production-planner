import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { probeTechnicalChainFutureReservations } from "./technicalChainFutureFeasibility";

const problem=():PlannerNextProblem=>({day:{start:0,end:60},spaces:[{id:"shared",availability:[{start:0,end:60}]},{id:"other",availability:[{start:0,end:60}]}],resources:[],participants:[{id:"future-person",availability:[{start:0,end:60}]},{id:"current-person",availability:[{start:0,end:60}]}],coaches:[],tasks:[],mainFlow:{spaceId:"other",preferredEnd:60,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{maxBranchExpansions:100,bestK:2},searchPolicy:"EXACT_CONSTRUCTIVE",analyticalFutureTechnicalChains:[{policy:{id:"future-structure",orderedTaskIds:["future-a","future-b"],adjacency:"REQUIRED",resourceContinuity:"REQUIRED",requiredResourceIds:[]},tasks:[{id:"future-a",kind:"technical",participantId:"future-person",spaceId:"shared",duration:20,availability:[{start:0,end:60}],dependencies:[]},{id:"future-b",kind:"technical",participantId:"future-person",spaceId:"shared",duration:20,availability:[{start:0,end:60}],dependencies:["future-a"]}]}]});
const placement=(start:number):ScheduledTask=>({id:"provisional",kind:"auxiliary",participantId:"current-person",spaceId:"shared",duration:20,availability:[{start:0,end:60}],dependencies:[],start,end:start+20});

test("prunes a provisional placement only after the exact required-chain probe proves zero domain",()=>{
  const placed=placement(20),result=probeTechnicalChainFutureReservations(problem(),[placed],[placed],100);
  assert.equal(result.status,"PRUNE"); assert.equal(result.result,"ZERO_DOMAIN");
  assert.equal(result.structureId,"future-structure"); assert.equal(result.workItemKey,"technical-chain:future-a");
  assert.equal(result.certifiedCausingTaskId,"provisional",
    "removing the newly added placement restores the chain witness");
  assert.ok(result.branchesConsumed>0);
});

test("keeps a provisional geometry when the required chain retains a complete witness",()=>{
  const placed=placement(40),result=probeTechnicalChainFutureReservations(problem(),[placed],[placed],100);
  assert.equal(result.status,"PASS"); assert.equal(result.result,"WITNESS"); assert.equal(result.candidateCount,1);
  assert.equal(result.certifiedCausingTaskId,null);
});

test("does not certify an older placement outside the material delta",()=>{
  const older=placement(20),unrelated={...placement(40),id:"unrelated",spaceId:"other"};
  const result=probeTechnicalChainFutureReservations(problem(),[older,unrelated],[unrelated],100);
  assert.equal(result.status,"PASS", "an unrelated delta does not claim or inspect a causal placement");
  assert.equal(result.certifiedCausingTaskId,null);
});

test("abstains rather than claiming infeasibility when the exact probe budget is unavailable",()=>{
  const placed=placement(20),result=probeTechnicalChainFutureReservations(problem(),[placed],[placed],0);
  assert.equal(result.status,"ABSTAIN"); assert.equal(result.result,"BUDGET_EXHAUSTED"); assert.equal(result.branchesConsumed,0);
});

test("deletion minimization isolates successive repair decisions in a multi-blocker zero domain",()=>{
  const p=problem();
  p.analyticalFutureTechnicalChains![0]!.tasks.forEach(task=>task.duration=25);
  const first={...placement(0),id:"first-decision"};
  const second={...placement(40),id:"second-decision"};
  const depth=(id:string)=>id==="first-decision"?1:id==="second-decision"?2:null;

  const initial=probeTechnicalChainFutureReservations(p,[first,second],[first,second],500,depth);
  assert.equal(initial.status,"PRUNE");
  assert.equal(initial.initialRepairableGroupCount,2);
  assert.deepEqual(initial.redundantDecisionDepths,[1],
    "removing the first group still leaves the second blocker, so it is redundant in this minimal proof");
  assert.deepEqual(initial.irreducibleDecisionDepths,[2]);
  assert.equal(initial.certifiedCausingTaskId,"second-decision");
  assert.equal(initial.certifiedDecisionDepth,2);
  assert.equal(initial.minimizationProbes,2);

  const repairedSecond={...second,spaceId:"other",start:20,end:40};
  const next=probeTechnicalChainFutureReservations(p,[first,repairedSecond],[first,second],500,depth);
  assert.equal(next.status,"PRUNE", "the following leaf isolates the other decision");
  assert.equal(next.certifiedCausingTaskId,"first-decision");
  assert.equal(next.certifiedDecisionDepth,1);

  const repairedFirst={...first,spaceId:"other"};
  const complete=probeTechnicalChainFutureReservations(p,[repairedFirst,repairedSecond],[first,second],500,depth);
  assert.equal(complete.status,"PASS", "after both main@slot repairs the future REQUIRED chain retains a witness");
  assert.equal(complete.result,"WITNESS");
});
