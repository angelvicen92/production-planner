import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { executionDuration, formatExecutionDuration, madridClockBase } from '../shared/execution';

import { actor, executionDatabase as database } from './fixtures/executionDatabase';

const transition = (db: PGlite, task: number, status: string, user = actor(2), expected: string | null = null) => db.query<any>('SELECT * FROM public.execute_task_transition($1,$2,$3,$4)', [task, user, status, expected]);
const material = async (db: PGlite) => (await db.query('SELECT (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t) tasks,(SELECT jsonb_agg(e ORDER BY id) FROM task_status_events e) events,(SELECT jsonb_agg(l ORDER BY id) FROM locks l) locks')).rows;

test('nominal plan authority, terminal states, one execution lock and audit-preserving reset', async () => {
  const db = await database();
  try {
    const initial = await material(db);
    for (const user of [actor(3), actor(4), actor(99)]) await assert.rejects(() => transition(db, 1, 'in_progress', user), /EXECUTION_FORBIDDEN/);
    assert.deepEqual(await material(db), initial);
    await db.exec(`INSERT INTO user_entity_links VALUES('${actor(3)}','staff_person',5,true);INSERT INTO plan_staff_assignments VALUES(1,5,'space',NULL,10,'production');`);
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
      await assert.rejects(() => db.exec('INSERT INTO plan_staff_assignments VALUES(1,5,\'space\',NULL,10,\'production\')'), /permission denied/);
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
    await db.exec(`DELETE FROM user_entity_links;INSERT INTO user_entity_links VALUES('${actor(3)}','staff_person',5,true);INSERT INTO plan_staff_assignments VALUES(1,5,'zone',20,NULL,'production');INSERT INTO plan_zone_staff_mode VALUES(1,20,'space');`);
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

test('G0: editorial assignment alone grants no execution scope or Start/Finish authority', async () => {
  const db = await database();
  try {
    await db.exec(`INSERT INTO user_entity_links VALUES('${actor(3)}','staff_person',5,true);
      INSERT INTO plan_staff_assignments VALUES(1,5,'space',NULL,10,'editorial');`);
    const context = (await db.query<any>('SELECT execution_context(1,$1) value', [actor(3)])).rows[0].value;
    assert.equal(context.hasScope, false);
    assert.deepEqual(context.tasks.map((t: any) => [t.inScope,t.hasAuthority,t.canExecute]), [[false,false,false],[false,false,false]]);
    const before = await material(db);
    await assert.rejects(() => transition(db, 1, 'in_progress', actor(3)), /EXECUTION_FORBIDDEN/);
    assert.deepEqual(await material(db), before);
    await transition(db, 1, 'in_progress', actor(2));
    const running = await material(db);
    await assert.rejects(() => transition(db, 1, 'done', actor(3)), /EXECUTION_FORBIDDEN/);
    assert.deepEqual(await material(db), running);
  } finally { await db.close(); }
});

test('G0 historical reproduction: 093/094 accept editorial execution/incidents and persist events', async () => {
  const db = await database({ incidents: true, scopeFix: false });
  try {
    await db.exec(`INSERT INTO user_entity_links VALUES('${actor(3)}','staff_person',5,true);
      INSERT INTO plan_staff_assignments VALUES(1,5,'space',NULL,10,'editorial');`);
    const context = (await db.query<any>('SELECT execution_context(1,$1) value', [actor(3)])).rows[0].value;
    assert.equal(context.hasScope, true);
    assert.equal(context.tasks[0].canExecute, true);
    await transition(db, 1, 'in_progress', actor(3));
    await transition(db, 1, 'done', actor(3));
    assert.equal((await db.query('SELECT * FROM task_status_events')).rows.length, 2);
    assert.equal((await db.query<any>('SELECT status FROM daily_tasks WHERE id=1')).rows[0].status, 'done');
    const incident=(await db.query<any>('SELECT incident_command(1,$1,\'create\',$2) value',[actor(3),JSON.stringify({requestId:actor(8),type:'technical',severity:'warn',description:'Editorial legacy',taskId:1})])).rows[0].value;
    assert.equal(incident.canManage,true);
    assert.equal((await db.query('SELECT * FROM operational_incident_events')).rows.length,1);
  } finally { await db.close(); }
});

test('G0: effective production scopes cover zones, multiple spaces/zones and overlapping helpers', async () => {
  const db = await database();
  try {
    await db.exec(`INSERT INTO user_roles VALUES('${actor(5)}',3);
      INSERT INTO staff_people VALUES(6,true);
      INSERT INTO user_entity_links VALUES('${actor(3)}','staff_person',5,true),('${actor(5)}','staff_person',6,true);
      INSERT INTO daily_tasks(id,plan_id,space_id,zone_id,status,start_planned,end_planned) VALUES(4,1,12,20,'pending','09:30','09:45');
      INSERT INTO plan_staff_assignments VALUES(1,5,'zone',20,NULL,'production'),(1,5,'zone',21,NULL,'editorial');
      INSERT INTO plan_zone_staff_mode VALUES(1,20,'zone'),(1,21,'zone');`);
    const scope = async (user=actor(3)) => (await db.query<any>('SELECT execution_context(1,$1) value',[user])).rows[0].value;
    const flags = (context: any) => context.tasks.map((t: any)=>[t.taskId,t.inScope,t.hasAuthority,t.canExecute]);
    assert.deepEqual(flags(await scope()),[[1,true,true,true],[2,false,false,false],[4,true,true,true]]);
    for (const id of [1,4]) { await transition(db,id,'in_progress',actor(3)); await transition(db,id,'done',actor(3)); }
    // A zone row is dormant in space mode: no inheritance and no misleading hasScope.
    await db.exec("UPDATE plan_zone_staff_mode SET mode='space' WHERE zone_id=20");
    assert.equal((await scope()).hasScope,false);
    await db.exec(`INSERT INTO plan_staff_assignments VALUES(1,5,'space',NULL,10,'production'),(1,5,'space',NULL,12,'production');`);
    assert.deepEqual((await scope()).tasks.filter((t:any)=>t.inScope).map((t:any)=>t.taskId),[1,4]);
    // A second production zone extends the same person's scope; another helper may overlap.
    await db.exec(`INSERT INTO plan_staff_assignments VALUES(1,5,'zone',21,NULL,'production'),(1,6,'space',NULL,10,'production');`);
    assert.deepEqual((await scope()).tasks.filter((t:any)=>t.inScope).map((t:any)=>t.taskId),[1,2,4]);
    assert.deepEqual((await scope(actor(5))).tasks.filter((t:any)=>t.inScope).map((t:any)=>t.taskId),[1]);
    for (const user of [actor(3),actor(5)]) {
      await db.query('SELECT reset_task_execution(1,$1)',[actor(1)]);
      await transition(db,1,'in_progress',user); await transition(db,1,'done',user);
    }
    await transition(db,2,'in_progress',actor(3)); await transition(db,2,'done',actor(3));
  } finally { await db.close(); }
});

test('G0: revoked, inactive and non-primary identities lose authority; global roles and nominal resources retain it', async () => {
  const db = await database();
  try {
    await db.exec(`INSERT INTO user_entity_links VALUES('${actor(3)}','staff_person',5,true);
      INSERT INTO plan_staff_assignments VALUES(1,5,'space',NULL,10,'production');`);
    await transition(db,1,'in_progress',actor(3));
    for (const revoke of [
      "UPDATE plan_staff_assignments SET staff_role='editorial'",
      'UPDATE staff_people SET is_active=false',
      'UPDATE user_entity_links SET is_primary=false',
      'DELETE FROM plan_staff_assignments',
    ]) {
      await db.exec('BEGIN'); await db.exec(revoke);
      const before=await material(db);
      await db.exec('SAVEPOINT denied_transition');
      await assert.rejects(()=>transition(db,1,'done',actor(3)),/EXECUTION_FORBIDDEN/);
      await db.exec('ROLLBACK TO SAVEPOINT denied_transition');
      assert.deepEqual(await material(db),before);
      assert.equal((await db.query<any>('SELECT execution_context(1,$1) value',[actor(3)])).rows[0].value.hasScope,false);
      await db.exec('ROLLBACK');
    }
    for (const user of [actor(1),actor(2)]) {
      const context=(await db.query<any>('SELECT execution_context(1,$1) value',[user])).rows[0].value;
      assert.equal(context.hasScope,false);assert.ok(context.tasks.every((t:any)=>t.hasAuthority&&t.canExecute));
      await db.query('SELECT reset_task_execution(1,$1)',[user]);
      await transition(db,1,'in_progress',user);await transition(db,1,'done',user);
    }
    await db.exec(`INSERT INTO resource_items VALUES(7,true); INSERT INTO plan_resource_items VALUES(8,1,7,true,'CAM real');
      INSERT INTO user_entity_links VALUES('${actor(3)}','resource_item',7,true);
      UPDATE plan_staff_assignments SET staff_role='editorial';
      UPDATE daily_tasks SET assigned_resource_ids='[8]' WHERE id=1;`);
    await db.query('SELECT reset_task_execution(1,$1)',[actor(1)]);
    assert.equal((await db.query<any>('SELECT execution_context(1,$1) value',[actor(3)])).rows[0].value.hasScope,true);
    await transition(db,1,'in_progress',actor(3));await transition(db,1,'done',actor(3));
  } finally { await db.close(); }
});
