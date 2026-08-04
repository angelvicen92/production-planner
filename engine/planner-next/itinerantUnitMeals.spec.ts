import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../types";
import { resolveAssignedItinerantUnitMealBreaks } from "./integration/assignedItinerantUnitMealBreaks";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import { canPlaceTask } from "./placement";
import { validatePlan } from "./validate";

const bare=(breaks:EngineInput["protectedBreaks"],actualMeal?:EngineInput["actualMeal"])=>({protectedBreaks:breaks,actualMeal} as EngineInput);

test("normalizes exact protectedBreaks and actualMeal unit meals",()=>{
  for(const [breaks,actual] of [[[{id:"meal-7",kind:"meal" as const,start:"12:00",end:"13:00",itinerantTeamId:7}],undefined],[[],{id:"meal-7",kind:"meal" as const,start:"12:00",end:"13:00",itinerantTeamId:7}] ] as const){
    const meals=resolveAssignedItinerantUnitMealBreaks(bare([...breaks],actual));assert.equal(meals[0]?.status,"SUPPORTED");assert.deepEqual(meals[0]?.interval,{start:720,end:780});assert.equal(meals[0]?.itinerantUnitId,"itinerant-team:7");
  }
});

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
