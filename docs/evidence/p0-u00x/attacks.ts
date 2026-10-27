import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {attacks as scopeAttacks} from '../p0-u00v/attacks';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
export async function configuration({planId,db,storage,input,api,request,save,url,anon,users}:any){
 const endpoint=`/api/plans/${planId}/effective-configuration`,path=`/api/plans/${planId}/day-configuration`;
 const view=()=>api(endpoint);let v=await view();const anchors=v.anchoredAccompaniments.authority,scopes=v.taskOperationScopes.authority;
 const put=async(payload:any)=>api(path,'PUT',{...payload,expectedRevisionId:(await view()).taskOperationScopes.revisionId});
 await put({taskOperationScopes:{contractVersion:1,policies:[]}});assert.deepEqual((await view()).anchoredAccompaniments.authority,anchors);save('retired-scopes-retained-anchors',await view());
 await put({taskOperationScopes:scopes});assert.deepEqual((await view()).anchoredAccompaniments.authority,anchors);
 const change=structuredClone(scopes);change.policies[0].agendaScope='PHYSICAL_SPACE';
 v=await view();const concurrent=await Promise.all([0,1].map(()=>request(path,'PUT',{taskOperationScopes:change,expectedRevisionId:v.taskOperationScopes.revisionId})));assert.deepEqual(concurrent.map((r:any)=>r.status).sort(),[200,409]);save('scope-CAS-race',concurrent);
 await put({taskOperationScopes:scopes});assert.deepEqual((await view()).anchoredAccompaniments.authority,anchors);
 v=await view();await scopeAttacks({db,storage,planId,input,structure:scopes,revision:v.taskOperationScopes.revisionId,actorId:users.admin.id,save});
 const bad=structuredClone(scopes);bad.policies[0].taskId=anchors.policies[0].beforeTaskIds[0];
 const overlap=await request(path,'PUT',{taskOperationScopes:bad,expectedRevisionId:v.taskOperationScopes.revisionId});assert.equal(overlap.status,422);assert.match(overlap.body.message,/TASK_SCOPE_ANCHORED_MEMBER/);save('overlap-API',overlap);
 const wrong=structuredClone(scopes);wrong.policies[0].itinerantUnitId=anchors.policies[0].eligibleItinerantUnitIds.find((id:number)=>id!==wrong.policies[0].itinerantUnitId);
 const ineligible=await request(path,'PUT',{taskOperationScopes:wrong,expectedRevisionId:v.taskOperationScopes.revisionId});assert.equal(ineligible.status,422);assert.match(ineligible.body.message,/TASK_SCOPE_INVALID_UNIT/);save('ineligible-nominal-unit',ineligible);
 const foreign=(await db.query('SELECT id FROM plan_itinerant_unit_snapshots WHERE plan_id<>$1 ORDER BY id LIMIT 1',[planId])).rows[0];
 if(foreign){wrong.policies[0].itinerantUnitId=Number(foreign.id);const denied=await request(path,'PUT',{taskOperationScopes:wrong,expectedRevisionId:v.taskOperationScopes.revisionId});assert.equal(denied.status,422);save('foreign-daily-unit',denied);}
 const sqlNegatives=[];
 for(const [name,query,parameters] of [
  ['scope-overlap','SELECT assert_daily_task_operation_scopes($1,$2)',[planId,bad]],
  ['anchor-overlap','SELECT assert_daily_anchored_accompaniments($1,$2)',[planId,{...anchors,policies:[{...anchors.policies[0],beforeTaskIds:[scopes.policies[0].taskId]}]}]],
 ] as const){let error:any;await db.query('BEGIN');try{await db.query('SET LOCAL ROLE service_role');await db.query(query,parameters);}catch(e:any){error={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}assert.match(error?.message,/REALITY_AUTHORITY_TASK_OVERLAP/);sqlNegatives.push({name,...error});}
 save('overlap-SQL',sqlNegatives);
 const before=(await db.query('SELECT daily_anchored_accompaniments,daily_task_operation_scopes,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows;
 for(const role of ['admin','production','viewer','aux','norole']){
  const r=await fetch(`${url}/rest/v1/plans?id=eq.${planId}`,{method:'PATCH',headers:{apikey:anon,Authorization:`Bearer ${users[role].token}`,'Content-Type':'application/json'},body:JSON.stringify({daily_anchored_accompaniments:null,daily_task_operation_scopes:null})});
  save('data-api-'+role,{status:r.status,body:await r.json()});assert.ok([400,401,403].includes(r.status));assert.deepEqual((await db.query('SELECT daily_anchored_accompaniments,daily_task_operation_scopes,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows,before);
 }
}
export async function certificates({planId,db,run,draft,scopePolicies,save}:any){
 const results=[];
 for(const mode of ['scope-camera','scope-direct','scope-unit','scope-blocks','scope-resource-invented','scope-corner']){
  let failure:any;await db.query('BEGIN');try{
   const result=structuredClone(run.assisted_result_json),proof=result.evidence.nominalPhysicalFutureWitness;
   const reality=proof.tasks.find((t:any)=>t.id===`task:${scopePolicies[0].taskId}`);
   const camera=(await db.query("SELECT r.id FROM plan_resource_items r JOIN resource_items i ON i.id=r.resource_item_id WHERE r.plan_id=$1 AND i.name LIKE '%CAM1'",[planId])).rows[0].id;
   if(mode==='scope-camera')reality.requiredResourceIds.push(`plan-resource:${camera}`);
   if(mode==='scope-direct')reality.requiredResourceIds=reality.requiredResourceIds.filter((id:string)=>!scopePolicies[0].declaredResourceIds.some((rid:number)=>id===`plan-resource:${rid}`));
   if(mode==='scope-unit')reality.itinerantUnitId='itinerant-team:2147483647';
   if(mode==='scope-blocks')reality.blocksSpace=false;
   if(mode==='scope-resource-invented')reality.requiredResourceIds.push('plan-resource:2147483647');
   if(mode==='scope-corner'){const other=proof.tasks.find((t:any)=>t.id!==reality.id&&t.spaceId===reality.spaceId);other.start=reality.start;other.end=other.start+other.duration;}
   const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
   for(const row of result.proposedDraftSnapshot.tasks.filter((t:any)=>t.startPlanned!=null)){
    const task=proof.tasks.find((t:any)=>t.id===`task:${row.taskId}`);row.startPlanned=clock(task.start);row.endPlanned=clock(task.end);
    if(task.itinerantUnitId)row.itinerantTeamId=Number(task.itinerantUnitId.slice(15));
    row.assignedResourceIds=[...new Set((task.requiredResourceIds??[]).map((id:string)=>Number(id.slice(14))).concat((row.assignedResourceIds??[]).filter((id:number)=>task.coachId===`plan-resource:${id}`)))].sort((a:any,b:any)=>a-b);
    const proposal=result.proposal.find((t:any)=>t.taskId===row.taskId);if(proposal)Object.assign(proposal,{startPlanned:row.startPlanned,endPlanned:row.endPlanned,assignedResourceIds:row.assignedResourceIds,...(row.itinerantTeamId?{itinerantTeamId:row.itinerantTeamId}:{})});
   }
   proof.fingerprint=fingerprint(proof.tasks);result.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(result.proposedDraftSnapshot);
   await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') WHERE id=$1",[run.id,JSON.stringify(result)]);
   await db.query('UPDATE assisted_planning_sessions SET draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$1',[draft.session.id,result.proposedDraftSnapshot,result.proposedDraftFingerprint]);
   await db.query('SET LOCAL ROLE service_role');await db.query('SELECT assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,result.proposedDraftFingerprint,draft.draftBaseStageId,draft.currentConfigRevisionId]);
  }catch(e:any){failure={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}
  results.push({mode,accepted:!failure,...failure,hashesRecomputed:true,rolledBack:true});save('scope-certificate-forgeries',results);assert.ok(failure,mode);
 }
}
export async function snapshot({planId,db,run,scopePolicies,save}:any){
 const valid=run.assisted_result_json.proposedDraftSnapshot,revision=run.config_revision_id;
 const check=async(name:string,s:any,legacy:false|'117'|'internal'=false)=>{
  let failure:any;await db.query('BEGIN');try{
   if(legacy==='internal')await db.query(readFileSync('docs/evidence/p0-u00x/diagnostic/snapshot-before-internal-transition.sql','utf8'));
   if(legacy==='117'){const sql=readFileSync('supabase/migrations/117_daily_task_operation_scopes.sql','utf8'),body=sql.match(/CREATE FUNCTION public\.assert_task_scope_snapshot\([\s\S]*?\$\$;/)![0];await db.query(body.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));}
   await db.query('SET LOCAL ROLE service_role');await db.query('SELECT assert_task_scope_snapshot($1,$2,$3)',[planId,s,revision]);
  }catch(e:any){failure={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}
  save(name,{accepted:!failure,...failure,rolledBack:true});return failure;
 };
 assert.equal(await check('composed-snapshot-positive',valid),undefined);
 assert.ok(await check('literal-117-snapshot-counterfactual',valid,'117'));
 if(scopePolicies.length>1){const failure=await check('internal-transition-before-correction',valid,'internal');assert.match(failure?.message,/TASK_SCOPE_RESOURCE_TRANSITION/);}
 const source=scopePolicies[0],reality=valid.tasks.find((t:any)=>t.taskId===source.taskId);
 if(reality.startPlanned==null)return;
 const camera=(await db.query("SELECT r.id FROM plan_resource_items r JOIN resource_items i ON i.id=r.resource_item_id WHERE r.plan_id=$1 AND i.name LIKE '%CAM1'",[planId])).rows[0].id;
 for(const mode of ['invented-camera','missing-direct','unknown-resource','same-corner','same-unit']){
  const fake=structuredClone(valid),real=fake.tasks.find((t:any)=>t.taskId===source.taskId);
  if(mode==='invented-camera')real.assignedResourceIds.push(camera);
  if(mode==='unknown-resource')real.assignedResourceIds.push(2147483647);
  if(mode==='missing-direct')real.assignedResourceIds=real.assignedResourceIds.filter((id:number)=>!source.declaredResourceIds.includes(id));
  if(mode==='same-corner'){const ordinary=fake.tasks.find((t:any)=>t.taskId!==real.taskId&&t.spaceId===real.spaceId);ordinary.startPlanned=real.startPlanned;const mins=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3)),end=mins(real.startPlanned)+20;ordinary.endPlanned=`${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`;}
  if(mode==='same-unit'){
   const other=fake.tasks.filter((t:any)=>t.taskId!==real.taskId&&t.itinerantTeamId===real.itinerantTeamId).sort((a:any,b:any)=>a.startPlanned.localeCompare(b.startPlanned))[0];if(!other)throw Error('no competing unit');
   // Isolate this physical pair from unrelated feeder/participant decisions.
   // Both durations, windows, resource composition and identities stay genuine.
   const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3)),clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
   const duration=minutes(real.endPlanned)-minutes(real.startPlanned),end=minutes(real.endPlanned)+duration;
   real.startPlanned=real.endPlanned;real.endPlanned=clock(end);
   for(const t of fake.tasks)if(t!==real&&t!==other){t.startPlanned=null;t.endPlanned=null;}
  }
  const failure=await check('scope-snapshot-'+mode,fake);assert.ok(failure,mode);
  if(mode==='same-unit'||mode==='same-corner')assert.match(failure.message,/TASK_SCOPE_PHYSICAL_CONFLICT/,mode);
 }
}
