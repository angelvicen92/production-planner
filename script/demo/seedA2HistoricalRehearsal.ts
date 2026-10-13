/** Owned disposable DB only: exact legacy import and previously measured
 * baseline stages. This is prior-data preservation evidence, never a new-day seed. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {buildA2ImportSQLFromDataset} from './prepareA2Import';
import type pg from 'pg';
import {a2HistoricalCatalog} from './a2HistoricalCatalog';
import {identifier,literal} from './sql';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from '../../server/assistedPlanningSnapshot';

export async function seedA2HistoricalRehearsal(db:pg.Client,actor:string){
 assert.equal(db.host,'127.0.0.1');
 for(const [table,rows] of Object.entries(a2HistoricalCatalog))for(const row of rows){const fields=Object.keys(row);await db.query(`INSERT INTO public.${identifier(table)} (${fields.map(identifier).join(',')}) OVERRIDING SYSTEM VALUE VALUES (${fields.map(k=>literal((row as any)[k])).join(',')})`);}
// Versioned public canonical fixture derived from the exact base recorder; not a connected backup.
 const fixture=JSON.parse(gunzipSync(readFileSync('script/demo/fixtures/a2-legacy-import.json.gz')).toString());
 const old=fixture.dataset,measured=fixture.measured;
 await db.query(buildA2ImportSQLFromDataset(old).sql);
 assert.equal(measured.status,'PASS');assert.equal(measured.completedObligationCount,266);
 const blank=buildAssistedPlanningSnapshotV1(old.input.tasks.map((t:any)=>({id:t.id,zoneId:t.zoneId,spaceId:t.spaceId,startPlanned:null,endPlanned:null})));
 const fp='f'.repeat(64);
 const revision=(await db.query(`INSERT INTO public.plan_config_revisions(plan_id,source,fingerprint,identity_json,replay_snapshot_json,created_by) VALUES(27001,'DISPOSABLE_BASELINE',$1,$2,$3,$4) RETURNING id`,[fp,{contractVersion:1,planId:27001,configurationFingerprint:fp},{contractVersion:1},actor])).rows[0].id;
 const session=(await db.query(`INSERT INTO public.assisted_planning_sessions(plan_id,status,current_config_revision_id,draft_snapshot_json,draft_fingerprint) VALUES(27001,'ACTIVE',$1,$2,$3) RETURNING id`,[revision,blank,fingerprintAssistedPlanningSnapshotV1(blank)])).rows[0].id;
 let parent=null,final=blank;
 const snapshots=[blank,...measured.iterations.map((r:any)=>{const rows=new Map(r.acceptedSnapshotAfter.map((t:any)=>[t.taskId,t]));return buildAssistedPlanningSnapshotV1(blank.tasks.map(t=>({id:t.taskId,...t,...(rows.get(t.taskId) as object??{}),zoneId:t.zoneId})));})];
 for(const [ordinal,snapshot] of snapshots.entries()){
  const row:any=(await db.query(`INSERT INTO public.assisted_planning_stages(session_id,plan_id,ordinal,parent_stage_id,scope_json,config_revision_id,snapshot_json,snapshot_fingerprint,validation_summary_json,accepted_by,accepted_at) VALUES($1,27001,$2,$3,'{}',$4,$5,$6,'{}',$7,now()) RETURNING id`,[session,ordinal,parent,revision,snapshot,fingerprintAssistedPlanningSnapshotV1(snapshot),actor])).rows[0];parent=row.id;final=snapshot;
 }
 await db.query(`UPDATE public.assisted_planning_sessions SET active_stage_id=$1,draft_base_stage_id=$1,draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$4`,[parent,final,fingerprintAssistedPlanningSnapshotV1(final),session]);
 await db.query('SELECT public.assisted_apply_snapshot($1,$2)',[27001,final]);
 // Other-day fixture with 333 rows, sharing historical catalog identities.
 const planFields=Object.keys(old.tables.plans[0]);
 await db.query(`INSERT INTO public.plans (${planFields.map(identifier).join(',')}) OVERRIDING SYSTEM VALUE SELECT ${planFields.map(k=>k==='id'?'26999':k==='date'?literal('2026-10-28'):k==='planner_next_configuration'?'NULL':identifier(k)).join(',')} FROM public.plans WHERE id=27001`);
 for(let i=0;i<333;i++)await db.query("INSERT INTO public.daily_tasks(id,plan_id,template_id,zone_id,space_id,status) OVERRIDING SYSTEM VALUE VALUES($1,26999,$2,3,3,'pending')",[900000+i,old.tables.task_templates[0].id]);
 const material=async()=>{
  const rows:Record<string,unknown>={};
  for(const table of ['plans','daily_tasks','assisted_planning_sessions','assisted_planning_stages','plan_config_revisions','plan_space_settings','plan_zone_settings','plan_resource_items'])rows[table]=(await db.query(`SELECT to_jsonb(t) row FROM public.${identifier(table)} t WHERE ${table==='plans'?'id':'plan_id'} IN (27001,26999) ORDER BY id`)).rows;
  rows.catalog=(await db.query("SELECT to_jsonb(s) row FROM public.spaces s WHERE id < 100000 ORDER BY id")).rows;
  rows.resources=(await db.query("SELECT to_jsonb(r) row FROM public.resource_items r ORDER BY id")).rows;
  return rows;
 };
 const before=await material();
 return {assertPreserved:async()=>assert.deepEqual(await material(),before),summary:{oldPlanId:27001,oldObligations:266,oldStages:11,otherObligations:333,newDaySeedPlacements:0}};
}
