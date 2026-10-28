import assert from 'node:assert/strict';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {operationalMealWitnessFingerprint} from '../../../engine/planner-next/operationalMeals';
/** Authentic run and authorities, coherently rehashed argument; every transaction rolls back. */
export async function compositionAttacks({db,planId,run,draft,input,save,prefix}:any){
 const failures:any[]=[];
 const anchor=input.anchoredAccompaniments[0],scope=input.dailyTaskOperationScopes[0],policy=input.technicalChains[0],group=input.dailyJointGroups[0];
 const minute=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
 for(const mode of ['peer-asynchronous','peer-unit','third-party','split-anchor','virtual-main','missing-direct','inherited-location','shared-member','unavailable','pause-invasion','phase-gap','incomplete-witness','bad-hash','stale-revision']){
  let error:any;await db.query('BEGIN');
  try{
   const candidate=structuredClone(run.assisted_result_json),proof=candidate.evidence.nominalPhysicalFutureWitness;
   const task=(id:number)=>proof.tasks.find((t:any)=>t.id==='task:'+id),shift=(t:any,delta:number)=>{t.start+=delta;t.end+=delta;};
   const standalone=task(scope.taskId),peer=task(group.taskIds[1]);
   if(mode==='peer-asynchronous')shift(peer,5);
   if(mode==='peer-unit')peer.itinerantUnitId='itinerant-team:'+input.itinerantCompositionSnapshot.units.find((u:any)=>'itinerant-team:'+u.id!==peer.itinerantUnitId).id;
   if(mode==='third-party'||mode==='shared-member'){
    const rival=input.tasks.find((t:any)=>t.templateName.endsWith(mode==='third-party'?'rival B':'rival A'));
    const r=task(rival.id),other=task(mode==='third-party'?group.taskIds[0]:anchor.anchorTaskId);r.start=other.start;r.end=r.start+r.duration;
   }
   if(mode==='split-anchor')shift(task(anchor.beforeTaskIds[0]),-5);
   if(mode==='virtual-main')task(anchor.anchorTaskId).blocksSpace=false;
   if(mode==='missing-direct')standalone.requiredResourceIds=standalone.requiredResourceIds.filter((id:string)=>id!=='plan-resource:'+scope.declaredResourceIds[0]);
   if(mode==='inherited-location'){
    const source=input.tasks.find((t:any)=>t.id===scope.taskId);
    standalone.requiredResourceIds.push(...input.spaceResourceAssignments[source.spaceId].map((id:number)=>'plan-resource:'+id));
   }
   if(mode==='unavailable')await db.query('UPDATE plan_resource_items SET is_available=false WHERE id=$1',[scope.declaredResourceIds[0]]);
   if(mode==='pause-invasion'){
    const r=task(input.tasks.find((t:any)=>t.templateName.endsWith('rival A')).id),rest=proof.operationalMeals[0];r.start=rest.start;r.end=r.start+r.duration;
   }
   if(mode==='phase-gap'){
    const cut=task(policy.phases[0][0]).end;for(const t of proof.tasks)if(t.start>=cut)shift(t,5);for(const m of proof.operationalMeals)if(m.start>=cut)shift(m,5);
   }
   if(mode==='incomplete-witness')proof.tasks.pop();
   for(const row of candidate.proposedDraftSnapshot.tasks.filter((t:any)=>t.startPlanned)){
    const t=task(row.taskId);if(t){row.startPlanned=minute(t.start);row.endPlanned=minute(t.end);row.assignedResourceIds=(t.requiredResourceIds??[]).map((id:string)=>Number(id.split(':')[1]));if(t.itinerantUnitId)row.itinerantTeamId=Number(t.itinerantUnitId.split(':')[1]);else delete row.itinerantTeamId;}
   }
   for(const row of candidate.proposedDraftSnapshot.operationalMeals??[]){const m=proof.operationalMeals.find((m:any)=>m.id===row.policyId);if(m){row.startPlanned=minute(m.start);row.endPlanned=minute(m.end);}}
   proof.fingerprint=fingerprint(proof.tasks);
   candidate.evidence.selectedMealWitnesses.operational={scheduled:structuredClone(proof.operationalMeals),fingerprint:operationalMealWitnessFingerprint(proof.operationalMeals)};
   candidate.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(candidate.proposedDraftSnapshot);
   await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(sha256(convert_to($2::jsonb::text,'UTF8')),'hex') WHERE id=$1",[run.id,JSON.stringify(candidate)]);
   if(mode==='bad-hash')await db.query("UPDATE planning_runs SET result_fingerprint=repeat('0',64) WHERE id=$1",[run.id]);
   await db.query('SET LOCAL ROLE service_role');
   await db.query('SELECT public.assert_daily_technical_chain_snapshot($1,$2,$3,$4)',[planId,candidate.proposedDraftSnapshot,mode==='stale-revision'?draft.currentConfigRevisionId-1:draft.currentConfigRevisionId,run.id]);
  }catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  assert.equal(error?.code,'P0001',JSON.stringify({mode,error}));
  const category=mode==='bad-hash'?'AUTHENTICITY':mode==='stale-revision'?'VERSIONING':'PHYSICAL';
  if(category==='PHYSICAL')assert.doesNotMatch(error.message,/AUTHENTIC_PROPOSAL|FINGERPRINT|CERTIFICATE_REQUIRED|STALE/);
  failures.push({mode,category,error,hashesRecomputed:mode!=='bad-hash',realAuthority:true,consumer:'assert_daily_technical_chain_snapshot',rolledBack:true});save(prefix+'-negatives',failures);
 }
 // The scope consumer independently admits the complete genuine peer pair and
 // rejects desynchronization; no equality of location alone authorizes sharing.
 for(const mode of ['genuine','peer-asynchronous']){
  const snapshot=structuredClone(run.assisted_result_json.proposedDraftSnapshot);
  for(const row of snapshot.tasks){const t=run.assisted_result_json.evidence.nominalPhysicalFutureWitness.tasks.find((t:any)=>t.id==='task:'+row.taskId);row.startPlanned=minute(t.start);row.endPlanned=minute(t.end);row.assignedResourceIds=(t.requiredResourceIds??[]).map((id:string)=>Number(id.split(':')[1]));if([anchor.anchorTaskId,...anchor.beforeTaskIds,...anchor.afterTaskIds].includes(row.taskId)&&t.coachId)row.assignedResourceIds.push(Number(t.coachId.split(':')[1]));row.assignedResourceIds.sort((a:number,b:number)=>a-b);if(t.itinerantUnitId)row.itinerantTeamId=Number(t.itinerantUnitId.split(':')[1]);else delete row.itinerantTeamId;}
  if(mode==='peer-asynchronous'){const row=snapshot.tasks.find((t:any)=>t.taskId===group.taskIds[1]);row.startPlanned=minute(run.assisted_result_json.evidence.nominalPhysicalFutureWitness.tasks.find((t:any)=>t.id==='task:'+row.taskId).start+5);row.endPlanned=minute(run.assisted_result_json.evidence.nominalPhysicalFutureWitness.tasks.find((t:any)=>t.id==='task:'+row.taskId).end+5);}
  let error:any;await db.query('BEGIN');try{await db.query('SET LOCAL ROLE service_role');await db.query('SELECT assert_task_scope_snapshot($1,$2,$3)',[planId,snapshot,draft.currentConfigRevisionId]);}catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  if(mode==='genuine')assert.equal(error,undefined,JSON.stringify(error));else assert.equal(error?.message,'JOINT_SYNCHRONIZATION');
  save(prefix+'-scope-'+mode,{accepted:!error,error,realAuthority:true,consumer:'assert_task_scope_snapshot',rolledBack:true});
 }
}
