import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildCanonicalA2AssistedStage1Fixture } from "../../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import { revalidateJointCompletionWitness } from "../../../engine/planner-next/jointCompletionWitness";
import { PreparedFutureCollectiveParticipantClosure } from "../../../engine/planner-next/futureCollectiveParticipantClosure";
import { materializeAssistedSnapshotOccupations } from "../../../server/assistedProposalService";
import { createExactSearchLedger } from "../../../engine/planner-next/exactMainAndFeederCore";
import { exactTaskStartDomain } from "../../../engine/planner-next/placement";
import type { AssistedPlanningSnapshotV1 } from "../../../server/assistedPlanningSnapshot";
import type { FutureJointCompletionWitnessV1 } from "../../../engine/planner-next/anonymousPipelineWitness";

const [beforeDirectory,afterDirectory,repeatDirectory,outputDirectory]=process.argv.slice(2).map(path=>resolve(path));
const read=(directory:string,name:string)=>JSON.parse(readFileSync(resolve(directory,name),"utf8"));
const before=read(beforeDirectory,"run.json"),after=read(afterDirectory,"run.json"),repeat=read(repeatDirectory,"run.json");
const snapshotsBefore:AssistedPlanningSnapshotV1[]=read(beforeDirectory,"snapshots.json"),snapshotsAfter:AssistedPlanningSnapshotV1[]=read(afterDirectory,"snapshots.json");
const withoutTimes=(run:any)=>({...run,iterations:run.iterations.map(({durationMs:_,...iteration}:any)=>iteration)});
assert.deepEqual(withoutTimes(after),withoutTimes(repeat));assert.deepEqual(snapshotsAfter,read(repeatDirectory,"snapshots.json"));
assert.deepEqual(read(beforeDirectory,"runtime.json"),read(afterDirectory,"runtime.json"));
const {input,adapter}=buildCanonicalA2AssistedStage1Fixture(),problem=adapter.problem;
const joint=(stage:any):FutureJointCompletionWitnessV1=>stage.futureStructuralWitnesses.find((w:any)=>w.kind==="JOINT_COMPLETION");
function audit(run:any,snapshots:AssistedPlanningSnapshotV1[]) {
  assert.equal(run.status,"PASS");assert.equal(run.completedObligationCount,266);assert.equal(run.stageCount,11);
  assert.equal(run.finalHardViolationCount,0);assert.equal(run.finalRequiredViolationCount,0);
  assert.equal(run.finalObligationIdsMatchSource,true);assert.equal(run.duplicateFinalIds,0);assert.equal(run.dailyTasksMatchesLastAcceptedStage,true);
  return run.iterations.map((stage:any,index:number)=>{
    const witness=joint(stage),ledger=createExactSearchLedger(problem.budget.maxBranchExpansions);
    const fixed=index?materializeAssistedSnapshotOccupations(problem,adapter.identityMap,snapshots[index-1]).protectedPlacements:[];
    const replay=revalidateJointCompletionWitness(problem,witness,fixed,()=>ledger.consume("STANDALONE"));assert.equal(replay,"PASS");
    const closure=new PreparedFutureCollectiveParticipantClosure(problem).evaluate(witness.tasks,witness.participantMeals,()=>ledger.consume("STANDALONE"),"CERTIFY",witness.spaceMeals);
    assert.equal(closure.certified,true);assert.equal(witness.tasks.length+witness.participantMeals.length,266);
    assert.equal(stage.hardRequiredValidation.hardValid,true);assert.equal(stage.hardRequiredValidation.requiredValid,true);
    assert.equal(stage.protectedEqualityProof.equal,true);assert.deepEqual(stage.acceptedSupportingPlacements,[]);
    assert.equal(stage.branchesExplored,stage.work.coreBranches+stage.work.standaloneBranches);
    assert.ok(stage.branchesExplored<=problem.budget.maxBranchExpansions);
    for(const row of (snapshots[index-1]?.tasks??[]).filter(row=>row.startPlanned!==null&&row.endPlanned!==null))assert.deepEqual(snapshots[index].tasks.find(item=>item.taskId===row.taskId),row);
    return {ordinal:stage.ordinal,branches:stage.branchesExplored,durationMs:stage.durationMs,certificate:witness.fingerprint,replay,
      completeForScope:stage.hardRequiredValidation.hardValid,reasonCodes:stage.reasonCodes,offlineAuditBranches:ledger.branchesExplored};
  });
}
const stagesBefore=audit(before,snapshotsBefore),stagesAfter=audit(after,snapshotsAfter);
const minute=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3,5));
function metrics(run:any,snapshots:AssistedPlanningSnapshotV1[]) {
  const final=snapshots.at(-1)!;
  const rowFor=(participantId:number,templateName:string)=>{
    const task=input.tasks.find(task=>task.contestantId===participantId&&task.templateName===templateName);assert.ok(task);
    const row=final.tasks.find(row=>row.taskId===task.id);assert.ok(row?.startPlanned&&row.endPlanned);
    return {id:task.id,start:minute(row.startPlanned),end:minute(row.endPlanned)};
  };
  const witness=joint(run.iterations.at(-1));
  const participantIds=[...new Set(input.tasks.filter(task=>task.templateName==="IN").map(task=>task.contestantId!))].sort((a,b)=>a-b);
  const participants=participantIds.map(participantId=>{
    const arrival=rowFor(participantId,"IN"),entry=rowFor(participantId,"ESTILISMO_ENTRADA"),exit=rowFor(participantId,"ESTILISMO_SALIDA"),out=rowFor(participantId,"OUT");
    const canonical=adapter.identityMap.find(item=>item.namespace==="task"&&Number(item.sourceId)===entry.id)!.canonicalId;
    const entryTask=witness.tasks.find(task=>task.id===canonical)!;
    const domain=exactTaskStartDomain(problem,entryTask,witness.tasks.filter(task=>task.id!==canonical),[...witness.spaceMeals]);
    const firstLocalFeasibleEntry=domain.starts().next().value??null;
    return {participantId,arrivalStart:arrival.start,arrivalEnd:arrival.end,entry:entry.start,exit:exit.start,out:out.start,
      waitInToEntry:entry.start-arrival.end,firstLocalFeasibleEntry,firstConstructedEntry:joint(run.iterations[0]).tasks.find(task=>task.id===canonical)!.start,
      presenceMinutes:out.end-arrival.start,waitExitToOut:out.start-exit.end};
  });
  const work=input.tasks.filter(task=>["ESTILISMO_ENTRADA","ESTILISMO_SALIDA"].includes(task.templateName??""));
  const occupations=work.map(task=>final.tasks.find(row=>row.taskId===task.id)!).map(row=>({start:minute(row.startPlanned!),end:minute(row.endPlanned!)})).sort((a,b)=>a.start-b.start);
  const gaps=occupations.slice(1).map((row,index)=>row.start-occupations[index].end).filter(gap=>gap>0);
  return {participants,totalPresenceMinutes:participants.reduce((sum,row)=>sum+row.presenceMinutes,0),
    waitInToEntryMinutes:participants.reduce((sum,row)=>sum+row.waitInToEntry,0),waitExitToOutMinutes:participants.reduce((sum,row)=>sum+row.waitExitToOut,0),
    stylingGapCount:gaps.length,stylingGapMinutes:gaps.reduce((sum,gap)=>sum+gap,0),stylingWorkMinutes:occupations.reduce((sum,row)=>sum+row.end-row.start,0),
    branches:run.iterations.reduce((sum:number,row:any)=>sum+row.branchesExplored,0),durationMs:run.iterations.reduce((sum:number,row:any)=>sum+row.durationMs,0),fingerprint:run.deterministicFingerprint};
}
const metricsBefore=metrics(before,snapshotsBefore),metricsAfter=metrics(after,snapshotsAfter);
mkdirSync(outputDirectory,{recursive:true});
writeFileSync(resolve(outputDirectory,"a2-report.json"),JSON.stringify({status:"PASS",base:"49d826c9a5ecdd3e0488a64d2b6a05dd3aad98b5",runtime:read(afterDirectory,"runtime.json"),
  deterministic:true,snapshotsUnchanged:JSON.stringify(snapshotsBefore)===JSON.stringify(snapshotsAfter),before:metricsBefore,after:metricsAfter,stagesBefore,stagesAfter,
  repeatDurationMs:repeat.iterations.reduce((sum:number,row:any)=>sum+row.durationMs,0),
  localFeasibilityDefinition:"Exact task domain with all other final tasks, IN and meals fixed; not a global earliest-start proof.",offlineAuditAccounting:"Separate from product branch counts."},null,2));
console.log(JSON.stringify({status:"PASS",before:metricsBefore.totalPresenceMinutes,after:metricsAfter.totalPresenceMinutes,branches:metricsAfter.branches}));
