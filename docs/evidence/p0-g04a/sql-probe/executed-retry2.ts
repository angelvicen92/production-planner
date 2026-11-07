/** Rollback-only consumer probe. Synthetic run metadata is NOT a product proposal,
 * Draft or Stage receipt. Physical placements come literally from the engine. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate';
import {buildCanonicalPlanConfig} from '../../../server/dayConfigurationService';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
export async function sqlConsumerProbe(ctx:any,probeDirectory:string){
 const {db,input:original,appUrl,users,save,planId}=ctx;
 const read=(n:string)=>JSON.parse(readFileSync(`${probeDirectory}/${n}.json`,'utf8'));
 const input=read('input'),execution=read('run'),summary=read('summary');
 assert.equal(summary.status,'MEMORY_COMPLETE_WITNESS');
 const plain=structuredClone(input);delete plain.dailyTechnicalChainsVersion;delete plain.technicalChains;delete plain.dailyJointGroupsVersion;delete plain.dailyJointGroups;
 for(const t of plain.tasks)delete t.jointGroupId;
 assert.deepEqual(plain,JSON.parse(JSON.stringify(original)),'SQL sources must match the entire serialized native input');
 const a=adapt(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
 const physical=execution.evidence.nominalPhysicalFutureWitness;
 const cert=certifyDailyTechnicalChain(a.problem,execution.proposal,0,physical);assert.equal(cert?.status,'WITNESS');assert.equal(cert?.consumed,0);
 const {storage}=await import('../../../server/storage');
 const canonical=await buildCanonicalPlanConfig(planId,storage,input);
 const boot=await fetch(`${appUrl}/api/plans/${planId}/assisted/session`,{method:'POST',headers:{Authorization:`Bearer ${users.admin.token}`,'Content-Type':'application/json'},body:'{}'});assert.equal(boot.status,200,await boot.clone().text());
 const session=(await db.query('SELECT * FROM assisted_planning_sessions WHERE plan_id=$1 AND status=\'ACTIVE\'',[planId])).rows[0];
 const byId=new Map<number,any>(execution.proposal.map((t:any)=>[Number(t.id.slice(5)),t]));
 const hhmm=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
 const draft=buildAssistedPlanningSnapshotV1(input.tasks.map((t:any)=>{
  const p:any=byId.get(t.id);return {id:t.id,startPlanned:p?hhmm(p.start):null,endPlanned:p?hhmm(p.end):null,zoneId:t.zoneId??null,spaceId:t.spaceId??null,
   ...(p?{assignedResourceIds:(p.requiredResourceIds??[]).map((id:string)=>Number(id.slice(14))),...(p.itinerantUnitId?{itinerantTeamId:Number(p.itinerantUnitId.slice(15))}:{})}:{})};
 }));
 const result={contractVersion:1,outcome:'PROPOSAL',scopeTaskIds:[...byId.keys()].sort((a,b)=>a-b),includePrerequisites:false,proposal:execution.proposal,
  proposedDraftSnapshot:draft,proposedDraftFingerprint:fingerprintAssistedPlanningSnapshotV1(draft),evidence:{...execution.evidence,technicalChainCertificate:cert},reasonCodes:execution.evidence.reasonCodes};
 const before=(await db.query('SELECT daily_technical_chains,daily_joint_groups,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows[0];
 const revisionId=session.current_config_revision_id;
 save('sql-probe-context',{planRevision:before.current_config_revision_id,sessionRevision:revisionId,scopeIds:result.scopeTaskIds,workingTaskIds:session.working_snapshot_json.tasks.map((t:any)=>t.taskId),syntheticMetadata:true});
 const contractNames=['assert_daily_technical_chains(integer,jsonb)','assert_daily_joint_groups(integer,jsonb)'];
 const definitions:any[]=[],replacements:any[]=[];let error:any,runId:any,step='admission-only-shadow';
 await db.query('BEGIN');
 try{
  for(const fn of contractNames){
   const definition=(await db.query('SELECT pg_get_functiondef($1::regprocedure) definition',['public.'+fn])).rows[0].definition;
   const needle=fn.startsWith('assert_daily_technical_chains')?" OR p.planner_next_profile#>>'{configuration,transport}' IS DISTINCT FROM 'NONE'":" OR p.planner_next_profile#>>'{configuration,transport}'<>'NONE'";
   assert.equal(definition.split(needle).length,2,fn);definitions.push({fn,definition});replacements.push({fn,needle,replacement:''});
   await db.query(definition.replace(needle,''));
  }
  step='attempted-authorities';await db.query('SET LOCAL ROLE service_role');
  await db.query("SELECT set_config('optiplan.daily_technical_chain_operation','versioned',true),set_config('optiplan.daily_joint_group_operation','versioned',true)");
  await db.query('UPDATE plans SET daily_technical_chains=$2,daily_joint_groups=$3,current_config_revision_id=$4 WHERE id=$1',[planId,{contractVersion:1,policies:input.technicalChains,by:users.admin.id,at:new Date().toISOString()},{contractVersion:1,groups:input.dailyJointGroups,by:users.admin.id,at:new Date().toISOString()},revisionId]);
  await db.query('RESET ROLE');
  step='canonical-revision';await db.query('UPDATE plan_config_revisions SET identity_json=$2,replay_snapshot_json=$3,fingerprint=$4 WHERE id=$1',[revisionId,canonical.identity,canonical.replay,canonical.identity.configurationFingerprint]);
  step='synthetic-result-metadata';const inserted=await db.query("INSERT INTO planning_runs(plan_id,status,execution_kind,assisted_session_id,base_stage_id,config_revision_id,scope_json,scope_task_ids_json,source_draft_fingerprint,assisted_result_json,result_fingerprint) VALUES($1,'success','ASSISTED_SCOPE',$2,$3,$4,$5,$6,$7,$8,encode(extensions.digest(convert_to($8::jsonb::text,'UTF8'),'sha256'),'hex')) RETURNING id",[planId,session.id,session.draft_base_stage_id,revisionId,read('scope').scope,JSON.stringify(result.scopeTaskIds),session.draft_fingerprint,result]);runId=inserted.rows[0].id;
  await db.query('SET LOCAL ROLE service_role');
  step='original-physical-consumer';await db.query('SELECT public.assert_daily_technical_chain_snapshot($1,$2,$3,$4)',[planId,draft,revisionId,runId]);
 }catch(e:any){error={code:e.code,message:e.message,step,where:e.where};}finally{await db.query('ROLLBACK');}
 assert.deepEqual((await db.query('SELECT daily_technical_chains,daily_joint_groups,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows[0],before);
 save('sql-consumer-probe',{status:error?'REJECTED':'PASS',error:error??null,replacements,syntheticMetadata:true,physicalWitnessLiteral:true,certificate:cert,runId,rolledBack:true,acceptedStages:0,changedProductSource:false,sourceRun:probeDirectory});
 return {error};
}
