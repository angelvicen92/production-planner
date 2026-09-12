import assert from "node:assert/strict";
import test from "node:test";
import type {PlannerNextProblem,Task} from "./contracts";
import {runExactItinerantPlanSearch} from "./exactItinerantPlan";
import {validatePlan} from "./validate";

const window=[{start:0,end:120}];
const operation=(id:string,participantId:string,start:number,end:number,unit="itinerant-team:1",resource=`resource-${id}`):Task=>({
  id,kind:"auxiliary",participantId,duration:10,spaceId:`space-${id}`,dependencies:[],availability:[{start,end}],
  requiredResourceIds:[resource],itinerantUnitId:unit,
});
function agendaProblem(tasks:Task[]):PlannerNextProblem{
  const ids=(xs:(string|undefined)[])=>[...new Set(xs.filter((id):id is string=>id!==undefined))].sort();
  return {day:{start:0,end:120},spaces:[{id:"main",availability:window},{id:"vocal",availability:window},
    ...ids(tasks.map(task=>task.spaceId)).map(id=>({id,availability:window}))],
    resources:ids(tasks.flatMap(task=>task.requiredResourceIds??[])).map(id=>({id,availability:window,presencePreference:"OFF" as const,transitionMinutes:0})),
    itinerantUnits:ids(tasks.map(task=>task.itinerantUnitId)).map(id=>({id,availability:window})),
    participants:[{id:"core",availability:window},...ids(tasks.map(task=>task.participantId)).map(id=>({id,availability:window}))],
    coaches:[{id:"coach",availability:window}],tasks:[
      {id:"vocal",kind:"vocal",participantId:"core",coachId:"coach",duration:10,spaceId:"vocal",dependencies:[]},
      {id:"main",kind:"main",participantId:"core",coachId:"coach",duration:10,spaceId:"main",dependencies:["vocal"],blockKey:"coach"},...tasks],
    mainFlow:{spaceId:"main",preferredEnd:100,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
    participantTransitionMinutes:0,resourceTransitionMinutes:0,auxiliaryPolicy:{participantPresencePreference:"OFF"},
    budget:{bestK:1,maxBacktracks:0,maxPatterns:20,maxBranchExpansions:20_000},searchPolicy:"EXACT_CONSTRUCTIVE"};
}

test("explicit itinerant unit is one agenda of independent placements and permits gaps",()=>{
  const input=agendaProblem([operation("a","pa",50,70),operation("z","pz",30,40)]),before=structuredClone(input);
  const result=runExactItinerantPlanSearch(input);
  assert.equal(result.status,"COMPLETE",JSON.stringify({reasons:result.evidence.reasonCodes,validation:result.evidence.firstCoreLeafHardValidationRejection,counts:result.evidence.coreLeafValidationReasonCounts,steps:result.evidence.macroSelectionSteps,internal:result.evidence.itinerantUnitInternalSelections.slice(0,4),block:result.evidence.macroPendingPrerequisiteFirstPrune}));
  assert.equal(result.evidence.macroSelectionSteps[0]!.candidates.filter(({kind})=>kind==="ITINERANT_UNIT").length,1);
  assert.deepEqual(result.evidence.itinerantUnitAgendaPlacements["itinerant-team:1"],
    [{taskId:"z",start:30,end:40},{taskId:"a",start:50,end:60}]);
  assert.equal(result.evidence.itinerantUnitInternalSelections[0]!.taskId,"z","dynamic MRV, not task ID, chooses first");
  assert.equal(validatePlan(input,result.scheduledTasks,result.scheduledSetupPreparations,result.scheduledSpaceMeals,
    result.scheduledParticipantMeals,result.scheduledResourceMeals,result.scheduledItinerantUnitMeals).hardValid,true);
  assert.deepEqual(input,before);assert.equal(new Set(result.scheduledTasks.map(({id})=>id)).size,result.scheduledTasks.length);
  assert.ok(input.resources.every(resource=>resource.id!=="itinerant-team:1"));
});

test("disjoint itinerant units overlap while existing member resource authority forbids overlap",()=>{
  const disjoint=runExactItinerantPlanSearch(agendaProblem([
    operation("u1","p1",30,40,"itinerant-team:1","r1"),operation("u2","p2",30,40,"itinerant-team:2","r2") ]));
  assert.equal(disjoint.status,"COMPLETE");
  assert.equal(disjoint.scheduledTasks.find(({id})=>id==="u1")!.start,disjoint.scheduledTasks.find(({id})=>id==="u2")!.start);
  const shared=runExactItinerantPlanSearch(agendaProblem([
    operation("u1","p1",30,50,"itinerant-team:1","shared"),operation("u2","p2",30,50,"itinerant-team:2","shared") ]));
  assert.equal(shared.status,"COMPLETE");
  const [s1,s2]=["u1","u2"].map(id=>shared.scheduledTasks.find(task=>task.id===id)!);
  assert.ok(s1.end<=s2.start||s2.end<=s1.start);
});

test("specific joint authority wins over itinerant grouping and missing unit keeps resource behavior",()=>{
  const left=operation("joint-a","pa",30,100),right={...operation("joint-b","pb",30,100),jointGroupId:"joint"};
  right.spaceId=left.spaceId;right.requiredResourceIds=left.requiredResourceIds;right.itinerantUnitId="itinerant-team:2";
  left.jointGroupId="joint";
  const joint=runExactItinerantPlanSearch(agendaProblem([left,right]));
  assert.notEqual(joint.status,"CORE_FAILED",joint.evidence.reasonCodes.join(","));
  assert.ok(joint.evidence.macroSelectionSteps[0]!.candidates.some(({kind})=>kind==="JOINT"));
  assert.ok(!joint.evidence.macroSelectionSteps[0]!.candidates.some(({kind})=>kind==="ITINERANT_UNIT"));
  const plain=operation("plain","plain-person",30,40);delete plain.itinerantUnitId;
  const ordinary=runExactItinerantPlanSearch(agendaProblem([plain]));
  assert.equal(ordinary.status,"COMPLETE");
  assert.ok(ordinary.evidence.macroSelectionSteps[0]!.candidates.some(({kind})=>kind==="RESOURCE_TASK"));
});

test("itinerant agendas are deterministic and input-order invariant",()=>{
  const tasks=[operation("a","pa",30,70),operation("b","pb",30,70),operation("c","pc",50,90)];
  const first=runExactItinerantPlanSearch(agendaProblem(tasks)),second=runExactItinerantPlanSearch(agendaProblem([...tasks].reverse()));
  assert.equal(first.status,"COMPLETE");assert.equal(second.status,"COMPLETE");
  assert.equal(first.evidence.fullFingerprint,second.evidence.fullFingerprint);
  assert.deepEqual(first.evidence.itinerantUnitAgendaPlacements,second.evidence.itinerantUnitAgendaPlacements);
});
