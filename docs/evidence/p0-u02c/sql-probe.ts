/** Read-only SQL consumer probe. Never inserts authorities, runs, Drafts or Stages. */
import assert from 'node:assert/strict';
import type {EngineInput} from '../../../engine/types';
export async function sqlProbe({db,planId,input,witness,groups,save}:any){
 assert.equal(db.host,'127.0.0.1');
 const revision=(await db.query('SELECT current_config_revision_id id FROM plans WHERE id=$1',[planId])).rows[0].id;
 const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
 const anchored=new Set(input.anchoredAccompaniments.flatMap((a:any)=>[...a.beforeTaskIds,a.anchorTaskId,...a.afterTaskIds]));
 const snapshot={tasks:witness.tasks.map((t:any)=>({taskId:Number(t.id.slice(5)),spaceId:Number(t.spaceId.slice(6)),startPlanned:clock(t.start),endPlanned:clock(t.end),itinerantTeamId:t.itinerantUnitId?Number(t.itinerantUnitId.slice(15)):null,assignedResourceIds:[...new Set<number>([...(t.requiredResourceIds??[]).map((id:string)=>Number(id.slice(14))),...(anchored.has(Number(t.id.slice(5)))&&t.coachId?[Number(t.coachId.slice(14))]:[])])].sort((a,b)=>a-b)}))};
 const call=async(s:any)=>{await db.query('BEGIN READ ONLY');let result;try{await db.query('SET LOCAL ROLE service_role');await db.query('SELECT public.assert_task_scope_snapshot($1,$2,$3)',[planId,s,revision]);result={accepted:true};}catch(e:any){result={accepted:false,code:e.code,message:e.message,detail:e.detail};}finally{await db.query('ROLLBACK');}return result;};
 const full=await call(snapshot);
 const peer=groups.groups[0].taskIds[1],single={tasks:snapshot.tasks.filter((t:any)=>t.taskId!==peer)},withoutPeer=await call(single);
 assert.equal(full.message,'TASK_SCOPE_PHYSICAL_CONFLICT');assert.equal(withoutPeer.accepted,true);
 const originalBody=(await db.query("SELECT pg_get_functiondef('public.assert_task_scope_snapshot(integer,jsonb,bigint)'::regprocedure) definition")).rows[0].definition;
 assert.ok(!originalBody.includes('daily_joint_groups')&&!originalBody.includes('jointGroupId'));
 const evidence={mode:'READ_ONLY_CONSUMER_PROBE',actualRevision:revision,actualAuthorities:'anchored + independent scopes only; phases/joint/pause remain unpersistable',snapshotOrigin:'complete 27-obligation memory witness; never persisted',full,withoutPeer,peerRemovedOnlyForIsolation:peer,snapshot,originalBody,explanation:'Full synchronized peers reach the unchanged SQL pairwise conflict test. Omitting only one peer passes this consumer. The reduced snapshot is not a valid global plan or a Stage. Since this function never consults joint authority, merely admitting that authority cannot fix the predicate.',experimentIsStage:false};save('sql-scope-peer-probe',evidence);return evidence;
}
