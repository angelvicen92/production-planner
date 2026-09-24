import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput, TaskInput } from "../engine/types";
import { recommendNextAssistedScope } from "./assistedScopeOrchestrator";

const task=(id:number,spaceId:number,duration=10,extra:Partial<TaskInput>={}):TaskInput=>({id,planId:1,templateId:id,status:"pending",spaceId,durationOverrideMin:duration,...extra});
const input=(tasks:TaskInput[]):EngineInput=>({planId:1,workDay:{start:"08:00",end:"20:00"},meal:{start:"13:00",end:"15:00"},camerasAvailable:4,
  tasks,locks:[],planResourceItems:[],zoneResourceAssignments:{},spaceResourceAssignments:{},zoneResourceTypeRequirements:{},spaceResourceTypeRequirements:{},resourceItemComponents:{},
  groupingZoneIds:[],arrivalGroupingTarget:1,departureGroupingTarget:1,arrivalMinGapMinutes:0,departureMinGapMinutes:0,vanCapacity:1});
const blank=(tasks:TaskInput[])=>({tasks:tasks.map(t=>({taskId:t.id,startPlanned:null,endPlanned:null,zoneId:null,spaceId:t.spaceId??null,
  locationLabel:null,durationOverride:null,camerasOverride:null}))});

test("space renumbering and reversed input preserve semantic unit recommendation and evidence priority",()=>{
  const a=input([task(1,10,5),task(2,20,60),task(3,30,60)]);a.roundSynchronizations=[{id:"rounds",synchronization:"START_TOGETHER_WHILE_ALL_LANES_ACTIVE",lanes:[{spaceId:20,taskIds:[2],preparationMinutesBetweenRounds:5},{spaceId:30,taskIds:[3],preparationMinutesBetweenRounds:5}]}];
  const b=structuredClone(a);b.tasks.reverse();b.tasks.forEach(t=>{t.spaceId=t.spaceId===10?99:t.spaceId===20?88:77});b.roundSynchronizations![0]!.lanes=[...b.roundSynchronizations![0]!.lanes].reverse().map(l=>({...l,spaceId:l.spaceId===20?88:77}));
  const x=recommendNextAssistedScope(a,blank(a.tasks))!,y=recommendNextAssistedScope(b,blank(b.tasks))!;
  assert.equal(x.selectedUnitId,"ROUND_SYNCHRONIZATION:rounds");assert.equal(y.selectedUnitId,x.selectedUnitId);
  assert.deepEqual(y.memberTaskIds,x.memberTaskIds);assert.deepEqual(y.priority,x.priority);
});

test("explicit multi-space meal, technical chain and round authorities each stay one scope",()=>{
  const source=input([task(1,10),task(2,20),task(3,30),task(4,40),task(5,50),task(6,60)]);
  source.operationalMealPolicies=[{id:"p14",window:{start:"13:00",end:"15:00"},durationMinutes:30,planResourceItemIds:[],spaceIds:[10,20]}];
  source.technicalChains=[{id:"chain",orderedTaskIds:[3,4],adjacency:"REQUIRED",resourceContinuity:"REQUIRED",requiredResourceIds:[]}];
  source.roundSynchronizations=[{id:"rounds",synchronization:"START_TOGETHER_WHILE_ALL_LANES_ACTIVE",lanes:[{spaceId:50,taskIds:[5],preparationMinutesBetweenRounds:0},{spaceId:60,taskIds:[6],preparationMinutesBetweenRounds:0}]}];
  const recommendation=recommendNextAssistedScope(source,blank(source.tasks))!;
  const units=recommendation.candidates;
  assert.ok(units.some(x=>x.unitKind==="OPERATIONAL_MEAL"&&x.memberTaskIds.join() === "1,2"));
  assert.ok(units.some(x=>x.unitKind==="TECHNICAL_CHAIN"&&x.memberTaskIds.join() === "3,4"));
  assert.ok(units.some(x=>x.unitKind==="ROUND_SYNCHRONIZATION"&&x.memberTaskIds.join() === "5,6"));
});

test("a short lower-ID fallback cannot displace a long synchronized unit",()=>{
  const source=input([task(1,1,5),task(8,8,60),task(9,9,60)]);
  source.roundSynchronizations=[{id:"sync",synchronization:"START_TOGETHER_WHILE_ALL_LANES_ACTIVE",lanes:[{spaceId:8,taskIds:[8],preparationMinutesBetweenRounds:0},{spaceId:9,taskIds:[9],preparationMinutesBetweenRounds:0}]}];
  assert.equal(recommendNextAssistedScope(source,blank(source.tasks))!.selectedUnitId,"ROUND_SYNCHRONIZATION:sync");
});

test("P14-like meal scope retains all independently constrained and parallel tasks",()=>{
  const source=input([task(1,10,20,{assignedResourceIds:[7]}),task(2,20,20,{assignedResourceIds:[7]}),task(3,30,20)]);
  source.operationalMealPolicies=[{id:"p14",window:{start:"13:00",end:"15:00"},durationMinutes:30,planResourceItemIds:[],spaceIds:[10,20,30]}];
  const selected=recommendNextAssistedScope(source,blank(source.tasks))!;
  assert.deepEqual(selected.memberTaskIds,[1,2,3]);assert.equal(selected.selector.kind,"TASK_IDS");
});

test("space fallback is one unit whose evidence exactly matches its selector",()=>{
  const source=input([task(1,10),task(2,10),task(3,20)]);
  const recommendation=recommendNextAssistedScope(source,blank(source.tasks))!;
  const spaceTen=recommendation.candidates.filter(candidate=>candidate.selector.kind==="SPACE"&&candidate.selector.spaceId===10);
  assert.equal(spaceTen.length,1);assert.deepEqual(spaceTen[0]!.memberTaskIds,[1,2]);
  assert.equal(new Set(recommendation.candidates.map(candidate=>candidate.unitId)).size,recommendation.candidates.length);
});

test("effective pressure can outrank a nominally higher authority kind",()=>{
  const source=input([task(1,10,10),task(2,20,90,{fixedWindowEnd:"10:00"}),task(3,20,90,{fixedWindowEnd:"10:00"}),task(4,30,10,{dependsOnTaskIds:[2]}),task(5,40,10,{dependsOnTaskIds:[3]})]);
  source.technicalChains=[{id:"short-chain",orderedTaskIds:[1],adjacency:"REQUIRED",resourceContinuity:"REQUIRED",requiredResourceIds:[]}];
  const selected=recommendNextAssistedScope(source,blank(source.tasks),[1,2,3])!;
  assert.equal(selected.selectedUnitKind,"SPACE_FALLBACK");assert.deepEqual(selected.memberTaskIds,[2,3]);
});

test("a structurally coupled unit with a scarce shared-resource window precedes a flexible agenda",()=>{
  const source=input([
    task(11,10,60,{assignedResourceIds:[101]}),
    task(12,10,60,{assignedResourceIds:[101]}),
    task(21,20,60,{assignedResourceIds:[101],itinerantTeamId:201,allowedItinerantTeamIds:[201]}),
  ]);
  source.planResourceItems=[{id:101,resourceItemId:1001,typeId:1,name:"shared",isAvailable:true,availabilityStart:"16:00",availabilityEnd:"18:00"}];
  source.technicalChains=[{id:"scarce-window",orderedTaskIds:[11,12],adjacency:"REQUIRED",resourceContinuity:"REQUIRED",requiredResourceIds:[101]}];
  source.itinerantTeamAvailability=[{itinerantTeamId:201,windows:[source.workDay]}];
  const recommendation=recommendNextAssistedScope(source,blank(source.tasks))!;
  assert.equal(recommendation.selectedUnitId,"TECHNICAL_CHAIN:scarce-window");
  assert.deepEqual(recommendation.priority,{
    structuralClass:1,requiredCoupling:2,downstreamImpact:0,effectiveDeadline:null,pendingDurationMinutes:120,pendingTaskCount:2,
    sharedResourcePressure:1,effectiveWindowLoadMinutes:120,effectiveWindowCapacityMinutes:120,effectiveWindowSlackMinutes:0,
    sharedResourceDemandCount:1,
  });
});

test("configured main flow retains its explicit precedence",()=>{
  const source=input([task(1,10,5),task(2,20,200)]);
  source.plannerNext={searchPolicy:"EXACT_CONSTRUCTIVE",searchBudget:{bestK:1,maxBacktracks:1,maxPatterns:1,maxBranchExpansions:1},timeGridMinutes:5,participantTransitionMinutes:0,resourceTransitionMinutes:0,mainFlow:{spaceId:10,preferredEnd:"13:00",continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1}};
  assert.equal(recommendNextAssistedScope(source,blank(source.tasks))!.selectedUnitKind,"MAIN_PIPELINE");
});

test("provided equivalent itinerant domains form one agenda while provided specific domains stay separate",()=>{
  const source=input([task(1,10,20,{itinerantTeamId:7,allowedItinerantTeamIds:[7,8]}),task(2,20,20,{itinerantTeamId:8,allowedItinerantTeamIds:[8,7]}),task(3,30,20,{itinerantTeamId:9,allowedItinerantTeamIds:[9]})]);
  const units=recommendNextAssistedScope(source,blank(source.tasks))!.candidates.filter(candidate=>candidate.unitKind==="ITINERANT_AGENDA");
  assert.ok(units.some(unit=>unit.memberTaskIds.join() === "1,2"));assert.ok(units.some(unit=>unit.memberTaskIds.join() === "3"));
});
