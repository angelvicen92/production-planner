/** Rollback-only consumer probe. Synthetic run metadata is NOT a product proposal,
 * Draft or Stage receipt. Physical placements come literally from the engine. */
import assert from 'node:assert/strict';
import {fingerprint} from '../../../../engine/planner-next/fingerprint';
import {readFileSync} from 'node:fs';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from '../../../../server/assistedPlanningSnapshot';
import {certifyDailyTechnicalChain} from '../../../../server/technicalChainCertificate';
import {buildCanonicalPlanConfig} from '../../../../server/dayConfigurationService';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../../engine/planner-next/integration/engineInputAdapter';
async function candidateProbe(ctx:any,probeDirectory:string,mode='positive'){
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
 const changes=mutate(mode,input,execution);
 const {storage}=await import('../../../../server/storage');
 const {normalizePlanOptimizerSnapshotV1}=await import('../../../../server/planOptimizerSnapshot');
 const optimizer=mode==='below-minimum'?normalizePlanOptimizerSnapshotV1({...await storage.getPlanOptimizerSnapshot(planId),departureMinimumGroupSize:2}):undefined;
 const canonical=await buildCanonicalPlanConfig(planId,storage,input,optimizer);
 const boot=await fetch(`${appUrl}/api/plans/${planId}/assisted/session`,{method:'POST',headers:{Authorization:`Bearer ${users.admin.token}`,'Content-Type':'application/json'},body:'{}'});assert.equal(boot.status,200,await boot.clone().text());
 const session=(await db.query('SELECT * FROM assisted_planning_sessions WHERE plan_id=$1 AND status=\'ACTIVE\'',[planId])).rows[0];
 const byId=new Map<number,any>(execution.proposal.map((t:any)=>[Number(t.id.slice(5)),t]));
 const hhmm=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
 const draft:any=structuredClone(buildAssistedPlanningSnapshotV1(input.tasks.map((t:any)=>{
  const p:any=byId.get(t.id);return {id:t.id,startPlanned:p?hhmm(p.start):null,endPlanned:p?hhmm(p.end):null,zoneId:t.zoneId??null,spaceId:t.spaceId??null,
   ...(p?{assignedResourceIds:(p.requiredResourceIds??[]).map((id:string)=>Number(id.slice(14))),...(p.itinerantUnitId?{itinerantTeamId:Number(p.itinerantUnitId.slice(15))}:{})}:{})};
 })));
 if(mode==='draft-mismatch')draft.tasks.find((t:any)=>t.startPlanned!=null)!.startPlanned='18:25';
 const result={contractVersion:1,outcome:'PROPOSAL',scopeTaskIds:[...byId.keys()].sort((a,b)=>a-b),includePrerequisites:false,proposal:execution.proposal,
  proposedDraftSnapshot:draft,proposedDraftFingerprint:fingerprintAssistedPlanningSnapshotV1(draft),evidence:{...execution.evidence,technicalChainCertificate:cert},reasonCodes:execution.evidence.reasonCodes};
 save('focal-'+mode+'-result',{result,input,syntheticMetadata:true});
 const before=(await db.query('SELECT daily_technical_chains,daily_joint_groups,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows[0];
 const revisionId=session.current_config_revision_id;
 save('sql-probe-context',{planRevision:before.current_config_revision_id,sessionRevision:revisionId,scopeIds:result.scopeTaskIds,workingTaskIds:session.working_snapshot_json.tasks.map((t:any)=>t.taskId),syntheticMetadata:true});
 const contractNames=['assert_daily_technical_chains(integer,jsonb)','assert_daily_joint_groups(integer,jsonb)'];
 const definitions:any[]=[],replacements:any[]=[];let error:any,runId:any,step='admission-only-shadow';
 await db.query('BEGIN');
 try{
  if(!(await db.query("SELECT to_regprocedure('public.authenticated_transport_packets(integer,jsonb)') IS NOT NULL installed")).rows[0].installed)await db.query(readFileSync(process.env.G04A_MIGRATION_PATH??'supabase/migrations/131_authenticated_transport_physical_packets.sql','utf8'));
  for(const change of changes){await db.query(change.sql,change.params);}
  if(mode==='below-minimum'){
   await db.query('SET LOCAL ROLE service_role');await db.query("SELECT set_config('optiplan.transport_policy_operation','versioned',true)");
   await db.query('UPDATE plan_optimizer_snapshots SET departure_minimum_group_size=2 WHERE plan_id=$1',[planId]);await db.query('RESET ROLE');
  }
  save('installed-131-physical-consumer',(await db.query("SELECT pg_get_functiondef('public.assert_anchored_choice_witness(integer,jsonb,bigint)'::regprocedure) definition")).rows[0]);
  step='attempted-authorities';await db.query('SET LOCAL ROLE service_role');
  await db.query("SELECT set_config('optiplan.daily_technical_chain_operation','versioned',true),set_config('optiplan.daily_joint_group_operation','versioned',true)");
  await db.query('UPDATE plans SET daily_technical_chains=$2,daily_joint_groups=$3,current_config_revision_id=$4 WHERE id=$1',[planId,{contractVersion:1,policies:input.technicalChains,by:users.admin.id,at:new Date().toISOString()},{contractVersion:1,groups:input.dailyJointGroups,by:users.admin.id,at:new Date().toISOString()},revisionId]);
  await db.query('RESET ROLE');
  step='canonical-revision';await db.query('UPDATE plan_config_revisions SET identity_json=$2,replay_snapshot_json=$3,fingerprint=$4 WHERE id=$1',[revisionId,canonical.identity,canonical.replay,canonical.identity.configurationFingerprint]);
  step='synthetic-result-metadata';const inserted=await db.query("INSERT INTO planning_runs(plan_id,status,execution_kind,assisted_session_id,base_stage_id,config_revision_id,scope_json,scope_task_ids_json,source_draft_fingerprint,assisted_result_json,result_fingerprint) VALUES($1,'success','ASSISTED_SCOPE',$2,$3,$4,$5,$6,$7,$8,encode(extensions.digest(convert_to($8::jsonb::text,'UTF8'),'sha256'),'hex')) RETURNING id",[planId,session.id,session.draft_base_stage_id,revisionId,read('scope').scope,JSON.stringify(result.scopeTaskIds),session.draft_fingerprint,result]);runId=inserted.rows[0].id;
  await db.query('SET LOCAL ROLE service_role');
  if(mode==='positive')save('authenticated-packets',(await db.query('SELECT public.authenticated_transport_packets($1,$2) packets',[planId,JSON.stringify([...physical.tasks,...physical.participantMeals])])).rows[0]);
  step='candidate-physical-consumer';
  if(mode==='stale-revision')await db.query('SELECT public.assert_daily_technical_chain_snapshot($1,$2,$3,$4)',[planId,draft,Number(revisionId)-1,runId]);
  if(mode==='anonymous'||mode==='authenticated')await db.query('SET LOCAL ROLE '+(mode==='anonymous'?'anon':'authenticated'));
  step='candidate-physical-consumer';await db.query('SELECT public.assert_daily_technical_chain_snapshot($1,$2,$3,$4)',[planId,draft,revisionId,runId]);
 }catch(e:any){error={code:e.code,message:e.message,step,where:e.where};}finally{await db.query('ROLLBACK');}
 assert.deepEqual((await db.query('SELECT daily_technical_chains,daily_joint_groups,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows[0],before);
 save('focal-'+mode,{status:error?'REJECTED':'PASS',error:error??null,replacements,syntheticMetadata:true,physicalWitnessLiteral:mode==='positive',certificate:cert,runId,rolledBack:true,acceptedStages:0,changedProductSource:false,sourceRun:probeDirectory,mode,sourceChanges:changes,hashesRecalculated:true});
 return {error};
}


function mutate(mode:string,input:any,execution:any){
 const proof=execution.evidence.nominalPhysicalFutureWitness,policy=input.transportSettings,changes:any[]=[];
 const source=(id:string)=>input.tasks.find((t:any)=>'task:'+t.id===id),arrival=proof.tasks.filter((t:any)=>source(t.id)?.operationalRole==='transport_arrival').sort((a:any,b:any)=>a.start-b.start||a.id.localeCompare(b.id));
 const departure=proof.tasks.filter((t:any)=>source(t.id)?.operationalRole==='transport_departure').sort((a:any,b:any)=>a.start-b.start||a.id.localeCompare(b.id));
 const first=arrival[0],second=arrival.find((t:any)=>t.start>first.start),move=(t:any,start:number)=>{t.start=start;t.end=start+t.duration;};
 if(mode==='different-group')move(second,first.start+5);
 if(mode==='opposite-direction')move(departure[0],first.start);
 if(mode==='desynchronized')first.end+=5;
 if(mode==='oversize')move(second,first.start);
 if(mode==='below-minimum'){input.departureMinimumGroupSize=2;policy.departureMinimumGroupSize=2;}
 if(mode==='gap'){const start=second.start;for(const t of arrival.filter((t:any)=>t.start===start))move(t,first.start+25);}
 if(mode==='foreign-member')first.id='task:2147483647';
 if(mode==='duplicate')proof.tasks.push(structuredClone(first));
 if(mode==='wrong-participant')first.participantId=second.participantId;
 if(mode==='availability')move(first,535);
 if(mode==='outside-presence')move(departure.find((t:any)=>t.participantId==='participant:1'),910);
 if(mode==='meal-overlap'){const m=proof.participantMeals.find((m:any)=>m.participantId===departure[0].participantId);move(departure[0],m.start);}
 if(mode==='dependencies')proof.tasks.find((t:any)=>t.kind==='vocal').dependencies=[];
 if(mode==='workday-change')changes.push({sql:"UPDATE plans SET work_start='10:00',work_baseline_start='10:00' WHERE id=$1",params:[input.planId]});
 if(mode==='external-space'||mode==='forged-label'||mode==='external-resource'){
  const vocal=proof.tasks.find((t:any)=>t.kind==='vocal'&&t.participantId==='participant:12');move(vocal,600);const t=source(vocal.id);
  if(mode==='external-resource'){
   const transport=arrival.find((t:any)=>t.start===600),rid=input.planResourceItems.find((r:any)=>r.name==='CAM3').id;
   for(const item of [transport,vocal]){const raw=source(item.id);raw.assignedResourceIds=[rid];raw.declaredResourceIds=[...new Set([...(raw.declaredResourceIds??[]),rid])];item.requiredResourceIds=[...(item.requiredResourceIds??[]),'plan-resource:'+rid];changes.push({sql:'UPDATE daily_tasks SET assigned_resource_ids=$2 WHERE id=$1',params:[raw.id,JSON.stringify([rid])]});}
  }else{
   vocal.spaceId=first.spaceId;t.spaceId=Number(first.spaceId.slice(6));
   changes.push({sql:'UPDATE daily_tasks SET space_id=$2 WHERE id=$1',params:[t.id,t.spaceId]});
   if(mode==='forged-label')vocal.operationalRole='transport_arrival';
  }
 }
 // All attack metadata is recalculated from the manipulated output, as an
 // adversary can do. No invalid placement is ever fed into the search.
 proof.fingerprint=fingerprint(proof.tasks);
 return changes;
}

export async function sqlConsumerProbe(ctx:any,probeDirectory:string){
 const modes=['positive','different-group','opposite-direction','desynchronized','oversize','below-minimum','gap','foreign-member','duplicate','wrong-participant','availability','outside-presence','meal-overlap','dependencies','external-space','forged-label','external-resource','workday-change','draft-mismatch','stale-revision','anonymous','authenticated'];
 const rows=[];
 for(const mode of modes){
  const result=await candidateProbe(ctx,probeDirectory,mode);
  if(mode==='positive')assert.equal(result.error,undefined,JSON.stringify(result.error));
  else if(mode==='anonymous'||mode==='authenticated')assert.equal(result.error?.code,'42501',mode);
  else{
   assert.equal(result.error?.code,'P0001',JSON.stringify({mode,...result.error}));
   assert.equal(result.error.step,'candidate-physical-consumer','the negative must reach the physical consumer: '+mode);
   if(mode!=='stale-revision'&&mode!=='workday-change')assert.doesNotMatch(result.error.message,/AUTHENTIC_PROPOSAL|(?:^|_)SOURCE(?:_|$)|FINGERPRINT|CERTIFICATE_REQUIRED|STALE|TRANSPORT_REVISION_AUTHORITY/,'a source/hash guard is not physical evidence: '+mode);
   if(mode==='external-resource')assert.equal(result.error.message,'ANCHORED_WITNESS_RESOURCE_CONFLICT');
   if(mode==='external-space'||mode==='forged-label')assert.equal(result.error.message,'ANCHORED_WITNESS_SPACE_CONFLICT');
  }
  rows.push({mode,error:result.error??null,rolledBack:true,syntheticMetadata:true});ctx.save('focal-summary',rows);
 }
 return {};
}
