import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { checkMacroPendingPrerequisites } from "./macroPendingPrerequisiteForwardCheck";

const task=(id:string,duration:number,dependencies:string[]=[],availability?:Array<{start:number;end:number}>):Task=>({id,kind:"auxiliary",participantId:"person",duration,spaceId:"room",dependencies,...(availability?{availability}: {})});
const problem=(tasks:Task[]):PlannerNextProblem=>({day:{start:0,end:100},spaces:[{id:"room",availability:[{start:0,end:100}]},{id:"other",availability:[{start:0,end:100}]}],resources:[],participants:[{id:"person",availability:[{start:0,end:100}]},{id:"other",availability:[{start:0,end:100}]}],coaches:[],tasks,mainFlow:{spaceId:"other",preferredEnd:100,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:0,maxPatterns:1,maxBranchExpansions:1000},searchPolicy:"EXACT_CONSTRUCTIVE"});
const scheduled=(source:Task,start:number,overrides:Partial<ScheduledTask>={}):ScheduledTask=>({...source,start,end:start+source.duration,...overrides});

test("a macro preserves an alternative prerequisite hole and prunes only the last hole",()=>{const prerequisite=task("prerequisite",10,[],[{start:20,end:30},{start:40,end:50}]),successor=task("successor",10,[prerequisite.id]);const p=problem([prerequisite,successor]);const placed=[scheduled(successor,60),scheduled(task("first-blocker",10),20)];
 const unrelated=scheduled(task("neutral",5,[],undefined),70,{participantId:"other",spaceId:"other"});assert.equal(checkMacroPendingPrerequisites(p,[prerequisite],placed,[unrelated]).feasible,true);
 const last=scheduled(task("last-blocker",10),40);const blocked=checkMacroPendingPrerequisites(p,[prerequisite],placed,[last]);assert.equal(blocked.feasible,false);assert.equal(blocked.failure,"INDIVIDUAL_ZERO_DOMAIN");assert.equal(blocked.blockingTaskId,prerequisite.id);
});

test("joint feasibility distinguishes one shared hole from two holes",()=>{const first=task("first",10),second=task("second",10),successor=task("successor",10,[first.id,second.id]);const p=problem([first,second,successor]);first.availability=[{start:20,end:30}];second.availability=[{start:20,end:30}];const one=checkMacroPendingPrerequisites(p,[first,second],[scheduled(successor,50)],[scheduled(task("trigger",5),70)]);assert.equal(one.failure,"JOINT_INFEASIBLE");
 second.availability=[{start:30,end:40}];const two=checkMacroPendingPrerequisites(p,[first,second],[scheduled(successor,50)],[scheduled(task("trigger",5),70)]);assert.equal(two.feasible,true);
});

test("transitive prerequisite chains are checked jointly before the placed descendant",()=>{const a=task("a",10,[],[{start:20,end:30}]),b=task("b",10,[a.id],[{start:25,end:40}]),c=task("c",10,[b.id]);const p=problem([a,b,c]);assert.equal(checkMacroPendingPrerequisites(p,[a,b],[scheduled(c,40)],[scheduled(task("trigger",5),70)]).feasible,true);b.availability=[{start:20,end:30}];assert.equal(checkMacroPendingPrerequisites(p,[a,b],[scheduled(c,40)],[scheduled(task("trigger",5),70)]).feasible,false);
});

test("unrelated impossible ordinary work is not checked and results are order invariant",()=>{const prerequisite=task("required",10,[],[{start:20,end:30}]),successor=task("successor",10,[prerequisite.id]),unrelated=task("unrelated",10,[],[]),trigger=scheduled(task("trigger",5),70,{participantId:"other",spaceId:"other"});const p=problem([prerequisite,successor,unrelated]);const placed=[scheduled(successor,50)];const forward=checkMacroPendingPrerequisites(p,[prerequisite,unrelated],placed,[trigger]),reversed=checkMacroPendingPrerequisites({...p,tasks:[...p.tasks].reverse()},[unrelated,prerequisite],placed,[trigger]);assert.equal(forward.feasible,true);assert.deepEqual(reversed,forward);
});
