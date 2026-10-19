/** Real app, React Query and auth lifecycle; HTTP is intercepted exclusively
 * with local fixtures. No configured Supabase instance is contacted. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { callSheetFixture } from '../lib/call-sheet-test-fixture.ts';

const root = process.cwd(), output = path.join(root, 'work/p5-browser');
mkdirSync(output, { recursive: true });
const fixture = callSheetFixture(), original = JSON.stringify(fixture);
const plans = [{ id: 1, name: 'Jornada de prueba', date: '2026-10-19', workStart: '09:00', workEnd: '21:00' }, { id: 2, date: '2026-10-20', workStart: '09:00', workEnd: '21:00' }];
const actors = {
  worker: { id: '00000000-0000-4000-8000-000000000001', role: 'aux', staffPersonId: 1 },
  boss: { id: '00000000-0000-4000-8000-000000000002', role: 'production' },
  viewer: { id: '00000000-0000-4000-8000-000000000003', role: 'viewer', staffPersonId: 3 },
  unlinked: { id: '00000000-0000-4000-8000-000000000004', role: 'aux' },
};
let actor = actors.worker, failLinks = false, delayLinks = false;
const requests = [], checks = [], errors = [];
let multiplePageCount = 0;
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
const server = await createServer({ configFile: false, root: path.join(root, 'client'), cacheDir: path.join(root, 'work/vite-p5'), plugins: [react()],
  resolve: { alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared'), '@assets': path.join(root, 'attached_assets') } },
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:54321'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('local-ui-fixture') },
  server: { host: '127.0.0.1', port: 5189, strictPort: true, fs: { allow: [root] } } });
await server.listen();
const origin = 'http://127.0.0.1:5189';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'], timezoneId: 'America/New_York' });
await context.addInitScript(actor => {
  const encode = value => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: actor.id, exp: Math.floor(Date.now() / 1000) + 3600 }) + '.Zml4dHVyZQ';
  localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: actor.id, email: 'ui@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} } }));
  localStorage.setItem('call-sheet-notes-1-Producción', 'Nota local anterior que debe conservarse');
  window.print = () => { window.printedSheet = document.querySelector('[data-testid="call-sheet"]').innerText; };
}, actor);
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url()), p = url.pathname;
  if (!p.startsWith('/api/')) {
    if (url.origin === origin) return route.continue();
    assert.equal(url.hostname, '127.0.0.1', 'No external service request');
    return route.fulfill({ status: 200, json: { id: actor.id, email: 'ui@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} } });
  }
  requests.push({ path: p, method: request.method(), authorization: request.headers().authorization });
  let body = [], status = 200;
  const planId = Number(/^\/api\/plans\/(\d+)/.exec(p)?.[1]);
  if (p === '/api/me/role' || p === '/api/bootstrap-role') body = { role: actor.role };
  else if (p === '/api/me/links') {
    if (delayLinks) await new Promise(resolve => setTimeout(resolve, 300));
    status = failLinks ? 503 : 200; body = failLinks ? { message: 'No se puede verificar el vínculo' } : { staffPersonId: actor.staffPersonId ?? null, resourceItemId: null };
  }
  else if (p === '/api/me/preferences') body = { favoritePlanId: null };
  else if (p === '/api/plans') body = plans;
  else if (p === '/api/staff-people') body = fixture.people;
  else if (p === '/api/zones') body = fixture.zones;
  else if (p === '/api/spaces') body = fixture.spaces;
  else if (p.endsWith('/tasks')) body = fixture.tasks.filter(t => t.planId === planId);
  else if (p.endsWith('/staff-assignments')) body = fixture.assignments.filter(a => a.planId === planId);
  else if (p.endsWith('/zone-staff-modes')) body = fixture.modes;
  else if (p.endsWith('/space-availability')) body = fixture.daySpaces;
  else if (p.endsWith('/resource-items')) body = fixture.resources.filter(r => r.planId === planId);
  else if (p.endsWith('/zone-resource-assignments')) body = fixture.zoneResources;
  else if (p.endsWith('/space-resource-assignments')) body = fixture.spaceResources;
  else if (p.endsWith('/contestants')) body = fixture.contestants;
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
});
const page = await context.newPage(); page.setDefaultTimeout(30000);
page.on('pageerror', error => errors.push(error.message));
const sheet = () => page.getByTestId('call-sheet');
const selectedIds = async () => page.locator('article[data-testid^="sheet-task-"]').evaluateAll(elements => elements.map(e => Number(e.dataset.testid.replace('sheet-task-', ''))));
const choose = async value => { await page.getByLabel('Destinatario', { exact: true }).selectOption(value); };
const waitSheet = async text => { await page.getByTestId('sheet-header').filter({ hasText: text }).waitFor(); };
const screenshot = async name => {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('main').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: path.join(output, name), fullPage: true });
};
const switchActor = async next => {
  actor = next; delayLinks = true;
  // Exercise actual Supabase onAuthStateChange without clearing React Query.
  await page.evaluate(async actor => {
    const { supabase } = await import('/src/lib/supabaseClient.ts');
    const encode = value => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: actor.id, exp: Math.floor(Date.now() / 1000) + 3600 }) + '.Zml4dHVyZQ';
    const result = await supabase.auth.setSession({ access_token: token, refresh_token: 'fixture' });
    if (result.error) throw new Error(result.error.message);
  }, actor);
  await waitSheet(next.staffPersonId === 3 ? 'Celia' : next.staffPersonId === 1 ? 'Ana' : 'Vista general');
  delayLinks = false;
};
try {
  await page.goto(`${origin}/call-sheet`); await waitSheet('Mi hoja · Ana');
  assert.deepEqual(await selectedIds(), [11, 12]);
  assert.match(await sheet().innerText(), /Coincide con 1 actividad/);
  await screenshot('worker-mobile.png');
  assert.equal(await page.locator('option[value="person:3"]').count(), 0);
  pass('Empleado vinculado: Mi hoja por defecto, dos simultáneas, móvil y selector sin poderes globales');

  await switchActor(actors.boss);
  const sessionBefore = await page.evaluate(() => localStorage.getItem('sb-127-auth-token'));
  const cookiesBefore = await context.cookies(), requestStart = requests.length;
  await choose('person:1'); await waitSheet('Por persona · Ana'); assert.deepEqual(await selectedIds(), [11, 12]);
  await page.getByLabel('Notas locales de esta hoja').fill('Nota de esta cuenta para Ana');
  await choose('person:3'); await waitSheet('Por persona · Celia'); assert.deepEqual(await selectedIds(), [13]);
  assert.equal(await page.getByLabel('Notas locales de esta hoja').inputValue(), '');
  assert.match(await sheet().innerText(), /Vista previa de Producción · solo lectura/);
  assert.doesNotMatch((await page.locator('.sheet-agenda').allTextContents()).join(' '), /Actividad 11|Actividad 12|Cámara nominal A/);
  await page.getByRole('button', { name: 'Ver compacto', exact: true }).click();
  assert.deepEqual(await selectedIds(), [13]);
  assert.equal(await page.getByText('Incluida por:', { exact: false }).count(), 0);
  await page.getByRole('button', { name: 'Ver detallado', exact: true }).click();
  await page.getByRole('button', { name: 'Modo impresión', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Modo impresión', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await selectedIds(), [13]);
  await page.getByRole('button', { name: 'Modo impresión', exact: true }).click();
  await page.getByRole('button', { name: 'Copiar resumen', exact: true }).click();
  const summary = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(summary, /Celia/); assert.match(summary, /Actividad 13/); assert.doesNotMatch(summary, /Actividad 11|Actividad 12/);
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Continuar', exact: true }).click();
  assert.match(await page.evaluate(() => window.printedSheet), /Celia/);
  assert.doesNotMatch(await page.evaluate(() => window.printedSheet), /Actividad 11|Actividad 12/);
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.getByLabel('Destinatario', { exact: true }).isVisible(), false);
  assert.equal(await page.getByLabel('Notas locales de esta hoja').isVisible(), false);
  assert.equal(await page.getByRole('dialog').isVisible(), false, 'PDF help is hidden even while closing');
  assert.equal(await page.locator('body > div[data-state]').filter({ visible: true }).count(), 0, 'No Radix backdrop in print');
  const pdf = await page.pdf({ path: path.join(output, 'celia-A4.pdf'), format: 'A4', printBackground: true });
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1, 'Single activity fits A4 without an extra help-dialog page');
  await page.emulateMedia({ media: 'screen' });
  await screenshot('production-mobile.png');
  await page.setViewportSize({ width: 768, height: 1024 }); await screenshot('production-tablet.png');
  await page.setViewportSize({ width: 1440, height: 1000 }); await screenshot('production-desktop.png');
  await choose('person:1'); assert.equal(await page.getByLabel('Notas locales de esta hoja').inputValue(), 'Nota de esta cuenta para Ana');
  assert.equal(await page.evaluate(() => localStorage.getItem('call-sheet-notes-1-Producción')), 'Nota local anterior que debe conservarse');
  await page.getByText('Notas locales anteriores por enfoque', { exact: false }).click();
  assert.equal(await page.getByText('Nota local anterior que debe conservarse', { exact: true }).isVisible(), true);
  await page.getByText('Notas locales anteriores por enfoque', { exact: false }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('sb-127-auth-token')), sessionBefore);
  assert.deepEqual(await context.cookies(), cookiesBefore);
  assert.equal(requests.slice(requestStart).filter(r => r.method !== 'GET').length, 0);
  pass('Producción: selección exacta Ana/Celia; copia, impresión y PDF A4 del destinatario; sesión/cookies intactas; notas nuevas aisladas y anteriores conservadas');

  await choose('person:5'); assert.deepEqual(await selectedIds(), []); await page.getByTestId('sheet-empty').waitFor();
  await choose('role:realization'); assert.deepEqual(await selectedIds(), []); assert.match(await sheet().innerText(), /no existe una relación estructurada/);
  await choose('role:editorial'); assert.deepEqual(await selectedIds(), [13]); assert.doesNotMatch(await sheet().innerText(), /\bHit\b/);
  await choose('resource:501'); assert.deepEqual(await selectedIds(), [11, 12]);
  await choose('space:101'); assert.deepEqual(await selectedIds(), [11]);
  await choose('person:1'); await page.getByLabel('Jornada', { exact: true }).selectOption('2'); await waitSheet('2026-10-20');
  assert.deepEqual(await selectedIds(), [15]); // day change explicitly resets to general for unlinked boss
  await choose('person:1'); assert.deepEqual(await selectedIds(), []);
  pass('Vacíos sin fallback; Realización limitada; Redacción sin hits; recurso y espacio nominales; cambio de jornada sin asignaciones heredadas');

  await page.getByLabel('Jornada', { exact: true }).selectOption('1'); await waitSheet('2026-10-19');
  await choose('person:1');
  const originalCount = fixture.tasks.length;
  fixture.tasks.push(...Array.from({ length: 40 }, (_, i) => ({ ...fixture.tasks[0], id: 1000 + i, template: { name: `Actividad adicional ${i + 1}` } })));
  await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('article[data-testid^="sheet-task-"]').length === 42);
  await page.emulateMedia({ media: 'print' });
  const multiple = await page.pdf({ path: path.join(output, 'ana-multiple-A4.pdf'), format: 'A4', printBackground: true });
  multiplePageCount = (multiple.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  assert.ok(multiplePageCount > 1 && multiplePageCount < 16, `42 activities paginate without a giant section: ${multiplePageCount}`);
  await page.emulateMedia({ media: 'screen' });
  fixture.tasks.splice(originalCount);
  await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('article[data-testid^="sheet-task-"]').length === 2);
  pass(`Impresión de 42 actividades en ${multiplePageCount} páginas A4, sin paneles ni diálogo sobre la hoja`);
  await switchActor(actors.viewer); assert.deepEqual(await selectedIds(), [13]);
  assert.equal(await page.locator('option[value="person:1"]').count(), 0);
  await page.getByLabel('Destinatario', { exact: true }).evaluate(select => select.add(new Option('Selección manipulada', 'person:1')));
  await choose('person:1'); assert.deepEqual(await selectedIds(), [13]);
  assert.match(await page.getByTestId('sheet-header').innerText(), /Mi hoja · Celia/);
  assert.doesNotMatch(await sheet().innerText(), /Nota de esta cuenta para Ana/);
  await switchActor(actors.unlinked); assert.deepEqual(await selectedIds(), [11, 12, 14, 13]);
  assert.match(await sheet().innerText(), /Sin vínculo personal/);
  await choose('mine'); assert.deepEqual(await selectedIds(), []);
  pass('Cambio real de sesión con caché conservada: viewer editorial ve solo su hoja; sin vínculo muestra general explícita y Mi hoja vacía');

  failLinks = true; await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
  await page.getByText('No se puede verificar el vínculo', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-testid^="sheet-task-"]').count(), 0);
  assert.equal(requests.filter(r => r.method !== 'GET' && r.path !== '/api/bootstrap-role').length, 0);
  assert.equal(requests.filter(r => /^\/api\/plans\/\d+$/.test(r.path)).length, 0, 'No GET with implicit meal sync');
  assert.equal(JSON.stringify(fixture), original); assert.deepEqual(errors, []);
  pass('Error de identidad bloquea falsa personalización; cero escrituras de Hoja del día, sin GET que sincronice comidas ni errores de React');
  writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, screenshots: ['worker-mobile.png', 'production-mobile.png', 'production-tablet.png', 'production-desktop.png'], pdf: 'celia-A4.pdf', multiplePagePdf: { file: 'ana-multiple-A4.pdf', activities: 42, pages: multiplePageCount }, writes: 0, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  console.error('Browser state:', (await page.locator('body').innerText()).slice(-4000));
  console.error('Recent requests:', requests.slice(-15).map(({ path, method }) => ({ path, method })), 'React errors:', errors);
  throw error;
} finally { await browser.close(); await server.close(); }
