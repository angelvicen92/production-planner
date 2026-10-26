import assert from 'node:assert/strict';
import type pg from 'pg';
import type {EngineInput} from '../../../engine/types';
import type {DailyTaskOperationScopes} from '../../../shared/dailyTaskOperationScopes';
import {buildCanonicalPlanConfig} from '../../../server/dayConfigurationService';
import {withDailyTaskOperationScopes} from '../../../server/dailyTaskOperationScopes';
export async function attacks({db,storage,planId,input,structure,revision,actorId,snapshot,save}:{db:pg.Client;storage:Parameters<typeof buildCanonicalPlanConfig>[1];planId:number;input:EngineInput;structure:DailyTaskOperationScopes;revision:number;actorId:string;snapshot?:any;save:(n:string,v:unknown)=>void}){
 const state=async()=>({plan:(await db.query('SELECT to_jsonb(p) row FROM plans p WHERE id=$1',[planId])).rows,revisions:(await db.query('SELECT * FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id',[planId])).rows,sessions:(await db.query('SELECT * FROM assisted_planning_sessions WHERE plan_id=$1 ORDER BY id',[planId])).rows});
 const reject=async(name:string,run:()=>Promise<unknown>,reason:RegExp)=>{const before=await state();let result:any;await db.query('BEGIN');
  try{await db.query('SET LOCAL ROLE service_role');await run();result={accepted:true};}catch(e:any){result={accepted:false,code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  save(name,result);assert.equal(result.accepted,false,name);assert.match(result.message,reason,name);assert.deepEqual(await state(),before);
 };
 const policy=structure.policies[0],task=input.tasks.find(t=>t.id===policy.taskId)!;
 await reject('direct-authority-write',()=>db.query("UPDATE plans SET daily_task_operation_scopes='{}' WHERE id=$1",[planId]),/TASK_SCOPE_REQUIRES_VERSIONED_OPERATION/);
 await reject('referenced-delete',()=>db.query('DELETE FROM daily_tasks WHERE id=$1',[task.id]),/TASK_SCOPE_REFERENCED/);
 await reject('referenced-location',()=>db.query('UPDATE daily_tasks SET space_id=2147483647 WHERE id=$1',[task.id]),/TASK_SCOPE_REQUIRES_VERSIONED_CHANGE/);
 await reject('direct-materialization',()=>db.query("UPDATE daily_tasks SET assigned_resource_ids='[]' WHERE id=$1",[task.id]),/TASK_SCOPE_REQUIRES_ASSISTED_MATERIALIZATION/);
 for(const [name,change] of [
  ['absent-authority',(i:EngineInput)=>{delete i.dailyTaskOperationScopes;}],
  ['invented-authority',(i:EngineInput)=>{i.dailyTaskOperationScopes![0].itinerantUnitId=2147483647;}],
  ['agenda',(i:EngineInput)=>{i.tasks.find(t=>t.id===task.id)!.agendaScope='PHYSICAL_SPACE';}],
  ['physical',(i:EngineInput)=>{i.tasks.find(t=>t.id===task.id)!.blocksSpace=false;}],
  ['inheritance',(i:EngineInput)=>{i.tasks.find(t=>t.id===task.id)!.resourceInheritance='LOCATION';}],
  ['direct-provenance',(i:EngineInput)=>{i.tasks.find(t=>t.id===task.id)!.declaredResourceIds=[];}],
 ] as const){const fake=structuredClone(input);change(fake);const canonical=await buildCanonicalPlanConfig(planId,storage,fake);
  await reject(`revision-${name}`,()=>db.query("INSERT INTO plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json) VALUES($1,$2,'DAY_OVERRIDE',$3,$4,$5,'{}')",[planId,revision,canonical.identity.configurationFingerprint,canonical.identity,canonical.replay]),/TASK_SCOPE_.*(NOT_MATERIALIZED|PROVENANCE)/);
 }
 const canonical=await buildCanonicalPlanConfig(planId,storage),changed=structuredClone(structure);changed.policies[0].agendaScope='PHYSICAL_SPACE';
 const candidate=await buildCanonicalPlanConfig(planId,storage,withDailyTaskOperationScopes(input,changed));
 const operation=()=>db.query("SELECT apply_day_config_operation_v5($1,$2,'EDIT',$3,$4,$5,$6,$7,$8,'{}')",[planId,actorId,{taskOperationScopes:changed,expectedRevisionId:revision},revision,canonical.identity,canonical.replay,candidate.identity,candidate.replay]);
 if(!snapshot){
  for(const [name,change] of [
   ['unknown-unit',(p:any)=>p.itinerantUnitId=2147483647],['resource-absent',(p:any)=>p.declaredResourceIds=[2147483647]],['resource-omitted',(p:any)=>p.declaredResourceIds=[]],['unknown-task',(p:any)=>p.taskId=2147483647],
  ] as const){const bad=structuredClone(structure);change(bad.policies[0]);await reject(name,()=>db.query('SELECT assert_daily_task_operation_scopes($1,$2)',[planId,bad]),/TASK_SCOPE_(INVALID_UNIT|DIRECT_RESOURCE_MISSING|DIRECT_RESOURCE_PROVENANCE|INVALID_TASK)/);}
  const duplicate=structuredClone(structure);duplicate.policies.push(duplicate.policies[0]);await reject('duplicate',()=>db.query('SELECT assert_daily_task_operation_scopes($1,$2)',[planId,duplicate]),/TASK_SCOPE_INVALID_STRUCTURE/);
  // Closing the test session inside the rolled-back attack isolates the writer's
  // protection check from the independent bootstrap-source freshness check.
  for(const status of ['done','in_progress'])await reject(`execution-${status}`,async()=>{await db.query("UPDATE assisted_planning_sessions SET status='CLOSED' WHERE plan_id=$1",[planId]);await db.query('UPDATE daily_tasks SET status=$1 WHERE id=$2',[status,task.id]);await operation();},/TASK_SCOPE_PROTECTED_DECISIONS/);
  await reject('lock',async()=>{await db.query("UPDATE assisted_planning_sessions SET status='CLOSED' WHERE plan_id=$1",[planId]);await db.query("INSERT INTO locks(plan_id,task_id,lock_type,created_by) VALUES($1,$2,'time',$3)",[planId,task.id,actorId]);await operation();},/TASK_SCOPE_PROTECTED_DECISIONS/);
  await reject('atomicity',async()=>{
   await db.query("RESET ROLE");await db.query("CREATE FUNCTION pg_temp.u00v_inject_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (SELECT daily_task_operation_scopes#>>'{policies,0,agendaScope}' FROM public.plans WHERE id=NEW.plan_id) IS DISTINCT FROM 'PHYSICAL_SPACE' THEN RAISE EXCEPTION 'U00V_INJECTION_TOO_EARLY'; END IF; RAISE EXCEPTION 'U00V_AFTER_AUTHORITY_WRITE'; END $$");
   await db.query('CREATE TRIGGER zz_u00v_inject_failure BEFORE INSERT ON public.plan_config_revisions FOR EACH ROW EXECUTE FUNCTION pg_temp.u00v_inject_failure()');await db.query('SET LOCAL ROLE service_role');await operation();
  },/U00V_AFTER_AUTHORITY_WRITE/);
 }else{
  await db.query('BEGIN');try{await db.query('SET LOCAL ROLE service_role');await db.query('SELECT assert_task_scope_snapshot($1,$2,$3)',[planId,snapshot,revision]);save('genuine-material-validation',{accepted:true});}finally{await db.query('ROLLBACK');}
  for(const [name,change] of [
   ['unit',(s:any)=>s.tasks.find((t:any)=>t.taskId===task.id).itinerantTeamId=2147483647],
   ['member',(s:any)=>s.tasks.find((t:any)=>t.taskId===task.id).assignedResourceIds.pop()],
   ['duplicate-resource',(s:any)=>{const t=s.tasks.find((t:any)=>t.taskId===task.id);t.assignedResourceIds.push(t.assignedResourceIds[0]);}],
   ['space',(s:any)=>s.tasks.find((t:any)=>t.taskId===task.id).spaceId=2147483647],
   ['participant-window',(s:any)=>{const t=s.tasks.find((t:any)=>t.taskId===task.id);t.startPlanned='11:30';t.endPlanned=task.durationOverrideMin===15?'11:45':'11:50';}],
   ['physical-conflict',(s:any)=>{const real=s.tasks.find((t:any)=>t.taskId===task.id),other=s.tasks.find((t:any)=>t.taskId!==task.id&&t.spaceId===real.spaceId);other.startPlanned=real.startPlanned;other.endPlanned=real.endPlanned;}],
  ] as const){const fake=structuredClone(snapshot);change(fake);await reject(`snapshot-${name}`,()=>db.query('SELECT assert_task_scope_snapshot($1,$2,$3)',[planId,fake,revision]),/TASK_SCOPE_(UNIT_INVALID_OR_UNAVAILABLE|PHYSICAL_RESOURCES|WINDOW_OR_IDENTITY|PHYSICAL_CONFLICT)/);}
  const peer=input.tasks.find(t=>t.id!==task.id&&t.spaceId!==task.spaceId&&t.itinerantTeamRequirement==='none'&&t.resourceRequirements?.byItem&&Object.keys(t.resourceRequirements.byItem).some(key=>Object.hasOwn(task.resourceRequirements?.byItem??{},key)));
  if(peer){const fake=structuredClone(snapshot),real=fake.tasks.find((t:any)=>t.taskId===task.id),other=fake.tasks.find((t:any)=>t.taskId===peer.id);other.startPlanned=real.startPlanned;other.endPlanned=real.endPlanned;
   await reject('snapshot-direct-kit-conflict',()=>db.query('SELECT assert_task_scope_snapshot($1,$2,$3)',[planId,fake,revision]),/TASK_SCOPE_PHYSICAL_CONFLICT/);}
 }
 return {checked:true,atomicRollback:true};
}
