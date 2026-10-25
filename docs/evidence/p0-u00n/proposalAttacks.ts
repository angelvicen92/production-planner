import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
export async function proposalAttacks({db,run,state,planId,addedId,directory,label}:any){
 for(const mutation of ['omit','move-protected',...(run.assisted_result_json.evidence.hardValid===false?['false-hard-valid']:[])]){
  await db.query('BEGIN');let receipt:any;
  try{
   const result=structuredClone(run.assisted_result_json);
   if(mutation==='omit')result.proposedDraftSnapshot.tasks=result.proposedDraftSnapshot.tasks.filter((t:any)=>t.taskId!==addedId);
   else if(mutation==='false-hard-valid')result.evidence.hardValid=true;
   else result.proposedDraftSnapshot.tasks.find((t:any)=>t.startPlanned&&t.taskId!==addedId).startPlanned='09:01';
   result.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(result.proposedDraftSnapshot);
   await db.query("UPDATE public.planning_runs SET assisted_result_json=$2,result_fingerprint=encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') WHERE id=$1",[run.id,result]);
   await db.query('SET LOCAL ROLE service_role');
   await db.query('SELECT public.assisted_apply_proposal($1,$2,$3,$4)',[planId,run.id,state.draftFingerprint,state.draftBaseStageId]);
   await db.query('SELECT public.assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,result.proposedDraftFingerprint,state.draftBaseStageId,state.currentConfigRevisionId]);
   receipt={accepted:true};
  }catch(e:any){receipt={accepted:false,code:e.code,message:e.message,where:e.where,hashesRecomputed:true};}
  finally{await db.query('ROLLBACK');}
  assert.equal(receipt.accepted,false);assert.equal(receipt.message,mutation==='false-hard-valid'||(mutation==='move-protected'&&run.assisted_result_json.evidence.hardValid===false)?'VALIDATION_NOT_ACCEPTABLE':'RUN_RESULT_INVALID');
  writeFileSync(`${directory}/${label}-attack-${mutation}.json`,JSON.stringify(receipt,null,2));
 }
}
