import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {buildA2SchemaSQL} from './prepareA2Schema';
import {buildA2ImportSQL} from './prepareA2Import';
import {buildA2ImportRows} from './a2ImportRows';
import {literal,identifier} from './sql';
import {a2ImportStorageFixture,importedTaskSnapshotSource} from './a2ImportStorageFixture';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from '../../server/assistedPlanningSnapshot';
import {buildEffectivePlanConfigRevisionV1,projectEffectiveAuthoritiesFromEngineInputV1} from '../../server/effectivePlanConfigRevision';
import {buildEffectivePlanConfigReplaySnapshotV1} from '../../server/assistedPlanningConfigRevision';
import {buildEngineInput} from '../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {inspectA2Catalog} from './a2Preflight';

const actor='00000000-0000-0000-0000-000000000001';
// One WASM runtime per file; each case rebuilds schemas independently. This also
// avoids repeated WASM JIT teardown failures in Node 24.
const database=new PGlite();
after(()=>database.close());
const settings=`SET optiplan.confirmed_demo_project='dyqusivzgxebkxkwohwn'; SET optiplan.backup_sha256='${'a'.repeat(64)}'; SET optiplan.schema_approved='yes'; SET optiplan.security_approved='yes'; SET optiplan.demo_actor='${actor}';`;
async function setup(){
 const db=database;
 await db.exec(`ROLLBACK; RESET ROLE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public; DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; END IF; END $$; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${actor}'); CREATE FUNCTION public.positive_integer_jsonb_array(v jsonb) RETURNS boolean LANGUAGE SQL IMMUTABLE AS 'SELECT jsonb_typeof(v)=''array''';`);
 await db.exec(readFileSync('script/demo/fixtures/application-schema.sql','utf8'));
 await db.exec(`CREATE TABLE public.roles(id uuid PRIMARY KEY,key text); CREATE TABLE public.user_roles(user_id uuid,role_id uuid); INSERT INTO roles VALUES('${actor}','production'); INSERT INTO user_roles VALUES('${actor}','${actor}'); ALTER TABLE program_settings ADD COLUMN meal_task_template_name text; ALTER TABLE plan_optimizer_snapshots ADD COLUMN baseline_snapshot jsonb;`);
 await db.exec(readFileSync('supabase/migrations/013_space_resource_assignments.sql','utf8'));
 // Match the REST-observed drift: missing 076 snapshots, 087 margins, 088 JSON.
 await db.exec('DROP TABLE plan_resource_bundle_snapshots; ALTER TABLE plans DROP COLUMN planner_next_configuration;');
 for(const [table,columns] of Object.entries({program_settings:['default_participant_transition_minutes'],plans:['participant_transition_minutes','participant_transition_baseline_minutes','participant_transition_config_source','participant_transition_override_by','participant_transition_override_at'],task_templates:['participant_margin_before_minutes','participant_margin_after_minutes'],daily_tasks:['participant_margin_before_minutes','participant_margin_after_minutes'],plan_task_template_snapshots:['participant_margin_before_minutes','participant_margin_after_minutes'],plan_zone_settings:['name','config_source','meal_start_preferred','meal_end_preferred','grouping_level','grouping_min_chain','max_template_changes','space_meal_break_minutes'],plan_space_settings:['name','config_source','parent_space_id','priority_level','grouping_level','grouping_min_chain','grouping_apply_to_descendants']}))for(const column of columns)await db.exec(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column} CASCADE`);
 await db.exec('ALTER TABLE plan_task_template_snapshots DROP CONSTRAINT plan_task_template_snapshots_contract_version_check; ALTER TABLE plan_task_template_snapshots ADD CONSTRAINT plan_task_template_snapshots_contract_version_check CHECK(contract_version=1);');
 const tables=(await db.query<{name:string}>("SELECT table_name AS name FROM information_schema.columns WHERE table_schema='public' AND column_name='id' AND data_type IN ('integer','bigint')")).rows;
 for(const {name} of tables){const r=await db.query<{seq:string|null}>(`SELECT pg_get_serial_sequence('public.${name}','id') AS seq`);if(!r.rows[0].seq&&name!=='roles'&&name!=='user_roles')await db.exec(`CREATE SEQUENCE ${name}_id_seq OWNED BY ${name}.id; ALTER TABLE ${name} ALTER COLUMN id SET DEFAULT nextval('${name}_id_seq')`);}
 await db.exec(settings);
 return db;
}
async function readDataset(db:PGlite,dataset:ReturnType<typeof buildA2ImportRows>){
 const tables:Record<string,any[]>={};
 for(const table of dataset.order)tables[table]=(await db.query<any>(`SELECT * FROM ${identifier(table)} ORDER BY id`)).rows.filter((r:any)=>r.plan_id==null?dataset.tables[table].some(x=>x.id===r.id):r.plan_id===dataset.input.planId);
 tables.plans=tables.plans.filter(r=>r.id===dataset.input.planId);
 return a2ImportStorageFixture({...dataset,tables});
}

test('drift adoption is atomic and preserves existing v1 snapshots and original day fields',async()=>{
 const db=await setup();
 try{
  await db.exec(`INSERT INTO program_settings(id,meal_task_template_name,meal_start,meal_end) VALUES(1,'Existing meal','12:00','13:00'); INSERT INTO optimizer_settings(id) VALUES(1); INSERT INTO plans(id,date,work_start,work_end,meal_start,meal_end,work_baseline_start,work_baseline_end,work_config_source,meal_baseline_start,meal_baseline_end,meal_baseline_mode,meal_config_source) VALUES(1,'2026-01-01','08:00','18:00','13:00','14:00','08:00','18:00','LEGACY_BACKFILL','13:00','14:00','flexible_meal_window','LEGACY_BACKFILL'); INSERT INTO task_templates(id,name,default_duration) VALUES(1,'Existing template',30); INSERT INTO plan_task_template_snapshots(id,plan_id,source_template_id,contract_version,source,template_name,default_duration) VALUES(1,1,1,1,'inherited','Existing template',30);`);
  const before=(await db.query<any>('SELECT to_jsonb(p) AS row FROM plans p')).rows[0].row as Record<string,any>;
  await db.exec("SET optiplan.schema_approved='no'");await assert.rejects(()=>db.exec(buildA2SchemaSQL()),/SCHEMA_APPROVAL_REQUIRED/);await db.exec('ROLLBACK');
  assert.equal((await db.query<any>("SELECT count(*) AS n FROM information_schema.columns WHERE table_name='plans' AND column_name='planner_next_configuration'")).rows[0].n,0);
  await db.exec(settings);await db.exec(buildA2SchemaSQL());
  const after=(await db.query<any>('SELECT to_jsonb(p) AS row FROM plans p')).rows[0].row as Record<string,any>;
  for(const key of Object.keys(before))assert.deepEqual(after[key],before[key],key);
  assert.equal((await db.query<any>('SELECT contract_version FROM plan_task_template_snapshots WHERE id=1')).rows[0].contract_version,1);
  assert.equal((await db.query<any>('SELECT count(*) AS n FROM plan_resource_bundle_snapshots')).rows[0].n,0,'no backfill into existing days');
 }finally{await db.exec('ROLLBACK; RESET ROLE');}
});

test('populated-project import preserves all earlier rows/defaults, canonical input, and advanced sequences; repeat aborts',async()=>{
 const db=await setup();
 try{
  await db.exec(buildA2SchemaSQL());
  await db.exec("INSERT INTO program_settings(id,meal_task_template_name,meal_start,meal_end) VALUES(1,'Existing meal','12:00','13:00'); INSERT INTO optimizer_settings(id,arrival_grouping_target) VALUES(1,2);");
  // Four independent earlier days, with their own tasks and snapshots.
  for(const offset of [50000,100000,150000,200000])await db.exec(buildA2ImportSQL('2026-01-01',offset).sql);
  const before:Record<string,any[]>={};const {dataset,sql}=buildA2ImportSQL('2026-10-30');
  for(const table of [...dataset.order,'program_settings','optimizer_settings'])before[table]=(await db.query<any>(`SELECT * FROM ${identifier(table)} ORDER BY id`)).rows;
  await db.exec('ALTER SEQUENCE daily_tasks_id_seq RESTART WITH 900000');
  await db.exec(sql);
  for(const [table,rows] of Object.entries(before)){
   const actual=(await db.query<any>(`SELECT * FROM ${identifier(table)} ORDER BY id`)).rows;
   for(const row of rows)assert.deepEqual(actual.find((r:any)=>r.id===row.id),row,`modified earlier row in ${table}`);
  }
  const fixture=await readDataset(db,dataset),input=await buildEngineInput(dataset.input.planId,fixture.storage);
  const actual=adaptEngineInputToPlannerNextProblem(input),expected=adaptEngineInputToPlannerNextProblem(dataset.input);
  assert.equal(actual.status,'SUPPORTED');assert.equal(expected.status,'SUPPORTED');if(actual.status==='SUPPORTED'&&expected.status==='SUPPORTED')assert.deepEqual(actual.problem,expected.problem);
  assert.equal((await db.query<any>('SELECT nextval(\'daily_tasks_id_seq\') AS n')).rows[0].n,900000);
  assert.equal((await db.query<any>('SELECT count(*) AS n FROM plans')).rows[0].n,5);
  await assert.rejects(()=>db.exec(sql),/A2_ID_COLLISION/);await db.exec('ROLLBACK');
  assert.equal((await db.query<any>('SELECT count(*) AS n FROM plans')).rows[0].n,5);
  await assert.rejects(()=>db.exec("UPDATE plans SET planner_next_configuration='{}' WHERE id=27001"),/PLANNER_NEXT_CONFIGURATION_IMMUTABLE/);
 }finally{await db.exec('ROLLBACK; RESET ROLE');}
});

test('late SQL failure rolls back every inserted row and sequence restart',async()=>{
 const db=await setup();
 try{
  await db.exec(buildA2SchemaSQL());const {sql}=buildA2ImportSQL('2026-10-30');
  const before=(await db.query<any>('SELECT last_value,is_called FROM plans_id_seq')).rows;
  await assert.rejects(()=>db.exec(sql.replace('COMMIT;',()=> 'DO $$ BEGIN RAISE EXCEPTION \'INJECTED_FAILURE\'; END $$;\nCOMMIT;')),/INJECTED_FAILURE/);await db.exec('ROLLBACK');
  assert.equal((await db.query<any>('SELECT count(*) AS n FROM plans')).rows[0].n,0);
  assert.equal((await db.query<any>('SELECT count(*) AS n FROM daily_tasks')).rows[0].n,0);
  assert.deepEqual((await db.query<any>('SELECT last_value,is_called FROM plans_id_seq')).rows,before);
 }finally{await db.exec('ROLLBACK; RESET ROLE');}
});

test('late natural-key collision aborts atomically without touching global defaults',async()=>{
 const db=await setup();
 try{
  await db.exec(buildA2SchemaSQL());
  await db.exec("INSERT INTO resource_types(id,code,name) VALUES(1,'a2-8001','Earlier type')");
  await assert.rejects(()=>db.exec(buildA2ImportSQL('2026-10-30').sql),/A2_UNIQUE_COLLISION/);await db.exec('ROLLBACK');
  assert.equal((await db.query<any>('SELECT count(*) AS n FROM plans')).rows[0].n,0);
 }finally{await db.exec('ROLLBACK; RESET ROLE');}
});

test('actual 086 bootstrap rejects resource staleness, materializes S0 and persists physical assignments',async()=>{
 const db=await setup();
 try{
  await db.exec(buildA2SchemaSQL());const {dataset,sql}=buildA2ImportSQL('2026-10-30');await db.exec(sql);
  const fixture=await readDataset(db,dataset),input=await buildEngineInput(dataset.input.planId,fixture.storage);
  const revisionInput={planId:input.planId,optimizerSnapshot:await fixture.storage.getPlanOptimizerSnapshot(input.planId),taskTemplateSnapshots:await fixture.storage.getPlanTaskTemplateSnapshots(input.planId),optimizerProvenance:{authority:'plan_optimizer_snapshots',authorityContractVersion:1},taskTemplateProvenance:{authority:'plan_task_template_snapshots',authorityContractVersion:1},authorities:projectEffectiveAuthoritiesFromEngineInputV1(input)};
  const identity=buildEffectivePlanConfigRevisionV1(revisionInput),replay=buildEffectivePlanConfigReplaySnapshotV1(revisionInput);
  const snapshot=buildAssistedPlanningSnapshotV1(importedTaskSnapshotSource(fixture.tables.daily_tasks));
  const bootstrap=(snap:any)=>db.query<any>('SELECT public.assisted_bootstrap_session($1,$2,$3,$4,$5,$6) AS id',[input.planId,actor,identity,replay,snap,fingerprintAssistedPlanningSnapshotV1(snap)]);
  const stale={...snapshot,tasks:snapshot.tasks.map((t,i)=>i===0?{...t,assignedResourceIds:[999999]}:t)};
  await assert.rejects(()=>bootstrap(stale),/STALE_DRAFT/);
  await bootstrap(snapshot);
  assert.equal((await db.query<any>('SELECT ordinal FROM assisted_planning_stages')).rows[0].ordinal,0);
  const altered={...snapshot,tasks:snapshot.tasks.map((t,i)=>i===0?{...t,assignedResourceIds:[dataset.tables.plan_resource_items[0].id]}:t)};
  await db.query<any>('SELECT public.assisted_apply_snapshot($1,$2)',[input.planId,altered]);
  assert.deepEqual((await db.query<any>('SELECT assigned_resource_ids FROM daily_tasks WHERE id=$1',[altered.tasks[0].taskId])).rows[0].assigned_resource_ids,altered.tasks[0].assignedResourceIds);
  assert.equal((await db.query<any>("SELECT has_function_privilege('service_role','public.assisted_apply_snapshot(integer,jsonb)','EXECUTE') AS allowed")).rows[0].allowed,false,'internal snapshot writer is not callable via REST');
  for(const role of ['anon','authenticated'])assert.equal((await db.query<any>(`SELECT has_function_privilege('${role}','public.assisted_bootstrap_session(integer,uuid,jsonb,jsonb,jsonb,text)','EXECUTE') AS allowed`)).rows[0].allowed,false);
  const auditSQL=readFileSync('script/demo/sql/catalog-audit.sql','utf8');
  const select=auditSQL.slice(auditSQL.indexOf('SELECT jsonb_build_object('),auditSQL.lastIndexOf('COMMIT;'));
  const catalog=(await db.query<any>(select)).rows[0].audit;
  const issues=inspectA2Catalog(catalog,'2026-10-30').issues;
  assert.deepEqual(issues.filter(s=>s.startsWith('RPC_')||s.startsWith('MISSING_COLUMN:')||s.startsWith('MISSING_ID_SEQUENCE:')),[],'exported PostgreSQL definitions must match the preflight contracts');
 }finally{await db.exec('ROLLBACK; RESET ROLE');}
});
