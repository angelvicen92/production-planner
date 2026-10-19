/** P4 presentation scenarios over 266 fixture identities. HTTP is intercepted;
 * native execution/preservation remains certified by the existing isolated runner. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = process.cwd(), output = path.resolve(process.env.P4_OUTPUT || 'work/p4-browser');
mkdirSync(output, { recursive: true });
const tasks = JSON.parse(readFileSync('server/fixtures/assistedA2S10.json')).snapshot.tasks.map((t, i) => ({ ...t, id: t.taskId, planId: 1, name: `Actividad ${i + 1}`, template: null, contestant: { name: `Persona ${i + 1}` }, status: 'pending', startPlanned: '12:00', endPlanned: '12:15', executionVersion: 0 }));
for (let i = 0; i < 3; i++) Object.assign(tasks[i], { startPlanned: '09:00', endPlanned: '09:15', spaceId: 10 + i, zoneId: i === 2 ? 21 : 20 });
Object.assign(tasks[3], { startPlanned: '10:00', endPlanned: '10:15' });
for (const i of [4, 5]) Object.assign(tasks[i], { status: 'in_progress', startPlanned: '08:50', endPlanned: '09:20', startReal: '08:50', startRealAt: '2026-10-30T07:50:00Z', executionClockMode: 'auto', executionClockRevision: null, executionVersion: 1 });
Object.assign(tasks[6], { status: 'done' }); Object.assign(tasks[7], { status: 'interrupted' }); Object.assign(tasks[8], { status: 'cancelled' }); tasks[9].startPlanned = null;
const state = { role: 'production', scope: [], now: '2026-10-30T07:59:00Z', fault: 0, readFault: false, mode: 'auto' };
const actor = '00000000-0000-4000-8000-000000000002', checks = [], writes = [], errors = [], screenshots = [];
const zones = [...new Set(tasks.map(t => t.zoneId).filter(Boolean))].map(id => ({ id, name: `Plató ${id}` }));
const spaces = [...new Map(tasks.filter(t => t.spaceId).map(t => [t.spaceId, { id: t.spaceId, zoneId: t.zoneId, name: `Espacio ${t.spaceId}` }])).values()];
const server = await createServer({ configFile: false, root: path.join(root, 'client'), cacheDir: path.join(root, 'work/vite-p4'), plugins: [react()],
  resolve: { alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared'), '@assets': path.join(root, 'attached_assets') } },
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:54321'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('local-ui-fixture') },
  server: { host: '127.0.0.1', port: 5189, strictPort: true, fs: { allow: ['/workspace', root] } } });
await server.listen();
const origin = 'http://127.0.0.1:5189';
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
  const planId = Number(/^\/api\/plans\/(\d+)/.exec(p)?.[1]);
  const task = tasks.find(t => p === `/api/tasks/${t.id}/status`);
  if (task && req.method() === 'PATCH') {
    const data = req.postDataJSON(); writes.push({ taskId: task.id, ...data });
    await new Promise(r => setTimeout(r, 150));
    status = state.fault || (data.expectedVersion !== task.executionVersion ? 409 : 200);
    if (status !== 200) body = { message: `Ensayo ${status}: acción sin confirmar` };
    else { task.status = data.status; task.executionVersion++; Object.assign(task, data.status === 'in_progress' ? { startRealAt: state.now, startReal: '09:01', executionClockMode: state.mode, executionClockRevision: null } : { endRealAt: state.now, endReal: '09:01' }); body = task; }
  } else if (p === '/api/me/role' || p === '/api/bootstrap-role') body = { role: state.role };
  else if (p === '/api/me/preferences') body = { favoritePlanId: 1 };
  else if (p === '/api/plans') body = [{ id: 1, date: '2026-10-30' }, { id: 2, date: '2026-10-31' }];
  else if (/^\/api\/plans\/\d+$/.test(p)) body = { id: planId, date: planId === 1 ? '2026-10-30' : '2026-10-31', dailyTasks: tasks };
  else if (p.endsWith('/tasks')) { status = state.readFault ? 503 : 200; body = state.readFault ? { message: 'Lectura no disponible' } : tasks; }
  else if (p.endsWith('/execution')) body = { role: state.role, planningReady: true, planningState: 'accepted', draftPending: false, hasScope: state.scope.length > 0,
    clock: { operationalAt: state.now, serverAt: '2026-10-30T18:00:00Z', mode: state.mode, revision: null },
    tasks: tasks.map(t => { const authority = ['production', 'admin'].includes(state.role) || (state.role === 'aux' && state.scope.includes(t.id)); return { taskId: t.id, inScope: state.scope.includes(t.id), hasAuthority: authority, canExecute: authority && ['pending', 'in_progress'].includes(t.status), resources: [] }; }) };
  else if (p.endsWith('/space-availability')) body = spaces.map(s => ({ spaceId: s.id, zoneId: s.zoneId }));
  else if (p === '/api/zones') body = zones;
  else if (p === '/api/spaces') body = spaces;
  else if (p.endsWith('/planning-runs/latest')) body = null;
  else if (p.endsWith('/me/links')) body = {};
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
});
const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(120000);
const panel = () => page.getByTestId('operational-panel'), card = (i, matrix = true) => page.getByTestId(`${matrix ? 'execution' : 'agenda'}-task-${tasks[i].id}`);
const ids = async locator => locator.locator('article').evaluateAll(els => els.map(el => Number(el.dataset.testid.split('-').at(-1))));
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
const filter = name => page.getByRole('navigation', { name: 'Estados de la jornada' }).getByRole('button', { name });
const reload = async () => { await page.goto(`${origin}/my-day?plan=1`); await filter(/^Todas/).waitFor(); };
const select = async (label, name) => { await page.getByRole('combobox', { name: label, exact: true }).click(); await page.getByRole('option', { name, exact: true }).click(); };
const capture = async name => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: path.join(output, name), fullPage: false }); screenshots.push(name); };
try {
  await reload();
  assert.equal(await filter(/^Todas/).getAttribute('aria-pressed'), 'true');
  assert.equal((await ids(page.getByTestId('operational-upcoming'))).length, 3);
  assert.equal(await page.getByTestId('operational-late').count(), 0);
  assert.equal(await panel().getByRole('heading', { name: 'En curso (2)', exact: true }).count(), 1);
  assert.equal(await page.locator('article[data-testid^="agenda-task-"]').count(), 266);
  await capture('upcoming-mobile.png');
  state.now = '2026-10-30T08:01:00Z'; await page.reload(); await page.getByTestId('operational-late').waitFor();
  assert.deepEqual((await ids(page.getByTestId('operational-late'))).sort((a,b)=>a-b), tasks.slice(0,3).map(t=>t.id).sort((a,b)=>a-b));
  assert.deepEqual(await ids(page.getByTestId('operational-upcoming')), [tasks[3].id]);
  assert.equal(await card(0).getByText(/Retraso:/).count(), 1);
  await capture('late-mobile.png');
  await page.getByTestId('operational-late').screenshot({path:path.join(output,'late-mobile-matrix.png')}); screenshots.push('late-mobile-matrix.png');
  await page.setViewportSize({ width: 820, height: 1180 }); await capture('matrix-tablet.png');
  await page.getByTestId('operational-late').scrollIntoViewIfNeeded(); await capture('late-tablet.png');
  pass('Three simultaneous next/late cards, two running and independent future slot coexist; 266 agenda identities; mobile/tablet no overflow');
  for (const [name, count, heading] of [[/^En curso/,2,'En curso'],[/^Pendientes/,261,'Pendientes'],[/^Completadas/,1,'Completadas'],[/^Interrumpidas/,2,'Interrumpidas']]) {
    await filter(name).click();
    assert.equal(await filter(name).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('article[data-testid^="agenda-task-"]').count(), count);
    assert.equal(await filter(/^Todas/).textContent(), 'Todas (266)');
    if (heading === 'Completadas' || heading === 'Interrumpidas') assert.equal(await panel().locator('article').count(), 0);
  }
  await filter(/^Pendientes/).click(); await page.getByLabel('Buscar actividad', { exact: true }).fill('Persona 1');
  const matched = tasks.filter(t => `${t.name} ${t.contestant.name}`.includes('Persona 1'));
  assert.equal(await page.locator('article[data-testid^="agenda-task-"]').count(), matched.filter(t=>t.status==='pending').length);
  await page.getByLabel('Buscar actividad', { exact: true }).fill('sin coincidencia');
  await page.getByText('Sin actividades para los filtros seleccionados.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ver todas las actividades del ámbito' }).click();
  assert.equal(await filter(/^Todas/).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByLabel('Buscar actividad', { exact: true }).inputValue(), '');
  pass('All four true state filters, stable pre-state counters, combined search and explicit empty/reset state');
  assert.equal(await page.getByRole('switch').count(), 0);
  await select('Concentrar vista','Plató / zona · Plató 20');
  assert.deepEqual((await ids(page.getByTestId('day-group-pending'))).sort((a,b)=>a-b), tasks.filter(t=>t.zoneId===20 && t.status==='pending').map(t=>t.id).sort((a,b)=>a-b));
  await select('Concentrar vista','Espacio · Espacio 10 · Plató 20');
  assert.ok((await ids(page.getByTestId('day-group-pending'))).every(id=>tasks.find(t=>t.id===id).spaceId===10));
  await filter(/^Pendientes/).click(); await page.getByLabel('Buscar actividad', { exact: true }).fill('Persona 1');
  await select('Seleccionar jornada', 'sábado, 31 de octubre de 2026');
  assert.equal(await filter(/^Todas/).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByLabel('Buscar actividad', { exact: true }).inputValue(), '');
  assert.match(await page.getByRole('combobox', { name: 'Concentrar vista', exact: true }).textContent(), /Toda la jornada/);
  assert.equal(await page.getByTestId('operational-late').count(), 0);
  pass('Global production location selector uses day tasks/snapshot; day switch resets filters and prevents wrong-date delay');
  state.role = 'aux'; state.scope = [tasks[0].id, tasks[2].id]; await reload();
  assert.equal(await page.getByRole('switch').getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('article[data-testid^="agenda-task-"]').count(), 2);
  await select('Concentrar vista','Plató / zona · Plató 20');
  assert.equal(await page.locator('article[data-testid^="agenda-task-"]').count(), 1);
  await page.getByRole('switch').click();
  assert.equal(await page.locator('article[data-testid^="agenda-task-"]').count(), tasks.filter(t=>t.zoneId===20).length);
  assert.equal(await card(1,false).getByRole('button', { name: /^Iniciar / }).count(), 0);
  state.scope = [tasks[1].id]; await page.reload(); await filter(/^Todas/).waitFor();
  assert.equal(await page.locator('article[data-testid^="agenda-task-"]').count(), 1);
  for (const role of ['viewer','aux']) {
    state.scope = []; state.role = role; await reload();
    assert.equal(await page.getByRole('button', { name: /^(Iniciar|Finalizar) / }).count(), 0);
    assert.equal(await page.getByRole('switch').count(), 0);
    assert.equal(await page.getByRole('combobox', { name: 'Concentrar vista', exact: true }).count(), 0);
  }
  state.role = 'admin'; await reload(); assert.equal(await page.getByRole('combobox', { name: 'Concentrar vista', exact: true }).count(), 1);
  pass('Distinct nominal aux scopes stay narrow; consultation toggle does not grant writes; viewer/unassigned read-only; admin global focus');
  state.role = 'production'; await reload();
  let observed = tasks[0].executionVersion;
  await card(0).getByRole('button', { name: /^Iniciar / }).dblclick();
  await card(0).getByRole('button', { name: /^Finalizar / }).waitFor();
  assert.equal(writes.length,1); assert.equal(writes[0].expectedVersion,observed); assert.equal(writes[0].expectedStatus,'pending');
  await card(0).getByRole('button', { name: /^Finalizar / }).click(); await card(0,false).getByText('Completada',{exact:true}).waitFor();
  assert.equal(writes.length,2);
  observed = tasks[1].executionVersion;
  await card(1,false).getByRole('button', { name: /^Iniciar / }).click(); await card(1,false).getByRole('button', { name: /^Finalizar / }).waitFor();
  assert.equal(writes.at(-1).expectedVersion,observed);
  await card(1,false).getByRole('button', { name: /^Finalizar / }).click(); await card(1,false).getByText('Completada',{exact:true}).waitFor();
  await card(4).getByRole('button', { name: 'Corregir hora', exact:true }).click(); await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('button', { name:'Cancelar',exact:true }).click();
  pass('Start/Finish from matrix and agenda use observed version/status, prevent double send and reconcile; correction remains accessible');
  for (const fault of [400,403,409,503]) {
    state.fault = fault; const before = writes.length; await card(2).getByRole('button', { name: /^Iniciar / }).click();
    await page.getByRole('alert').filter({hasText:fault === 403 ? 'No tienes permisos para esta acción.' : `Ensayo ${fault}`}).first().waitFor();
    assert.equal(writes.length,before+1); assert.equal(tasks[2].status,'pending');
    await card(2).getByRole('button', { name: /^Iniciar / }).waitFor({state:'visible'});
  }
  state.fault = 0; await context.setOffline(true); await page.getByText('Sin conexión · datos conservados',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button', { name: /^(Iniciar|Finalizar) / }).count(),0);
  assert.equal(await page.getByTestId('operational-late').count(),0); await capture('offline-tablet.png'); await context.setOffline(false);
  state.readFault = true; await page.getByRole('button', { name:'Actualizar',exact:true }).click(); await page.getByText('Actualización no disponible',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button', { name: /^(Iniciar|Finalizar) / }).count(),0);
  state.readFault = false; await page.reload(); await filter(/^Todas/).waitFor();
  pass('400/403/409/503 preserve observed status with explicit errors; offline/read error block actions and reliable late labels');
  await page.goto(`${origin}/my-day?plan=1#agenda-task-${tasks[2].id}`); await card(2,false).waitFor();
  await page.waitForFunction(() => window.scrollY > 0);
  await page.evaluate(() => window.scrollTo(0,0));
  const refreshed = page.waitForResponse(response => response.url().endsWith('/api/plans/1/tasks'));
  await page.getByRole('button',{name:'Actualizar',exact:true}).click(); await refreshed;
  assert.equal(await page.evaluate(() => window.scrollY),0);
  pass('Explicit task fragment navigates once; refresh/polling does not repeat automatic scrolling');
  for (let i=10;i<40;i++) tasks[i].startPlanned='08:00';
  await reload(); await page.getByTestId('operational-late').waitFor();
  assert.equal(await page.getByTestId('operational-late').locator('article').count(),12);
  assert.match(await page.getByTestId('operational-late').innerText(),/Retrasadas \(31\)/);
  await page.getByRole('button',{name:/Mostrar más retrasadas/}).click();
  assert.equal(await page.getByTestId('operational-late').locator('article').count(),24);
  await page.getByRole('button',{name:/Mostrar más retrasadas/}).click();
  assert.equal(await page.getByTestId('operational-late').locator('article').count(),31);
  await capture('expanded-tablet.png');
  state.mode='manual'; await page.reload(); await page.getByTestId('operational-late').waitFor();
  assert.equal(await page.getByText('Reloj simulado autorizado',{exact:true}).count(),1);
  assert.deepEqual(errors,[]);
  pass('Dozens of delayed tasks expand with exact remaining counts; manual clock remains authoritative; no JS errors');
} catch (error) {
  console.error({url:page.url(),body:(await page.locator('body').innerText()).slice(0,2200),errors});
  await page.screenshot({path:path.join(output,'failure.png')}); throw error;
} finally {
  await browser.close(); await server.close();
  writeFileSync(path.join(output,'browser.json'),JSON.stringify({mode:'INTERCEPTED_HTTP_UI',checks,writes,screenshots,errors,acceptedTaskCount:266,remoteWrites:0,nativeAuthRls:false},null,2)+'\n');
}
