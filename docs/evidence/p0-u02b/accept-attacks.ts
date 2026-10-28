/** Authentic accept RPC with isolated source/CAS/Draft attacks and rollback. */
import assert from 'node:assert/strict';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
export async function acceptAttacks({db,planId,draft,actor,save,label,ordinal}:any){
 const failures=[];
 for(const mode of ['wrong-CAS','stale-base','forged-source','forged-Draft']){
  let error:any;await db.query('BEGIN');
  try{
   let expected=draft.draftFingerprint;
   if(mode==='forged-source')await db.query("UPDATE planning_stage_validations SET source_token=repeat('0',64) WHERE id=(SELECT draft_validation_id FROM assisted_planning_sessions WHERE id=$1)",[draft.session.id]);
   if(mode==='forged-Draft'){
    const validationId=(await db.query('SELECT draft_validation_id FROM assisted_planning_sessions WHERE id=$1',[draft.session.id])).rows[0].draft_validation_id;
    const snapshot=structuredClone(draft.draft),task=snapshot.tasks.find((t:any)=>t.startPlanned);task.startPlanned='15:50';task.endPlanned='15:55';expected=fingerprintAssistedPlanningSnapshotV1(snapshot);
    await db.query('UPDATE assisted_planning_sessions SET draft_validation_id=NULL,draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$1',[draft.session.id,snapshot,expected]);
    await db.query('UPDATE planning_stage_validations SET draft_fingerprint=$2 WHERE id=$1',[validationId,expected]);
    await db.query('UPDATE assisted_planning_sessions SET draft_validation_id=$2 WHERE id=$1',[draft.session.id,validationId]);
   }
   await db.query('SET LOCAL ROLE service_role');
   await db.query('SELECT assisted_accept_stage($1,$2,$3,$4)',[planId,actor,mode==='wrong-CAS'?'0'.repeat(64):expected,mode==='stale-base'?2147483647:draft.draftBaseStageId]);
  }catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  assert.equal(error?.code,'P0001',JSON.stringify({mode,error}));
  if(mode==='wrong-CAS')assert.equal(error.message,'STALE_DRAFT');
  if(mode==='stale-base')assert.equal(error.message,'STALE_BASE_STAGE');
  if(mode==='forged-source')assert.equal(error.message,'STALE_OBLIGATION_SOURCES');
  failures.push({mode,error,consumer:'assisted_accept_stage',hashRecomputed:mode==='forged-Draft',rolledBack:true});
 }
 save(`${label}-S${ordinal}-accept-negatives`,failures);
}
