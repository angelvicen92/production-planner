import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { materializeParticipantBoundaries } from "./participantBoundaryMaterialization";

function fixture(): { problem:PlannerNextProblem; productive:ScheduledTask[] } {
  const tasks:Task[]=[
    {id:"arrival",kind:"auxiliary",participantId:"p",duration:5,spaceId:"van",dependencies:[]},
    {id:"arbitrary-alpha",kind:"auxiliary",participantId:"p",duration:10,spaceId:"shared",dependencies:["arrival"],participantBoundaryRole:"ENTRY_PREREQUISITE"},
    {id:"work",kind:"auxiliary",participantId:"p",duration:10,spaceId:"work",dependencies:["arbitrary-alpha"]},
    {id:"arbitrary-omega",kind:"auxiliary",participantId:"p",duration:5,spaceId:"shared",dependencies:["work"],participantBoundaryRole:"EXIT_PREREQUISITE"},
    {id:"departure",kind:"auxiliary",participantId:"p",duration:5,spaceId:"van",dependencies:["arbitrary-omega"]},
  ];
  const availability=[{start:0,end:60}];
  return {problem:{day:{start:0,end:60},spaces:["van","shared","work"].map(id=>({id,availability})),resources:[],
    participants:[{id:"p",availability}],coaches:[],tasks,mainFlow:{spaceId:"work",preferredEnd:30,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
    participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:1,maxPatterns:1,maxBranchExpansions:100},searchPolicy:"EXACT_CONSTRUCTIVE",
    transportPolicy:{arrival:{taskIds:["arrival"],minimumGroupSize:1,maximumGroupSize:1,minGapMinutes:0,groupingWeight:1},departure:{taskIds:["departure"],minimumGroupSize:1,maximumGroupSize:1,minGapMinutes:0,groupingWeight:1}}},
    productive:[{...tasks[2]!,start:30,end:40}]};
}

test("terminal participant boundary materialization is latest-entry and earliest-exit with exact coverage",()=>{
  const {problem,productive}=fixture();
  const result=materializeParticipantBoundaries(problem,productive);
  assert.equal(result.status,"FEASIBLE");
  const byId=new Map([...productive,...result.scheduled].map(task=>[task.id,task]));
  assert.equal(byId.get("arbitrary-alpha")!.end,30);
  assert.equal(byId.get("arbitrary-omega")!.start,40);
  assert.ok(byId.get("arrival")!.end<=byId.get("arbitrary-alpha")!.start);
  assert.ok(byId.get("arbitrary-omega")!.end<=byId.get("departure")!.start);
  assert.deepEqual([...byId.keys()].sort(),problem.tasks.map(task=>task.id).sort());
});

test("boundary identity is explicit rather than inferred from id or space",()=>{
  const {problem,productive}=fixture();
  delete problem.tasks.find(task=>task.id==="arbitrary-alpha")!.participantBoundaryRole;
  const result=materializeParticipantBoundaries(problem,productive);
  assert.equal(result.status,"FEASIBLE");
  assert.equal(result.scheduled.some(task=>task.id==="arbitrary-alpha"),false);
});
