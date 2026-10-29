import assert from 'node:assert/strict';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {assertNominalProposalWitness} from '../../../server/assistedProposalService';

/** Attack authentic proposals; no altered placement survives its transaction. */
export async function jointAttacks({db,planId,run,draft,input,save,prefix}:any){
 const failures:any[]=[],group=input.dailyJointGroups[0],chain=input.technicalChains[0];
 const time=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
 const modes=['missing-peer','duplicate-peer','peer-time','peer-duration','peer-space','peer-resources','peer-unit','third-party','phase-order','draft-witness-mismatch','scope-member','direct-authority','direct-placement'];
 if(prefix.startsWith('macro'))modes.push('resource-window');
 for(const mode of modes){
  if(mode==='third-party'&&prefix.startsWith('macro'))continue;
  let error:any,tsRejected=false;await db.query('BEGIN');
  try{
   const candidate=structuredClone(run.assisted_result_json),proof=candidate.evidence.nominalPhysicalFutureWitness;
   const first=proof.tasks.find((t:any)=>t.id==='task:'+group.taskIds[0]),peer=proof.tasks.find((t:any)=>t.id==='task:'+group.taskIds[1]);
   if(mode==='missing-peer')proof.tasks=proof.tasks.filter((t:any)=>t!==peer);
   if(mode==='duplicate-peer')proof.tasks.push(structuredClone(peer));
   if(mode==='peer-time'||mode==='draft-witness-mismatch'){peer.start+=5;peer.end+=5;}
   if(mode==='peer-duration'){peer.duration+=5;peer.end+=5;}
   if(mode==='peer-space')peer.spaceId='space:2147483647';
   if(mode==='peer-resources')peer.requiredResourceIds=['plan-resource:2147483647'];
   if(mode==='peer-unit')peer.itinerantUnitId='itinerant-team:2147483647';
   if(mode==='third-party'){
    const unitIds=new Set([...chain.orderedTaskIds,...group.taskIds].map((id:number)=>'task:'+id));
    const rival=proof.tasks.find((t:any)=>!unitIds.has(t.id)&&(t.requiredResourceIds??[]).some((id:string)=>(first.requiredResourceIds??[]).includes(id)));
    assert.ok(rival,'native external competitor');
    rival.start=first.start;rival.end=rival.start+rival.duration;
   }
   if(mode==='phase-order'){
    const a=proof.tasks.find((t:any)=>t.id==='task:'+chain.phases[0][0]),b=proof.tasks.find((t:any)=>t.id==='task:'+chain.phases[1][0]);
    [a.start,b.start]=[b.start,a.start];a.end=a.start+a.duration;b.end=b.start+b.duration;
   }
   if(mode==='resource-window'){
    const a=proof.tasks.find((t:any)=>t.id==='task:'+chain.phases[0][0]);a.start=955;a.end=a.start+a.duration;
   }
   if(mode!=='draft-witness-mismatch')for(const row of candidate.proposedDraftSnapshot.tasks.filter((t:any)=>t.startPlanned)){
    const t=proof.tasks.find((t:any)=>t.id==='task:'+row.taskId);
    if(t){row.startPlanned=time(t.start);row.endPlanned=time(t.end);}
   }
   proof.fingerprint=fingerprint(proof.tasks);candidate.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(candidate.proposedDraftSnapshot);
   if(mode==='scope-member'){
    const removed=candidate.scopeTaskIds.includes(group.taskIds[1])?group.taskIds[1]:candidate.scopeTaskIds[0];
    candidate.scopeTaskIds=candidate.scopeTaskIds.filter((id:number)=>id!==removed);
   }
   if(!['scope-member','direct-authority','direct-placement'].includes(mode)){
    try{assertNominalProposalWitness(input,candidate.proposedDraftSnapshot,candidate);}catch{tsRejected=true;}
    assert.equal(tsRejected,true,mode+' TypeScript consumer');
   }
   await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(sha256(convert_to($2::jsonb::text,'UTF8')),'hex') WHERE id=$1",[run.id,JSON.stringify(candidate)]);
   await db.query('SET LOCAL ROLE service_role');
   if(mode==='scope-member')await db.query('SELECT assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,draft.draftFingerprint,draft.draftBaseStageId,draft.currentConfigRevisionId]);
   else if(mode==='direct-authority')await db.query("UPDATE plans SET daily_joint_groups=NULL WHERE id=$1",[planId]);
   else if(mode==='direct-placement')await db.query("UPDATE daily_tasks SET start_planned='08:00',end_planned='08:10' WHERE id=$1",[group.taskIds[1]]);
   else await db.query('SELECT assert_daily_technical_chain_snapshot($1,$2,$3,$4)',[planId,candidate.proposedDraftSnapshot,draft.currentConfigRevisionId,run.id]);
  }catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  assert.equal(error?.code,'P0001',JSON.stringify({mode,error}));
  const category=mode.startsWith('direct-')||/PRIOR_DECISION|PROTECTED_DECISIONS/.test(error.message)?'PROTECTION':mode==='scope-member'?'AUTHENTICITY':mode==='draft-witness-mismatch'?'DRAFT_IDENTITY':'PHYSICAL';
  if(category==='PHYSICAL')assert.doesNotMatch(error.message,/AUTHENTIC_PROPOSAL|FINGERPRINT|CERTIFICATE_REQUIRED|STALE|UNSUPPORTED/);
  if(mode==='resource-window')assert.equal(error.message,'ANCHORED_WITNESS_RESOURCE_AVAILABILITY');
  if(mode==='third-party')assert.equal(error.message,'ANCHORED_WITNESS_RESOURCE_CONFLICT');
  failures.push({mode,category,error,tsRejected,hashesRecomputed:true,rolledBack:true});save(prefix+'-joint-negatives',failures);
 }
}
