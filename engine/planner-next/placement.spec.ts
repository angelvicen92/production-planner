import assert from "node:assert/strict";import test from "node:test";import { canPlaceTask, exactTaskStartDomain, prepareTaskPlacementAuthority } from "./placement";import { mainFlowMealScenario } from "./scenarios/mainFlowMealScenario";import { technicalChainScenario } from "./scenarios/technicalChainScenario";import { getTechnicalChains } from "./technicalChains";
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
