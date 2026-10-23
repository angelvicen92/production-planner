import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import type {EngineInput} from "../../engine/types";
import {analyseU00gMealGate,verifyU00gNativeGate} from "./analyseU00gMealGate";
import {adaptEngineInputToPlannerNextProblem} from "../../engine/planner-next/integration/engineInputAdapter";
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from "../../engine/planner-next/assistedPlanning";

const input=()=>JSON.parse(readFileSync("docs/evidence/p0-u00g/causal/counterfactual-input.json","utf8")) as EngineInput;
test("native ID-only reproduction reaches Draft but SQL blocks meal-only validation without mutating the prior state",()=>{
 assert.equal(verifyU00gNativeGate().status,"DIAGNOSTIC_BLOCKED_BEFORE_STAGE");
});
const solve=(i:EngineInput)=>{
 const a=adaptEngineInputToPlannerNextProblem(i);assert.equal(a.status,"SUPPORTED",JSON.stringify(a.issues));if(a.status!=="SUPPORTED")throw Error("unsupported");
 return executeAssistedPlanning(buildAssistedProblem(a.problem,createPlanningScope({kind:"DAY",value:"probe"},{},
  [...a.problem.tasks.map(t=>t.id),...a.problem.participantMeals!.map(m=>m.sourceTaskId)]),[]));
};
test("historical UI loss and identity counterfactual remain reproducible; current engine repairs protected projection",()=>{
 const r=analyseU00gMealGate();assert.equal(r.status,"ENGINE_GATE_PASS");assert.equal(r.counterfactual.mealCount,2);
 assert.ok(r.protectedContinuation.branches>0);assert.ok(r.protectedContinuation.proposal);
});
test("the actual meal capacity conditions feasibility rather than only persisting a value",()=>{
 const i=input();i.mealWindow={start:"12:00",end:"12:20"};const before=structuredClone(i),blocked=solve(i);
 assert.equal(blocked.proposal,null);assert.equal(blocked.evidence.completeForScope,false);assert.ok(blocked.evidence.reasonCodes.length);
 assert.deepEqual(i,before);i.contestantMealMaxSimultaneous=2;assert.equal(solve(i).evidence.completeForScope,true);
});
test("narrow windows and dependencies require preserving future meal freedom",()=>{
 const i=input();i.mealWindow={start:"12:00",end:"12:20"};i.contestantMealMaxSimultaneous=2;
 for(const id of Object.keys(i.contestantAvailabilityById!))i.contestantAvailabilityById![Number(id)]={start:"12:00",end:"14:00"};
 const r=solve(i);assert.equal(r.evidence.completeForScope,true);assert.ok(r.proposal!.every(t=>t.start>=740));
 assert.ok(r.evidence.participantMealFutureFeasibility.futureFeasibilityChecks>0);
});
test("invalid meal duration, capacity, physical channels and protected execution remain explicit",()=>{
 for(const change of [
  (i:EngineInput)=>{i.contestantMealDurationMinutes=0;i.tasks.filter(t=>t.templateId===3).forEach(t=>{t.durationOverrideMin=0;});},
  (i:EngineInput)=>{i.contestantMealMaxSimultaneous=0;},
  (i:EngineInput)=>{i.mealWindow={start:"12:00",end:"12:10"};},
  (i:EngineInput)=>{i.tasks.find(t=>t.templateId===3)!.spaceId=1;},
  (i:EngineInput)=>{i.tasks.find(t=>t.templateId===3)!.status="done";},
 ]){const i=input();change(i);const a=adaptEngineInputToPlannerNextProblem(i);assert.equal(a.status,"UNSUPPORTED");assert.ok(a.reasonCodes.length);}
});
test("the recognizer never invents meals for participants with no configured instance",()=>{
 const i=input();i.tasks=i.tasks.filter(t=>t.id!==6);const a=adaptEngineInputToPlannerNextProblem(i);
 assert.equal(a.status,"SUPPORTED");if(a.status==="SUPPORTED")assert.deepEqual(a.problem.participantMeals?.map(m=>m.sourceTaskId),["task:3"]);
});
