import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import type { FutureJointCompletionWitnessV1 } from "./anonymousPipelineWitness";
import { revalidateJointCompletionWitness, fingerprintJointCompletionWitness } from "./jointCompletionWitness";
import { createExactSearchLedger } from "./exactMainAndFeederCore";
import { buildAssistedProblem, createPlanningScope } from "./assistedPlanning";
import { runExactItinerantPlanSearch } from "./exactItinerantPlan";

function fixture(){
  const availability=[{start:0,end:60}];
  const source:PlannerNextProblem={day:availability[0]!,spaces:["work","close","exit"].map(id=>({id,availability})),
    participants:["a","b"].map(id=>({id,availability})),resources:[{id:"exclusive",availability,transitionMinutes:0,presencePreference:"OFF"}],coaches:[],
    mainFlow:{spaceId:"work",preferredEnd:60,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
    auxiliaryPolicy:{participantPresencePreference:"OFF"},
    tasks:["a","b"].flatMap(id=>[
      {id:`prior-${id}`,kind:"auxiliary" as const,participantId:id,duration:10,spaceId:"work",dependencies:[],requiredResourceIds:["exclusive"]},
      {id:`close-${id}`,kind:"auxiliary" as const,participantId:id,duration:5,spaceId:"close",dependencies:[`prior-${id}`]},
      {id:`out-${id}`,kind:"auxiliary" as const,participantId:id,duration:5,spaceId:"exit",dependencies:[`close-${id}`]},
    ]),participantTransitionMinutes:0,resourceTransitionMinutes:0,
    technicalChains:[{id:"chain",orderedTaskIds:["prior-a","prior-b"],adjacency:"REQUIRED",resourceContinuity:"REQUIRED",requiredResourceIds:["exclusive"]}],
    transportPolicy:{arrival:{taskIds:[],minimumGroupSize:1,maximumGroupSize:2,minGapMinutes:0,groupingWeight:0},
      departure:{taskIds:["out-a","out-b"],minimumGroupSize:1,maximumGroupSize:2,minGapMinutes:0,groupingWeight:0}},
    budget:{bestK:1,maxPatterns:20,maxBacktracks:0,maxBranchExpansions:1000}};
  const starts:Record<string,number>={"prior-a":0,"prior-b":10,"close-a":20,"close-b":25,"out-a":30,"out-b":35};
  const tasks:ScheduledTask[]=source.tasks.map(task=>({...task,start:starts[task.id]!,end:starts[task.id]!+task.duration}));
  const sign=(body:Omit<FutureJointCompletionWitnessV1,"fingerprint">):FutureJointCompletionWitnessV1=>
    ({...body,fingerprint:createHash("sha256").update(JSON.stringify(body)).digest("hex")});
  const witness=sign({kind:"JOINT_COMPLETION",version:1,tasks,preparations:[],roundPreparations:[],participantMeals:[],operationalMeals:[],spaceMeals:[]});
  return {source,tasks,witness,sign};
}

test("persisted joint signatures and task semantics survive JSON object-key reordering without accepting changed content",()=>{
  const {source,witness}=fixture(),{fingerprint:_legacy,...body}=witness;
  const signed={...body,fingerprint:fingerprintJointCompletionWitness(body)};
  const reorder=(value:any):any=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;
  const persisted=reorder(signed),before=structuredClone({source,persisted});let charges=0;
  assert.equal(revalidateJointCompletionWitness(source,persisted,[],()=>{charges++;return true;}),'PASS');
  assert.equal(charges,source.tasks.length);assert.deepEqual({source,persisted},before);
  const changed={...persisted,tasks:persisted.tasks.map((t:ScheduledTask,i:number)=>i===0?{...t,end:t.end+1}:t)};
  assert.equal(revalidateJointCompletionWitness(source,changed,[],()=>true),'STALE','changed bytes invalidate the stored signature');
  const {fingerprint:_old,...invalidBody}=changed;
  assert.equal(revalidateJointCompletionWitness(source,{...invalidBody,fingerprint:fingerprintJointCompletionWitness(invalidBody)},[],()=>true),'STALE','a fresh signature cannot override task semantics');
  assert.notEqual(fingerprintJointCompletionWitness({...body,tasks:[...body.tasks].reverse()}),signed.fingerprint,'semantic array ordering is retained');
});

test("complete joint replay is canonical, immutable, charged and rejects a changed REQUIRED chain",()=>{
  const {source,tasks,witness,sign}=fixture(),saved=structuredClone({source,witness}),ledger=createExactSearchLedger(1000);
  assert.equal(revalidateJointCompletionWitness(source,witness,[tasks[0]!],()=>ledger.consume("STANDALONE")),"PASS");
  assert.equal(ledger.branchesExplored,tasks.length);assert.deepEqual({source,witness},saved);
  const {fingerprint:_old,...body}=witness;
  const changed=sign({...body,tasks:tasks.map(task=>task.id==="prior-b"?{...task,start:15,end:25}:task)});
  assert.equal(revalidateJointCompletionWitness(source,changed,[],()=>true),"STALE");
  assert.equal(revalidateJointCompletionWitness(source,witness,[{...tasks[0]!,start:5,end:15}],()=>true),"STALE");
});

test("a valid fingerprint cannot substitute altered task semantics or omitted ancestors",()=>{
  const {source,witness,sign}=fixture();
  for(const tasks of [witness.tasks.slice(1),witness.tasks.map(task=>task.id==="prior-b"?{...task,requiredResourceIds:[]}:task)]){
    const {fingerprint:_old,...body}=witness;
    assert.equal(revalidateJointCompletionWitness(source,sign({...body,tasks}),[],()=>true),"STALE");
  }
  const ledger=createExactSearchLedger(2);
  assert.equal(revalidateJointCompletionWitness(source,witness,[],()=>ledger.consume("STANDALONE")),"BUDGET_EXHAUSTED");
  assert.equal(ledger.branchesExplored,2);
});

test("a duration refresh invalidates old joint evidence and recertifies the new scope without moving accepted work",()=>{
  const {source,tasks,witness:partialWitness,sign}=fixture(),availability=[source.day];
  source.participants.push({id:"core",availability});source.coaches=[{id:"coach",availability}];
  source.spaces.push({id:"main",availability},{id:"vocal",availability});source.mainFlow.spaceId="main";
  const vocal={id:"vocal",kind:"vocal" as const,participantId:"core",coachId:"coach",duration:5,spaceId:"vocal",dependencies:[]};
  const main={id:"main",kind:"main" as const,participantId:"core",coachId:"coach",duration:5,spaceId:"main",dependencies:[vocal.id],blockKey:"coach"};
  source.tasks.push(vocal,main);
  const core=[{...vocal,start:20,end:25},{...main,start:25,end:30}],fixed=[tasks[0]!,...core];
  const {fingerprint:_old,...body}=partialWitness,witness=sign({...body,tasks:[...tasks,...core]});
  const refreshed=structuredClone(source);refreshed.tasks.find(task=>task.id==="prior-b")!.duration=15;
  const saved=structuredClone({source,refreshed,fixed,witness}),replayLedger=createExactSearchLedger(1000);
  assert.equal(revalidateJointCompletionWitness(refreshed,witness,fixed,()=>replayLedger.consume("STANDALONE")),"STALE");
  assert.ok(replayLedger.branchesExplored>0);
  const scope=createPlanningScope({kind:"ids",value:"prior-b"},{},["prior-b"]);
  const built=buildAssistedProblem(refreshed,scope,fixed,new Set(refreshed.tasks.map(task=>task.id)),[],[],[],[],[witness]);
  const first=runExactItinerantPlanSearch(built.problem,{fixedPlacements:fixed,fixedPlacementsAsContext:true,priorFutureStructuralWitnesses:[witness]});
  const second=runExactItinerantPlanSearch(built.problem,{fixedPlacements:fixed,fixedPlacementsAsContext:true,priorFutureStructuralWitnesses:[witness]});
  assert.equal(first.status,"COMPLETE",JSON.stringify(first.evidence.reasonCodes));assert.deepEqual(first,second);
  assert.deepEqual(fixed.map(item=>first.scheduledTasks.find(task=>task.id===item.id)),fixed);
  assert.equal(first.scheduledTasks.find(task=>task.id==="prior-b")!.duration,15);
  assert.ok(first.scheduledTasks.every(task=>built.problem.tasks.some(item=>item.id===task.id)));
  const current=first.evidence.futureStructuralWitnesses.find(item=>item.kind==="JOINT_COMPLETION");
  assert.ok(current&&current.kind==="JOINT_COMPLETION");assert.notEqual(current.fingerprint,witness.fingerprint);
  const auditLedger=createExactSearchLedger(1000);
  assert.equal(revalidateJointCompletionWitness(refreshed,current,fixed,()=>auditLedger.consume("STANDALONE")),"PASS");
  assert.ok(auditLedger.branchesExplored>0);
  assert.equal(first.evidence.branchesExplored,first.evidence.coreBranches+first.evidence.standaloneBranches);
  assert.equal(built.protectedPlacements.length,fixed.length);
  assert.deepEqual({source,refreshed,fixed,witness},saved);
});

test("the complete producer cannot replan a meal outside the explicit future eligibility",()=>{
  const {source}=fixture();
  source.participantMeals=[{id:"meal",sourceTaskId:"meal-source",participantId:"a",duration:5,
    window:{start:40,end:60},status:"done"}];
  const scope=createPlanningScope({kind:"ids",value:"prior-a"},{},["prior-a"]),eligible=new Set(source.tasks.map(task=>task.id));
  const before=structuredClone(source);
  assert.equal(buildAssistedProblem(source,scope,[],eligible).problem.analyticalFutureCollectiveContinuation,undefined);
  eligible.add("meal-source");
  assert.ok(buildAssistedProblem(source,scope,[],eligible).problem.analyticalFutureCollectiveContinuation);
  assert.deepEqual(source,before);
});

test("a joint witness advances a new scope without accepting or protecting future context",()=>{
  const {source,tasks,witness}=fixture(),fixed=tasks[0]!,scope=createPlanningScope({kind:"ids",value:"prior-b"},{},["prior-b"]);
  const built=buildAssistedProblem(source,scope,[fixed],new Set(source.tasks.map(task=>task.id)),[],[],[],[],[witness]);
  const saved=structuredClone(built),run=()=>runExactItinerantPlanSearch(built.problem,{fixedPlacements:[fixed],fixedPlacementsAsContext:true,priorFutureStructuralWitnesses:[witness]});
  const first=run(),second=run();
  assert.equal(first.status,"COMPLETE");assert.deepEqual(first,second);assert.deepEqual(built,saved);
  assert.ok(first.scheduledTasks.every(task=>built.problem.tasks.some(item=>item.id===task.id)));
  assert.ok(!first.scheduledTasks.some(task=>task.id.startsWith("close-")));
  assert.deepEqual(first.scheduledTasks.find(task=>task.id===fixed.id),fixed);
  assert.equal(built.protectedPlacements.length,1);assert.equal(first.evidence.futureStructuralWitnesses[0]!.kind,"JOINT_COMPLETION");
  assert.ok(first.evidence.futureCollectiveClosureLastCertificate);assert.ok(first.evidence.branchesExplored<1000);
});

test("cold composition produces a full certificate, but individually possible conflicting ancestors do not",()=>{
  for(const conflict of [false,true]){
    const {source}=fixture(),availability=[source.day];
    source.participants.push({id:"core",availability});source.coaches=[{id:"coach",availability}];
    source.spaces.push({id:"main",availability},{id:"vocal",availability});source.mainFlow.spaceId="main";
    const vocal={id:"vocal",kind:"vocal" as const,participantId:"core",coachId:"coach",duration:5,spaceId:"vocal",dependencies:[]};
    const main={id:"main",kind:"main" as const,participantId:"core",coachId:"coach",duration:5,spaceId:"main",dependencies:[vocal.id],blockKey:"coach"};
    const current={id:"current",kind:"auxiliary" as const,participantId:"core",duration:5,spaceId:"work",dependencies:[],availability:[{start:40,end:45}]};
    source.tasks.push(vocal,main,current);
    source.tasks.filter(task=>task.id.startsWith("prior-")).forEach(task=>task.availability=[{start:0,end:conflict?10:20}]);
    const fixed=[{...vocal,start:20,end:25},{...main,start:25,end:30}];
    const scope=createPlanningScope({kind:"ids",value:current.id},{},[current.id]);
    const built=buildAssistedProblem(source,scope,fixed,new Set(source.tasks.map(task=>task.id))),saved=structuredClone(built);
    const result=runExactItinerantPlanSearch(built.problem,{fixedPlacements:fixed,fixedPlacementsAsContext:true});
    assert.deepEqual(built,saved);assert.equal(result.evidence.branchesExplored,result.evidence.coreBranches+result.evidence.standaloneBranches);
    assert.equal(result.complete,!conflict,JSON.stringify({status:result.status,reasons:result.evidence.reasonCodes,
      core:result.evidence.coreReasonCodes,terminal:result.evidence.firstTerminalCompletionRejection,
      hall:result.evidence.futureCollectiveClosureHall,pending:result.evidence.futureCollectiveClosurePendingPredecessorTaskIds}));
    if(!conflict){assert.ok(result.evidence.futureCollectiveClosureLastCertificate);
      assert.ok(result.evidence.futureStructuralWitnesses.some(witness=>witness.kind==="JOINT_COMPLETION"));
      assert.ok(result.scheduledTasks.every(task=>built.problem.tasks.some(source=>source.id===task.id)));}
    else assert.ok(!result.evidence.futureStructuralWitnesses.some(witness=>witness.kind==="JOINT_COMPLETION"));
  }
});
