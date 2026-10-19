import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actor, executionDatabase } from './fixtures/executionDatabase';
import { executionDuration } from '../shared/execution';
import { api } from '../shared/routes';

async function database() {
  const db = await executionDatabase();
  await db.exec(`ALTER TABLE plans ADD COLUMN work_start text DEFAULT '00:00', ADD COLUMN work_end text DEFAULT '23:59';
    UPDATE plans SET date=(clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date;
    INSERT INTO user_entity_links VALUES('${actor(3)}','staff_person',5,true);
    INSERT INTO plan_staff_assignments VALUES(1,5,'space',NULL,10,'production');`);
  await db.exec(readFileSync('supabase/migrations/097_audited_execution_time_corrections.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/098_execution_start_workday.sql','utf8'));
  return db;
}
type DB = Awaited<ReturnType<typeof database>>;
const row = async (db: DB, task = 1) => (await db.query<any>('SELECT * FROM daily_tasks WHERE id=$1',[task])).rows[0];
const state = async (db: DB) => (await db.query(`SELECT (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t) tasks,
  (SELECT jsonb_agg(t ORDER BY id) FROM task_status_events t) events,(SELECT jsonb_agg(t ORDER BY id) FROM locks t) locks`)).rows;
const transition = async (db: DB, status: string, version: number, task = 1) => (await db.query<any>('SELECT * FROM execute_task_transition($1,$2,$3,NULL,$4)',[task,actor(3),status,version])).rows[0];
const correct = async (db: DB, field: string, realAt: string, version: number, user = actor(3), task = 1, reason = 'Registro tardío') =>
  (await db.query<any>('SELECT * FROM correct_task_execution_time($1,$2,$3,$4,$5,$6)',[task,user,field,realAt,reason,version])).rows[0];
const iso = (at: any, seconds: number) => new Date(new Date(at).getTime()+seconds*1000).toISOString();

// The fixture starts at the real server clock; corrections move backwards only.
test('start/end, successive corrections, immutable original audit, terminal duration and locks', async () => {
  const db = await database();
  try {
    const start = await transition(db,'in_progress',0);
    const locks = (await db.query('SELECT * FROM locks')).rows;
    const first = await correct(db,'start',iso(start.start_real_at,-90),1);
    assert.equal(first.execution_version,2);assert.equal(first.status,'in_progress');
    const second = await correct(db,'start',iso(start.start_real_at,-120),2);
    assert.equal(second.execution_version,3);
    await assert.rejects(()=>transition(db,'done',1),/EXECUTION_STALE/);
    const finish = await transition(db,'done',3);
    const final = await correct(db,'end',iso(start.start_real_at,-30),4);
    assert.equal(final.status,'done');assert.equal(final.execution_version,5);
    assert.equal(final.start_planned,start.start_planned);assert.equal(final.end_planned,start.end_planned);
    assert.deepEqual((await db.query('SELECT * FROM locks')).rows,locks);
    const events = (await db.query<any>('SELECT * FROM task_status_events ORDER BY id')).rows;
    assert.deepEqual(events.map(e=>e.event_kind),['transition','time_correction','time_correction','transition','time_correction']);
    assert.equal(new Date(events[0].task_snapshot.start_real_at).getTime(),new Date(start.start_real_at).getTime());
    assert.equal(new Date(events[2].old_value).getTime(),new Date(first.start_real_at).getTime());
    assert.equal(new Date(events[2].new_value).getTime(),new Date(second.start_real_at).getTime());
    assert.ok(events.filter(e=>e.event_kind==='time_correction').every(e=>e.changed_by===actor(3)&&e.reason==='Registro tardío'&&e.created_at&&e.previous_snapshot&&e.task_snapshot&&e.status===e.previous_status));
    assert.equal(executionDuration({status:'done',startRealAt:final.start_real_at,endRealAt:final.end_real_at,pausedTotalSeconds:0},0),90);
    await assert.rejects(()=>db.exec('UPDATE task_status_events SET reason=\'changed\''),/EXECUTION_HISTORY_IMMUTABLE/);
    await assert.rejects(()=>db.exec('DELETE FROM task_status_events'),/EXECUTION_HISTORY_IMMUTABLE/);
    const history=(await db.query<any>('SELECT task_execution_history(1,$1) value',[actor(4)])).rows[0].value;
    assert.equal(history.executionVersion,5);assert.equal(history.events.length,5);
    await db.query('SELECT reset_task_execution(1,$1)',[actor(1)]);
    assert.equal((await row(db)).execution_version,6);
    await assert.rejects(()=>correct(db,'start',iso(start.start_real_at,-60),5),/EXECUTION_STALE/);
  } finally { await db.close(); }
});

test('G0 revalidation: multi-scope production, editorial/viewer/revoked/other plan and direct RPC', async () => {
  const db=await database();
  try {
    const start=await transition(db,'in_progress',0);
    const value=iso(start.start_real_at,-20);
    for(const user of [actor(4),actor(99)]) await assert.rejects(()=>correct(db,'start',value,1,user),/EXECUTION_FORBIDDEN/);
    for(const change of ["UPDATE plan_staff_assignments SET staff_role='editorial'",'UPDATE staff_people SET is_active=false','UPDATE user_entity_links SET is_primary=false','DELETE FROM plan_staff_assignments']) {
      await db.exec('BEGIN');await db.exec(change);await db.exec('SAVEPOINT reject');
      await assert.rejects(()=>correct(db,'start',value,1),/EXECUTION_FORBIDDEN/);
      await db.exec('ROLLBACK');
    }
    await assert.rejects(()=>correct(db,'start',value,0,actor(3),2),/EXECUTION_FORBIDDEN/);
    await assert.rejects(()=>correct(db,'start',value,0,actor(3),3),/EXECUTION_FORBIDDEN/);
    await db.exec("INSERT INTO plan_staff_assignments VALUES(1,5,'space',NULL,11,'production');");
    const b=await transition(db,'in_progress',0,2);await correct(db,'start',iso(b.start_real_at,-10),1,actor(3),2);
    for(const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(()=>correct(db,'start',value,1),/permission denied/);
      await assert.rejects(()=>db.exec('UPDATE daily_tasks SET execution_version=0'),/permission denied/);
      await db.exec('RESET ROLE');
    }
    await correct(db,'start',value,1,actor(2));
  } finally {await db.close();}
});

test('required version/reason/offset, unsupported states, future/date/workday and atomic rollback',async()=>{
  const db=await database();
  try {
    await assert.rejects(()=>correct(db,'start','2026-10-18T10:00:00Z',0),/EXECUTION_TRANSITION/);
    await assert.rejects(()=>db.query("SELECT execute_task_transition(1,$1,'in_progress')",[actor(3)]),/EXECUTION_STALE/);
    const start=await transition(db,'in_progress',0),value=iso(start.start_real_at,-20);
    for(const [field,at,version,reason] of [['start',value,null,'Hora'],['start',value,1,' '],['start',value,1,'\t\n'],['start','2026-10-18T10:00:00+23:00',1,'Hora'],['start',value,1,'x'.repeat(241)],['start','2026-10-18T10:00:00',1,'Hora'],['start','2026-02-30T10:00:00Z',1,'Hora'],['bad',value,1,'Hora']] as const) {
      await assert.rejects(()=>correct(db,field,at,version as any,actor(3),1,reason),/EXECUTION_(INVALID|STALE)/);
    }
    await assert.rejects(()=>correct(db,'end',value,1),/EXECUTION_TRANSITION/);
    await assert.rejects(()=>correct(db,'start',iso(start.start_real_at,3600),1),/EXECUTION_CHRONOLOGY/);
    await assert.rejects(()=>correct(db,'start',iso(start.start_real_at,-86400),1),/EXECUTION_WORKDAY/);
    await db.exec("UPDATE plans SET work_start='23:58',work_end='23:59'");
    await assert.rejects(()=>correct(db,'start',value,1),/EXECUTION_WORKDAY/);
    await db.exec("UPDATE plans SET work_start='00:00',work_end='23:59'");
    const before=await state(db);
    await db.exec("CREATE FUNCTION fail_correction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_kind='time_correction' THEN RAISE EXCEPTION 'Injected correction failure'; END IF; RETURN NEW; END;$$; CREATE TRIGGER fail_correction BEFORE INSERT ON task_status_events FOR EACH ROW EXECUTE FUNCTION fail_correction();");
    await assert.rejects(()=>correct(db,'start',value,1),/Injected correction failure/);
    assert.deepEqual(await state(db),before);
    await db.exec("UPDATE program_settings SET clock_mode='manual',simulated_time='12:00',simulated_set_at=clock_timestamp()");
    await assert.rejects(()=>correct(db,'start',value,1),/EXECUTION_CLOCK_CHANGED/);
  } finally {await db.close();}
  const schema=api.dailyTasks.correctTime.input;
  assert.ok(schema.safeParse({field:'start',realAt:'2026-10-25T02:30:00+02:00',reason:'Tarde',expectedVersion:1}).success);
  for(const patch of [{expectedVersion:undefined},{reason:' '},{realAt:'02:30'},{p_actor:actor(1)}]) assert.equal(schema.safeParse({field:'start',realAt:'2026-10-25T00:30:00Z',reason:'Tarde',expectedVersion:1,...patch}).success,false);
});

test('pause boundaries remain facts; impossible chronology rejected before and after Finish',async()=>{
  const db=await database();
  try {
    const start=await transition(db,'in_progress',0);
    await correct(db,'start',iso(start.start_real_at,-600),1);
    const paused=await transition(db,'interrupted',2);
    await assert.rejects(()=>correct(db,'start',iso(paused.paused_at,1),3),/EXECUTION_CHRONOLOGY/);
    const changed=await correct(db,'start',iso(start.start_real_at,-700),3);
    assert.equal(new Date(changed.paused_at).getTime(),new Date(paused.paused_at).getTime());
    await transition(db,'in_progress',4);
    const done=await transition(db,'done',5);
    await assert.rejects(()=>correct(db,'end',iso(paused.paused_at,-1),6),/EXECUTION_CHRONOLOGY/);
    await assert.rejects(()=>correct(db,'start',iso(done.end_real_at,1),6),/EXECUTION_CHRONOLOGY/);
  } finally {await db.close();}
});

test('Madrid DST: explicit fold instants, skipped hour and inclusive workday limits',async()=>{
  const db=await database();
  try {
    await db.exec(`UPDATE plans SET date='2026-10-25',work_start='02:00',work_end='04:00';
      UPDATE program_settings SET clock_mode='manual',simulated_time='03:59',simulated_set_at=clock_timestamp();`);
    const start=await transition(db,'in_progress',0);
    await correct(db,'start','2026-10-25T02:00:00+02:00',1);
    const done=await transition(db,'done',2);
    const corrected=await correct(db,'end','2026-10-25T02:00:00+01:00',3);
    assert.equal(executionDuration({status:'done',startRealAt:corrected.start_real_at,endRealAt:corrected.end_real_at},0),3600);
    assert.equal(corrected.start_real,'02:00');assert.equal(corrected.end_real,'02:00');
    await db.query('SELECT reset_task_execution(1,$1)',[actor(1)]);
    await db.exec("UPDATE plans SET date='2026-03-29',work_start='03:00',work_end='04:00';UPDATE program_settings SET simulated_time='03:59',simulated_set_at=clock_timestamp();");
    await transition(db,'in_progress',5);
    // 02:30 +02:00 is 01:30 Madrid, outside the configured window; no invented gap time.
    await assert.rejects(()=>correct(db,'start','2026-03-29T02:30:00+02:00',6),/EXECUTION_WORKDAY/);
    await correct(db,'start','2026-03-29T03:00:00+02:00',6);
    assert.ok(start&&done);
    await db.query('SELECT reset_task_execution(1,$1)',[actor(1)]);
    await db.exec("UPDATE program_settings SET simulated_time='02:30',simulated_set_at=clock_timestamp();");
    // Before P7, Start silently normalized this nonexistent manual 02:30.
    // Keep the historical negative correction case on a previously started run.
    await assert.rejects(()=>transition(db,'in_progress',8),/EXECUTION_START_WORKDAY/);
    await db.exec("UPDATE program_settings SET simulated_time='03:59',simulated_set_at=clock_timestamp();");
    await transition(db,'in_progress',8);
    await db.exec("UPDATE program_settings SET simulated_time='02:30',simulated_set_at=clock_timestamp();");
    await assert.rejects(()=>correct(db,'start','2026-03-29T03:00:00+02:00',9),/EXECUTION_CLOCK_CHANGED/);
  } finally {await db.close();}
});
