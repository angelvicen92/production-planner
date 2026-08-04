import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../types";
import { resolveAssignedItinerantUnitMealBreaks } from "./integration/assignedItinerantUnitMealBreaks";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import { canPlaceTask } from "./placement";
import { preflight, validatePlan } from "./validate";
import { createSupportedEngineInputAdapterFixture } from "./integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "./integration/engineInputPreflight";
import { executePlannerNext } from "./executePlannerNext";
import { fingerprint } from "./fingerprint";
import { itinerantUnitMealScenario } from "./scenarios/itinerantUnitMealScenario";

const bare=(breaks:EngineInput["protectedBreaks"],actualMeal?:EngineInput["actualMeal"])=>({protectedBreaks:breaks,actualMeal} as EngineInput);

test("normalizes exact protectedBreaks and actualMeal unit meals",()=>{
  for(const [breaks,actual] of [[[{id:"meal-7",kind:"meal" as const,start:"12:00",end:"13:00",itinerantTeamId:7}],undefined],[[],{id:"meal-7",kind:"meal" as const,start:"12:00",end:"13:00",itinerantTeamId:7}] ] as const){
    const meals=resolveAssignedItinerantUnitMealBreaks(bare([...breaks],actual));assert.equal(meals[0]?.status,"SUPPORTED");assert.deepEqual(meals[0]?.interval,{start:720,end:780});assert.equal(meals[0]?.itinerantUnitId,"itinerant-team:7");
  }
});

test("malformed runtime times are crash-safe and immutable",()=>{for(const value of ["25:00","12:99","","abc",null]){const input=bare([{id:"x",kind:"meal",start:value as string,end:"13:00",itinerantTeamId:7}]);const before=structuredClone(input);let meals:ReturnType<typeof resolveAssignedItinerantUnitMealBreaks>=[];assert.doesNotThrow(()=>{meals=resolveAssignedItinerantUnitMealBreaks(input);});const meal=meals[0]!;assert.equal(meal.status,"UNSUPPORTED");assert.ok(meal.defects.includes("INVALID_TIME"));assert.deepEqual(input,before);assert.ok(Object.isFrozen(meal)&&Object.isFrozen(meal.defects));}});

test("preflight rejects off-grid and outside-day unit meals specifically",()=>{for(const [start,end] of [["07:55","08:30"],["12:01","13:00"]]){const input=createSupportedEngineInputAdapterFixture();input.protectedBreaks=[{id:"unit",kind:"meal",start,end,itinerantTeamId:7}];assert.ok(preflightEngineInputForPlannerNext(input).reasonCodes.includes("UNREPRESENTABLE_ITINERANT_UNIT_BREAK"));}});

test("task assignment must be concrete, positive, and compatible",()=>{for(const mutate of [(task:any)=>task.itinerantTeamId=0,(task:any)=>task.itinerantTeamId=-1,(task:any)=>task.itinerantTeamId=1.5,(task:any)=>task.itinerantTeamId="7",(task:any)=>task.itinerantTeamRequirement="any",(task:any)=>task.itinerantTeamRequirement="specific",(task:any)=>task.itinerantTeamRequirement="future",(task:any)=>task.allowedItinerantTeamIds=[7],(task:any)=>{task.itinerantTeamId=7;task.allowedItinerantTeamIds=[8];}]){const input=createSupportedEngineInputAdapterFixture(),task=input.tasks[0]!;mutate(task);assert.ok(preflightEngineInputForPlannerNext(input).reasonCodes.includes("UNSUPPORTED_RESOURCE_REQUIREMENT"));}});

test("fingerprint includes unit and fixed meal and remains order invariant",()=>{const problem=itinerantUnitMealScenario("COMPATIBILITY_PRESERVING"),task={...problem.tasks.find(x=>x.id==="flexible-productive")!,start:780,end:810},meal={id:"m",itinerantUnitId:"itinerant-team:7",start:720,end:780,duration:60};assert.equal(fingerprint([task],[],[],[meal]),fingerprint([task],[],[],[meal]));assert.notEqual(fingerprint([task],[],[],[meal]),fingerprint([{...task,itinerantUnitId:"itinerant-team:8"}],[],[],[meal]));assert.notEqual(fingerprint([task],[],[],[meal]),fingerprint([task],[],[],[{...meal,end:775,duration:55}]));assert.equal(fingerprint([task,{...task,id:"z"}],[],[],[meal]),fingerprint([{...task,id:"z"},task],[],[],[meal]));});

test("both policies publish exact meals and incomplete results publish none",()=>{for(const policy of ["COMPATIBILITY_PRESERVING","EXACT_CONSTRUCTIVE"] as const){const problem=itinerantUnitMealScenario(policy),result=executePlannerNext(problem).result!;assert.equal(result.complete,true);assert.equal(result.scheduledItinerantUnitMeals.length,1);assert.equal(validatePlan(problem,result.scheduledTasks,"scheduledSetupPreparations" in result?result.scheduledSetupPreparations:[],result.scheduledSpaceMeals,result.scheduledParticipantMeals,result.scheduledResourceMeals,result.scheduledItinerantUnitMeals).hardValid,true);problem.budget.maxBranchExpansions=0;const failed=executePlannerNext(problem).result!;assert.equal(failed.complete,false);assert.deepEqual(failed.scheduledItinerantUnitMeals,[]);}});

test("direct preflight forbids unit identity aliases as hard resources",()=>{const problem=itinerantUnitMealScenario("COMPATIBILITY_PRESERVING"),task=problem.tasks.find(x=>x.itinerantUnitId)!;task.requiredResourceIds=[...(task.requiredResourceIds??[]),task.itinerantUnitId!];assert.ok(preflight(problem).includes("ITINERANT_UNIT_RESOURCE_ALIAS_NOT_ALLOWED"));});

test("rejects missing identity, invalid unit, mixed scope, duplicate and same-unit overlap",()=>{
  assert.ok(resolveAssignedItinerantUnitMealBreaks(bare([{kind:"meal",start:"12:00",end:"13:00",itinerantTeamId:7}]))[0]!.defects.includes("INVALID_ID"));
  assert.ok(resolveAssignedItinerantUnitMealBreaks(bare([{id:"x",kind:"meal",start:"12:00",end:"13:00",itinerantTeamId:0}]))[0]!.defects.includes("INVALID_UNIT"));
  assert.ok(resolveAssignedItinerantUnitMealBreaks(bare([{id:"x",kind:"meal",start:"12:00",end:"13:00",itinerantTeamId:7,contestantId:1}]))[0]!.defects.includes("MIXED_SCOPE"));
  const duplicate=resolveAssignedItinerantUnitMealBreaks(bare([{id:"x",kind:"meal",start:"12:00",end:"13:00",itinerantTeamId:7}],{id:"x",kind:"meal",start:"12:00",end:"13:00",itinerantTeamId:7}));assert.ok(duplicate.every(x=>x.defects.includes("AMBIGUOUS_DUPLICATE")));
  const overlap=resolveAssignedItinerantUnitMealBreaks(bare([{id:"a",kind:"meal",start:"12:00",end:"13:00",itinerantTeamId:7},{id:"b",kind:"meal",start:"12:30",end:"13:30",itinerantTeamId:7}]));assert.ok(overlap.every(x=>x.defects.includes("OVERLAP")));
  assert.ok(resolveAssignedItinerantUnitMealBreaks(bare([{id:"a",kind:"meal",start:"12:00",end:"13:00",itinerantTeamId:7},{id:"b",kind:"meal",start:"12:00",end:"13:00",itinerantTeamId:8}])).every(x=>x.status==="SUPPORTED"));
});

test("placement and validation apply strict unit scope without a fictitious resource",()=>{
  const problem=mainFlowVocalScenario();const task=problem.tasks.find(x=>x.kind==="auxiliary")??problem.tasks[0]!;task.itinerantUnitId="itinerant-team:7";problem.itinerantUnitMeals=[{id:"meal-7",itinerantUnitId:"itinerant-team:7",interval:{start:720,end:780}}];
  assert.equal(canPlaceTask(problem,task,720-task.duration,[]),true);assert.equal(canPlaceTask(problem,task,750,[]),false);assert.equal(canPlaceTask(problem,task,780,[]),true);
  const other={...task,id:"other",itinerantUnitId:"itinerant-team:8",start:735,end:735+task.duration};assert.equal(canPlaceTask(problem,other,735,[]),true);assert.ok(!(task.requiredResourceIds??[]).includes("itinerant-team:7"));
  const published=[{id:"meal-7",itinerantUnitId:"itinerant-team:7",start:720,end:780,duration:60}];assert.equal(validatePlan({...problem,tasks:[]},[],[],[],[],[],published).itinerantUnitMealViolationCount,0);assert.ok(validatePlan({...problem,tasks:[]},[],[],[],[],[],[]).itinerantUnitMealViolationCount>0);assert.ok(validatePlan({...problem,tasks:[]},[],[],[],[],[],[published[0]!,published[0]!]).itinerantUnitMealViolationCount>0);
});
