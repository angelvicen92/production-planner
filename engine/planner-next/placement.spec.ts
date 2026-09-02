import assert from "node:assert/strict";import test from "node:test";import { canPlaceTask, exactTaskStartDomain, prepareTaskPlacementAuthority } from "./placement";import { mainFlowMealScenario } from "./scenarios/mainFlowMealScenario";import { technicalChainScenario } from "./scenarios/technicalChainScenario";import { generateTechnicalChainCandidates, getTechnicalChains } from "./technicalChains";import { validatePlan } from "./validate";import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
test("canonical placement enforces effective task availability",()=>{const p=mainFlowMealScenario(),t=p.tasks[0]!;t.availability=[{start:600,end:630}];assert.equal(canPlaceTask(p,t,600,[]),true);assert.equal(canPlaceTask(p,t,585,[]),false);t.availability=undefined;assert.equal(canPlaceTask(p,t,585,[]),true)});
test("prepared fixed plus branch-local authority equals the canonical combined domain over the full grid",()=>{
 const p=technicalChainScenario(),task=getTechnicalChains(p.tasks)[0]![1]!;
 const fixed={...task,id:"fixed",start:535,end:545,spaceId:"technical-chain-room-a",dependencies:[]};
 const before={...task,id:"dependent-before",start:590,end:605,dependencies:[task.id]};
 const after={...task,id:"dependency-after",start:550,end:565,dependencies:[]};task.dependencies=[after.id];
 const meals=[{id:"meal",kind:"space-meal" as const,spaceId:task.spaceId,entryIndex:0,duration:5,start:570,end:575}];
 const prepared=prepareTaskPlacementAuthority(p,task,[fixed],meals),composed=prepared.domain([before,after]);
 const canonical=exactTaskStartDomain(p,task,[fixed,before,after],meals);
 assert.deepEqual([...composed.starts()],[...canonical.starts()]);assert.deepEqual(composed.intervals,canonical.intervals);
 for(let start=p.day.start;start+task.duration<=p.day.end;start+=5)assert.equal(prepared.accepts(start,composed),canPlaceTask(p,task,start,[fixed,before,after],meals));
});

test("included technical-chain transitions relax only consecutive internal resource pairs",()=>{
 const tasks:Task[]=[
  {id:"one",kind:"technical",duration:10,spaceId:"A",dependencies:[],requiredResourceIds:["unit"]},
  {id:"two",kind:"technical",duration:10,spaceId:"B",dependencies:["one"],requiredResourceIds:["unit"]},
  {id:"three",kind:"technical",duration:10,spaceId:"C",dependencies:["two"],requiredResourceIds:["unit"]},
 ];
 const problem:PlannerNextProblem={day:{start:0,end:60},spaces:["A","B","C"].map(id=>({id,availability:[{start:0,end:60}]})),resources:[{id:"unit",availability:[{start:0,end:60}],presencePreference:"OFF"}],participants:[],coaches:[],tasks,mainFlow:{spaceId:"A",preferredEnd:60,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:5,budget:{bestK:5,maxBacktracks:0,maxPatterns:1,maxBranchExpansions:1000},searchPolicy:"EXACT_CONSTRUCTIVE",technicalChains:[{id:"chain",orderedTaskIds:["one","two","three"],adjacency:"REQUIRED",internalTransition:"INCLUDED",resourceContinuity:"REQUIRED",requiredResourceIds:["unit"]}]};
 const chain=getTechnicalChains(problem.tasks,problem.technicalChains)[0]!,candidate=generateTechnicalChainCandidates(problem,chain,[],1000).candidates[0];
 assert.ok(candidate);assert.deepEqual(candidate.tasks.map(({start,end})=>[start,end]),[[0,10],[10,20],[20,30]]);assert.equal(validatePlan(problem,candidate.tasks).hardValid,true);
 const external:ScheduledTask={...tasks[0]!,id:"external",dependencies:[],start:30,end:40,spaceId:"A"};
 assert.equal(canPlaceTask(problem,external,30,candidate.tasks),false);assert.equal(canPlaceTask(problem,external,35,candidate.tasks),true);
 const ordinary=structuredClone(problem);delete ordinary.technicalChains![0]!.internalTransition;
 assert.equal(generateTechnicalChainCandidates(ordinary,getTechnicalChains(ordinary.tasks,ordinary.technicalChains)[0]!,[],1000).candidates.length,0);
 const first:ScheduledTask={...tasks[0]!,start:0,end:10};
 assert.equal(canPlaceTask(problem,tasks[2]!,10,[first]),false);
 assert.deepEqual([...exactTaskStartDomain(problem,tasks[1]!,[first]).starts()].slice(0,1),[10]);
});
