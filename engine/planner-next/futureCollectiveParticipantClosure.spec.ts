import assert from "node:assert/strict";
import test from "node:test";
import type {PlannerNextProblem,Task} from "./contracts";
import {createFutureCollectiveParticipantClosureAuthority} from "./futureCollectiveParticipantClosure";

const task=(id:string,participantId:string,spaceId:string,duration=10,dependencies:string[]=[]):Task=>
  ({id,participantId,spaceId,duration,dependencies,kind:"auxiliary",availability:[{start:0,end:40}]});
function fixture(twoSlots=true):PlannerNextProblem{
  const a=task("future-a","pa","shared"),b=task("future-b","pb","shared");
  a.availability=[{start:0,end:10}];b.availability=twoSlots?[{start:10,end:20}]:[{start:0,end:10}];
  const outA=task("departure-a","pa","out",5,[a.id]),outB=task("departure-b","pb","out",5,[b.id]);
  return {day:{start:0,end:40},spaces:[{id:"shared",availability:[{start:0,end:twoSlots?20:10}]},{id:"out",availability:[{start:10,end:40}]}],
    resources:[],participants:[{id:"pa",availability:[{start:0,end:40}]},{id:"pb",availability:[{start:0,end:40}]}],coaches:[],tasks:[],
    analyticalFutureParticipantTasks:[a,b,outA,outB],analyticalFutureTransportDepartures:[outA,outB],
    mainFlow:{spaceId:"main",preferredEnd:40,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
    participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:1,maxPatterns:1,maxBranchExpansions:20}};
}

test("future collective authority returns PASS and cached PASS consumes no branch",()=>{
  const authority=createFutureCollectiveParticipantClosureAuthority(fixture());let consumed=0;
  const first=authority.evaluate([],[],()=>{consumed++;return true;}),second=authority.evaluate([],[],()=>{consumed++;return true;});
  assert.equal(first.status,"PASS");assert.equal(second.status,"PASS");assert.equal(second.cacheHit,true);
  assert.equal(second.branchesConsumed,0);assert.equal(consumed,1);assert.equal(authority.stats.cacheHits,1);
});

test("failed exact matching returns the complete alternating Hall set",()=>{
  const result=createFutureCollectiveParticipantClosureAuthority(fixture(false)).evaluate([],[]);
  assert.equal(result.status,"INFEASIBLE");assert.deepEqual(result.hall?.prerequisiteIds,["future-a","future-b"]);
  assert.deepEqual(result.hall?.participantIds,["pa","pb"]);assert.deepEqual(result.hall?.neighbourSlots,[0]);
  assert.equal(result.hall?.prerequisiteCardinality,2);assert.equal(result.hall?.neighbourCardinality,1);
});

test("uncertified geometry abstains and exhausted budget never means infeasible",()=>{
  const geometry=fixture();geometry.analyticalFutureParticipantTasks![1]!.duration=5;
  assert.equal(createFutureCollectiveParticipantClosureAuthority(geometry).evaluate([],[]).status,"ABSTAIN");
  const exhausted=createFutureCollectiveParticipantClosureAuthority(fixture()).evaluate([],[],()=>false);
  assert.equal(exhausted.status,"ABSTAIN");assert.equal(exhausted.reason,"BUDGET_EXHAUSTED");
});
