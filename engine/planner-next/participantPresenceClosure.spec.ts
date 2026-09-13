import test from "node:test";
import assert from "node:assert/strict";
import type { PlannerNextProblem, Task } from "./contracts";
import { closeParticipantPresence } from "./participantPresenceClosure";

const all=[{start:0,end:60}];
const boundary=(id:string,participantId:string,role:"ENTRY_PREREQUISITE"|"EXIT_PREREQUISITE",dependencies:string[]=[]):Task=>({id,kind:"auxiliary",participantId,duration:5,spaceId:"styling",dependencies,participantBoundaryRole:role});
const base=(tasks:Task[]):PlannerNextProblem=>({day:{start:0,end:60},spaces:[{id:"styling",availability:all},{id:"work",availability:all}],resources:[],participants:[{id:"p",availability:all}],coaches:[],tasks,mainFlow:{spaceId:"work",preferredEnd:60,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:2,maxBacktracks:20,maxPatterns:20,maxBranchExpansions:100}});

test("terminal closure is deterministic and covers ENTRY/meal/EXIT exactly",()=>{
  const work:Task={id:"work",kind:"auxiliary",participantId:"p",duration:10,spaceId:"work",dependencies:["entry"]};
  const problem=base([boundary("entry","p","ENTRY_PREREQUISITE"),work,boundary("exit","p","EXIT_PREREQUISITE",["work"])]);
  problem.participantMeals=[{id:"meal",sourceTaskId:"meal-source",participantId:"p",duration:10,window:{start:15,end:45},status:"pending",dependencies:["work"]}];problem.participantMealCapacity={maxSimultaneous:1};
  const productive=[{...work,start:5,end:15}];
  const first=closeParticipantPresence(problem,productive,()=>true),second=closeParticipantPresence(problem,productive,()=>true);
  assert.equal(first.status,"COMPLETE");assert.deepEqual(first,second);
  assert.deepEqual(first.scheduledTasks.map(x=>x.id).sort(),["entry","exit","work"]);
  assert.equal(first.participantMeals.length,1);assert.equal(first.evidence.deepestTerminalStage,"COMPLETE");
});

test("budget exhaustion is not reported as no witness",()=>{
  const problem=base([boundary("entry","p","ENTRY_PREREQUISITE")]);
  assert.equal(closeParticipantPresence(problem,[],()=>false).status,"BUDGET_EXHAUSTED");
});
