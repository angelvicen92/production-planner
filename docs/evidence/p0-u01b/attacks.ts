import assert from 'node:assert/strict';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {operationalMealWitnessFingerprint} from '../../../engine/planner-next/operationalMeals';
/** Tamper only inside rolled-back local transactions. Recompute all result,
 * witness and Draft hashes so rejection belongs to the material consumer. */
export async function certificateAttacks({db,planId,run,draft,policy,input,save,label,ordinal}:any){
 const failures:any[]=[],original=run.assisted_result_json;
 const peer=input.dailyJointGroups[0].taskIds.find((id:number)=>!policy.orderedTaskIds.includes(id));
 const minute=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
 const modes=['peer-omitted','peer-asynchronous','phase-order','phase-gap','duplicate-resource','participant-conflict','dependency','pause-absent','pause-altered','future-incomplete','stale-replay','harmful-prefix','protected-decision'];
 for(const mode of modes){
  if(mode==='protected-decision'&&ordinal!==2)continue;
  if((mode==='duplicate-resource'||mode==='participant-conflict'||mode==='harmful-prefix')&&ordinal!==1)continue;
  // The alternate topology has an explicit same-phase dependency; changing its
  // phase order would test that earlier dependency guard instead.
  if(mode==='phase-order'&&label==='second')continue;
  let error:any;await db.query('BEGIN');
  try{
   const forged=structuredClone(original),proof=forged.evidence.nominalPhysicalFutureWitness;
   const task=(id:number)=>proof.tasks.find((t:any)=>t.id==='task:'+id);
   const shift=(t:any,delta:number)=>{t.start+=delta;t.end+=delta;};
   const competitor=proof.tasks.find((t:any)=>!policy.orderedTaskIds.includes(Number(t.id.slice(5)))&&t.requiredResourceIds?.length&&!t.jointGroupId);
   if(mode==='peer-omitted')proof.tasks=proof.tasks.filter((t:any)=>t.id!=='task:'+peer);
   if(mode==='peer-asynchronous'){
    const p=task(peer);shift(p,5);
    for(const t of proof.tasks)if(t.dependencies.includes(p.id))shift(t,5);
   }
   if(mode==='phase-order'){
    const left=task(policy.phases[0].at(-1)),right=task(policy.phases[1][0]);
    assert.equal(left.duration,right.duration);const at=left.start;left.start=right.start;left.end=left.start+left.duration;right.start=at;right.end=at+right.duration;
   }
   if(mode==='phase-gap'){
    const cut=task(policy.phases[0][0]).end;
    for(const t of proof.tasks)if(t.start>=cut)shift(t,5);
    for(const m of proof.operationalMeals)if(m.start>=cut)shift(m,5);
   }
   if(mode==='protected-decision')shift(competitor,90);
   if(mode==='duplicate-resource'||mode==='harmful-prefix'){
    const member=task(policy.phases[0][0]);competitor.start=member.start;competitor.end=competitor.start+competitor.duration;
   }
   if(mode==='participant-conflict'){
    const closing=proof.tasks.find((t:any)=>t.participantId===competitor.participantId&&t.dependencies.length&&!t.requiredResourceIds?.length);
    assert.ok(closing);competitor.start=closing.start;competitor.end=competitor.start+competitor.duration;
   }
   if(mode==='dependency'){
    const member=task(policy.phases[0][0]),pre=proof.tasks.find((t:any)=>member.dependencies.includes(t.id));assert.ok(pre);pre.start=member.end;pre.end=pre.start+pre.duration;
   }
   if(mode==='pause-absent')proof.operationalMeals=[];
   if(mode==='pause-altered'){proof.operationalMeals[0].end+=5;proof.operationalMeals[0].duration+=5;}
   if(mode==='future-incomplete')proof.tasks.pop();
   // Match all placed Draft rows to the altered witness, keeping protected
   // accepted decisions for the SQL authority to check independently.
   for(const row of forged.proposedDraftSnapshot.tasks.filter((t:any)=>t.startPlanned)){
    const t=task(row.taskId);if(t){row.startPlanned=minute(t.start);row.endPlanned=minute(t.end);}
   }
   for(const row of forged.proposedDraftSnapshot.operationalMeals??[]){const m=proof.operationalMeals.find((m:any)=>m.id===row.policyId);if(m){row.startPlanned=minute(m.start);row.endPlanned=minute(m.end);}}
   proof.fingerprint=fingerprint(proof.tasks);
   forged.evidence.selectedMealWitnesses.operational={scheduled:structuredClone(proof.operationalMeals),fingerprint:operationalMealWitnessFingerprint(proof.operationalMeals)};
   forged.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(forged.proposedDraftSnapshot);
   await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(sha256(convert_to($2::jsonb::text,'UTF8')),'hex') WHERE id=$1",[run.id,JSON.stringify(forged)]);
   await db.query('UPDATE assisted_planning_sessions SET draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$1',[draft.session.id,forged.proposedDraftSnapshot,forged.proposedDraftFingerprint]);
   await db.query('SET LOCAL ROLE service_role');
   await db.query('SELECT public.assert_daily_technical_chain_snapshot($1,$2,$3,$4)',[planId,forged.proposedDraftSnapshot,mode==='stale-replay'?draft.currentConfigRevisionId-1:draft.currentConfigRevisionId,run.id]);
  }catch(e:any){error={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}
  failures.push({mode,error,consumer:'assert_daily_technical_chain_snapshot',hashesRecomputed:true,rolledBack:true});save(`${label}-S${ordinal}-forgeries`,failures);
  assert.equal(error?.code,'P0001',mode);assert.doesNotMatch(error.message,/AUTHENTIC_PROPOSAL|FINGERPRINT|CERTIFICATE_REQUIRED/);
  if(mode==='phase-order')assert.equal(error.message,'TECHNICAL_CHAIN_PHASE_ORDER');
  if(mode==='phase-gap')assert.equal(error.message,'TECHNICAL_CHAIN_PHASE_GAP');
  if(mode==='peer-asynchronous')assert.equal(error.message,'JOINT_SYNCHRONIZATION');
  if(mode==='duplicate-resource')assert.equal(error.message,'ANCHORED_WITNESS_RESOURCE_CONFLICT');
  if(mode==='participant-conflict')assert.equal(error.message,'ANCHORED_WITNESS_PARTICIPANT_CONFLICT');
  if(mode==='protected-decision')assert.equal(error.message,'ANCHORED_PROTECTED_DECISIONS');
  if(mode==='dependency')assert.equal(error.message,'ANCHORED_WITNESS_DEPENDENCY');
 }
}
