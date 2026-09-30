import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { canPlaceTask, exactTaskStartDomain } from "./placement";
import { participantGapMinutes } from "./participantTransition";
import { validatePlan } from "./validate";

const task = (id:string, spaceId="a", margins:Partial<Task>={}):Task => ({
  id, kind:"auxiliary", participantId:"p", duration:10, spaceId, dependencies:[], ...margins,
} as Task);
const problem = (tasks:Task[]):PlannerNextProblem => ({
  day:{start:0,end:100}, spaces:[{id:"a",availability:[{start:0,end:100}]},{id:"b",availability:[{start:0,end:100}]}],
  resources:[],participants:[{id:"p",availability:[{start:0,end:100}]}],coaches:[],tasks,
  mainFlow:{spaceId:"b",preferredEnd:100,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
  participantTransitionMinutes:5,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:1,maxPatterns:1,maxBranchExpansions:10},
  auxiliaryPolicy:{participantPresencePreference:"OFF"},
});
const scheduled=(value:Task,start:number):ScheduledTask=>({...value,start,end:start+value.duration});

test("canonical participant gap preserves explicit zero and takes max of concrete overrides",()=>{
  const p=problem([]), plainA=task("plain-a"),plainB=task("plain-b");
  assert.equal(participantGapMinutes(p,plainA,plainB),5);
  assert.equal(participantGapMinutes(p,task("a", "a",{participantMarginAfterMinutes:0}),plainB),0);
  assert.equal(participantGapMinutes(p,plainA,task("b","b",{participantMarginBeforeMinutes:0})),0);
  assert.equal(participantGapMinutes(p,task("a","a",{participantMarginAfterMinutes:0}),task("b","b",{participantMarginBeforeMinutes:0})),0);
  assert.equal(participantGapMinutes(p,task("a","a",{participantMarginAfterMinutes:0}),task("b","b",{participantMarginBeforeMinutes:30})),30);
  assert.equal(participantGapMinutes(p,task("a","a",{participantMarginAfterMinutes:30}),task("b","b",{participantMarginBeforeMinutes:0})),30);
});

test("domain, placement and validator agree for same-space participant boundaries",()=>{
  const previous=task("previous","a",{participantMarginAfterMinutes:0});
  const next=task("next","a",{participantMarginBeforeMinutes:0});
  const p=problem([previous,next]),placed=[scheduled(previous,0)];
  assert.deepEqual([...exactTaskStartDomain(p,next,placed).starts()].slice(0,2),[10,15]);
  assert.equal(canPlaceTask(p,next,10,placed),true);
  assert.equal(validatePlan(p,[...placed,scheduled(next,10)],[],[],[]).hardValid,true);
  const plain=problem([task("previous"),task("next")]),plainPlaced=[scheduled(plain.tasks[0]!,0)];
  assert.equal(canPlaceTask(plain,plain.tasks[1]!,10,plainPlaced),false);
  assert.equal(validatePlan(plain,[...plainPlaced,scheduled(plain.tasks[1]!,10)],[],[],[]).hardValid,false);
});

test("INCLUDED anchored phases have no internal participant buffer",()=>{
  const before=task("before"),anchor=task("anchor"),after=task("after");
  const p={...problem([before,anchor,after]),anchoredAccompaniments:[{id:"op",anchorTaskId:"anchor",beforeTaskIds:["before"],afterTaskIds:["after"],adjacency:"REQUIRED",internalTransition:"INCLUDED",resourceContinuity:"REQUIRED"}] } satisfies PlannerNextProblem;
  assert.equal(participantGapMinutes(p,before,anchor),0);
  assert.equal(participantGapMinutes(p,anchor,after),0);
});
