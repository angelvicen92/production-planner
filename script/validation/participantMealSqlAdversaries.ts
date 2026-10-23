import assert from "node:assert/strict";
import type pg from "pg";

/** Adversarial mutations are rolled back on the local disposable DB only. */
export async function participantMealSqlAdversaries(db:pg.Client,planId:number,runId:number){
  assert.equal(db.host,"127.0.0.1");
  const r=(await db.query('SELECT * FROM public.planning_runs WHERE id=$1',[runId])).rows[0];
  const s=(await db.query("SELECT * FROM public.assisted_planning_sessions WHERE plan_id=$1 AND status='ACTIVE'",[planId])).rows[0];
  const base=(await db.query('SELECT snapshot_json FROM public.assisted_planning_stages WHERE id=$1',[r.base_stage_id])).rows[0].snapshot_json;
  const results:{name:string;rejected:string}[]=[];
  const meals=(v:any)=>v.evidence.selectedMealWitnesses.participant.scheduled;
  const row=(v:any,id:number)=>v.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===id);
  const mealId=Number(meals(r.assisted_result_json)[0].sourceTaskId.split(":")[1]);
  const otherId=r.assisted_result_json.proposedDraftSnapshot.tasks.find((t:any)=>!r.scope_task_ids_json.includes(t.taskId)).taskId;
  const reject=async(name:string,mutate:(result:any)=>void,options:{hash?:boolean;scope?:number[];role?:string;guard?:string}={})=>{
    await db.query('BEGIN');
    try{
      const result=structuredClone(r.assisted_result_json);mutate(result);
      if(options.scope){result.scopeTaskIds=options.scope;await db.query('UPDATE public.planning_runs SET scope_task_ids_json=$2 WHERE id=$1',[runId,JSON.stringify(options.scope)]);}
      await db.query(`UPDATE public.planning_runs SET assisted_result_json=$2::jsonb,
        result_fingerprint=CASE WHEN $3 THEN encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') ELSE repeat('0',64) END WHERE id=$1`,[runId,JSON.stringify(result),options.hash!==false]);
      await db.query(`UPDATE public.assisted_planning_sessions SET draft_snapshot_json=$2::jsonb,draft_fingerprint=$3,
        draft_scope_json=jsonb_set(draft_scope_json,'{resolvedTaskIds}',$4::jsonb) WHERE id=$1`,[s.id,JSON.stringify(result.proposedDraftSnapshot),result.proposedDraftFingerprint,JSON.stringify(options.scope??r.scope_task_ids_json)]);
      if(options.role)await db.query('SET LOCAL ROLE authenticated');
      let failure:any;
      try{await db.query('SELECT public.assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,options.guard==='draft'?'0'.repeat(64):result.proposedDraftFingerprint,options.guard==='base'?null:r.base_stage_id,options.guard==='config'?Number(r.config_revision_id)+1000:r.config_revision_id]);}
      catch(error){failure=error;}
      assert.ok(failure,`forged result accepted: ${name}`);
      const message=String(failure.message);
      assert.match(message,options.role?/permission denied/:options.guard?new RegExp(`STALE_${options.guard==='draft'?'DRAFT':options.guard==='base'?'BASE_STAGE':'CONFIG_REVISION'}`):/RUN_RESULT_INVALID|VALIDATION_NOT_ACCEPTABLE/);
      results.push({name,rejected:message});
    }finally{await db.query('ROLLBACK');}
  };
  await reject('hash corruption',()=>{}, {hash:false});
  await reject('empty authorized scope',()=>{}, {scope:[]});
  await reject('duplicate authorized scope',()=>{}, {scope:[mealId,mealId]});
  await reject('duplicate meal witness',v=>meals(v).push(structuredClone(meals(v)[0])));
  await reject('invented meal identity',v=>meals(v)[0].id='invented');
  await reject('invented participant identity',v=>meals(v)[0].participantId='participant:999999');
  await reject('invented meal source',v=>meals(v)[0].sourceTaskId='task:999999');
  await reject('duration forged consistently in witness and snapshot',v=>{meals(v)[0].end-=5;meals(v)[0].duration-=5;row(v,mealId).endPlanned='12:15';});
  await reject('window forged consistently in witness and snapshot',v=>{meals(v)[0].start=660;meals(v)[0].end=680;row(v,mealId).startPlanned='11:00';row(v,mealId).endPlanned='11:20';});
  await reject('capacity forged with internally matching witnesses',v=>{for(const m of meals(v)){m.start=720;m.end=740;const t=row(v,Number(m.sourceTaskId.split(':')[1]));t.startPlanned='12:00';t.endPlanned='12:20';}});
  await reject('mutation outside authorized scope',v=>{row(v,otherId).startPlanned='11:30';row(v,otherId).endPlanned='11:40';});
  await reject('missing materialized obligation',v=>{row(v,mealId).startPlanned=null;row(v,mealId).endPlanned=null;});
  await reject('no-op with matching draft, hash and snapshots',v=>{v.proposedDraftSnapshot=structuredClone(base);v.proposedDraftFingerprint=r.source_draft_fingerprint;});
  await reject('hard validity cannot be asserted by caller',v=>{v.evidence.hardValid=false;});
  await reject('required validity cannot be asserted by caller',v=>{v.evidence.requiredValid=false;});
  await reject('stale Draft',()=>{}, {guard:'draft'});
  await reject('stale base Stage',()=>{}, {guard:'base'});
  await reject('stale configuration revision',()=>{}, {guard:'config'});
  await reject('authenticated direct SQL access',()=>{}, {role:'authenticated'});
  assert.deepEqual((await db.query('SELECT assisted_result_json FROM public.planning_runs WHERE id=$1',[runId])).rows[0].assisted_result_json,r.assisted_result_json);
  assert.deepEqual((await db.query('SELECT draft_snapshot_json FROM public.assisted_planning_sessions WHERE id=$1',[s.id])).rows[0].draft_snapshot_json,s.draft_snapshot_json);
  return results;
}

export async function protectedMealSqlAdversary(db:pg.Client,planId:number,runId:number){
  assert.equal(db.host,'127.0.0.1');
  const r=(await db.query('SELECT * FROM public.planning_runs WHERE id=$1',[runId])).rows[0];
  const s=(await db.query("SELECT * FROM public.assisted_planning_sessions WHERE plan_id=$1 AND status='ACTIVE'",[planId])).rows[0];
  const result=structuredClone(r.assisted_result_json);
  const meal=result.evidence.selectedMealWitnesses.participant.scheduled[0];
  const id=Number(meal.sourceTaskId.split(':')[1]);
  const task=result.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===id);
  meal.start+=5;meal.end+=5;
  const time=(value:number)=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
  task.startPlanned=time(meal.start);task.endPlanned=time(meal.end);
  result.scopeTaskIds=[...new Set([...result.scopeTaskIds,id])];
  await db.query('BEGIN');
  try{
    await db.query(`UPDATE public.planning_runs SET scope_task_ids_json=$3::jsonb,assisted_result_json=$2::jsonb,
      result_fingerprint=encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') WHERE id=$1`,[runId,JSON.stringify(result),JSON.stringify(result.scopeTaskIds)]);
    await db.query(`UPDATE public.assisted_planning_sessions SET draft_snapshot_json=$2::jsonb,
      draft_scope_json=jsonb_set(draft_scope_json,'{resolvedTaskIds}',$3::jsonb) WHERE id=$1`,[s.id,JSON.stringify(result.proposedDraftSnapshot),JSON.stringify(result.scopeTaskIds)]);
    await assert.rejects(()=>db.query('SELECT public.assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,s.draft_fingerprint,r.base_stage_id,r.config_revision_id]),/RUN_RESULT_INVALID/);
  }finally{await db.query('ROLLBACK');}
  return {status:'PASS',protectedSourceTaskId:id,pendingExecution:true,rejected:'RUN_RESULT_INVALID',hashAndScopeAndDraftMatched:true};
}
