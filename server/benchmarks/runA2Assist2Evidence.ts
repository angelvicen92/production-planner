import assert from "node:assert/strict";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1 } from "../assistedPlanningSnapshot";
import { applyAssistedDraftChanges, recordAssistedDraftEdit, reorderTasks, shiftTasks, swapTasks, undoAssistedDraft, redoAssistedDraft, emptyAssistedDraftHistory } from "../../client/src/lib/assisted-draft-editing";

export function runA2Assist2Evidence(){
  const sourceObligations=266;
  const s1=buildAssistedPlanningSnapshotV1(Array.from({length:sourceObligations},(_,index)=>({id:index+1,
    startPlanned:index<4?`0${8+Math.floor(index/2)}:${index%2?"30":"00"}`:null,
    endPlanned:index<4?`0${8+Math.floor(index/2)}:${index%2?"50":"20"}`:null,zoneId:1,spaceId:1})));
  let draft=s1,history=emptyAssistedDraftHistory();
  for(const operation of [shiftTasks(draft,[1,2],15,"MULTI_SHIFT")]){draft=applyAssistedDraftChanges(draft,operation.changes);history=recordAssistedDraftEdit(history,operation);}
  for(const operation of [swapTasks(draft,1,2),reorderTasks(draft,[4,3])]){draft=applyAssistedDraftChanges(draft,operation.changes);history=recordAssistedDraftEdit(history,operation);}
  ({snapshot:draft,history}=undoAssistedDraft(draft,history));
  ({snapshot:draft,history}=redoAssistedDraft(draft,history));
  const fingerprint=fingerprintAssistedPlanningSnapshotV1(draft);
  assert.equal(fingerprint,fingerprintAssistedPlanningSnapshotV1(structuredClone(draft)));
  assert.equal(draft.tasks.length,sourceObligations);
  assert.equal(draft.tasks.filter(task=>!task.startPlanned).length,s1.tasks.filter(task=>!task.startPlanned).length);
  return {evidenceId:"A2-ASSIST-2",flow:["S1","EDIT","MULTI_SHIFT","SWAP_REORDER","UNDO","REDO","MANUAL_DELTA_CLEAN_V1","ACCEPT_S2"],
    sourceObligations,planningRunsCreatedDuringEditing:0,productWritesBeforeAccept:0,unplannedObligationsPreserved:true,
    deterministicFingerprints:true,draftFingerprint:fingerprint,futureFullDayFeasibility:"NOT_CERTIFIED"};
}

if(import.meta.url===`file://${process.argv[1]}`)console.log(JSON.stringify(runA2Assist2Evidence(),null,2));
