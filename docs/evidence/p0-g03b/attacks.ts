import assert from 'node:assert/strict';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {participantMealWitnessFingerprint} from '../../../engine/planner-next/participantMeals';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
/** Mutate an authentic run, recalculate all affected hashes, roll back every attack. */
export async function mealPhaseAttacks({db,planId,run,draft,input,save,prefix}:any){
 const failures:any[]=[],hhmm=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
 for(const mode of ['missing-meal','duplicate-meal','meal-window','meal-duration','meal-capacity','participant-overlap','missing-task','resource-omission','phase-gap','bad-hash','stale-revision','invalid-source']){
  let error:any;await db.query('BEGIN');
  try{
   const candidate=structuredClone(run.assisted_result_json),proof=candidate.evidence.nominalPhysicalFutureWitness,meals=proof.participantMeals;
   const chainIds=input.technicalChains[0].orderedTaskIds.map((id:number)=>'task:'+id),phase=proof.tasks.filter((t:any)=>chainIds.includes(t.id)).sort((a:any,b:any)=>a.start-b.start);
   if(mode==='missing-meal')meals.pop();
   if(mode==='duplicate-meal')meals.push(structuredClone(meals[0]));
   if(mode==='meal-window'){meals[0].start=770;meals[0].end=810;}
   if(mode==='meal-duration')meals[0].end-=5;
   if(mode==='meal-capacity')for(const meal of meals){meal.start=780;meal.end=820;}
   if(mode==='participant-overlap'){
    const m=meals[0],t=proof.tasks.find((t:any)=>t.participantId===m.participantId&&t.kind==='main');t.start=m.start;t.end=t.start+t.duration;
   }
   if(mode==='missing-task')proof.tasks.pop();
   if(mode==='resource-omission')phase[0].requiredResourceIds.pop();
   if(mode==='phase-gap'){const t=phase.at(-1);t.start+=5;t.end+=5;}
   for(const row of candidate.proposedDraftSnapshot.tasks.filter((t:any)=>t.startPlanned)){
    const t=proof.tasks.find((t:any)=>t.id==='task:'+row.taskId)??meals.find((m:any)=>m.sourceTaskId==='task:'+row.taskId);
    if(t){row.startPlanned=hhmm(t.start);row.endPlanned=hhmm(t.end);}
   }
   proof.fingerprint=fingerprint(proof.tasks);candidate.evidence.selectedMealWitnesses.participant.scheduled=structuredClone(meals);
   candidate.evidence.selectedMealWitnesses.participant.fingerprint=participantMealWitnessFingerprint(meals);
   candidate.evidence.globalParticipantMealWitnessFingerprint=participantMealWitnessFingerprint(meals);
   candidate.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(candidate.proposedDraftSnapshot);
   await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(sha256(convert_to($2::jsonb::text,'UTF8')),'hex') WHERE id=$1",[run.id,JSON.stringify(candidate)]);
   if(mode==='bad-hash')await db.query("UPDATE planning_runs SET result_fingerprint=repeat('0',64) WHERE id=$1",[run.id]);
   if(mode==='invalid-source')await db.query("UPDATE plans SET planner_next_configuration='{}'::jsonb WHERE id=$1",[planId]);
   await db.query('SET LOCAL ROLE service_role');
   if(mode==='invalid-source')await db.query('SELECT public.assert_daily_technical_chains($1,$2)',[planId,{contractVersion:1,policies:input.technicalChains}]);
   else await db.query('SELECT public.assert_daily_technical_chain_snapshot($1,$2,$3,$4)',[planId,candidate.proposedDraftSnapshot,mode==='stale-revision'?draft.currentConfigRevisionId-1:draft.currentConfigRevisionId,run.id]);
  }catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  assert.equal(error?.code,'P0001',JSON.stringify({mode,error}));
  const category=mode==='bad-hash'?'AUTHENTICITY':mode==='stale-revision'?'REVISION':mode==='invalid-source'?'SOURCE':'PHYSICAL';
  if(category==='PHYSICAL')assert.doesNotMatch(error.message,/AUTHENTIC_PROPOSAL|FINGERPRINT|CERTIFICATE_REQUIRED|STALE/);
  failures.push({mode,category,error,hashesRecomputed:mode!=='bad-hash',rolledBack:true});save(prefix+'-negatives',failures);
 }
}
