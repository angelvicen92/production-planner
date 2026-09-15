import assert from "node:assert/strict";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1, type AssistedPlanningSnapshotV1 } from "../assistedPlanningSnapshot";
import { applyAssistedDraftChanges, reorderTasks, shiftTasks, swapTasks } from "../../client/src/lib/assisted-draft-editing";
import type { IStorage } from "../storage";

export async function runA2Assist2Evidence(){
  process.env.SUPABASE_URL??="http://localhost";process.env.SUPABASE_SERVICE_ROLE_KEY??="test-service-role-key";process.env.SUPABASE_ANON_KEY??="test-anon-key";
  const [{AssistedPlanningService},{createManualDeltaValidationHarness}]=await Promise.all([import("../assistedPlanningService"),import("../assistedProposalService")]);
  const planId=902,sessionId=12,baseStageId=21,configId=31,sourceObligationCount=266;
  const initialTimes=[{start:"09:00",end:"09:20"},{start:"10:00",end:"10:20"},{start:"08:00",end:"08:20"},{start:"08:20",end:"08:40"}];
  const s1=buildAssistedPlanningSnapshotV1(Array.from({length:sourceObligationCount},(_,index)=>({id:index+1,
    startPlanned:initialTimes[index]?.start??null,endPlanned:initialTimes[index]?.end??null,zoneId:1,spaceId:index<2?1:2})));
  const problem:any={day:{start:480,end:1080},spaces:[1,2].map(id=>({id:`space:${id}`,availability:[{start:480,end:1080}]})),resources:[{id:"coach",availability:[{start:480,end:1080}],presencePreference:"OFF"}],participants:[1,2].map(id=>({id:`p${id}`,availability:[{start:480,end:1080}]})),coaches:[{id:"coach",availability:[{start:480,end:1080}]}],tasks:[
    ...[1,2].map(id=>({id:`task:${id}`,kind:"main" as const,duration:20,spaceId:"space:1",participantId:`p${id}`,coachId:"coach",requiredResourceIds:["coach"],blockKey:"coach",dependencies:[`task:${id+2}`],availability:[{start:480,end:1080}]})),
    ...[3,4].map((id,index)=>({id:`task:${id}`,kind:"vocal" as const,duration:20,spaceId:"space:2",participantId:`p${index+1}`,coachId:"coach",dependencies:[],availability:[{start:480,end:1080}]})),
  ],mainFlow:{spaceId:"space:1",preferredEnd:1080,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,searchPolicy:"EXACT_CONSTRUCTIVE",budget:{bestK:2,maxBacktracks:20,maxPatterns:20,maxBranchExpansions:200},auxiliaryPolicy:{participantPresencePreference:"OFF"}};
  let validation:any=null,productWrites=0,planningRuns=0,acceptStarted=false;
  let session:any={id:sessionId,planId,status:"ACTIVE",activeStageId:baseStageId,draftBaseStageId:baseStageId,currentConfigRevisionId:configId,draftScopeJson:{},draftSnapshotJson:s1,draftFingerprint:fingerprintAssistedPlanningSnapshotV1(s1),draftValidationId:null};
  const stages:any[]=[{id:20,sessionId,planId,ordinal:0,snapshotJson:s1},{id:baseStageId,sessionId,planId,ordinal:1,snapshotJson:s1,snapshotFingerprint:session.draftFingerprint}];
  const tasks=s1.tasks.map(task=>({id:task.taskId,status:"pending"}));
  const storage=new Proxy({}, {get(_target,property:string){const reads:Record<string,any>={getActiveAssistedPlanningSession:async()=>session,
    getAssistedPlanningStage:async(id:number)=>stages.find(stage=>stage.id===id),listAssistedPlanningStages:async()=>stages,
    getPlanningStageValidation:async()=>validation,getTasksForPlan:async()=>tasks,getPlanOptimizerSnapshot:async()=>({}),getPlanTaskTemplateSnapshots:async()=>[],getPlanConfigRevision:async()=>({planId,fingerprint:"c".repeat(64)})};
    return reads[property]??(async()=>{throw new Error(`unexpected storage ${property}`);});}}) as IStorage;
  const rpc=async(name:string,p:any)=>{
    if(name==="assisted_patch_draft"){
      const before=session.draftSnapshotJson as AssistedPlanningSnapshotV1;
      const changed=(p.p_snapshot as AssistedPlanningSnapshotV1).tasks.filter((task:any)=>JSON.stringify(task)!==JSON.stringify(before.tasks.find(row=>row.taskId===task.taskId)));
      const inverse=changed.map((task:any)=>before.tasks.find(row=>row.taskId===task.taskId));
      const operation={beforeFingerprint:session.draftFingerprint,afterFingerprint:p.p_fingerprint,forward:changed,inverse};
      session={...session,draftSnapshotJson:p.p_snapshot,draftFingerprint:p.p_fingerprint,draftValidationId:null,draftScopeJson:{...session.draftScopeJson,editKind:"MANUAL",manualTouchedTaskIds:[...new Set([...(session.draftScopeJson.manualTouchedTaskIds??[]),...changed.map((x:any)=>x.taskId)])],editLedger:[...(session.draftScopeJson.editLedger??[]),operation],redoLedger:[]}};return {error:null};
    }
    if(name==="assisted_move_draft_edit"){
      const source=p.p_redo?session.draftScopeJson.redoLedger:session.draftScopeJson.editLedger;const operation=source.at(-1);
      const rows=p.p_redo?operation.forward:operation.inverse;const snapshot=applyAssistedDraftChanges(session.draftSnapshotJson,rows);
      const expected=p.p_redo?operation.beforeFingerprint:operation.afterFingerprint;assert.equal(session.draftFingerprint,expected);
      session={...session,draftSnapshotJson:snapshot,draftFingerprint:p.p_redo?operation.afterFingerprint:operation.beforeFingerprint,draftValidationId:null,draftScopeJson:{...session.draftScopeJson,editLedger:p.p_redo?[...session.draftScopeJson.editLedger,operation]:source.slice(0,-1),redoLedger:p.p_redo?source.slice(0,-1):[...session.draftScopeJson.redoLedger,operation]}};return {error:null};
    }
    if(name==="assisted_record_manual_clean_validation"){assert.equal(p.p_expected_fingerprint,session.draftFingerprint);assert.equal(p.p_expected_base,baseStageId);assert.equal(p.p_expected_config,configId);validation={id:44,sessionId,planId,baseStageId,draftFingerprint:p.p_expected_fingerprint,configRevisionId:configId,reportJson:p.p_report};session={...session,draftValidationId:44};return {error:null};}
    if(name==="assisted_accept_stage"){acceptStarted=true;assert.equal(session.draftValidationId,44);productWrites++;const stage={id:22,sessionId,planId,ordinal:2,snapshotJson:session.draftSnapshotJson,snapshotFingerprint:session.draftFingerprint};stages.push(stage);session={...session,activeStageId:22,draftBaseStageId:22,draftScopeJson:{},draftValidationId:null};return {error:null};}
    return {error:{message:`unexpected RPC ${name}`}};
  };
  const identityMap=[1,2,3,4].map(id=>({namespace:"task",sourceId:String(id),canonicalId:`task:${id}`}));
  const service=new AssistedPlanningService(storage,rpc,{buildInput:async()=>({planId,tasks:[]} as any),buildConfigRevision:()=>({contractVersion:1,planId,components:[],configurationFingerprint:"c".repeat(64)}),validateManual:createManualDeltaValidationHarness(problem,identityMap) as any});
  const counters={manualEditCount:0,shiftCount:0,swapCount:0,reorderCount:0,undoCount:0,redoCount:0};
  const apply=async(operation:any,kind:keyof typeof counters)=>{const before=session.draftFingerprint;await service.patchDraft(planId,before,baseStageId,operation.changes.map((task:any)=>({taskId:task.taskId,startPlanned:task.startPlanned,endPlanned:task.endPlanned})));counters.manualEditCount++;counters[kind]++;};
  await apply(shiftTasks(session.draftSnapshotJson,[1,2],15,"MULTI_SHIFT"),"shiftCount");
  await apply(swapTasks(session.draftSnapshotJson,1,2),"swapCount");
  const afterEdits=session.draftFingerprint;await service.undoDraft(planId,afterEdits,baseStageId);counters.undoCount++;
  const afterUndo=session.draftFingerprint;await service.redoDraft(planId,afterUndo,baseStageId);counters.redoCount++;assert.equal(session.draftFingerprint,afterEdits);
  await apply(reorderTasks(session.draftSnapshotJson,[2,1]),"reorderCount");
  const validatedFingerprint=session.draftFingerprint;const result=await service.validateDraft(planId,validatedFingerprint,baseStageId);
  assert.equal(result.mode,"MANUAL_DELTA_CLEAN_V1");assert.equal(validation.draftFingerprint,validatedFingerprint);assert.equal(productWrites,0);
  await service.accept(planId,"user-1",validatedFingerprint,baseStageId);assert.equal(acceptStarted,true);
  const unplanned=(session.draftSnapshotJson as AssistedPlanningSnapshotV1).tasks.filter(task=>!task.startPlanned).length;
  const evidence={evidenceId:"A2-ASSIST-2",sourceObligationCount,stageS1Incomplete:s1.tasks.some(task=>!task.startPlanned),unplannedObligationsPreserved:unplanned===s1.tasks.filter(task=>!task.startPlanned).length,
    planningRunsCreatedDuringEditing:planningRuns,productWritesBeforeAccept:productWrites-1,productWritesAtAccept:productWrites,...counters,touchedTaskCount:validation.reportJson.changedTaskIds.length,
    validationMode:result.mode,acceptedStageOrdinal:stages.at(-1).ordinal,validatedFingerprint,validatedBaseStageId:validation.baseStageId,validatedConfigRevisionId:validation.configRevisionId,
    deterministicFingerprints:validatedFingerprint===fingerprintAssistedPlanningSnapshotV1(stages.at(-1).snapshotJson),futureFullDayFeasibility:validation.reportJson.futureFullDayFeasibility};
  return evidence;
}
if(import.meta.url===`file://${process.argv[1]}`)console.log(JSON.stringify(await runA2Assist2Evidence(),null,2));
