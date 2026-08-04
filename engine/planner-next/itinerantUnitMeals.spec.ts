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
import { planCompatibilityPreserving } from "./compatibilityPreservingSearch";
import { constructExactItinerantPlan } from "./exactItinerantPlan";

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

const validated=()=>{const problem=itinerantUnitMealScenario("COMPATIBILITY_PRESERVING"),result=executePlannerNext(problem).result!;const summary=(tasks=result.scheduledTasks,unitMeals=result.scheduledItinerantUnitMeals)=>validatePlan(problem,tasks,"scheduledSetupPreparations" in result?result.scheduledSetupPreparations:[],result.scheduledSpaceMeals,result.scheduledParticipantMeals,result.scheduledResourceMeals,unitMeals);return {problem,result,summary};};
test("Validation rejects a published task missing its expected unit",()=>{const {result,summary}=validated(),task=result.scheduledTasks.find(x=>x.itinerantUnitId)!;assert.ok(summary(result.scheduledTasks.map(x=>x===task?{...x,itinerantUnitId:undefined}:x)).reasonCodes.includes("ITINERANT_UNIT_MEAL_VIOLATION"));});
test("Validation rejects a different published unit",()=>{const {result,summary}=validated(),task=result.scheduledTasks.find(x=>x.itinerantUnitId)!;assert.ok(summary(result.scheduledTasks.map(x=>x===task?{...x,itinerantUnitId:"itinerant-team:9"}:x)).reasonCodes.includes("ITINERANT_UNIT_MEAL_VIOLATION"));});
test("Validation rejects an invented unit on a non-itinerant task",()=>{const {result,summary}=validated(),task=result.scheduledTasks.find(x=>x.itinerantUnitId===undefined)!;assert.ok(summary(result.scheduledTasks.map(x=>x===task?{...x,itinerantUnitId:"itinerant-team:9"}:x)).reasonCodes.includes("ITINERANT_UNIT_MEAL_VIOLATION"));});
test("Validation directly rejects a unit alias in scheduled resources",()=>{const {result,summary}=validated(),task=result.scheduledTasks.find(x=>x.itinerantUnitId)!;const changed=result.scheduledTasks.map(x=>x===task?{...x,requiredResourceIds:[...(x.requiredResourceIds??[]),x.itinerantUnitId!]}:x);assert.ok(summary(changed).reasonCodes.includes("ITINERANT_UNIT_RESOURCE_ALIAS_NOT_ALLOWED"));});
test("Validation directly rejects a problem resource matching a used unit",()=>{const {problem,result,summary}=validated();problem.resources.push({id:"itinerant-team:7",availability:[problem.day],presencePreference:"OFF"});assert.ok(summary(result.scheduledTasks).reasonCodes.includes("ITINERANT_UNIT_RESOURCE_ALIAS_NOT_ALLOWED"));});
test("Validation preserves a correct unit-scoped result",()=>{assert.equal(validated().summary().hardValid,true);});
test("Validation rejects omitted, duplicate, and altered published unit meals",()=>{const {result,summary}=validated(),meal=result.scheduledItinerantUnitMeals[0]!;assert.ok(summary(result.scheduledTasks,[]).itinerantUnitMealViolationCount>0);assert.ok(summary(result.scheduledTasks,[meal,meal]).itinerantUnitMealViolationCount>0);assert.ok(summary(result.scheduledTasks,[{...meal,end:meal.end-5,duration:meal.duration-5}]).itinerantUnitMealViolationCount>0);});
test("two non-overlapping meals for one unit remain representable",()=>{const {problem}=validated();problem.itinerantUnitMeals!.push({id:"second",itinerantUnitId:"itinerant-team:7",interval:{start:840,end:870}});assert.ok(!preflight(problem).includes("UNREPRESENTABLE_ITINERANT_UNIT_BREAK"));});

test("protected tasks use strict overlap and preserve touching boundaries",()=>{for(const status of ["done","in_progress"] as const){for(const [startReal,endReal,conflict] of [["12:15","12:45",true],["11:30","12:00",false],["13:00","13:30",false]] as const){const input=createSupportedEngineInputAdapterFixture(),task=input.tasks[0]!;task.itinerantTeamId=7;task.status=status;task.startReal=startReal;task.endReal=endReal;input.protectedBreaks=[{id:"meal",kind:"meal",start:"12:00",end:"13:00",itinerantTeamId:7}];const reasons=preflightEngineInputForPlannerNext(input).reasonCodes;assert.equal(reasons.includes("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE"),conflict);}}});

test("direct Compatibility preflight failure publishes every empty meal array",()=>{const problem=itinerantUnitMealScenario("COMPATIBILITY_PRESERVING");problem.tasks.push({...problem.tasks[0]!});const result=planCompatibilityPreserving(problem);assert.equal(result.complete,false);assert.deepEqual([result.scheduledTasks,result.scheduledSpaceMeals,result.scheduledParticipantMeals,result.scheduledResourceMeals,result.scheduledItinerantUnitMeals],[[],[],[],[],[]]);});
test("direct Exact complete and incomplete results own their unit-meal arrays",()=>{const complete=constructExactItinerantPlan(itinerantUnitMealScenario("EXACT_CONSTRUCTIVE"));assert.equal(complete.status,"COMPLETE");assert.equal(complete.scheduledItinerantUnitMeals.length,1);const exhaustedProblem=itinerantUnitMealScenario("EXACT_CONSTRUCTIVE");exhaustedProblem.budget.maxBranchExpansions=0;const exhausted=constructExactItinerantPlan(exhaustedProblem);assert.equal(exhausted.complete,false);assert.deepEqual(exhausted.scheduledItinerantUnitMeals,[]);});
