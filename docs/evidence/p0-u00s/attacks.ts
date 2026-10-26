import pg from "pg";
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {buildCanonicalPlanConfig} from '../../../server/dayConfigurationService';
import {withDailyTechnicalChains} from '../../../server/technicalChainStructure';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';

/** Rollback-only adversarial probes, never part of either successful product journey. */
export async function configurationAttacks({db,storage,planId,users,structure,revision,directory,label,request,configPath,substituteId,foreignTaskId,foreignResourceId}:any){
 const save=(name:string,r:any)=>writeFileSync(`${directory}/${label}-SQL-${name}.json`,JSON.stringify(r,null,2));
 const current=await buildCanonicalPlanConfig(planId,storage),next=structuredClone(structure);
 next.policies[0].id+='-edited';
 const candidate=await buildCanonicalPlanConfig(planId,storage,withDailyTechnicalChains(current.input,next));
 const args=[planId,users.admin.id,'EDIT',{technicalChains:next,expectedRevisionId:revision},revision,current.identity,current.replay,candidate.identity,candidate.replay,{}];
 const query='SELECT public.apply_day_config_operation_v5('+args.map((_,i)=>`$${i+1}`).join(',')+')';
 const material=async()=> (await db.query('SELECT (SELECT jsonb_agg(to_jsonb(p)) FROM plans p WHERE id=$1) plans,(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM plan_config_revisions r WHERE plan_id=$1) revisions,(SELECT jsonb_agg(to_jsonb(s)) FROM assisted_planning_sessions s WHERE plan_id=$1) sessions',[planId])).rows;
 const before=await material();
 for(const role of ['aux','viewer','norole','anonymous']){
  const denied=await request(configPath,'PUT',{technicalChains:next,expectedRevisionId:revision},role);
  save('http-actor-'+role,{accepted:false,...denied});assert.equal(denied.status,role==='anonymous'?401:403);assert.deepEqual(await material(),before);
 }

 const probe=async(name:string,work:()=>Promise<any>,reason?:string)=>{
  let receipt:any;await db.query('BEGIN');
  try{await work();receipt={accepted:true};}catch(e:any){receipt={accepted:false,code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  save(name,receipt);assert.equal(receipt.accepted,false,name);assert.ok(!["42601","42702","42P01","42883"].includes(receipt.code),JSON.stringify(receipt));if(reason)assert.equal(receipt.message,reason,name);assert.deepEqual(await material(),before,name);
 };
 const call=async(values=args)=>{await db.query('SET LOCAL ROLE service_role');return db.query(query,values);};
 for(const role of ['aux','viewer','norole'])await probe('actor-'+role,()=>call(args.map((v,i)=>i===1?users[role].id:v)),'PERMISSION_DENIED');
 for(const role of ['anon','authenticated'])await probe('grant-'+role,async()=>{await db.query('SET LOCAL ROLE '+role);await db.query(query,args);});
 for(const status of ['done','in_progress'])await probe('executed-'+status,async()=>{await db.query('UPDATE daily_tasks SET status=$2 WHERE id=$1',[structure.policies[0].orderedTaskIds[0],status]);await call();},'STALE_OBLIGATION_SOURCES');
 await probe('lock',async()=>{await db.query("INSERT INTO locks(plan_id,task_id,lock_type,created_by) VALUES($1,$2,'full',$3)",[planId,structure.policies[0].orderedTaskIds[0],users.admin.id]);await call();},'STALE_OBLIGATION_SOURCES');
 await probe('dirty-draft',async()=>{await db.query("UPDATE assisted_planning_sessions SET draft_scope_json='{\"editKind\":\"MANUAL\"}' WHERE plan_id=$1 AND status='ACTIVE'",[planId]);await call();},'TECHNICAL_CHAIN_DIRTY_DRAFT');
 await probe('cas',()=>call(args.map((v,i)=>i===4?1:v)),'STALE_CONFIG_REVISION');
 await probe('replay',()=>call(args.map((v,i)=>i===8?{...candidate.replay,optimizerSnapshot:{...candidate.replay.optimizerSnapshot,vanCapacity:999}}:v)),'STALE_TECHNICAL_CHAIN_REPLAY');
 await probe('identity',()=>call(args.map((v,i)=>i===7?{...candidate.identity,configurationFingerprint:'1'.repeat(64)}:v)),'STALE_TECHNICAL_CHAIN_IDENTITY');
 const forged=await buildCanonicalPlanConfig(planId,storage,{...withDailyTechnicalChains(current.input,next),workDay:{start:'08:00',end:'17:00'}});
 await probe('recomputed-identity-and-replay',()=>call(args.map((v,i)=>i===7?forged.identity:i===8?forged.replay:v)),'STALE_TECHNICAL_CHAIN_REPLAY');
 await probe('direct-authority',async()=>{await db.query('SET LOCAL ROLE service_role');await db.query("UPDATE plans SET daily_technical_chains=NULL WHERE id=$1",[planId]);},'TECHNICAL_CHAIN_REQUIRES_VERSIONED_OPERATION');
 await probe('profile-088',async()=>{await db.query('SET LOCAL ROLE service_role');await db.query("UPDATE plans SET planner_next_configuration='{}' WHERE id=$1",[planId]);},'PLANNER_NEXT_CONFIGURATION_IMMUTABLE');
 await probe('historical-stage',async()=>{await db.query('SET LOCAL ROLE service_role');await db.query("UPDATE assisted_planning_stages SET snapshot_json='{}' WHERE plan_id=$1",[planId]);});
 const concurrent=new pg.Client({host:'127.0.0.1',port:db.port,user:db.user,password:db.password,database:db.database});await concurrent.connect();
 try{
  await concurrent.query('BEGIN');
  await concurrent.query('UPDATE daily_tasks SET duration_override=duration_override WHERE id=$1',[structure.policies[0].orderedTaskIds[0]]);
  const blocked=await request(configPath,'PUT',{technicalChains:next,expectedRevisionId:revision});save('concurrent-source-http',blocked);
  assert.equal(blocked.status,409,JSON.stringify(blocked));
 }finally{await concurrent.query('ROLLBACK');await concurrent.end();}
 assert.deepEqual(await material(),before);
 await probe('frozen-profile',async()=>{await db.query('SET LOCAL ROLE service_role');await db.query("UPDATE plans SET planner_next_profile=NULL WHERE id=$1",[planId]);},'PLANNER_NEXT_PROFILE_IMMUTABLE');
 const absent=await buildCanonicalPlanConfig(planId,storage,withDailyTechnicalChains(current.input,{contractVersion:1,policies:[]}));
 await probe('U00q-replay-without-material-authority',async()=>{
  await db.query('SET LOCAL ROLE service_role');
  const removed=(await db.query(query,[planId,users.admin.id,'EDIT',{technicalChains:{contractVersion:1,policies:[]},expectedRevisionId:revision},revision,current.identity,current.replay,absent.identity,absent.replay,{}])).rows[0].apply_day_config_operation_v5;
  await db.query(query,[planId,users.admin.id,'EDIT',{},removed,absent.identity,absent.replay,current.identity,current.replay,{}]);
 },'TECHNICAL_CHAIN_AUTHORITY_NOT_MATERIALIZED');
 const invalids:Record<string,(s:any)=>void>={
  unknown:s=>s.policies[0].orderedTaskIds[0]=2147483000,
  duplicate:s=>s.policies[0].orderedTaskIds[1]=s.policies[0].orderedTaskIds[0],
  reversed:s=>s.policies[0].orderedTaskIds.reverse(),
  resource:s=>s.policies[0].requiredResourceIds=[2147483000],
  'resource-not-required':s=>s.policies[0].requiredResourceIds=[substituteId],
  nontechnical:s=>s.policies[0].orderedTaskIds[0]=Math.max(...current.input.tasks.map(t=>t.id)),
 };
 if(foreignTaskId)invalids['foreign-day-task']=s=>s.policies[0].orderedTaskIds[0]=foreignTaskId;
 if(foreignResourceId)invalids['foreign-day-resource']=s=>s.policies[0].requiredResourceIds=[foreignResourceId];
 for(const [name,mutate] of Object.entries(invalids)){
  const invalid=structuredClone(next);mutate(invalid);
  await probe(name,()=>call(args.map((v,i)=>i===3?{technicalChains:invalid,expectedRevisionId:revision}:v)));
 }
 // Two real editors race on the exact same revision; only one commits.
 const race=await Promise.all([request(configPath,'PUT',{technicalChains:next,expectedRevisionId:revision},'production'),request(configPath,'PUT',{technicalChains:next,expectedRevisionId:revision})]);
 save('editors-race',race);assert.equal(race.filter(r=>r.status===200).length,1);assert.equal(race.filter(r=>r.status===409).length,1);
 const newRevision=(await db.query('SELECT current_config_revision_id FROM plans WHERE id=$1',[planId])).rows[0].current_config_revision_id;
 const restored=await request(configPath,'PUT',{technicalChains:structure,expectedRevisionId:Number(newRevision)});assert.equal(restored.status,200,JSON.stringify(restored));

}


export async function certificateAttacks({db,run,state,planId,directory,label,chainIds,substituteId}:any){
 for(const name of ['gap','substitution','false-adjacency','missing-member','replay','future-tamper']){
  await db.query('BEGIN');let receipt:any;
  try{
   const result=structuredClone(run.assisted_result_json),snapshot=result.proposedDraftSnapshot;
   const member=snapshot.tasks.find((t:any)=>t.taskId===chainIds[1]);
   if(name==='gap'||name==='false-adjacency'){member.startPlanned='12:00';member.endPlanned='12:20';Object.assign(result.proposal.find((t:any)=>t.taskId===member.taskId)??{},member);}
   if(name==='substitution'){member.assignedResourceIds=[substituteId];if(!member.startPlanned)result.evidence.technicalChainCertificate.tasks.find((t:any)=>t.taskId===member.taskId).assignedResourceIds=[substituteId];}
   if(name==='missing-member'){if(!member.startPlanned)result.evidence.technicalChainCertificate.tasks=result.evidence.technicalChainCertificate.tasks.filter((t:any)=>t.taskId!==member.taskId);member.startPlanned=null;member.endPlanned=null;}
   if(name==='future-tamper')result.evidence.technicalChainCertificate={status:'WITNESS',contextOnly:true,tasks:[]};
   result.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(snapshot);
   await db.query("UPDATE planning_runs SET assisted_result_json=$2,result_fingerprint=encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') WHERE id=$1",[run.id,result]);
   if(name==='replay')await db.query("UPDATE plan_config_revisions SET replay_snapshot_json=jsonb_set(replay_snapshot_json,'{authorities,plan_workday,0,plannerNextAuthorities,technicalChains}','[]') WHERE id=$1",[state.currentConfigRevisionId]);
   if(name==='future-tamper'&&snapshot.tasks.filter((t:any)=>chainIds.includes(t.taskId)&&t.startPlanned).length===3){
    // Full material chain does not use the future certificate: probe a partial forged snapshot instead.
    snapshot.tasks.find((t:any)=>t.taskId===chainIds[2]).startPlanned=null;
    await db.query('SET LOCAL ROLE service_role');await db.query('SELECT public.assert_daily_technical_chain_snapshot($1,$2,$3,$4)',[planId,snapshot,state.currentConfigRevisionId,run.id]);
   }else{
    await db.query('SET LOCAL ROLE service_role');
    await db.query('SELECT public.assisted_apply_proposal($1,$2,$3,$4)',[planId,run.id,state.draftFingerprint,state.draftBaseStageId]);
    await db.query('SELECT public.assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,result.proposedDraftFingerprint,state.draftBaseStageId,state.currentConfigRevisionId]);
   }
   receipt={accepted:true};
  }catch(e:any){receipt={accepted:false,code:e.code,message:e.message,hashesRecomputed:true};}
  finally{await db.query('ROLLBACK');}
  writeFileSync(`${directory}/${label}-certificate-${name}.json`,JSON.stringify(receipt,null,2));assert.equal(receipt.accepted,false,name);assert.ok(!["42601","42702","42P01","42883"].includes(receipt.code),JSON.stringify(receipt));
 }
}
