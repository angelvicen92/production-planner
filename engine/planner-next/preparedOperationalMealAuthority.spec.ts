import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { PreparedOperationalMealAuthority } from "./preparedOperationalMealAuthority";

const problem=():PlannerNextProblem=>({day:{start:0,end:120},spaces:[{id:"meal",availability:[{start:0,end:120}]},{id:"other",availability:[{start:0,end:120}]}],
  resources:[],participants:[],coaches:[{id:"coach",availability:[{start:0,end:120}]}],tasks:[],participantTransitionMinutes:0,resourceTransitionMinutes:0,
  auxiliaryPolicy:{participantPresencePreference:"OFF"},budget:{bestK:1,maxBacktracks:0,maxPatterns:1,maxBranchExpansions:100},searchPolicy:"EXACT_CONSTRUCTIVE",
  operationalMealPolicies:[{id:"break:coach",window:{start:30,end:75},duration:45,resourceIds:["coach"],spaceIds:[]}]});
const task=(id:string,start:number,end:number,coachId="coach",spaceId="other"):ScheduledTask=>({id,kind:"auxiliary",coachId,duration:end-start,spaceId,dependencies:[],start,end});
const budget=()=>({remaining:100});

test("prepared operational meal prunes the task that destroys the sole individual interval",()=>{
  const p=problem(),authority=new PreparedOperationalMealAuthority(p),blocker=task("blocker",40,50);
  const probe=authority.assess([blocker],[blocker],budget(),"STANDALONE",3);
  assert.equal(probe.status,"PRUNE");assert.equal(authority.evidence.individualZeroDomainPrunes,1);
  assert.equal(authority.evidence.firstPrune?.policyId,"break:coach");assert.deepEqual(probe.remainingIntervals,[{start:30,end:40},{start:50,end:75}]);
});

test("irrelevant tasks pass without meal search",()=>{
  const p=problem(),authority=new PreparedOperationalMealAuthority(p),irrelevant={...task("irrelevant",30,75),coachId:undefined};
  assert.equal(authority.assess([irrelevant],[irrelevant],budget(),"CORE",1).status,"PASS");
  assert.equal(authority.evidence.irrelevantFastPasses,1);assert.equal(authority.evidence.branchesConsumed,0);
});

test("fixed context witness survives two feeders and the third feeder is the exact causal prune",()=>{
  const p=problem();p.operationalMealPolicies![0]={...p.operationalMealPolicies![0]!,window:{start:0,end:120},duration:45};
  const authority=new PreparedOperationalMealAuthority(p),main=task("protected-main",0,10),f1=task("f1",20,30),
    f2=task("f2",50,70),f3=task("f3",90,100);
  assert.equal(authority.initializeFixedContext([main],budget()).complete,true);
  assert.equal(authority.assess([main,f1],[f1],budget(),"CORE",1).status,"PASS");
  assert.equal(authority.assess([main,f1,f2],[f2],budget(),"CORE",2).status,"PASS");
  const probe=authority.assess([main,f1,f2,f3],[f3],budget(),"CORE",3);
  assert.equal(probe.status,"PRUNE");assert.equal(probe.causality,"CAUSED_BY_ADDED_TASK");
  assert.equal(authority.evidence.firstPrune?.causingTaskId,"f3");
  assert.equal(authority.evidence.fixedContextWitnessFound,true);
});

test("preexisting zero domain is not falsely attributed to the current task",()=>{
  const p=problem();p.coaches.push({id:"other-coach",availability:[{start:0,end:120}]});
  p.operationalMealPolicies!.push({id:"break:other",window:{start:30,end:75},duration:45,resourceIds:["other-coach"],spaceIds:[]});
  const baseline=task("baseline",40,50),added=task("added",0,5,"other-coach");
  const authority=new PreparedOperationalMealAuthority(p),probe=authority.assess([baseline,added],[added],budget(),"STANDALONE",1);
  assert.equal(probe.status,"PRUNE");assert.equal(probe.causality,"PREEXISTING_ZERO_DOMAIN");
  assert.equal(authority.evidence.firstPrune?.causingTaskId,null);
});

test("technical-chain work without the coach resource fast-passes the coach meal",()=>{
  const p=problem(),authority=new PreparedOperationalMealAuthority(p);
  const technical:ScheduledTask={id:"technical",kind:"technical",duration:45,spaceId:"other",dependencies:[],start:30,end:75};
  assert.equal(authority.assess([technical],[technical],budget(),"CORE",1).status,"PASS");
  assert.equal(authority.evidence.irrelevantFastPasses,1);
});

test("a valid last witness is reused without exact search",()=>{
  const p=problem(),authority=new PreparedOperationalMealAuthority(p),first=task("first",0,5);
  assert.equal(authority.assess([first],[first],budget(),"CORE",1).status,"PASS");const branches=authority.evidence.branchesConsumed;
  const second=task("second",80,85);assert.equal(authority.assess([first,second],[second],budget(),"CORE",2).status,"PASS");
  assert.equal(authority.evidence.witnessReuseHits,1);assert.equal(authority.evidence.branchesConsumed,branches);
});

test("an invalidated witness is repaired when another interval remains",()=>{
  const p=problem();p.operationalMealPolicies![0]={...p.operationalMealPolicies![0]!,window:{start:0,end:120},duration:45};
  const authority=new PreparedOperationalMealAuthority(p),seed=task("seed",110,115);
  assert.equal(authority.assess([seed],[seed],budget(),"CORE",1).status,"PASS");
  const breaker=task("breaker",20,30);assert.equal(authority.assess([seed,breaker],[breaker],budget(),"CORE",2).status,"PASS");
  assert.equal(authority.evidence.witnessInvalidations,1);assert.equal(authority.evidence.witnessRepairs,1);
});

test("individual domains can pass while exact collective feasibility prunes",()=>{
  const p=problem();p.operationalMealPolicies=[
    {id:"a",window:{start:30,end:75},duration:45,resourceIds:["coach"],spaceIds:[]},
    {id:"b",window:{start:30,end:75},duration:45,resourceIds:["coach"],spaceIds:[]},
  ];const authority=new PreparedOperationalMealAuthority(p),impact=task("impact",0,5);
  const probe=authority.assess([impact],[impact],budget(),"STANDALONE",1);
  assert.equal(probe.status,"PRUNE");assert.equal(authority.evidence.individualZeroDomainPrunes,0);assert.equal(authority.evidence.exactCollectiveChecks,1);
});

test("terminal materialization reuses the prepared witness",()=>{
  const p=problem(),authority=new PreparedOperationalMealAuthority(p),impact=task("impact",0,5);
  assert.equal(authority.assess([impact],[impact],budget(),"CORE",1).status,"PASS");
  assert.equal(authority.materialize([impact],budget()).complete,true);assert.equal(authority.evidence.terminalSearchesAvoided,1);
});
