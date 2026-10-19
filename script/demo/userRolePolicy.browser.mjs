import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = process.cwd();
const directory = process.env.ROLE_POLICY_OUTPUT || 'work/p6-role-policy';
mkdirSync(directory, { recursive: true });
const server = await createServer({ configFile: false, root, cacheDir: path.join(root, 'work/vite-role-policy'),
optimizeDeps: { entries: ['script/demo/fixtures/userRolePolicyHarness.tsx'] }, plugins: [react(), {
  name: 'role-policy-page', configureServer(s) {
    s.middlewares.use('/role-policy', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/role-policy', '<div id="root"></div><script type="module" src="/script/demo/fixtures/userRolePolicyHarness.tsx"></script>')); });
  },
}], resolve: { alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared') } },
define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:54321'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('local-policy-fixture') },
server: { host: '127.0.0.1', port: 5181, strictPort: true } });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const checks = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
const actorA = '00000000-0000-4000-8000-000000000001';
const actorB = '00000000-0000-4000-8000-000000000002';
const session = id => ({ access_token: btoa(JSON.stringify({ alg: 'none' })) + '.' + btoa(JSON.stringify({ sub: id, exp: Math.floor(Date.now()/1000)+3600 })) + '.fixture',
  token_type: 'bearer', refresh_token: 'fixture', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600,
  user: { id, email: `${id}@example.test`, aud: 'authenticated', app_metadata: {}, user_metadata: {} } });
let actor = actorA, role = 'production', failure = null;
const calls = [];
try {
  await server.listen();
  const context = await browser.newContext();
  await context.addInitScript(s => localStorage.setItem('sb-127-auth-token', JSON.stringify(s)), session(actor));
  await context.route('**/*', async route => {
    const p = new URL(route.request().url()).pathname;
    if (p.startsWith('/api/')) {
      calls.push({ path:p, actor, role });
      if (p === '/api/me/role' && failure === 'hang') return;
      if (p === '/api/me/role' && failure) return route.fulfill({status:failure, json:{message:'policy test'}});
      if (p === '/api/test/accept-stage') return route.fulfill({status:role === 'production' ? 200 : 403, json:{accepted:role === 'production'}});
      return route.fulfill({json:{role}});
    }
    if (p.startsWith('/auth/v1/token')) { actor = actorB; return route.fulfill({json:session(actor)}); }
    if (p.startsWith('/auth/v1/logout')) return route.fulfill({status:204});
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => console.error(error.message));
  page.setDefaultTimeout(15000);
  await page.goto('http://127.0.0.1:5181/role-policy');
  const probe = page.locator('#policy');
  await page.waitForFunction(() => document.querySelector('#policy')?.getAttribute('data-role') === 'production');
  await page.clock.install();
  failure = 'hang';
  const pending = page.waitForRequest(r => new URL(r.url()).pathname === '/api/me/role');
  await page.evaluate(() => { void window.rolePolicy.refetch(); }); await pending;
  await page.clock.fastForward(21000);
  await page.waitForFunction(() => document.querySelector('#policy')?.getAttribute('data-status') === 'error');
  assert.equal(await probe.getAttribute('data-error'), 'AbortError');
  assert.equal(await probe.getAttribute('data-role'), 'production', 'transient role timeout must retain confirmed authority');
  assert.deepEqual(await page.evaluate(() => window.rolePolicy.accept()), {accepted:true});
  pass('confirmed production → role HTTP timeout → controller authority guard → Stage accepted');
  const count = calls.filter(c => c.path === '/api/me/role').length;
  await page.clock.fastForward(31000);
  assert.equal(calls.filter(c => c.path === '/api/me/role').length, count, 'global consumers impose no periodic role refresh');
  failure = 403;
  await page.evaluate(() => window.rolePolicy.refetch());
  assert.equal(await probe.getAttribute('data-role'), '');
  failure = 503;
  await page.evaluate(() => window.rolePolicy.refetch());
  assert.equal(await probe.getAttribute('data-role'), '', 'transient error after confirmed denial cannot resurrect old authority');
  await assert.rejects(page.evaluate(() => window.rolePolicy.accept()), /UNAUTHORIZED/);
  pass('confirmed 403 removes authority permanently through later transport errors');
  failure = null; role = 'production'; await page.evaluate(() => window.rolePolicy.refetch());
  await page.waitForFunction(() => document.querySelector('#policy')?.getAttribute('data-role') === 'production');
  role = 'viewer'; // Deliberately retain client production: only HTTP/backend can authorize acceptance.
  await assert.rejects(page.evaluate(() => window.rolePolicy.accept()), /No tienes permisos/);
  pass('stale production cache cannot authorize HTTP acceptance after true revocation');
  await page.evaluate(() => window.rolePolicy.signOut());
  await page.waitForFunction(() => document.querySelector('#policy')?.getAttribute('data-role') === '');
  await page.evaluate(() => window.rolePolicy.signIn({email:'viewer@example.test', password:'fixture'}));
  await page.waitForFunction(() => document.querySelector('#policy')?.getAttribute('data-actor') === '00000000-0000-4000-8000-000000000002' && document.querySelector('#policy')?.getAttribute('data-role') === 'viewer');
  assert.equal(await probe.getAttribute('data-role'), 'viewer');
  assert.ok((await page.evaluate(() => window.rolePolicy.cache())).every(([key]) => key[1] !== actorA), 'previous session role cache discarded');
  pass('sign-out and different actor cannot inherit prior authority');
  await page.evaluate(() => window.rolePolicy.showControl());
  await page.waitForFunction(() => document.querySelector('#control-policy')?.getAttribute('data-role') === 'viewer');
  role = 'admin'; await page.evaluate(() => window.controlRole.refetch());
  await page.waitForFunction(() => document.querySelector('#policy')?.getAttribute('data-role') === 'admin');
  failure = 503;
  const periodic = page.waitForResponse(r => new URL(r.url()).pathname === '/api/me/role' && r.status() === 503);
  await page.clock.fastForward(30000); await periodic;
  await page.waitForFunction(() => document.querySelector('#control-policy')?.getAttribute('data-status') === 'error');
  assert.equal(await page.locator('#control-policy').getAttribute('data-role'), '');
  assert.equal(await probe.getAttribute('data-role'), 'admin', 'Control Room transient failure must not deauthorize other consumers');
  failure = null; role = 'viewer'; await page.evaluate(() => window.controlRole.refetch());
  await page.waitForFunction(() => document.querySelector('#policy')?.getAttribute('data-role') === 'viewer');
  failure = 401; await page.evaluate(() => window.controlRole.refetch());
  await page.waitForFunction(() => document.querySelector('#policy')?.getAttribute('data-role') === '');
  failure = 503; await page.evaluate(() => window.rolePolicy.refetch());
  assert.equal(await probe.getAttribute('data-role'), '');
  pass('Control Room polls separately, closes on transport failure, reconfirms downgrades and propagates genuine 401');
  writeFileSync(`${directory}/policy.json`, JSON.stringify({status:'PASS',mode:'INTERCEPTED_AUTH_HTTP_CONTROLLER_CONTRACT',checks,calls},null,2));
} finally { await browser.close(); await server.close(); }
