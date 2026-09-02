import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { checkMacroPendingPrerequisites, checkStandaloneCoreFrontier } from "./macroPendingPrerequisiteForwardCheck";

const task=(id:string,duration:number,dependencies:string[]=[],availability?:Array<{start:number;end:number}>):Task=>({id,kind:"auxiliary",participantId:"person",duration,spaceId:"room",dependencies,...(availability?{availability}: {})});
const problem=(tasks:Task[]):PlannerNextProblem=>({day:{start:0,end:100},spaces:[{id:"room",availability:[{start:0,end:100}]},{id:"other",availability:[{start:0,end:100}]}],resources:[],participants:[{id:"person",availability:[{start:0,end:100}]},{id:"other",availability:[{start:0,end:100}]}],coaches:[],tasks,mainFlow:{spaceId:"other",preferredEnd:100,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:0,maxPatterns:1,maxBranchExpansions:1000},searchPolicy:"EXACT_CONSTRUCTIVE"});
const scheduled=(source:Task,start:number,overrides:Partial<ScheduledTask>={}):ScheduledTask=>({...source,start,end:start+source.duration,...overrides});

test("a macro preserves an alternative prerequisite hole and prunes only the last hole",()=>{const prerequisite=task("prerequisite",10,[],[{start:20,end:30},{start:40,end:50}]),successor=task("successor",10,[prerequisite.id]);const p=problem([prerequisite,successor]);const placed=[scheduled(successor,60),scheduled(task("first-blocker",10),20)];
 const unrelated=scheduled(task("neutral",5,[],undefined),70,{participantId:"other",spaceId:"other"});assert.equal(checkMacroPendingPrerequisites(p,[prerequisite],placed,[unrelated]).feasible,true);
 const last=scheduled(task("last-blocker",10),40);const blocked=checkMacroPendingPrerequisites(p,[prerequisite],placed,[last]);assert.equal(blocked.feasible,false);assert.equal(blocked.failure,"INDIVIDUAL_ZERO_DOMAIN");assert.equal(blocked.blockingTaskId,prerequisite.id);
});

test("collective capacity distinguishes one shared hole from two holes before joint search",()=>{const first=task("first",10),second=task("second",10),successor=task("successor",10,[first.id,second.id]);const p=problem([first,second,successor]);first.availability=[{start:20,end:30}];second.availability=[{start:20,end:30}];const one=checkMacroPendingPrerequisites(p,[first,second],[scheduled(successor,50)],[scheduled(task("trigger",5),70)]);assert.equal(one.failure,"COLLECTIVE_CAPACITY");assert.equal(one.collectiveCapacityChecks,1);assert.equal(one.collectiveCapacityPrunes,1);assert.equal(one.obligationsChecked,2);assert.equal(one.authorityId,"room");assert.equal(one.demandMinutes,20);assert.equal(one.freeCapacityMinutes,10);assert.deepEqual(one.overloadTaskIds,["first","second"]);assert.equal(one.jointChecks,0);
 second.availability=[{start:30,end:40}];const two=checkMacroPendingPrerequisites(p,[first,second],[scheduled(successor,50)],[scheduled(task("trigger",5),70)]);assert.equal(two.feasible,true);
});

test("fragmented exact intervals prove overload without admitting unrelated obligations",()=>{const first=task("first",10,[],[{start:0,end:10},{start:20,end:30}]),second=task("second",10,[],[{start:0,end:10},{start:20,end:30}]),third=task("third",10,[],[{start:0,end:10},{start:20,end:30}]),successor=task("successor",10,[first.id,second.id,third.id]),unrelated=task("unrelated",50,[],[{start:0,end:50}]);unrelated.spaceId="other";unrelated.participantId="other";const unrelatedSuccessor=task("unrelated-successor",10,[unrelated.id]);unrelatedSuccessor.spaceId="other";unrelatedSuccessor.participantId="other";const p=problem([first,second,third,successor,unrelated,unrelatedSuccessor]);const result=checkMacroPendingPrerequisites(p,[first,second,third,unrelated],[scheduled(successor,50),scheduled(unrelatedSuccessor,60)],[scheduled(task("trigger",5),70)]);assert.equal(result.failure,"COLLECTIVE_CAPACITY");assert.equal(result.demandMinutes,30);assert.equal(result.freeCapacityMinutes,20);assert.equal(result.obligationsChecked,3);
});

test("a pending competitor without its own early deadline enters the affected exclusive authority",()=>{const prerequisite=task("prerequisite",10,[],[{start:20,end:30}]),competitor=task("competitor",10,[],[{start:20,end:30}]),successor=task("successor",10,[prerequisite.id]);const p=problem([prerequisite,competitor,successor]);const result=checkMacroPendingPrerequisites(p,[prerequisite,competitor],[scheduled(successor,50)],[scheduled(task("trigger",5),70)]);assert.equal(result.failure,"COLLECTIVE_CAPACITY");assert.equal(result.obligationsChecked,2);assert.equal(result.demandMinutes,20);assert.equal(result.freeCapacityMinutes,10);
});

test("transitive prerequisite chains are checked jointly before the placed descendant",()=>{const a=task("a",10,[],[{start:20,end:30}]),b=task("b",10,[a.id],[{start:25,end:40}]),c=task("c",10,[b.id]);const p=problem([a,b,c]);assert.equal(checkMacroPendingPrerequisites(p,[a,b],[scheduled(c,40)],[scheduled(task("trigger",5),70)]).feasible,true);b.availability=[{start:20,end:30}];assert.equal(checkMacroPendingPrerequisites(p,[a,b],[scheduled(c,40)],[scheduled(task("trigger",5),70)]).feasible,false);
});

test("unrelated impossible ordinary work is not checked and results are order invariant",()=>{const prerequisite=task("required",10,[],[{start:20,end:30}]),successor=task("successor",10,[prerequisite.id]),unrelated=task("unrelated",10,[],[]),trigger=scheduled(task("trigger",5),70,{participantId:"other",spaceId:"other"});const p=problem([prerequisite,successor,unrelated]);const placed=[scheduled(successor,50)];const forward=checkMacroPendingPrerequisites(p,[prerequisite,unrelated],placed,[trigger]),reversed=checkMacroPendingPrerequisites({...p,tasks:[...p.tasks].reverse()},[unrelated,prerequisite],placed,[trigger]);assert.equal(forward.feasible,true);assert.deepEqual(reversed,forward);
});


test("CORE frontier proves collective standalone overload and abstains when capacity is sufficient or authorities differ",()=>{
 const standalone=(id:string,spaceId:string,participantId:string,resourceId:string,availability:Array<{start:number;end:number}>):Task=>({...task(id,30,[],availability),spaceId,participantId,requiredResourceIds:[resourceId]});
 const first=standalone("first","room","person","shared",[{start:0,end:30}]);
 const second=standalone("second","other","other","shared",[{start:0,end:30}]);
 const p={...problem([first,second]),resources:[{id:"shared",availability:[{start:0,end:100}]}]};
 const overloaded=checkStandaloneCoreFrontier(p,[first,second],[]);
 assert.equal(overloaded.failure,"COLLECTIVE_CAPACITY");assert.equal(overloaded.demandMinutes,60);assert.equal(overloaded.freeCapacityMinutes,30);assert.equal(overloaded.jointChecks,0);
 second.availability=[{start:30,end:60}];assert.equal(checkStandaloneCoreFrontier(p,[first,second],[]).feasible,true);
 second.availability=[{start:0,end:30}];second.requiredResourceIds=["separate"];p.resources.push({id:"separate",availability:[{start:0,end:100}]});
 assert.equal(checkStandaloneCoreFrontier(p,[first,second],[]).feasible,true);
});

test("analytic CORE frontier abstains before joint DFS while FULL preserves the joint proof",()=>{
 const first=task("first",10,[],[{start:20,end:30}]),second=task("second",10,[first.id],[{start:0,end:10}]);
 first.spaceId="room";first.participantId="person";second.spaceId="other";second.participantId="other";
 const p=problem([first,second]);
 const full=checkStandaloneCoreFrontier(p,[first,second],[]);
 assert.equal(full.failure,"JOINT_INFEASIBLE");assert.equal(full.jointChecks,1);
 const analytic=checkStandaloneCoreFrontier(p,[first,second],[],[],"ANALYTIC_CAPACITY_ONLY");
 assert.equal(analytic.feasible,true);assert.equal(analytic.failure,null);assert.equal(analytic.jointChecks,0);
});
