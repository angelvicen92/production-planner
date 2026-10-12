import assert from "node:assert/strict";
import test,{after} from "node:test";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import fixture from "./fixtures/assistedA2S10.json";
import {fingerprintAssistedPlanningSnapshotV1 as fp, type AssistedPlanningSnapshotV1} from "./assistedPlanningSnapshot";

const db=new PGlite();after(()=>db.close());
const completed=fixture.snapshot as AssistedPlanningSnapshotV1;
const bootstrap:AssistedPlanningSnapshotV1={contractVersion:1,tasks:completed.tasks.map(task=>({...task,startPlanned:null,endPlanned:null,assignedResourceIds:[]}))};
const actor="00000000-0000-0000-0000-000000000001";
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE FUNCTION public.positive_integer_jsonb_array(v jsonb) RETURNS boolean LANGUAGE SQL IMMUTABLE AS 'SELECT jsonb_typeof(v)=''array''';`);
// Focus on native workflow transactions here; the full HTTP smoke retains all FKs.
await db.exec(readFileSync("script/demo/fixtures/application-schema.sql","utf8").replace(/ALTER TABLE[\s\S]*?;/g,""));
await db.exec("DROP INDEX assisted_planning_stages_one_live_child");
for(const migration of ["078_assisted_planning_workflow.sql","086_assisted_itinerant_resource_persistence.sql","091_assisted_restart_bootstrap.sql"])
  await db.exec(readFileSync(`supabase/migrations/${migration}`,"utf8"));
await db.exec("CREATE SEQUENCE test_stage_id START 20; ALTER TABLE assisted_planning_stages ALTER COLUMN id SET DEFAULT nextval('test_stage_id');");
for(const task of completed.tasks)await db.query("INSERT INTO daily_tasks(id,plan_id,template_id,status,start_planned,end_planned,space_id,zone_id) VALUES($1,1,1,'pending',$2,$3,$4,$5)",[task.taskId,task.startPlanned,task.endPlanned,task.spaceId,task.zoneId]);
for(const [id,ordinal,parent,snapshot] of [[1,0,null,bootstrap],[2,10,1,completed]] as const)
  await db.query("INSERT INTO assisted_planning_stages(id,session_id,plan_id,ordinal,parent_stage_id,scope_json,config_revision_id,snapshot_json,snapshot_fingerprint,validation_summary_json,accepted_by,accepted_at) VALUES($1,1,1,$2,$3,'{}',1,$4,$5,'{}',$6,now())",[id,ordinal,parent,JSON.stringify(snapshot),fp(snapshot),actor]);
await db.query("INSERT INTO assisted_planning_sessions(id,plan_id,status,active_stage_id,draft_base_stage_id,current_config_revision_id,draft_snapshot_json,draft_fingerprint) VALUES(1,1,'ACTIVE',2,2,9,$1,$2)",[JSON.stringify(completed),fp(completed)]);
const restart=(fingerprint=fp(completed),base=2)=>db.query("SELECT assisted_restart_bootstrap(1,$1,$2)",[fingerprint,base]);
const state=async()=>(await db.query<any>("SELECT * FROM assisted_planning_sessions WHERE id=1")).rows[0];
const daily=async()=>(await db.query<any>("SELECT * FROM daily_tasks ORDER BY id")).rows;
async function restore(){await db.query("SELECT assisted_move_stage(1,2,true)");}

test("native A2 restart restores all bootstrap material and clears validation/ledgers while preserving history and current config",async()=>{
  const history=(await db.query("SELECT * FROM assisted_planning_stages ORDER BY id")).rows;
  await db.exec("UPDATE assisted_planning_sessions SET draft_validation_id=99,draft_scope_json='{\"editLedger\":[1],\"redoLedger\":[2]}'");
  await restart();
  const s=await state();assert.equal(s.active_stage_id,1);assert.equal(s.draft_base_stage_id,1);
  assert.deepEqual(s.draft_snapshot_json,bootstrap);assert.equal(s.draft_fingerprint,fp(bootstrap));
  assert.deepEqual(s.draft_scope_json,{});assert.equal(s.draft_validation_id,null);assert.equal(s.current_config_revision_id,9);
  const rows=await daily();assert.equal(rows.length,266);
  assert.ok(rows.every(row=>row.start_planned===null&&row.end_planned===null));
  assert.ok(rows.every(row=>JSON.stringify(row.assigned_resource_ids)==="[]"));
  assert.deepEqual((await db.query("SELECT * FROM assisted_planning_stages ORDER BY id")).rows,history);
  await restore();assert.equal((await state()).draft_fingerprint,fp(completed));
});
test("restart rejects stale guards, execution, human locks and active proposals before any write",async()=>{
  const before=await state(),tasks=await daily();
  await assert.rejects(()=>restart("a".repeat(64)),/STALE_DRAFT/);
  await assert.rejects(()=>restart(null as any),/STALE_DRAFT/);
  await assert.rejects(()=>restart(fp(completed),1),/STALE_BASE_STAGE/);
  for(const status of ["done","in_progress","cancelled"]){
    await db.query("UPDATE daily_tasks SET status=$1 WHERE id=$2",[status,completed.tasks[0].taskId]);
    await assert.rejects(()=>restart(),/RESTART_PROTECTED_DAY/);
    await db.exec("UPDATE daily_tasks SET status='pending'");
  }
  await db.query("INSERT INTO locks(plan_id,task_id,lock_type,created_by) VALUES(1,$1,'time','operator')",[completed.tasks[0].taskId]);
  await assert.rejects(()=>restart(),/RESTART_PROTECTED_DAY/);await db.exec("DELETE FROM locks");
  await db.exec("INSERT INTO planning_runs(id,plan_id,status,assisted_session_id) VALUES(1,1,'running',1)");
  await assert.rejects(()=>restart(),/RESTART_RUNNING_PROPOSAL/);await db.exec("DELETE FROM planning_runs");
  assert.deepEqual(await state(),before);assert.deepEqual(await daily(),tasks);
  await db.exec("SET ROLE authenticated");await assert.rejects(()=>restart(),/permission denied/);await db.exec("RESET ROLE");
});
test("acceptance after restart creates a new branch and archives the previous future using the existing native accept contract",async()=>{
  await restart();
  await db.query("UPDATE assisted_planning_sessions SET draft_snapshot_json=$1,draft_fingerprint=$2,draft_scope_json='{}' WHERE id=1",[JSON.stringify(completed),fp(completed)]);
  await db.query("INSERT INTO planning_stage_validations(id,plan_id,session_id,base_stage_id,config_revision_id,draft_fingerprint,hard_count,required_count,preferred_count,report_json) VALUES(1,1,1,1,9,$1,0,0,0,'{}')",[fp(completed)]);
  await db.exec("UPDATE assisted_planning_sessions SET draft_validation_id=1");
  await db.query("SELECT assisted_accept_stage(1,$1,$2,1,'NONE')",[actor,fp(completed)]);
  assert.equal((await state()).draft_fingerprint,fp(completed));
  assert.equal((await daily()).filter(row=>row.start_planned&&row.end_planned).length,266);
  const stages=(await db.query<any>("SELECT * FROM assisted_planning_stages ORDER BY id")).rows;
  assert.deepEqual(stages.find(stage=>stage.id===2).snapshot_json,completed);
  assert.ok(stages.find(stage=>stage.id===2).archived_at);
  assert.equal(stages.at(-1).parent_stage_id,1);assert.equal(stages.at(-1).config_revision_id,9);
});
