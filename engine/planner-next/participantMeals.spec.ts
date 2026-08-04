import assert from "node:assert/strict";
import test from "node:test";
import type { ParticipantMealObligation, PlannerNextProblem, ScheduledTask } from "./contracts";
import { participantMealCandidates, scheduleParticipantMeals } from "./participantMeals";
import { executePlannerNext } from "./executePlannerNext";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import { validatePlan } from "./validate";

const problem = (meals: ParticipantMealObligation[], capacity: number): PlannerNextProblem => ({
  day:{start:480,end:1080},protectedMeal:{start:720,end:750},spaces:[{id:"s",availability:[{start:480,end:1080}]}],resources:[],coaches:[],
  participants:[...new Set(meals.map(m=>m.participantId))].map(id=>({id,availability:[{start:480,end:1080}]})),tasks:[],
  mainFlow:{spaceId:"s",preferredEnd:720,continuity:"REQUIRED",maxBlocksByKey:2,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,
  budget:{bestK:3,maxBacktracks:50,maxPatterns:50,maxBranchExpansions:500},participantMeals:meals,participantMealCapacity:{maxSimultaneous:capacity},
});
const meal=(id:string,participantId:string,window={start:780,end:960},duration=45):ParticipantMealObligation=>({id:`meal:${id}`,sourceTaskId:`task:${id}`,participantId,duration,window,status:"pending"});

test("joint witness schedules every meal once, respects capacity, and is deterministic",()=>{
  const source=problem([meal("1","p1"),meal("2","p2"),meal("3","p3")],2);const before=structuredClone(source);
  const first=scheduleParticipantMeals(source,[]),second=scheduleParticipantMeals(source,[]);
  assert.equal(first.complete,true);assert.equal(first.scheduled.length,3);assert.ok(first.maximumSimultaneous<=2);assert.deepEqual(first,second);assert.deepEqual(source,before);
  assert.ok(first.scheduled.every(x=>x.end-x.start===45));
});

test("joint witness rejects capacity collision although every meal has an individual candidate",()=>{
  const obligations=[meal("1","p1",{start:780,end:825}),meal("2","p2",{start:780,end:825}),meal("3","p3",{start:780,end:825})];
  const source=problem(obligations,2);
  assert.ok(obligations.every(item=>participantMealCandidates(source,item,[],[]).length===1));
  const result=scheduleParticipantMeals(source,[]);assert.equal(result.complete,false);assert.deepEqual(result.scheduled,[]);assert.ok(result.reasonCodes.includes("PARTICIPANT_MEALS_JOINTLY_INFEASIBLE"));
});

test("meals occupy only their participant and exact boundaries remain valid",()=>{
  const obligation=meal("1","p1",{start:780,end:900},45);const source=problem([obligation],1);
  const tasks=[{id:"before",kind:"auxiliary",participantId:"p1",spaceId:"s",duration:30,dependencies:[],start:750,end:780},{id:"other",kind:"auxiliary",participantId:"p2",spaceId:"s",duration:45,dependencies:[],start:780,end:825}] as ScheduledTask[];
  source.participants.push({id:"p2",availability:[{start:480,end:1080}]});
  const candidates=participantMealCandidates(source,obligation,tasks,[]);assert.equal(candidates[0]?.start,780);assert.ok(candidates.length>0);
});

test("both search policies publish a complete hard-valid participant meal result",()=>{
  for(const policy of ["COMPATIBILITY_PRESERVING","EXACT_CONSTRUCTIVE"] as const){const source=mainFlowVocalScenario();source.searchPolicy=policy;source.budget={bestK:20,maxBacktracks:10000,maxPatterns:10000,maxBranchExpansions:300000};source.participantMeals=[meal("source","participant-c",{start:780,end:900},45)];source.participantMealCapacity={maxSimultaneous:1};const execution=executePlannerNext(source);assert.ok(execution.result?.complete);const result=execution.result!;assert.equal(result.scheduledParticipantMeals?.length,1);const validation=validatePlan(source,result.scheduledTasks,"scheduledSetupPreparations" in result?result.scheduledSetupPreparations:[],result.scheduledSpaceMeals,result.scheduledParticipantMeals);assert.equal(validation.hardValid,true,validation.reasonCodes.join(","));}
});
