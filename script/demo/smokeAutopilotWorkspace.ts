/** Real HTTP/Assisted + Chromium; run only inside smokeA2Integration's owned DB. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import type pg from "pg";

export async function runAutopilotWorkspace({ appUrl, users, planId, directory, db, pass }: {
  appUrl: string; users: Record<string, { id: string; email: string; password: string }>;
  planId: number; directory: string; db: pg.Client; pass: (message: string) => void;
}) {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  const report: any = { mode: "REAL_DISPOSABLE_HTTP_ASSISTED_CHROMIUM", planId, checkpoints: [], authorityHttp: [], lifecycle: [], errors };
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path === '/api/me/role' || path.endsWith('/assisted/accept-stage')) report.authorityHttp.push({ path, status: response.status() });
  });
  const save = () => writeFileSync(`${directory}/autopilot-workspace.json`, JSON.stringify(report, null, 2));
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) report.lifecycle.push({ event: 'navigation', at: new Date().toISOString(), path: new URL(frame.url()).pathname }); });
  page.on('console', message => { if (message.text().startsWith('[vite]')) report.lifecycle.push({ event: 'vite', at: new Date().toISOString(), message: message.text().slice(0, 200) }); });
  page.on("pageerror", e => errors.push(e.message));
  let confirm = false;
  page.on("dialog", d => { void (confirm ? d.accept() : d.dismiss()); });
  try {
    await page.goto(`${appUrl}/login`);
    await page.getByLabel("Email", { exact: true }).fill(users.production.email);
    await page.getByLabel("Contraseña (opcional para enlace)", { exact: true }).fill(users.production.password);
    await page.getByRole("button", { name: "Entrar con contraseña", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page.goto(`${appUrl}/plans/${planId}?tab=planning`);
    const workspace = page.getByTestId("planning-multiview");
    const start = page.getByRole("button", { name: "Completar automáticamente", exact: true });
    await start.waitFor();
    const visualWrites: string[] = [];
    const recordWrite = (request: import("playwright").Request) => {
      if (!["GET", "OPTIONS"].includes(request.method()) && request.url().includes("/api/")) visualWrites.push(new URL(request.url()).pathname);
    };
    page.on("request", recordWrite);
    await page.getByRole("button", { name: "Mostrar Platós y espacios", exact: true }).click();
    await page.getByRole("button", { name: "Distribución horizontal", exact: true }).click();
    const panels = workspace.locator(".planning-panel");
    await panels.first().getByRole("button", { name: "Reducir zoom", exact: true }).click();
    const preferences = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("optiplan:workspace:"))));
    const before = await preferences();
    await start.click();
    assert.equal(await workspace.getAttribute("data-workspace-fullscreen"), "false", "cancelled consent does not maximize");
    assert.deepEqual(visualWrites, [], "visual preferences and cancelled consent make no operational writes");
    report.visualWrites = visualWrites.length;
    page.off("request", recordWrite);
    confirm = true;
    await start.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="planning-multiview"]')?.getAttribute("data-workspace-fullscreen") === "true");
    await workspace.getByRole("progressbar").waitFor();
    assert.deepEqual(await preferences(), before);
    assert.equal(await workspace.getByRole("progressbar").count(), 1);
    assert.equal(await page.getByRole("progressbar").count(), 1);
    const header = await workspace.getByTestId("assisted-autopilot").boundingBox();
    assert.ok(header && header.height <= 115, `Autopilot header should remain compact: ${header?.height}px`);
    const panes = await workspace.locator(".planning-panes").boundingBox();
    assert.ok(header && panes && header.y + header.height <= panes.y && panes.height > 200);
    await page.keyboard.press("Escape");
    assert.equal(await workspace.getAttribute("data-workspace-fullscreen"), "false");
    assert.ok(await page.getByRole("button", { name: "Detener al terminar la etapa", exact: true }).isVisible());
    // Separate simulated cache-error case; HTTP/Assisted is never intercepted.
    await workspace.evaluate(el => { (el as HTMLElement).dataset.mountProbe = "retained"; });
    await page.evaluate(async id => {
      const modulePath = "/src/lib/queryClient.ts";
      const { queryClient } = await import(/* @vite-ignore */ modulePath);
      const query = queryClient.getQueryCache().find({ queryKey: [`/api/plans/${id}`] });
      query.setState({ status: "error", error: new DOMException("simulated background timeout", "AbortError"), fetchStatus: "idle" });
    }, planId);
    await page.getByText("Reconectando con el plan. Se conserva la última planificación confirmada.", { exact: true }).waitFor();
    assert.equal(await workspace.getAttribute("data-mount-probe"), "retained", "recoverable cache error does not remount Assisted");
    report.simulatedCacheTimeout = "retained workspace and controller; subsequent real HTTP Stages must complete";
    // Fault injection only for one role reconfirmation: withhold transport while
    // the real Stage runs. Auth, Assisted HTTP and PostgreSQL remain real;
    // apiRequest must reach its unchanged ordinary 20s timeout deterministically.
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-testid="assisted-autopilot-technical"] pre');
      return node?.textContent && JSON.parse(node.textContent).runId;
    });
    await page.route('**/api/me/role', () => {});
    report.roleTimeout = await page.evaluate(async () => {
      const modulePath = '/src/lib/queryClient.ts';
      const { queryClient } = await import(/* @vite-ignore */ modulePath);
      await queryClient.refetchQueries({ queryKey: ['/api/me/role'] });
      const query = queryClient.getQueryCache().find({ queryKey: ['/api/me/role'], exact: false });
      return { role: query.state.data?.role, status: query.state.status, error: query.state.error?.name };
    });
    await page.unroute('**/api/me/role');
    report.roleTimeout.mode = 'WITHHELD_ROLE_TRANSPORT_EXISTING_20S_TIMEOUT';
    assert.equal(report.roleTimeout.error, 'AbortError', 'ordinary role refresh must abort through the existing HTTP timeout');
    assert.equal(report.roleTimeout.role, 'production', 'same authenticated actor retains confirmed authority on transport timeout');
    pass('withheld role GET aborts during real generation without losing confirmed production authority');
    let previous = 0, previousStage = 0;
    for (let stage = 1; stage <= 3; stage++) {
      await page.waitForFunction(expected => {
        const node = document.querySelector('[data-testid="assisted-autopilot-technical"] pre');
        if (!node?.textContent) return false;
        const p = JSON.parse(node.textContent);
        return p.stage >= expected || p.phase === "FAILED";
      }, previousStage + 1, { timeout: 600_000 });
      const progress = JSON.parse((await workspace.getByTestId("assisted-autopilot-technical").locator("pre").textContent())!);
      assert.notEqual(progress.phase, "FAILED", JSON.stringify(progress));
      assert.ok(progress.completed > previous);
      previous = progress.completed;
      previousStage = progress.stage;
      const cards = await workspace.locator("[data-planning-task-id][data-planning-start]").evaluateAll(nodes => [...new Set(nodes.filter(n => n.getAttribute("data-planning-start")).map(n => Number(n.getAttribute("data-planning-task-id"))))].sort((a, b) => a - b));
      const accepted = (await db.query("SELECT snapshot_json FROM assisted_planning_stages WHERE plan_id=$1 AND ordinal=$2 ORDER BY id DESC LIMIT 1", [planId, progress.stage])).rows[0].snapshot_json;
      const acceptedIds = accepted.tasks.filter((t: any) => t.startPlanned && t.endPlanned).map((t: any) => t.taskId);
      assert.ok(cards.length > 0, "actual planning cards appear after acceptance");
      assert.ok(cards.every(id => acceptedIds.includes(id)), "no unaccepted placements in the rendered views");
      assert.equal(acceptedIds.length, progress.completed);
      report.checkpoints.push({ stage: progress.stage, completed: progress.completed, renderedTaskIds: cards, acceptedTaskIds: acceptedIds }); save();
      if (stage === 1) {
        assert.equal(await workspace.getAttribute("data-workspace-fullscreen"), "false", "no automatic reentry after Escape");
        await page.getByRole("button", { name: "Maximizar conjunto", exact: true }).click();
      }
      if (stage === 2) {
        assert.deepEqual(await preferences(), before);
        assert.equal(await page.getByText("movimientos pendientes en las vistas", { exact: false }).count(), 0);
        await page.screenshot({ path: `${directory}/autopilot-workspace-desktop.png` });
        await page.setViewportSize({ width: 390, height: 844 });
        const mobilePanes = await workspace.locator(".planning-panes").boundingBox();
        assert.ok(mobilePanes && mobilePanes.height > 150);
        assert.equal(await workspace.getByRole("progressbar").count(), 1);
        // Preserve the configured zoom; pan to an accepted task as an operator would.
        const mobileTask = workspace.locator("[data-planning-task-id][data-planning-start]").first();
        await mobileTask.scrollIntoViewIfNeeded();
        assert.ok(await mobileTask.isVisible());
        await page.screenshot({ path: `${directory}/autopilot-workspace-mobile.png` });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
    }
    await page.getByRole("button", { name: "Detener al terminar la etapa", exact: true }).click();
    await page.waitForFunction(() => ["STOPPED", "COMPLETE", "FAILED"].includes(document.querySelector('[data-testid="assisted-autopilot-progress"]')?.getAttribute("data-phase") ?? ""), undefined, { timeout: 600_000 });
    const terminal = JSON.parse((await workspace.getByTestId("assisted-autopilot-technical").locator("pre").textContent())!);
    assert.notEqual(terminal.phase, "FAILED", JSON.stringify(terminal));
    assert.equal(await workspace.getAttribute("data-workspace-fullscreen"), "true");
    report.terminal = terminal;
    // Revoke in the owned disposable DB immediately before the next real accept.
    // Keep the client's cached production deliberately stale to prove backend authority.
    assert.equal(db.host, '127.0.0.1');
    let rejectedBody: any;
    let acceptanceBefore: unknown;
    let cachedRole: unknown;
    const acceptanceState = async () => (await db.query(`SELECT
      (SELECT jsonb_agg(s ORDER BY id) FROM assisted_planning_stages s WHERE plan_id=$1) stages,
      (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t WHERE plan_id=$1) tasks`, [planId])).rows;
    const setRole = async (role: string) => db.query('UPDATE user_roles SET role_id=(SELECT id FROM roles WHERE key=$2) WHERE user_id=$1', [users.production.id, role]);
    const acceptUrl = `**/api/plans/${planId}/assisted/accept-stage`;
    await page.route(acceptUrl, async route => {
      rejectedBody = route.request().postDataJSON();
      acceptanceBefore = await acceptanceState();
      cachedRole = await page.evaluate(async () => {
        const modulePath = '/src/lib/queryClient.ts';
        const { queryClient } = await import(/* @vite-ignore */ modulePath);
        return queryClient.getQueryCache().find({ queryKey: ['/api/me/role'], exact: false }).state.data?.role;
      });
      await setRole('viewer');
      await route.continue();
    });
    try {
      const rejected = page.waitForResponse(r => new URL(r.url()).pathname === `/api/plans/${planId}/assisted/accept-stage` && r.request().method() === 'POST', { timeout: 600_000 });
      await start.click();
      assert.equal((await rejected).status(), 403, 'real backend denies revoked production despite stale client cache');
      await page.waitForFunction(() => document.querySelector('[data-testid="assisted-autopilot-progress"]')?.getAttribute('data-phase') === 'FAILED');
      assert.equal(cachedRole, 'production');
      assert.deepEqual(await acceptanceState(), acceptanceBefore, 'denied acceptance cannot create a Stage or change accepted task rows');
      report.roleRevocation = { from: 'production', to: 'viewer', cachedRole, httpStatus: 403, acceptedStatePreserved: true };
      save(); pass('real production→viewer revocation during Autopilot denies accept-stage with 403 and preserves accepted state');
    } finally { await setRole('production'); await page.unroute(acceptUrl); }
    // Explicit restoration is confirmed over HTTP before accepting the same draft.
    await page.evaluate(async body => {
      const modulePath = '/src/lib/api.ts';
      const { apiRequest } = await import(/* @vite-ignore */ modulePath);
      const role = await apiRequest('GET', '/api/me/role');
      if (role.role !== 'production') throw new Error('restored production role not confirmed');
      await apiRequest('POST', body.path, body.input);
    }, { path: `/api/plans/${planId}/assisted/accept-stage`, input: rejectedBody });
    await page.reload(); await start.waitFor();
    await page.getByTestId('planning-multiview').getByTestId('assisted-autopilot').waitFor();
    report.reloadBeforeResume = true;
    // A fresh confirmed start resumes the accepted checkpoint and completes.
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "Completar automáticamente" && !b.disabled));
    await start.click();
    await page.waitForFunction(() => ["COMPLETE", "FAILED"].includes(document.querySelector('[data-testid="assisted-autopilot-progress"]')?.getAttribute("data-phase") ?? ""), undefined, { timeout: 1_200_000 });
    const final = JSON.parse((await workspace.getByTestId("assisted-autopilot-technical").locator("pre").textContent())!);
    assert.equal(final.phase, "COMPLETE", JSON.stringify(final));
    assert.equal(final.completed, final.total);
    assert.equal(await workspace.getByRole("progressbar").getAttribute("aria-valuenow"), "100");
    assert.equal(await workspace.getAttribute("data-workspace-fullscreen"), "true");
    await page.screenshot({ path: `${directory}/autopilot-workspace-complete.png` });
    report.final = final;
    report.acceptedStages = (await db.query('SELECT ordinal,snapshot_fingerprint FROM assisted_planning_stages WHERE plan_id=$1 ORDER BY ordinal', [planId])).rows;
    // Validate a one-view presentation on the user's reported 1909x935 display.
    // A manual re-maximization reuses the same transient one-shot fit signal.
    await workspace.getByRole("button", { name: "Mostrar Platós y espacios", exact: true }).click();
    await page.setViewportSize({ width: 1909, height: 935 });
    await page.getByRole("button", { name: "Restaurar conjunto (Esc)", exact: true }).click();
    await page.getByRole("button", { name: "Maximizar conjunto", exact: true }).click();
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="planning-panel-contestants"]');
      return panel && Number(panel.querySelector('.planning-panel')?.getAttribute('data-zoom-x')) > 105;
    });
    const geometry = await workspace.getByTestId("planning-panel-contestants").evaluate(panel => {
      const viewport = panel.querySelector<HTMLElement>(".planning-scroll-viewport")!;
      const rows = [...panel.querySelectorAll<HTMLElement>("[data-planning-lane]")];
      const header = document.querySelector<HTMLElement>('[data-testid="assisted-autopilot"]')!;
      return { rows: rows.length, viewportHeight: viewport.clientHeight, contentHeight: viewport.scrollHeight,
        viewportWidth: viewport.clientWidth, contentWidth: viewport.scrollWidth,
        headerHeight: Math.round(header.getBoundingClientRect().height),
        zoomX: Number(panel.querySelector('.planning-panel')?.getAttribute('data-zoom-x')),
        zoomY: Number(panel.querySelector('.planning-panel')?.getAttribute('data-zoom-y')) };
    });
    report.oneView1909x935 = geometry;
    await page.screenshot({ path: `${directory}/autopilot-workspace-one-view-1909.png` });
    assert.equal(geometry.rows, 19, "every contestant lane must remain rendered");
    assert.ok(geometry.contentHeight <= geometry.viewportHeight + 22, `vertical clipping: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.contentWidth <= geometry.viewportWidth + 22, `horizontal clipping: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.contentWidth >= geometry.viewportWidth * 0.84, `unused width: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.headerHeight <= 115, `header not compact: ${JSON.stringify(geometry)}`);
    await workspace.getByRole("button", { name: "Mostrar Platós y espacios", exact: true }).click();
    await page.getByRole("button", { name: "Restaurar conjunto (Esc)", exact: true }).click();
    assert.equal(await workspace.getAttribute("data-workspace-fullscreen"), "false");
    assert.deepEqual(await preferences(), before);
    assert.deepEqual(errors, []);
    report.status = "PASS"; save();
    pass("Autopilot: real accepted stages rendered progressively, single header, preferences, Escape, stop/resume and complete maximized");
    return report;
  } catch (error) {
    report.status = "FAIL"; report.error = String(error);
    report.failureProgress = await page.getByTestId('assisted-autopilot-technical').textContent({ timeout: 1000 }).catch(() => null);
    report.failureRoles = await page.evaluate(async () => {
      const modulePath = '/src/lib/queryClient.ts';
      const { queryClient } = await import(/* @vite-ignore */ modulePath);
      return queryClient.getQueryCache().findAll({ queryKey: ['/api/me/role'] }).map((q: any) => ({ key: q.queryKey, role: q.state.data?.role, status: q.state.status, error: q.state.error?.name }));
    }).catch(() => null);
    await page.screenshot({ path: `${directory}/autopilot-workspace-failure.png` }).catch(() => {}); save(); throw error;
  }
  finally { await browser.close(); }
}
