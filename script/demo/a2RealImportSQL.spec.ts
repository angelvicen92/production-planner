import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {prepareA2RealImport} from './prepareA2RealImport';import {buildA2ImportSQLFromDataset} from './prepareA2Import';
import {a2HistoricalCatalog} from './a2HistoricalCatalog';import {identifier,literal} from './sql';
const actor='00000000-0000-0000-0000-000000000001';
test('real topology SQL checks drift, aborts duplicates, preserves reused rows and rolls back only its empty new day',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${actor}');CREATE FUNCTION public.positive_integer_jsonb_array(v jsonb) RETURNS boolean LANGUAGE SQL IMMUTABLE AS 'SELECT jsonb_typeof(v)=''array''';`);
  await db.exec(readFileSync('script/demo/fixtures/application-schema.sql','utf8'));
  await db.exec(`CREATE TABLE public.roles(id uuid PRIMARY KEY,key text);CREATE TABLE public.user_roles(user_id uuid,role_id uuid);INSERT INTO roles VALUES('${actor}','production');INSERT INTO user_roles VALUES('${actor}','${actor}');`);
  const provenance=readFileSync('supabase/migrations/085_optimizer_day_config_restore.sql','utf8');await db.exec(provenance.slice(0,provenance.indexOf('-- The pre-existing Assisted refresh RPC')));
  await db.exec(readFileSync('supabase/migrations/013_space_resource_assignments.sql','utf8'));
  const tables=(await db.query<{name:string}>("SELECT table_name name FROM information_schema.columns WHERE table_schema='public' AND column_name='id' AND data_type IN ('integer','bigint')")).rows;
  for(const {name} of tables){const r=await db.query<{seq:string|null}>(`SELECT pg_get_serial_sequence('public.${name}','id') seq`);if(!r.rows[0].seq)await db.exec(`CREATE SEQUENCE ${name}_id_seq OWNED BY ${name}.id;ALTER TABLE ${name} ALTER COLUMN id SET DEFAULT nextval('${name}_id_seq')`);}
  await db.exec(`SET optiplan.confirmed_demo_project='dyqusivzgxebkxkwohwn';SET optiplan.backup_sha256='${'a'.repeat(64)}';SET optiplan.security_approved='yes';SET optiplan.import_approved='yes';SET optiplan.demo_actor='${actor}';`);
  for(const [table,rows] of Object.entries(a2HistoricalCatalog))for(const row of rows){const fields=Object.keys(row);await db.exec(`INSERT INTO ${identifier(table)} (${fields.map(identifier)}) VALUES(${fields.map(k=>literal((row as any)[k]))})`);}
  const fixture=JSON.parse(gunzipSync(readFileSync('script/demo/fixtures/a2-legacy-import.json.gz')).toString());await db.exec(buildA2ImportSQLFromDataset(fixture.dataset).sql);
  const material=async()=>({spaces:(await db.query('SELECT * FROM spaces WHERE id<100000 ORDER BY id')).rows,resources:(await db.query('SELECT * FROM resource_items ORDER BY id')).rows,oldTasks:(await db.query('SELECT * FROM daily_tasks WHERE plan_id=27001 ORDER BY id')).rows});
  const before=await material(),bundle=prepareA2RealImport('2026-10-30',27002,100000);
  await db.exec("UPDATE spaces SET name='Drift' WHERE id=39");await assert.rejects(()=>db.exec(bundle.sql),/HISTORICAL_CATALOG_DRIFT/);await db.exec("ROLLBACK;UPDATE spaces SET name='Maqui/Pelu' WHERE id=39");
  await db.exec(bundle.sql);assert.deepEqual(await material(),before);
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM daily_tasks WHERE plan_id=27002')).rows[0].n,266);
  assert.equal((await db.query<{n:number}>('SELECT count(DISTINCT space_id)::int n FROM daily_tasks WHERE plan_id=27002 AND template_id IN (SELECT id FROM task_templates WHERE name IN (\'SILLON\',\'ESTRELLAS\'))')).rows[0].n,1);
  await assert.rejects(()=>db.exec(bundle.sql),/A2_ID_COLLISION/);await db.exec('ROLLBACK');
  await assert.rejects(()=>db.exec(bundle.rollback),/ROLLBACK_APPROVAL_REQUIRED/);await db.exec("ROLLBACK;SET optiplan.rollback_approved='yes'");
  await db.exec("UPDATE daily_tasks SET start_planned='10:00' WHERE plan_id=27002 AND id=110001");await assert.rejects(()=>db.exec(bundle.rollback),/ROLLBACK_REQUIRES_EMPTY_NEW_DAY/);await db.exec("ROLLBACK;UPDATE daily_tasks SET start_planned=NULL WHERE plan_id=27002 AND id=110001");
  await db.exec(bundle.rollback);assert.deepEqual(await material(),before);assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM plans WHERE id=27002')).rows[0].n,0);
 }finally{await db.close();}
});
