import assert from 'node:assert/strict';
import type pg from 'pg';
import type {EngineInput} from '../../../engine/types';
import {buildCanonicalPlanConfig} from '../../../server/dayConfigurationService';
import {withDailyAnchoredAccompaniments} from '../../../server/anchoredAccompanimentStructure';
import type {AnchoredAccompanimentStructure} from '../../../shared/anchoredAccompanimentStructure';
export async function atomicityAttack({db,storage,planId,input,structure,actorId,save}:{db:pg.Client;storage:Parameters<typeof buildCanonicalPlanConfig>[1];planId:number;input:EngineInput;structure:AnchoredAccompanimentStructure;actorId:string;save:(n:string,v:unknown)=>void}){
 const current=await buildCanonicalPlanConfig(planId,storage),changed=structuredClone(structure);changed.policies[0].id+='-rollback';
 const candidate=await buildCanonicalPlanConfig(planId,storage,withDailyAnchoredAccompaniments(input,changed));
 const state=async()=>({plan:(await db.query('SELECT to_jsonb(p) row FROM plans p WHERE id=$1',[planId])).rows,
  revisions:(await db.query('SELECT id,fingerprint,replay_snapshot_json FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id',[planId])).rows,
  sessions:(await db.query('SELECT to_jsonb(s) row FROM assisted_planning_sessions s WHERE plan_id=$1',[planId])).rows});
 const before=await state();let failure:any;
 await db.query('BEGIN');
 try{
  await db.query("CREATE FUNCTION pg_temp.u00u_inject_revision_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'U00U_INJECTED_AFTER_AUTHORITY_WRITE'; END $$");
  await db.query('CREATE TRIGGER zz_u00u_injected_failure BEFORE INSERT ON public.plan_config_revisions FOR EACH ROW EXECUTE FUNCTION pg_temp.u00u_inject_revision_failure()');
  await db.query('SET LOCAL ROLE service_role');
  await db.query('SELECT public.apply_day_config_operation_v5($1,$2,\'EDIT\',$3,$4,$5,$6,$7,$8,$9)',[planId,actorId,{anchoredAccompaniments:changed,expectedRevisionId:before.plan[0].row.current_config_revision_id},before.plan[0].row.current_config_revision_id,current.identity,current.replay,candidate.identity,candidate.replay,{}]);
  failure={accepted:true};
 }catch(e:any){failure={accepted:false,code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
 assert.equal(failure.accepted,false);assert.equal(failure.message,'U00U_INJECTED_AFTER_AUTHORITY_WRITE');assert.deepEqual(await state(),before);
 save('atomicity',{...failure,authorityRevisionSessionUnchanged:true});
}
export async function attacks({db,storage,planId,input,snapshot,revision,save}:{db:pg.Client;storage:Parameters<typeof buildCanonicalPlanConfig>[1];planId:number;input:EngineInput;snapshot:any;revision:number;save:(n:string,v:unknown)=>void}){
 const reject=async(name:string,run:()=>Promise<unknown>,reason:RegExp)=>{
  const before=(await db.query('SELECT to_jsonb(p) row FROM plans p WHERE id=$1',[planId])).rows;
  await db.query('BEGIN');let result:any;
  try{await db.query('SET LOCAL ROLE service_role');await run();result={accepted:true};}
  catch(e:any){result={accepted:false,code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  save(name,result);assert.equal(result.accepted,false,name);assert.match(result.message,reason);
  assert.deepEqual((await db.query('SELECT to_jsonb(p) row FROM plans p WHERE id=$1',[planId])).rows,before);
 };
 await reject('direct-write',()=>db.query("UPDATE plans SET daily_anchored_accompaniments='{}' WHERE id=$1",[planId]),/ANCHORED_REQUIRES_VERSIONED_OPERATION/);
 const policy=input.anchoredAccompaniments![0];
 const unit=input.itinerantCompositionSnapshot!.units.find(u=>u.id===input.tasks.find(t=>t.id===policy.anchorTaskId)!.itinerantTeamId)!;
 await reject('referenced-member-delete',()=>db.query('DELETE FROM daily_tasks WHERE id=$1',[policy.beforeTaskIds[0]]),/ANCHORED_MEMBER_REFERENCED/);
 await reject('referenced-member-duration',()=>db.query('UPDATE daily_tasks SET duration_override=5 WHERE id=$1',[policy.beforeTaskIds[0]]),/ANCHORED_MEMBER_REQUIRES_VERSIONED_CHANGE/);
 await reject('direct-member-assignment',()=>db.query("UPDATE daily_tasks SET assigned_resource_ids='[2147483647]' WHERE id=$1",[policy.beforeTaskIds[0]]),/ANCHORED_MEMBER_REQUIRES_ASSISTED_MATERIALIZATION/);
 for(const [name,change] of [
  ['missing-authority',(i:EngineInput)=>{delete i.anchoredAccompaniments;}],
  ['virtual-main',(i:EngineInput)=>{i.tasks.find(t=>t.id===policy.anchorTaskId)!.blocksSpace=false;}],
  ['misclassified-main',(i:EngineInput)=>{i.tasks.find(t=>t.id===policy.anchorTaskId)!.plannerNextKind='auxiliary';}],
  ['wrong-unit',(i:EngineInput)=>{i.tasks.find(t=>t.id===policy.anchorTaskId)!.itinerantTeamId=2147483647;}],
  ['invented-direct-resource',(i:EngineInput)=>{i.tasks.find(t=>t.id===policy.beforeTaskIds[0])!.declaredResourceIds=[2147483647];}],
 ] as const){
  const fake=structuredClone(input);change(fake);const canonical=await buildCanonicalPlanConfig(planId,storage,fake);
  await reject(`revision-${name}`,()=>db.query("INSERT INTO plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json) VALUES($1,$2,'DAY_OVERRIDE',$3,$4,$5,'{}')",[planId,revision,canonical.identity.configurationFingerprint,canonical.identity,canonical.replay]),/ANCHORED_.*NOT_MATERIALIZED/);
 }
 for(const [name,change] of [
  ['segment-gap',(s:any)=>{const t=s.tasks.find((t:any)=>t.taskId===policy.afterTaskIds[0]);const minute=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3));const hhmm=(v:number)=>`${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;t.startPlanned=hhmm(minute(t.startPlanned)+5);t.endPlanned=hhmm(minute(t.endPlanned)+5);}],
  ['omitted-member',(s:any)=>{s.tasks.find((t:any)=>t.taskId===policy.beforeTaskIds[0]).assignedResourceIds=[];}],
  ['forged-unit',(s:any)=>{s.tasks.find((t:any)=>t.taskId===policy.anchorTaskId).itinerantTeamId=2147483647;}],
  ['missing-segment',(s:any)=>{const t=s.tasks.find((t:any)=>t.taskId===policy.afterTaskIds[0]);t.startPlanned=null;t.endPlanned=null;}],
  ['competing-capacity',(s:any)=>{const memberIds=[policy.anchorTaskId,...policy.beforeTaskIds,...policy.afterTaskIds];const peer=input.tasks.find(t=>t.plannerNextKind==='auxiliary'&&!memberIds.includes(t.id))!;
   const anchor=s.tasks.find((t:any)=>t.taskId===policy.anchorTaskId),t=s.tasks.find((t:any)=>t.taskId===peer.id),start=Number(anchor.startPlanned.slice(0,2))*60+Number(anchor.startPlanned.slice(3));
   t.itinerantTeamId=unit.id;t.assignedResourceIds=unit.members.map(m=>m.planResourceItemId);t.startPlanned=anchor.startPlanned;const end=start+peer.durationOverrideMin!;t.endPlanned=`${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`;
  }],
 ] as const){const fake=structuredClone(snapshot);change(fake);await reject(`certificate-${name}`,()=>db.query('SELECT public.assert_daily_anchored_snapshot($1,$2,$3)',[planId,fake,revision]),/ANCHORED_(CERTIFICATE_INVALID|INCOMPLETE_OPERATION|UNIT_CAPACITY_CONFLICT)/);}
 const detached=structuredClone(snapshot);detached.tasks.find((t:any)=>t.taskId===policy.afterTaskIds[0]).startPlanned=null;detached.tasks.find((t:any)=>t.taskId===policy.afterTaskIds[0]).endPlanned=null;
 await reject('restore-helper-forgery',()=>db.query('SELECT public.assisted_apply_snapshot($1,$2)',[planId,detached]),/permission denied for function assisted_apply_snapshot/);
 await db.query('BEGIN');try{await db.query('SET LOCAL ROLE service_role');await db.query('SELECT public.assert_daily_anchored_snapshot($1,$2,$3)',[planId,snapshot,revision]);save('genuine-certificate',{accepted:true});}finally{await db.query('ROLLBACK');}
}
