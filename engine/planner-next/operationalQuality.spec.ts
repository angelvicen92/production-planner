import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { compareOperationalQuality, evaluateOperationalQuality } from "./operationalQuality";

const problem:PlannerNextProblem={day:{start:0,end:100},spaces:[
  {id:"setup",availability:[{start:0,end:100}],secondaryContinuity:"PREFERRED",setupPolicy:{familyOrder:["a","b"],reentry:"FORBIDDEN",preparationMinutesBetweenFamilies:10}},
  {id:"shared",availability:[{start:0,end:100}]},],resources:[{id:"camera",availability:[{start:0,end:100}],presencePreference:"MAXIMUM",presenceConcentrationPolicy:"PREFERRED"}],
  participants:[{id:"a",availability:[{start:0,end:100}]},{id:"b",availability:[{start:0,end:100}]},{id:"c",availability:[{start:0,end:100}]}],coaches:[],tasks:[],
  mainFlow:{spaceId:"main",preferredEnd:100,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,
  budget:{bestK:1,maxBacktracks:0,maxPatterns:1,maxBranchExpansions:1000}};
const task=(id:string,spaceId:string,start:number,resource=true):ScheduledTask=>({id,kind:"auxiliary",participantId:id,spaceId,duration:10,start,end:start+10,dependencies:[],requiredResourceIds:resource?["camera"]:[],setupFamilyId:spaceId==="setup"?(id==="a"?"a":"b"):undefined});

test("unit quality includes the space connected through a preferred shared resource",()=>{
  const compact=evaluateOperationalQuality(problem,[task("a","setup",0),task("b","setup",10),task("c","shared",20)]);
  const locallyEqualButWide=evaluateOperationalQuality(problem,[task("a","setup",0),task("b","setup",10),task("c","shared",50)]);
  assert.equal(compact.unitActiveSpan,30);assert.equal(compact.preferredResourcePresenceSpans.camera,30);
  assert.equal(compareOperationalQuality(compact,locallyEqualButWide),1);
});

test("required preparation bridges setup work and is not avoidable idle",()=>{
  const quality=evaluateOperationalQuality(problem,[task("a","setup",0,false),task("b","setup",20,false)],
    [{id:"prep",spaceId:"setup",setupFamilyId:"b",start:10,end:20,duration:10}]);
  assert.equal(quality.avoidableIdleMinutes,0);assert.equal(quality.geometry,"compact");
});

test("OFF spaces do not receive a compactness penalty",()=>{
  const off=structuredClone(problem);off.spaces[0]!.secondaryContinuity="OFF";
  const quality=evaluateOperationalQuality(off,[task("a","setup",0,false),task("b","setup",40,false)]);
  assert.equal(quality.avoidableIdleMinutes,0);assert.equal(quality.preferredBlockCount,0);
});
