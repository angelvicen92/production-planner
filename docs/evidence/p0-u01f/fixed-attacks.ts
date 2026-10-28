/** Material mutations of genuine proposals; every transaction rolls back. */
import assert from 'node:assert/strict';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {operationalMealWitnessFingerprint} from '../../../engine/planner-next/operationalMeals';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
export async function fixedAttacks({db,planId,run,draft,policy,input,save,label,ordinal}:any){
 const source=run.assisted_result_json,failures=[];
 const first=policy.phases[0][0],unitTask=source.evidence.nominalPhysicalFutureWitness.tasks.find((t:any)=>t.id==='task:'+first);
 if(!unitTask.itinerantUnitId)return;
 const modes=['unit-not-eligible','unit-identity','unit-domain','member-omitted','member-invented','resource-unavailable','rest-invaded','draft-resource-lie'];
 if(label==='second'&&ordinal===2)modes.push('protected-unit-permutation');
 if(label==='B-segments')modes.push('shared-A-overlap');
 if(label==='common-unit')modes.push('unit-unavailable','universal-omitted');
 for(const mode of modes){
  if(mode==='rest-invaded'&&!source.evidence.nominalPhysicalFutureWitness.operationalMeals?.length)continue;
  let error:any;await db.query('BEGIN');
  try{
   const candidate=structuredClone(source),proof=candidate.evidence.nominalPhysicalFutureWitness;
   const task=(id:number)=>proof.tasks.find((t:any)=>t.id==='task:'+id),member=task(first);
   if(mode==='protected-unit-permutation'){const peer=task(policy.phases[0][1]);[member.start,peer.start]=[peer.start,member.start];member.end=member.start+member.duration;peer.end=peer.start+peer.duration;}
   if(mode==='unit-not-eligible')member.itinerantUnitId='itinerant-team:2147483647';
   if(mode==='unit-identity')member.itinerantUnitId='itinerant-team:'+input.itinerantCompositionSnapshot.units.find((u:any)=>'itinerant-team:'+u.id!==member.itinerantUnitId).id;
   if(mode==='unit-domain')member.allowedItinerantUnitIds=['itinerant-team:2147483647'];
   if(mode==='member-omitted'||mode==='universal-omitted')member.requiredResourceIds=member.requiredResourceIds.slice(1);
   if(mode==='member-invented')member.requiredResourceIds.push('plan-resource:2147483647');
   if(mode==='resource-unavailable')await db.query('UPDATE plan_resource_items SET is_available=false WHERE id=$1',[Number(member.requiredResourceIds[0].split(':')[1])]);
   if(mode==='unit-unavailable'){member.start=660;member.end=660+member.duration;}
   if(mode==='shared-A-overlap'){
    const other=task(policy.phases[1][0]);assert.notEqual(member.itinerantUnitId,other.itinerantUnitId);
    assert.ok(member.requiredResourceIds.some((id:string)=>other.requiredResourceIds.includes(id)));
    other.start=member.start;other.end=other.start+other.duration;
    // Preserve its true feeder constraint to isolate shared physical capacity.
    const predecessor=task(policy.phases[0][0]);
    const ownPre=task(policy.phases[0][1]);other.start=ownPre.end;other.end=other.start+other.duration;
    const collision=task(policy.phases[0][2]);collision.start=other.start;collision.end=collision.start+collision.duration;
   }
   if(mode==='rest-invaded'){
    const rival=proof.tasks.find((t:any)=>!policy.orderedTaskIds.includes(Number(t.id.slice(5)))&&!t.jointGroupId&&!t.itinerantUnitId&&t.requiredResourceIds?.includes(member.requiredResourceIds[0])),rest=proof.operationalMeals[0];
    assert.ok(!rest.spaceIds.includes(rival.spaceId));rival.start=rest.start;rival.end=rest.start+rival.duration;
   }
   for(const row of candidate.proposedDraftSnapshot.tasks.filter((t:any)=>t.startPlanned)){
    const t=task(row.taskId);row.startPlanned=minute(t.start);row.endPlanned=minute(t.end);
    row.assignedResourceIds=(t.requiredResourceIds??[]).map((id:string)=>Number(id.split(':')[1]));
    if(t.itinerantUnitId)row.itinerantTeamId=Number(t.itinerantUnitId.split(':')[1]);
   }
   if(mode==='draft-resource-lie'){
    const row=candidate.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===first);
    // In S1 this task is context only; target an actually materialized unit in S2.
    if(!row.startPlanned){await db.query('ROLLBACK');continue;}row.assignedResourceIds=[];
   }
   proof.fingerprint=fingerprint(proof.tasks);
   candidate.evidence.selectedMealWitnesses.operational={scheduled:structuredClone(proof.operationalMeals),fingerprint:operationalMealWitnessFingerprint(proof.operationalMeals)};
   candidate.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(candidate.proposedDraftSnapshot);
   await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(sha256(convert_to($2::jsonb::text,'UTF8')),'hex') WHERE id=$1",[run.id,JSON.stringify(candidate)]);
   await db.query('UPDATE assisted_planning_sessions SET draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$1',[draft.session.id,candidate.proposedDraftSnapshot,candidate.proposedDraftFingerprint]);
   await db.query('SET LOCAL ROLE service_role');
   await db.query('SELECT assert_daily_technical_chain_snapshot($1,$2,$3,$4)',[planId,candidate.proposedDraftSnapshot,draft.currentConfigRevisionId,run.id]);
  }catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  failures.push({mode,error,consumer:'assert_daily_technical_chain_snapshot',hashesRecomputed:true,rolledBack:true});save(`${label}-S${ordinal}-unit-forgeries`,failures);
  assert.equal(error?.code,'P0001',JSON.stringify({mode,error}));assert.doesNotMatch(error.message,/FINGERPRINT|AUTHENTIC_PROPOSAL/);
  if(mode==='protected-unit-permutation')assert.equal(error.message,'ANCHORED_PROTECTED_DECISIONS');
  if(mode==='unit-unavailable')assert.equal(error.message,'ANCHORED_UNIT_UNAVAILABLE');
  if(mode==='member-omitted'||mode==='member-invented'||mode==='universal-omitted')assert.equal(error.message,'ANCHORED_WITNESS_PHYSICAL_RESOURCES');
  if(mode==='shared-A-overlap')assert.equal(error.message,'ANCHORED_WITNESS_RESOURCE_CONFLICT');
 }
}
const minute=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
