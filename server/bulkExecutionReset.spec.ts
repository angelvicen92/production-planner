import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actor, executionDatabase } from './fixtures/executionDatabase';
import { api } from '../shared/routes';

async function database() {
  const db = await executionDatabase();
  await db.exec("ALTER TABLE plans ADD COLUMN work_start text DEFAULT '00:00', ADD COLUMN work_end text DEFAULT '23:59';");
  for (const migration of ['097_audited_execution_time_corrections','098_execution_start_workday','101_admin_bulk_execution_reset']) {
    await db.exec(readFileSync(`supabase/migrations/${migration}.sql`, 'utf8'));
  }
  await db.exec(`UPDATE daily_tasks SET status='done',execution_version=3,start_real='09:00',end_real='09:10',
      start_real_at=now()-interval '10 minutes',end_real_at=now(),assigned_resource_ids='[8]' WHERE id=1;
    UPDATE daily_tasks SET status='in_progress',execution_version=1,start_real='09:15',start_real_at=now() WHERE id=2;
    INSERT INTO daily_tasks(id,plan_id,status,execution_version,paused_total_seconds) VALUES(4,1,'interrupted',2,20),(5,1,'cancelled',1,0),(6,1,'pending',0,0);
    INSERT INTO locks(plan_id,task_id,lock_type,execution_owned,reason) VALUES(1,1,'full',true,'execution'),(1,1,'full',false,'Manual'),(1,2,'time',false,'Manual time');
    INSERT INTO task_status_events(plan_id,task_id,status,changed_by,time_real,event_kind,execution_version,task_snapshot)
      VALUES(1,1,'done','${actor(2)}','09:10','transition',3,'{"historical":true}');
    INSERT INTO assisted_planning_stages VALUES(1,1,1,NULL,'{"accepted":true}','accepted');
    INSERT INTO assisted_planning_sessions VALUES(1,'ACTIVE',1,'draft');`);
  await db.exec('REVOKE ALL ON roles FROM service_role; GRANT SELECT ON roles TO service_role;');
  return db;
}
type DB = Awaited<ReturnType<typeof database>>;
const snapshot = async (db: DB) => (await db.query<any>(`SELECT id,status,execution_version AS "executionVersion" FROM daily_tasks WHERE plan_id=1 ORDER BY id`)).rows;
const reset = async (db: DB, expected: unknown, user = actor(1), plan = 1) =>
  (await db.query<any>('SELECT reset_plan_execution($1,$2,$3) result', [plan,user,JSON.stringify(expected)])).rows[0].result;
const material = async (db: DB) => (await db.query<Record<string,any>>(`SELECT
  (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t) tasks,
  (SELECT jsonb_agg(t ORDER BY id) FROM task_status_events t) events,
  (SELECT jsonb_agg(t ORDER BY id) FROM locks t) locks,
  (SELECT jsonb_agg(t ORDER BY id) FROM assisted_planning_stages t) stages,
  (SELECT jsonb_agg(t ORDER BY plan_id) FROM assisted_planning_sessions t) sessions,
  (SELECT jsonb_agg(t ORDER BY id) FROM plans t) plans`)).rows[0];

test('ADMIN resets mixed states once; preserves pending, audit, planning, manual locks, Stages/draft and other plans', async () => {
  const db = await database();
  try {
    const before = await material(db), expected = await snapshot(db);
    await db.exec(readFileSync('supabase/migrations/101_admin_bulk_execution_reset.sql','utf8'));
    assert.deepEqual(await material(db),before,'reapplying the additive migration changes no data');
    await db.exec('SET ROLE service_role');
    assert.deepEqual(await reset(db, [...expected].reverse()), { resetCount: 4 });
    await db.exec('RESET ROLE');
    const after = await material(db);
    const changed = before.tasks.filter((t: any) => t.plan_id === 1 && t.status !== 'pending');
    for (const t of before.tasks) {
      const next = after.tasks.find((n: any) => n.id === t.id);
      if (!changed.some((n: any) => n.id === t.id)) { assert.deepEqual(next,t); continue; }
      assert.deepEqual(next, { ...t,status:'pending',execution_version:t.execution_version+1,
        start_real:null,end_real:null,start_real_seconds:null,end_real_seconds:null,start_real_at:null,end_real_at:null,
        paused_at:null,paused_at_hhmm:null,paused_at_seconds:null,paused_total_seconds:0,execution_clock_mode:null,execution_clock_revision:null });
    }
    assert.deepEqual(after.events.slice(0,before.events.length),before.events);
    assert.deepEqual(after.events.slice(before.events.length).map((e: any) => [e.task_id,e.event_kind,e.execution_version,e.changed_by,e.task_snapshot]),
      changed.map((t: any) => [t.id,'reset',t.execution_version+1,actor(1),t]));
    assert.deepEqual(after.locks,before.locks.filter((l: any) => !l.execution_owned));
    for (const key of ['stages','sessions','plans']) assert.deepEqual(after[key],before[key]);
    assert.deepEqual(await reset(db,await snapshot(db)),{resetCount:0});
    assert.deepEqual(await material(db),after);
    await assert.rejects(() => db.exec('DELETE FROM task_status_events'), /EXECUTION_HISTORY_IMMUTABLE/);
  } finally { await db.close(); }
});

test('role and RPC ACL denials, missing plan, stale version/status/membership and duplicate snapshots are atomic', async () => {
  const db = await database();
  try {
    const before = await material(db), expected = await snapshot(db);
    for (const user of [actor(2),actor(3),actor(4),actor(99)]) await assert.rejects(() => reset(db,expected,user),/EXECUTION_FORBIDDEN/);
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(() => reset(db,expected),/permission denied/);
      await db.exec('RESET ROLE');
    }
    await assert.rejects(() => reset(db,[],actor(1),99),/EXECUTION_NOT_FOUND/);
    for (const invalid of [null,{},expected.slice(1),[...expected,expected[0]],
      expected.map((t: any) => t.id===1?{...t,executionVersion:t.executionVersion-1}:t),
      expected.map((t: any) => t.id===6?{...t,status:'cancelled'}:t)]) {
      await assert.rejects(() => reset(db,invalid),/EXECUTION_STALE/);
      assert.deepEqual(await material(db),before);
    }
    // Same status after a newer execution is still stale (ABA).
    await db.exec('UPDATE daily_tasks SET execution_version=execution_version+2 WHERE id=1');
    const advanced = await material(db);
    await assert.rejects(() => reset(db,expected),/EXECUTION_STALE/);
    assert.deepEqual(await material(db),advanced);
  } finally { await db.close(); }
});

test('a late internal failure rolls back earlier resets, versions, audit inserts and execution lock deletions', async () => {
  const db = await database();
  try {
    const before = await material(db), expected = await snapshot(db);
    await db.exec(`CREATE FUNCTION fail_bulk_reset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.task_id=5 AND NEW.event_kind='reset' THEN RAISE EXCEPTION 'Injected late reset failure'; END IF;
      RETURN NEW; END; $$;
      CREATE TRIGGER fail_bulk_reset BEFORE INSERT ON task_status_events FOR EACH ROW EXECUTE FUNCTION fail_bulk_reset();`);
    await assert.rejects(() => reset(db,expected),/Injected late reset failure/);
    assert.deepEqual(await material(db),before);
  } finally { await db.close(); }
});

test('request schema requires whole-day observed states and versions and rejects actor spoofing', () => {
  const expectedTasks = [{id:1,status:'done',executionVersion:3}];
  assert.equal(api.plans.resetExecution.input.safeParse({expectedTasks}).success,true);
  for (const value of [{},{expectedTasks:[{id:1,status:'done'}]},{expectedTasks:[...expectedTasks,...expectedTasks]},
    {expectedTasks,p_actor:actor(1)},{expectedTasks:[{id:1,status:'done',executionVersion:-1}]}]) {
    assert.equal(api.plans.resetExecution.input.safeParse(value).success,false);
  }
});
