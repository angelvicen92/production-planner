import assert from 'node:assert/strict';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {buildCanonicalPlanConfig} from '../../../server/dayConfigurationService';
import {withDailyOperationalMeals} from '../../../server/operationalMealPolicy';
export async function configurationAttacks(ctx:any){
 const {planId,api,request,db,save,users,storage,url,anon,label}=ctx;
 const path=`/api/plans/${planId}/day-configuration`,view=async()=>(await api(`/api/plans/${planId}/effective-configuration`)).operationalMeals;
 let v=await view();const failures:any[]=[];
 const rows=async()=>(await db.query('SELECT daily_operational_meal_policies,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows;
 const before=await rows();
 for(const [name,change] of [
  ['unknown-resource',(p:any)=>p.planResourceItemIds=[2147483647]],['unknown-space',(p:any)=>p.spaceIds=[2147483647]],
  ['duration',(p:any)=>p.durationMinutes=1440],['reversed-window',(p:any)=>p.window={start:'12:00',end:'10:00'}],['off-grid',(p:any)=>p.durationMinutes=7],
  ['empty',(p:any)=>{p.planResourceItemIds=[];p.spaceIds=[];}],['invalid-unit',(p:any)=>p.unitId=2147483647],
 ] as const){const bad=structuredClone(v.authority);change(bad.policies[0]);const r=await request(path,'PUT',{operationalMealPolicies:bad,expectedRevisionId:v.revisionId});assert.ok([400,422].includes(r.status),name);failures.push({name,...r});assert.deepEqual(await rows(),before);}
 const duplicate=structuredClone(v.authority);duplicate.policies.push({...duplicate.policies[0],id:duplicate.policies[0].planResourceItemIds.length?'duplicate-physical-member':duplicate.policies[0].id});const dup=await request(path,'PUT',{operationalMealPolicies:duplicate,expectedRevisionId:v.revisionId});assert.equal(dup.status,400);failures.push({name:'duplicated-member-across-policies',...dup});
 const foreign=(await db.query('SELECT id FROM plan_resource_items WHERE plan_id<>$1 ORDER BY id LIMIT 1',[planId])).rows[0];if(foreign){const bad=structuredClone(v.authority);bad.policies[0].planResourceItemIds=[Number(foreign.id)];const r=await request(path,'PUT',{operationalMealPolicies:bad,expectedRevisionId:v.revisionId});assert.equal(r.status,422);failures.push({name:'foreign-day',...r});}
 for(const role of ['viewer','aux','norole','anonymous']){const r=await request(path,'PUT',{operationalMealPolicies:v.authority,expectedRevisionId:v.revisionId},role);assert.equal(r.status,role==='anonymous'?401:403);failures.push({role,...r});}
 const stale=await request(path,'PUT',{operationalMealPolicies:v.authority,expectedRevisionId:2147483647});assert.equal(stale.status,409);failures.push({name:'stale-CAS',...stale});
 const changed=structuredClone(v.authority);changed.policies[0].id+='-race';const race=await Promise.all(['admin','production'].map(role=>request(path,'PUT',{operationalMealPolicies:changed,expectedRevisionId:v.revisionId},role)));assert.deepEqual(race.map((r:any)=>r.status).sort(),[200,409]);failures.push({name:'concurrent-edits',race});v=await view();
 const stable=await rows();
 const emptyUnit=await request('/api/itinerant-teams','POST',{code:'invalid-empty',name:'Invalid empty composition',resourceItemIds:[],availabilityWindows:[{start:'08:00',end:'16:00'}],transitionMinutes:0,isActive:true});assert.equal(emptyUnit.status,400);failures.push({name:'unit-without-physical-members',...emptyUnit});
 const sql:any[]=[];const reject=async(name:string,fn:()=>Promise<any>,pattern:RegExp)=>{let error:any;await db.query('BEGIN');try{await fn();}catch(e:any){error={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}sql.push({name,error,rolledBack:true});assert.match(error?.message??'',pattern,name);};
 await reject('direct-service-authority',async()=>{await db.query('SET LOCAL ROLE service_role');await db.query('UPDATE plans SET daily_operational_meal_policies=NULL WHERE id=$1',[planId]);},/REQUIRES_VERSIONED/);
 const old=await buildCanonicalPlanConfig(planId,storage),nextAuthority=structuredClone(v.authority);nextAuthority.policies[0].id+='-transaction';
 const next=await buildCanonicalPlanConfig(planId,storage,withDailyOperationalMeals(old.input,nextAuthority));
 await reject('failure-after-authority-is-atomic',async()=>{
  await db.query("CREATE FUNCTION pg_temp.reject_operational_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'U00Z_ATOMIC_PROBE';END $$;CREATE TRIGGER u00z_atomic BEFORE INSERT ON plan_config_revisions FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_operational_revision()");await db.query('SET LOCAL ROLE service_role');
  await db.query("SELECT apply_day_config_operation_v5($1,$2,'EDIT',$3,$4,$5,$6,$7,$8,$9)",[planId,users.admin.id,{operationalMealPolicies:nextAuthority,expectedRevisionId:v.revisionId},v.revisionId,old.identity,old.replay,next.identity,next.replay,{}]);
 },/U00Z_ATOMIC_PROBE/);
 for(const role of ['admin','production','viewer','aux','norole']){const r=await fetch(`${url}/rest/v1/plans?id=eq.${planId}`,{method:'PATCH',headers:{apikey:anon,Authorization:`Bearer ${users[role].token}`,'Content-Type':'application/json'},body:JSON.stringify({daily_operational_meal_policies:null})});assert.ok([400,401,403].includes(r.status));failures.push({name:'Data-API',role,status:r.status,body:await r.json()});}
 assert.deepEqual(await rows(),stable);save(label+'-configuration-negatives',{http:failures,sql});
}
export async function protectedAttacks(ctx:any){
 const {api,request,db,planId,accepted,save,label}=ctx,path=`/api/plans/${planId}/day-configuration`;
 const v=(await api(`/api/plans/${planId}/effective-configuration`)).operationalMeals;
 const retired=await request(path,'PUT',{operationalMealPolicies:{contractVersion:1,policies:[]},expectedRevisionId:v.revisionId});assert.equal(retired.status,409);
 const failures:any[]=[{mode:'retire-after-Stage',...retired}];
 for(const mode of ['time','resources','duration','Stage-content']){
  let error:any;await db.query('BEGIN');try{
   await db.query('SET LOCAL ROLE service_role');const t=accepted.activeStage.snapshotJson.tasks.find((t:any)=>t.startPlanned&&(mode!=='resources'||t.assignedResourceIds?.length))??accepted.activeStage.snapshotJson.tasks.find((t:any)=>t.startPlanned);
   if(mode==='time')await db.query("UPDATE daily_tasks SET start_planned='15:30',end_planned='15:55' WHERE plan_id=$1 AND id=$2",[planId,t.taskId]);
   if(mode==='resources')await db.query("UPDATE daily_tasks SET assigned_resource_ids='[]' WHERE plan_id=$1 AND id=$2",[planId,t.taskId]);
   if(mode==='duration')await db.query('UPDATE daily_tasks SET duration_override=5 WHERE plan_id=$1 AND id=$2',[planId,t.taskId]);
   if(mode==='Stage-content'){const forged=structuredClone(accepted.activeStage.snapshotJson);forged.operationalMeals[0].startPlanned='08:00';await db.query('UPDATE assisted_planning_stages SET snapshot_json=$2,snapshot_fingerprint=$3 WHERE id=$1',[accepted.activeStage.id,forged,fingerprintAssistedPlanningSnapshotV1(forged)]);}
  }catch(e:any){error={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}
  // A task without direct assignments may already store []; select a concrete
  // consumer when testing resource mutation so the attempted write is material.
  if(mode==='resources'&&!accepted.activeStage.snapshotJson.tasks.some((t:any)=>t.assignedResourceIds?.length))continue;
  failures.push({mode,error,rolledBack:true,hashRecomputed:mode==='Stage-content'});assert.ok(error,mode);
 }
 save(label+'-protected-negatives',failures);
}
export async function certificateAttacks(ctx:any){
 const {planId,db,run,draft,save,label,ordinal}=ctx;const failures:any[]=[];
 for(const mode of ['missing-meal','wrong-duration','wrong-window','missing-resource','invented-space','occupied-resource','omitted-draft-meal','invented-draft-meal','missing-future-task','protected-meal']){
  const original=run.assisted_result_json??run.assistedResultJson;if(mode==='protected-meal'&&!draft.activeStage.snapshotJson.operationalMeals?.length)continue;
  let error:any;await db.query('BEGIN');try{
   const forged=structuredClone(original),proof=forged.evidence.nominalPhysicalFutureWitness,m=mode==='missing-resource'?proof.operationalMeals.find((m:any)=>m.resourceIds.length):mode==='protected-meal'?proof.operationalMeals.find((m:any)=>draft.activeStage.snapshotJson.operationalMeals.some((p:any)=>p.policyId===m.id)):proof.operationalMeals[0];
   if(mode==='missing-meal')proof.operationalMeals.shift();
   if(mode==='wrong-duration'){m.end+=5;m.duration+=5;}
   if(mode==='wrong-window'){m.start+=480;m.end+=480;}
   if(mode==='missing-resource')m.resourceIds=[];
   if(mode==='invented-space')m.spaceIds=['space:2147483647'];
   if(mode==='occupied-resource'){const t=proof.tasks.find((t:any)=>t.requiredResourceIds?.some((id:string)=>m.resourceIds.includes(id))||m.spaceIds.includes(t.spaceId));assert.ok(t);m.start=t.start;m.end=m.start+m.duration;}
   if(mode==='omitted-draft-meal'){if(!forged.proposedDraftSnapshot.operationalMeals?.length)continue;delete forged.proposedDraftSnapshot.operationalMeals;}
   if(mode==='invented-draft-meal')forged.proposedDraftSnapshot.operationalMeals=[...(forged.proposedDraftSnapshot.operationalMeals??[]),{policyId:'break:invented',startPlanned:'10:00',endPlanned:'10:25'}];
   if(mode==='missing-future-task')proof.tasks.pop();
   if(mode==='protected-meal'){m.start+=5;m.end+=5;}
   proof.fingerprint=fingerprint(proof.tasks);forged.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(forged.proposedDraftSnapshot);
   await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') WHERE id=$1",[run.id,JSON.stringify(forged)]);
   await db.query('UPDATE assisted_planning_sessions SET draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$1',[draft.session.id,forged.proposedDraftSnapshot,forged.proposedDraftFingerprint]);
   await db.query('SET LOCAL ROLE service_role');await db.query('SELECT assert_operational_meal_snapshot($1,$2,$3)',[planId,forged.proposedDraftSnapshot,draft.currentConfigRevisionId]);
  }catch(e:any){error={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}
  failures.push({mode,error,hashesRecomputed:true,rolledBack:true});save(`${label}-S${ordinal}-certificate-negatives`,failures);assert.ok(error,mode);
 }
}
