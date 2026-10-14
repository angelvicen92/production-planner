import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { executionDuration, formatExecutionDuration, madridClockBase } from '../shared/execution';

const actor = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
async function database() {
  const db = new PGlite();
  // Focused PostgreSQL fixture. The native rehearsal separately applies every migration.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TYPE task_status AS ENUM('pending','in_progress','done','interrupted','cancelled');
    CREATE TABLE roles(id integer PRIMARY KEY,key text); CREATE TABLE user_roles(user_id uuid,role_id integer REFERENCES roles);
    INSERT INTO roles VALUES(1,'admin'),(2,'production'),(3,'aux'),(4,'viewer');
    INSERT INTO user_roles VALUES('${actor(1)}',1),('${actor(2)}',2),('${actor(3)}',3),('${actor(4)}',4);
    CREATE TABLE plans(id bigint PRIMARY KEY,date date,status text); INSERT INTO plans VALUES(1,'2026-10-30','published'),(2,'2026-10-31','published');
    CREATE TABLE program_settings(id integer PRIMARY KEY,clock_mode text,simulated_time text,simulated_set_at timestamptz); INSERT INTO program_settings VALUES(1,'auto',NULL,NULL);
    CREATE TABLE daily_tasks(id bigint PRIMARY KEY,plan_id bigint REFERENCES plans,template_id integer,contestant_id integer,space_id integer,zone_id integer,status task_status,start_planned text,end_planned text,assigned_resource_ids jsonb,duration_override integer,cameras_override integer,location_label text,start_real text,end_real text,start_real_seconds integer,end_real_seconds integer,paused_at_seconds integer,paused_at_hhmm text,paused_total_seconds integer DEFAULT 0);
    INSERT INTO daily_tasks(id,plan_id,space_id,zone_id,status,start_planned,end_planned) VALUES(1,1,10,20,'pending','09:00','09:15'),(2,1,11,21,'pending','09:15','09:30'),(3,2,10,20,'pending','09:00','09:15');
    CREATE TABLE task_status_events(id serial PRIMARY KEY,plan_id integer REFERENCES plans,task_id integer REFERENCES daily_tasks,status task_status,changed_by text,time_real text,created_at timestamptz DEFAULT now());
    CREATE TABLE locks(id serial PRIMARY KEY,plan_id integer REFERENCES plans,task_id integer REFERENCES daily_tasks,lock_type text,locked_start text,locked_end text,created_by text,reason text);
    CREATE TABLE user_entity_links(user_id uuid,entity_type text,entity_id bigint,is_primary boolean);
    CREATE TABLE staff_people(id bigint PRIMARY KEY,is_active boolean); INSERT INTO staff_people VALUES(5,true);
    CREATE TABLE plan_staff_assignments(plan_id bigint,staff_person_id bigint,scope_type text,zone_id bigint,space_id bigint);
    CREATE TABLE plan_zone_staff_mode(plan_id bigint,zone_id bigint,mode text);
    CREATE TABLE plan_space_settings(plan_id bigint,space_id bigint,zone_id bigint);
    CREATE TABLE resource_items(id bigint PRIMARY KEY,is_active boolean);
    CREATE TABLE plan_resource_items(id bigint PRIMARY KEY,plan_id bigint,resource_item_id bigint,is_available boolean,name text);
    CREATE TABLE plan_space_resource_assignments(plan_id bigint,space_id bigint,plan_resource_item_id bigint);
    CREATE TABLE plan_zone_resource_assignments(plan_id bigint,zone_id bigint,plan_resource_item_id bigint);
    CREATE TABLE assisted_planning_sessions(plan_id integer,status text,active_stage_id bigint,draft_fingerprint text);
    CREATE TABLE assisted_planning_stages(id bigint PRIMARY KEY,plan_id integer,ordinal integer,archived_at timestamptz,snapshot_json jsonb,snapshot_fingerprint text);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon,authenticated,service_role;`);
  await db.exec(readFileSync('supabase/migrations/092_live_task_execution.sql', 'utf8'));
  return db;
}
const transition = (db: PGlite, task: number, status: string, user = actor(2), expected: string | null = null) => db.query<any>('SELECT * FROM public.execute_task_transition($1,$2,$3,$4)', [task, user, status, expected]);
const material = async (db: PGlite) => (await db.query('SELECT (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t) tasks,(SELECT jsonb_agg(e ORDER BY id) FROM task_status_events e) events,(SELECT jsonb_agg(l ORDER BY id) FROM locks l) locks')).rows;

test('nominal plan authority, terminal states, one execution lock and audit-preserving reset', async () => {
  const db = await database();
  try {
    const initial = await material(db);
    for (const user of [actor(3), actor(4), actor(99)]) await assert.rejects(() => transition(db, 1, 'in_progress', user), /EXECUTION_FORBIDDEN/);
    assert.deepEqual(await material(db), initial);
    await db.exec(`INSERT INTO user_entity_links VALUES('${actor(3)}','staff_person',5,true);INSERT INTO plan_staff_assignments VALUES(1,5,'space',NULL,10);`);
    await assert.rejects(() => transition(db, 2, 'in_progress', actor(3)), /EXECUTION_FORBIDDEN/);
    await assert.rejects(() => transition(db, 3, 'in_progress', actor(3)), /EXECUTION_FORBIDDEN/);
    await assert.rejects(() => transition(db, 1, 'done', actor(3)), /EXECUTION_TRANSITION/);
    const started = (await transition(db, 1, 'in_progress', actor(3), 'pending')).rows[0];
    assert.ok(started.start_real_at); assert.equal(started.start_planned, '09:00');
    await assert.rejects(() => transition(db, 1, 'in_progress', actor(3), 'pending'), /EXECUTION_STALE/);
    const done = (await transition(db, 1, 'done', actor(3), 'in_progress')).rows[0];
    assert.ok(done.end_real_at); assert.ok(Date.parse(done.end_real_at) >= Date.parse(started.start_real_at));
    await assert.rejects(() => transition(db, 1, 'done', actor(3)), /EXECUTION_TRANSITION/);
    await assert.rejects(() => transition(db, 1, 'pending', actor(1)), /EXECUTION_TRANSITION/);
    assert.equal((await db.query('SELECT * FROM locks WHERE execution_owned')).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM task_status_events')).rows.length, 2);
    await db.exec(`INSERT INTO locks(plan_id,task_id,lock_type,created_by,reason) VALUES(1,1,'full','${actor(1)}','Execution lock for rehearsal');`);
    await assert.rejects(() => db.query('SELECT public.reset_task_execution(1,$1)', [actor(3)]), /EXECUTION_FORBIDDEN/);
    await db.query('SELECT public.reset_task_execution(1,$1)', [actor(2)]);
    assert.equal((await db.query<any>('SELECT * FROM locks')).rows[0].reason, 'Execution lock for rehearsal');
    const events = (await db.query<any>('SELECT * FROM task_status_events ORDER BY id')).rows;
    assert.equal(events.length, 3); assert.equal(events[2].task_snapshot.status, 'done'); assert.equal(events[2].previous_status, 'done');
  } finally { await db.close(); }
});

test('event/lock persistence errors roll back the whole operation; clients cannot bypass it', async () => {
  const db = await database();
  try {
    for (const table of ['task_status_events', 'locks']) {
      await db.exec(`CREATE FUNCTION fail_execution() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Injected failure';END;$$; CREATE TRIGGER injected BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_execution();`);
      const before = await material(db);
      await assert.rejects(() => transition(db, 1, 'in_progress'), /Injected failure/);
      assert.deepEqual(await material(db), before);
      await db.exec(`DROP TRIGGER injected ON ${table}; DROP FUNCTION fail_execution();`);
    }
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(() => transition(db, 1, 'in_progress'), /permission denied/);
      await assert.rejects(() => db.exec("UPDATE daily_tasks SET status='done' WHERE id=1"), /permission denied/);
      await assert.rejects(() => db.exec('INSERT INTO plan_staff_assignments VALUES(1,5,\'space\',NULL,10)'), /permission denied/);
      await assert.rejects(() => db.exec("UPDATE plans SET status='published' WHERE id=1"), /permission denied/);
      await assert.rejects(() => db.exec('UPDATE plan_resource_items SET resource_item_id=7'), /permission denied/);
      await assert.rejects(() => db.exec('UPDATE plan_space_settings SET zone_id=20'), /permission denied/);
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role'); await transition(db, 1, 'in_progress'); await db.exec('RESET ROLE');
  } finally { await db.close(); }
});

test('resources require concrete identities; staff mode overrides are respected', async () => {
  const db = await database();
  try {
    await db.exec(`INSERT INTO resource_items VALUES(7,true); INSERT INTO plan_resource_items VALUES(8,1,7,true,'CAM real');INSERT INTO user_entity_links VALUES('${actor(3)}','resource_item',7,true);`);
    assert.equal((await db.query<any>('SELECT execution_task_authorized(1,$1) ok', [actor(3)])).rows[0].ok, false);
    await db.exec("UPDATE daily_tasks SET assigned_resource_ids='[8]' WHERE id=1");
    assert.equal((await db.query<any>('SELECT execution_task_authorized(1,$1) ok', [actor(3)])).rows[0].ok, true);
    assert.equal((await db.query<any>('SELECT execution_task_authorized(3,$1) ok', [actor(3)])).rows[0].ok, false);
    await db.exec(`DELETE FROM user_entity_links;INSERT INTO user_entity_links VALUES('${actor(3)}','staff_person',5,true);INSERT INTO plan_staff_assignments VALUES(1,5,'zone',20,NULL);INSERT INTO plan_zone_staff_mode VALUES(1,20,'space');`);
    assert.equal((await db.query<any>('SELECT execution_task_authorized(1,$1) ok', [actor(3)])).rows[0].ok, false);
  } finally { await db.close(); }
});

test('pauses cross minute/hour boundaries using timestamps; clock changes are rejected', async () => {
  const db = await database();
  try {
    await transition(db, 1, 'in_progress'); await transition(db, 1, 'interrupted');
    await db.exec("UPDATE daily_tasks SET paused_at=clock_timestamp()-interval '125 seconds' WHERE id=1");
    const resumed = (await transition(db, 1, 'in_progress')).rows[0];
    assert.ok(resumed.paused_total_seconds >= 125); assert.equal(resumed.paused_at, null);
    await db.exec("UPDATE program_settings SET clock_mode='manual',simulated_time='23:59',simulated_set_at=now()");
    await assert.rejects(() => transition(db, 1, 'done'), /EXECUTION_CLOCK_CHANGED/);
    await db.query('SELECT reset_task_execution(1,$1)', [actor(1)]);
    const manual = (await transition(db, 1, 'in_progress')).rows[0]; assert.equal(manual.start_real, '23:59');
  } finally { await db.close(); }
  assert.equal(executionDuration({ status: 'done', startRealAt: '2026-10-30T23:59:50Z', endRealAt: '2026-10-31T00:01:05Z', pausedTotalSeconds: 10 }, 0), 65);
  assert.equal(executionDuration({ status: 'done', startReal: '09:00', endReal: '09:01' }, 0), null);
  assert.equal(formatExecutionDuration(65), '01:05');
  assert.equal(executionDuration({status:'in_progress',startRealAt:'2026-10-30T10:00:00Z',executionClockMode:'auto'},Date.parse('2026-10-30T10:01:00Z'),{mode:'manual',revision:'2026-10-30T10:00:00Z',operationalAt:'2026-10-30T10:01:00Z',serverAt:'2026-10-30T10:01:00Z'}),null);
});

test('Madrid simulated display is independent of host timezone and preserves DST boundaries', () => {
  assert.equal(madridClockBase('09:00', new Date('2026-10-14T12:00:00Z')).toISOString(), '2026-10-14T07:00:00.000Z');
  assert.equal(madridClockBase('09:00', new Date('2026-10-30T12:00:00Z')).toISOString(), '2026-10-30T08:00:00.000Z');
  assert.equal(madridClockBase('01:30', new Date('2026-10-25T12:00:00Z')).toISOString(), '2026-10-24T23:30:00.000Z');
  assert.equal(madridClockBase('04:00', new Date('2026-10-25T12:00:00Z')).toISOString(), '2026-10-25T03:00:00.000Z');
});
