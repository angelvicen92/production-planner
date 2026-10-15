/** UI-01: real Chromium / disposable SQL, Auth and product HTTP.
 * Replays the existing historical accepted snapshot, not a new solver result.
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium, type Locator, type Page } from "playwright";
import type { runA2BrowserJourney } from "./smokeA2Journey";
type Options = Parameters<typeof runA2BrowserJourney>[0];

export async function runPlanningNavigation({ appUrl, users, db, directory, pass, planId }: Options) {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], ignoreDefaultArgs: ["--hide-scrollbars"], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(30_000); page.setDefaultNavigationTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const report: any = { status: "RUNNING", remoteWrites: 0, source: "historical accepted A2 snapshot", checks: [], screenshots: [] };
  const record = (name: string) => { report.checks.push(name); pass(name); };
  const tables = ["daily_tasks", "locks", "assisted_planning_sessions", "assisted_planning_stages", "planning_stage_validations", "planning_runs", "plan_config_revisions", "planning_accepted_exceptions"];
  const material = async () => Promise.all(tables.map(async table => (await db.query(`SELECT to_jsonb(x) AS row FROM public.${table} x ORDER BY id`)).rows));
  const panel = (view: string) => page.getByTestId(`planning-panel-${view}`);
  const ids = (view: string) => panel(view).locator("[data-planning-task-id]").evaluateAll(elements => [...new Set(elements.map(el => Number(el.getAttribute("data-planning-task-id"))))].sort((a, b) => a - b));
  const axes = (view: string) => panel(view).locator(".planning-panel").evaluate(el => [Number(el.getAttribute("data-zoom-x")), Number(el.getAttribute("data-zoom-y"))]);
  const rect = async (locator: Locator) => { const box = await locator.boundingBox(); assert.ok(box); return box; };
  const capture = async (name: string) => { await page.screenshot({ path: `${directory}/${name}.png` }); report.screenshots.push(`${name}.png`); };
  const near = (actual: number, expected: number, message: string, tolerance = 1.5) => assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} != ${expected}`);
  const open = async (id = planId) => {
    await page.goto(`${appUrl}/plans/${id}?tab=planning`);
    await page.getByTestId("planning-multiview").waitFor();
    await panel("contestants").waitFor();
  };
  const login = async (role: string) => {
    await page.goto(`${appUrl}/login`);
    await page.getByLabel("Email", { exact: true }).fill(users[role].email);
    await page.getByLabel("Contraseña (opcional para enlace)", { exact: true }).fill(users[role].password);
    await page.getByRole("button", { name: "Entrar con contraseña", exact: true }).click();
    await page.waitForURL("**/dashboard");
  };
  try {
    await login("production"); await open();
    const before = await material();
    const writes: string[] = [];
    const authBootstrapRequests: string[] = [], dayInitializationRequests: string[] = [];
    let initializingImportedDay = false;
    const audit = (target: Page) => target.on("request", request => {
      const path = new URL(request.url()).pathname, method = request.method();
      if (!path.startsWith("/api/") || ["GET", "HEAD", "OPTIONS"].includes(method)) return;
      const entry = `${method} ${path}`;
      // Authentication reboots on reload. Opening the untouched import creates
      // its first S0 once. Neither request is caused by a visual control; keep
      // both explicit in the evidence and audit all other mutations strictly.
      if (method === "POST" && path === "/api/bootstrap-role") authBootstrapRequests.push(entry);
      else if (initializingImportedDay && method === "POST" && path === "/api/plans/27002/assisted/session" && dayInitializationRequests.length === 0) dayInitializationRequests.push(entry);
      else writes.push(entry);
    });
    audit(page);
    report.requests = { visualMutations: writes, authBootstrap: authBootstrapRequests, dayInitialization: dayInitializationRequests };
    const expected = (await db.query("SELECT id FROM daily_tasks WHERE plan_id=$1 ORDER BY id", [planId])).rows.map(row => Number(row.id));
    assert.equal(expected.length, 266);
    assert.deepEqual(await ids("contestants"), expected);
    const contestants = panel("contestants"), spaces = panel("spaces");
    await contestants.scrollIntoViewIfNeeded();
    await capture("navigation-1440-initial");
    const lane = contestants.locator("[data-planning-lane]").first();
    const laneTime = lane.locator(":scope > div").last();
    const base = await rect(laneTime);
    await contestants.getByLabel("Eje del zoom", { exact: true }).selectOption("x");
    await contestants.getByRole("button", { name: "Ampliar zoom", exact: true }).click();
    near((await rect(laneTime)).width, base.width * 1.1, "X changes actual minute scale");
    near((await rect(laneTime)).height, base.height, "X preserves row height");
    await contestants.getByLabel("Eje del zoom", { exact: true }).selectOption("y");
    await contestants.getByRole("button", { name: "Ampliar zoom", exact: true }).click();
    near((await rect(laneTime)).height, base.height * 1.1, "Y changes row height");
    await contestants.getByLabel("Eje del zoom", { exact: true }).selectOption("linked");
    await contestants.getByRole("button", { name: "Ampliar zoom", exact: true }).click();
    const zoomBefore = await axes("contestants");
    near(zoomBefore[0], 121, "linked X"); near(zoomBefore[1], 121, "linked Y");
    assert.deepEqual(await ids("contestants"), expected);
    await page.reload(); await contestants.waitFor(); assert.deepEqual(await axes("contestants"), zoomBefore);
    await contestants.getByRole("button", { name: "Restaurar zoom al 100%", exact: true }).click();
    assert.deepEqual(await axes("contestants"), [100, 100]);
    record("independent X/Y and proportional linked zoom change real dimensions; reload/reset preserve identities");

    await contestants.getByLabel("Eje del zoom", { exact: true }).selectOption("y");
    for (let step = 0; step < 8; step++) await contestants.getByRole("button", { name: "Reducir zoom", exact: true }).click();
    const compact = await axes("contestants");
    near((await rect(lane)).height, base.height * compact[1] / 100 + 1, "labels do not impose a minimum row height at reduced Y zoom");
    await contestants.getByRole("button", { name: "Maximizar", exact: true }).click();
    await contestants.getByRole("button", { name: "Ajustar", exact: true }).click();
    const contestantFit = await contestants.locator(".planning-scroll-viewport").evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth, height: el.clientHeight, contentHeight: el.scrollHeight }));
    report.contestantFit = contestantFit;
    assert.ok(contestantFit.content <= contestantFit.width + 2 && contestantFit.contentHeight <= contestantFit.height + 2, `contestant fit contains all lanes: ${JSON.stringify(contestantFit)}`);
    assert.deepEqual(await ids("contestants"), expected);
    await contestants.getByRole("button", { name: "Restaurar zoom al 100%", exact: true }).click();
    await page.keyboard.press("Escape");
    record("reduced contestant Y zoom scales entire rows; fit contains every lane and obligation");

    await page.getByRole("button", { name: "Mostrar Platós y espacios", exact: true }).click();
    await page.getByRole("button", { name: "Distribución horizontal", exact: true }).click();
    const divider = page.getByRole("separator", { name: "Redimensionar paneles", exact: true });
    await divider.scrollIntoViewIfNeeded(); const dividerBox = await rect(divider);
    await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 180); await page.mouse.down();
    await page.mouse.move(dividerBox.x + dividerBox.width / 2 + 80, dividerBox.y + 180, { steps: 8 }); await page.mouse.up();
    const ratio = Number(await divider.getAttribute("aria-valuenow")); assert.ok(ratio > 50);
    await divider.focus(); await page.keyboard.press("ArrowLeft"); assert.equal(Number(await divider.getAttribute("aria-valuenow")), ratio - 2);
    const savedRatio = await divider.getAttribute("aria-valuenow");
    await contestants.evaluate(el => el.setAttribute("data-retained-probe", "original"));
    await spaces.getByRole("button", { name: "Mover Platós y espacios antes", exact: true }).click();
    assert.equal(await contestants.getAttribute("data-retained-probe"), "original", "reordering does not remount the panel");
    assert.ok((await rect(spaces)).x < (await rect(contestants)).x);
    await page.reload(); await spaces.waitFor();
    assert.equal(await divider.getAttribute("aria-valuenow"), savedRatio);
    assert.ok((await rect(spaces)).x < (await rect(contestants)).x);
    assert.deepEqual(await ids("contestants"), expected); assert.deepEqual(await ids("spaces"), expected);
    record("two panels resize by pointer and keyboard, swap and persist without losing tasks");

    await spaces.getByRole("button", { name: "Maximizar", exact: true }).click();
    const viewport = spaces.locator(".planning-scroll-viewport");
    assert.equal(await viewport.count(), 1);
    const verticalTask = spaces.locator("[data-planning-task-id]").first();
    const taskBase = await rect(verticalTask);
    await spaces.getByLabel("Eje del zoom", { exact: true }).selectOption("y");
    await spaces.getByRole("button", { name: "Ampliar zoom", exact: true }).click();
    near((await rect(verticalTask)).height, taskBase.height * 1.1, "spaces Y changes pixels/minute");
    near((await rect(verticalTask)).width, taskBase.width, "spaces Y preserves lane width");
    await spaces.getByLabel("Eje del zoom", { exact: true }).selectOption("x");
    await spaces.getByRole("button", { name: "Ampliar zoom", exact: true }).click();
    assert.ok((await rect(verticalTask)).width > taskBase.width);
    const geometry = await viewport.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const nested = [...el.querySelectorAll("*")].filter(child => { const css = getComputedStyle(child); return /(auto|scroll)/.test(`${css.overflowX} ${css.overflowY}`) && (child.scrollWidth > child.clientWidth || child.scrollHeight > child.clientHeight); });
      return { bottom: bounds.bottom, height: el.clientHeight, width: el.clientWidth, scrollHeight: el.scrollHeight, scrollWidth: el.scrollWidth, nested: nested.length };
    });
    assert.ok(geometry.bottom <= 900); assert.ok(geometry.scrollHeight > geometry.height); assert.ok(geometry.scrollWidth > geometry.width); assert.equal(geometry.nested, 0);
    report.geometry = geometry;
    await viewport.evaluate(el => { el.scrollTop = 320; el.scrollLeft = 120; });
    const top = (await rect(viewport)).y;
    near((await rect(spaces.locator(".planning-zone-heading").first())).y, top, "sticky zone heading", 3);
    near((await rect(spaces.locator(".planning-space-heading").first())).y, top + 76, "sticky lane heading", 3);
    await capture("navigation-spaces-fullscreen-sticky");
    await spaces.getByRole("button", { name: "Ajustar", exact: true }).click();
    const fitted = await viewport.evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth, height: el.clientHeight, contentHeight: el.scrollHeight }));
    report.fit = fitted;
    assert.ok(fitted.content <= fitted.width + 2, `fit contains every physical column within the viewport: ${JSON.stringify(fitted)}`);
    assert.ok(fitted.contentHeight <= fitted.height + 2, "fit contains the full day vertically");
    assert.deepEqual(await ids("spaces"), expected);
    await spaces.getByLabel("Encuadre", { exact: true }).selectOption("tasks"); assert.deepEqual(await ids("spaces"), expected);
    await spaces.getByLabel("Encuadre", { exact: true }).selectOption("day");
    await spaces.getByRole("button", { name: "Restaurar zoom al 100%", exact: true }).click();
    await page.keyboard.press("Escape");
    record("spaces: single two-axis viewport, accessible horizontal scroll, aligned sticky headings, real zoom and fit");

    // Select a task with room to move, after resize and independent zoom. A drag
    // stages only a local edit. SQL and accepted/proposal authorities stay literal.
    await contestants.getByRole("button", { name: "Maximizar", exact: true }).click();
    await contestants.getByLabel("Eje del zoom", { exact: true }).selectOption("x");
    await contestants.getByRole("button", { name: "Ampliar zoom", exact: true }).click();
    const candidate = (await db.query("SELECT id,start_planned,end_planned FROM daily_tasks WHERE plan_id=$1 AND contestant_id IS NOT NULL AND status='pending' AND start_planned >= '10:00' AND end_planned <= '18:00' ORDER BY id LIMIT 1", [planId])).rows[0];
    assert.ok(candidate);
    const card = contestants.locator(`[data-planning-task-id="${candidate.id}"]`).first(); await card.scrollIntoViewIfNeeded();
    await card.click();
    assert.equal(await page.getByText("0 movimientos pendientes en las vistas", { exact: true }).count(), 1, "a click never stages a move");
    const cardBox = await rect(card), original = await card.getAttribute("data-planning-start");
    const scale = await card.evaluate(el => { const [h,m] = el.getAttribute("data-planning-start")!.split(":").map(Number); return { start: h*60+m, parentWidth: el.parentElement!.getBoundingClientRect().width }; });
    const duration = Number(String(candidate.end_planned).slice(0,2))*60+Number(String(candidate.end_planned).slice(3,5))-scale.start;
    const fiveMinutesPx = cardBox.width / duration * 5;
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2); await page.mouse.down();
    await page.mouse.move(cardBox.x + cardBox.width / 2 + fiveMinutesPx, cardBox.y + cardBox.height / 2, { steps: 8 }); await page.mouse.up();
    await page.getByText("1 movimientos pendientes en las vistas", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Planning aceptado · ejecución", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Validar borrador", exact: true }).isDisabled(), true);
    const moved = await card.getAttribute("data-planning-start"); assert.notEqual(moved, original);
    const mins = (time: string) => Number(time.slice(0,2))*60+Number(time.slice(3,5)); near(mins(moved!), mins(original!) + 5, "drag snaps to five real minutes", .01);
    await page.keyboard.press("Escape");
    await spaces.getByRole("button", { name: "Mover Platós y espacios después", exact: true }).click();
    assert.equal(await card.getAttribute("data-planning-start"), moved);
    assert.equal(await spaces.locator(`[data-planning-task-id="${candidate.id}"]`).first().getAttribute("data-planning-start"), moved);
    await page.getByRole("button", { name: "Descartar movimientos", exact: true }).click();
    assert.equal(await card.getAttribute("data-planning-start"), original);
    await page.getByRole("button", { name: "Planning aceptado · ejecución", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Aplicar movimientos al borrador", exact: true }).count(), 0);
    assert.deepEqual(await ids("contestants"), expected);
    await page.getByRole("button", { name: "Edición del borrador", exact: true }).click();
    record("zoomed drag moves exactly five minutes; shared local edit survives reorder and discards without SQL writes");

    await spaces.getByRole("button", { name: "Filtros", exact: true }).click();
    await spaces.getByRole("checkbox", { name: "Ocultar vacíos", exact: true }).check();
    assert.deepEqual(await ids("spaces"), expected, "scheduled hideEmpty keeps every obligation, including virtual lanes");
    await spaces.getByRole("button", { name: "Filtros", exact: true }).click();
    await page.getByRole("button", { name: "Mostrar Recursos", exact: true }).click();
    const resources = panel("resources"); const resourceIds = await ids("resources");
    assert.ok(resourceIds.length > 0 && resourceIds.every(id => expected.includes(id)));
    await resources.getByRole("button", { name: "Maximizar", exact: true }).click();
    await resources.getByRole("button", { name: "Ampliar zoom", exact: true }).click();
    assert.deepEqual(await ids("resources"), resourceIds);
    assert.equal(await resources.locator(".planning-scroll-viewport").count(), 1);
    await page.keyboard.press("Escape");
    await resources.getByRole("button", { name: "Mover Recursos antes", exact: true }).click();
    assert.deepEqual(await ids("resources"), resourceIds);
    await page.setViewportSize({ width: 1920, height: 1080 }); await contestants.scrollIntoViewIfNeeded(); await capture("navigation-three-panels");
    await page.getByRole("button", { name: "Mostrar Recursos", exact: true }).click();
    record("scheduled hideEmpty and resource agenda retain identities across zoom, three panels and accepted/draft navigation");

    for (const size of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size); await contestants.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (size.width === 390) { assert.equal(await divider.isVisible(), false); assert.ok((await rect(spaces)).y > (await rect(contestants)).y); }
      await capture(`navigation-${size.width}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.deepEqual(await material(), before, "all tasks, snapshots, Stages, locks, runs and config remain literal");
    record("desktop 1440/1920 and mobile 390: no document overflow; all SQL authorities unchanged");

    // Untouched imported 27002 has all 266 obligations and no schedules.
    assert.deepEqual(writes, [], "visual navigation sends no mutating product requests");
    initializingImportedDay = true;
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/plans/27002/assisted/session" && response.request().method() === "POST" && response.ok()),
      open(27002),
    ]);
    initializingImportedDay = false;
    assert.deepEqual(dayInitializationRequests, ["POST /api/plans/27002/assisted/session"]);
    const afterOpen = await material();
    const unscheduled = (await db.query("SELECT id,space_id,zone_id,start_planned,end_planned FROM daily_tasks WHERE plan_id=27002")).rows;
    assert.equal(unscheduled.length, 266); assert.ok(unscheduled.every(task => !task.start_planned && !task.end_planned));
    await page.getByRole("button", { name: "Mostrar Platós y espacios", exact: true }).click();
    await spaces.getByRole("button", { name: "Filtros", exact: true }).click();
    const allOptions = await spaces.locator(".planning-filters label").allTextContents();
    const catalog = (await db.query("SELECT id,name,zone_id FROM spaces")).rows;
    const occupied = new Set(unscheduled.filter(task => task.space_id != null).map(task => Number(task.space_id)));
    const unused = catalog.find(space => !occupied.has(Number(space.id)));
    assert.ok(unused);
    const label = allOptions.find(name => name.trim().endsWith(`/ ${unused.name}`)); assert.ok(label);
    await spaces.getByRole("checkbox", { name: label.trim(), exact: true }).check();
    await spaces.getByRole("checkbox", { name: "Ocultar vacíos", exact: true }).check();
    assert.equal(await spaces.getByRole("checkbox", { name: label.trim(), exact: true }).count(), 0);
    assert.equal(await spaces.getByRole("button", { name: "Filtros", exact: true }).count(), 1, "hidden selection reconciles immediately");
    const names = (await spaces.locator(".planning-filters label").allTextContents()).map(name => name.trim());
    for (const space of catalog) assert.equal(names.some(name => name.endsWith(`/ ${space.name}`)), occupied.has(Number(space.id)), `${space.name}: membership is assignment, never startPlanned`);
    await spaces.scrollIntoViewIfNeeded(); await capture("navigation-unscheduled-hide-empty");
    await spaces.getByRole("checkbox", { name: "Ocultar vacíos", exact: true }).uncheck();
    await spaces.getByRole("checkbox", { name: "Ocultar vacíos", exact: true }).check();
    assert.deepEqual(await material(), afterOpen);
    record("27002: all 266 unscheduled obligations retain assigned spaces; empty catalog choices and stale selection disappear");
    assert.deepEqual(writes, [], "visual navigation sends no mutating product requests");
    const readonlyBefore = await material();
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const viewer = await touchContext.newPage(); viewer.setDefaultNavigationTimeout(120_000); viewer.setDefaultTimeout(30_000);
    viewer.on("pageerror", error => errors.push(error.message));
    await viewer.goto(`${appUrl}/login`);
    await viewer.getByLabel("Email", { exact: true }).fill(users.viewer.email);
    await viewer.getByLabel("Contraseña (opcional para enlace)", { exact: true }).fill(users.viewer.password);
    await viewer.getByRole("button", { name: "Entrar con contraseña", exact: true }).click(); await viewer.waitForURL("**/dashboard");
    await viewer.goto(`${appUrl}/plans/${planId}?tab=planning`);
    const readonlyPanel = viewer.getByTestId("planning-panel-contestants"); await readonlyPanel.waitFor();
    audit(viewer);
    assert.equal(await viewer.getByRole("button", { name: "Aplicar movimientos al borrador", exact: true }).count(), 0);
    assert.deepEqual(await readonlyPanel.locator(".planning-panel").evaluate(el => [Number(el.getAttribute("data-zoom-x")), Number(el.getAttribute("data-zoom-y"))]), [100, 100], "preferences are isolated by user and day");
    await readonlyPanel.getByRole("button", { name: "Ampliar zoom", exact: true }).tap();
    await readonlyPanel.getByRole("button", { name: "Maximizar", exact: true }).tap();
    const readonlyScroll = readonlyPanel.locator(".planning-scroll-viewport"); const touchBox = await rect(readonlyScroll);
    const cdp = await touchContext.newCDPSession(viewer);
    const x = touchBox.x + touchBox.width - 25, y = touchBox.y + touchBox.height - 50;
    // Separate gestures exercise both axes even when Chromium locks a gesture
    // to its dominant direction, as a physical touch device does.
    for (const delta of [{ x: 20, y: 0 }, { x: 0, y: 25 }]) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - step * delta.x, y: y - step * delta.y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    await viewer.waitForFunction(() => { const el = document.querySelector(".planning-scroll-viewport"); return el && el.scrollTop > 0 && el.scrollLeft > 0; });
    await viewer.screenshot({ path: `${directory}/navigation-viewer-touch.png` }); report.screenshots.push("navigation-viewer-touch.png");
    await touchContext.close();
    assert.deepEqual(await material(), readonlyBefore);
    assert.deepEqual(writes, [], "production and viewer visual controls send no mutating product requests");
    record("viewer can zoom and pan both axes by real touch; isolated preferences and unchanged SQL authorities");
    assert.deepEqual(errors, []);
    report.status = "PASS"; return report;
  } catch (error) { report.status = "FAIL"; report.error = error instanceof Error ? error.stack : String(error); await capture("navigation-failure").catch(() => {}); throw error; }
  finally { writeFileSync(`${directory}/planning-navigation.json`, JSON.stringify(report, null, 2)); await browser.close(); }
}
