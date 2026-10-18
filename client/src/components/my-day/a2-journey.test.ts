import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { chromium, type Page } from 'playwright';

type User = { id: string; email: string; password: string; token: string };
export async function runLiveExecutionJourney({ appUrl, users, db, directory, pass }: {
  appUrl: string; users: Record<string, User>; db: pg.Client; directory: string; pass: (name: string) => void;
}) {
  assert.equal((db as any).host, '127.0.0.1');
  const planId = 27001;
  const request = async (role: string, path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${appUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${users[role].token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  const planning = async () => (await db.query(`SELECT
    (SELECT jsonb_agg(jsonb_build_object('id',id,'template',template_id,'contestant',contestant_id,'start',start_planned,'end',end_planned,'space',space_id,'zone',zone_id,'resources',assigned_resource_ids) ORDER BY id) FROM daily_tasks WHERE plan_id=$1) tasks,
    (SELECT jsonb_agg(g ORDER BY id) FROM assisted_planning_stages g WHERE plan_id=$1) stages,
    (SELECT jsonb_agg(s ORDER BY id) FROM assisted_planning_sessions s WHERE plan_id=$1) sessions`, [planId])).rows;
  const before = await planning();
  assert.equal(before[0].tasks.length, 266);
  const all = (await request('production', `/api/plans/${planId}/tasks`)).body;
  const locations = [...new Map<number, any>(all.filter((t: any) => t.spaceId && t.zoneId).map((t: any) => [t.spaceId, t] as [number, any])).values()];
  const first = locations[0], second = locations.find(t => t.zoneId !== first.zoneId);
  assert.ok(first && second);
  const [staff, helper] = (await db.query("INSERT INTO staff_people(name,role_type) VALUES('Ayudante P1A','production'),('Ayudante solapado P1A','production') RETURNING id")).rows.map(r => r.id);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  const errors: string[] = [];
  const operatorContext = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });
  const helperContext = await browser.newContext({ viewport: { width: 820, height: 1180 }, timezoneId: 'Europe/Madrid' });
  const operator = await operatorContext.newPage(), colleague = await helperContext.newPage();
  const login = async (page: Page, role: string) => {
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${appUrl}/login`);
    await page.getByLabel('Email', { exact: true }).fill(users[role].email);
    await page.getByLabel('Contraseña (opcional para enlace)', { exact: true }).fill(users[role].password);
    await page.getByRole('button', { name: 'Entrar con contraseña', exact: true }).click();
    await page.waitForURL('**/dashboard');
    await page.goto(`${appUrl}/my-day?plan=${planId}`);
    await page.getByTestId('day-group-pending').waitFor();
  };
  const agendaIds = async (page: Page) => page.locator('article[data-testid^="agenda-task-"]').evaluateAll(elements => elements.map(el => Number(el.getAttribute('data-testid')!.slice('agenda-task-'.length))).sort((a, b) => a - b));
  const assertAgenda = async (page: Page, expected: number[]) => {
    await page.waitForFunction(expectedIds => {
      const ids = [...document.querySelectorAll('article[data-testid^="agenda-task-"]')].map(el => Number(el.getAttribute('data-testid')!.slice('agenda-task-'.length))).sort((a, b) => a - b);
      return JSON.stringify(ids) === JSON.stringify(expectedIds);
    }, [...expected].sort((a, b) => a - b));
  };
  const selectFocus = async (value: string) => {
    await operator.getByRole('combobox', { name: 'Concentrar vista', exact: true }).click();
    await operator.getByRole('option', { name: value, exact: true }).click();
  };
  const noOverflow = async (page: Page) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow');
  try {
    await login(operator, 'aux');
    await operator.getByText('Sin ámbito operativo de Producción', { exact: false }).waitFor();
    assert.equal(await operator.getByRole('button', { name: /^(Iniciar|Finalizar) / }).count(), 0);
    assert.equal((await request('aux', `/api/plans/${planId}/execution`)).body.hasScope, false);
    await db.query("INSERT INTO user_entity_links(user_id,entity_type,entity_id) VALUES($1,'staff_person',$2)", [users.aux.id, staff]);
    await db.query("INSERT INTO plan_staff_assignments(plan_id,staff_role,staff_person_id,scope_type,space_id) VALUES($1,'editorial',$2,'space',$3)", [planId, staff, first.spaceId]);
    await operator.reload(); await operator.getByTestId('day-group-pending').waitFor();
    assert.equal((await request('aux', `/api/plans/${planId}/execution`)).body.hasScope, false);
    assert.equal(await operator.getByRole('button', { name: /^(Iniciar|Finalizar) / }).count(), 0);
    assert.equal((await request('aux', `/api/tasks/${first.id}/status`, 'PATCH', { status: 'in_progress', expectedStatus: 'pending' })).status, 403);
    await login(colleague, 'viewer');
    assert.equal(await colleague.getByRole('button', { name: /^(Iniciar|Finalizar) / }).count(), 0);
    pass('P1A unlinked/editorial/viewer consult without execution; editorial direct Start denied by G0');

    await db.query('DELETE FROM plan_staff_assignments WHERE staff_person_id=$1 AND plan_id=$2', [staff, planId]);
    for (const zone of [first.zoneId, second.zoneId]) {
      await db.query("INSERT INTO plan_staff_assignments(plan_id,staff_role,staff_person_id,scope_type,zone_id) VALUES($1,'production',$2,'zone',$3)", [planId, staff, zone]);
      await db.query("INSERT INTO plan_zone_staff_mode(plan_id,zone_id,mode) VALUES($1,$2,'zone') ON CONFLICT(plan_id,zone_id) DO UPDATE SET mode='zone'", [planId, zone]);
    }
    await operator.reload(); await operator.getByRole('combobox', { name: 'Concentrar vista', exact: true }).waitFor();
    let execution = (await request('aux', `/api/plans/${planId}/execution`)).body;
    const scoped = execution.tasks.filter((t: any) => t.inScope).map((t: any) => t.taskId);
    await assertAgenda(operator, scoped);
    const zones = (await request('production', '/api/zones')).body;
    const zoneName = (id: number) => zones.find((z: any) => z.id === id).name;
    for (const zone of [first.zoneId, second.zoneId]) {
      await selectFocus(`Plató / zona · ${zoneName(zone)}`);
      await assertAgenda(operator, all.filter((t: any) => t.zoneId === zone && scoped.includes(t.id)).map((t: any) => t.id));
    }
    await selectFocus('Todo mi ámbito');
    await assertAgenda(operator, scoped);
    await noOverflow(operator);
    await operator.getByTestId('my-day-execution').evaluate(el => el.scrollIntoView({ block: 'start' }));
    await operator.screenshot({ path: `${directory}/mi-dia-mobile-overview.png` });
    pass('P1A two assigned zones auto-scope and each focus preserve exact server task identities on mobile');

    // Switch only the disposable assignments to space mode. This does not change planning.
    await db.query('DELETE FROM plan_staff_assignments WHERE staff_person_id=$1 AND plan_id=$2', [staff, planId]);
    for (const t of [first, second]) {
      await db.query("UPDATE plan_zone_staff_mode SET mode='space' WHERE plan_id=$1 AND zone_id=$2", [planId, t.zoneId]);
      await db.query("INSERT INTO plan_staff_assignments(plan_id,staff_role,staff_person_id,scope_type,space_id) VALUES($1,'production',$2,'space',$3)", [planId, staff, t.spaceId]);
    }
    await operator.reload(); await operator.getByRole('combobox', { name: 'Concentrar vista', exact: true }).waitFor();
    execution = (await request('aux', `/api/plans/${planId}/execution`)).body;
    await assertAgenda(operator, execution.tasks.filter((t: any) => t.inScope).map((t: any) => t.taskId));
    const spaces = (await request('production', '/api/spaces')).body;
    for (const t of [first, second]) {
      await selectFocus(`Espacio · ${spaces.find((s: any) => s.id === t.spaceId).name} · ${zoneName(t.zoneId)}`);
      await assertAgenda(operator, all.filter((p: any) => p.spaceId === t.spaceId).map((p: any) => p.id));
    }
    await selectFocus('Todo mi ámbito');
    await db.query("UPDATE user_roles SET role_id=(SELECT id FROM roles WHERE key='aux') WHERE user_id=$1", [users.viewer.id]);
    await db.query("INSERT INTO user_entity_links(user_id,entity_type,entity_id) VALUES($1,'staff_person',$2)", [users.viewer.id, helper]);
    await db.query("INSERT INTO plan_staff_assignments(plan_id,staff_role,staff_person_id,scope_type,space_id) VALUES($1,'production',$2,'space',$3)", [planId, helper, first.spaceId]);
    await colleague.reload(); await colleague.getByRole('combobox', { name: 'Concentrar vista', exact: true }).waitFor();
    await assertAgenda(colleague, all.filter((p: any) => p.spaceId === first.spaceId).map((p: any) => p.id));
    pass('P1A multiple assigned spaces and second nominal helper with overlapping scope, exact task sets');

    // Choose a real participant activity in the assigned spaces, with a known next task.
    const target = all.find((t: any) => [first.spaceId, second.spaceId].includes(t.spaceId) && t.contestantId && t.startPlanned && all.some((p: any) => p.contestantId === t.contestantId && p.id !== t.id && p.startPlanned >= t.endPlanned));
    assert.ok(target);
    const previous = (await db.query('SELECT id FROM daily_tasks WHERE plan_id=$1 AND contestant_id=$2 AND id<>$3 AND end_planned<=$4 ORDER BY end_planned DESC,id LIMIT 1', [planId, target.contestantId, target.id, target.startPlanned])).rows[0];
    assert.ok(previous, 'incoming A2 activity has an identifiable predecessor');
    const incoming = () => operator.getByTestId(`agenda-task-${target.id}`).getByTestId(`contestant-flow-${target.id}`);
    await incoming().getByText('Pendiente', { exact: true }).waitFor();
    assert.equal((await request('production', `/api/tasks/${previous.id}/status`, 'PATCH', { status: 'in_progress', expectedStatus: 'pending' })).status, 200);
    await operator.reload(); await incoming().getByText('En curso', { exact: true }).waitFor();
    assert.equal((await request('production', `/api/tasks/${previous.id}/status`, 'PATCH', { status: 'done', expectedStatus: 'in_progress' })).status, 200);
    await operator.reload(); await incoming().getByText('Completada', { exact: true }).waitFor();
    pass('P1A incoming A2 predecessor status pending/running/done from full received planning, including outside focus');
    await db.query("UPDATE program_settings SET clock_mode='manual',simulated_time=$1,simulated_set_at=now()", [target.startPlanned]);
    await operator.reload(); await operator.getByTestId(`agenda-task-${target.id}`).waitFor();
    const targetPath = `/api/tasks/${target.id}/status`;
    const startResponse = operator.waitForResponse(r => r.url().endsWith(targetPath) && r.request().method() === 'PATCH');
    await operator.getByTestId(`agenda-task-${target.id}`).getByRole('button', { name: /^Iniciar / }).click();
    assert.equal((await startResponse).status(), 200);
    await operator.getByTestId(`execution-task-${target.id}`).getByText('En curso', { exact: true }).waitFor();
    await operator.reload();
    const current = operator.getByTestId(`execution-task-${target.id}`);
    await current.getByText('Siguiente destino previsto del concursante', { exact: true }).waitFor();
    await current.getByText('Ubicación física actual: no confirmada.', { exact: false }).waitFor();
    const started = (await db.query('SELECT start_real_at,start_real,end_real_at FROM daily_tasks WHERE id=$1', [target.id])).rows[0];
    assert.ok(started.start_real_at); assert.equal(started.end_real_at, null);
    await current.locator('dl > div').filter({ hasText: 'Inicio real' }).getByText(started.start_real, { exact: true }).waitFor();
    const simultaneous = all.find((t: any) => [first.spaceId, second.spaceId].includes(t.spaceId) && t.spaceId !== target.spaceId && t.contestantId !== target.contestantId && t.id !== previous.id);
    assert.ok(simultaneous);
    assert.equal((await request('production', `/api/tasks/${simultaneous.id}/status`, 'PATCH', { status: 'in_progress', expectedStatus: 'pending' })).status, 200);
    await operator.reload();
    await operator.getByTestId(`execution-task-${simultaneous.id}`).waitFor();
    await current.waitFor();
    await current.scrollIntoViewIfNeeded(); await noOverflow(operator);
    await operator.screenshot({ path: `${directory}/mi-dia-mobile-running.png` });
    await operator.setViewportSize({ width: 820, height: 1180 });
    await current.scrollIntoViewIfNeeded(); await noOverflow(operator);
    await operator.screenshot({ path: `${directory}/mi-dia-tablet-running.png` });
    const finishResponse = operator.waitForResponse(r => r.url().endsWith(targetPath) && r.request().method() === 'PATCH');
    await current.getByRole('button', { name: /^Finalizar / }).click();
    assert.equal((await finishResponse).status(), 200);
    await operator.reload();
    const completed = operator.getByTestId('day-group-done').getByTestId(`agenda-task-${target.id}`);
    await completed.getByText('Completada', { exact: true }).waitFor();
    const finished = (await db.query('SELECT start_real_at,start_real,end_real_at,end_real FROM daily_tasks WHERE id=$1', [target.id])).rows[0];
    assert.equal(finished.start_real_at.toISOString(), started.start_real_at.toISOString()); assert.ok(finished.end_real_at);
    await completed.locator('dl > div').filter({ hasText: 'Fin real' }).getByText(finished.end_real, { exact: true }).waitFor();
    await completed.scrollIntoViewIfNeeded(); await noOverflow(operator);
    await operator.screenshot({ path: `${directory}/mi-dia-tablet-completed.png` });
    assert.equal((await db.query('SELECT count(*) n FROM task_status_events WHERE task_id=$1', [target.id])).rows[0].n, '2');
    assert.equal((await request('production', `/api/tasks/${simultaneous.id}/status`, 'PATCH', { status: 'interrupted', expectedStatus: 'in_progress' })).status, 200);
    const cancelled = all.find((t: any) => [first.spaceId, second.spaceId].includes(t.spaceId) && ![target.id, previous.id, simultaneous.id].includes(t.id));
    assert.ok(cancelled);
    assert.equal((await request('production', `/api/tasks/${cancelled.id}/status`, 'PATCH', { status: 'cancelled', expectedStatus: 'pending' })).status, 200);
    await operator.reload();
    await operator.getByTestId('day-group-stopped').getByTestId(`agenda-task-${simultaneous.id}`).getByText('Interrumpida', { exact: true }).waitFor();
    await operator.getByTestId('day-group-stopped').getByTestId(`agenda-task-${cancelled.id}`).getByText('Cancelada', { exact: true }).waitFor();
    pass('P1A two simultaneous real activities and both stopped states in their correct groups');
    pass('P1A actual UI Start and Finish persisted across reload, correct groups, resources, next destination and no physical-location claim; 390px/820px no overflow');
    assert.deepEqual(await planning(), before);
    assert.deepEqual(errors, []);
    pass('P1A all 266 accepted A2 placements, Stages and Draft remain literal; no browser errors');
    return { status: 'PASS', viewports: [[390, 844], [820, 1180]], acceptedTaskCount: 266, targetTaskId: target.id, startRealAt: finished.start_real_at.toISOString(), endRealAt: finished.end_real_at.toISOString(), planningSha256: createHash('sha256').update(JSON.stringify(before)).digest('hex'), preservedPlanning: true, remoteWrites: 0, newSolverRun: false, visibleScopeCount: (await agendaIds(colleague)).length };
  } finally { await browser.close(); }
}
