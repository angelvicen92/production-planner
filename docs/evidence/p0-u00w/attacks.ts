import assert from 'node:assert/strict';
import type pg from 'pg';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {buildEngineInput} from '../../../engine/buildInput';
import {atomicityAttack} from '../p0-u00u/attacks';
import {buildCanonicalPlanConfig} from '../../../server/dayConfigurationService';
import {withDailyAnchoredAccompaniments} from '../../../server/anchoredAccompanimentStructure';
export async function configurationAttacks({planId,db,api,request,save}:{planId:number;db:pg.Client;api:(p:string,m?:string,b?:unknown)=>Promise<any>;request:(p:string,m?:string,b?:unknown,role?:string)=>Promise<{status:number;body:any}>;save:(n:string,v:unknown)=>void}){
 const path=`/api/plans/${planId}/day-configuration`,view=()=>api(`/api/plans/${planId}/effective-configuration`);
 let effective=(await view()).anchoredAccompaniments,structure=effective.authority;
 const rows=async()=>(await db.query('SELECT daily_anchored_accompaniments,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows;
 const before=await rows(),negatives:any[]=[];
 const empty=await request('/api/itinerant-teams','POST',{code:`EMPTY_${planId}`,name:'Empty negative unit',resourceItemIds:[],availabilityWindows:[{start:'09:00',end:'12:00'}],transitionMinutes:0,isActive:true,orderIndex:0});assert.equal(empty.status,400);negatives.push({name:'unit-without-physical-members',...empty});
 for(const [name,change] of [
  ['unknown-unit',(s:any)=>s.policies[0].eligibleItinerantUnitIds=[2147483647]],
  ['empty-domain',(s:any)=>s.policies[0].eligibleItinerantUnitIds=[]],
  ['duplicate-domain',(s:any)=>s.policies[0].eligibleItinerantUnitIds.push(s.policies[0].eligibleItinerantUnitIds[0])],
  ['ambiguous-choice',(s:any)=>s.policies[0].itinerantUnitId=s.policies[0].eligibleItinerantUnitIds[0]],
  ['shared-task',(s:any)=>s.policies.push({...s.policies[0],id:'duplicate-real-task'})],
  ['missing-segment',(s:any)=>s.policies[0].afterTaskIds=[]],
  ['duplicate-segment',(s:any)=>s.policies[0].afterTaskIds=s.policies[0].beforeTaskIds],
  ['unknown-task',(s:any)=>s.policies[0].beforeTaskIds=[2147483647]],
 ] as const){const bad=structuredClone(structure);change(bad);const result=await request(path,'PUT',{anchoredAccompaniments:bad,expectedRevisionId:effective.revisionId});assert.ok([400,422].includes(result.status),name);negatives.push({name,...result});assert.deepEqual(await rows(),before);}
 for(const role of ['viewer','aux','norole','anonymous']){const result=await request(path,'PUT',{anchoredAccompaniments:structure,expectedRevisionId:effective.revisionId},role);assert.equal(result.status,role==='anonymous'?401:403);negatives.push({role,...result});}
 const stale=await request(path,'PUT',{anchoredAccompaniments:structure,expectedRevisionId:2147483647});assert.equal(stale.status,409);negatives.push({name:'stale',...stale});
 const changed=structuredClone(structure);changed.policies[0].id+='-cas';
 const concurrent=await Promise.all([0,1].map(()=>request(path,'PUT',{anchoredAccompaniments:changed,expectedRevisionId:effective.revisionId})));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);save('configuration-CAS-race',concurrent);
 effective=(await view()).anchoredAccompaniments;structure=effective.authority;
 await api(path,'PUT',{anchoredAccompaniments:{contractVersion:2,policies:[]},expectedRevisionId:effective.revisionId});
 effective=(await view()).anchoredAccompaniments;assert.equal(effective.authority.policies.length,0);
 await api(path,'PUT',{anchoredAccompaniments:structure,expectedRevisionId:effective.revisionId});
 const {storage}=await import('../../../server/storage');effective=(await view()).anchoredAccompaniments;
 const actor=(await db.query("SELECT u.user_id FROM user_roles u JOIN roles r ON r.id=u.role_id WHERE r.key='admin' ORDER BY u.user_id LIMIT 1")).rows[0].user_id;
 await atomicityAttack({db,storage,planId,input:await buildEngineInput(planId,storage),structure:effective.authority,actorId:actor,save});
 const current=await buildCanonicalPlanConfig(planId,storage),rename=structuredClone(effective.authority);rename.policies[0].id+='-protected';
 const candidate=await buildCanonicalPlanConfig(planId,storage,withDailyAnchoredAccompaniments(await buildEngineInput(planId,storage),rename));
 const execution:any[]=[];
 for(const mode of ['done','in_progress','time-lock']){
  await db.query('BEGIN');let failure:any;
  try{
   const id=rename.policies[0].anchorTaskId;
   if(mode==='time-lock')await db.query("INSERT INTO locks(plan_id,task_id,lock_type,locked_start,locked_end,created_by,reason) VALUES($1,$2,'time','09:25','09:40',$3,'rollback-only negative')",[planId,id,actor]);
   else await db.query('UPDATE daily_tasks SET status=$2 WHERE id=$1',[id,mode]);
   await db.query('SET LOCAL ROLE service_role');
   await db.query("SELECT public.apply_day_config_operation_v5($1,$2,'EDIT',$3,$4,$5,$6,$7,$8,$9)",[planId,actor,{anchoredAccompaniments:rename,expectedRevisionId:effective.revisionId},effective.revisionId,current.identity,current.replay,candidate.identity,candidate.replay,{}]);
  }catch(e:any){failure={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}
  assert.ok(failure,mode);assert.match(failure.message,/PROTECTED|STALE_|EXECUTION|LOCK/);execution.push({mode,...failure,rolledBack:true});
 }
 save('execution-lock-negatives',execution);
 save('configuration-negatives',negatives);
 const grants=(await db.query("SELECT proname,prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('assert_daily_anchored_accompaniments','assert_daily_anchored_accompaniments_v1','assert_anchored_selected_snapshot','assert_anchored_choice_witness','assert_daily_anchored_snapshot','assert_daily_anchored_snapshot_v1') ORDER BY proname")).rows;
 assert.equal(grants.length,6);for(const g of grants){assert.equal(g.prosecdef,false);assert.equal(g.anon,false);assert.equal(g.authenticated,false);assert.deepEqual(g.proconfig,['search_path=""']);}save('SQL-grants',grants);
}
export async function certificateAttacks({planId,db,run,draft,units,policies,save}:{planId:number;db:pg.Client;run:any;draft:any;units:number[];policies:any[];save:(n:string,v:unknown)=>void}){
 const report:any[]=[],structure=(await db.query('SELECT daily_anchored_accompaniments FROM plans WHERE id=$1',[planId])).rows[0].daily_anchored_accompaniments;
 const snapshots=(await db.query('SELECT id,members FROM plan_itinerant_unit_snapshots WHERE plan_id=$1',[planId])).rows;
 const first=policies[0],beforeId=first.beforeTaskIds[0],anchorId=first.anchorTaskId,afterId=first.afterTaskIds[0];
 for(const mode of ['unit-missing','unit-outside','unit-split','shared-physical-resource','composition-missing','direct-resource-omitted','window','gap','dependency','identity','virtual-main','fake-domain','future-omitted','future-split',...(draft.activeStage.ordinal?['protected-choice']:[])]){
  if(mode.startsWith('future-')&&!policies.slice(1).some(p=>run.assisted_result_json.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===p.anchorTaskId)?.startPlanned==null))continue;
  await db.query('BEGIN');let failure:any;
  try{
   const forged=structuredClone(run.assisted_result_json),proof=forged.evidence.nominalPhysicalFutureWitness;
   const task=(id:number)=>proof.tasks.find((t:any)=>t.id===`task:${id}`);
   const swap=(t:any,unit:number)=>{const all=new Set(snapshots.filter(u=>units.includes(Number(u.id))).flatMap(u=>u.members.map((m:any)=>`plan-resource:${m.planResourceItemId}`)));t.itinerantUnitId=`itinerant-team:${unit}`;t.requiredResourceIds=[...new Set([...t.requiredResourceIds.filter((id:string)=>!all.has(id)),...snapshots.find(u=>Number(u.id)===unit).members.map((m:any)=>`plan-resource:${m.planResourceItemId}`)])].sort();};
   const memberIds=[...first.beforeTaskIds,anchorId,...first.afterTaskIds];
   if(mode==='unit-missing')for(const id of memberIds)delete task(id).itinerantUnitId;
   if(mode==='unit-outside')for(const id of memberIds)task(id).itinerantUnitId='itinerant-team:2147483647';
   if(mode==='unit-split')swap(task(beforeId),units.find(u=>task(beforeId).itinerantUnitId!==`itinerant-team:${u}`)!);
   if(mode==='shared-physical-resource')for(const p of policies)for(const id of [...p.beforeTaskIds,p.anchorTaskId,...p.afterTaskIds])swap(task(id),units[0]);
   if(mode==='composition-missing')task(beforeId).requiredResourceIds=task(beforeId).requiredResourceIds.slice(1);
   if(mode==='direct-resource-omitted'){
    const all=new Set(snapshots.flatMap(u=>u.members.map((m:any)=>`plan-resource:${m.planResourceItemId}`)));
    task(beforeId).requiredResourceIds=task(beforeId).requiredResourceIds.filter((id:string)=>all.has(id));
   }
   if(mode==='window')for(const id of memberIds){task(id).start+=15;task(id).end+=15;}
   if(mode==='gap'){task(afterId).start+=5;task(afterId).end+=5;}
   if(mode==='dependency')task(anchorId).dependencies=[];
   if(mode==='identity')task(anchorId).participantId='participant:2147483647';
   if(mode==='virtual-main')task(anchorId).blocksSpace=false;
   if(mode==='fake-domain')task(anchorId).allowedItinerantUnitIds=['itinerant-team:2147483647'];
   if(mode==='future-omitted')proof.tasks=proof.tasks.filter((t:any)=>t.id!==`task:${policies[1].afterTaskIds[0]}`);
   if(mode==='future-split')swap(task(policies[1].beforeTaskIds[0]),units.find(u=>task(policies[1].beforeTaskIds[0]).itinerantUnitId!==`itinerant-team:${u}`)!);
   if(mode==='protected-choice')for(const id of memberIds)swap(task(id),units.find(u=>task(id).itinerantUnitId!==`itinerant-team:${u}`)!);
   const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
   for(const row of forged.proposedDraftSnapshot.tasks.filter((t:any)=>t.startPlanned!=null)){
    const t=task(row.taskId);if(!t)continue;row.startPlanned=clock(t.start);row.endPlanned=clock(t.end);
    if(t.itinerantUnitId)row.itinerantTeamId=Number(t.itinerantUnitId.slice(15));else delete row.itinerantTeamId;
    // Keep the authentic implicit coach channel independent of persisted assignments.
    row.assignedResourceIds=[...new Set([...t.requiredResourceIds??[]].map((id:string)=>Number(id.slice(14))).concat((row.assignedResourceIds??[]).filter((id:number)=>t.coachId===`plan-resource:${id}`)))].sort((a:any,b:any)=>a-b);
    const proposal=forged.proposal.find((p:any)=>p.taskId===row.taskId);if(proposal)Object.assign(proposal,{startPlanned:row.startPlanned,endPlanned:row.endPlanned,assignedResourceIds:row.assignedResourceIds,...(row.itinerantTeamId?{itinerantTeamId:row.itinerantTeamId}:{})});
   }
   proof.fingerprint=fingerprint(proof.tasks);forged.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(forged.proposedDraftSnapshot);
   await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') WHERE id=$1",[run.id,JSON.stringify(forged)]);
   await db.query('UPDATE assisted_planning_sessions SET draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$1',[draft.session.id,forged.proposedDraftSnapshot,forged.proposedDraftFingerprint]);
   await db.query('SET LOCAL ROLE service_role');
   await db.query('SELECT public.assisted_record_proposal_clean_validation($1,$2,$3,$4)',[planId,forged.proposedDraftFingerprint,draft.draftBaseStageId,draft.currentConfigRevisionId]);
  }catch(e:any){failure={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}
  report.push({mode,accepted:!failure,...failure,hashesRecomputed:true,rolledBack:true});save('SQL-adversaries',report);
  assert.ok(failure,`SQL accepted ${mode}`);assert.match(failure.message,/ANCHORED_|RUN_RESULT_INVALID|STALE_|PROTECTED|SCOPE/);
 }
 assert.equal(structure.contractVersion,2);return report;
}
