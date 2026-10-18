/** Focal UI/error scenarios with intercepted HTTP. The existing native runner
 * separately certifies real Auth/HTTP/PostgreSQL and two-browser concurrency. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = process.cwd(), output = path.resolve(process.env.P3_OUTPUT || 'work/p3-browser');
mkdirSync(output, { recursive: true });
const fixture = JSON.parse(readFileSync('server/fixtures/assistedA2S10.json'));
const actor = '00000000-0000-4000-8000-000000000002';
const tasks = fixture.snapshot.tasks.map((t, i) => ({ ...t, id: t.taskId, planId: 1, name: `Actividad ${i + 1}`, status: 'pending', executionVersion: 0 }));
Object.assign(tasks[0], { status: 'in_progress', executionVersion: 1, startPlanned: '10:00', endPlanned: '10:10', startReal: '10:00', startRealAt: '2026-10-18T08:00:19.123Z', executionClockMode: 'auto', executionClockRevision: null });
Object.assign(tasks[1], { status: 'done', executionVersion: 2, startReal: '10:00', endReal: '10:07', startRealAt: '2026-10-18T08:00:19Z', endRealAt: '2026-10-18T08:07:29Z', executionClockMode: 'auto', executionClockRevision: null });
Object.assign(tasks[2], { status: 'done', executionVersion: 2, startReal: '10:00', endReal: '10:07' }); // legacy incomplete
const state = { date: '2026-10-18', role: 'aux', authority: true, fault: 0, historyFault: false };
const checks = [], writes = [], errors = [], screenshots = [], historyRequests = [];
const events = [{ id: 1, task_id: tasks[0].id, event_kind: 'transition', status: 'in_progress', created_at: '2026-10-18T08:00:19Z' }];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
const zones = [...new Set(tasks.map(t => t.zoneId).filter(Boolean))].map(id => ({ id, name: `Plató ${id}` }));
const spaces = [...new Map(tasks.filter(t => t.spaceId).map(t => [t.spaceId, { id: t.spaceId, zoneId: t.zoneId, name: `Espacio ${t.spaceId}` }])).values()];
const server = await createServer({ configFile: false, root: path.join(root, 'client'), cacheDir: path.join(root, 'work/vite-p3'), plugins: [react()],
  resolve: { alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared'), '@assets': path.join(root, 'attached_assets') } },
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:54321'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('local-ui-fixture') },
  server: { host: '127.0.0.1', port: 5188, strictPort: true, fs: { allow: ['/workspace', root] } } });
await server.listen();
const origin = 'http://127.0.0.1:5188';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });
await context.addInitScript(actor => {
  const token = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: actor, exp: Math.floor(Date.now() / 1000) + 3600 })) + '.fixture';
  localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: actor, email: 'ui@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} } }));
}, actor);
await context.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url()), p = url.pathname;
  if (!p.startsWith('/api/')) return url.origin === origin ? route.continue() : route.fulfill({ status: 200, json: {} });
  let body = [], status = 200;
  const task = tasks.find(t => p.startsWith(`/api/tasks/${t.id}/`));
  if (p.endsWith('/real-time') && req.method() === 'PATCH') {
    const data = req.postDataJSON(); writes.push({ body: data, taskId: task.id });
    // Let a rapid second submit reach the handler if the UI failed to guard it.
    await new Promise(r => setTimeout(r, 100));
    status = state.fault || (data.expectedVersion !== task.executionVersion ? 409 : 200);
    if (status === 409) { task.executionVersion++; body = { message: 'La actividad cambió en otra sesión.' }; }
    else if (status !== 200) body = { message: 'Ensayo de error del servidor' };
    else {
      const key = data.field === 'start' ? 'startRealAt' : 'endRealAt', previous = task[key];
      task[key] = data.realAt; task[data.field === 'start' ? 'startReal' : 'endReal'] = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(data.realAt)); task.executionVersion++;
      events.push({ id: events.length + 1, task_id: task.id, event_kind: 'time_correction', corrected_field: data.field, old_value: previous, new_value: data.realAt, reason: data.reason, changed_by: actor, created_at: '2026-10-18T14:00:09Z' }); body = task;
    }
  } else if (p.endsWith('/execution-history')) { historyRequests.push(p); status = state.historyFault ? 503 : 200; body = state.historyFault ? { message: 'Unavailable' } : { executionVersion: task.executionVersion, events: events.filter(e => e.task_id === task.id) }; }
  else if (p === '/api/me/role' || p === '/api/bootstrap-role') body = { role: state.role };
  else if (p === '/api/me/preferences') body = { favoritePlanId: 1 };
  else if (p === '/api/plans') body = [{ id: 1, date: state.date }];
  else if (p === '/api/plans/1') body = { id: 1, date: state.date, workStart: '00:00', workEnd: '23:59', dailyTasks: tasks };
  else if (p === '/api/plans/1/tasks') body = tasks;
  else if (p === '/api/plans/1/execution') body = { role: state.role, planningReady: true, planningState: 'accepted', hasScope: true, clock: { operationalAt: '2026-10-18T08:10:00Z', serverAt: '2026-10-18T14:00:00Z', mode: 'auto', revision: null }, tasks: tasks.map(t => ({ taskId: t.id, inScope: true, hasAuthority: state.authority, canExecute: state.authority && t.status !== 'done', resources: [] })) };
  else if (p === '/api/plans/1/space-availability') body = spaces.map(s => ({ spaceId: s.id, zoneId: s.zoneId }));
  else if (p === '/api/zones') body = zones;
  else if (p === '/api/spaces') body = spaces;
  else if (p.endsWith('/planning-runs/latest')) body = null;
  else if (p.endsWith('/me/links')) body = {};
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
});
const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('crash', () => errors.push('Renderer crashed')); page.setDefaultTimeout(45000); page.setDefaultNavigationTimeout(120000);
const card = i => page.getByTestId(`agenda-task-${tasks[i].id}`), dialog = () => page.getByRole('dialog');
const open = async (i = 0, hero = false) => { await (hero ? page.getByTestId(`execution-task-${tasks[i].id}`) : card(i)).getByRole('button', { name: 'Corregir hora', exact: true }).click(); await dialog().waitFor(); };
const close = async () => { await dialog().getByRole('button', { name: 'Cancelar', exact: true }).click(); await dialog().waitFor({ state: 'hidden' }); };
const input = () => dialog().getByLabel('Nueva hora real (con segundos)');
const reason = () => dialog().getByLabel('Motivo obligatorio');
const confirm = () => dialog().getByRole('button', { name: 'Confirmar rectificación', exact: true });
const reload = async () => { await page.reload(); await page.getByTestId('day-group-running').waitFor(); };
const capture = async name => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: path.join(output, name) }); screenshots.push(name); };
try {
  await page.goto(`${origin}/my-day?plan=1`); await page.getByTestId('day-group-running').waitFor();
  assert.equal(await page.locator('article[data-testid^="agenda-task-"]').count(), 266);
  assert.equal(await card(2).getByRole('button', { name: 'Corregir hora' }).count(), 0);
  assert.equal(historyRequests.length, 0); await open(0, true);
  assert.match(await dialog().getByTestId('correction-current').textContent(), /10:00:19/); assert.equal(await input().inputValue(), '10:00:19');
  assert.equal(await dialog().locator('option[value="end"]').count(), 0); assert.equal(await confirm().isDisabled(), true);
  await input().fill('09:59:07'); assert.equal(await confirm().isDisabled(), true); await reason().fill(' '); assert.equal(await confirm().isDisabled(), true);
  await reason().fill('Registro tardío'); await input().fill('10:00:19'); assert.equal(await confirm().isDisabled(), true);
  await input().fill('09:59:07'); await capture('form-mobile.png');
  const snapshotVersion = tasks[0].executionVersion;
  // A background task poll updates the row, but must not update this open form.
  tasks[0].executionVersion++; await page.waitForResponse(response => response.url().endsWith('/api/plans/1/tasks'));
  await confirm().dblclick(); await dialog().getByRole('alert').waitFor(); assert.equal(writes.length, 1); assert.equal(writes[0].body.expectedVersion, snapshotVersion);
  assert.equal(writes[0].body.realAt, '2026-10-18T07:59:07.000Z'); assert.equal(await confirm().isDisabled(), true);
  await dialog().getByRole('button', { name: 'Usar datos actuales' }).click();
  await input().fill('09:58:09'); await reason().fill('Revisión tras conflicto'); await confirm().click(); await dialog().waitFor({ state: 'hidden' });
  assert.equal(writes.length, 2); assert.equal(writes[1].body.expectedVersion, tasks[0].executionVersion - 1);
  pass('Hero/agenda share form; seconds and Madrid independent of New York; required reason, no-op, double-submit, observed snapshot, 409 and explicit recovery');
  await open(1); assert.equal(await dialog().locator('option[value="end"]').count(), 1); await dialog().getByLabel('Hora que quieres corregir').selectOption('end');
  assert.equal(await input().inputValue(), '10:07:29'); await input().fill('10:07:09'); await reason().fill('Fin tardío'); await confirm().click(); await dialog().waitFor({ state: 'hidden' });
  await open(); await input().fill('09:58:00'); await reason().fill('Rectificación sucesiva'); await confirm().click(); await dialog().waitFor({ state: 'hidden' });
  await open(); await dialog().getByRole('button', { name: 'Ver historial' }).click(); await page.getByTestId('time-correction-event-4').waitFor();
  assert.equal(await page.locator('[data-testid^="time-correction-event-"]').count(), 2); assert.match(await dialog().innerText(), /Cuenta registrada: 00000000/); assert.match(await dialog().innerText(), /Corrección registrada el/);
  await page.setViewportSize({ width: 820, height: 1180 }); await page.getByTestId('time-correction-event-4').scrollIntoViewIfNeeded(); await capture('history-tablet.png'); await close();
  await open(); await dialog().getByRole('button', { name: 'Ver historial' }).click(); await page.getByTestId('time-correction-event-4').waitFor(); assert.equal(historyRequests.length, 2); await close();
  state.historyFault = true; await open(); await dialog().getByRole('button', { name: 'Ver historial' }).click(); await dialog().getByRole('alert').waitFor(); await close(); state.historyFault = false;
  pass('Completed end editable with canExecute=false; lazy history reopens with full corrections, original transitions excluded; history failure stays explicit');
  for (const fault of [400, 403, 503, 409]) {
    state.fault = fault; await open(); await input().fill('09:57:00'); await reason().fill('Ensayo de error'); await confirm().click(); await dialog().getByRole('alert').waitFor();
    assert.equal(await page.getByText('Hora rectificada', { exact: true }).count(), 0); await close();
  }
  state.fault = 0; const count = writes.length; await open(); await input().fill('09:56:00'); await reason().fill('Sin conexión'); await context.setOffline(true);
  await dialog().getByText('Sin conexión. Espera para guardar la rectificación.', { exact: true }).waitFor(); assert.equal(await confirm().isDisabled(), true); assert.equal(writes.length, count); await capture('offline-tablet.png'); await close(); await context.setOffline(false);
  pass('400/403/503/409 show no success; offline blocks writes without optimistic marks');
  for (const [day, time, message] of [['2026-03-29', '02:30:00', /no existe/], ['2026-10-25', '02:30:00', /dos veces/], ['', '10:00:00', /fecha completa/]]) {
    state.date = day; await reload(); await open(); await input().fill(time); await reason().fill('DST'); assert.equal(await confirm().isDisabled(), true); assert.match(await dialog().innerText(), message); await close();
  }
  state.date = '2026-10-18'; state.authority = false; await reload(); assert.equal(await page.getByRole('button', { name: 'Corregir hora', exact: true }).count(), 0);
  state.role = 'viewer'; state.authority = true; await reload(); assert.equal(await page.getByRole('button', { name: 'Corregir hora', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  pass('Madrid DST gap/fold and missing day block saving; editorial/no authority and Viewer have no correction controls; 266 tasks retained');
} catch (error) {
  console.error({ url: page.url(), body: (await page.locator('body').innerText()).slice(0, 2000), errors });
  await page.screenshot({ path: path.join(output, 'failure.png') });
  throw error;
} finally {
  await browser.close(); await server.close();
  writeFileSync(path.join(output, 'browser.json'), JSON.stringify({ mode: 'INTERCEPTED_HTTP_UI', checks, writes, historyRequests, screenshots, errors, screenshotHashes: Object.fromEntries(screenshots.map(name => [name, createHash('sha256').update(readFileSync(path.join(output, name))).digest('hex')])), browserTimezone: 'America/New_York', acceptedTaskCount: 266, remoteWrites: 0, nativeAuthRls: false }, null, 2) + '\n');
}
