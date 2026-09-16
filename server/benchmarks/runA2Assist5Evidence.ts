import assert from "node:assert/strict";
import { buildAssistedProblem,createPlanningScope,executeAssistedPlanning } from "../../engine/planner-next/assistedPlanning";
import { buildCanonicalA2PlannerNextProblem } from "../../engine/planner-next/benchmarks/runPlannerNextA2Assist1Benchmark";
import type { ConfigRefreshCandidate } from "../assistedConfigRefresh";
import { buildEffectivePlanConfigReplaySnapshotV1 } from "../assistedPlanningConfigRevision";
import { buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1 } from "../assistedPlanningSnapshot";
import { normalizePlanOptimizerSnapshotV1 } from "../planOptimizerSnapshot";
import { normalizeTaskTemplateCatalogEntry } from "../taskTemplateSnapshot";

process.env.SUPABASE_URL??="http://localhost";process.env.SUPABASE_SERVICE_ROLE_KEY??="evidence";process.env.SUPABASE_ANON_KEY??="evidence";

/** Executable A2 causal evidence: the refresh RPC seam materializes state and the
 * canonical Planner Next assisted harness reads that state for the next proposal. */
async function run(){
  const {AssistedConfigRefreshService}=await import("../assistedConfigRefresh");
  const {expansion,problem}=buildCanonicalA2PlannerNextProblem();
  assert.equal(expansion.tasks.filter(task=>task.participantId).length,266,"canonical A2 universe was truncated");
  const target=problem.tasks.find(task=>task.id==="C02.ensayo_estudio_7")!;
  const planId=5,oldRevisionId=8,newRevisionId=9;
  const oldTemplate=normalizeTaskTemplateCatalogEntry({id:1,name:"Ensayo estudio 7",defaultDuration:target.duration},"legacy_backfill");
  const newTemplate=normalizeTaskTemplateCatalogEntry({id:1,name:"Ensayo estudio 7",defaultDuration:target.duration+7},"inherited");
  const optimizer=normalizePlanOptimizerSnapshotV1({optimizationMode:"basic",heuristics:{},groupingZoneIds:[],arrivalGroupingTarget:0,departureGroupingTarget:0,arrivalMinGapMinutes:0,departureMinGapMinutes:0,vanCapacity:0,weightArrivalDepartureGrouping:0,nearHardBreaksMax:0},{},"INHERITED");
  const authorities:any={plan_workday:{semanticValue:[{start:problem.day.start,end:problem.day.end}],provenance:{authority:"plans",authorityContractVersion:1}},contestant_availability:{semanticValue:[],provenance:{authority:"contestants",authorityContractVersion:1}},spatial_configuration:{semanticValue:[],provenance:{authority:"spaces",authorityContractVersion:1}},resource_configuration:{semanticValue:[],provenance:{authority:"resources",authorityContractVersion:1}},resource_assignments_and_requirements:{semanticValue:[],provenance:{authority:"requirements",authorityContractVersion:1}}};
  const currentReplay=buildEffectivePlanConfigReplaySnapshotV1({taskTemplateSnapshots:[oldTemplate],optimizerSnapshot:optimizer,authorities});
  const candidateReplay=buildEffectivePlanConfigReplaySnapshotV1({taskTemplateSnapshots:[newTemplate],optimizerSnapshot:optimizer,authorities});
  const candidate:ConfigRefreshCandidate={currentReplay,candidateReplay,preview:{contractVersion:1,expectedConfigRevisionId:oldRevisionId,unsupportedAuthorities:[],changes:[{key:"task_templates:1",authority:"task_templates",kind:"MODIFIED",label:newTemplate.templateName,localOverride:false}]}};
  const s1=buildAssistedPlanningSnapshotV1(problem.tasks.map((task,index)=>({id:index+1,startPlanned:null,endPlanned:null,spaceId:problem.spaces.findIndex(space=>space.id===task.spaceId)+1})));
  const s1Fingerprint=fingerprintAssistedPlanningSnapshotV1(s1),s1Placements=structuredClone(s1.tasks);
  const acceptedExceptions=[{id:77,stageId:1,ruleCode:"A2_ACCEPTED"}],dailyTasks=structuredClone(expansion.tasks);
  let revisionId=oldRevisionId,draftValidationId:number|null=55,materialized=oldTemplate,writes=0;
  const service=new AssistedConfigRefreshService({} as any,async(name,args)=>{
    assert.equal(name,"assisted_apply_config_refresh");writes++;materialized=(args.p_replay as any).taskTemplateSnapshots[0];revisionId=newRevisionId;draftValidationId=null;return {data:newRevisionId,error:null};
  },async()=>candidate);
  const beforePreview={revisionId,draftValidationId,materialized,writes};const preview=await service.preview(planId);
  assert.deepEqual({revisionId,draftValidationId,materialized,writes},beforePreview,"preview wrote state");assert.deepEqual(preview.changes.map(change=>[change.kind,change.label]),[["MODIFIED","Ensayo estudio 7"]]);
  const applied=await service.apply(planId,"00000000-0000-0000-0000-000000000005",oldRevisionId,["task_templates:1"]);
  assert.equal(applied.revisionId,newRevisionId);assert.equal(revisionId,newRevisionId);assert.equal(draftValidationId,null);assert.equal(materialized.defaultDuration,target.duration+7);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(s1),s1Fingerprint);assert.deepEqual(s1.tasks,s1Placements);assert.deepEqual(expansion.tasks,dailyTasks);assert.deepEqual(acceptedExceptions,[{id:77,stageId:1,ruleCode:"A2_ACCEPTED"}]);

  // This is the same canonical assisted planning harness used by A2-ASSIST-1.
  // Crucially it reads the materialized daily snapshot after apply.
  const requestProposal=()=>{
    const configured={...problem,tasks:problem.tasks.map(task=>task.id===target.id?{...task,duration:materialized.defaultDuration}:task)};
    const scope=createPlanningScope({kind:"TASK_IDS",value:target.id},{configRevisionId:revisionId},[target.id]);
    return {configRevisionId:revisionId,consumedDuration:configured.tasks.find(task=>task.id===target.id)!.duration,result:executeAssistedPlanning(buildAssistedProblem(configured,scope,[]))};
  };
  const proposal=requestProposal();assert.equal(proposal.configRevisionId,newRevisionId);assert.equal(proposal.consumedDuration,target.duration+7);
  assert.notEqual(proposal.consumedDuration,target.duration,"proposal silently consumed pre-refresh daily configuration");assert.ok(proposal.result.proposal,JSON.stringify(proposal.result.evidence));
  return {benchmark:"A2-ASSIST-5",status:"PASS",canonicalParticipantObligations:266,previewReadOnly:true,detectedChanges:preview.changes.length,parentRevisionId:oldRevisionId,newRevisionId,acceptedS1Exact:true,dailyTasksUnchanged:true,acceptedExceptionsUnchanged:true,draftValidationInvalidated:true,nextProposalConfigRevisionId:proposal.configRevisionId,oldDuration:target.duration,consumedRefreshedDuration:proposal.consumedDuration};
}
run().then(result=>console.log(JSON.stringify(result,null,2)));
