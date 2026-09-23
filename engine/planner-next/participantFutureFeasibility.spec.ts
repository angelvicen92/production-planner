import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { probeParticipantFutureReservations } from "./participantFutureFeasibility";

const problem=(futureAvailability:{start:number;end:number},dependency:string[]=[]):PlannerNextProblem=>({
  day:{start:0,end:100},spaces:[{id:"a",availability:[{start:0,end:100}]},{id:"b",availability:[{start:0,end:100}]}],
  resources:[],participants:[{id:"p",availability:[{start:0,end:100}]},{id:"other",availability:[{start:0,end:100}]}],coaches:[],
  tasks:[],analyticalFutureParticipantTasks:[{id:"future",kind:"auxiliary",participantId:"p",spaceId:"b",duration:40,
    availability:[futureAvailability],dependencies:dependency}],mainFlow:{spaceId:"a",preferredEnd:100,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
  participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:10,maxPatterns:10,maxBranchExpansions:100},
  participantMealCapacity:{maxSimultaneous:1},participantMeals:[{id:"meal",sourceTaskId:"meal-source",participantId:"p",duration:20,
    window:{start:40,end:80},status:"pending"}],
});
const current=(participantId="p"):ScheduledTask=>({id:"current",kind:"auxiliary",participantId,spaceId:"a",duration:20,dependencies:[],start:0,end:20});

test("prunes when a future task and meal have non-empty individual domains but no compatible pair",()=>{
  const source=problem({start:40,end:80}),before=structuredClone(source);
  const first=probeParticipantFutureReservations(source,[current()],[current()]);
  const second=probeParticipantFutureReservations(source,[current()],[current()]);
  assert.equal(first.status,"PRUNE"); assert.equal(first.reasonCode,"FUTURE_PARTICIPANT_TASK_MEAL_INCOMPATIBLE");
  assert.ok(first.futureTaskCandidateCount>0); assert.ok(first.mealCandidateCount>0); assert.equal(first.compatiblePairCount,0);
  assert.equal(first.branchesConsumed,0); assert.deepEqual(first,second); assert.deepEqual(source,before);
});

test("passes when at least one future task and meal pair is compatible",()=>{
  const result=probeParticipantFutureReservations(problem({start:60,end:100}),[current()],[current()]);
  assert.equal(result.status,"PASS"); assert.equal(result.jointTaskMealChecks,1); assert.equal(result.compatiblePairCount,1);
});

test("abstains for an unresolved future dependency",()=>{
  const result=probeParticipantFutureReservations(problem({start:40,end:80},["unknown"]),[current()],[current()]);
  assert.equal(result.status,"ABSTAIN"); assert.equal(result.reasonCode,"FUTURE_PARTICIPANT_RESERVATION_INCONCLUSIVE");
  assert.equal(result.individualZeroDomainPrunes,0);
});

test("skips obligations independent of the provisional placement",()=>{
  const result=probeParticipantFutureReservations(problem({start:40,end:80}),[current("other")],[current("other")]);
  assert.equal(result.status,"PASS"); assert.equal(result.affectedFutureTasksChecked,0); assert.equal(result.jointTaskMealChecks,0);
});

test("finds a deterministic collective witness for jointly viable participant tasks",()=>{
  const source=problem({start:60,end:100});
  source.participantMeals=[];
  source.analyticalFutureParticipantTasks!.push({...source.analyticalFutureParticipantTasks![0],id:"future-2",spaceId:"a",availability:[{start:20,end:60}]});
  const result=probeParticipantFutureReservations(source,[current()],[current()]);
  assert.equal(result.status,"PASS"); assert.equal(result.collectiveChecks,1); assert.equal(result.collectivePasses,1);
  assert.equal(result.collectiveWitnessFound,true); assert.ok(result.branchesConsumed>0);
  assert.deepEqual(result.collectiveObligationIds,["future","future-2"]);
  assert.equal("scheduled" in result,false);
});

test("prunes when future tasks and a required meal are individually viable but collectively impossible",()=>{
  const source=problem({start:40,end:80});
  source.analyticalFutureParticipantTasks![0].duration=20;
  source.analyticalFutureParticipantTasks!.push({...source.analyticalFutureParticipantTasks![0],id:"future-2"});
  const first=probeParticipantFutureReservations(source,[current()],[current()]);
  const second=probeParticipantFutureReservations(source,[current()],[current()]);
  assert.equal(first.status,"PRUNE"); assert.equal(first.reasonCode,"FUTURE_PARTICIPANT_COLLECTIVE_INFEASIBLE");
  assert.equal(first.collectiveChecks,1); assert.equal(first.collectivePrunes,1); assert.equal(first.collectiveWitnessFound,false);
  assert.deepEqual(first,second);
});

test("passes multiple independent future tasks after individual checks without claiming collective work",()=>{
  const source=problem({start:60,end:100}); source.participantMeals=[];
  source.spaces.push({id:"c",availability:[{start:0,end:100}]});
  source.participants.push({id:"q",availability:[{start:0,end:100}]});
  source.analyticalFutureParticipantTasks![0].participantId="q"; source.analyticalFutureParticipantTasks![0].spaceId="c";
  source.analyticalFutureParticipantTasks![0].dependencies=["current"];
  source.analyticalFutureParticipantTasks!.push({id:"future-2",kind:"auxiliary",participantId:"p",spaceId:"b",duration:20,
    availability:[{start:60,end:100}],dependencies:[]});
  const result=probeParticipantFutureReservations(source,[current()],[current()]);
  assert.equal(result.status,"PASS"); assert.equal(result.affectedFutureTasksChecked,2);
  assert.equal(result.collectiveChecks,0); assert.equal(result.collectivePrunes,0);
});

test("pair prune takes precedence over other future interactions",()=>{
  const source=problem({start:40,end:80});
  source.analyticalFutureParticipantTasks!.push({...source.analyticalFutureParticipantTasks![0],id:"later",availability:[{start:80,end:100}],duration:20});
  const result=probeParticipantFutureReservations(source,[current()],[current()]);
  assert.equal(result.status,"PRUNE"); assert.equal(result.reasonCode,"FUTURE_PARTICIPANT_TASK_MEAL_INCOMPATIBLE");
  assert.equal(result.collectiveChecks,0);
});

test("grid-aligned extrema do not falsely prune disjoint raw interval endpoints",()=>{
  const source=problem({start:41,end:86});
  source.analyticalFutureParticipantTasks![0].duration=35;
  source.participantMeals![0]={...source.participantMeals![0],duration:5,window:{start:82,end:90}};
  const result=probeParticipantFutureReservations(source,[current()],[current()]);
  assert.equal(result.status,"PASS"); assert.equal(result.compatiblePairCount,1);
});
