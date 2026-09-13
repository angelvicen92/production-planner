import test from "node:test";
import assert from "node:assert/strict";
import type { PlannerNextProblem, Task } from "./contracts";
import { probeParticipantBoundaryFutureFeasibility } from "./participantPresenceFeasibility";

const all=[{start:0,end:20}];
const task=(id:string,participantId:string):Task=>({id,kind:"auxiliary",participantId,duration:10,spaceId:"styling",dependencies:[],availability:[{start:0,end:10}],participantBoundaryRole:"ENTRY_PREREQUISITE"});
const problem:PlannerNextProblem={day:{start:0,end:20},spaces:[{id:"styling",availability:all}],resources:[],participants:[{id:"a",availability:all},{id:"b",availability:all}],coaches:[],tasks:[task("a-entry","a"),task("b-entry","b")],mainFlow:{spaceId:"styling",preferredEnd:20,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:10,maxPatterns:10,maxBranchExpansions:100}};

test("individual ENTRY domains can be non-empty while collective capacity prunes",()=>{
  const result=probeParticipantBoundaryFutureFeasibility(problem,problem.tasks,[]);
  assert.deepEqual(result.candidateCountByTaskId,{"a-entry":1,"b-entry":1});
  assert.equal(result.feasible,false);assert.equal(result.collectiveCapacityPrunes,1);
});
