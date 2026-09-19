import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, candidateCuts, fallbackCandidateCuts, mainFlowMealAligned, mainFlowMealPolicy,
  preferredCandidateCuts } from "./mainFlowMeal";
import { mainFlowMealScenario } from "./scenarios/mainFlowMealScenario";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { preflight, validatePlan } from "./validate";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";

describe("NEXT-017 main flow meal",()=>{
  it("prefers all-morning and block boundaries, while retaining every task boundary",()=>{
    const p=mainFlowMealScenario(),pattern=["a","a","b","b"];
    assert.deepEqual(candidateCuts(pattern),[4,2,1,3]);
    assert.deepEqual(preferredCandidateCuts(pattern),[4,2]);
    assert.deepEqual(fallbackCandidateCuts(pattern),[1,3]);
    assert.deepEqual(buildTimeline(p,pattern,15,2).slots,[810,825,900,915]);
    assert.equal(mainFlowMealAligned(p),true);
  });

  it("selects the feasible split atomically",()=>{
    const r=planMainFlowAndFeeders(mainFlowMealScenario());assert.equal(r.complete,true);
    assert.equal(r.metrics.mainFlowSelectedSplitIndex,4);assert.equal(r.metrics.mainFlowGapMinutes,0);
    assert.deepEqual(({start:r.scheduledSpaceMeals.find(x=>x.spaceId==="main-stage")?.start,end:r.scheduledSpaceMeals.find(x=>x.spaceId==="main-stage")?.end}),{start:840,end:900});
  });

  it("resolves an operational space obligation as the Main authority and shifts later slots without adding a run",()=>{
    const p=mainFlowMealScenario();delete p.spaces.find(space=>space.id===p.mainFlow.spaceId)!.mealPolicy;
    p.operationalMealPolicies=[{id:"main-pause",window:{start:780,end:990},duration:75,resourceIds:[],spaceIds:[p.mainFlow.spaceId]}];
    const pattern=["a","a","b","b"],beforeRuns=pattern.reduce((n,key,i)=>n+(i===0||pattern[i-1]!==key?1:0),0);
    const authority=mainFlowMealPolicy(p),timeline=buildTimeline(p,pattern,15,2);
    assert.deepEqual(authority,{window:{start:780,end:990},duration:75,source:"OPERATIONAL_MEAL_POLICY",sourceIds:["main-pause"]});
    assert.deepEqual(timeline.slots,[810,825,915,930]);
    assert.equal(timeline.slots[2]!-825,90);assert.equal(beforeRuns,2);
  });

  it("connects Main continuity only through the scheduled authorized operational meal",()=>{
    const availability=[{start:0,end:60}];
    const p:PlannerNextProblem={day:{start:0,end:60},spaces:[{id:"main",availability}],resources:[],
      participants:[{id:"a",availability},{id:"b",availability}],coaches:[],tasks:[
        {id:"first",kind:"main",participantId:"a",duration:10,spaceId:"main",dependencies:[],blockKey:"same"},
        {id:"second",kind:"main",participantId:"b",duration:10,spaceId:"main",dependencies:[],blockKey:"same"}],
      mainFlow:{spaceId:"main",preferredEnd:10,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
      participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:0,maxPatterns:1,maxBranchExpansions:10},
      operationalMealPolicies:[{id:"authorized",window:{start:10,end:20},duration:10,resourceIds:[],spaceIds:["main"]}]};
    const scheduled=p.tasks.map((task,index)=>({...task,start:index*20,end:index*20+10})) as ScheduledTask[];
    const authorized=[{id:"authorized",resourceIds:[],spaceIds:["main"],duration:10,start:10,end:20}];
    assert.equal(validatePlan(p,scheduled,[],[],[],[],[],[],authorized).hardValid,true);
    const arbitraryGap=validatePlan({...p,operationalMealPolicies:undefined},scheduled);
    assert.equal(arbitraryGap.hardValid,false);
    assert.ok(arbitraryGap.blockViolationCount>0);
  });

  it("preserves historical space policy, canonicalizes an equivalent pair, and rejects a contradiction",()=>{
    const p=mainFlowMealScenario(),historical=mainFlowMealPolicy(p);assert.equal(historical?.source,"SPACE_MEAL_POLICY");
    const policy=p.spaces.find(space=>space.id===p.mainFlow.spaceId)!.mealPolicy!;
    p.operationalMealPolicies=[{id:"same",window:{...policy.window},duration:policy.duration,resourceIds:[],spaceIds:[p.mainFlow.spaceId]}];
    assert.equal(mainFlowMealPolicy(p)?.source,"CANONICALIZED");
    assert.equal(mainFlowMealPolicy(p)?.sourceIds.length,2);
    p.operationalMealPolicies[0]!.duration++;
    assert.ok(preflight(p).includes("INCOMPATIBLE_MAIN_FLOW_MEAL_POLICIES"));
    assert.throws(()=>mainFlowMealPolicy(p),/INCOMPATIBLE_MAIN_FLOW_MEAL_POLICIES/);
  });

  it("retains historical behavior when no meal authority exists",()=>{
    const p=mainFlowMealScenario();delete p.spaces.find(space=>space.id===p.mainFlow.spaceId)!.mealPolicy;
    assert.equal(mainFlowMealPolicy(p),undefined);assert.equal(mainFlowMealAligned(p),false);
  });
});
