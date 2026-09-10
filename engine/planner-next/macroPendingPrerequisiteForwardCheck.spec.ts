import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { checkMacroPendingPrerequisites, checkStandaloneCoreFrontier, evaluateTargetCollectiveCapacityCertificate } from "./macroPendingPrerequisiteForwardCheck";
import { assessAnonymousPostInCompletions } from "./transportGrouping";

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

test("terminal deadline bounds do not materialize productive occupations",()=>{
 const prerequisite=task("prerequisite",10,[],[{start:0,end:10}]);
 const competitor=task("competitor",10,[],[{start:20,end:30}]);
 const terminal=task("terminal",20,[prerequisite.id]);
 const p=problem([prerequisite,competitor,terminal]);
 const result=checkMacroPendingPrerequisites(p,[prerequisite,competitor],[],[],[],undefined,
   "AFFECTED_PREREQUISITES","ANALYTIC_CAPACITY_ONLY",new Map([[terminal.id,20]]));
 assert.equal(result.feasible,true);
 assert.equal(result.individualDomainChecks,1);
});

test("pending successors' latest hard starts expose collective overload while exact capacity stays open",()=>{
 const first=task("first",15),second=task("second",15),firstSuccessor=task("first-successor",10,[first.id],[{start:20,end:30}]),secondSuccessor=task("second-successor",10,[second.id],[{start:20,end:30}]);
 firstSuccessor.spaceId="other";firstSuccessor.participantId="other";secondSuccessor.spaceId="successor-space";secondSuccessor.participantId="successor-person";
 const p=problem([first,second,firstSuccessor,secondSuccessor]);
 p.spaces.push({id:"successor-space",availability:[{start:0,end:100}]});p.participants.push({id:"successor-person",availability:[{start:0,end:100}]});
 const overloaded=checkStandaloneCoreFrontier(p,[first,second,firstSuccessor,secondSuccessor],[],[],"ANALYTIC_CAPACITY_ONLY");
 assert.equal(overloaded.failure,"COLLECTIVE_CAPACITY");assert.equal(overloaded.demandMinutes,30);assert.equal(overloaded.freeCapacityMinutes,20);
 first.duration=second.duration=10;
 const exact=checkStandaloneCoreFrontier(p,[first,second,firstSuccessor,secondSuccessor],[],[],"ANALYTIC_CAPACITY_ONLY");
 assert.equal(exact.feasible,true);assert.equal(exact.collectiveCapacityPrunes,0);
 secondSuccessor.availability=[{start:20,end:60}];
 assert.equal(checkStandaloneCoreFrontier(p,[first,second,firstSuccessor,secondSuccessor],[],[],"ANALYTIC_CAPACITY_ONLY").feasible,true);
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

test("domain-aware CORE frontier proves an impossible pending precedence before joint DFS",()=>{
 const first=task("first",10,[],[{start:20,end:30}]),second=task("second",10,[first.id],[{start:0,end:10}]);
 first.spaceId="room";first.participantId="person";second.spaceId="other";second.participantId="other";
 const p=problem([first,second]);
 const full=checkStandaloneCoreFrontier(p,[first,second],[]);
 assert.equal(full.failure,"INDIVIDUAL_ZERO_DOMAIN");assert.equal(full.jointChecks,0);
 const analytic=checkStandaloneCoreFrontier(p,[first,second],[],[],"ANALYTIC_CAPACITY_ONLY");
 assert.equal(analytic.feasible,false);assert.equal(analytic.failure,"INDIVIDUAL_ZERO_DOMAIN");assert.equal(analytic.jointChecks,0);
});

test("target collective-capacity replay compares the same authority and overload tasks before and after",()=>{
 const first=task("first",10,[],[{start:0,end:20}]),second=task("second",10,[],[{start:0,end:20}]),p=problem([first,second]);
 const before=evaluateTargetCollectiveCapacityCertificate(p,[first,second],[],[],[],"room",["second","first"]);
 const after=evaluateTargetCollectiveCapacityCertificate(p,[first,second],[],[scheduled(task("candidate",10),10)],[],"room",["first","second"]);
 assert.equal(before.evaluated,true);assert.equal(before.overloaded,false);assert.deepEqual(before.overloadTaskIds,["first","second"]);
 assert.deepEqual(after,{evaluated:true,overloaded:true,authorityId:"room",demandMinutes:20,freeCapacityMinutes:10,overloadTaskIds:["first","second"]});
});

test("target replay reports a preexisting overload and abstains when the exact target is unavailable",()=>{
 const first=task("first",10,[],[{start:0,end:10}]),second=task("second",10,[],[{start:0,end:10}]),p=problem([first,second]);
 const snapshot=JSON.stringify(p),before=evaluateTargetCollectiveCapacityCertificate(p,[first,second],[],[],[],"room",["first","second"]);
 const after=evaluateTargetCollectiveCapacityCertificate(p,[first,second],[],[scheduled(task("candidate",10),20)],[],"room",["first","second"]);
 assert.equal(before.overloaded,true);assert.deepEqual(after,before);assert.equal(JSON.stringify(p),snapshot);
 assert.deepEqual(evaluateTargetCollectiveCapacityCertificate(p,[first],[],[],[],"room",["first","second"]),
   {evaluated:false,overloaded:false,authorityId:"room",demandMinutes:null,freeCapacityMinutes:null,overloadTaskIds:["first","second"]});
});

function pendingArrivalFixture(count=4,{maximum=3,target=3,heterogeneous=false}:{maximum?:number;target?:number;heterogeneous?:boolean}={}){
 const day=[{start:0,end:120}];
 const arrivals=Array.from({length:count},(_,index):Task=>({id:`in-${index}`,kind:"auxiliary",participantId:`p-${index}`,
  duration:5,spaceId:"arrival",dependencies:[],availability:heterogeneous&&index===count-1?[{start:10,end:120}]:day}));
 const previous=arrivals.map((arrival,index):Task=>({id:`previous-${index}`,kind:"auxiliary",participantId:arrival.participantId,
  duration:5,spaceId:`work-${index}`,dependencies:[arrival.id],availability:day}));
 const anchors=previous.map((item,index):Task=>({id:`anchor-${index}`,kind:"auxiliary",participantId:item.participantId,
  duration:5,spaceId:"work",dependencies:[item.id],availability:day}));
 const p:PlannerNextProblem={...problem([...arrivals,...previous,...anchors]),day:{start:0,end:120},
  spaces:[{id:"arrival",availability:day},{id:"work",availability:day},{id:"other",availability:day},
   ...previous.map((_,index)=>({id:`work-${index}`,availability:day}))],
  participants:arrivals.map(item=>({id:item.participantId!,availability:day})),
  transportPolicy:{arrival:{taskIds:arrivals.map(({id})=>id),minimumGroupSize:1,maximumGroupSize:maximum,targetGroupSize:target,minGapMinutes:30,groupingWeight:1},
   departure:{taskIds:[],minimumGroupSize:1,maximumGroupSize:1,minGapMinutes:0,groupingWeight:1}}};
 const check=(cutoffs:number[])=>checkMacroPendingPrerequisites(p,[...arrivals,...previous],
  anchors.map((item,index)=>scheduled(item,cutoffs[index]!+5)),[],[],undefined,"ALL_PENDING");
 return{p,arrivals,previous,anchors,check};
}

test("pending IN deadlines use anonymous POST-IN hard capacity before exact prerequisite DFS",()=>{
 const f=pendingArrivalFixture();
 assert.equal(f.check([5,5,5,35]).feasible,true);
 const pruned=f.check([5,5,5,34]);
 assert.equal(pruned.failure,"PENDING_ARRIVAL_DEADLINE");assert.equal(pruned.jointChecks,0);
 assert.equal(pruned.exactPrerequisiteSearchesAvoided,1);
 assert.deepEqual(pruned.pendingArrivalDeadline?.firstCertificate,
  {cutoff:30,demand:4,maximumPossible:3,participantIds:["p-0","p-1","p-2","p-3"]});
});

test("pending IN capacity uses hard maximum and heterogeneous equivalent-before-cutoff domains",()=>{
 const target=pendingArrivalFixture(3,{maximum:3,target:1});assert.equal(target.check([5,5,5]).feasible,true);
 const permuted=pendingArrivalFixture();const first=permuted.check([5,5,5,34]);
 permuted.p.tasks.reverse();permuted.p.transportPolicy!.arrival.taskIds.reverse();
 assert.deepEqual(permuted.check([34,5,5,5]).pendingArrivalDeadline?.firstCertificate,first.pendingArrivalDeadline?.firstCertificate);
 const heterogeneous=pendingArrivalFixture(4,{heterogeneous:true}).check([5,5,5,34]);
 assert.equal(heterogeneous.failure,"PENDING_ARRIVAL_DEADLINE");assert.equal(heterogeneous.pendingArrivalDeadline?.checked,true);
});

test("a relevant heterogeneous domain difference keeps the anonymous bound optimistic",()=>{
 const f=pendingArrivalFixture(4,{maximum:2});
 for(const arrival of f.arrivals.slice(0,3))arrival.availability=[{start:0,end:5}];
 f.arrivals[3]!.availability=[{start:0,end:120}];
 const result=assessAnonymousPostInCompletions(f.p,new Map(f.arrivals.map((arrival)=>[arrival.participantId!,40])));
 assert.equal(result.feasible,true);assert.equal(result.checked,true);assert.equal(result.prunes,0);
});

test("pending IN deadlines follow only explicit dependency IDs, never task names or kinds",()=>{
 const f=pendingArrivalFixture();for(const item of f.previous)item.dependencies=[];
 const result=f.check([5,5,5,34]);assert.equal(result.feasible,true);assert.equal(result.pendingArrivalDeadline?.checked,false);
});
