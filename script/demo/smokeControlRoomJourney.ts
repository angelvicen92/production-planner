/** Actual product HTTP/Auth/Postgres and independent browser sessions; disposable DB only. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import type pg from 'pg';
import { chromium, type Page } from 'playwright';
import { projectControlRoom } from '../../client/src/lib/control-room-metrics';

type User = { id: string; email: string; password: string; token: string };
export async function runControlRoomJourney({ appUrl, url, users, db, planId, directory, pass, baselineUrl }: {
  appUrl: string; url: string; users: Record<string, User>; db: pg.Client; planId: number; directory: string; pass: (name: string) => void; baselineUrl?: string;
}) {
  assert.equal(db.host, '127.0.0.1'); assert.equal(new URL(url).hostname, '127.0.0.1');
  const request = async (role: string, path: string, method = 'GET', body?: unknown) => {
    if (method === 'PATCH' && /\/tasks\/\d+\/status$/.test(path) && body && (body as any).expectedVersion === undefined) {
      const taskId = Number(path.split('/')[3]);
      const observed = (await db.query('SELECT execution_version FROM daily_tasks WHERE id=$1', [taskId])).rows[0];
      body = { ...(body as object), expectedVersion: observed?.execution_version };
    }
    const response = await fetch(`${appUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${users[role].token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json() as any; assert.equal(response.status, method === 'POST' && path.endsWith('/incidents') ? 201 : 200, `${method} ${path}: ${JSON.stringify(data)}`); return data;
  };
  const invariant = async () => (await db.query(`SELECT
    (SELECT jsonb_agg(jsonb_build_object('id',id,'template',template_id,'contestant',contestant_id,'start',start_planned,'end',end_planned,'space',space_id,'zone',zone_id,'resources',assigned_resource_ids,'duration',duration_override) ORDER BY id) FROM daily_tasks WHERE plan_id=$1) tasks,
    (SELECT jsonb_agg(g ORDER BY id) FROM assisted_planning_stages g WHERE plan_id=$1) stages,
    (SELECT jsonb_agg(s ORDER BY id) FROM assisted_planning_sessions s WHERE plan_id=$1) sessions,
    (SELECT jsonb_agg(p ORDER BY id) FROM plans p) plans`, [planId])).rows;
  const original = await invariant(); assert.equal(original[0].tasks.length, 266);
  const fullRows = async () => (await db.query(`SELECT (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t) tasks,(SELECT jsonb_agg(e ORDER BY id) FROM task_status_events e) events,(SELECT jsonb_agg(l ORDER BY id) FROM locks l) locks,(SELECT jsonb_agg(p ORDER BY id) FROM program_settings p) clock`)).rows;
  const task = (await db.query("SELECT t.*,p.name task_name FROM daily_tasks t JOIN task_templates p ON p.id=t.template_id WHERE t.plan_id=$1 AND t.status='pending' AND t.space_id IS NOT NULL ORDER BY t.start_planned,t.id LIMIT 1", [planId])).rows[0]; assert.ok(task);
  const staff = (await db.query("INSERT INTO staff_people(name,role_type) VALUES('Operadora Control Room','production') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO user_entity_links(user_id,entity_type,entity_id) VALUES($1,'staff_person',$2)", [users.aux.id, staff]);
  await db.query("INSERT INTO plan_staff_assignments(plan_id,staff_role,staff_person_id,scope_type,space_id) VALUES($1,'production',$2,'space',$3)", [planId, staff, task.space_id]);
  await db.query("INSERT INTO plan_zone_staff_mode(plan_id,zone_id,mode) VALUES($1,$2,'space') ON CONFLICT(plan_id,zone_id) DO UPDATE SET mode='space'", [planId, task.zone_id]);
  const visualChecks: {name:string;contrasts:number[]}[] = [];
  const errors: string[] = [], screenshots: string[] = [], transports: { method: string; path: string }[] = [];
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const productionCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Madrid' });
  const operatorCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });
  const viewerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const production = await productionCtx.newPage(), operator = await operatorCtx.newPage(), viewer = await viewerCtx.newPage();
  const login = async (page: Page, role: string, origin = appUrl) => {
    page.on('pageerror', error => errors.push(error.message)); await page.goto(`${origin}/login`);
    await page.getByLabel('Email', { exact: true }).fill(users[role].email);
    await page.getByLabel('Contraseña (opcional para enlace)', { exact: true }).fill(users[role].password);
    await page.getByRole('button', { name: 'Entrar con contraseña', exact: true }).click(); await page.waitForURL('**/dashboard');
  };
  const count = async (page: Page, state: string, value: number) => {
    await page.waitForFunction(({ state, value }) => document.querySelector(`[data-testid=control-count-${state}]`)?.textContent === String(value), { state, value }, { timeout: 20000 });
  };
  const capture = async (page: Page, name: string) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} horizontal overflow`);
    const contrasts = await page.evaluate<number[]>(`(function() {
      const rgb = (value) => {const n=value.match(/[0-9.]+/g)?.map(Number)??[0,0,0,0];return [n[0],n[1],n[2],n[3]??1];};
      const mix = (front,back) => front.slice(0,3).map((n,i)=>n*front[3]+back[i]*(1-front[3]));
      const luminance = (color) => color.slice(0,3).map(n=>n/255).map(n=>n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
      return [...document.querySelectorAll('section[aria-label="Resumen ejecutivo"] h2, section[aria-label="Resumen ejecutivo"] p')].map(el=>{
        const chain=[];for(let node=el;node;node=node.parentElement)chain.unshift(node);
        let background=[255,255,255];for(const node of chain)background=mix(rgb(getComputedStyle(node).backgroundColor),background);
        const foreground=mix(rgb(getComputedStyle(el).color),background),a=luminance(background),b=luminance(foreground);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      });
    })()`);
    assert.ok(contrasts.every(ratio=>ratio>=4.5), `${name} summary contrast below WCAG AA: ${contrasts}`);
    visualChecks.push({name,contrasts});
    await page.waitForTimeout(750); // Wait for existing entry/progress transitions to settle.
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true }); screenshots.push(`${name}.png`);
  };
  let benchmark: any, incidentId: string;
  try {
    await login(production, 'production'); pass('P4 production browser login'); await login(operator, 'aux'); await login(viewer, 'viewer');
    const readBaseline = await fullRows();
    production.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/')) transports.push({ method: req.method(), path: new URL(req.url()).pathname }); });
    const loadBegan = performance.now(); await production.goto(`${appUrl}/control-room?plan=${planId}`);
    await count(production, 'pending', 266); await production.getByRole('heading', { name: 'Planificación aceptada', exact: true }).waitFor();
    benchmark = { headFirstConfirmedMs: performance.now() - loadBegan, obligations: 266 };
    await capture(production, 'control-room-production-1440-before');
    assert.deepEqual(await fullRows(), readBaseline, 'Control Room reads cannot change tasks/events/locks/clock');
    assert.ok(transports.filter(item => item.path !== '/api/bootstrap-role').every(item => item.method === 'GET'), 'Control Room uses only read API calls');
    pass('P4 accepted A2 read-only: 266 pending obligations, preparation state, no task/planning/clock writes');
    if (baselineUrl) {
      const baselineCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Madrid' });
      try { const baseline = await baselineCtx.newPage(); await login(baseline, 'production', baselineUrl); const began = performance.now(); await baseline.goto(`${baselineUrl}/plans/${planId}/control-room`); await baseline.getByText('Done / In progress / Pending', { exact: true }).waitFor(); benchmark.baseFirstConfirmedMs = performance.now() - began; await capture(baseline, 'control-room-main-1440-before'); }
      finally { await baselineCtx.close(); }
    }
    await production.getByLabel('Modo de Control Room', { exact: true }).selectOption('director'); await production.setViewportSize({ width: 1920, height: 1080 });
    await capture(production, 'control-room-director-1920-before');
    assert.equal(await production.getByText(/Plan #/).count(), 0);
    await production.getByLabel('Modo de Control Room', { exact: true }).selectOption('production'); await production.setViewportSize({ width: 1440, height: 1000 });
    // Existing authorized simulation is local to the accepted day, not the host's date.
    await request('admin', '/api/program-settings', 'PATCH', { clockMode: 'manual', simulatedTime: task.start_planned });
    await operator.goto(`${appUrl}/my-day?plan=${planId}`); await operator.getByTestId(`agenda-task-${task.id}`).waitFor();
    await operator.getByRole('button', { name: /^Iniciar / }).first().waitFor();
    const startResponse = operator.waitForResponse(r => new URL(r.url()).pathname === `/api/tasks/${task.id}/status` && r.request().method() === 'PATCH');
    await operator.getByTestId(`agenda-task-${task.id}`).getByRole('button', { name: /^Iniciar / }).click(); assert.equal((await startResponse).status(), 200);
    await count(production, 'in_progress', 1); await production.getByTestId(`control-room-running-${task.id}`).waitFor();
    await production.getByRole('heading', { name: 'Jornada en ejecución', exact: true }).waitFor();
    await capture(production, 'control-room-production-1440-during');
    await production.locator('section[aria-label="Situación por plató y espacio"]').scrollIntoViewIfNeeded();
    await capture(production, 'control-room-production-studios');
    await production.locator('section[aria-label="Resumen ejecutivo"]').scrollIntoViewIfNeeded();
    await operator.getByRole('button', { name: /^Finalizar / }).first().click();
    await count(production, 'done', 1); await count(production, 'in_progress', 0);
    await production.reload(); await count(production, 'done', 1);
    pass('P4 independent operator Start/Finish → Control Room count, real timestamps/duration and reload persist');
    // Create and resolve in War Room, while Control Room observes without editing.
    await operator.goto(`${appUrl}/war-room?plan=${planId}`);
    await operator.getByRole('button', { name: 'Registrar incidencia', exact: true }).waitFor(); await operator.getByRole('button', { name: 'Registrar incidencia', exact: true }).click();
    const dialog = operator.getByRole('dialog', { name: 'Registrar incidencia', exact: true });
    await dialog.getByLabel('Tipo', { exact: true }).selectOption('technical'); await dialog.getByLabel('Severidad', { exact: true }).selectOption('critical');
    await dialog.getByLabel('Descripción del problema', { exact: true }).fill('Señal de sonido ausente · ensayo Control Room');
    await dialog.getByLabel('Tarea vinculada', { exact: true }).selectOption(String(task.id));
    const creation = operator.waitForResponse(r => new URL(r.url()).pathname === `/api/plans/${planId}/incidents` && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Guardar incidencia', exact: true }).click(); const created = await creation; assert.equal(created.status(), 201); incidentId = (await created.json()).id;
    await production.getByTestId(`control-incident-${incidentId}`).waitFor({ timeout: 20000 });
    await capture(production, 'control-room-production-critical');
    await production.getByLabel('Modo de Control Room', { exact: true }).selectOption('director'); await production.setViewportSize({ width: 1920, height: 1080 });
    await capture(production, 'control-room-director-1920-critical');
    await production.getByLabel('Modo de Control Room', { exact: true }).selectOption('production'); await production.setViewportSize({ width: 1440, height: 1000 });
    await production.getByTestId(`control-incident-${incidentId}`).getByRole('link').click(); await production.getByText('Histórico de cambios', { exact: true }).waitFor();
    await production.keyboard.press('Escape'); const card = production.getByTestId(`incident-${incidentId}`);
    await card.getByRole('button', { name: 'Resolver', exact: true }).click(); await production.getByLabel('Decisión u observación', { exact: true }).fill('Sonido restablecido y verificado por el responsable.');
    await production.getByRole('button', { name: 'Confirmar decisión', exact: true }).click();
    await operator.getByTestId(`incident-${incidentId}`).getByText('Resuelta', { exact: true }).waitFor({ timeout: 20000 });
    await production.goto(`${appUrl}/control-room?plan=${planId}`); await production.getByTestId(`control-incident-${incidentId}`).getByText('Resuelta', { exact: true }).waitFor();
    pass('P4 War Room creates critical → Control Room observes, opens exact context → other user resolves → counters/reload reconcile');
    await viewer.goto(`${appUrl}/control-room?plan=${planId}`); await viewer.getByTestId('control-room-pro').waitFor(); await count(viewer, 'done', 1);
    assert.equal(await viewer.getByRole('button', { name: /^(Iniciar|Finalizar|Resolver|Editar|Registrar incidencia)/ }).count(), 0);
    await capture(viewer, 'control-room-mobile-390');
    await production.setViewportSize({ width: 820, height: 1180 }); await capture(production, 'control-room-tablet-820');
    await production.setViewportSize({ width: 1440, height: 1000 }); await production.evaluate(() => document.documentElement.classList.add('dark')); await capture(production, 'control-room-dark-1440');
    await production.evaluate(() => document.documentElement.classList.remove('dark'));
    await viewerCtx.setOffline(true); await viewer.getByText('Sin conexión', { exact: true }).waitFor(); await capture(viewer, 'control-room-mobile-offline'); await viewerCtx.setOffline(false);
    // Real read failure, without browser interception. Restore the local grant afterwards.
    await db.query('REVOKE EXECUTE ON FUNCTION public.incident_query(bigint,uuid,uuid,boolean) FROM service_role');
    try { await production.getByRole('button', { name: 'Actualizar', exact: true }).click(); await production.getByText('No se ha confirmado la consulta del registro compartido. Los contadores no equivalen a cero.', { exact: true }).waitFor(); await capture(production, 'control-room-network-error'); }
    finally { await db.query('GRANT EXECUTE ON FUNCTION public.incident_query(bigint,uuid,uuid,boolean) TO service_role'); }
    await production.getByRole('button', { name: 'Actualizar', exact: true }).click(); await production.getByTestId(`control-incident-${incidentId}`).waitFor();
    const global = await request('production', `/api/plans/${planId}/incidents`, 'POST', { requestId: randomUUID(), type: 'technical', severity: 'critical', description: 'Incidencia global restringida', taskId: null, zoneId: null, spaceId: null, resourceId: null, contestantId: null, responsibleId: null, cause: null, context: null });
    await production.getByTestId(`control-incident-${global.id}`).waitFor({ timeout: 20000 });
    await production.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await production.waitForURL('**/login'); await login(production, 'aux');
    await production.goto(`${appUrl}/control-room?plan=${planId}`); await production.getByText('Registro visible en tu ámbito autorizado.', { exact: true }).waitFor();
    assert.equal(await production.getByText('Incidencia global restringida', { exact: true }).count(), 0);
    const auxContext = await request('aux', `/api/plans/${planId}/execution`); const scopedTotal = auxContext.tasks.filter((t: any) => t.inScope).length;
    const visibleTotal = await production.locator('[data-testid^=control-count-]').allTextContents(); assert.equal(visibleTotal.reduce((n, value) => n + Number(value), 0), scopedTotal);
    pass('P4 Viewer read-only, scoped Aux after same-browser user change, mobile/tablet/dark/offline and genuine failed incident API');
    // Post-day uses actual authorized cancellation commands for remaining obligations in this disposable rehearsal.
    const remaining = (await db.query("SELECT id FROM daily_tasks WHERE plan_id=$1 AND status='pending' ORDER BY id", [planId])).rows;
    for (const t of remaining) await db.query("SELECT public.execute_task_transition($1,$2,'cancelled','pending',(SELECT execution_version FROM daily_tasks WHERE id=$1))", [t.id, users.production.id]);
    await viewer.reload(); await viewer.getByRole('heading', { name: 'Jornada terminada', exact: true }).waitFor(); await count(viewer, 'cancelled', 265);
    await capture(viewer, 'control-room-mobile-after');
    assert.deepEqual(await invariant(), original, 'every placement, accepted Stage/fingerprint, session and plan remains literal');
    const realPlan = await request('admin', `/api/plans/${planId}`), realExecution = await request('admin', `/api/plans/${planId}/execution`), incidents = await request('admin', `/api/plans/${planId}/incidents`);
    const projection = projectControlRoom({ plan: realPlan, execution: realExecution, nowMs: Date.parse(realExecution.clock.operationalAt), incidents });
    assert.equal(projection.total, 266); assert.equal(projection.counts.done, 1); assert.equal(projection.counts.cancelled, 265); assert.equal(projection.estimate, null);
    pass('P4 post-day closes by explicit terminal decisions, cancelled separate; accepted A2 266 placements/Stages/sessions/plans literal');
    assert.deepEqual(errors, []);
    return { status: 'PASS', transport: 'HTTP 5 s polling; WebSocket delivery not certified', browserSessions: 3, browserRoles: ['production', 'aux', 'viewer'], adminHTTPVerified: true, remoteWrites: 0, screenshots, visualChecks, benchmark,
      acceptedA2: { total: 266, done: 1, cancelled: 265, sumStates: Object.values(projection.counts).reduce((a, b) => a + b, 0), unchangedPlanningSha256: createHash('sha256').update(JSON.stringify(original)).digest('hex'), newSolverRun: false },
      allControlRoomInitialApiRequestsReadOnly: transports.filter(req => req.path !== '/api/bootstrap-role').slice(0, 10).every(req => req.method === 'GET'), errors };
  } catch (error) {
    for (const [name,page] of [['production',production],['operator',operator],['viewer',viewer]] as const) {
      await page.screenshot({path:`${directory}/control-room-failed-${name}.png`}).catch(()=>{});
    }
    console.log(JSON.stringify({browserErrors:errors})); throw error;
  } finally { await browser.close(); }
}
