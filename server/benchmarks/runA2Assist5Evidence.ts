import assert from "node:assert/strict";
import { executeAssistedPlanning, type AssistedProblem } from "../../engine/planner-next/assistedPlanning";
import { buildCanonicalA2PlannerNextProblem } from "../../engine/planner-next/benchmarks/runPlannerNextA2Assist1Benchmark";
import { createSupportedEngineInputAdapterFixture } from "../../engine/planner-next/integration/engineInputAdapter.fixture";
import type { IStorage } from "../storage";
import type { ConfigRefreshCandidate } from "../assistedConfigRefresh";
import { buildEffectivePlanConfigReplaySnapshotV1 } from "../assistedPlanningConfigRevision";
import { buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1 } from "../assistedPlanningSnapshot";
import { normalizePlanOptimizerSnapshotV1 } from "../planOptimizerSnapshot";
import { normalizeTaskTemplateCatalogEntry } from "../taskTemplateSnapshot";
import type { AssistedProposalRunAccess } from "../assistedProposalService";

process.env.SUPABASE_URL??="http://localhost";process.env.SUPABASE_SERVICE_ROLE_KEY??="evidence";process.env.SUPABASE_ANON_KEY??="evidence";

/** Executable causal chain through both product services, backed by one mutable
 * in-memory daily state. apply is the only operation allowed to materialize it. */
async function run(){
  const {AssistedConfigRefreshService}=await import("../assistedConfigRefresh");
  const {AssistedProposalService}=await import("../assistedProposalService");
  const canonical=buildCanonicalA2PlannerNextProblem();
  assert.equal(canonical.expansion.tasks.filter(task=>task.participantId).length,266,"canonical A2 universe was truncated");
  const planId=701,oldRevisionId=8,newRevisionId=9,taskId=105,runId=91;
  const engineInput=createSupportedEngineInputAdapterFixture();
  const originalDuration=engineInput.tasks.find(task=>task.id===taskId)!.durationOverrideMin!;
  const oldTemplate=normalizeTaskTemplateCatalogEntry({id:engineInput.tasks.find(task=>task.id===taskId)!.templateId,name:"Ensayo estudio 7",defaultDuration:originalDuration},"legacy_backfill");
  const newTemplate=normalizeTaskTemplateCatalogEntry({id:oldTemplate.sourceTemplateId,name:oldTemplate.templateName,defaultDuration:originalDuration+10},"inherited");
  const optimizer=normalizePlanOptimizerSnapshotV1({optimizationMode:"basic",heuristics:{},groupingZoneIds:[],arrivalGroupingTarget:0,departureGroupingTarget:0,arrivalMinGapMinutes:0,departureMinGapMinutes:0,vanCapacity:0,weightArrivalDepartureGrouping:0,nearHardBreaksMax:0},{},"INHERITED");
  const authorities:any={plan_workday:{semanticValue:[],provenance:{authority:"plans",authorityContractVersion:1}},contestant_availability:{semanticValue:[],provenance:{authority:"contestants",authorityContractVersion:1}},spatial_configuration:{semanticValue:[],provenance:{authority:"spaces",authorityContractVersion:1}},resource_configuration:{semanticValue:[],provenance:{authority:"resources",authorityContractVersion:1}},resource_assignments_and_requirements:{semanticValue:[],provenance:{authority:"requirements",authorityContractVersion:1}}};
  const currentReplay=buildEffectivePlanConfigReplaySnapshotV1({taskTemplateSnapshots:[oldTemplate],optimizerSnapshot:optimizer,authorities});
  const candidateReplay=buildEffectivePlanConfigReplaySnapshotV1({taskTemplateSnapshots:[newTemplate],optimizerSnapshot:optimizer,authorities});
  const candidate:ConfigRefreshCandidate={currentReplay,candidateReplay,preview:{contractVersion:1,expectedConfigRevisionId:oldRevisionId,unsupportedAuthorities:[],localOverrides:[],changes:[{key:`task_templates:${oldTemplate.sourceTemplateId}`,authority:"task_templates",kind:"MODIFIED",label:newTemplate.templateName,localOverride:false}]}};
  const s1=buildAssistedPlanningSnapshotV1(engineInput.tasks.map(task=>({id:task.id,startPlanned:null,endPlanned:null,spaceId:task.spaceId??null,zoneId:task.zoneId??null})));
  const s1Fingerprint=fingerprintAssistedPlanningSnapshotV1(s1),s1Placements=structuredClone(s1.tasks);
  const dailyTasks=structuredClone(canonical.expansion.tasks),acceptedExceptions=[{id:77,stageId:1,ruleCode:"A2_ACCEPTED"}];
  const session:any={id:7,planId,status:"ACTIVE",activeStageId:1,draftBaseStageId:1,currentConfigRevisionId:oldRevisionId,draftFingerprint:s1Fingerprint,draftSnapshotJson:s1,draftValidationId:55};
  const stage:any={id:1,sessionId:session.id,planId,snapshotFingerprint:s1Fingerprint,snapshotJson:s1};
  let materialized=oldTemplate,writes=0,storedRun:any=null,finished:any=null,runnerDuration:number|null=null;
  const storage=new Proxy({}, {get(_target,property:string){const reads:Record<string,()=>Promise<any>>={
    getActiveAssistedPlanningSession:async()=>session,getAssistedPlanningStage:async()=>stage,getPlanOptimizerSnapshot:async()=>optimizer,
    getPlanTaskTemplateSnapshots:async()=>[materialized],getPlanConfigRevision:async(id?:number)=>({id,planId,fingerprint:"revision-9"}),
    listAssistedPlanningStages:async()=>[stage],listPlanningAcceptedExceptions:async()=>[],
  };return reads[property]??(async()=>{throw new Error(`unexpected storage call:${property}`);});}}) as IStorage;
  const refresh=new AssistedConfigRefreshService(storage,async(name,args)=>{assert.equal(name,"assisted_apply_config_refresh");writes++;materialized=(args.p_replay as any).taskTemplateSnapshots[0];session.currentConfigRevisionId=newRevisionId;session.draftValidationId=null;return {data:newRevisionId,error:null};},async()=>candidate);
  const before=structuredClone({revision:session.currentConfigRevisionId,validation:session.draftValidationId,materialized,writes});
  const preview=await refresh.preview(planId);assert.deepEqual({revision:session.currentConfigRevisionId,validation:session.draftValidationId,materialized,writes},before,"preview wrote state");
  const applied=await refresh.apply(planId,"00000000-0000-0000-0000-000000000005",oldRevisionId,[`task_templates:${oldTemplate.sourceTemplateId}`]);
  assert.equal(applied.revisionId,newRevisionId);assert.equal(session.currentConfigRevisionId,newRevisionId);assert.equal(materialized.defaultDuration,originalDuration+10);assert.equal(session.draftValidationId,null);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(s1),s1Fingerprint);assert.deepEqual(s1.tasks,s1Placements);assert.deepEqual(canonical.expansion.tasks,dailyTasks);assert.deepEqual(acceptedExceptions,[{id:77,stageId:1,ruleCode:"A2_ACCEPTED"}]);

  const runs:AssistedProposalRunAccess={
    create:async values=>{storedRun={id:runId,...values};return {data:{id:runId},error:null};},find:async()=>({data:storedRun,error:null}),fail:async()=>({error:null}),
    finish:async(_plan,_run,result)=>{finished=result;return {error:null};},apply:async()=>({error:null}),
  };
  let buildInputCalls=0;
  const buildInput=async()=>{buildInputCalls++;const input=structuredClone(engineInput);const task=input.tasks.find(row=>row.templateId===materialized.sourceTemplateId)!;task.durationOverrideMin=materialized.defaultDuration;return input;};
  const proposal=new AssistedProposalService(storage,()=>{},runs,(problem:AssistedProblem,options)=>{runnerDuration=problem.problem.tasks.find(task=>task.id===`task:${taskId}`)!.duration;return executeAssistedPlanning(problem,options);},{buildInput,buildConfigRevision:({planId:revisionPlanId})=>({contractVersion:1,planId:revisionPlanId,components:[],configurationFingerprint:"revision-9"})});
  const requested=await proposal.request(planId,{selector:{kind:"TASK_IDS",taskIds:[taskId]},includePrerequisites:false,expectedDraftFingerprint:s1Fingerprint,expectedBaseStageId:stage.id});
  assert.equal(storedRun.config_revision_id,newRevisionId,"request persisted the old revision");
  const result=await proposal.run(planId,requested.runId);
  assert.equal(storedRun.config_revision_id,session.currentConfigRevisionId,"run revision diverged from session");assert.ok(buildInputCalls>=2,"request/run did not build from materialized daily state");
  assert.equal(runnerDuration,originalDuration+10,"runner consumed the old duration");assert.equal(finished,result);assert.notEqual(runnerDuration,originalDuration);
  return {benchmark:"A2-ASSIST-5",status:"PASS",canonicalParticipantObligations:266,previewReadOnly:true,detectedChanges:preview.changes.length,parentRevisionId:oldRevisionId,newRevisionId,acceptedS1Fingerprint:s1Fingerprint,acceptedS1Exact:true,dailyTasksUnchanged:true,acceptedExceptionsUnchanged:true,draftValidationInvalidated:true,nextProposalConfigRevisionId:storedRun.config_revision_id,buildInputCalls,oldDuration:originalDuration,consumedRefreshedDuration:runnerDuration,outcome:result.outcome};
}
run().then(result=>console.log(JSON.stringify(result,null,2)));
