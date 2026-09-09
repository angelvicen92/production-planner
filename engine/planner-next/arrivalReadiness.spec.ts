import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { assessArrivalReadiness } from "./arrivalReadiness";

function fixture(count=4,{maximum=3,target=3,gap=30,duration=5}:{maximum?:number;target?:number;gap?:number;duration?:number}={}){
  const day=[{start:0,end:120}];
  const arrivals=Array.from({length:count},(_,index):Task=>({id:`in-${index}`,kind:"auxiliary",participantId:`p-${index}`,
    duration,spaceId:"arrival",dependencies:[],availability:day}));
  const obligations=arrivals.map((arrival,index):Task=>({id:`work-${index}`,kind:"auxiliary",participantId:arrival.participantId,
    duration:5,spaceId:"work",dependencies:[arrival.id],availability:day}));
  const problem:PlannerNextProblem={day:{start:0,end:120},spaces:[{id:"arrival",availability:day},{id:"work",availability:day}],
    resources:[],participants:arrivals.map(task=>({id:task.participantId!,availability:day})),coaches:[],tasks:[...arrivals,...obligations],
    mainFlow:{spaceId:"work",preferredEnd:120,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,
    resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:0,maxPatterns:1,maxBranchExpansions:100},searchPolicy:"EXACT_CONSTRUCTIVE",
    transportPolicy:{arrival:{taskIds:arrivals.map(task=>task.id),minimumGroupSize:1,maximumGroupSize:maximum,targetGroupSize:target,minGapMinutes:gap,groupingWeight:1},
      departure:{taskIds:[],minimumGroupSize:1,maximumGroupSize:1,minGapMinutes:0,groupingWeight:1}}};
  const placed=(starts:number[]):ScheduledTask[]=>starts.map((start,index)=>({...obligations[index]!,start,end:start+5}));
  return{problem,arrivals,placed};
}

test("three participants at 09:05 fit the first anonymous post-IN capacity",()=>{const f=fixture();assert.equal(assessArrivalReadiness(f.problem,f.placed([5,5,5])).feasible,true);});
test("a fourth participant before 09:35 is impossible",()=>{const f=fixture();const result=assessArrivalReadiness(f.problem,f.placed([5,5,5,34]));assert.equal(result.feasible,false);assert.deepEqual(result.firstCertificate,{cutoff:34,demand:4,maximumPossible:3,requiredParticipantIds:["p-0","p-1","p-2","p-3"]});});
test("a fourth participant at 09:35 fits the second group",()=>{const f=fixture();assert.equal(assessArrivalReadiness(f.problem,f.placed([5,5,5,35])).feasible,true);});
test("an obligation at 09:00 is impossible when IN lasts five minutes",()=>{const f=fixture(1);const result=assessArrivalReadiness(f.problem,f.placed([0]));assert.equal(result.feasible,false);assert.equal(result.firstCertificate?.maximumPossible,0);});
test("target group size does not reduce hard capacity",()=>{const f=fixture(3,{maximum:3,target:1});assert.equal(assessArrivalReadiness(f.problem,f.placed([5,5,5])).feasible,true);});
test("minimum gap is a separation rather than a fixed grid",()=>{const f=fixture(4,{gap:29});assert.equal(assessArrivalReadiness(f.problem,f.placed([5,5,5,34])).feasible,true);});
test("equivalent identity permutation preserves the anonymous certificate",()=>{const f=fixture();const first=assessArrivalReadiness(f.problem,f.placed([5,5,5,34]));f.problem.tasks=[...f.problem.tasks].reverse();f.problem.transportPolicy!.arrival.taskIds.reverse();const second=assessArrivalReadiness(f.problem,[...f.placed([5,5,5,34])].reverse());assert.deepEqual(second,first);});
test("a hard-domain difference abstains and never false-prunes",()=>{const f=fixture();f.arrivals[3]!.availability=[{start:10,end:120}];const result=assessArrivalReadiness(f.problem,f.placed([5,5,5,34]));assert.equal(result.feasible,true);assert.equal(result.checked,false);assert.equal(result.prunes,0);});
