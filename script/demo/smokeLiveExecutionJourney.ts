/** Actual HTTP/Auth/PostgREST/PostgreSQL + independent Chromium sessions.
 * Called only inside the owned native rehearsal, after real Stage acceptance.
 */
import assert from 'node:assert/strict';
import type pg from 'pg';
import { chromium, type Page } from 'playwright';
import { executionDuration } from '../../shared/execution';

type User = { id: string; email: string; password: string; token: string };
export async function runLiveExecutionJourney({ appUrl, url, anon, users, db, planId, directory, pass }: {
  appUrl: string; url: string; anon: string; users: Record<string, User>; db: pg.Client; planId: number; directory: string; pass: (name: string) => void;
}) {
  assert.equal(db.host, '127.0.0.1');
  const request = async (role: string, path: string, method = 'GET', body?: unknown) => {
    if (method === 'PATCH' && /\/tasks\/\d+\/status$/.test(path) && body && (body as any).expectedVersion === undefined) {
      const taskId = Number(path.split('/')[3]);
      const observed = (await db.query('SELECT execution_version FROM daily_tasks WHERE id=$1', [taskId])).rows[0];
      body = { ...(body as object), expectedVersion: observed?.execution_version };
    }
    const response = await fetch(`${appUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(role === 'anon' ? {} : { Authorization: `Bearer ${users[role].token}` }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  const baseline = async () => (await db.query(`SELECT
    (SELECT jsonb_agg(jsonb_build_object('id',id,'template',template_id,'contestant',contestant_id,'start',start_planned,'end',end_planned,'space',space_id,'zone',zone_id,'resources',assigned_resource_ids) ORDER BY id) FROM daily_tasks WHERE plan_id=$1) tasks,
    (SELECT jsonb_agg(g ORDER BY id) FROM assisted_planning_stages g WHERE plan_id=$1) stages,
    (SELECT jsonb_agg(s ORDER BY id) FROM assisted_planning_sessions s WHERE plan_id=$1) sessions`, [planId])).rows;
  const original = await baseline();
  assert.equal(original[0].tasks.length, 266);
  const task = (await db.query(`SELECT t.*,p.name task_name FROM daily_tasks t JOIN task_templates p ON p.id=t.template_id
    WHERE t.plan_id=$1 AND t.space_id IS NOT NULL AND t.start_planned IS NOT NULL AND t.status='pending' ORDER BY t.start_planned,t.id LIMIT 1`, [planId])).rows[0];
  assert.ok(task);
  const path = `/api/tasks/${task.id}/status`;
  const material = async () => (await db.query(`SELECT (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t WHERE plan_id=$1) tasks,
    (SELECT jsonb_agg(e ORDER BY id) FROM task_status_events e WHERE plan_id=$1) events,(SELECT jsonb_agg(l ORDER BY id) FROM locks l WHERE plan_id=$1) locks`, [planId])).rows;
  const clean = await material();
  for (const role of ['anon', 'norole', 'viewer', 'aux']) {
    assert.equal((await request(role, path, 'PATCH', { status: 'in_progress' })).status, role === 'anon' ? 401 : 403);
    assert.deepEqual(await material(), clean);
  }
  pass('real HTTP anonymous/no-role/viewer/unlinked aux denied before writes');
  const staff = (await db.query("INSERT INTO staff_people(name,role_type) VALUES('Operador de ensayo','production') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO user_entity_links(user_id,entity_type,entity_id) VALUES($1,'staff_person',$2)", [users.aux.id, staff]);
  await db.query("INSERT INTO plan_staff_assignments(plan_id,staff_role,staff_person_id,scope_type,space_id) VALUES($1,'production',$2,'space',$3)", [planId, staff, task.space_id]);
  await db.query("INSERT INTO plan_zone_staff_mode(plan_id,zone_id,mode) VALUES($1,$2,'space') ON CONFLICT(plan_id,zone_id) DO UPDATE SET mode='space'", [planId, task.zone_id]);
  const outside = (await db.query('SELECT id FROM daily_tasks WHERE plan_id=$1 AND space_id IS DISTINCT FROM $2 LIMIT 1', [planId, task.space_id])).rows[0];
  assert.equal((await request('aux', `/api/tasks/${outside.id}/status`, 'PATCH', { status: 'in_progress' })).status, 403);
  const other = (await db.query('SELECT id FROM daily_tasks WHERE plan_id<>$1 LIMIT 1', [planId])).rows[0];
  assert.ok(other, 'historical preservation rehearsal provides a second independent plan');
  assert.equal((await request('aux', `/api/tasks/${other.id}/status`, 'PATCH', { status: 'in_progress' })).status, 403);
  pass('aux scoped assignment accepted; unrelated task and other plan denied');
  const context = await request('aux', `/api/plans/${planId}/execution`);
  assert.equal(context.status, 200); assert.equal(context.body.planningReady, true);
  assert.equal(context.body.planningState, 'accepted');
  // Fault injection is confined to this newly created local database.
  for (const table of ['task_status_events', 'locks']) {
    const before = await material();
    await db.query(`CREATE FUNCTION public.ejec_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Injected persistence failure';END;$$;
      CREATE TRIGGER ejec_fail BEFORE INSERT ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.ejec_fail();`);
    assert.equal((await request('aux', path, 'PATCH', { status: 'in_progress' })).status, 503);
    assert.deepEqual(await material(), before);
    await db.query(`DROP TRIGGER ejec_fail ON public.${table}; DROP FUNCTION public.ejec_fail();`);
  }
  pass('real HTTP event and lock failures leave task/history/protections unchanged');
  const raceBeganAt=Date.now();
  const race = await Promise.all(['aux', 'production'].map(role => request(role, path, 'PATCH', { status: 'in_progress', expectedStatus: 'pending', effectiveTimeHHMM: '00:00', effectiveSeconds: 59 })));
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  const recorded=race.find(r=>r.status===200)!.body;
  const actualStart=Date.parse(recorded.startRealAt);
  assert.ok(actualStart>=raceBeganAt-1000&&actualStart<=Date.now()+1000,'real clock comes from server time, regardless of browser timestamp');
  assert.equal(recorded.startReal,new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(actualStart)));
  const finishRace = await Promise.all(['aux', 'admin'].map(role => request(role, path, 'PATCH', { status: 'done', expectedStatus: 'in_progress' })));
  assert.deepEqual(finishRace.map(r => r.status).sort(), [200, 409]);
  assert.equal((await request('production', path, 'PATCH', { status: 'pending' })).status, 409);
  assert.equal((await request('production', `/api/tasks/${task.id}/reset`, 'POST', {})).status, 200);
  pass('native simultaneous Start/Finish each commit once; server clock and audited reset');
  assert.equal((await request('viewer','/api/program-settings','PATCH',{clockMode:'manual',simulatedTime:task.start_planned})).status,403);
  assert.equal((await request('admin','/api/program-settings','PATCH',{clockMode:'manual',simulatedTime:task.start_planned})).status,200);
  const simulated=await request('aux',`/api/plans/${planId}/execution`);
  assert.equal(simulated.body.clock.mode,'manual');assert.ok(simulated.body.clock.revision);
  pass('admin HTTP enables the existing simulated clock; viewer cannot alter it');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const errors: string[] = [];
  const operatorContext = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });
  const observerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Madrid' });
  const viewerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const operator = await operatorContext.newPage(), observer = await observerContext.newPage(), viewer = await viewerContext.newPage();
  const login = async (page: Page, role: string) => {
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${appUrl}/login`,{waitUntil:'domcontentloaded'});
    await page.getByLabel('Email', { exact: true }).fill(users[role].email);
    await page.getByLabel('Contraseña (opcional para enlace)', { exact: true }).fill(users[role].password);
    await page.getByRole('button', { name: 'Entrar con contraseña', exact: true }).click(); await page.waitForURL('**/dashboard');
  };
  try {
    await login(operator, 'aux'); await login(observer, 'production'); await login(viewer, 'viewer');
    await operator.goto(`${appUrl}/my-day?plan=${planId}`);
    await operator.getByTestId(`agenda-task-${task.id}`).waitFor();
    await observer.goto(`${appUrl}/plans/${planId}/control-room`);
    await observer.getByTestId('control-room-pro').waitFor();
    await observer.getByText('Inspección detallada por plató y espacio', { exact: true }).click();
    await viewer.goto(`${appUrl}/my-day?plan=${planId}`);
    await viewer.getByTestId(`agenda-task-${task.id}`).waitFor();
    assert.equal(await viewer.getByRole('button', { name: /^(Iniciar|Finalizar) / }).count(), 0);
    const person=(await db.query('SELECT name FROM contestants WHERE id=$1',[task.contestant_id])).rows[0];
    assert.ok(person);await operator.getByTestId(`agenda-task-${task.id}`).getByText(person.name,{exact:true}).waitFor();
    const scrollTop=async()=>operator.getByTestId('my-day-execution').evaluate(element=>element.scrollIntoView({block:'start'}));
    await scrollTop();
    await operator.screenshot({ path: `${directory}/mi-dia-mobile-pending.png`, fullPage: true });
    // Verify actual UI feedback for a rejected write, without request interception.
    const beforeUIFailure=await material();
    await db.query("CREATE FUNCTION public.ejec_ui_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Injected UI persistence failure';END;$$; CREATE TRIGGER ejec_ui_fail BEFORE INSERT ON task_status_events FOR EACH ROW EXECUTE FUNCTION public.ejec_ui_fail();");
    const failedResponse=operator.waitForResponse(r=>r.url().endsWith(path)&&r.request().method()==='PATCH');
    await operator.getByTestId(`agenda-task-${task.id}`).getByRole('button',{name:/^Iniciar /}).click();
    assert.equal((await failedResponse).status(),503);
    await operator.getByRole('alert').filter({hasText:'No se pudo guardar la actividad'}).first().waitFor();
    await operator.getByTestId(`agenda-task-${task.id}`).getByText('Pendiente',{exact:true}).waitFor();
    assert.deepEqual(await material(),beforeUIFailure);
    await db.query('DROP TRIGGER ejec_ui_fail ON task_status_events; DROP FUNCTION ejec_ui_fail();');
    const startedAt = Date.now();
    const startResponse = operator.waitForResponse(r => r.url().endsWith(path) && r.request().method() === 'PATCH');
    await operator.getByTestId(`agenda-task-${task.id}`).getByRole('button', { name: /^Iniciar / }).click();
    assert.equal((await startResponse).status(), 200);
    await operator.getByTestId(`execution-task-${task.id}`).getByText('En curso', { exact: true }).waitFor();
    await observer.getByTestId(`control-room-running-${task.id}`).waitFor();
    const startLatencyMs = Date.now() - startedAt;
    const parallel=(await db.query("SELECT id FROM daily_tasks WHERE plan_id=$1 AND status='pending' AND space_id IS NOT NULL AND space_id<>$2 AND contestant_id IS DISTINCT FROM $3 ORDER BY id LIMIT 1",[planId,task.space_id,task.contestant_id])).rows[0];
    assert.ok(parallel);assert.equal((await request('production',`/api/tasks/${parallel.id}/status`,'PATCH',{status:'in_progress'})).status,200);
    await viewer.getByTestId(`execution-task-${task.id}`).waitFor();
    await viewer.getByTestId(`execution-task-${parallel.id}`).waitFor();
    assert.equal(await viewer.getByRole('button',{name:/^(Iniciar|Finalizar) /}).count(),0);
    assert.equal((await request('production',`/api/tasks/${parallel.id}/status`,'PATCH',{status:'done'})).status,200);
    pass('multiple simultaneous tasks are both visible; viewer has no execution actions');
    await operator.waitForFunction(id=>{const button=document.querySelector(`[data-testid="execution-task-${id}"] button`) as HTMLButtonElement|null;return button&&!button.disabled&&button.textContent?.includes('FINALIZAR');},task.id);
    await scrollTop();
    await operator.screenshot({ path: `${directory}/mi-dia-mobile-running.png`, fullPage: true });
    await operator.setViewportSize({ width: 1440, height: 1000 });
    await scrollTop();
    await operator.screenshot({ path: `${directory}/mi-dia-desktop-running.png`, fullPage: true });
    await operatorContext.addInitScript(()=>localStorage.setItem('theme','dark'));
    await operator.emulateMedia({colorScheme:'dark'});
    await operator.evaluate(()=>document.documentElement.classList.add('dark'));
    // Badges animate their colors: wait for the complete dark theme, not just the heading.
    await operator.waitForFunction(()=>{
      const heading=document.querySelector('[data-testid="my-day-execution"] h1');
      const identity=document.querySelector('[data-testid="my-day-execution"] header .hover-elevate');
      return heading&&identity&&getComputedStyle(heading).color==='rgb(248, 250, 252)'
        &&getComputedStyle(identity).color==='rgb(248, 250, 252)';
    });
    await operator.screenshot({path:`${directory}/mi-dia-desktop-dark.png`,fullPage:true});
    await operator.evaluate(()=>document.documentElement.classList.remove('dark'));
    await operator.emulateMedia({colorScheme:'light'});
    await operator.setViewportSize({ width: 390, height: 844 });
    const finishedAt = Date.now();
    const finishResponse = operator.waitForResponse(r => r.url().endsWith(path) && r.request().method() === 'PATCH');
    await operator.getByTestId(`execution-task-${task.id}`).getByRole('button', { name: /^Finalizar / }).click();
    assert.equal((await finishResponse).status(), 200);
    await operator.getByTestId(`agenda-task-${task.id}`).getByText('Completada', { exact: true }).waitFor();
    await observer.getByTestId(`control-room-done-${task.id}`).waitFor();
    const finishLatencyMs = Date.now() - finishedAt;
    await operator.reload(); await observer.reload();
    await operator.getByTestId(`agenda-task-${task.id}`).getByText('Completada', { exact: true }).waitFor();
    await observer.getByText('Inspección detallada por plató y espacio', { exact: true }).click();
    await observer.getByTestId(`control-room-done-${task.id}`).waitFor();
    const result = (await db.query('SELECT * FROM daily_tasks WHERE id=$1', [task.id])).rows[0];
    assert.equal(result.status, 'done'); assert.ok(result.start_real_at); assert.ok(result.end_real_at);
    const durationSeconds = executionDuration({ status: result.status, startRealAt: result.start_real_at.toISOString(), endRealAt: result.end_real_at.toISOString(), pausedTotalSeconds: result.paused_total_seconds }, 0);
    assert.ok(durationSeconds !== null && durationSeconds >= 0);
    const events = (await db.query('SELECT status,previous_status,changed_by,operational_at FROM task_status_events WHERE task_id=$1 ORDER BY id', [task.id])).rows;
    assert.equal(events.length, 5, 'race start/finish, reset, UI start/finish; fault injections create no events');
    assert.equal(events.at(-1).changed_by, users.aux.id);
    assert.equal((await db.query('SELECT id FROM locks WHERE task_id=$1 AND execution_owned', [task.id])).rows.length, 1);
    assert.deepEqual(await baseline(), original, '266 planned identities, schedules, Stages, snapshots and Draft unchanged');
    const beforeViewer = await material();
    assert.equal((await request('viewer', path, 'PATCH', { status: 'in_progress' })).status, 403); assert.deepEqual(await material(), beforeViewer);
    await operatorContext.setOffline(true);
    await operator.getByText('Sin conexión · datos conservados', { exact: true }).waitFor();
    assert.equal(await operator.getByRole('button', { name: /^(Iniciar|Finalizar) / }).count(), 0);
    await operatorContext.setOffline(false);
    await operator.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await operator.getByTestId(`agenda-task-${task.id}`).getByText('Completada', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await viewer.goto(`${appUrl}/plans/${planId}?tab=execution`,{waitUntil:'domcontentloaded'});
    const legacyViewer=viewer.getByTestId(`day-execution-task-${outside.id}`);
    await legacyViewer.waitFor();
    assert.equal(await legacyViewer.getByRole('button',{name:'Iniciar',exact:true}).count(),0);
    assert.equal(await legacyViewer.getByRole('button',{name:'Resetear',exact:true}).count(),0);
    pass('day workspace hides execution and reset actions without task authority');
    // The plan detail projection must expose the observed execution version to its table controls.
    const fullPlan=(await request('aux',`/api/plans/${planId}`)).body;
    assert.ok(fullPlan.dailyTasks.every((t:any)=>Number.isSafeInteger(t.executionVersion)),'full plan includes executionVersion for every task');
    // The new global table uses the very same production hook and authority.
    const pending=(await db.query("SELECT id FROM daily_tasks WHERE plan_id=$1 AND space_id=$2 AND status='pending' ORDER BY start_planned,id LIMIT 1",[planId,task.space_id])).rows[0];assert.ok(pending);
    await operator.goto(`${appUrl}/plans/${planId}?tab=execution`,{waitUntil:'domcontentloaded'});
    const row=operator.getByTestId(`day-execution-task-${pending.id}`);await row.waitFor();
    for(const [label,status] of [['Iniciar','in_progress'],['Interrumpir','interrupted'],['Reanudar','in_progress'],['Finalizar','done']] as const){
      const response=operator.waitForResponse(r=>r.url().endsWith(`/api/tasks/${pending.id}/status`)&&r.request().method()==='PATCH');
      await row.getByRole('button',{name:label,exact:true}).click();
      const reply=await response;
      assert.equal(reply.status(),200,`Day execution ${label}/${status}: request=${reply.request().postData() ?? '(none)'} response=${reply.status()===200?'OK':await reply.text()}`);
      const wanted={in_progress:'En curso',interrupted:'Interrumpida',done:'Completada'}[status];await row.getByText(wanted,{exact:true}).waitFor();
    }
    assert.equal(await row.getByRole('button',{name:'Resetear',exact:true}).count(),0,'aux cannot reset');
    await observer.goto(`${appUrl}/plans/${planId}?tab=execution`,{waitUntil:'domcontentloaded'});
    const productionRow=observer.getByTestId(`day-execution-task-${pending.id}`);await productionRow.getByText('Completada',{exact:true}).waitFor();
    await productionRow.getByRole('button',{name:'Resetear',exact:true}).click();
    const resetResponse=observer.waitForResponse(r=>r.url().endsWith(`/api/tasks/${pending.id}/reset`)&&r.request().method()==='POST');
    await observer.getByRole('alertdialog').getByRole('button',{name:'Resetear',exact:true}).click();assert.equal((await resetResponse).status(),200);
    await productionRow.getByText('Pendiente',{exact:true}).waitFor();
    assert.deepEqual(await baseline(),original,'global execution preserves all planned placements and accepted snapshots');
    await observer.getByTestId('day-header').scrollIntoViewIfNeeded();await observer.screenshot({path:`${directory}/workspace-execution-confirmed.png`});
    pass('day workspace real UI: scoped aux Start/Interrupt/Resume/Finish and Production confirmed reset; planned material unchanged');
    await db.query("INSERT INTO staff_people(name,role_type,is_active) VALUES('Redacción de ensayo','editorial',true)");
    await observer.reload();await observer.getByRole('tab',{name:'Roles',exact:true}).click();
    const staffWorkspace=observer.getByTestId('day-staff');await staffWorkspace.waitFor();
    const staffCard=staffWorkspace.getByTestId(`section-staff-zone-${task.zone_id}`);
    await staffCard.getByRole('combobox').click();await observer.getByRole('option',{name:'Plató',exact:true}).click();
    for(const [role,name] of [['Producción','Operador de ensayo'],['Redacción','Redacción de ensayo']]){
      await staffCard.getByText(role,{exact:true}).locator('..').locator('..').getByRole('button',{name:'Editar',exact:true}).click();
      await observer.getByRole('dialog').getByRole('checkbox',{name,exact:true}).check();
      await observer.getByRole('dialog').getByRole('button',{name:'Guardar',exact:true}).click();
    }
    const staffSaved=observer.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('staff-assignments'));
    await staffWorkspace.getByRole('button',{name:'Guardar',exact:true}).first().click();assert.equal((await staffSaved).status(),200);
    await observer.reload();await observer.getByRole('tab',{name:'Planning',exact:true}).click();await observer.getByTestId('assisted-workspace').waitFor();
    await observer.getByRole('button',{name:'Mostrar Platós y espacios',exact:true}).click();
    const staffPanel=observer.getByTestId('planning-panel-spaces');await staffPanel.getByText('Operador de ensayo',{exact:false}).first().waitFor();await staffPanel.getByText('Redacción de ensayo',{exact:false}).first().waitFor();
    await staffPanel.getByRole('button',{name:'Maximizar',exact:true}).click();await staffPanel.getByText('Redacción de ensayo',{exact:false}).first().scrollIntoViewIfNeeded();
    await observer.screenshot({path:`${directory}/workspace-staff-effective-headers.png`});await observer.keyboard.press('Escape');
    assert.deepEqual(await baseline(),original);
    pass('day workspace real Roles UI: save/reload Production and Editorial, then verify both effective names in accepted Planning headers');


    for (const role of ['viewer', 'aux']) {
      const headers = { apikey: anon, Authorization: `Bearer ${users[role].token}`, 'Content-Type': 'application/json' };
      const direct = await fetch(`${url}/rest/v1/rpc/execute_task_transition`, { method: 'POST', headers, body: JSON.stringify({ p_task_id: task.id, p_actor: users.admin.id, p_status: 'in_progress' }) });
      assert.equal(direct.status, 403);
    }
    pass('two independent real browsers: mobile Start -> Control Room; Finish -> persisted reload; viewer/offline/direct RPC denied');
    return { status: 'PASS', syncTransport: 'HTTP polling fallback', pollingIntervalMs: 5000, startLatencyMs, finishLatencyMs, durationSeconds, eventCount: events.length, executionLockCount: 1, preservedObligations: 266, remoteWrites: 0, dayWorkspaceTransitions:'PASS',dayWorkspaceStaffHeaders:'PASS',clockModes:'real clock HTTP races + admin-authorized simulation in browser',uiPersistenceFailure:'PASS',multipleSimultaneousTasks:'PASS',screenshots: ['mi-dia-mobile-pending.png', 'mi-dia-mobile-running.png', 'mi-dia-desktop-running.png','mi-dia-desktop-dark.png'], realtimeWebSocket: 'NOT TESTED: disposable gateway has no Realtime service' };
  } finally { await browser.close(); }
}
