import pg from "pg";
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {buildCanonicalPlanConfig} from '../../../server/dayConfigurationService';
import {withDailyRoundStructure} from '../../../server/roundSynchronizationStructure';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';

/** Rollback-only adversarial probes, never part of either successful product journey. */
export async function configurationAttacks({db,storage,planId,users,structure,revision,directory,label,request,configPath}:any){
 const save=(name:string,r:any)=>writeFileSync(`${directory}/${label}-SQL-${name}.json`,JSON.stringify(r,null,2));
 const current=await buildCanonicalPlanConfig(planId,storage),next=structuredClone(structure);
 next.policies[0].lanes.forEach((l:any)=>l.preparationMinutesBetweenRounds=10);
 const candidate=await buildCanonicalPlanConfig(planId,storage,withDailyRoundStructure(current.input,next));
 const args=[planId,users.admin.id,'EDIT',{roundSynchronization:next,expectedRevisionId:revision},revision,current.identity,current.replay,candidate.identity,candidate.replay,{}];
 const query='SELECT public.apply_day_config_operation_v5('+args.map((_,i)=>`$${i+1}`).join(',')+')';
 const material=async()=> (await db.query('SELECT (SELECT jsonb_agg(to_jsonb(p)) FROM plans p WHERE id=$1) plans,(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM plan_config_revisions r WHERE plan_id=$1) revisions,(SELECT jsonb_agg(to_jsonb(s)) FROM assisted_planning_sessions s WHERE plan_id=$1) sessions',[planId])).rows;
 const before=await material();
 const probe=async(name:string,work:()=>Promise<any>,reason?:string)=>{
  let receipt:any;await db.query('BEGIN');
  try{await work();receipt={accepted:true};}catch(e:any){receipt={accepted:false,code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  save(name,receipt);assert.equal(receipt.accepted,false,name);if(reason)assert.equal(receipt.message,reason,name);assert.deepEqual(await material(),before,name);
 };
 const call=async(values=args)=>{await db.query('SET LOCAL ROLE service_role');return db.query(query,values);};
 for(const role of ['aux','viewer','norole'])await probe('actor-'+role,()=>call(args.map((v,i)=>i===1?users[role].id:v)),'PERMISSION_DENIED');
 for(const role of ['anon','authenticated'])await probe('grant-'+role,async()=>{await db.query('SET LOCAL ROLE '+role);await db.query(query,args);});
 for(const status of ['done','in_progress'])await probe('executed-'+status,async()=>{await db.query('UPDATE daily_tasks SET status=$2 WHERE id=$1',[structure.policies[0].lanes[0].taskIds[0],status]);await call();},'STALE_OBLIGATION_SOURCES');
 await probe('lock',async()=>{await db.query("INSERT INTO locks(plan_id,task_id,lock_type,created_by) VALUES($1,$2,'full',$3)",[planId,structure.policies[0].lanes[0].taskIds[0],users.admin.id]);await call();},'STALE_OBLIGATION_SOURCES');
 await probe('cas',()=>call(args.map((v,i)=>i===4?1:v)),'STALE_CONFIG_REVISION');
 await probe('replay',()=>call(args.map((v,i)=>i===8?{...candidate.replay,optimizerSnapshot:{...candidate.replay.optimizerSnapshot,vanCapacity:999}}:v)),'STALE_ROUND_STRUCTURE_REPLAY');
 await probe('identity',()=>call(args.map((v,i)=>i===7?{...candidate.identity,configurationFingerprint:'1'.repeat(64)}:v)),'STALE_ROUND_STRUCTURE_IDENTITY');
 const forged=await buildCanonicalPlanConfig(planId,storage,{...withDailyRoundStructure(current.input,next),workDay:{start:'08:00',end:'17:00'}});
 await probe('recomputed-identity-and-replay',()=>call(args.map((v,i)=>i===7?forged.identity:i===8?forged.replay:v)),'STALE_ROUND_STRUCTURE_REPLAY');
 await probe('direct-authority',async()=>{await db.query('SET LOCAL ROLE service_role');await db.query("UPDATE plans SET daily_round_synchronization=NULL WHERE id=$1",[planId]);},'ROUND_STRUCTURE_REQUIRES_VERSIONED_OPERATION');
 await probe('profile-088',async()=>{await db.query('SET LOCAL ROLE service_role');await db.query("UPDATE plans SET planner_next_configuration='{}' WHERE id=$1",[planId]);},'PLANNER_NEXT_CONFIGURATION_IMMUTABLE');
 await probe('historical-stage',async()=>{await db.query('SET LOCAL ROLE service_role');await db.query("UPDATE assisted_planning_stages SET snapshot_json='{}' WHERE plan_id=$1",[planId]);});
 const concurrent=new pg.Client({host:'127.0.0.1',port:db.port,user:db.user,password:db.password,database:db.database});await concurrent.connect();
 try{
  await concurrent.query('BEGIN');
  await concurrent.query('UPDATE daily_tasks SET duration_override=duration_override WHERE id=$1',[structure.policies[0].lanes[0].taskIds[0]]);
  const blocked=await request(configPath,'PUT',{roundSynchronization:next,expectedRevisionId:revision});save('concurrent-source-http',blocked);
  assert.equal(blocked.status,409,JSON.stringify(blocked));
 }finally{await concurrent.query('ROLLBACK');await concurrent.end();}
 assert.deepEqual(await material(),before);
 await probe('frozen-profile',async()=>{await db.query('SET LOCAL ROLE service_role');await db.query("UPDATE plans SET planner_next_profile=NULL WHERE id=$1",[planId]);},'PLANNER_NEXT_PROFILE_IMMUTABLE');
}

export async function roundCertificateAttacks({db,run,state,planId,directory,label}:any){
 for(const name of ['missing-preparation','move-one-lane','foreign-policy','replay']){
  await db.query('BEGIN');let receipt:any;
  try{
   const result=structuredClone(run.assisted_result_json);
   if(name==='missing-preparation')result.proposedDraftSnapshot.roundPreparations=[];
   if(name==='foreign-policy')result.proposedDraftSnapshot.roundPreparations[0].synchronizationId='forged';
   if(name==='move-one-lane'){
    const t=result.proposedDraftSnapshot.tasks.find((t:any)=>t.startPlanned);t.startPlanned='09:00';t.endPlanned='09:20';
    Object.assign(result.proposal.find((p:any)=>p.taskId===t.taskId),{startPlanned:t.startPlanned,endPlanned:t.endPlanned});
   }
   result.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(result.proposedDraftSnapshot);
   await db.query("UPDATE planning_runs SET assisted_result_json=$2,result_fingerprint=encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') WHERE id=$1",[run.id,result]);
   if(name==='replay')await db.query("UPDATE plan_config_revisions SET replay_snapshot_json=jsonb_set(replay_snapshot_json,'{authorities,plan_workday,0,plannerNextAuthorities,roundSynchronizations}','[]') WHERE id=$1",[state.currentConfigRevisionId]);
   await db.query('SET LOCAL ROLE service_role');
   await db.query('SELECT public.assisted_apply_proposal($1,$2,$3,$4)',[planId,run.id,state.draftFingerprint,state.draftBaseStageId]);
   await db.query('SELECT public.assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,result.proposedDraftFingerprint,state.draftBaseStageId,state.currentConfigRevisionId]);
   receipt={accepted:true};
  }catch(e:any){receipt={accepted:false,code:e.code,message:e.message,hashesRecomputed:true};}
  finally{await db.query('ROLLBACK');}
  writeFileSync(`${directory}/${label}-certificate-${name}.json`,JSON.stringify(receipt,null,2));assert.equal(receipt.accepted,false,name);
 }
}
