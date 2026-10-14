/** Real native ledger/Auth/HTTP/RLS/browser gate. Only receives an owned local DB. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { chromium, type Page } from 'playwright';

type User = { id: string; email: string; password: string; token: string };
export async function runWarRoomJourney({ appUrl, url, anon, users, db, planId, directory, pass }: {
  appUrl: string; url: string; anon: string; users: Record<string, User>; db: pg.Client; planId: number; directory: string; pass: (name: string) => void;
}) {
  assert.equal(db.host, '127.0.0.1'); assert.equal(new URL(url).hostname, '127.0.0.1');
  const root = `/api/plans/${planId}/incidents`;
  const request = async (role: string, path = root, method = 'GET', body?: unknown) => {
    const response = await fetch(`${appUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(role === 'anon' ? {} : { Authorization: `Bearer ${users[role].token}` }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  const baseline = async () => (await db.query(`SELECT
   (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t) tasks,
   (SELECT jsonb_agg(t ORDER BY id) FROM task_status_events t) execution,
   (SELECT jsonb_agg(g ORDER BY id) FROM assisted_planning_stages g) stages,
   (SELECT jsonb_agg(s ORDER BY id) FROM assisted_planning_sessions s) sessions,
   (SELECT jsonb_agg(l ORDER BY id) FROM locks l) locks,
   (SELECT jsonb_agg(p ORDER BY id) FROM plans p) plans,
   (SELECT jsonb_agg(p ORDER BY id) FROM program_settings p) clock,
   (SELECT jsonb_agg(p ORDER BY id) FROM plan_optimizer_snapshots p) preferences,
   (SELECT jsonb_agg(p ORDER BY id) FROM plan_resource_items p) resources,
   (SELECT jsonb_agg(p ORDER BY id) FROM plan_space_settings p) spaces,
   (SELECT jsonb_agg(p ORDER BY plan_id,space_id,plan_resource_item_id) FROM plan_space_resource_assignments p) space_assignments,
   (SELECT jsonb_agg(p ORDER BY plan_id,zone_id,plan_resource_item_id) FROM plan_zone_resource_assignments p) zone_assignments`)).rows;
  const original = await baseline();
  assert.equal(original[0].tasks.filter((t: any) => Number(t.plan_id) === planId).length, 266);
  const material = async () => (await db.query(`SELECT (SELECT jsonb_agg(i ORDER BY id) FROM operational_incidents i) incidents,(SELECT jsonb_agg(e ORDER BY id) FROM operational_incident_events e) events`)).rows;
  const create = (extra: object = {}) => ({ requestId: randomUUID(), type: 'technical', severity: 'critical', description: 'Problema técnico en prueba local', ...extra });
  const clean = await material();
  for (const role of ['anon', 'norole', 'viewer', 'aux']) {
    const denied = await request(role, root, 'POST', create());

    assert.equal(denied.status, role === 'anon' ? 401 : 403);
    assert.deepEqual(await material(), clean);
  }
  for (const role of ['anon', 'norole']) assert.equal((await request(role)).status, role === 'anon' ? 401 : 403);
  assert.deepEqual((await request('viewer')).body, []);
  pass('P3 real HTTP: anonymous/no-role/viewer/unlinked aux cannot write; authorized read is empty');
  const ctx = await request('production', `${root}/context`); assert.equal(ctx.status, 200);
  const task = ctx.body.tasks.find((t: any) => t.spaceId && t.zoneId && t.contestantId);
  const outside = ctx.body.tasks.find((t: any) => t.spaceId && t.spaceId !== task.spaceId);
  assert.ok(task && outside);
  const links = { taskId: task.id, zoneId: task.zoneId, spaceId: task.spaceId, contestantId: task.contestantId };
  const staff = (await db.query("INSERT INTO staff_people(name,role_type) VALUES('Operadora de plató P3','production') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO user_entity_links(user_id,entity_type,entity_id) VALUES($1,'staff_person',$2)", [users.aux.id, staff]);
  await db.query("INSERT INTO plan_staff_assignments(plan_id,staff_role,staff_person_id,scope_type,space_id) VALUES($1,'production',$2,'space',$3)", [planId, staff, task.spaceId]);
  await db.query("INSERT INTO plan_zone_staff_mode(plan_id,zone_id,mode) VALUES($1,$2,'space') ON CONFLICT(plan_id,zone_id) DO UPDATE SET mode='space'", [planId, task.zoneId]);
  const staffMaterial = async () => (await db.query(`SELECT
    (SELECT jsonb_agg(a ORDER BY id) FROM plan_staff_assignments a) assignments,
    (SELECT jsonb_agg(m ORDER BY plan_id,zone_id) FROM plan_zone_staff_mode m) modes,
    (SELECT jsonb_agg(l ORDER BY id) FROM user_entity_links l) links`)).rows;
  const originalStaff = await staffMaterial();
  assert.equal((await request('aux', root, 'POST', create({ taskId: outside.id }))).status, 403);
  assert.equal((await request('aux', root, 'POST', create())).status, 403);
  assert.equal((await request('aux', root, 'POST', create({ ...links, responsibleId: Number(staff) }))).status, 403);
  assert.equal((await request('production', root, 'POST', create({ ...links, spaceId: outside.spaceId }))).status, 400);
  const another = (await db.query('SELECT id,plan_id FROM daily_tasks WHERE plan_id<>$1 LIMIT 1', [planId])).rows[0];
  const foreignResource = (await db.query('SELECT id FROM plan_resource_items WHERE plan_id<>$1 LIMIT 1', [planId])).rows[0];
  assert.ok(another && foreignResource);
  for (const extra of [{ taskId: Number(another.id) }, { resourceId: Number(foreignResource.id) }, { contestantId: 2147483647 }, { zoneId: 2147483647 }, { spaceId: 2147483647 }]) {
    const invalid = create(extra), response = await request('production', root, 'POST', invalid);
    assert.equal(response.status, 400, JSON.stringify(extra));
  }
  for (const extra of [{ authorId: users.viewer.id }, { planId: Number(another.plan_id) }, { createdAt: '2000-01-01' }, { status: 'resolved' }, { version: 999 }]) assert.equal((await request('production', root, 'POST', create(extra))).status, 400);
  assert.equal((await request('production', '/api/plans/invalid/incidents')).status, 400);
  assert.equal((await request('production', `${root}/not-a-uuid`)).status, 400);
  assert.equal((await request('production', `${root}/${randomUUID()}`)).status, 404);
  pass('P3 scope, cross-plan task/resource, invalid membership/hierarchy and forged identity/timestamps rejected');
  const body = create({ ...links, description: 'Crítica HTTP · sonido del plató' });
  const began = Date.now();
  const made = await request('aux', root, 'POST', body); assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.authorId, users.aux.id); assert.equal(made.body.authorName, 'Operadora de plató P3');
  assert.ok(Date.parse(made.body.createdAt) >= began - 1000 && Date.parse(made.body.createdAt) <= Date.now() + 1000);
  const id = made.body.id, path = `${root}/${id}`;
  const retry = await request('aux', root, 'POST', body); assert.equal(retry.status, 201); assert.equal(retry.body.id, id);
  const duplicateRace = await Promise.all([request('aux', root, 'POST', body), request('aux', root, 'POST', body)]);
  assert.ok(duplicateRace.every(result => result.status === 201 && result.body.id === id));
  assert.equal((await request('aux', root, 'POST', { ...body, description: 'Un borrador distinto con la misma clave' })).status, 409);
  assert.equal((await request('production', path)).body.events.length, 1);
  const privateIncident = await request('production', root, 'POST', create({ description: 'Incidencia global de Producción' })); assert.equal(privateIncident.status, 201);
  assert.equal((await request('aux', `${root}/${privateIncident.body.id}`)).status, 403);
  assert.equal((await request('aux', `${root}/${privateIncident.body.id}`, 'POST', {})).status, 404);
  const scoped = (await request('aux')).body; assert.equal(scoped.length, 1);
  pass('P3 author/server timestamp and idempotent create; scoped reader cannot see global facts');
  // Native RLS exercised through real authenticated PostgREST, including RPC bypass attempts.
  for (const role of ['anon', 'norole', 'viewer', 'aux', 'production', 'admin']) {
    const headers = { apikey: anon, Authorization: `Bearer ${role === 'anon' ? anon : users[role].token}`, 'Content-Type': 'application/json' };
    for (const table of ['operational_incidents', 'operational_incident_events']) {
      const direct = await fetch(`${url}/rest/v1/${table}?select=*`, { headers });
      const rows: any = await direct.json();
      if (role === 'anon') assert.equal(direct.status, 401);
      else { assert.equal(direct.status, 200, JSON.stringify(rows)); assert.equal(rows.length, role === 'norole' ? 0 : role === 'aux' ? 1 : 2); }
      for (const method of ['POST', 'PATCH', 'DELETE']) {
        const r = await fetch(`${url}/rest/v1/${table}`, { method, headers, ...(method === 'DELETE' ? {} : { body: JSON.stringify(table === 'operational_incidents' ? { description: 'forged' } : { note: 'forged' }) }) });
        assert.ok(r.status >= 400, `direct ${role}/${table}/${method} denied`);
      }
    }
    const bypass = await fetch(`${url}/rest/v1/rpc/incident_command`, { method: 'POST', headers, body: JSON.stringify({ p_plan: planId, p_actor: users.admin.id, p_action: 'resolve', p_fields: { note: 'forged' }, p_id: id, p_version: 1 }) });
    assert.ok(bypass.status >= 400);
  }
  pass('P3 real Data API: row visibility, no direct writes/deletes or actor-forging RPC for every role');
  const unchanged = await material();
  await db.query("CREATE FUNCTION public.p3_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Internal fault must stay private';END;$$; CREATE TRIGGER p3_fail BEFORE INSERT ON operational_incident_events FOR EACH ROW EXECUTE FUNCTION public.p3_fail();");
  const fail = await request('production', `${path}/resolve`, 'POST', { expectedVersion: 1, note: 'No debe persistir' });
  assert.equal(fail.status, 503); assert.ok(!JSON.stringify(fail.body).includes('Internal fault'));
  assert.deepEqual(await material(), unchanged);
  const failedCreate = await request('production', root, 'POST', create()); assert.equal(failedCreate.status, 503); assert.deepEqual(await material(), unchanged);
  await db.query('DROP TRIGGER p3_fail ON operational_incident_events; DROP FUNCTION public.p3_fail();');
  const race = await Promise.all(['production', 'admin'].map(role => request(role, path, 'PATCH', { expectedVersion: 1, cause: `Causa por ${role}` })));
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  assert.equal((await request('aux', path, 'PATCH', { expectedVersion: 2, responsibleId: Number(staff) })).status, 403);
  const assigned = await request('production', path, 'PATCH', { expectedVersion: 2, responsibleId: Number(staff) }); assert.equal(assigned.status, 200);
  assert.equal(assigned.body.responsibleName, 'Operadora de plató P3');
  assert.equal((await request('production', `${path}/escalate`, 'POST', { expectedVersion: 3, note: 'Requiere coordinación de sonido' })).status, 200);
  const resolution = await request('aux', `${path}/resolve`, 'POST', { expectedVersion: 4, note: 'Sustituido cable de sonido' }); assert.equal(resolution.status, 200);
  assert.ok(resolution.body.resolvedAt);
  assert.equal((await request('production', `${path}/resolve`, 'POST', { expectedVersion: 4, note: 'stale' })).status, 409);
  assert.equal((await request('production', `${path}/reopen`, 'POST', { expectedVersion: 5, note: 'La avería reaparece' })).status, 200);
  const history = await request('production', path); assert.equal(history.status, 200);
  assert.deepEqual(history.body.events.map((e: any) => e.action), ['created', 'updated', 'updated', 'escalated', 'resolved', 'reopened']);
  assert.equal(history.body.events[4].note, 'Sustituido cable de sonido'); assert.equal(history.body.incident.resolvedAt, null);
  assert.deepEqual(history.body.events.map((e: any) => e.version), [1, 2, 3, 4, 5, 6]);
  await db.query(readFileSync('supabase/migrations/094_operational_incidents.sql', 'utf8'));
  assert.deepEqual((await request('production', path)).body.events, history.body.events);
  pass('P3 atomic create/update rollback, sanitized failure, version race 200+409, assignment, escalation, resolution/reopen and idempotent DDL');
  // The browser gate uses separate production/aux/viewer contexts and real login.
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const errors: string[] = [];
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });
  const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Madrid' });
  const viewerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await mobileCtx.newPage(), desktop = await desktopCtx.newPage(), viewer = await viewerCtx.newPage();
  const login = async (page: Page, role: string) => {
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${appUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email', { exact: true }).fill(users[role].email);
    await page.getByLabel('Contraseña (opcional para enlace)', { exact: true }).fill(users[role].password);
    await page.getByRole('button', { name: 'Entrar con contraseña', exact: true }).click(); await page.waitForURL('**/dashboard');
  };
  const description = 'Micrófono sin señal · incidencia registrada desde móvil';
  let uiId: string;
  try {
    await login(mobile, 'aux'); await login(desktop, 'production'); await login(viewer, 'viewer');
    await desktop.goto(`${appUrl}/war-room?plan=${planId}`);
    await desktop.getByText('Realtime no disponible · consulta cada 5 s', { exact: true }).waitFor();
    await desktop.getByText('Registro compartido', { exact: true }).waitFor();
    await mobile.goto(`${appUrl}/war-room?plan=${planId}`);
    await mobile.getByRole('button', { name: 'Registrar incidencia', exact: true }).waitFor();
    await mobile.getByRole('button', { name: 'Registrar incidencia', exact: true }).click();
    const dialog = mobile.getByRole('dialog', { name: 'Registrar incidencia', exact: true });
    await dialog.getByLabel('Tipo', { exact: true }).selectOption('technical');
    await dialog.getByLabel('Severidad', { exact: true }).selectOption('critical');
    await dialog.getByLabel('Descripción del problema', { exact: true }).fill(description);
    await dialog.getByLabel('Tarea vinculada', { exact: true }).selectOption(String(task.id));
    await mobile.screenshot({ path: `${directory}/war-room-mobile-form.png`, fullPage: true });
    const beforeUIFailure = await material();
    await db.query("CREATE FUNCTION public.p3_ui_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Private UI fault';END;$$; CREATE TRIGGER p3_ui_fail BEFORE INSERT ON operational_incident_events FOR EACH ROW EXECUTE FUNCTION public.p3_ui_fail();");
    const failedSave = mobile.waitForResponse(r => r.url().endsWith(root) && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Guardar incidencia', exact: true }).click();
    assert.equal((await failedSave).status(), 503);
    await dialog.getByRole('alert').filter({ hasText: 'Guardado no confirmado' }).waitFor();
    assert.equal(await dialog.getByLabel('Descripción del problema', { exact: true }).inputValue(), description);
    assert.deepEqual(await material(), beforeUIFailure);
    await db.query('DROP TRIGGER p3_ui_fail ON operational_incident_events; DROP FUNCTION public.p3_ui_fail();');
    const saved = mobile.waitForResponse(r => r.url().endsWith(root) && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Guardar incidencia', exact: true }).click();
    const response = await saved; assert.equal(response.status(), 201); uiId = (await response.json()).id;
    await mobile.getByText('Guardado en el registro compartido', { exact: true }).waitFor();
    await mobile.keyboard.press('Escape');
    const card = desktop.getByTestId(`incident-${uiId}`);
    await card.waitFor({ timeout: 20000 }); await card.getByText(description, { exact: true }).waitFor();
    await mobile.getByTestId(`incident-${uiId}`).waitFor();
    await mobile.screenshot({ path: `${directory}/war-room-mobile-overview.png`, fullPage: true });
    await mobile.getByTestId(`incident-${uiId}`).evaluate(el => el.scrollIntoView({ block: 'center' }));
    await mobile.screenshot({ path: `${directory}/war-room-mobile-critical.png`, fullPage: true });
    await desktop.screenshot({ path: `${directory}/war-room-desktop-critical.png`, fullPage: true });
    await desktop.getByRole('button', { name: 'Filtros', exact: false }).click();
    await desktop.getByLabel('Estado', { exact: true }).selectOption('open');
    await desktop.getByLabel('Severidad', { exact: true }).selectOption('critical');
    await desktop.getByLabel('Tarea', { exact: true }).selectOption(String(task.id));
    await desktop.getByLabel('Buscar incidencias', { exact: true }).fill('Micrófono'); await card.waitFor();
    assert.equal(await desktop.locator('article[data-testid^="incident-"]').count(), 1);
    await card.getByRole('button', { name: 'Resolver', exact: true }).click();
    await desktop.getByLabel('Decisión u observación', { exact: true }).fill('Cambiado el transmisor. Señal verificada por sonido.');
    const resolved = desktop.waitForResponse(r => r.url().endsWith(`${uiId}/resolve`));
    await desktop.getByRole('button', { name: 'Confirmar decisión', exact: true }).click(); assert.equal((await resolved).status(), 200);
    await mobile.getByTestId(`incident-${uiId}`).getByText('Resuelta', { exact: true }).waitFor({ timeout: 20000 });
    await mobile.reload(); await mobile.getByTestId(`incident-${uiId}`).getByText('Resuelta', { exact: true }).waitFor();
    await mobile.getByTestId(`incident-${uiId}`).evaluate(el => el.scrollIntoView({ block: 'center' }));
    await mobile.screenshot({ path: `${directory}/war-room-mobile-resolved.png`, fullPage: true });
    await desktop.keyboard.press('Escape');
    await desktop.getByLabel('Estado', { exact: true }).selectOption('resolved');
    await desktop.getByRole('button', { name: /Filtros/ }).click();
    await desktop.getByTestId('war-room').evaluate(el => el.scrollIntoView({ block: 'start' }));
    await desktop.screenshot({ path: `${directory}/war-room-desktop-resolved.png`, fullPage: true });
    await desktop.evaluate(() => document.documentElement.classList.add('dark'));
    await desktop.waitForFunction(() => { const state = [...document.querySelectorAll('article div')].find(el => el.textContent === 'Resuelta'); const main = document.querySelector('[data-testid=war-room]'); return state && main && getComputedStyle(state).color === getComputedStyle(main).color; });
    await desktop.screenshot({ path: `${directory}/war-room-desktop-dark.png`, fullPage: true });
    await card.getByRole('button', { name: 'Ver detalle', exact: true }).click();
    await desktop.getByText('Histórico de cambios', { exact: true }).waitFor();
    await desktop.screenshot({ path: `${directory}/war-room-detail-dark.png`, fullPage: true });
    await desktop.keyboard.press('Escape');
    await viewer.goto(`${appUrl}/war-room?plan=${planId}`);
    await viewer.getByTestId(`incident-${uiId}`).waitFor();
    assert.equal(await viewer.getByRole('button', { name: /^(Resolver|Reabrir|Editar incidencia)$/ }).count(), 0);
    assert.equal(await viewer.getByRole('button', { name: 'Registrar incidencia', exact: true }).isDisabled(), true);
    // Offline never queues a mutation or presents a new official fact.
    await mobileCtx.setOffline(true);
    await mobile.getByText('Sin conexión · mostrando la última consulta; no se puede guardar', { exact: true }).waitFor();
    assert.equal(await mobile.getByRole('button', { name: 'Registrar incidencia', exact: true }).isDisabled(), true);
    await mobileCtx.setOffline(false);
    // Explicit old-browser archive stays local and never changes official totals.
    await mobile.evaluate(({ planId }) => localStorage.setItem(`war-room-${planId}`, JSON.stringify([{ id: 'old', text: 'Nota antigua conservada', resolved: false }])), { planId });
    const beforeLegacy = await material(); await mobile.reload();
    await mobile.getByText('1 anotaciones antiguas en este navegador.', { exact: true }).waitFor();
    assert.deepEqual(await material(), beforeLegacy);
    assert.ok(await mobile.evaluate(({ planId }) => localStorage.getItem(`war-room-${planId}`), { planId }));
    // A second imported day has no facts: capture its real empty state.
    await desktop.goto(`${appUrl}/war-room?plan=${another.plan_id}`);
    await desktop.getByText('Sin incidencias registradas', { exact: true }).waitFor();
    await desktop.screenshot({ path: `${directory}/war-room-empty.png`, fullPage: true });
    // Dashboard navigation preserves the selected day and a reviewable suggestion.
    await desktop.goto(`${appUrl}/dashboard`);
    const dashboardAction = desktop.getByRole('button', { name: /Crear incidencia/ }).first();
    await dashboardAction.waitFor({timeout:20000});
    if (await dashboardAction.count()) {
      const beforeLink = await material(); await dashboardAction.click(); await desktop.waitForURL('**/war-room?**');
      const params = new URL(desktop.url()).searchParams; assert.ok(params.get('plan')); assert.equal(params.get('new'), '1'); assert.equal(params.has('description'), true);
      await desktop.getByRole('dialog', { name: 'Registrar incidencia', exact: true }).waitFor(); assert.deepEqual(await material(), beforeLink);
    } else throw new Error('Dashboard must expose an incident action for the accepted fixture');
    // Existing consumers still load their real task authority.
    await viewer.getByTestId(`incident-${uiId}`).getByRole('link', { name: 'Ir a tarea' }).click();
    await viewer.waitForURL(`**/my-day?plan=${planId}#agenda-task-${task.id}`);
    await viewer.getByTestId(`agenda-task-${task.id}`).waitFor();
    assert.equal(await viewer.getByTestId(`agenda-task-${task.id}`).isVisible(), true);
    await desktop.goto(`${appUrl}/plans/${planId}/control-room`); await desktop.getByTestId('control-room-pro').waitFor();
    // Same browser, different authenticated actor: cached global facts must not
    // become the Aux list after signing in again.
    await desktop.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await desktop.waitForURL('**/login'); await login(desktop, 'aux');
    await desktop.goto(`${appUrl}/war-room?plan=${planId}`);
    await desktop.getByTestId(`incident-${uiId}`).waitFor();
    assert.equal(await desktop.getByText('Incidencia global de Producción', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
  assert.deepEqual(await staffMaterial(), originalStaff, 'nominal staff assignments, modes and identity links remain literal');
  assert.deepEqual(await baseline(), original, 'incidents must leave every task, Stage, assignment, fingerprint, protection, preference and clock literal');
  pass('P3 two independent users/browsers create/observe/resolve/reload; filters, mobile, dark, empty, viewer, offline, legacy and Dashboard review');
  const detail = (await request('admin', `${root}/${uiId!}`)).body;
  return { status: 'PASS', transport: 'HTTP polling 5 seconds; no Realtime server in this rehearsal', browserUsers: ['aux', 'production', 'viewer'], browserSessions: 3,
    planningInvariant: { obligations: 266, allTasksStagesSessionsLocksPlansPreferencesClockUnchanged: true, sha256: createHash('sha256').update(JSON.stringify(original)).digest('hex') },
    incident: detail, concurrentStatuses: race.map(r => r.status).sort(), migrationReapplied: true, remoteWrites: 0,
    screenshots: ['war-room-mobile-form.png','war-room-mobile-overview.png','war-room-mobile-critical.png','war-room-desktop-critical.png','war-room-mobile-resolved.png','war-room-desktop-resolved.png','war-room-desktop-dark.png','war-room-detail-dark.png','war-room-empty.png'] };
}
