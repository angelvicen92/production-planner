/** Presentation regression with intercepted HTTP. Native Start/Finish is covered
 * separately by the unchanged P1A disposable integration runner.
 * P2A_BASELINE_ROOT optionally compares the same fixtures with main 0c26905d.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = process.cwd(), output = path.resolve(process.env.P2A_OUTPUT || 'work/p2a-browser');
mkdirSync(output, { recursive: true });
const source = readFileSync('server/fixtures/assistedA2S10.json');
const fixture = JSON.parse(source);
const date = '2026-10-18', now = `${date}T08:07:00Z`;
const actorId = '00000000-0000-4000-8000-000000000002';
// Explicit presentation scenarios, derived from the 266 identities, not a solver run.
const initial = fixture.snapshot.tasks.map((task, i) => ({ ...task, id: task.taskId, planId: 1, manualTitle: `Actividad ${i + 1}`, status: 'pending', executionClockMode: 'auto', executionClockRevision: null, pausedTotalSeconds: 0 }));
const tasks = initial.map(t => ({ ...t }));
Object.assign(tasks[0], { status: 'in_progress', startPlanned: '10:00', endPlanned: '10:10', startReal: '10:00', startRealAt: `${date}T08:00:00Z` });
Object.assign(tasks[1], { status: 'in_progress', startPlanned: '10:00', endPlanned: '10:20', startReal: '10:07', startRealAt: `${date}T08:07:00Z` });
Object.assign(tasks[2], { status: 'in_progress', startPlanned: '10:00', endPlanned: '10:05', startReal: '10:03', startRealAt: `${date}T08:03:00Z` });
Object.assign(tasks[3], { status: 'in_progress', startPlanned: null, endPlanned: null, startReal: '10:00', startRealAt: `${date}T08:00:00Z` });
Object.assign(tasks[4], { status: 'done', startPlanned: '10:00', endPlanned: '10:10', startReal: '10:00', endReal: '10:07', startRealAt: `${date}T08:00:00Z`, endRealAt: `${date}T08:07:00Z` });
const zones = [...new Set(tasks.map(t => t.zoneId).filter(Boolean))].map(id => ({ id, name: `Plató ${id}` }));
const spaces = [...new Map(tasks.filter(t => t.spaceId).map(t => [t.spaceId, { id: t.spaceId, zoneId: t.zoneId, name: `Espacio ${t.spaceId}` }])).values()];
const checks = [], screenshots = [], errors = [], writes = [], servers = [];
const pass = message => { checks.push(message); console.log(`PASS ${message}`); };
const hash = data => createHash('sha256').update(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)).digest('hex');
const planning = () => tasks.map(({ status, startReal, endReal, startRealAt, endRealAt, executionClockMode, executionClockRevision, pausedTotalSeconds, ...accepted }) => accepted);
const originalPlanning = planning();
async function serve(repo, port) {
  const server = await createServer({ configFile: false, root: path.join(repo, 'client'), cacheDir: path.join(root, 'work', `vite-p2a-${port}`), plugins: [react()],
    resolve: { alias: { '@': path.join(repo, 'client/src'), '@shared': path.join(repo, 'shared'), '@assets': path.join(repo, 'attached_assets') } },
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:54321'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('local-ui-fixture') },
    server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: ['/workspace'] } } });
  await server.listen(); servers.push(server); return `http://127.0.0.1:${port}`;
}
const browser = await chromium.launch({ executablePath: process.env.P2A_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
async function open(origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });
  await context.addInitScript(actorId => {
    const token = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: actorId, exp: Math.floor(Date.now() / 1000) + 3600 })) + '.fixture';
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: actorId, email: 'ui@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} } }));
  }, actorId);
  const state = { now, anchor: null, planDate: date, mode: 'auto', revision: null, planningReady: true, draftPending: false, viewer: false };
  const operationalTime = async () => {
    const current = await page.evaluate(() => Date.now());
    state.anchor ??= current;
    return new Date(Date.parse(state.now) + Math.max(0, current - state.anchor)).toISOString();
  };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    if (p.startsWith('/api/')) {
      let body = [], status = 200;
      const role = state.viewer ? 'viewer' : 'production';
      if (request.method() === 'PATCH') {
        const task = tasks.find(t => p === `/api/tasks/${t.id}/status`), action = request.postDataJSON();
        assert.ok(task); assert.equal(task.status, action.expectedStatus);
        assert.deepEqual(Object.keys(action).sort(), ['expectedStatus', 'status']);
        writes.push({ path: p, body: action });
        Object.assign(task, { status: action.status }, action.status === 'in_progress' ? { startReal: '10:07', startRealAt: await operationalTime() } : { endReal: '10:07', endRealAt: await operationalTime() });
        body = task;
      } else if (p === '/api/me/role' || p === '/api/bootstrap-role') body = { role };
      else if (p === '/api/me/preferences') body = { favoritePlanId: 1 };
      else if (p === '/api/plans') body = [{ id: 1, date: state.planDate }];
      else if (p === '/api/plans/1') body = { id: 1, date: state.planDate, workStart: '09:00', workEnd: '21:00', dailyTasks: tasks };
      else if (p === '/api/plans/1/tasks') body = tasks;
      else if (p === '/api/plans/1/execution') body = { role, planningReady: state.planningReady, planningState: state.planningReady ? 'accepted' : 'pending', draftPending: state.draftPending, hasScope: !state.viewer, clock: { operationalAt: await operationalTime(), serverAt: '2026-10-18T13:00:00Z', mode: state.mode, revision: state.revision }, tasks: tasks.map(t => ({ taskId: t.id, inScope: true, hasAuthority: !state.viewer, canExecute: !state.viewer, resources: ['Cámara confirmada'] })) };
      else if (p === '/api/plans/1/space-availability') body = spaces.map(s => ({ spaceId: s.id, zoneId: s.zoneId }));
      else if (p === '/api/zones') body = zones;
      else if (p === '/api/spaces') body = spaces;
      else if (p.endsWith('/planning-runs/latest')) body = null;
      else if (p.endsWith('/me/links')) body = {};
      else if (request.method() !== 'GET') assert.equal(p, '/api/bootstrap-role', `Unexpected write ${p}`);
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return url.origin === origin ? route.continue() : route.fulfill({ status: 200, json: {} });
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(120000); // Cold Vite compiles the existing full app.
  await page.clock.install({ time: new Date(now) });
  await page.goto(`${origin}/my-day?plan=1`);
  try { await page.getByTestId('day-group-running').waitFor(); }
  catch (error) { console.log({ url: page.url(), body: (await page.locator('body').innerText()).slice(0, 1500), errors }); throw error; }
  return { page, context, state };
}
const hero = (page, i) => page.getByTestId(`execution-task-${tasks[i].id}`);
const signal = (page, i) => hero(page, i).getByTestId('temporal-signal');
const kind = async (page, i, value) => { await page.waitForFunction(({ id, value }) => document.querySelector(`[data-testid="execution-task-${id}"] [data-testid="temporal-signal"]`)?.getAttribute('data-temporal-state') === value, { id: tasks[i].id, value }); };
async function capture(page, name, target) {
  if (target) await target.scrollIntoViewIfNeeded();
  await page.clock.runFor(400);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no overflow`);
  await page.screenshot({ path: path.join(output, `${name}.png`) }); screenshots.push(`${name}.png`);
}
async function reload(page, state) { state.anchor = null; await page.reload(); await page.getByTestId('day-group-running').waitFor(); }
try {
  if (process.env.P2A_BASELINE_ROOT) {
    const base = await open(await serve(path.resolve(process.env.P2A_BASELINE_ROOT), 5187));
    assert.equal(await base.page.getByTestId('temporal-signal').count(), 0);
    await capture(base.page, 'before-mobile', hero(base.page, 0)); await base.context.close();
    pass('main 0c26905d combined P1A+P1B: same fixtures without temporal signals');
  }
  const { page, context, state } = await open(await serve(root, 5186));
  await kind(page, 0, 'normal'); await kind(page, 1, 'normal'); await kind(page, 2, 'overrun'); await kind(page, 3, 'neutral');
  assert.equal(await page.locator('article[data-testid^="agenda-task-"]').count(), 266);
  assert.match(await signal(page, 3).innerText(), /Horario previsto incompleto/);
  await capture(page, 'normal-mobile', hero(page, 0));
  await page.clock.runFor(61000); await kind(page, 0, 'ending');
  assert.match(await signal(page, 0).innerText(), /01:\d{2}/);
  const agendaSignal = page.getByTestId(`agenda-task-${tasks[0].id}`).getByTestId('temporal-signal');
  assert.equal(await agendaSignal.getAttribute('data-temporal-state'), 'ending');
  assert.equal(await agendaSignal.innerText(), await signal(page, 0).innerText());
  await capture(page, 'ending-mobile', hero(page, 0));
  pass('10 minute activity crosses final 20% live without refresh, same text in hero and agenda; 266 identities retained');
  await page.setViewportSize({ width: 820, height: 1180 });
  await capture(page, 'simultaneous-tablet', hero(page, 1));
  await capture(page, 'overrun-tablet', hero(page, 2));
  pass('Four simultaneous activities retain independent green/orange/red/neutral signals; late start does not shift finish');
  const completed = page.getByTestId(`agenda-task-${tasks[4].id}`).getByTestId('temporal-signal');
  assert.equal(await completed.getAttribute('data-temporal-state'), 'completed');
  assert.match(await completed.innerText(), /Fin: 03:00 antes/);
  assert.doesNotMatch(await completed.innerText(), /Exceso|Se acerca/);
  await capture(page, 'completed-tablet', completed);
  pass('Early finish shows recorded deviations and never a running alarm');
  await context.setOffline(true); await page.clock.runFor(1100);
  await kind(page, 0, 'neutral'); assert.match(await signal(page, 0).innerText(), /Sin conexión/);
  assert.equal(await hero(page, 0).getByRole('button', { name: /^Finalizar / }).count(), 0);
  await capture(page, 'offline-tablet', hero(page, 0));
  await context.setOffline(false); await kind(page, 0, 'ending');
  pass('Offline preserves records, pauses comparison and execution controls; reconnect restores comparison');
  state.planningReady = false; await reload(page, state); await kind(page, 0, 'neutral');
  state.planningReady = true; state.draftPending = true; await reload(page, state); await kind(page, 0, 'neutral');
  state.draftPending = false; state.planDate = '2026-10-17'; await reload(page, state); await kind(page, 0, 'neutral');
  state.planDate = date; state.mode = 'manual'; state.revision = '2026-10-18T12:00:00Z'; await reload(page, state); await kind(page, 0, 'neutral');
  for (const task of tasks) { task.executionClockMode = 'manual'; task.executionClockRevision = state.revision; }
  state.now = `${date}T08:10:01Z`; await reload(page, state); await kind(page, 0, 'overrun');
  await page.getByText('Reloj simulado autorizado', { exact: true }).waitFor();
  assert.match(await signal(page, 0).innerText(), /00:\d{2}/);
  await capture(page, 'simulated-tablet', hero(page, 0));
  pass('Pending planning, pending Draft, wrong date and changed revision stay neutral; authorized simulation uses operational time');
  state.viewer = true; await reload(page, state); await kind(page, 0, 'overrun');
  assert.equal(await page.getByRole('button', { name: /^(Iniciar|Finalizar) / }).count(), 0);
  pass('Viewer can read informative signals without gaining execution authority');
  state.viewer = false; state.mode = 'auto'; state.revision = null; state.now = now;
  for (const task of tasks) { task.executionClockMode = 'auto'; task.executionClockRevision = null; }
  await reload(page, state);
  const pending = tasks[5], card = () => page.getByTestId(`agenda-task-${pending.id}`);
  assert.equal(await card().getByTestId('temporal-signal').count(), 0);
  await card().getByRole('button', { name: /^Iniciar / }).click(); await hero(page, 5).waitFor();
  await hero(page, 5).getByRole('button', { name: /^Finalizar / }).click();
  await page.getByTestId('day-group-done').getByTestId(`agenda-task-${pending.id}`).waitFor();
  assert.deepEqual(writes.map(w => w.body), [{ status: 'in_progress', expectedStatus: 'pending' }, { status: 'done', expectedStatus: 'in_progress' }]);
  await reload(page, state); assert.equal(await card().getByTestId('temporal-signal').getAttribute('data-temporal-state'), 'completed');
  pass('Start/Finish keep exactly the existing two conditional writes and server-confirmed groups across reload');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await capture(page, 'dark-tablet', hero(page, 2));
  assert.deepEqual(planning(), originalPlanning); assert.deepEqual(errors, []);
  pass('No planning mutation, no extra operational writes and no JavaScript errors; mobile/tablet/dark have no overflow');
  await context.close();
} finally {
  await browser.close(); await Promise.all(servers.map(server => server.close()));
  writeFileSync(path.join(output, 'browser.json'), JSON.stringify({ mode: 'INTERCEPTED_HTTP_PRESENTATION', base: '0c26905d82f7b7a4cb483c33f7a3f968ca3b8a82', fixtureSha256: hash(source), scenarioPlanningSha256: hash(originalPlanning), acceptedTaskCount: 266, checks, screenshots, screenshotHashes: Object.fromEntries(screenshots.map(name => [name, hash(readFileSync(path.join(output, name)))])), writes, errors, viewports: [[390, 844], [820, 1180]], browserTimezone: 'America/New_York', remoteWrites: 0, nativeAuthRls: false }, null, 2) + '\n');
}
