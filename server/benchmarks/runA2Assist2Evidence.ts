import assert from "node:assert/strict";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1, type AssistedPlanningSnapshotV1 } from "../assistedPlanningSnapshot";
import { applyAssistedDraftChanges } from "../../client/src/lib/assisted-draft-editing";
import { assertPlanningBlockTemporalOrder } from "../../shared/assistedPlanningTaskOrdering";
import type { IStorage } from "../storage";
import { applyPlanningBlockOperation } from "../assistedPlanningBlocks";

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
  const tasks=s1.tasks.map(task=>({id:task.taskId,status:"pending",templateId:1,spaceId:1}));
  const roundTripCreated=applyPlanningBlockOperation(s1,{kind:"CREATE_BLOCK",memberTaskIds:[2,1]},tasks,{benchmark:"A2-ASSIST-2"}).snapshot;
  const roundTripRemoved=applyPlanningBlockOperation(roundTripCreated,{kind:"REMOVE_BLOCK_GROUPING",blockId:roundTripCreated.planningBlocks![0].blockId},tasks,{}).snapshot;
  const createRemoveCanonicalRoundTrip=JSON.stringify(roundTripRemoved)===JSON.stringify(s1)
    && fingerprintAssistedPlanningSnapshotV1(roundTripRemoved)===fingerprintAssistedPlanningSnapshotV1(s1);
  assert.equal(createRemoveCanonicalRoundTrip,true);
  const storage=new Proxy({}, {get(_target,property:string){const reads:Record<string,any>={getActiveAssistedPlanningSession:async()=>session,
    getAssistedPlanningStage:async(id:number)=>stages.find(stage=>stage.id===id),listAssistedPlanningStages:async()=>stages,
    getPlanningStageValidation:async()=>validation,listPlanningAcceptedExceptions:async()=>[],getTasksForPlan:async()=>tasks,getPlanOptimizerSnapshot:async()=>({}),getPlanTaskTemplateSnapshots:async()=>[],getPlanConfigRevision:async()=>({planId,fingerprint:"c".repeat(64)})};
    return reads[property]??(async()=>{throw new Error(`unexpected storage ${property}`);});}}) as IStorage;
  const rpc=async(name:string,p:any)=>{
    if(name==="assisted_patch_draft"){
      const before=session.draftSnapshotJson as AssistedPlanningSnapshotV1;
      const changed=(p.p_snapshot as AssistedPlanningSnapshotV1).tasks.filter((task:any)=>JSON.stringify(task)!==JSON.stringify(before.tasks.find(row=>row.taskId===task.taskId)));
      const inverse=changed.map((task:any)=>before.tasks.find(row=>row.taskId===task.taskId));
      const blockMembers=[...new Set([...(before.planningBlocks??[]).flatMap(block=>block.memberTaskIds),...(p.p_snapshot.planningBlocks??[]).flatMap((block:any)=>block.memberTaskIds)])];
      const operation={beforeFingerprint:session.draftFingerprint,afterFingerprint:p.p_fingerprint,forward:changed,inverse,forwardBlocks:p.p_snapshot.planningBlocks??[],inverseBlocks:before.planningBlocks??[],forwardHasBlocks:"planningBlocks" in p.p_snapshot,inverseHasBlocks:"planningBlocks" in before};
      session={...session,draftSnapshotJson:p.p_snapshot,draftFingerprint:p.p_fingerprint,draftValidationId:null,draftScopeJson:{...session.draftScopeJson,editKind:"MANUAL",manualTouchedTaskIds:[...new Set([...(session.draftScopeJson.manualTouchedTaskIds??[]),...changed.map((x:any)=>x.taskId),...blockMembers])],editLedger:[...(session.draftScopeJson.editLedger??[]),operation],redoLedger:[]}};return {error:null};
    }
    if(name==="assisted_move_draft_edit"){
      const source=p.p_redo?session.draftScopeJson.redoLedger:session.draftScopeJson.editLedger;const operation=source.at(-1);
      const rows=p.p_redo?operation.forward:operation.inverse;const snapshot:any=applyAssistedDraftChanges(session.draftSnapshotJson,rows);const hasBlocks=p.p_redo?operation.forwardHasBlocks:operation.inverseHasBlocks;
      if(hasBlocks)snapshot.planningBlocks=p.p_redo?operation.forwardBlocks:operation.inverseBlocks;else delete snapshot.planningBlocks;
      const expected=p.p_redo?operation.beforeFingerprint:operation.afterFingerprint;assert.equal(session.draftFingerprint,expected);
      session={...session,draftSnapshotJson:snapshot,draftFingerprint:p.p_redo?operation.afterFingerprint:operation.beforeFingerprint,draftValidationId:null,draftScopeJson:{...session.draftScopeJson,editLedger:p.p_redo?[...session.draftScopeJson.editLedger,operation]:source.slice(0,-1),redoLedger:p.p_redo?source.slice(0,-1):[...session.draftScopeJson.redoLedger,operation]}};return {error:null};
    }
    if(name==="assisted_record_stage_validation"){assert.equal(p.p_expected_fingerprint,session.draftFingerprint);assert.equal(p.p_expected_base,baseStageId);assert.equal(p.p_expected_config,configId);validation={id:44,sessionId,planId,baseStageId,draftFingerprint:p.p_expected_fingerprint,configRevisionId:configId,reportJson:p.p_report};session={...session,draftValidationId:44};return {error:null};}
    if(name==="assisted_accept_stage"){acceptStarted=true;assert.equal(session.draftValidationId,44);productWrites++;const stage={id:22,sessionId,planId,ordinal:2,snapshotJson:session.draftSnapshotJson,snapshotFingerprint:session.draftFingerprint};stages.push(stage);session={...session,activeStageId:22,draftBaseStageId:22,draftScopeJson:{},draftValidationId:null};return {error:null};}
    if(name==="assisted_move_stage"){const target=p.p_redo?stages.find(stage=>stage.id===22):stages.find(stage=>stage.id===p.p_target);assert.ok(target);productWrites++;session={...session,activeStageId:target.id,draftBaseStageId:target.id,draftSnapshotJson:target.snapshotJson,draftFingerprint:target.snapshotFingerprint,draftScopeJson:{},draftValidationId:null};return {error:null};}
    return {error:{message:`unexpected RPC ${name}`}};
  };
  const identityMap=[1,2,3,4].map(id=>({namespace:"task",sourceId:String(id),canonicalId:`task:${id}`}));
  const service=new AssistedPlanningService(storage,rpc,{buildInput:async()=>({planId,tasks:[]} as any),buildConfigRevision:()=>({contractVersion:1,planId,components:[],configurationFingerprint:"c".repeat(64)}),validateManual:createManualDeltaValidationHarness(problem,identityMap) as any});
  const counters={manualEditCount:0,blockShiftCount:0,swapCount:0,splitCount:0,mergeCount:0,undoCount:0,redoCount:0};
  await service.editPlanningBlocks(planId,session.draftFingerprint,baseStageId,{kind:"CREATE_BLOCK",memberTaskIds:[1,2,3,4]});counters.manualEditCount++;
  const originalBlock=session.draftSnapshotJson.planningBlocks[0];
  await service.editPlanningBlocks(planId,session.draftFingerprint,baseStageId,{kind:"MOVE_BLOCK",blockId:originalBlock.blockId,deltaMinutes:15});counters.manualEditCount++;counters.blockShiftCount++;
  const swappedOrder=[...originalBlock.memberTaskIds];const swapLeft=swappedOrder.indexOf(1),swapRight=swappedOrder.indexOf(2);[swappedOrder[swapLeft],swappedOrder[swapRight]]=[swappedOrder[swapRight],swappedOrder[swapLeft]];
  await service.editPlanningBlocks(planId,session.draftFingerprint,baseStageId,{kind:"REORDER_BLOCK_MEMBERS",blockId:originalBlock.blockId,memberTaskIds:swappedOrder});counters.manualEditCount++;counters.swapCount++;
  assertPlanningBlockTemporalOrder(session.draftSnapshotJson);
  await service.editPlanningBlocks(planId,session.draftFingerprint,baseStageId,{kind:"SPLIT_BLOCK",blockId:originalBlock.blockId,splitAfter:2});counters.manualEditCount++;counters.splitCount++;
  await service.editPlanningBlocks(planId,session.draftFingerprint,baseStageId,{kind:"MERGE_BLOCKS",blockIds:session.draftSnapshotJson.planningBlocks.map((block:any)=>block.blockId)});counters.manualEditCount++;counters.mergeCount++;
  const afterEdits=session.draftFingerprint;await service.undoDraft(planId,afterEdits,baseStageId);counters.undoCount++;
  const afterUndo=session.draftFingerprint;await service.redoDraft(planId,afterUndo,baseStageId);counters.redoCount++;assert.equal(session.draftFingerprint,afterEdits);
  const validatedFingerprint=session.draftFingerprint;const result=await service.validateDraft(planId,validatedFingerprint,baseStageId);
  assert.equal(result.mode,"MANUAL_STAGE_VALIDATION_V1");assert.equal(validation.draftFingerprint,validatedFingerprint);assert.equal(productWrites,0);
  await service.accept(planId,"user-1",validatedFingerprint,baseStageId);assert.equal(acceptStarted,true);const productWritesAtAccept=productWrites;
  const acceptedSnapshot=structuredClone(stages.at(-1).snapshotJson);await service.rollback(planId,baseStageId);
  const rollbackExact=session.draftFingerprint===stages.find(stage=>stage.id===baseStageId).snapshotFingerprint&&!session.draftSnapshotJson.planningBlocks;
  await service.redo(planId);const rollbackRedoExact=JSON.stringify(session.draftSnapshotJson)===JSON.stringify(acceptedSnapshot);
  const unplanned=(session.draftSnapshotJson as AssistedPlanningSnapshotV1).tasks.filter(task=>!task.startPlanned).length;
  const evidence={evidenceId:"A2-ASSIST-2",sourceObligationCount,stageS1Incomplete:s1.tasks.some(task=>!task.startPlanned),unplannedObligationsPreserved:unplanned===s1.tasks.filter(task=>!task.startPlanned).length,
    planningRunsCreatedDuringEditing:planningRuns,productWritesBeforeAccept:0,productWritesAtAccept,...counters,touchedTaskCount:validation.reportJson.changedTaskIds.length,
    validationMode:result.mode,acceptedStageOrdinal:stages.at(-1).ordinal,validatedFingerprint,validatedBaseStageId:validation.baseStageId,validatedConfigRevisionId:validation.configRevisionId,
    deterministicFingerprints:validatedFingerprint===fingerprintAssistedPlanningSnapshotV1(stages.at(-1).snapshotJson),blocksSurviveAccept:(stages.at(-1).snapshotJson.planningBlocks??[]).length===1,
    blockTemporalOrderMatchesMembers:(assertPlanningBlockTemporalOrder(session.draftSnapshotJson),true),createRemoveCanonicalRoundTrip,rollbackExact,rollbackRedoExact,blocksSurviveRollbackRedo:(session.draftSnapshotJson.planningBlocks??[]).length===1,futureFullDayFeasibility:validation.reportJson.futureFullDayFeasibility};
  return evidence;
}
if(import.meta.url===`file://${process.argv[1]}`)console.log(JSON.stringify(await runA2Assist2Evidence(),null,2));
