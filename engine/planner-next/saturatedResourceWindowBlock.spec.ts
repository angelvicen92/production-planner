import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { placeAuxiliaryTasks, scoreAuxiliaryTask, scoreAuxiliaryTaskSequence } from "./placeAuxiliaryTasks";
import { constructSaturatedResourceWindowBlockCandidates, deriveSaturatedResourceWindowBlocks, saturatedResourceWindowBlockKey } from "./saturatedResourceWindowBlock";

function scenario(): PlannerNextProblem {
  return {
    day:{start:540,end:720},protectedMeal:{start:700,end:715},
    spaces:["a","b","main","outside"].map(id=>({id,availability:[{start:540,end:720}]})),
    resources:[{id:"camera",availability:[{start:540,end:720}],presencePreference:"OFF"}],
    participants:["p1","p2","outside"].map(id=>({id,availability:[{start:540,end:720}]})),coaches:[],
    tasks:[
      {id:"a",kind:"auxiliary",participantId:"p1",duration:20,spaceId:"a",dependencies:[],requiredResourceIds:["camera"],availability:[{start:600,end:660}]},
      {id:"b",kind:"auxiliary",participantId:"p2",duration:40,spaceId:"b",dependencies:[],requiredResourceIds:["camera"],availability:[{start:600,end:660}]},
    ],
    mainFlow:{spaceId:"main",preferredEnd:660,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
    participantTransitionMinutes:0,resourceTransitionMinutes:0,
    budget:{bestK:8,maxBacktracks:20,maxPatterns:20,maxBranchExpansions:200},auxiliaryPolicy:{participantPresencePreference:"OFF"},
  };
}
const block=(p:PlannerNextProblem,placed:ScheduledTask[]=[])=>(deriveSaturatedResourceWindowBlocks(p,p.tasks,placed)[0]!);
const scheduled=(p:PlannerNextProblem,id:string,start:number,overrides:Partial<ScheduledTask>={}):ScheduledTask=>{const task=p.tasks.find(t=>t.id===id)!;return {...task,start,end:start+task.duration,...overrides} as ScheduledTask};

test("derives a canonical exact-fit cohort, independent of input order and without mutation",()=>{const p=scenario(),before=structuredClone(p),forward=deriveSaturatedResourceWindowBlocks(p,p.tasks,[]),reversed=deriveSaturatedResourceWindowBlocks(p,[...p.tasks].reverse(),[]);assert.deepEqual(forward,reversed);assert.equal(forward[0]!.key,saturatedResourceWindowBlockKey(["camera"],{start:600,end:660},["b","a"]));assert.deepEqual(forward[0]!.taskIds,["a","b"]);assert.deepEqual(p,before)});

test("constructs complete candidates deterministically and never mutates inputs",()=>{const p=scenario(),derived=block(p),before=structuredClone({p,derived}),first=constructSaturatedResourceWindowBlockCandidates(p,derived,[],200),repeat=constructSaturatedResourceWindowBlockCandidates(p,derived,[],200);assert.deepEqual(first,repeat);assert.equal(first.candidates.length,2);assert.ok(first.candidates.every(({tasks})=>tasks[0]!.start===600&&tasks.at(-1)!.end===660&&tasks.slice(1).every((task,index)=>tasks[index]!.end===task.start)));assert.deepEqual({p,derived},before)});

test("scheduled space meals are hard input to construction and auxiliary propagation",()=>{const p=scenario(),meal={id:"meal:a",kind:"space-meal" as const,spaceId:"a",entryIndex:1,duration:10,start:600,end:610};const direct=constructSaturatedResourceWindowBlockCandidates(p,block(p),[],200,[meal]);assert.equal(direct.exhausted,false);assert.equal(direct.candidates.length,1);assert.deepEqual(direct.candidates[0]!.order,["b","a"]);const auxiliary=placeAuxiliaryTasks(p,[],200,[meal]);assert.ok(auxiliary.tasks);assert.equal(auxiliary.tasks!.find(t=>t.id==="a")!.start,640);assert.ok(auxiliary.tasks!.every(t=>t.spaceId!==meal.spaceId||t.start>=meal.end));assert.deepEqual(auxiliary.meals,[meal])});

test("a space meal that intersects every possible member placement yields no partial candidate",()=>{const p=scenario(),meal={id:"meal:a",kind:"space-meal" as const,spaceId:"a",entryIndex:1,duration:60,start:600,end:660},result=constructSaturatedResourceWindowBlockCandidates(p,block(p),[],200,[meal]);assert.equal(result.exhausted,false);assert.deepEqual(result.candidates,[]);const auxiliary=placeAuxiliaryTasks(p,[],200,[meal]);assert.equal(auxiliary.tasks,null)});

test("a protected meal inside the saturated window rejects every complete order",()=>{const p=scenario();p.protectedMeal={start:620,end:630};const result=constructSaturatedResourceWindowBlockCandidates(p,block(p),[],200);assert.equal(result.exhausted,false);assert.deepEqual(result.candidates,[]);assert.equal(placeAuxiliaryTasks(p,[],200).tasks,null)});

test("participant transition prunes one permutation while retaining the hard-valid order",()=>{const p=scenario();p.participantTransitionMinutes=15;const prior=scheduled(p,"a",570,{id:"prior-person",duration:20,spaceId:"outside",requiredResourceIds:[],start:570,end:590});const result=constructSaturatedResourceWindowBlockCandidates(p,block(p),[prior],200);assert.deepEqual(result.candidates.map(x=>x.order),[["b","a"]])});

test("resource transition can reject every contiguous shared-resource order atomically",()=>{const p=scenario();p.resources[0]!.transitionMinutes=5;const result=constructSaturatedResourceWindowBlockCandidates(p,block(p),[],200);assert.equal(result.exhausted,false);assert.deepEqual(result.candidates,[]);assert.equal(placeAuxiliaryTasks(p,[],200).tasks,null)});

test("placed space and participant conflicts prune the incompatible permutation",()=>{for(const kind of ["space","participant"] as const){const p=scenario(),prior=scheduled(p,"a",600,{id:`prior-${kind}`,duration:20,participantId:kind==="participant"?"p1":"outside",spaceId:kind==="space"?"a":"outside",requiredResourceIds:[],start:600,end:620});const result=constructSaturatedResourceWindowBlockCandidates(p,block(p),[prior],200);assert.deepEqual(result.candidates.map(x=>x.order),[["b","a"]],kind)}});

test("placed shared-resource conflict can make every permutation infeasible",()=>{const p=scenario(),prior=scheduled(p,"a",600,{id:"prior-resource",duration:20,participantId:"outside",spaceId:"outside",start:600,end:620});const result=constructSaturatedResourceWindowBlockCandidates(p,block(p),[prior],200);assert.deepEqual(result.candidates,[])});

test("insufficient allowance is exhausted atomically without publishing a partial",()=>{const p=scenario(),result=constructSaturatedResourceWindowBlockCandidates(p,block(p),[],1);assert.equal(result.exhausted,true);assert.deepEqual(result.candidates,[]);const placed=placeAuxiliaryTasks(p,[],1);assert.equal(placed.tasks,null);assert.equal(placed.exhausted,true)});

test("block cost is exactly the shared incremental auxiliary scoring",()=>{const p=scenario();p.auxiliaryPolicy={participantPresencePreference:"HIGH"};p.resources[0]!.presencePreference="HIGH";const prior=scheduled(p,"a",540,{id:"prior",duration:20,spaceId:"outside",requiredResourceIds:[],start:540,end:560}),candidate=constructSaturatedResourceWindowBlockCandidates(p,block(p),[prior],200).candidates[0]!;let expected=0;const placed=[prior];for(const task of candidate.tasks){const scored=scoreAuxiliaryTask(p,task,task.start,placed);expected+=scored.cost;placed.push(task)}assert.equal(scoreAuxiliaryTaskSequence(p,candidate.tasks,[prior]),expected);assert.ok(expected>0)});

test("similar but non-exact cohorts and differing resource/window signatures are not grouped",()=>{const less=scenario();less.tasks[0]!.duration=15;assert.deepEqual(deriveSaturatedResourceWindowBlocks(less,less.tasks,[]),[]);const more=scenario();more.tasks[0]!.duration=25;assert.deepEqual(deriveSaturatedResourceWindowBlocks(more,more.tasks,[]),[]);const resources=scenario();resources.resources.push({id:"sound",availability:[{start:540,end:720}],presencePreference:"OFF"});resources.tasks[0]!.requiredResourceIds=["sound"];assert.deepEqual(deriveSaturatedResourceWindowBlocks(resources,resources.tasks,[]),[]);const windows=scenario();windows.tasks[0]!.availability=[{start:605,end:665}];assert.deepEqual(deriveSaturatedResourceWindowBlocks(windows,windows.tasks,[]),[])});

test("placed, joint, accompaniment, and technical-chain members are excluded",()=>{const placedProblem=scenario(),placedTask=scheduled(placedProblem,"a",600);assert.deepEqual(deriveSaturatedResourceWindowBlocks(placedProblem,placedProblem.tasks,[placedTask]),[]);const joint=scenario();joint.tasks.forEach(task=>{if(task.kind!=="technical")task.jointGroupId="joint"});assert.deepEqual(deriveSaturatedResourceWindowBlocks(joint,joint.tasks,[]),[]);const accompanied=scenario();accompanied.anchoredAccompaniments=[{id:"wrap",anchorTaskId:"anchor",beforeTaskIds:["a"],afterTaskIds:["b"],adjacency:"REQUIRED",internalTransition:"INCLUDED",resourceContinuity:"REQUIRED"}];assert.deepEqual(deriveSaturatedResourceWindowBlocks(accompanied,accompanied.tasks,[]),[]);const technical=scenario();technical.tasks=[{...technical.tasks[0]!,kind:"technical",participantId:undefined,dependencies:[]},{...technical.tasks[1]!,kind:"technical",participantId:undefined,dependencies:["a"]}];assert.deepEqual(deriveSaturatedResourceWindowBlocks(technical,technical.tasks,[]),[])});
