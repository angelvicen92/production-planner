import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "./contracts";
import { proveMainFeederArchitectureImpossible, type MainFutureDependencyCertificate } from "./mainFlowPatterns";
import { canPlaceTask } from "./placement";
import { executePlannerNext } from "./executePlannerNext";
import { coldFallbackFixture } from "../../script/demo/mainFlowSoftBlockDiagnostic";

const slots=[60,65,70,75];
function proof(problem=coldFallbackFixture(), pattern=["a","b","a","b"], fixedContext=false) {
  const mains=problem.tasks.filter(task=>task.kind==="main");
  const feeders=new Map(mains.map(main=>[main.id,problem.tasks.find(task=>task.id===main.dependencies[0])!]));
  let certificate:MainFutureDependencyCertificate|undefined;
  const reason=proveMainFeederArchitectureImpossible(problem,mains,feeders,{pattern,slots},undefined,
    value=>{certificate=value;},fixedContext);
  return {reason,certificate};
}

test("future deadline cover certifies the cold alternating architecture before nominal search",()=>{
  const {reason,certificate}=proof();
  assert.equal(reason,"FUTURE_DEPENDENCY_CAPACITY");
  assert.equal(certificate!.maximumMatchingCount,3);assert.equal(certificate!.requiredCount,4);
  assert.deepEqual(certificate!.latestEnds.slice(0,2).map(x=>x.latestEnd),[70,70]);
  assert.equal(proof(coldFallbackFixture(),["b","a","b","a"]).reason,"FUTURE_DEPENDENCY_CAPACITY");
  assert.equal(proof(coldFallbackFixture(),["a","a","b","b"]).reason,null);
});

test("one restricted identity can rematch into the early a spot",()=>{
  const p=coldFallbackFixture();p.tasks=p.tasks.filter(task=>task.id!=="finish-a2");
  assert.equal(proof(p).reason,null);
  // Each demand has an individual early edge, but two demands cannot share it.
  assert.equal(proof().certificate!.maximumMatchingCount,3);
});

test("indirect dependencies propagate represented durations and windows",()=>{
  const p=coldFallbackFixture();
  for(const task of p.tasks.filter(task=>task.id.startsWith("finish-"))) {
    task.availability=[{start:75,end:80}];task.dependencies=[`middle-${task.participantId}`];
    p.tasks.push({id:task.dependencies[0]!,kind:"auxiliary",participantId:task.participantId!,duration:5,
      spaceId:task.spaceId,dependencies:[`main-${task.participantId}`]});
  }
  assert.deepEqual(proof(p).certificate!.latestEnds.slice(0,2).map(x=>x.latestEnd),[70,70]);
});

test("canonical availability, resources and explicit participant margins constrain the bound",()=>{
  const p=coldFallbackFixture();p.participantTransitionMinutes=5;
  for(const task of p.tasks.filter(task=>task.id.startsWith("finish-"))) {
    task.availability=[{start:70,end:85}];task.requiredResourceIds=["future-resource"];
    task.participantMarginBeforeMinutes=0;
  }
  p.resources.push({id:"future-resource",availability:[{start:70,end:75}],presencePreference:"OFF"});
  assert.equal(proof(p).reason,"FUTURE_DEPENDENCY_CAPACITY");
  assert.deepEqual(proof(p).certificate!.latestEnds.slice(0,2).map(x=>x.latestEnd),[70,70]);
  for(const task of p.tasks.filter(task=>task.kind==="main"))task.participantMarginAfterMinutes=10;
  assert.deepEqual(proof(p).certificate!.latestEnds.slice(0,2).map(x=>x.latestEnd),[60,60]);
});

test("projected analytical successors remain mandatory while their unrepresented margins are relaxed",()=>{
  const p=coldFallbackFixture();
  p.analyticalFutureParticipantTasks=p.tasks.filter(task=>task.id.startsWith("finish-"));
  p.tasks=p.tasks.filter(task=>!task.id.startsWith("finish-"));p.participantTransitionMinutes=5;
  assert.equal(proof(p).reason,"FUTURE_DEPENDENCY_CAPACITY");
  assert.deepEqual(proof(p).certificate!.latestEnds.slice(0,2).map(x=>x.latestEnd),[70,70]);
});

test("missing authority, open unit assignments and cycles abstain without speculative future pruning",()=>{
  for(const change of [
    (task:Task)=>{task.spaceId="unrepresented";},
    (task:Task)=>{task.dependencies.push("unrepresented");},
    (task:Task)=>{task.allowedItinerantUnitIds=["u1","u2"];},
    (task:Task)=>{task.dependencies.push(task.id);},
  ]) {
    const p=coldFallbackFixture();for(const task of p.tasks.filter(task=>task.id.startsWith("finish-")))change(task);
    const result=proof(p);assert.equal(result.reason,null);assert.equal(result.certificate!.status,"ABSTAIN");
  }
});

test("fixed Assisted context abstains and accepted Main geometry remains immutable",()=>{
  assert.equal(proof(coldFallbackFixture(),["a","b","a","b"],true).certificate!.status,"ABSTAIN");
  const p=coldFallbackFixture();const initial=executePlannerNext(p);assert.equal(initial.kind,"EXACT_CONSTRUCTIVE");
  if(initial.kind!=="EXACT_CONSTRUCTIVE")return;
  const fixed=initial.result.scheduledTasks.filter(task=>task.kind==="main"||task.kind==="vocal");
  const before=JSON.stringify(fixed);
  const result=executePlannerNext(p,{fixedPlacements:fixed,fixedPlacementsAsContext:true});
  assert.equal(result.kind,"EXACT_CONSTRUCTIVE");if(result.kind!=="EXACT_CONSTRUCTIVE")return;
  assert.equal(result.result.complete,true);
  for(const task of fixed)assert.deepEqual(result.result.scheduledTasks.find(x=>x.id===task.id),task);
  assert.equal(JSON.stringify(fixed),before);
});

test("bound is deterministic and preserves every exhaustively checked feasible nominal assignment",()=>{
  const p=coldFallbackFixture();const mains=p.tasks.filter(task=>task.kind==="main");
  const permutations=(tasks:Task[]):Task[][]=>tasks.length?tasks.flatMap((t,i)=>permutations(tasks.filter((_,j)=>i!==j)).map(rest=>[t,...rest])):[[]];
  let valid=0;
  for(const order of permutations(mains)) {
    const placed=order.map((task,i)=>({...task,start:slots[i]!,end:slots[i]!+task.duration}));
    const futures=p.tasks.filter(task=>task.id.startsWith("finish-"));
    if(futures.every(task=>canPlaceTask(p,task,70,placed))) {
      valid++;assert.equal(proof(p,order.map(task=>task.blockKey!)).reason,null);
    }
  }
  assert.equal(valid,4);
  const reversed=structuredClone(p);reversed.tasks.reverse();
  assert.deepEqual(proof(reversed),proof(p));assert.deepEqual(proof(p),proof(p));
});
