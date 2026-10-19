import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actor, executionDatabase } from './fixtures/executionDatabase';

async function database() {
  const db = await executionDatabase();
  await db.exec(`ALTER TABLE plans ADD COLUMN work_start text DEFAULT '09:00', ADD COLUMN work_end text DEFAULT '21:00';
    UPDATE program_settings SET clock_mode='manual',simulated_time='10:00',simulated_set_at=clock_timestamp()-interval '25 hours';`);
  await db.exec(readFileSync('supabase/migrations/097_audited_execution_time_corrections.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/098_execution_start_workday.sql', 'utf8'));
  return db;
}
type DB = Awaited<ReturnType<typeof database>>;
const transition = (db: DB, status = 'in_progress', version = 0, task = 1, user = actor(2), expected = 'pending') =>
  db.query<any>('SELECT * FROM execute_task_transition($1,$2,$3,$4,$5)', [task, user, status, expected, version]);
const material = async (db: DB) => (await db.query(`SELECT
  (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t) tasks,
  (SELECT jsonb_agg(e ORDER BY id) FROM task_status_events e) events,
  (SELECT jsonb_agg(l ORDER BY id) FROM locks l) locks`)).rows;
const manual = (db: DB, time: string, age = '0 seconds') => db.query(
  "UPDATE program_settings SET clock_mode='manual',simulated_time=$1,simulated_set_at=clock_timestamp()-$2::interval", [time, age]);
// Exact boundary/automatic-clock cases only. Native HTTP tests use the real clock.
const instant = (db: DB, at: string) => db.exec(`CREATE OR REPLACE FUNCTION public.execution_clock(p_plan_id bigint)
  RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object('serverAt',clock_timestamp(),'operationalAt','${at}'::timestamptz,'mode','auto','revision',NULL) $$;`);
const deny = async (db: DB, action: () => Promise<unknown>, error = /EXECUTION_START_WORKDAY/) => {
  const before = await material(db);
  await assert.rejects(action, error);
  assert.deepEqual(await material(db), before);
};

test('P7: a manual clock advanced beyond the plan date rejects Start without writes', async () => {
  const db = await database();
  try {
    const before = await material(db);
    await assert.rejects(() => transition(db), /EXECUTION_START_WORKDAY/);
    assert.deepEqual(await material(db), before);
  } finally { await db.close(); }
});

test('P7 same-day reality: early and late Starts preserve the real timestamp outside planning hours', async () => {
  const db = await database();
  try {
    await db.exec("UPDATE plans SET date='2026-10-31',work_start='08:00',work_end='19:00' WHERE id=1");
    let version = 0;
    for (const at of ['2026-10-31T18:10:00Z','2026-10-31T06:50:00Z','2026-10-31T11:00:00Z']) {
      await instant(db, at);
      const started = (await transition(db, 'in_progress', version)).rows[0];
      assert.equal(new Date(started.start_real_at).toISOString(), at.replace('Z', '.000Z'));
      assert.equal(started.start_planned, '09:00');
      await db.query('SELECT reset_task_execution(1,$1)', [actor(2)]); version += 2;
    }
  } finally { await db.close(); }
});

test('P7 same-day reality: legacy late Start and Finish can be corrected with immutable audit', async () => {
  const db = await database();
  try {
    await db.exec("UPDATE plans SET date='2026-10-31',work_start='08:00',work_end='19:00' WHERE id=1");
    // A real late run already admitted by 097 must remain correctable after 098.
    const source = readFileSync('supabase/migrations/097_audited_execution_time_corrections.sql','utf8');
    const begin = source.indexOf('CREATE OR REPLACE FUNCTION public.execute_task_transition(');
    await db.exec(source.slice(begin, source.indexOf('\n$$;',begin)+4));
    await instant(db, '2026-10-31T18:10:00Z');
    const started = (await transition(db)).rows[0];
    const beforeMigration = await material(db);
    const metadata = () => db.query("SELECT oid,proacl,pg_get_function_arguments(oid) args FROM pg_proc WHERE oid='public.correct_task_execution_time(bigint,uuid,text,text,text,integer)'::regprocedure");
    const signature = (await metadata()).rows;
    await db.exec(readFileSync('supabase/migrations/098_execution_start_workday.sql','utf8'));
    assert.deepEqual(await material(db), beforeMigration);
    assert.deepEqual((await metadata()).rows, signature);
    const locks = (await db.query('SELECT * FROM locks')).rows;
    const correct = (field: string, at: string, version: number) => db.query<any>(
      'SELECT * FROM correct_task_execution_time(1,$1,$2,$3,$4,$5)', [actor(2),field,at,'Registro real fuera del horario previsto',version]);
    const corrected = (await correct('start','2026-10-31T19:05:00+01:00',1)).rows[0];
    assert.equal(corrected.start_real,'19:05');
    await instant(db,'2026-10-31T18:20:00Z');
    await transition(db,'done',2,1,actor(2),'in_progress');
    const done = (await correct('end','2026-10-31T19:15:00+01:00',3)).rows[0];
    assert.equal(done.end_real,'19:15'); assert.equal(done.execution_version,4);
    assert.equal(done.start_planned,started.start_planned); assert.equal(done.end_planned,started.end_planned);
    assert.deepEqual((await db.query('SELECT * FROM locks')).rows,locks);
    await deny(db,()=>correct('start','2026-10-30T19:05:00+01:00',4),/EXECUTION_WORKDAY/);
    await deny(db,()=>correct('end','2026-11-01T19:15:00+01:00',4),/EXECUTION_CHRONOLOGY/);
    await deny(db,()=>correct('start','2026-10-31T19:16:00+01:00',4),/EXECUTION_CHRONOLOGY/);
    const events = (await db.query<any>('SELECT * FROM task_status_events ORDER BY id')).rows;
    assert.deepEqual(events.map(e=>e.event_kind),['transition','time_correction','transition','time_correction']);
    assert.equal(new Date(events[0].task_snapshot.start_real_at).getTime(),new Date(started.start_real_at).getTime());
    assert.equal(events[1].changed_by,actor(2)); assert.equal(events[1].reason,'Registro real fuera del horario previsto');
    assert.equal(new Date(events[1].old_value).getTime(),new Date(started.start_real_at).getTime());
    assert.equal(new Date(events[1].new_value).getTime(),new Date(corrected.start_real_at).getTime());
    assert.ok(events[1].previous_snapshot && events[1].task_snapshot);
    await assert.rejects(()=>db.exec("UPDATE task_status_events SET reason='changed'"),/EXECUTION_HISTORY_IMMUTABLE/);
    const history = (await db.query<any>('SELECT task_execution_history(1,$1) value',[actor(4)])).rows[0].value;
    assert.equal(history.executionVersion,4); assert.equal(history.events.length,4);
  } finally { await db.close(); }
});

test('P7: Madrid date independent of planning hours, without changing the plan or clock', async () => {
  const db = await database();
  try {
    const planning = (await db.query('SELECT * FROM plans ORDER BY id')).rows;
    const clock = (await db.query('SELECT * FROM program_settings')).rows;
    for (const at of ['2026-10-29T09:00:00Z','2026-10-31T09:00:00Z','2026-10-29T22:59:59.999999Z','2026-10-30T23:00:00Z']) {
      await instant(db, at); await deny(db, () => transition(db));
    }
    for (const at of ['2026-10-29T23:00:00Z','2026-10-30T08:00:00Z','2026-10-30T12:00:00Z','2026-10-30T20:00:00Z','2026-10-30T22:59:59Z']) {
      await instant(db, at);
      const version = (await db.query<any>('SELECT execution_version FROM daily_tasks WHERE id=1')).rows[0].execution_version;
      const started = (await transition(db, 'in_progress', version)).rows[0];
      assert.equal(new Date(started.start_real_at).toISOString(), at.replace('Z', '.000Z'));
      await db.query('SELECT reset_task_execution(1,$1)', [actor(2)]);
    }
    assert.deepEqual((await db.query('SELECT * FROM plans ORDER BY id')).rows, planning);
    assert.deepEqual((await db.query('SELECT * FROM program_settings')).rows, clock);
    for (const [from, until] of [[null,'21:00'],['09:00',null],['21:00','09:00'],['09:00','09:00']]) {
      await db.query('UPDATE plans SET work_start=$1,work_end=$2 WHERE id=1', [from,until]);
      const version = (await db.query<any>('SELECT execution_version FROM daily_tasks WHERE id=1')).rows[0].execution_version;
      await instant(db,'2026-10-30T12:00:00Z');
      await transition(db, 'in_progress', version);
      await db.query('SELECT reset_task_execution(1,$1)', [actor(2)]);
      // Inverted/null planning bounds never authorize the adjacent date.
      await instant(db,'2026-10-31T01:00:00Z');
      await deny(db,()=>transition(db,'in_progress',version+2));
    }
  } finally { await db.close(); }
});

test('P7: actual automatic clock rejects another day; fresh simulation resolves each plan date', async () => {
  const db = await database();
  try {
    await db.exec("UPDATE program_settings SET clock_mode='auto';UPDATE plans SET date=(clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date+1 WHERE id=1");
    await deny(db, () => transition(db));
    await db.exec("UPDATE plans SET date=(clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date-1 WHERE id=1");
    await deny(db, () => transition(db));
    await manual(db, '10:00');
    for (const task of [1,3]) {
      const started = (await transition(db, 'in_progress', 0, task)).rows[0];
      const day = (await db.query<any>("SELECT date::text AS plan_day FROM plans WHERE id=$1", [started.plan_id])).rows[0].plan_day;
      assert.equal((await db.query<any>("SELECT ($1::timestamptz AT TIME ZONE 'Europe/Madrid')::date::text AS plan_day", [started.start_real_at])).rows[0].plan_day, day);
    }
  } finally { await db.close(); }
});

test('P7: Madrid DST manual gap/fold rejected, unambiguous bases on both transition days accepted', async () => {
  const db = await database();
  try {
    await db.exec("UPDATE plans SET work_start='00:00',work_end='23:59'");
    let version = 0;
    for (const day of ['2026-03-29','2026-10-25']) {
      await db.query('UPDATE plans SET date=$1 WHERE id=1', [day]);
      await manual(db, '02:30');
      await deny(db, () => transition(db, 'in_progress', version), /EXECUTION_CLOCK_INVALID/);
      // Elapsed time cannot make an ambiguous/nonexistent manual base legitimate.
      await manual(db, '02:30', '2 hours');
      await deny(db, () => transition(db, 'in_progress', version), /EXECUTION_CLOCK_INVALID/);
      for (const time of ['01:30','04:00']) {
        await manual(db, time);
        const started = (await transition(db, 'in_progress', version)).rows[0];
        assert.equal(started.start_real, time);
        await db.query('SELECT reset_task_execution(1,$1)', [actor(2)]); version += 2;
      }
    }
    // A unique pre-fold base may advance to either real occurrence of 02:30.
    for (const age of ['1 hour','2 hours']) {
      await manual(db, '01:30', age);
      const started = (await transition(db, 'in_progress', version)).rows[0];
      assert.equal(started.start_real, '02:30');
      await db.query('SELECT reset_task_execution(1,$1)', [actor(2)]); version += 2;
    }
  } finally { await db.close(); }
});

test('P7: elapsed time follows the 23/25-hour Madrid calendar day, independently of session timezone', async () => {
  const db = await database();
  try {
    await db.exec("SET TIME ZONE 'America/New_York';UPDATE plans SET work_start='00:00',work_end='23:59'");
    let version = 0;
    for (const [day, inside, outside] of [['2026-03-29','22 hours','23 hours'],['2026-10-25','24 hours','25 hours']]) {
      await db.query('UPDATE plans SET date=$1 WHERE id=1', [day]);
      await manual(db, '00:30', inside);
      const started = (await transition(db, 'in_progress', version)).rows[0];
      assert.equal(started.start_real, '23:30');
      await db.query('SELECT reset_task_execution(1,$1)', [actor(2)]); version += 2;
      await manual(db, '00:30', outside);
      await deny(db, () => transition(db, 'in_progress', version));
    }
    await db.exec("UPDATE plans SET date='2026-10-30' WHERE id=1");
    await instant(db, '2026-10-29T23:30:00Z');
    assert.equal((await transition(db, 'in_progress', version)).rows[0].start_real, '00:30');
  } finally { await db.close(); }
});

test('P7: permissions, observed version, readiness and occupancy remain independent of time', async () => {
  const db = await database();
  try {
    await db.exec(`INSERT INTO user_entity_links VALUES('${actor(3)}','staff_person',5,true);
      INSERT INTO plan_staff_assignments VALUES(1,5,'space',NULL,10,'editorial');`);
    for (const user of [actor(3),actor(4),actor(99)]) await deny(db, () => transition(db, 'in_progress', 0, 1, user), /EXECUTION_FORBIDDEN/);
    await deny(db, () => transition(db, 'in_progress', 1), /EXECUTION_STALE/);
    await db.exec("UPDATE plans SET status='draft' WHERE id=1");
    await deny(db, () => transition(db), /EXECUTION_PLANNING_REQUIRED/);
    await db.exec("UPDATE plans SET status='published' WHERE id=1;UPDATE plan_staff_assignments SET staff_role='production'");
    await deny(db, () => transition(db, 'in_progress', 0, 1, actor(3)));
    await manual(db, '10:00');
    await transition(db, 'in_progress', 0, 1, actor(3));
    await db.exec('UPDATE daily_tasks SET space_id=10 WHERE id=2');
    await deny(db, () => transition(db, 'in_progress', 0, 2), /EXECUTION_OCCUPIED/);
    await deny(db, () => transition(db), /EXECUTION_STALE/);
  } finally { await db.close(); }
});

test('P7: existing runs can Finish/Interrupt/Resume/Cancel after the day; reset permits no invalid new Start', async () => {
  const db = await database();
  try {
    await instant(db, '2026-10-30T19:00:00Z'); await transition(db);
    await instant(db, '2026-10-31T19:00:00Z');
    await transition(db, 'interrupted', 1, 1, actor(2), 'in_progress');
    await transition(db, 'in_progress', 2, 1, actor(2), 'interrupted');
    await transition(db, 'done', 3, 1, actor(2), 'in_progress');
    await db.query('SELECT reset_task_execution(1,$1)', [actor(2)]);
    await deny(db, () => transition(db, 'in_progress', 5));
    await transition(db, 'cancelled', 5);
    await instant(db, '2026-10-30T19:00:00Z'); await transition(db, 'in_progress', 0, 2);
    await instant(db, '2026-10-31T19:00:00Z');
    await transition(db, 'interrupted', 1, 2, actor(2), 'in_progress');
    await transition(db, 'cancelled', 2, 2, actor(2), 'interrupted');
  } finally { await db.close(); }
});

test('P7: changed/reversed clocks retain their existing conflicts and reset remains available', async () => {
  const db = await database();
  try {
    await manual(db, '10:00'); await transition(db);
    await manual(db, '11:00');
    for (const status of ['done','interrupted']) await deny(db, () => transition(db, status, 1, 1, actor(2), 'in_progress'), /EXECUTION_CLOCK_CHANGED/);
    await db.query('SELECT reset_task_execution(1,$1)', [actor(2)]);
    await instant(db, '2026-10-30T09:00:00Z'); await transition(db, 'in_progress', 2);
    await instant(db, '2026-10-30T08:00:00Z');
    await deny(db, () => transition(db, 'done', 3, 1, actor(2), 'in_progress'), /EXECUTION_CLOCK_REVERSED/);
  } finally { await db.close(); }
});

test('P7: replacement preserves signature/ACL and existing data; no retroactive validation', async () => {
  const db = await database();
  try {
    const source = readFileSync('supabase/migrations/097_audited_execution_time_corrections.sql','utf8');
    const begin = source.indexOf('CREATE OR REPLACE FUNCTION public.execute_task_transition(');
    await db.exec(source.slice(begin, source.indexOf('\n$$;',begin)+4));
    // The demonstrated pre-P7 defect leaves a real, out-of-day legacy run.
    await transition(db);
    const before = await material(db);
    const metadata = () => db.query("SELECT oid,proacl,pg_get_function_arguments(oid) args FROM pg_proc WHERE oid='public.execute_task_transition(bigint,uuid,text,text,integer)'::regprocedure");
    const signature = (await metadata()).rows;
    await db.exec(readFileSync('supabase/migrations/098_execution_start_workday.sql','utf8'));
    assert.deepEqual((await metadata()).rows, signature);
    assert.deepEqual(await material(db), before);
    await transition(db, 'done', 1, 1, actor(2), 'in_progress');
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(() => transition(db), /permission denied/);
      await db.exec('RESET ROLE');
    }
  } finally { await db.close(); }
});

test('P7: HTTP mapping distinguishes temporal, permission, concurrent and transient failures', async () => {
  // Importing the existing mapper also initializes its RPC client. This pure
  // mapping test needs no connected account and must run in credential-free CI.
  process.env.SUPABASE_URL ??= 'http://localhost';
  process.env.SUPABASE_ANON_KEY ??= 'test';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';
  const { executionError } = await import('./liveExecution');
  assert.deepEqual(executionError({message:'EXECUTION_START_WORKDAY'}), {status:409,message:'La hora operativa no corresponde a la jornada del planning.'});
  assert.equal(executionError({message:'EXECUTION_FORBIDDEN'}).status,403);
  assert.equal(executionError({message:'EXECUTION_STALE'}).status,409);
  assert.equal(executionError({message:'EXECUTION_CLOCK_CHANGED'}).status,409);
  const distinct = ['EXECUTION_START_WORKDAY','EXECUTION_CLOCK_INVALID','EXECUTION_CLOCK_CHANGED','EXECUTION_STALE','EXECUTION_CHRONOLOGY','EXECUTION_FORBIDDEN'].map(message=>executionError({message}).message);
  assert.equal(new Set(distinct).size,distinct.length);
  assert.equal(executionError({message:'database unavailable'}).status,503);
});
