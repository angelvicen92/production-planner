import assert from "node:assert/strict";
import test from "node:test";
import {validatePlan,preflight} from "./validate";
import {exactTaskStartDomain} from "./placement";
import {runExactItinerantPlanSearch} from "./exactItinerantPlan";
import {revalidateJointCompletionWitness} from "./jointCompletionWitness";
import {materializeItinerantUnitAssignment} from "./itinerantUnitAssignment";

import type {PlannerNextProblem,ScheduledTask,Task} from "./contracts";
function stylingGeometryFixture(){
const availability=[{start:0,end:160}];
const ids=["a","b","c","d"];
const source:PlannerNextProblem={day:availability[0]!,spaces:["main","entry","close","in","out","work",...ids.map(id=>`vocal-${id}`)].map(id=>({id,availability})),
 participants:ids.map(id=>({id,availability:id==="a"?[{start:0,end:75}]:availability})),coaches:ids.map(id=>({id:`coach-${id}`,availability})),
 resources:[{id:"stylist",availability,presencePreference:"OFF",transitionMinutes:0}],
 tasks:ids.flatMap(id=>[
 {id:`in-${id}`,kind:"auxiliary",participantId:id,duration:5,spaceId:"in",dependencies:[]},
 {id:`entry-${id}`,kind:"auxiliary",participantId:id,duration:20,spaceId:"entry",requiredResourceIds:["stylist"],dependencies:[`in-${id}`]},
 {id:`vocal-${id}`,kind:"vocal",participantId:id,coachId:`coach-${id}`,duration:15,spaceId:`vocal-${id}`,dependencies:[`in-${id}`]},
 {id:`main-${id}`,kind:"main",participantId:id,coachId:`coach-${id}`,duration:15,spaceId:"main",blockKey:`coach-${id}`,dependencies:[`entry-${id}`,`vocal-${id}`]},
 {id:`work-${id}`,kind:"auxiliary",participantId:id,duration:5,spaceId:"work",dependencies:[`main-${id}`]},
 {id:`close-${id}`,kind:"auxiliary",participantId:id,duration:5,spaceId:"close",requiredResourceIds:["stylist"],dependencies:[`work-${id}`,`entry-${id}`]},
 {id:`out-${id}`,kind:"auxiliary",participantId:id,duration:5,spaceId:"out",dependencies:[`close-${id}`]},
 ] as Task[]),mainFlow:{spaceId:"main",preferredEnd:150,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
 participantTransitionMinutes:0,resourceTransitionMinutes:0,auxiliaryPolicy:{participantPresencePreference:"OFF"},
 transportPolicy:{arrival:{taskIds:ids.map(id=>`in-${id}`),minimumGroupSize:1,maximumGroupSize:4,targetGroupSize:4,minGapMinutes:0,groupingWeight:0},
 departure:{taskIds:ids.map(id=>`out-${id}`),minimumGroupSize:1,maximumGroupSize:4,targetGroupSize:1,minGapMinutes:0,groupingWeight:0}},
 budget:{bestK:1,maxPatterns:20,maxBacktracks:0,maxBranchExpansions:10000},searchPolicy:"EXACT_CONSTRUCTIVE"};
const starts:Record<string,number>={};
for(const [i,id] of ids.entries()){starts[`in-${id}`]=0;starts[`vocal-${id}`]=id==="b"?25:5;starts[`main-${id}`]=45+i*15;starts[`work-${id}`]=60+i*15;starts[`close-${id}`]=65+i*15;starts[`out-${id}`]=70+i*15;}
Object.assign(starts,{"entry-b":5,"entry-a":25,"entry-c":45,"entry-d":65,"close-b":90,"out-b":95});
for(const task of source.tasks){const start=starts[task.id]!;task.availability=[{start,end:start+task.duration+(task.id==="entry-d"?5:0)}];}
const schedule=(times:Record<string,number>):ScheduledTask[]=>source.tasks.map(task=>({...task,start:times[task.id]!,end:times[task.id]!+task.duration}));
const contiguous=schedule(starts),interleaved=schedule({...starts,"entry-d":70});
const contiguousValidation=validatePlan(source,contiguous),interleavedValidation=validatePlan(source,interleaved);

const provisional=contiguous.filter(task=>task.kind==="main"||task.kind==="vocal"||task.id.startsWith("entry-")||task.id.startsWith("in-"));
const protectedPlacements=contiguous.filter(task=>task.id==="main-a"||task.id==="work-a");
assert.deepEqual(interleaved.filter(task=>protectedPlacements.some(fixed=>fixed.id===task.id)),protectedPlacements);
const close=source.tasks.find(task=>task.id==="close-a")!;
assert.equal(exactTaskStartDomain(source,close,[...provisional,...protectedPlacements.filter(task=>!provisional.some(p=>p.id===task.id))]).eligibleStartCount,0);
const core=provisional.filter(task=>task.kind==="main"||task.kind==="vocal");
return {source,contiguous,interleaved,contiguousValidation,interleavedValidation,protectedPlacements,provisional,core};
}
function runFixture(source:PlannerNextProblem,bundle:ScheduledTask[],fixed:ScheduledTask[],causalDiagnostic=false){
 const ids=["a","b","c","d"];
 const problem={...source,analyticalFutureCollectiveContinuation:source,analyticalFutureParticipantTasks:source.tasks.filter(task=>task.id.startsWith("close-")),analyticalFutureParticipantSupportingTaskIds:source.tasks.map(task=>task.id)}
 return runExactItinerantPlanSearch(problem,{causalDiagnostic,fixedPlacements:fixed,fixedPlacementsAsContext:true,preferredBundleCandidate:{scheduledTasks:bundle,matching:new Map(ids.map((id,i)=>[`main-${id}`,i])),forbiddenEdges:new Set()},preferredArchitecture:{pattern:ids.map(id=>`coach-${id}`),slots:ids.map((_,i)=>45+i*15)}});
}

test("rejected contiguous supporting is repaired through the exact joint continuation without moving accepted work",()=>{
 const {source,provisional,protectedPlacements,interleaved,contiguousValidation,interleavedValidation}=stylingGeometryFixture();
 assert.deepEqual(preflight(source),[]);
 assert.equal(contiguousValidation.hardValid,false);
 assert.ok(contiguousValidation.violations.some(v=>v.ruleCode==="RESOURCE_OVERLAP_VIOLATION"&&v.affectedTaskIds.includes("close-a")));
 assert.equal(interleavedValidation.hardValid,true);
 const saved=structuredClone(source),first=runFixture(source,provisional,protectedPlacements),second=runFixture(source,provisional,protectedPlacements);
 assert.deepEqual(first,second);assert.deepEqual(source,saved);
 const diagnosed=runFixture(source,provisional,protectedPlacements,true);
 assert.equal(diagnosed.status,first.status);
 assert.deepEqual(diagnosed.scheduledTasks,first.scheduledTasks);
 assert.deepEqual(diagnosed.evidence.futureStructuralWitnesses,first.evidence.futureStructuralWitnesses);
 for(const field of ["branchesExplored","coreBranches","standaloneBranches","firstSupportingGeometryRepair"] as const)
  assert.deepEqual(diagnosed.evidence[field],first.evidence[field]);
 assert.deepEqual(source,saved);
 assert.equal(first.status,"COMPLETE",JSON.stringify({reasons:first.reasonCodes,repair:first.evidence.firstSupportingGeometryRepair}));
 assert.equal(first.evidence.supportingGeometryRepairSuccesses,1);
 assert.equal(first.evidence.branchesExplored,first.evidence.coreBranches+first.evidence.standaloneBranches);
 assert.ok(first.evidence.branchesExplored<=source.budget.maxBranchExpansions);
 assert.equal(first.scheduledTasks.find(t=>t.id==="entry-d")!.start,70);
 assert.deepEqual(first.scheduledTasks.filter(task=>protectedPlacements.some(p=>p.id===task.id)),protectedPlacements);
 assert.equal(validatePlan(source,first.scheduledTasks).hardValid,true);
 const joint=first.evidence.futureStructuralWitnesses.find(w=>w.kind==="JOINT_COMPLETION");
 assert.ok(joint&&joint.kind==="JOINT_COMPLETION");
 assert.equal(revalidateJointCompletionWitness(source,joint,protectedPlacements,()=>true),"PASS");
 const support=first.evidence.futureStructuralWitnesses.find(w=>w.kind==="FIXED_SUPPORTING_PIPELINE");
 assert.ok(support&&support.kind==="FIXED_SUPPORTING_PIPELINE");
 assert.equal(support.ephemeralSupportingPlacements.find(t=>t.id==="entry-d")!.start,70);
 assert.ok(first.evidence.futureCollectiveClosureLastCertificate);
 for(const placement of first.evidence.acceptedSupportingPlacements){
  const actual=first.scheduledTasks.find(task=>task.id===placement.id)!;
  assert.equal(placement.start,actual.start);assert.equal(placement.end,actual.end);
 }
 assert.equal(first.evidence.firstSupportingGeometryRepair!.capacityBlockedTaskId,"close-a");
 assert.ok(first.evidence.firstSupportingGeometryRepair!.deferredTaskIds.includes("entry-d"));
 assert.ok(!first.evidence.firstSupportingGeometryRepair!.deferredTaskIds.includes("main-a"));
});

test("supporting repair preserves accepted entry and cannot manufacture proof on budget exhaustion",()=>{
 const {source,provisional,protectedPlacements}=stylingGeometryFixture();
 const accepted=[...protectedPlacements,...provisional.filter(t=>t.id==="entry-d")];
 const blocked=runFixture(source,provisional,accepted);
 assert.equal(blocked.complete,false);
 assert.equal(blocked.evidence.supportingGeometryRepairAttempts,0);
 assert.equal(blocked.evidence.firstSupportingGeometryRepair,null);
 assert.ok(!blocked.evidence.futureStructuralWitnesses.some(w=>w.kind==="JOINT_COMPLETION"));
 source.budget.maxBranchExpansions=10;
 const exhausted=runFixture(source,provisional,protectedPlacements);
 assert.equal(exhausted.status,"BRANCH_BUDGET_EXHAUSTED");
 assert.equal(exhausted.evidence.branchesExplored,10);
 assert.equal(exhausted.evidence.branchesExplored,exhausted.evidence.coreBranches+exhausted.evidence.standaloneBranches);
 assert.ok(!exhausted.evidence.futureStructuralWitnesses.some(w=>w.kind==="JOINT_COMPLETION"));
});


test("provisional IN is recomposed, while an accepted arrival is never relocated",()=>{
 const {source,provisional,protectedPlacements}=stylingGeometryFixture();
 source.tasks.find(t=>t.id==="in-d")!.availability=[{start:0,end:25}];
 source.tasks.find(t=>t.id==="vocal-d")!.availability=[{start:35,end:50}];
 const nominal=provisional.map(task=>task.id==="in-d"?{...task,availability:[{start:0,end:25}],start:20,end:25}
   :task.id==="vocal-d"?{...task,availability:[{start:35,end:50}],start:35,end:50}:task);
 const repaired=runFixture(source,nominal,protectedPlacements);
 assert.equal(repaired.status,"COMPLETE");
 assert.equal(repaired.scheduledTasks.find(t=>t.id==="in-d")!.start,0);
 assert.equal(repaired.scheduledTasks.find(t=>t.id==="entry-d")!.start,70);
 assert.equal(validatePlan(source,repaired.scheduledTasks).hardValid,true);
 const acceptedArrival=nominal.find(t=>t.id==="in-d")!;
 const fixed=[...protectedPlacements,acceptedArrival],before=structuredClone(fixed);
 const retained=runFixture(source,nominal,fixed);
 assert.deepEqual(fixed,before);
 assert.ok(!retained.evidence.firstSupportingGeometryRepair!.deferredTaskIds.includes("in-d"));
 if(retained.complete)assert.deepEqual(retained.scheduledTasks.find(t=>t.id==="in-d"),acceptedArrival);
 else assert.ok(!retained.evidence.futureStructuralWitnesses.some(w=>w.kind==="JOINT_COMPLETION"));
});


test("a nominal reject without restored entry capacity keeps the original continuation",()=>{
 const {source,provisional,protectedPlacements}=stylingGeometryFixture();
 source.tasks.find(t=>t.id==="close-a")!.availability=[{start:0,end:5}];
 const rejected=runFixture(source,provisional,protectedPlacements);
 assert.equal(rejected.complete,false);
 assert.equal(rejected.evidence.supportingGeometryRepairAttempts,0);
 assert.equal(rejected.evidence.firstSupportingGeometryRepair,null);
 assert.ok(!rejected.evidence.futureStructuralWitnesses.some(w=>w.kind==="JOINT_COMPLETION"));
});

test("repair restores deferred entry prerequisites before a future itinerant agenda",()=>{
 const {source,provisional,protectedPlacements,interleaved}=stylingGeometryFixture();
 const unitIds=["itinerant-team:41","itinerant-team:42"];
 source.itinerantUnits=unitIds.map(id=>({id,availability:[{start:0,end:160}]}));
 source.participants.push({id:"observer",availability:[{start:0,end:160}]});
 source.spaces.push({id:"future-space",availability:[{start:0,end:160}]});
 const member:Task={id:"future-work-d",kind:"auxiliary",participantId:"observer",spaceId:"future-space",duration:5,
   dependencies:["entry-d"],availability:[{start:65,end:100}],allowedItinerantUnitIds:unitIds};
 source.tasks.push(member);
 source.analyticalFutureItinerantAgendas=[{identity:unitIds.join("+"),unitIds,tasks:[member],prerequisiteTasks:[]}];
 const legal={...materializeItinerantUnitAssignment(source,member,unitIds[0]!)!,start:90,end:95};
 assert.equal(validatePlan(source,[...interleaved,legal]).hardValid,true);
 const before=structuredClone(source),fixed=structuredClone(protectedPlacements);
 const result=runFixture(source,provisional,protectedPlacements);
 assert.equal(result.status,"COMPLETE",JSON.stringify({reasons:result.reasonCodes,core:result.evidence.coreReasonCodes,
   repair:result.evidence.firstSupportingGeometryRepair,remaining:result.remainingTaskIds}));
 assert.equal(result.evidence.supportingGeometryRepairSuccesses,1);
 assert.equal(result.scheduledTasks.find(task=>task.id==="entry-d")!.start,70);
 const actual=result.scheduledTasks.find(task=>task.id===member.id)!;
 assert.ok(actual.start>=result.scheduledTasks.find(task=>task.id==="entry-d")!.end);
 assert.equal(validatePlan(source,result.scheduledTasks).hardValid,true);
 const witness=result.evidence.futureStructuralWitnesses.find(item=>item.kind==="JOINT_COMPLETION");
 assert.ok(witness&&witness.kind==="JOINT_COMPLETION");
 assert.equal(revalidateJointCompletionWitness(source,witness,protectedPlacements,()=>true),"PASS");
 assert.deepEqual(result.scheduledTasks.filter(task=>fixed.some(item=>item.id===task.id)),fixed);
 assert.deepEqual(source,before);assert.deepEqual(protectedPlacements,fixed);
 assert.ok(result.evidence.branchesExplored<=source.budget.maxBranchExpansions);
});
