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
 // The same physical competition is legal after A is released, and illegal
 // in a source authority that actually requires A throughout. No Stage is
 // fabricated: the probe rolls back and the genuine proposal is then accepted.
 if(ordinal===1&&['A-fixed','common-unit'].includes(label)){
  let error:any;await db.query('BEGIN');
  try{
   const candidate=structuredClone(original),proof=candidate.evidence.nominalPhysicalFutureWitness;
   const rival=proof.tasks.find((t:any)=>t.id==='task:'+draft.draft.tasks.find((t:any)=>t.startPlanned).taskId);
   const start=Math.min(...proof.tasks.filter((t:any)=>policy.phases.at(-1).includes(Number(t.id.slice(5)))).map((t:any)=>t.start));
   rival.start=start;rival.end=start+rival.duration;
   const row=candidate.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===Number(rival.id.slice(5)));row.startPlanned=minute(rival.start);row.endPlanned=minute(rival.end);
   proof.fingerprint=fingerprint(proof.tasks);candidate.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(candidate.proposedDraftSnapshot);
   await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(sha256(convert_to($2::jsonb::text,'UTF8')),'hex') WHERE id=$1",[run.id,JSON.stringify(candidate)]);
   await db.query('UPDATE assisted_planning_sessions SET draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$1',[draft.session.id,candidate.proposedDraftSnapshot,candidate.proposedDraftFingerprint]);
   await db.query('SET LOCAL ROLE service_role');
   await db.query('SELECT public.assert_daily_technical_chain_snapshot($1,$2,$3,$4)',[planId,candidate.proposedDraftSnapshot,draft.currentConfigRevisionId,run.id]);
  }catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  if(label==='A-fixed')assert.equal(error,undefined);else assert.equal(error?.message,'ANCHORED_WITNESS_RESOURCE_CONFLICT');
  save(label+'-resource-release-sql',{accepted:!error,error,consumer:'assert_daily_technical_chain_snapshot',realSourceAuthority:true,hashesRecomputed:true,rolledBack:true});
 }
 const modes=['peer-omitted','peer-asynchronous','phase-order','phase-gap','duplicate-resource','dependency','pause-absent','pause-altered','omit-task-resource','invent-resource','false-release','future-incomplete','stale-replay','harmful-prefix','protected-decision','bad-fingerprint','wrong-run','coach-double','vocal-main-dependency','participant-overlap','coach-unavailable'];
 for(const mode of modes){
  if(mode.startsWith('pause-')&&!input.operationalMealPolicies?.length)continue;
  if(mode==='protected-decision'&&ordinal!==2)continue;
  if(mode==='invent-resource'&&policy.requiredResourceIds.length)continue;
  if((mode==='duplicate-resource'||mode==='participant-conflict'||mode==='harmful-prefix')&&ordinal!==1)continue;
  // The alternate topology has an explicit same-phase dependency; changing its
  // phase order would test that earlier dependency guard instead.
  if(['phase-order','phase-gap'].includes(mode)&&label==='segmented-joint')continue;
  let error:any;await db.query('BEGIN');
  try{
   const forged=structuredClone(original),proof=forged.evidence.nominalPhysicalFutureWitness;
   const task=(id:number)=>proof.tasks.find((t:any)=>t.id==='task:'+id);
   const shift=(t:any,delta:number)=>{t.start+=delta;t.end+=delta;};
   const competitor=proof.tasks.find((t:any)=>!policy.orderedTaskIds.includes(Number(t.id.slice(5)))&&t.kind==='auxiliary'&&!t.dependencies.length&&t.requiredResourceIds?.includes(task(policy.phases[0][0]).requiredResourceIds[0])&&!t.jointGroupId);
   if(mode==='coach-double'){
    const mains=proof.tasks.filter((t:any)=>t.kind==='main').sort((a:any,b:any)=>a.start-b.start);
    const earlier=mains.find((t:any)=>mains.some((x:any)=>x.start>t.start&&x.coachId===t.coachId));assert.ok(earlier);
    const later=mains.find((t:any)=>t.start>earlier.start&&t.coachId===earlier.coachId),vocal=proof.tasks.find((t:any)=>t.kind==='vocal'&&t.participantId===later.participantId);
    vocal.start=earlier.start;vocal.end=vocal.start+vocal.duration;
    assert.ok(vocal.end<=later.start&&vocal.spaceId!==earlier.spaceId&&vocal.participantId!==earlier.participantId);
   }
   if(mode==='vocal-main-dependency'){
    const main=proof.tasks.find((t:any)=>t.kind==='main'),vocal=proof.tasks.find((t:any)=>t.kind==='vocal'&&t.participantId===main.participantId);
    vocal.start=main.start;vocal.end=vocal.start+vocal.duration;
   }
   if(mode==='participant-overlap'){
    const prep=proof.tasks.find((t:any)=>t.kind==='auxiliary'&&t.participantId&&!t.dependencies.length&&!t.requiredResourceIds?.length),vocal=proof.tasks.find((t:any)=>t.kind==='vocal'&&t.participantId===prep.participantId);
    vocal.start=prep.start;vocal.end=vocal.start+vocal.duration;
   }
   if(mode==='coach-unavailable')await db.query('UPDATE plan_resource_items SET is_available=false WHERE id=$1',[Number(proof.tasks.find((t:any)=>t.kind==='vocal').coachId.split(':')[1])]);
   if(mode==='omit-task-resource')task(policy.phases[0][0]).requiredResourceIds=[];
   if(mode==='false-release'){
    const member=task(policy.phases[0][0]);member.requiredResourceIds=member.requiredResourceIds.slice(1);
   }
   if(mode==='invent-resource'){
    const member=task(policy.phases.at(-1).at(-1)),resource=input.planResourceItems.map((r:any)=>'plan-resource:'+r.id).find((id:string)=>!member.requiredResourceIds.includes(id));
    assert.ok(!member.requiredResourceIds.includes(resource));member.requiredResourceIds.push(resource);
   }
   if(mode==='peer-omitted')proof.tasks=proof.tasks.filter((t:any)=>t.id!=='task:'+peer);
   if(mode==='peer-asynchronous'){
    const p=task(peer);shift(p,5);
    for(const t of proof.tasks)if(t.dependencies.includes(p.id))shift(t,5);
   }
   if(mode==='phase-order'){
    let selected:any;
    for(const leftId of policy.phases[0])for(const rightId of policy.phases[1]){
     const left=task(leftId),right=task(rightId);if(left.duration!==right.duration)continue;
     const candidate=structuredClone(proof.tasks),l=candidate.find((t:any)=>t.id===left.id),r=candidate.find((t:any)=>t.id===right.id);
     [l.start,r.start]=[r.start,l.start];l.end=l.start+l.duration;r.end=r.start+r.duration;
     if(candidate.every((t:any)=>t.dependencies.every((id:string)=>candidate.find((d:any)=>d.id===id).end<=t.start)))selected=candidate;
    }
    assert.ok(selected,'phase-only attack with all dependencies intact');proof.tasks=selected;
   }
   if(mode==='phase-gap'){
    const cut=task(policy.phases[0][0]).end;
    for(const t of proof.tasks)if(t.start>=cut)shift(t,5);
    for(const m of proof.operationalMeals)if(m.start>=cut)shift(m,5);
   }
   if(mode==='protected-decision'){const row=draft.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned).at(-1);assert.ok(row);shift(task(row.taskId),90);}
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
    const t=task(row.taskId);if(t){row.startPlanned=minute(t.start);row.endPlanned=minute(t.end);row.assignedResourceIds=(t.requiredResourceIds??[]).map((id:string)=>Number(id.split(':')[1]));}
   }
   for(const row of forged.proposedDraftSnapshot.operationalMeals??[]){const m=proof.operationalMeals.find((m:any)=>m.id===row.policyId);if(m){row.startPlanned=minute(m.start);row.endPlanned=minute(m.end);}}
   proof.fingerprint=fingerprint(proof.tasks);
   forged.evidence.selectedMealWitnesses.operational={scheduled:structuredClone(proof.operationalMeals),fingerprint:operationalMealWitnessFingerprint(proof.operationalMeals)};
   forged.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(forged.proposedDraftSnapshot);
   await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(sha256(convert_to($2::jsonb::text,'UTF8')),'hex') WHERE id=$1",[run.id,JSON.stringify(forged)]);
   await db.query('UPDATE assisted_planning_sessions SET draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$1',[draft.session.id,forged.proposedDraftSnapshot,forged.proposedDraftFingerprint]);
   if(mode==='bad-fingerprint')await db.query("UPDATE planning_runs SET result_fingerprint=repeat('0',64) WHERE id=$1",[run.id]);
   await db.query('SET LOCAL ROLE service_role');
   await db.query('SELECT public.assert_daily_technical_chain_snapshot($1,$2,$3,$4)',[planId,forged.proposedDraftSnapshot,mode==='stale-replay'?draft.currentConfigRevisionId-1:draft.currentConfigRevisionId,mode==='wrong-run'?run.id+2147483647:run.id]);
  }catch(e:any){error={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}
  failures.push({mode,error,consumer:'assert_daily_technical_chain_snapshot',hashesRecomputed:mode!=='bad-fingerprint',deliberateFingerprintInconsistency:mode==='bad-fingerprint',rolledBack:true});save(`${label}-S${ordinal}-forgeries`,failures);
  assert.equal(error?.code,'P0001',mode);if(!['bad-fingerprint','wrong-run'].includes(mode))assert.doesNotMatch(error.message,/AUTHENTIC_PROPOSAL|FINGERPRINT|CERTIFICATE_REQUIRED/);
  if(mode==='phase-order')assert.equal(error.message,'TECHNICAL_CHAIN_PHASE_ORDER');
  if(mode==='phase-gap')assert.equal(error.message,'TECHNICAL_CHAIN_PHASE_GAP');
  if(mode==='peer-asynchronous')assert.equal(error.message,'JOINT_SYNCHRONIZATION');
  if(mode==='duplicate-resource')assert.equal(error.message,'ANCHORED_WITNESS_RESOURCE_CONFLICT');
  if(mode==='participant-conflict')assert.equal(error.message,'ANCHORED_WITNESS_PARTICIPANT_CONFLICT');
  if(mode==='protected-decision')assert.equal(error.message,'ANCHORED_PROTECTED_DECISIONS');
  if(mode==='coach-double')assert.equal(error.message,'ANCHORED_WITNESS_RESOURCE_CONFLICT');
  if(mode==='vocal-main-dependency')assert.equal(error.message,'ANCHORED_WITNESS_DEPENDENCY');
  if(mode==='participant-overlap')assert.equal(error.message,'ANCHORED_WITNESS_PARTICIPANT_CONFLICT');
  if(mode==='coach-unavailable')assert.equal(error.message,'ANCHORED_WITNESS_RESOURCE_AVAILABILITY');
  if(mode==='dependency')assert.equal(error.message,'ANCHORED_WITNESS_DEPENDENCY');
 }
}
