/** UI regression with intercepted HTTP fixtures. No database, remote Auth or solver.
 * Run from repo root: node --import tsx client/src/components/control-room/p1b.browser.mjs
 * Optional P1B_BASELINE_ROOT points to a clean checkout of 17dc265c with dependencies.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = process.cwd();
const directory = path.resolve(process.env.P1B_OUTPUT || 'work/p1b-browser');
mkdirSync(directory, { recursive: true });
const source = readFileSync('server/fixtures/assistedA2S10.json');
const fixture = JSON.parse(source);
const date = '2026-10-14';
const now = '2026-10-14T08:30:20Z';
const tasks = fixture.snapshot.tasks.map((task, i) => ({ ...task, id: task.taskId, planId: 1, manualTitle: `Actividad ${i + 1}`, status: 'pending', executionClockMode: 'auto', pausedTotalSeconds: 0 }));
Object.assign(tasks[0], { status: 'done', startRealAt: '2026-10-14T08:00:10Z', endRealAt: '2026-10-14T08:17:35Z', pausedTotalSeconds: 125 });
Object.assign(tasks[1], { status: 'done', startRealAt: '2026-10-14T08:18:00Z', endRealAt: '2026-10-14T08:25:00Z' });
for (const task of tasks.slice(2, 4)) Object.assign(task, { status: 'in_progress', startRealAt: '2026-10-14T08:10:00Z' });
Object.assign(tasks[4], { status: 'interrupted', startRealAt: '2026-10-14T08:00:00Z', pausedAt: '2026-10-14T08:05:00Z' });
tasks[5].status = 'cancelled';
const zoneIds = [...new Set(tasks.map(t => t.zoneId).filter(Boolean))];
const zones = zoneIds.map((id, i) => ({ id, name: `Plató ${i + 1}` }));
const spaces = [...new Map(tasks.filter(t => t.spaceId).map(t => [t.spaceId, { id: t.spaceId, zoneId: t.zoneId, name: `Espacio ${t.spaceId}` }])).values()];
zones.push({ id: 900000, name: 'Plató sin actividad' });
spaces.push({ id: 900001, zoneId: 900000, name: 'Espacio sin actividad' });
const plan = { id: 1, date, workStart: '09:00', workEnd: '21:00', dailyTasks: tasks };
const actorId = '00000000-0000-4000-8000-000000000002';
const incident = { id: '00000000-0000-4000-8000-000000000001', planId: 1, version: 1, status: 'open', type: 'space_blocked', severity: 'critical', description: 'Señal interrumpida · confirmada',
  taskId: tasks[2].id, zoneId: tasks[2].zoneId, spaceId: tasks[2].spaceId, contestantId: null, resourceId: null, responsibleId: null, cause: null, context: null,
  authorId: actorId, authorName: 'Producción', createdAt: now, updatedAt: now, resolvedAt: null, resolutionNote: null, canManage: false,
  taskName: tasks[2].manualTitle, zoneName: zones.find(z => z.id === tasks[2].zoneId).name, spaceName: spaces.find(s => s.id === tasks[2].spaceId).name, contestantName: null, resourceName: null, responsibleName: null };
const inputHash = () => createHash('sha256').update(JSON.stringify({ plan, zones, spaces, incident })).digest('hex');
const originalHash = inputHash();
const checks = [], screenshots = [], requests = [], errors = [];
const pass = name => { checks.push(name); console.log(`PASS: ${name}`); };
const servers = [];
async function serve(repo, port) {
  const server = await createServer({ configFile: false, root: path.join(repo, 'client'), cacheDir: path.join(root, 'work', `vite-p1b-${port}`), plugins: [react()],
    resolve: { alias: { '@': path.join(repo, 'client/src'), '@shared': path.join(repo, 'shared'), '@assets': path.join(repo, 'attached_assets') } },
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:54321'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('local-ui-fixture') },
    server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root] } } });
  await server.listen(); servers.push(server); return `http://127.0.0.1:${port}`;
}
const browser = await chromium.launch({ executablePath: process.env.P1B_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
async function open(origin, role = 'production', director = true) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, timezoneId: 'America/New_York' });
  const state = { phase: 'during', incidentStatus: 'open', incidentsFail: false, catalogueFail: false, missing: false, hang: false };
  await context.addInitScript(({ actorId, director }) => {
    const token = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: actorId, exp: Math.floor(Date.now() / 1000) + 3600 })) + '.fixture';
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: actorId, email: 'ui@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} } }));
    localStorage.setItem('control-room:director-mode', director ? '1' : '0');
  }, { actorId, director });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    if (p.startsWith('/api/')) {
      requests.push({ role, method: request.method(), path: p });
      if (state.hang && ['/api/plans/1', '/api/plans/1/execution', '/api/plans/1/incidents'].includes(p)) return; // retained pending request
      if (state.incidentsFail && p === '/api/plans/1/incidents' || state.catalogueFail && p === '/api/spaces') return route.fulfill({ status: 503, json: { message: 'Fallo de consulta de ensayo' } });
      const currentTasks = tasks.map(t => state.phase === 'before' ? { ...t, status: 'pending', startRealAt: null, endRealAt: null, pausedAt: null }
        : state.phase === 'after' ? { ...t, status: t.status === 'done' ? 'done' : 'cancelled' } : state.missing && t.id === tasks[0].id ? { ...t, startRealAt: null, endRealAt: null } : t);
      const contextTasks = currentTasks.map(t => ({ taskId: t.id, inScope: role !== 'aux' || t.spaceId === tasks[0].spaceId, hasAuthority: role === 'production', canExecute: role === 'production', resources: ['Cámara confirmada'] }));
      let body = [];
      if (p === '/api/me/role' || p === '/api/bootstrap-role') body = { role };
      else if (p === '/api/me/preferences') body = { favoritePlanId: 1 };
      else if (p === '/api/plans') body = [{ id: 1, date }];
      else if (p === '/api/plans/1') body = { ...plan, dailyTasks: currentTasks };
      else if (p === '/api/plans/1/execution') body = { role, planningReady: true, planningState: 'accepted', draftPending: false, hasScope: true, clock: { operationalAt: now, serverAt: now, mode: 'auto', revision: null }, tasks: contextTasks };
      else if (p === '/api/plans/1/incidents') body = state.phase === 'before' ? [] : [{ ...incident, status: state.incidentStatus, resolvedAt: state.incidentStatus === 'resolved' ? now : null }];
      else if (p === '/api/zones') body = zones;
      else if (p === '/api/spaces') body = spaces;
      else if (p === '/api/control-room-settings') body = { delayThresholdMin: 10, nextSoonThresholdMin: 10, enableDelayAlert: true };
      else if (p.endsWith('/planning-runs/latest')) body = null;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (url.origin === origin) return route.continue();
    return route.fulfill({ status: 200, json: {} });
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${origin}/control-room?plan=1`);
  await page.getByTestId('control-room-pro').waitFor();
  return { context, page, state };
}
const explorer = page => page.getByRole('region', { name: 'Situación por plató y espacio', exact: true });
async function capture(page, name, target) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
  if (target) await target.evaluate(element => element.scrollIntoView({ block: 'start' })); else await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(400); // Let the existing Layout entry transition finish.
  await page.screenshot({ path: path.join(directory, `${name}.png`) }); screenshots.push(`${name}.png`);
}
async function refresh(page) { await page.getByRole('button', { name: 'Actualizar', exact: true }).click(); }
try {
  const origin = await serve(root, 5178);
  if (process.env.P1B_BASELINE_ROOT) {
    const baseOrigin = await serve(path.resolve(process.env.P1B_BASELINE_ROOT), 5179);
    const { page, context } = await open(baseOrigin);
    await capture(page, 'before-director-1920');
    await capture(page, 'before-temporal-1920', explorer(page).getByRole('heading', { level: 2 }));
    assert.equal(await explorer(page).getByRole('combobox').count(), 0);
    pass('Base 17dc265c: Dirección sin filtros, sólo última completada y siguiente actividad');
    await context.close();
  }
  const { page, context, state } = await open(origin);
  await page.getByTestId('control-count-in_progress').filter({ hasText: '2' }).waitFor();
  assert.equal(await explorer(page).getByRole('combobox').count(), 4);
  assert.equal(await explorer(page).locator('[data-testid^="control-room-activity-"]').count(), 266);
  assert.equal(await explorer(page).locator('[data-testid^="control-room-running-"]').count(), 2);
  pass('266 actividades accesibles exactamente una vez; dos simultáneas; filtros en Dirección');
  await capture(page, 'after-director-1920');
  await capture(page, 'after-temporal-1920', explorer(page).getByRole('heading', { level: 2 }));
  const selectedZone = `zone-${tasks[0].zoneId}`, selectedSpace = `${selectedZone}-space-${tasks[0].spaceId}`;
  await page.getByLabel('Seleccionar plató', { exact: true }).selectOption(selectedZone);
  await page.getByLabel('Seleccionar espacio', { exact: true }).selectOption(selectedSpace);
  await page.getByLabel('Filtrar estado de actividades', { exact: true }).selectOption('done');
  const expected = tasks.filter(t => t.zoneId === tasks[0].zoneId && t.spaceId === tasks[0].spaceId && t.status === 'done');
  assert.equal(await explorer(page).locator('[data-testid^="control-room-activity-"]').count(), expected.length);
  await page.getByTestId(`control-room-done-${tasks[0].id}`).waitFor();
  assert.match(await page.getByTestId(`control-room-done-${tasks[0].id}`).innerText(), /10:00:10/);
  assert.match(await page.getByTestId(`control-room-done-${tasks[0].id}`).innerText(), /15:20/);
  assert.equal(await page.getByTestId('control-count-done').innerText(), '2');
  pass('Intersección plató/espacio/completadas; segundos Madrid desde navegador New York; resumen global intacto');
  await capture(page, 'completed-director-1920', explorer(page).getByRole('heading', { level: 2 }));
  await page.setViewportSize({ width: 820, height: 1180 });
  await capture(page, 'completed-director-820', explorer(page).getByRole('heading', { level: 2 }));
  await page.getByLabel('Modo de Control Room', { exact: true }).selectOption('production');
  await page.getByLabel('Seleccionar plató', { exact: true }).selectOption(selectedZone);
  await page.getByLabel('Seleccionar espacio', { exact: true }).selectOption(selectedSpace);
  await page.getByLabel('Filtrar estado de actividades', { exact: true }).selectOption('done');
  await capture(page, 'completed-production-820', explorer(page).getByRole('heading', { level: 2 }));
  assert.match(await explorer(page).innerText(), /Inicio Δ/);
  const href = await page.getByTestId(`control-room-activity-${tasks[0].id}`).getByRole('link').getAttribute('href');
  assert.equal(href, `/my-day?plan=1#agenda-task-${tasks[0].id}`);
  pass('Tablet 820 y Producción: detalle adicional, enlaces de tarea, sin overflow');
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.getByLabel('Seleccionar plató', { exact: true }).selectOption(selectedZone);
  await page.getByLabel('Seleccionar espacio', { exact: true }).selectOption(selectedSpace);
  const pendingInSpace = tasks.filter(t => t.spaceId === tasks[0].spaceId && (t.status === 'pending' || t.status === 'interrupted'));
  await explorer(page).getByText(`Ver las ${pendingInSpace.length - 1} restantes`, { exact: true }).click();
  await page.getByTestId(`control-room-activity-${pendingInSpace.at(-1).id}`).waitFor({ state: 'visible' });
  await explorer(page).getByText('Completadas · tiempos reales (1)', { exact: true }).click();
  await page.getByTestId(`control-room-done-${tasks[0].id}`).waitFor({ state: 'visible' });
  pass('Desplegables permiten abrir el historial y todas las actividades posteriores del espacio');
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.getByLabel('Filtrar estado de actividades', { exact: true }).selectOption('pending');
  assert.equal(await explorer(page).locator('[data-testid^="control-room-activity-"]').count(), 260);
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.getByLabel('Seleccionar plató', { exact: true }).selectOption('zone-900000');
  assert.match(await explorer(page).innerText(), /Sin actividades en las obligaciones recibidas/);
  await capture(page, 'empty-space-820', explorer(page).getByRole('heading', { level: 2 }));
  await page.getByLabel('Filtrar estado de actividades', { exact: true }).selectOption('done');
  assert.match(await explorer(page).innerText(), /No hay actividades o espacios para esta selección/);
  pass('Todas las pendientes, espacio sin actividad y combinación sin resultados explícitos');
  await page.getByLabel('Seleccionar plató', { exact: true }).selectOption(selectedZone);
  assert.equal(await page.getByLabel('Seleccionar espacio', { exact: true }).inputValue(), 'all');
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  state.incidentStatus = 'resolved'; await refresh(page);
  await page.getByTestId(`control-incident-${incident.id}`).getByText('Resuelta', { exact: true }).waitFor();
  assert.ok(!(await explorer(page).innerText()).includes('Bloqueo registrado'));
  assert.equal(await page.getByTestId(`control-incident-${incident.id}`).getByRole('link').getAttribute('href'), `/war-room?plan=1&incident=${incident.id}`);
  pass('Resolución compartida elimina bloqueo; deep link de War Room conservado');
  state.missing = true; await refresh(page);
  await page.getByLabel('Filtrar estado de actividades', { exact: true }).selectOption('done');
  await page.waitForFunction(id => document.querySelector(`[data-testid="control-room-done-${id}"]`)?.textContent.includes('No calculable'), tasks[0].id);
  await capture(page, 'incomplete-data-820', explorer(page).getByRole('heading', { level: 2 }));
  pass('Completada con timestamps incompletos permanece visible, sin duración/desviación inventada');
  state.catalogueFail = true; await refresh(page); await page.getByText(/No se pudo confirmar:.*catálogo de espacios/).waitFor();
  state.catalogueFail = false; await refresh(page); await page.getByText(/No se pudo confirmar:/).waitFor({ state: 'hidden' });
  pass('Actualizar recupera también catálogo fallido y restablece nombres de espacios');
  await context.setOffline(true); await page.getByText('Sin conexión', { exact: true }).waitFor(); await capture(page, 'offline-820'); await context.setOffline(false);
  state.incidentsFail = true; await refresh(page); await page.getByText('No se ha confirmado la consulta del registro compartido. Los contadores no equivalen a cero.', { exact: true }).waitFor();
  await capture(page, 'query-error-820'); state.incidentsFail = false; await refresh(page);
  await page.getByText('No se ha confirmado la consulta del registro compartido. Los contadores no equivalen a cero.', { exact: true }).waitFor({ state: 'hidden' });
  pass('Offline y fallo de consulta explícitos, sin cero ficticio en incidencias');
  state.hang = true;
  await page.clock.install(); await page.clock.fastForward(26000);
  await page.getByText('Datos posiblemente obsoletos', { exact: true }).waitFor();
  await capture(page, 'stale-query-820'); state.hang = false; await context.close();
  pass('Consulta sin confirmar durante más del intervalo + 20 s señala datos obsoletos');
  for (const role of ['viewer', 'production', 'aux']) {
    const view = await open(origin, role);
    const total = role === 'aux' ? tasks.filter(t => t.spaceId === tasks[0].spaceId).length : 266;
    assert.equal(await explorer(view.page).locator('[data-testid^="control-room-activity-"]').count(), total);
    assert.equal(await view.page.getByRole('button', { name: /^(Iniciar|Finalizar|Resolver|Crear incidencia)/ }).count(), 0);
    await view.context.close();
  }
  pass('UI Viewer/Producción globales y Aux limitado; no controles de escritura operativa');
  for (const phase of ['before', 'after']) {
    const view = await open(origin); view.state.phase = phase; await refresh(view.page);
    await view.page.getByRole('heading', { name: phase === 'before' ? 'Planificación aceptada' : 'Jornada terminada', exact: true }).waitFor();
    await capture(view.page, `${phase}-day-1920`); await view.context.close();
  }
  pass('Preparación y post-día se mantienen con pendientes y cancelaciones separadas');
  assert.equal(inputHash(), originalHash);
  assert.deepEqual(requests.filter(r => r.method !== 'GET' && r.path !== '/api/bootstrap-role'), []);
  assert.deepEqual(errors, []);
  pass('Fixtures literales; cero peticiones de escritura a planning, ejecución o incidencias; cero errores JS');
  writeFileSync(path.join(directory, 'browser-evidence.json'), JSON.stringify({ mode: 'INTERCEPTED_HTTP_UI_REGRESSION', base: '17dc265c51bb2c7c1e93a28f8d8a05db67e9d7db', fixture: 'server/fixtures/assistedA2S10.json', fixtureSha256: createHash('sha256').update(source).digest('hex'), fixtureFingerprint: fixture.fingerprint, inputHash: originalHash, obligations: tasks.length, checks, screenshots, apiWriteRequests: requests.filter(r => r.method !== 'GET' && r.path !== '/api/bootstrap-role'), errors, limits: 'UI con respuestas HTTP interceptadas; permisos reales cubiertos por las pruebas G0 existentes. No certifica Auth/RLS remoto ni ejecución nativa nueva.' }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks: checks.length, screenshots, directory }));
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: path.join(directory, 'failed.png') }).catch(() => {});
  console.error({ errors, checks }); throw error;
} finally {
  await browser.close(); await Promise.all(servers.map(server => server.close()));
}
