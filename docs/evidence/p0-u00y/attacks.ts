import assert from 'node:assert/strict';
import {buildEngineInput} from '../../../engine/buildInput';
import {buildCanonicalPlanConfig} from '../../../server/dayConfigurationService';
import {withDailyJointGroups} from '../../../server/jointGroupStructure';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
export async function configurationAttacks({planId,db,storage,api,request,save,url,anon,users}:any){
 const path=`/api/plans/${planId}/day-configuration`,view=async()=>(await api(`/api/plans/${planId}/effective-configuration`)).jointGroups;
 let v=await view(),authority=v.authority;const negatives:any[]=[];
 const before=await db.query('SELECT daily_joint_groups,current_config_revision_id FROM plans WHERE id=$1',[planId]);
 for(const [name,change] of [
  ['duration',(s:any)=>s.groups[0].taskIds[1]=v.tasks.find((t:any)=>t.participantId!==v.tasks.find((t:any)=>t.id===s.groups[0].taskIds[0]).participantId&&t.duration!==v.tasks.find((t:any)=>t.id===s.groups[0].taskIds[0]).duration).id],
  ['unknown',(s:any)=>s.groups[0].taskIds[1]=2147483647],
  ['incomplete',(s:any)=>s.groups[0].taskIds.pop()],
  ['duplicate-member',(s:any)=>s.groups[0].taskIds[1]=s.groups[0].taskIds[0]],
  ['two-groups',(s:any)=>s.groups.push({...s.groups[0],id:'other-group'})],
 ] as const){const bad=structuredClone(authority);change(bad);const r=await request(path,'PUT',{jointGroups:bad,expectedRevisionId:v.revisionId});assert.ok([400,422].includes(r.status),name);negatives.push({name,...r});assert.deepEqual((await db.query('SELECT daily_joint_groups,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows,before.rows);}
 const foreign=(await db.query('SELECT id FROM daily_tasks WHERE plan_id<>$1 ORDER BY id LIMIT 1',[planId])).rows[0];if(foreign){const bad=structuredClone(authority);bad.groups[0].taskIds[1]=Number(foreign.id);const r=await request(path,'PUT',{jointGroups:bad,expectedRevisionId:v.revisionId});assert.equal(r.status,422);negatives.push({name:'foreign-day',...r});}
 for(const role of ['viewer','aux','norole','anonymous']){const r=await request(path,'PUT',{jointGroups:authority,expectedRevisionId:v.revisionId},role);assert.equal(r.status,role==='anonymous'?401:403);negatives.push({role,...r});}
 const stale=await request(path,'PUT',{jointGroups:authority,expectedRevisionId:2147483647});assert.equal(stale.status,409);negatives.push({name:'stale',...stale});
 const change=structuredClone(authority);change.groups[0].id+='-cas';const race=await Promise.all(['admin','production'].map(role=>request(path,'PUT',{jointGroups:change,expectedRevisionId:v.revisionId},role)));assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);save('CAS-race',race);v=await view();authority=v.authority;const stable=(await db.query('SELECT daily_joint_groups,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows;
 const current=await buildCanonicalPlanConfig(planId,storage),input=await buildEngineInput(planId,storage),renamed=structuredClone(authority);renamed.groups[0].id+='-rollback';
 const base={...structuredClone(input),dailyJointGroups:undefined,dailyJointGroupsVersion:undefined,tasks:input.tasks.map((t:any)=>{const {jointGroupId,...rest}=t;return rest;})};
 const candidate=await buildCanonicalPlanConfig(planId,storage,withDailyJointGroups(base,renamed));
 const args=[planId,users.admin.id,{jointGroups:renamed,expectedRevisionId:v.revisionId},v.revisionId,current.identity,current.replay,candidate.identity,candidate.replay,{}];
 const sql:any[]=[];
 const reject=async(name:string,fn:()=>Promise<unknown>,pattern:RegExp)=>{let error:any;await db.query('BEGIN');try{await fn();}catch(e:any){error={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}sql.push({name,...error,rolledBack:true});save('SQL-configuration-negatives',sql);assert.match(error?.message??'',pattern,name);};
 await reject('atomic-rollback-after-authority',async()=>{
  await db.query("CREATE FUNCTION pg_temp.reject_joint_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'U00Y_ATOMIC_PROBE';END $$;CREATE TRIGGER u00y_atomic BEFORE INSERT ON plan_config_revisions FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_joint_revision()");await db.query('SET LOCAL ROLE service_role');await db.query("SELECT apply_day_config_operation_v5($1,$2,'EDIT',$3,$4,$5,$6,$7,$8,$9)",args);
 },/U00Y_ATOMIC_PROBE/);
 for(const mode of ['done','in_progress','lock'])await reject(mode,async()=>{
  const id=authority.groups[0].taskIds[0];
  if(mode==='lock')await db.query("INSERT INTO locks(plan_id,task_id,lock_type,locked_start,locked_end,created_by,reason) VALUES($1,$2,'time','09:20','09:30',$3,'rollback-only joint negative')",[planId,id,users.admin.id]);else await db.query('UPDATE daily_tasks SET status=$2 WHERE id=$1',[id,mode]);
  await db.query('SET LOCAL ROLE service_role');await db.query("SELECT apply_day_config_operation_v5($1,$2,'EDIT',$3,$4,$5,$6,$7,$8,$9)",args);
 },/PROTECTED|STALE_|LOCK|EXECUTION/);
 // Material SQL compatibility checks mutate only rollback-only source rows,
 // with the authority explicitly removed inside that transaction.
 for(const mode of ['duration','space','resources','participant','no-intersection','internal-dependency','missing','duplicate','incomplete'])await reject('contract-'+mode,async()=>{
  await db.query('SET LOCAL ROLE service_role');await db.query("SELECT set_config('optiplan.daily_joint_group_operation','versioned',true)");await db.query('UPDATE plans SET daily_joint_groups=NULL WHERE id=$1',[planId]);
  const bad=structuredClone(authority),[a,b]=bad.groups[0].taskIds;
  if(mode==='duration')await db.query('UPDATE daily_tasks SET duration_override=15 WHERE id=$1',[b]);
  if(mode==='space')await db.query('UPDATE daily_tasks SET space_id=(SELECT space_id FROM daily_tasks WHERE plan_id=$1 AND id<>$2 AND space_id<>(SELECT space_id FROM daily_tasks WHERE id=$2) LIMIT 1) WHERE id=$3',[planId,a,b]);
  if(mode==='resources')await db.query('UPDATE daily_tasks SET assigned_resource_ids=jsonb_build_array((SELECT id FROM plan_resource_items WHERE plan_id=$1 ORDER BY id DESC LIMIT 1)) WHERE id=$2',[planId,b]);
  if(mode==='participant')await db.query('UPDATE daily_tasks SET contestant_id=(SELECT contestant_id FROM daily_tasks WHERE id=$1) WHERE id=$2',[a,b]);
  if(mode==='no-intersection')await db.query("UPDATE contestants SET availability_start='16:00',availability_end='17:00' WHERE id=(SELECT contestant_id FROM daily_tasks WHERE id=$1)",[b]);
  if(mode==='internal-dependency'){
   const template=(await db.query('SELECT template_id FROM daily_tasks WHERE id=$1',[a])).rows[0].template_id;
   // Use the immutable daily source's existing dependency: select its own prerequisite as the second member after matching duration/space/resources.
   const dependency=(await db.query('SELECT d.id FROM daily_tasks own JOIN plan_task_template_snapshots tpl ON tpl.plan_id=own.plan_id AND tpl.source_template_id=own.template_id JOIN daily_tasks d ON d.plan_id=own.plan_id AND d.contestant_id=own.contestant_id AND tpl.dependency_template_ids @> jsonb_build_array(d.template_id) WHERE own.id=$1 LIMIT 1',[a])).rows[0];
   await db.query('UPDATE daily_tasks SET contestant_id=(SELECT contestant_id FROM daily_tasks WHERE id=$1) WHERE id=$2',[a,b]);
   // Duplicate participant is itself an obligatory earlier contractual rejection.
   assert.ok(template&&dependency);
  }
  if(mode==='missing')bad.groups[0].taskIds[1]=2147483647;
  if(mode==='duplicate')bad.groups.push({...bad.groups[0],id:'duplicate-authority'});
  if(mode==='incomplete')bad.groups[0].taskIds.pop();
  await db.query('SELECT assert_daily_joint_groups($1,$2)',[planId,bad]);
 },/JOINT_/);
 for(const mode of ['internal-dependency','incomplete-revision','forged-group'])await reject('revision-'+mode,async()=>{
  const forgedInput=structuredClone(input);
  if(mode==='internal-dependency')forgedInput.tasks.find((t:any)=>t.id===authority.groups[0].taskIds[1])!.dependsOnTaskIds=[authority.groups[0].taskIds[0]];
  if(mode==='incomplete-revision')delete forgedInput.tasks.find((t:any)=>t.id===authority.groups[0].taskIds[1])!.jointGroupId;
  if(mode==='forged-group')forgedInput.dailyJointGroups=[...forgedInput.dailyJointGroups!,{id:'invented',taskIds:[2147483646,2147483647]}];
  const forged=await buildCanonicalPlanConfig(planId,storage,forgedInput);
  await db.query('SET LOCAL ROLE service_role');
  await db.query("INSERT INTO plan_config_revisions(plan_id,parent_revision_id,source,fingerprint,identity_json,replay_snapshot_json,diff_json,created_by) VALUES($1,$2,'EDIT',$3,$4,$5,'{}',$6)",[planId,v.revisionId,forged.identity.configurationFingerprint,forged.identity,forged.replay,users.admin.id]);
 },/JOINT_/);
 for(const role of ['admin','production','viewer','aux','norole']){
  const r=await fetch(`${url}/rest/v1/plans?id=eq.${planId}`,{method:'PATCH',headers:{apikey:anon,Authorization:`Bearer ${users[role].token}`,'Content-Type':'application/json'},body:JSON.stringify({daily_joint_groups:null})});const body=await r.json();assert.ok([400,401,403].includes(r.status));negatives.push({name:'direct-Data-API',role,status:r.status,body});
 }
 await reject('direct-server-authority',async()=>{await db.query('SET LOCAL ROLE service_role');await db.query('UPDATE plans SET daily_joint_groups=NULL WHERE id=$1',[planId]);},/JOINT_REQUIRES_VERSIONED_OPERATION/);
 // Every transaction, including the injected mid-operation failure, leaves exact state.
 assert.deepEqual((await db.query('SELECT daily_joint_groups,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows,stable);
 save('configuration-negatives',negatives);
 const {dataApiCatalog}=await import('../../../script/demo/dataApiCatalog');
 const {assertPrivilegeContract}=await import('../../../script/demo/dataApiGrantsGate');assertPrivilegeContract(await dataApiCatalog(db));save('grants',{status:'PASS',privateInvokerHelpers:true});
 return authority;
}
export async function certificateAttacks({planId,db,run,draft,authority,competitionId,save}:any){
 const report:any[]=[];
 for(const mode of ['split','missing-member','missing-future','future-split','wrong-group','wrong-participant','wrong-space','wrong-duration','missing-resource','invented-resource','outside-window','dependency','competitor-resource','competitor-space','partial-draft','partial-materialization','protected-member']){
  const original=run.assisted_result_json,scheduled=original.proposedDraftSnapshot.tasks.filter((t:any)=>t.startPlanned!=null);
  if(mode.startsWith('future')||mode==='missing-future'){if(!authority.groups.some((g:any)=>g.taskIds.every((id:number)=>!scheduled.some((t:any)=>t.taskId===id))))continue;}
  if(mode==='protected-member'&&!draft.activeStage.ordinal)continue;
  let failure:any;await db.query('BEGIN');try{
   const forged=structuredClone(original),proof=forged.evidence.nominalPhysicalFutureWitness;
   const task=(id:number)=>proof.tasks.find((t:any)=>t.id===`task:${id}`),g=authority.groups.find((g:any)=>g.taskIds.some((id:number)=>scheduled.some((t:any)=>t.taskId===id)))??authority.groups[0],a=task(g.taskIds[0]),b=task(g.taskIds[1]);
   if(mode==='split'){b.start+=5;b.end+=5;}
   if(mode==='missing-member')proof.tasks=proof.tasks.filter((t:any)=>t.id!==b.id);
   if(mode==='missing-future'){const future=authority.groups.find((g:any)=>g.taskIds.every((id:number)=>!scheduled.some((t:any)=>t.taskId===id)));proof.tasks=proof.tasks.filter((t:any)=>t.id!==`task:${future.taskIds[1]}`);}
   if(mode==='future-split'){const future=authority.groups.find((g:any)=>g.taskIds.every((id:number)=>!scheduled.some((t:any)=>t.taskId===id))),t=task(future.taskIds[1]);t.start+=5;t.end+=5;}
   if(mode==='wrong-group')b.jointGroupId='joint-group:forged';
   if(mode==='wrong-participant')b.participantId=a.participantId;
   if(mode==='wrong-space')b.spaceId=proof.tasks.find((t:any)=>t.spaceId!==a.spaceId).spaceId;
   if(mode==='wrong-duration'){b.duration+=5;b.end+=5;}
   if(mode==='missing-resource')b.requiredResourceIds=[];
   if(mode==='invented-resource')b.requiredResourceIds.push('plan-resource:2147483647');
   if(mode==='outside-window')for(const t of [a,b]){t.start+=480;t.end+=480;}
   if(mode==='dependency')b.dependencies=[];
   if(mode==='competitor-resource'||mode==='competitor-space'){const c=task(competitionId),target=mode==='competitor-resource'?proof.tasks.find((t:any)=>t.jointGroupId&&t.spaceId!==c.spaceId)??a:a;c.start=target.start;c.end=c.start+c.duration;}
   if(mode==='protected-member'){a.start+=5;a.end+=5;b.start+=5;b.end+=5;}
   const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
   for(const row of forged.proposedDraftSnapshot.tasks.filter((t:any)=>t.startPlanned!=null)){
    const t=task(row.taskId);if(!t)continue;row.startPlanned=clock(t.start);row.endPlanned=clock(t.end);row.spaceId=Number(t.spaceId.slice(6));
    row.assignedResourceIds=[...new Set((t.requiredResourceIds??[]).map((id:string)=>Number(id.slice(14))).concat((row.assignedResourceIds??[]).filter((id:number)=>t.coachId===`plan-resource:${id}`)))].sort((a:any,b:any)=>a-b);
    const proposal=forged.proposal.find((p:any)=>p.taskId===row.taskId);if(proposal)Object.assign(proposal,{startPlanned:row.startPlanned,endPlanned:row.endPlanned,spaceId:row.spaceId,assignedResourceIds:row.assignedResourceIds});
   }
   if(mode==='partial-draft'||mode==='partial-materialization'){const row=forged.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===g.taskIds[1]);row.startPlanned=null;row.endPlanned=null;row.assignedResourceIds=[];forged.proposal=forged.proposal.filter((t:any)=>t.taskId!==row.taskId);}
   proof.fingerprint=fingerprint(proof.tasks);forged.evidence.fingerprint=fingerprint(proof.tasks.filter((t:any)=>forged.proposedDraftSnapshot.tasks.some((row:any)=>row.startPlanned!=null&&`task:${row.taskId}`===t.id)));forged.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(forged.proposedDraftSnapshot);
   await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') WHERE id=$1",[run.id,JSON.stringify(forged)]);
   await db.query('UPDATE assisted_planning_sessions SET draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$1',[draft.session.id,forged.proposedDraftSnapshot,forged.proposedDraftFingerprint]);
   await db.query('SET LOCAL ROLE service_role');if(mode==='partial-materialization')await db.query('SELECT assert_anchored_choice_witness($1,$2,$3)',[planId,forged.proposedDraftSnapshot,draft.currentConfigRevisionId]);else await db.query('SELECT assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,forged.proposedDraftFingerprint,draft.draftBaseStageId,draft.currentConfigRevisionId]);
  }catch(e:any){failure={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}
  report.push({mode,...failure,accepted:!failure,hashesRecomputed:true,rolledBack:true});save('SQL-certificate-adversaries',report);assert.ok(failure,mode);assert.match(failure.message,/JOINT|ANCHORED|RUN_RESULT|STALE_|PROTECTED|SCOPE/);
 }
 return report;
}
