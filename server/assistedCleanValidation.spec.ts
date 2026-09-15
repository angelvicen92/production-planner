import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizePlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";
import type { IStorage } from "./storage";

process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
const { AssistedPlanningService } = await import("./assistedPlanningService");

const migration=await readFile(new URL("../supabase/migrations/080_assisted_clean_validation.sql",import.meta.url),"utf8");
const service=await readFile(new URL("./assistedPlanningService.ts",import.meta.url),"utf8");
const routes=await readFile(new URL("./routes.ts",import.meta.url),"utf8");
const compact=migration.replace(/\s+/g," ");
const rpc=migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION"),migration.indexOf("REVOKE ALL"));

test("validation delegates only to proposal-certified DB authority and permits incomplete stages",()=>{
  assert.match(service,/assisted_record_proposal_clean_validation/);
  assert.match(service,/PROPOSAL_CERTIFIED_CLEAN_V1/);
  assert.doesNotMatch(service,/validatePlan|scheduled\.length|adaptEngineInputToPlannerNextProblem/);
  assert.doesNotMatch(rpc,/daily_tasks|expectedTaskCount|reasonCodes/);
  assert.match(routes,/assisted\/validate/);
});
test("080 locks authorities and derives proposal provenance and evidence under the same transaction",()=>{
  assert.match(rpc,/status='ACTIVE' FOR UPDATE/);
  for(const code of ["STALE_DRAFT","STALE_BASE_STAGE","STALE_CONFIG_REVISION","VALIDATION_REQUIRED","RUN_RESULT_INVALID","VALIDATION_NOT_ACCEPTABLE"]) assert.match(rpc,new RegExp(code));
  for(const authority of ["proposalRunId","ASSISTED_SCOPE","assisted_session_id","base_stage_id","config_revision_id","result_fingerprint","proposedDraftSnapshot","proposedDraftFingerprint","scopeTaskIds","includePrerequisites","proposalCount","completeForScope","protectedPlacementsPreserved","hardValid","requiredValid"]) assert.match(rpc,new RegExp(authority));
  assert.match(compact,/INSERT INTO public\.planning_stage_validations.*UPDATE public\.assisted_planning_sessions/);
});
test("report is honest about preferred and caller cannot supply evidence",()=>{
  assert.match(rpc,/PROPOSAL_CERTIFIED_CLEAN_V1/);
  assert.match(rpc,/preferredAssessment','NOT_CLASSIFIED'/);
  assert.doesNotMatch(rpc,/p_report|p_proposal_run|p_hard|p_required/);
});
test("proposal validation RPC revokes every role before granting only service_role",()=>{
  for(const role of ["PUBLIC","anon","authenticated","service_role"]) assert.match(migration,new RegExp(`REVOKE ALL ON FUNCTION public\\.assisted_record_proposal_clean_validation[^;]+FROM ${role}`));
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.assisted_record_proposal_clean_validation[^;]+TO service_role/);
});
test("proposal validation runs as invoker with an empty search path and qualified authorities",()=>{
  assert.match(rpc,/SECURITY INVOKER SET search_path=''/);
  assert.doesNotMatch(rpc,/SECURITY DEFINER/);
  for(const relation of ["assisted_planning_sessions","planning_runs","planning_stage_validations"])
    assert.match(rpc,new RegExp(`public\\.${relation}`));
  assert.match(rpc,/extensions\.digest\(/);
});
test("incomplete and internal-supporting snapshots are accepted based on clean ASST-005 evidence, not physical placement counts",()=>{
  assert.doesNotMatch(rpc,/jsonb_array_length\(result->'proposedDraftSnapshot'->'tasks'\).*proposal|plannedTaskCount|totalActiveObligationCount/);
  assert.doesNotMatch(rpc,/supportingTaskIds|includePrerequisites.*true/);
  assert.match(rpc,/evidence->>'completeForScope' IS DISTINCT FROM 'true'/);
});

test("a clean scoped proposal validates and accepts an incomplete S0 -> S1 without losing obligations",async()=>{
  const planId=701, userId="user-1", configId=8;
  const input={planId,tasks:[]} as any;
  const optimizerSnapshot=normalizePlanOptimizerSnapshotV1({});
  const taskTemplateSnapshots:any[]=[];
  const configurationFingerprint="c".repeat(64);
  const s0=buildAssistedPlanningSnapshotV1([101,102,103].map(id=>({id,startPlanned:null,endPlanned:null})));
  const s1=buildAssistedPlanningSnapshotV1(s0.tasks.map(task=>({id:task.taskId,...task,...(task.taskId===101
    ? {startPlanned:"09:00",endPlanned:"09:30",zoneId:401,spaceId:301}: {})})));
  const scope=[101], runId=9;
  let validation:any=null;
  let acceptedSnapshot:typeof s1|null=null;
  let session:any={id:7,planId,status:"ACTIVE",activeStageId:4,draftBaseStageId:4,currentConfigRevisionId:configId,
    draftScopeJson:{proposalRunId:runId,resolvedTaskIds:scope,includePrerequisites:false},draftSnapshotJson:s1,
    draftFingerprint:fingerprintAssistedPlanningSnapshotV1(s1),draftValidationId:null};
  const stages:any[]=[{id:4,sessionId:7,planId,ordinal:0,snapshotJson:s0,snapshotFingerprint:fingerprintAssistedPlanningSnapshotV1(s0)}];
  const storage=new Proxy({}, {get(_target,property:string){
    const reads:Record<string,()=>Promise<any>>={
      getActiveAssistedPlanningSession:async()=>session,getAssistedPlanningStage:async()=>stages.find(stage=>stage.id===session.activeStageId),
      listAssistedPlanningStages:async()=>stages,getPlanningStageValidation:async()=>validation,
      getPlanOptimizerSnapshot:async()=>optimizerSnapshot,getPlanTaskTemplateSnapshots:async()=>taskTemplateSnapshots,
      getPlanConfigRevision:async()=>({planId,fingerprint:configurationFingerprint}),
    }; return reads[property]??(async()=>{throw new Error(`unexpected storage call: ${property}`);});
  }}) as IStorage;
  const rpc=async(name:string,parameters:Record<string,unknown>)=>{
    if(name==="assisted_record_proposal_clean_validation"){
      assert.deepEqual(parameters,{p_plan_id:planId,p_expected_fingerprint:session.draftFingerprint,p_expected_base:4,p_expected_config:configId});
      validation={id:40,sessionId:7,planId,baseStageId:4,draftFingerprint:session.draftFingerprint,configRevisionId:configId,
        hardCount:0,requiredCount:0,preferredCount:0,reportJson:{mode:"PROPOSAL_CERTIFIED_CLEAN_V1",proposalRunId:runId,scopeTaskIds:scope}};
      session={...session,draftValidationId:validation.id}; return {error:null};
    }
    if(name==="assisted_accept_stage"){
      assert.equal(session.draftValidationId,validation.id);
      assert.equal(validation.draftFingerprint,parameters.p_expected_fingerprint);
      assert.equal(validation.baseStageId,parameters.p_expected_base);
      acceptedSnapshot=structuredClone(session.draftSnapshotJson);
      const next={id:5,sessionId:7,planId,ordinal:1,parentStageId:4,snapshotJson:acceptedSnapshot,snapshotFingerprint:session.draftFingerprint,
        configRevisionId:configId,proposalRunId:runId,scopeTaskIdsJson:scope,acceptedBy:userId,validationSummaryJson:{validationId:validation.id}};
      stages.push(next); session={...session,activeStageId:5,draftBaseStageId:5,draftScopeJson:{},draftValidationId:null}; return {error:null};
    }
    return {error:{message:`unexpected RPC: ${name}`}};
  };
  const service=new AssistedPlanningService(storage,rpc,{buildInput:async()=>structuredClone(input),
    buildConfigRevision:()=>({contractVersion:1,planId,components:[],configurationFingerprint})});
  const certified=await service.validateDraft(planId,session.draftFingerprint,4);
  assert.equal(certified.current,true); assert.equal(certified.mode,"PROPOSAL_CERTIFIED_CLEAN_V1");
  assert.equal(certified.validation,validation);
  const accepted=await service.accept(planId,userId,session.draftFingerprint,4);
  assert.equal(accepted.session.activeStageId,5);
  assert.deepEqual(acceptedSnapshot,s1);
  const persistedSnapshot=acceptedSnapshot as unknown as typeof s1;
  assert.equal(persistedSnapshot.tasks.length,s0.tasks.length);
  assert.deepEqual(persistedSnapshot.tasks.map(task=>task.taskId),s0.tasks.map(task=>task.taskId));
  assert.deepEqual(persistedSnapshot.tasks.find(task=>task.taskId===101),s1.tasks.find(task=>task.taskId===101));
  for(const task of persistedSnapshot.tasks.filter(task=>!scope.includes(task.taskId))){
    assert.equal(task.startPlanned,null); assert.equal(task.endPlanned,null);
  }
  assert.equal(stages[1].snapshotFingerprint,fingerprintAssistedPlanningSnapshotV1(s1));
  assert.equal(stages[1].configRevisionId,configId); assert.equal(stages[1].parentStageId,4);
  assert.equal(stages[1].proposalRunId,runId); assert.deepEqual(stages[1].scopeTaskIdsJson,scope);
  assert.equal(stages[1].validationSummaryJson.validationId,validation.id);
});
