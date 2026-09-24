import assert from "node:assert/strict";
import test from "node:test";
import { certifyGlobalParticipantMealGate } from "./globalParticipantMealGate";

const obligation=(sourceTaskId:string,participantId:string)=>({id:`meal:${sourceTaskId}`,sourceTaskId,participantId,duration:15,window:{start:60,end:120},dependencies:[],status:"pending" as const});
const meal=(sourceTaskId:string,participantId:string,start:number)=>({id:`meal:${sourceTaskId}`,sourceTaskId,participantId,duration:15,start,end:start+15});

test("global gate prunes when an untouched participant is absent from the terminal witness",()=>{
  const result=certifyGlobalParticipantMealGate([obligation("touched","p1"),obligation("untouched","p2")],[],[meal("touched","p1",60)],[]);
  assert.equal(result.globalMealGate,"PRUNE");assert.deepEqual(result.zeroDomainMealSourceIds,["untouched"]);assert.equal(result.globallyCertifiedParticipantMealCount,1);
});

test("global gate includes protected and flexible obligations deterministically",()=>{
  const result=certifyGlobalParticipantMealGate([obligation("a","p1"),obligation("b","p2")],[meal("a","p1",60)],[meal("b","p2",75)],[]);
  assert.equal(result.globalMealGate,"PASS");assert.equal(result.participantMealObligationCount,2);assert.ok(result.globalParticipantMealWitnessFingerprint);
});

test("global gate reports general search exhaustion without inventing meal infeasibility",()=>{
  const result=certifyGlobalParticipantMealGate([obligation("pending","p1")],[],[],["STANDALONE_BRANCH_BUDGET_EXHAUSTED"]);
  assert.equal(result.globalMealGate,"BUDGET_EXHAUSTED");assert.deepEqual(result.zeroDomainMealSourceIds,["pending"]);
});
