/** Repair only ephemeral context of an authentic proposal; SQL probe rolls back. */
import assert from 'node:assert/strict';
import {validatePlan} from '../../../engine/planner-next/validate';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate';
export async function repairSupporting({db,planId,run,input,problem,save,label}:any){
 const original=run.assisted_result_json,visible=new Set(original.proposal.map((t:any)=>'task:'+t.taskId));
 assert.equal(original.evidence.acceptedSupportingPlacements.length,0);
 let repaired:any;
 for(const id of original.evidence.supportingTaskIds){
  for(let start=problem.day.start;start<=problem.day.end;start+=5){
   const candidate=structuredClone(original),proof=candidate.evidence.nominalPhysicalFutureWitness,task=proof.tasks.find((t:any)=>t.id===id);
   if(!task||visible.has(id)||task.start===start)continue;
   const old={start:task.start,end:task.end};task.start=start;task.end=start+task.duration;
   const validation=validatePlan(problem,proof.tasks,proof.setupPreparations??[],proof.spaceMeals??[],proof.participantMeals??[],proof.resourceMeals??[],proof.itinerantUnitMeals??[],proof.roundPreparations??[],proof.operationalMeals??[]);
   if(!validation.hardValid)continue;
   const certificate=certifyDailyTechnicalChain(problem,proof.tasks.filter((t:any)=>visible.has(t.id)),0,proof);assert.equal(certificate?.status,'WITNESS');proof.fingerprint=fingerprint(proof.tasks);
   assert.deepEqual(candidate.proposal,original.proposal);assert.deepEqual(candidate.proposedDraftSnapshot,original.proposedDraftSnapshot);
   await db.query('BEGIN');try{
    await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(sha256(convert_to($2::jsonb::text,'UTF8')),'hex') WHERE id=$1",[run.id,JSON.stringify(candidate)]);
    await db.query('SET LOCAL ROLE service_role');await db.query('SELECT assert_daily_technical_chain_snapshot($1,$2,$3,$4)',[planId,candidate.proposedDraftSnapshot,run.config_revision_id,run.id]);
   }finally{await db.query('ROLLBACK');}
   repaired={changed:id,old,next:{start:task.start,end:task.end},supportingTaskIds:original.evidence.supportingTaskIds,visibleProposalUnchanged:true,draftUnchanged:true,acceptedSupportingPlacements:[],validation,certificate,proof,sqlAccepted:true,rolledBack:true};break;
  }if(repaired)break;
 }
 assert.ok(repaired,'supporting must remain reparable');save(label+'-supporting',repaired);
}
