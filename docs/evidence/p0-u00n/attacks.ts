import assert from 'node:assert/strict';
import pg from 'pg';
import {writeFileSync} from 'node:fs';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {projectAssistedWorkingOrigin} from '../../../server/assistedWorkingOrigin';

export async function admissionAttacks({db,storage,planId,userId,viewerId,state,preview,current,oldProposal,inflight,directory,label}:any){
 const save=(name:string,v:any)=>writeFileSync(`${directory}/${label}-attack-${name}.json`,JSON.stringify(v,null,2));
 const snap=buildAssistedPlanningSnapshotV1(await storage.getTasksForPlan(planId));
 const stages=await storage.listAssistedPlanningStages(state.session.id);
 const pending=[...(preview.pendingTaskSnapshots??[]),...snap.tasks.filter((t:any)=>preview.addedTaskIds.includes(t.taskId))];
 const projections=Object.fromEntries(stages.map((b:any)=>[String(b.id),projectAssistedWorkingOrigin(b.snapshotJson,pending)]));
 const args=[planId,userId,state.session.id,state.draftBaseStageId,state.draftFingerprint,state.currentConfigRevisionId,preview.sourceToken,current.identity,current.replay,snap,'1'.repeat(64),JSON.stringify(preview.addedTaskIds),projections];
 const query='SELECT public.assisted_incorporate_stage_additions('+args.map((_,i)=>`$${i+1}`).join(',')+') v';
 const counts=async()=> (await db.query('SELECT (SELECT count(*) FROM public.plan_config_revisions WHERE plan_id=$1)::int revisions,(SELECT count(*) FROM public.assisted_obligation_transitions WHERE plan_id=$1)::int transitions,(SELECT draft_fingerprint FROM public.assisted_planning_sessions WHERE id=$2) fingerprint',[planId,state.session.id])).rows[0];
 const before=await counts();
 const probe=async(name:string,work:()=>Promise<any>,message:string)=>{
  await db.query('BEGIN');let receipt:any;
  try{await db.query('SET LOCAL ROLE service_role');await work();receipt={ok:true};}
  catch(e:any){receipt={ok:false,code:e.code,message:e.message};}
  finally{await db.query('ROLLBACK');}
  save(name,receipt);assert.equal(receipt.ok,false,name);assert.equal(receipt.message,message,name);assert.deepEqual(await counts(),before);
 };
 for(const [name,index,value,reason] of [
  ['cas',4,'0'.repeat(64),'STALE_DRAFT'],['base',3,999999,'STALE_BASE_STAGE'],['config',5,999999,'STALE_CONFIG_REVISION'],
  ['token',6,'0'.repeat(64),'REBOOTSTRAP_STALE_SOURCES'],['list',11,'[]','REBOOTSTRAP_STALE_SOURCES'],['actor',1,viewerId,'ASSISTED_ACCEPT_FORBIDDEN'],
 ] as const){await probe(name,()=>db.query(query,args.map((v,i)=>i===index?value:v)),reason);}
 const forged=structuredClone(projections) as any;
 const first=forged[String(state.activeStage.id)].snapshot.tasks.find((t:any)=>t.startPlanned);first.startPlanned='09:01';
 // The supplied fingerprints may be recomputed freely; semantic equality wins.
 for(const p of Object.values(forged) as any[])p.fingerprint=fingerprintAssistedPlanningSnapshotV1(p.snapshot);
 const missingFingerprint=structuredClone(projections) as any;delete missingFingerprint[String(stages[0].id)].fingerprint;
 await probe('missing-historical-fingerprint',()=>db.query(query,args.map((v,i)=>i===12?missingFingerprint:v)),'TASK_SET_MISMATCH');
 await probe('forged-origin',()=>db.query(query,args.map((v,i)=>i===12?forged:v)),'TASK_SET_MISMATCH');
 await probe('finish-after-source-addition',()=>db.query('SELECT public.assisted_finish_proposal($1,$2,$3)',[planId,inflight,oldProposal.assisted_result_json]),'STALE_OBLIGATION_SOURCES');
 const other=new pg.Client({host:'127.0.0.1',port:db.port,user:db.user,password:db.password,database:db.database});await other.connect();
 try{
  for(const [name,sql,id] of [
   ['task-writer','UPDATE public.daily_tasks SET duration_override=duration_override WHERE id=$1',state.draft.tasks[0].taskId],
   ['config-writer','UPDATE public.plans SET work_end=work_end WHERE id=$1',planId],
  ] as const){
   await other.query('BEGIN');try{await other.query(sql,[id]);await probe(name,()=>db.query(query,args),'could not obtain lock on relation '+(name==='task-writer'?'"public.daily_tasks"':'"public.plans"'));}finally{await other.query('ROLLBACK');}
  }
  await db.query('BEGIN');
  try{
   await db.query('SET LOCAL ROLE service_role');const admitted=await db.query(query,args);save('admission-uncommitted',admitted.rows);
   await other.query('BEGIN');
   try{
    await other.query('SET LOCAL ROLE service_role');
    let failure:any;try{await other.query('SELECT public.assisted_finish_proposal($1,$2,$3)',[planId,inflight,oldProposal.assisted_result_json]);}catch(e:any){failure={code:e.code,message:e.message};}
    save('finish-versus-admission',failure);assert.equal(failure.code,'55P03');
   }finally{await other.query('ROLLBACK');}
  }finally{await db.query('ROLLBACK');}
  assert.deepEqual(await counts(),before);
 }finally{await other.end();}
 // Exercise rollback after R2 and transition INSERT, without production switches.
 await db.query(`CREATE FUNCTION public.u00n_injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'U00N_INJECTED_FAILURE'; END $$;
 CREATE TRIGGER u00n_injected_failure BEFORE UPDATE OF obligation_transition_id ON public.assisted_planning_sessions FOR EACH ROW EXECUTE FUNCTION public.u00n_injected_failure()`);
 try{await probe('atomic-rollback',()=>db.query(query,args),'U00N_INJECTED_FAILURE');}
 finally{await db.query('DROP TRIGGER u00n_injected_failure ON public.assisted_planning_sessions; DROP FUNCTION public.u00n_injected_failure()');}
 save('atomic-counts',{before,after:await counts()});
}
