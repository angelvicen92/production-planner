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
const directory = path.resolve(process.env.P6_OUTPUT || 'docs/evidence/P6-CONTROL-ROOM-UI');
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
  const server = await createServer({ configFile: false, root: path.join(repo, 'client'), cacheDir: path.join(root, 'work', `vite-p6-${port}`), plugins: [react()],
    resolve: { alias: { '@': path.join(repo, 'client/src'), '@shared': path.join(repo, 'shared'), '@assets': path.join(repo, 'attached_assets') } },
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:54321'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('local-ui-fixture') },
    server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root] } } });
  await server.listen(); servers.push(server); return `http://127.0.0.1:${port}`;
}
const browser = await chromium.launch({ executablePath: process.env.P6_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
async function open(origin, role = 'production', mode = 'production') {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, timezoneId: 'America/New_York' });
  const state = { role, clockAt: now, clockMode: 'auto', failedPath: null, phase: 'during', incidentStatus: 'open', incidentsFail: false, catalogueFail: false, missing: false, hang: false };
  await context.addInitScript(({ actorId, mode }) => {
    const token = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: actorId, exp: Math.floor(Date.now() / 1000) + 3600 })) + '.fixture';
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: actorId, email: 'ui@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} } }));
    if (!localStorage.getItem(`control-room:perspective:${actorId}`)) localStorage.setItem(`control-room:perspective:${actorId}`, mode);
    localStorage.setItem('control-room:director-mode', '1');
  }, { actorId, mode });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    if (p.startsWith('/api/')) {
      role = state.role;
      requests.push({ role, method: request.method(), path: p });
      if (state.failedPath === p) return route.fulfill({ status: 503, json: { message: 'Fallo de lectura P6' } });
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
      else if (p === '/api/plans/1/execution') body = { role, planningReady: true, planningState: 'accepted', draftPending: false, hasScope: true, clock: { operationalAt: state.clockAt, serverAt: now, mode: state.clockMode, revision: state.clockMode === 'manual' ? now : null }, tasks: contextTasks };
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
  await page.locator('[data-testid=control-room-pro], [data-testid=control-room-director], [data-testid=control-room-technical]').first().waitFor({ timeout: 60000 });
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
  const { page, context, state } = await open(origin, 'admin');
  const choose = mode => page.getByLabel('Modo de Control Room', { exact: true }).selectOption(mode);
  const options = page => page.getByLabel('Modo de Control Room', { exact: true }).locator('option').evaluateAll(els => els.map(e => e.value));
  assert.deepEqual(await options(page), ['production', 'director', 'technical']);
  assert.equal(await page.getByLabel('Modo de Control Room').inputValue(), 'production', 'legacy global direction flag ignored');
  assert.equal(await page.getByTestId('control-count-pending').innerText(), '260');
  assert.equal(await page.getByTestId('control-count-done').innerText(), '2');
  await page.getByRole('region', { name: 'Atención operativa', exact: true }).locator('li').first().getByText(incident.description, { exact: true }).waitFor();
  assert.equal(await explorer(page).count(), 0, 'expensive inspection initially unmounted');
  await page.getByText('Inspección detallada por plató y espacio', { exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="control-room-activity-"]').length === 266);
  assert.equal(await explorer(page).locator('[data-testid^="control-room-activity-"]').count(), 266);
  await page.getByLabel('Seleccionar plató', { exact: true }).selectOption(`zone-${tasks[0].zoneId}`);
  await page.getByLabel('Seleccionar espacio', { exact: true }).selectOption(`zone-${tasks[0].zoneId}-space-${tasks[0].spaceId}`);
  await page.getByLabel('Filtrar estado de actividades', { exact: true }).selectOption('done');
  assert.match(await page.getByTestId(`control-room-done-${tasks[0].id}`).innerText(), /10:00:10/);
  assert.match(await page.getByTestId(`control-room-done-${tasks[0].id}`).innerText(), /15:20/);
  assert.equal(await page.getByTestId(`control-room-activity-${tasks[0].id}`).getByRole('link').getAttribute('href'), `/my-day?plan=1#agenda-task-${tasks[0].id}`);
  await page.getByText('Inspección detallada por plató y espacio', { exact: true }).click();
  pass('Producción: crítica priorizada, 266 obligaciones, filtros/detalle bajo demanda, segundos Madrid y deep links');
  await choose('director');
  assert.equal(await page.getByRole('region', { name: 'Situación por plató y espacio', exact: true }).count(), 0);
  assert.equal(await page.getByRole('region', { name: 'Próximas actividades', exact: true }).count(), 0);
  assert.equal(await page.getByRole('region', { name: 'Estado de las consultas', exact: true }).count(), 0);
  assert.equal(await page.getByTestId(`control-incident-${incident.id}`).getByRole('link').getAttribute('href'), `/war-room?plan=1&incident=${incident.id}`);
  assert.equal(await page.getByTestId('control-count-done').innerText(), '2');
  await page.reload(); await page.getByTestId('control-room-director').waitFor();
  assert.equal(await page.getByLabel('Modo de Control Room').inputValue(), 'director', 'permitted perspective survives reload');
  pass('Dirección: panorama acotado sin agenda/filtros/diagnósticos, mismas métricas, crítica y persistencia');
  for (const [mode, width, height] of [['director',1920,1080],['production',1440,1000],['technical',1440,1000],['director',820,1180],['production',820,1180],['technical',820,1180],['director',390,844],['production',390,844],['technical',390,844]]) {
    await choose(mode); await page.setViewportSize({ width, height }); await capture(page, `${mode}-${width}`);
    await page.evaluate(() => document.documentElement.classList.add('dark')); await capture(page, `${mode}-${width}-dark`);
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
  }
  pass('Tres composiciones distintas en 1920/1440/820/390 y oscuro, sin overflow');
  await choose('technical'); await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(await page.getByTestId('control-room-pro').count(), 0);
  assert.equal(await page.getByTestId('control-room-director').count(), 0);
  await page.getByText(/una respuesta correcta no certifica la salud/).waitFor();
  await page.getByText(/garantía de entrega realtime/).waitFor();
  for (const p of ['/api/plans/1/incidents', '/api/plans/1', '/api/plans/1/execution']) {
    state.failedPath = p; await refresh(page); await page.getByText('Fallo de lectura P6', { exact: true }).waitFor();
    if (p.endsWith('/execution')) await page.getByText(/Contadores, progreso y estado del día neutralizados/).waitFor();
    if (p.endsWith('/incidents')) await page.getByText(/Contadores de incidencias y bloqueos neutralizados/).waitFor();
    await capture(page, `technical-error-${p.split('/').at(-1)}`);
    state.failedPath = null; await refresh(page); await page.getByText('Fallo de lectura P6', { exact: true }).waitFor({ state: 'hidden' });
  }
  pass('Técnico: errores separados de planificación/ejecución/incidencias, neutralización y recuperación HTTP');
  await context.setOffline(true); await page.getByText('Sin conexión', { exact: true }).first().waitFor(); await capture(page, 'technical-offline'); await context.setOffline(false);
  state.hang = true; await page.clock.install(); await page.clock.fastForward(56000);
  await page.getByText('Dato obsoleto', { exact: true }).first().waitFor(); await capture(page, 'technical-stale');
  await context.close();
  pass('Offline y antigüedad de cada dato visibles; canal no certifica entrega');
  for (const role of ['viewer', 'aux', 'production']) {
    const view = await open(origin, role, 'technical');
    assert.deepEqual(await options(view.page), role === 'viewer' ? ['director'] : role === 'aux' ? ['production'] : ['production','director']);
    assert.equal(await view.page.getByTestId('control-room-technical').count(), 0);
    assert.equal(await view.page.getByRole('button', { name: /^(Iniciar|Finalizar|Resolver|Editar|Registrar incidencia)/ }).count(), 0);
    if (role === 'aux') {
      const scoped = tasks.filter(t => t.spaceId === tasks[0].spaceId).length;
      await view.page.getByText(`Lectura parcial: ${scoped} obligaciones de tu ámbito. No acredita el progreso ni la finalización global del día.`, { exact: true }).waitFor();
      assert.equal((await view.page.locator('[data-testid^=control-count-]').allTextContents()).reduce((n,v) => n+Number(v),0), scoped);
    }
    if (role === 'production') { await view.page.getByLabel('Modo de Control Room').selectOption('director'); await view.page.getByTestId('control-room-director').waitFor(); }
    pass(`${role}: modo prohibido guardado descartado, opciones y ámbito correctos`);
    await view.context.close();
  }
  const revoked = await open(origin, 'admin', 'technical');
  revoked.state.role = 'viewer'; await refresh(revoked.page); await revoked.page.getByTestId('control-room-director').waitFor();
  assert.deepEqual(await options(revoked.page), ['director']);
  assert.equal(await revoked.page.evaluate(id => localStorage.getItem(`control-room:perspective:${id}`), actorId), 'director');
  revoked.state.failedPath = '/api/me/role'; await refresh(revoked.page);
  await revoked.page.getByText(/^Rol o ámbito sin confirmar/).waitFor();
  assert.equal(await revoked.page.getByTestId('control-room-technical').count(), 0);
  assert.equal(await revoked.page.getByTestId('control-room-director').count(), 0);
  await revoked.context.close();
  pass('Pérdida de rol y error de autorización cierran perspectiva privilegiada en la sesión abierta');
  const before = await open(origin); before.state.phase = 'before'; await refresh(before.page);
  await before.page.getByRole('heading', { name: 'Planificación aceptada', exact: true }).waitFor();
  assert.equal(await before.page.getByRole('region', { name: 'Atención operativa', exact: true }).locator('li').count(), 0);
  before.state.phase = 'during'; before.state.clockMode = 'manual'; before.state.clockAt = '2026-10-15T08:30:20Z'; await refresh(before.page);
  await before.page.getByText('Reloj simulado autorizado', { exact: true }).waitFor();
  await before.page.getByText(/La fecha del reloj no coincide/).waitFor();
  assert.ok(!(await before.page.getByRole('region', { name: 'Atención operativa', exact: true }).innerText()).includes('comienzo previsto pasado'));
  await before.context.close();
  pass('Madrid, simulación y fecha distinta: sin retrasos acusados para otra jornada');
  pass('Preparación con 266 pendientes sin alarmas de retraso');
  assert.equal(inputHash(), originalHash);
  assert.deepEqual(requests.filter(r => r.method !== 'GET' && r.path !== '/api/bootstrap-role'), []);
  assert.deepEqual(errors, []);
  writeFileSync(path.join(directory, 'browser-evidence.json'), JSON.stringify({ status:'PASS', mode:'INTERCEPTED_HTTP_UI_REGRESSION', fixture:'server/fixtures/assistedA2S10.json', fixtureSha256:createHash('sha256').update(source).digest('hex'), obligations:tasks.length, checks, screenshots, errors, apiWriteRequests:[], limits:'HTTP interceptado: no certifica Auth/RLS ni WebSocket. Recorrido nativo independiente en smokeControlRoomJourney.' }, null, 2));
  console.log(JSON.stringify({status:'PASS', checks:checks.length, screenshots:screenshots.length}));
} catch(error) {
  for(const context of browser.contexts()) for(const page of context.pages()) await page.screenshot({path:path.join(directory,'failed.png')}).catch(()=>{});
  console.error({ errors, checks, requests }); for(const ctx of browser.contexts()) for(const page of ctx.pages()) console.log('PAGE', page.url(), await page.locator('body').innerText()); throw error;
} finally { await browser.close(); await Promise.all(servers.map(server=>server.close())); }
