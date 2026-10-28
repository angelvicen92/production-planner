/** P7: owned loopback Auth -> HTTP -> PostgREST -> PostgreSQL, plus real Mi Día. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { chromium } from 'playwright';

type User = { id: string; token: string; email: string; password: string };
export async function runExecutionDateIntegrity({ appUrl, url, users, db, planId, directory, pass }: {
  appUrl: string; url: string; users: Record<string, User>; db: pg.Client; planId: number; directory: string; pass: (name: string) => void;
}) {
  assert.equal(db.host, '127.0.0.1'); assert.equal(new URL(url).hostname, '127.0.0.1');
  const request = async (role: string, path: string, method = 'GET', body?: unknown) => {
    const r = await fetch(appUrl + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${users[role].token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any };
  };
  const material = async () => (await db.query(`SELECT
    (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t) tasks,
    (SELECT jsonb_agg(e ORDER BY id) FROM task_status_events e) events,
    (SELECT jsonb_agg(l ORDER BY id) FROM locks l) locks`)).rows;
  const planning = async () => (await db.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(t)-ARRAY['status','start_real','end_real','start_real_seconds','end_real_seconds','start_real_at','end_real_at','paused_at','paused_at_hhmm','paused_at_seconds','paused_total_seconds','execution_clock_mode','execution_clock_revision','execution_version'] ORDER BY id) FROM daily_tasks t) tasks,
    (SELECT jsonb_agg(t ORDER BY id) FROM assisted_planning_stages t) stages,
    (SELECT jsonb_agg(t ORDER BY id) FROM assisted_planning_sessions t) sessions,
    (SELECT jsonb_agg(t ORDER BY id) FROM plans t) plans`)).rows;
  const original = await planning();
  assert.equal(original[0].tasks.filter((t: any) => t.plan_id === planId).length, 266);
  const task = (await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 AND space_id IS NOT NULL AND zone_id IS NOT NULL AND status=\'pending\' ORDER BY id LIMIT 1', [planId])).rows[0];
  assert.ok(task);
  const path = `/api/tasks/${task.id}/status`;
  const current = async () => (await db.query('SELECT * FROM daily_tasks WHERE id=$1', [task.id])).rows[0];
  const status = async (value: string, role = 'production', observed?: any) => {
    const t = observed ?? await current();
    return request(role, path, 'PATCH', { status: value, expectedStatus: t.status, expectedVersion: t.execution_version, effectiveTimeHHMM: '10:00', effectiveSeconds: 0 });
  };
  const reset = async () => assert.equal((await request('production', `/api/tasks/${task.id}/reset`, 'POST', {})).status, 200);
  const manual = async (time = '10:00', age = '0 seconds') => {
    assert.equal((await request('admin', '/api/program-settings', 'PATCH', { clockMode: 'manual', simulatedTime: time })).status, 200);
    if (age !== '0 seconds') await db.query("UPDATE program_settings SET simulated_set_at=clock_timestamp()-$1::interval WHERE id=1", [age]);
  };
  const outcomes: { name: string; status: number }[] = [];
  const deny = async (name: string, role = 'production', expected = 409, observed?: any) => {
    const before = await material(), result = await status('in_progress', role, observed);
    assert.equal(result.status, expected, name);
    if (expected === 409 && !name.includes('stale')) assert.equal(result.body.message, 'La hora operativa no corresponde a la jornada del planning.');
    assert.deepEqual(await material(), before, name + ': task/version/event/lock unchanged');
    outcomes.push({ name, status: result.status }); return result;
  };
  // Reproduce the actual missing SQL precondition, then install only 098 again.
  const source = readFileSync('supabase/migrations/097_audited_execution_time_corrections.sql', 'utf8');
  const begin = source.indexOf('CREATE OR REPLACE FUNCTION public.execute_task_transition(');
  await db.query(source.slice(begin, source.indexOf('\n$$;', begin) + 4));
  await manual('10:00', '25 hours');
  const old = await status('in_progress'); assert.equal(old.status, 200);
  const legacy = await current();
  const mismatch = (await db.query("SELECT (t.start_real_at AT TIME ZONE 'Europe/Madrid')::date<>p.date AS mismatch FROM daily_tasks t JOIN plans p ON p.id=t.plan_id WHERE t.id=$1", [task.id])).rows[0].mismatch;
  assert.equal(mismatch, true);
  const beforeMigration = await material();
  await db.query(readFileSync('supabase/migrations/098_execution_start_workday.sql', 'utf8'));
  assert.deepEqual(await material(), beforeMigration);
  assert.equal((await status('done')).status, 200); await reset();
  await deny('manual advanced 25h after reset');
  pass('P7 native 097 defect reproduced (HTTP 200, wrong Madrid day); 098 preserves and finishes the legacy run, then rejects new Start with HTTP 409');

  assert.equal((await request('admin', '/api/program-settings', 'PATCH', { clockMode: 'auto' })).status, 200);
  // The frozen historical day can eventually be today. Establish the mismatch
  // explicitly for this negative, then restore the exact accepted fixture.
  const acceptedDate = original[0].plans.find((p: any) => p.id === planId).date;
  await db.query("UPDATE plans SET date=(clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date-1 WHERE id=$1", [planId]);
  try { await deny('actual automatic clock on another plan date'); }
  finally { await db.query('UPDATE plans SET date=$2 WHERE id=$1', [planId, acceptedDate]); }
  assert.deepEqual(await planning(), original);
  const deviations: { time: string; start: number; correction: number; finish: number; endCorrection: number }[] = [];
  for (const time of ['08:59','21:10']) {
    await manual(time);
    const start = await status('in_progress'); assert.equal(start.status,200);
    const started = await current(); assert.equal(started.start_real,time);
    const locks = (await db.query('SELECT * FROM locks ORDER BY id')).rows;
    const correction = async (field: string, at: string) => request('production',`/api/tasks/${task.id}/real-time`,'PATCH',{
      field,realAt:at,expectedVersion:(await current()).execution_version,reason:'Hecho real fuera del horario previsto' });
    const correctedStart = await correction('start',new Date(started.start_real_at.getTime()-60000).toISOString());
    assert.equal(correctedStart.status,200);
    const finish = await status('done'); assert.equal(finish.status,200);
    const endCorrection = await correction('end',new Date(started.start_real_at.getTime()-30000).toISOString());
    assert.equal(endCorrection.status,200);
    assert.deepEqual((await db.query('SELECT * FROM locks ORDER BY id')).rows,locks);
    const history = await request('production',`/api/tasks/${task.id}/execution-history`); assert.equal(history.status,200);
    const events = history.body.events;
    const originalStart = events.findLast((e: any)=>e.event_kind==='transition'&&e.previous_status==='pending'&&e.status==='in_progress');
    assert.equal(Date.parse(originalStart.task_snapshot.start_real_at),started.start_real_at.getTime());
    assert.ok(events.some((e:any)=>e.event_kind==='time_correction'&&e.reason==='Hecho real fuera del horario previsto'&&e.previous_snapshot&&e.old_value&&e.new_value));
    const before = await material();
    const outsideDate = await correction('start',new Date(started.start_real_at.getTime()-86400000).toISOString());
    assert.equal(outsideDate.status,409); assert.deepEqual(await material(),before);
    deviations.push({time,start:start.status,correction:correctedStart.status,finish:finish.status,endCorrection:endCorrection.status});
    await reset();
  }
  await manual('10:00', '25 hours');
  const staff = (await db.query("INSERT INTO staff_people(name,role_type) VALUES('P7 nominal operator','production') RETURNING id")).rows[0];
  await db.query("INSERT INTO user_entity_links(user_id,entity_type,entity_id) VALUES($1,'staff_person',$2)", [users.aux.id, staff.id]);
  await db.query("INSERT INTO plan_zone_staff_mode(plan_id,zone_id,mode) VALUES($1,$2,'space') ON CONFLICT(plan_id,zone_id) DO UPDATE SET mode='space'", [planId, task.zone_id]);
  await db.query("INSERT INTO plan_staff_assignments(plan_id,staff_role,staff_person_id,scope_type,space_id) VALUES($1,'editorial',$2,'space',$3)", [planId, staff.id, task.space_id]);
  await deny('editorial remains forbidden', 'aux', 403); await deny('viewer remains forbidden', 'viewer', 403);
  await db.query("UPDATE plan_staff_assignments SET staff_role='production' WHERE staff_person_id=$1", [staff.id]);
  await deny('nominal production cannot bypass temporal guard', 'aux');
  const invalidRaceBefore = await material(), invalidObserved = await current();
  const invalidRace = await Promise.all(['aux','production'].map(role => status('in_progress', role, invalidObserved)));
  assert.deepEqual(invalidRace.map(r => r.status), [409,409]); assert.deepEqual(await material(), invalidRaceBefore);
  await manual();
  const observed = await current();
  const race = await Promise.all(['aux','production'].map(role => status('in_progress', role, observed)));
  assert.deepEqual(race.map(r => r.status).sort(), [200,409]);
  const started = await current();
  assert.equal(started.start_real, '10:00'); assert.equal(started.execution_version, observed.execution_version + 1);
  assert.equal((await db.query('SELECT count(*)::int n FROM task_status_events WHERE task_id=$1 AND execution_version=$2', [task.id,started.execution_version])).rows[0].n, 1);
  assert.equal((await db.query('SELECT count(*)::int n FROM locks WHERE task_id=$1 AND execution_owned', [task.id])).rows[0].n, 1);
  await reset();
  pass('P7 real HTTP: auto/day mismatch, same-day early/late Start/correction/Finish/history, G0 editorial/viewer, nominal production, invalid/valid concurrent Starts and one version/event/lock');

  // The same SQL under the actual automatic clock: all mutations roll back.
  await db.query('BEGIN');
  try {
    await db.query("UPDATE program_settings SET clock_mode='auto' WHERE id=1;UPDATE plans SET date=(clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date,work_start='00:00',work_end='23:59:59.999999' WHERE id=" + planId);
    const automatic = (await db.query('SELECT * FROM execute_task_transition($1,$2,\'in_progress\',\'pending\',$3)', [task.id,users.production.id,(await current()).execution_version])).rows[0];
    assert.equal(automatic.execution_clock_mode, 'auto');
  } finally { await db.query('ROLLBACK'); }

  // A Start waiting on settings must validate the revision/time that wins the lock.
  const blocker = new pg.Client((db as any).connectionParameters); await blocker.connect();
  try {
    for (const [time, age, expected] of [['10:00','25 hours',409],['08:00','0 seconds',200],['21:10','0 seconds',200]] as const) {
      await manual();
      await blocker.query('BEGIN'); await blocker.query('SELECT 1 FROM program_settings WHERE id=1 FOR UPDATE');
      const before = await material(), pending = status('in_progress');
      try {
        const deadline = Date.now() + 15000;
        while (!(await db.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%execute_task_transition%' AND pid<>pg_backend_pid()")).rows.length) {
          assert.ok(Date.now() < deadline, 'Start reached native settings lock'); await new Promise(r => setTimeout(r,25));
        }
        await blocker.query("UPDATE program_settings SET simulated_time=$1,simulated_set_at=clock_timestamp()-$2::interval WHERE id=1", [time,age]);
        await blocker.query('COMMIT');
        const result = await pending; assert.equal(result.status, expected);
        if (expected === 409) assert.deepEqual(await material(), before);
        else {
          const t = await current(), clock = (await db.query('SELECT simulated_set_at FROM program_settings WHERE id=1')).rows[0];
          assert.equal(t.execution_clock_revision.toISOString(), clock.simulated_set_at.toISOString());
          assert.equal(t.start_real, time); await reset();
        }
      } finally { await blocker.query('ROLLBACK'); await pending; }
    }
  } finally { await blocker.end(); }
  pass('P7 native automatic same-day Start and settings-lock races revalidate the winning clock revision before any write');

  await manual('10:00', '25 hours');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const uiWrites: { status: number; body: any }[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 820, height: 1180 }, timezoneId: 'America/New_York' });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(appUrl + '/login');
    await page.getByLabel('Email', { exact: true }).fill(users.aux.email);
    await page.getByLabel('Contraseña (opcional para enlace)', { exact: true }).fill(users.aux.password);
    await page.getByRole('button', { name: 'Entrar con contraseña', exact: true }).click(); await page.waitForURL('**/dashboard');
    await page.goto(`${appUrl}/my-day?plan=${planId}`);
    await page.getByRole('combobox', { name: 'Seleccionar jornada', exact: true }).click();
    const date = original[0].plans.find((p: any) => p.id === planId).date;
    const label = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeZone: 'Europe/Madrid' }).format(new Date(`${date}T12:00:00Z`));
    await page.getByRole('option', { name: label, exact: true }).click();
    const agenda = page.getByTestId(`agenda-task-${task.id}`);
    const click = async (action: string, expected: number) => {
      const response = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === 'PATCH');
      await agenda.getByRole('button', { name: new RegExp('^' + action + ' ') }).click();
      const r = await response; assert.equal(r.status(), expected); uiWrites.push({status:r.status(),body:r.request().postDataJSON()});
    };
    const before = await material(); await click('Iniciar',409);
    await page.getByText('La hora operativa no corresponde a la jornada del planning.', { exact: true }).first().waitFor();
    assert.deepEqual(await material(), before); await page.screenshot({ path: directory + '/p7-start-rejected.png' });
    // Same UI and observed-version path now records a real late execution.
    await manual('21:10'); await page.reload(); await click('Iniciar',200);
    const uiStart = await current(); assert.equal(uiStart.start_real,'21:10');
    const correctUI = async (field: string, time: string) => {
      await agenda.getByRole('button',{name:'Corregir hora',exact:true}).click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      await dialog.getByLabel('Hora que quieres corregir').selectOption(field);
      await dialog.getByLabel('Nueva hora real (con segundos)').fill(time);
      await dialog.getByLabel('Motivo obligatorio').fill('Desviación real del horario desde Mi Día');
      const observed = (await current()).execution_version;
      const response = page.waitForResponse(r=>r.url().endsWith(`/api/tasks/${task.id}/real-time`)&&r.request().method()==='PATCH');
      await dialog.getByRole('button',{name:'Confirmar rectificación',exact:true}).click();
      const r = await response; assert.equal(r.status(),200); assert.equal(r.request().postDataJSON().expectedVersion,observed);
      uiWrites.push({status:r.status(),body:r.request().postDataJSON()}); await dialog.waitFor({state:'hidden'});
    };
    await correctUI('start','21:09:00'); await click('Finalizar',200); await correctUI('end','21:09:30');
    await page.reload();
    const info = page.getByTestId(`activity-information-${task.id}`); await info.waitFor();
    assert.ok((await info.textContent())?.includes('21:09'));
    await agenda.getByRole('button',{name:'Corregir hora',exact:true}).click();
    await page.getByRole('button',{name:'Ver historial',exact:true}).click();
    const uiEvents = (await db.query("SELECT * FROM task_status_events WHERE task_id=$1 AND event_kind='time_correction' ORDER BY id",[task.id])).rows;
    await page.getByTestId(`time-correction-event-${uiEvents.at(-1).id}`).waitFor();
    await page.screenshot({path:directory+'/p7-late-correction-history.png'});
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
  assert.deepEqual(await planning(), original);
  pass('P7 real Mi Día -> PATCH status -> versioned SQL: rejected Start displays the domain message; late Start/Finish and both audited corrections/history work; all 266 placements and Stages remain literal');
  return { legacyStatus: old.status, legacyMismatch: mismatch, legacyOperationalAt: legacy.start_real_at, outcomes, sameDayDeviations:deviations,
    startRace: race.map(r => r.status).sort(), invalidRace: invalidRace.map(r => r.status), uiWrites,
    acceptedTaskCount:266, preservedPlanning:true, planningSha256:createHash('sha256').update(JSON.stringify(original)).digest('hex'), newSolverRun:false, remoteWrites:0 };
}
