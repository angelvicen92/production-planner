/** Read-only UI rehearsal on the real persisted A2 Stage produced by the existing
 * journey. All view/sort clicks use browser events and must preserve SQL material. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import type { Page } from "playwright";
import type { runA2BrowserJourney } from "./smokeA2Journey";

type Options = Parameters<typeof runA2BrowserJourney>[0];
export async function runA2ViewsHistoryJourney(options: Options, page: Page) {
  const { appUrl, users, planId, db, directory, pass } = options;
  // Start this independent lazy-history scenario closed, even after a prior
  // journey has persisted an open preference. Reload resets its query cache.
  await page.evaluate(dayId => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("optiplan:day-section:v1:") && key.endsWith(`:${dayId}:assisted-history`)) localStorage.removeItem(key);
  }, planId);
  await page.reload();
  await page.getByTestId("assisted-workspace").waitFor();
  const path = `/api/plans/${planId}/assisted`;
  const api = async (suffix: string, role = "production") => {
    const response = await fetch(`${appUrl}${suffix}`, { headers: role === "anon" ? {} : { Authorization: `Bearer ${users[role].token}` } });
    return { status: response.status, data: await response.json() as any };
  };
  // Exercise the untouched import and actual display policy. No catalog repair
  // or index writes are allowed to make the renderer pass.
  const material = async () => {
    const result: unknown[] = [];
    for (const table of ["daily_tasks", "locks", "assisted_planning_sessions", "assisted_planning_stages", "planning_stage_validations", "planning_runs", "plan_config_revisions", "planning_accepted_exceptions"])
      result.push((await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') AS rows FROM public.${table} x WHERE plan_id=$1`, [planId])).rows[0].rows);
    return result;
  };
  const before = await material();
  // Regression: Legacy Reset used to clear daily_tasks behind an accepted
  // Assisted S10, leaving the Stage and operating day inconsistent.
  for (const mode of ["partial", "total"] as const) {
    const denied = await fetch(`${appUrl}/api/plans/${planId}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${users.production.token}` },
      body: JSON.stringify({ mode }),
    });
    assert.equal(denied.status, 409, `Legacy ${mode} reset must not alter an active Assisted session`);
    assert.equal((await denied.json()).code, "ASSISTED_SESSION_RESET_REQUIRED");
  }
  assert.deepEqual(await material(), before, "denied Legacy resets must preserve tasks, Stages, runs and revisions");
  pass("Legacy partial/total reset is blocked on active Assisted session, without any SQL writes");
  const initial = (await api(path)).data, live = (await api(`/api/plans/${planId}`)).data;
  assert.equal(initial.draft.tasks.length, 266);
  assert.equal(initial.draft.tasks.filter((task: any) => task.startPlanned && task.endPlanned).length, 266);
  const report: any = { status: "RUNNING", stageOrdinal: initial.activeStage.ordinal, stageId: initial.activeStage.id, fingerprint: initial.draftFingerprint, views: [], sorts: [], roles: [], remoteWrites: 0 };
  const requests: Array<{ method: string; url: string }> = [];
  const observe = (request: any) => { if (request.url().includes("/api/")) requests.push({ method: request.method(), url: request.url() }); };
  page.on("request", observe);
  const save = () => writeFileSync(`${directory}/views-history.json`, JSON.stringify(report, null, 2));
  const ids = () => page.getByTestId("assisted-workspace").locator("[data-planning-task-id]").evaluateAll(elements => [...new Set(elements.map(el => Number(el.getAttribute("data-planning-task-id"))))].sort((a, b) => a - b));
  const expectedIds = initial.draft.tasks.map((task: any) => Number(task.taskId)).sort((a: number, b: number) => a - b);
  const assertAll = async (view: string) => {
    await page.waitForFunction(() => new Set([...document.querySelectorAll('[data-testid="assisted-workspace"] [data-planning-task-id]')].map(el => el.getAttribute("data-planning-task-id"))).size === 266);
    assert.deepEqual(await ids(), expectedIds, `${view} keeps all 266 task identities`);
    report.views.push({ view, tasks: 266 });
  };
  try {
    await page.goto(`${appUrl}/plans/${planId}?tab=planning`);
    const workspace = page.getByTestId("assisted-workspace"); await workspace.waitFor();
    await assertAll("contestants default");
    await workspace.getByTestId('anchored-operations').locator('summary').click();
    const composed=workspace.getByTestId('anchored-operation');assert.equal(await composed.count(),3);
    for(const item of await composed.all()){assert.match(await item.innerText(),/45 min/);assert.match(await item.innerText(),/Ensayo incluido 15 min/);assert.match(await item.innerText(),/1 operación/);}
    report.composedOperations={logical:3,technicalObligations:9,operationMinutes:45,anchorMinutes:15,additionalOccupancy:false};
    await workspace.getByTestId('anchored-operations').locator('summary').click();
    assert.equal(requests.filter(r => r.url.endsWith("/history/timings")).length, 0, "history is lazy");
    requests.length = 0; // Login/role bootstrap precedes the visual-action audit.
    const contestants = (await db.query("SELECT id,name FROM public.contestants WHERE plan_id=$1", [planId])).rows;
    const laneOrder = () => workspace.locator("[data-planning-lane]").evaluateAll(elements => elements.map(el => el.getAttribute("data-planning-lane")));
    const byName = contestants.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => String(c.id));
    if (live.dailyTasks.some((task: any) => task.contestantId == null)) byName.push("none");
    assert.deepEqual(await laneOrder(), byName);
    const templates: any[] = [];
    for (const kind of ["IN", "Croma", "Ensayo"]) {
      const task = live.dailyTasks.find((t: any) => t.contestantId != null && (kind === "IN" ? /^IN(?:_|\b)/i.test(String(t.template?.name ?? "")) : String(t.template?.name ?? "").toLowerCase().includes(kind.toLowerCase())));
      if (task && !templates.some(t => Number(t.templateId) === Number(task.templateId))) templates.push(task);
    }
    assert.ok(templates.length >= 2, "exercise multiple real A2 task templates");
    for (const target of templates) {
      await workspace.getByRole("button", { name: "Orden por tarea", exact: true }).click();
      // This actual click dispatches pointerdown/up/click while assisted-draft
      // forces manualMode=true. It must never start an editing drag.
      await workspace.locator(`[data-planning-task-id="${target.id}"]`).first().click();
      await workspace.getByText(`Orden actual: Tarea → ${target.template.name}`, { exact: true }).waitFor();
      const earliest = (id: number) => {
        const starts = live.dailyTasks.filter((task: any) => Number(task.contestantId) === id && Number(task.templateId) === Number(target.templateId) && task.startPlanned).map((task: any) => task.startPlanned).sort();
        return starts[0] ?? null;
      };
      const expected = contestants.slice().sort((a, b) => {
        const left = earliest(Number(a.id)), right = earliest(Number(b.id));
        return left != null && right != null ? left.localeCompare(right) || a.name.localeCompare(b.name) : left != null ? -1 : right != null ? 1 : a.name.localeCompare(b.name);
      }).map(c => String(c.id));
      if (byName.includes("none")) expected.push("none");
      assert.deepEqual(await laneOrder(), expected);
      await assertAll(`contestants sorted by ${target.template.name}`);
      await workspace.getByText("0 movimientos pendientes", { exact: true }).waitFor();
      assert.equal(await workspace.getByRole("button", { name: "Aplicar edición", exact: true }).isDisabled(), true);
      await workspace.getByRole("button", { name: "Ordenar por nombre", exact: true }).click();
      assert.deepEqual(await laneOrder(), byName);
      report.sorts.push({ template: target.template.name, realPointerClick: true, tasksRetained: 266, returnedToName: true, noPendingEdits: true });
    }
    await workspace.getByRole("button", { name: "Por plató y espacio", exact: true }).click();
    await assertAll("spaces timeline");
    await workspace.getByRole("button", { name: "Lista", exact: true }).click(); await assertAll("spaces list");
    await workspace.getByRole("button", { name: "Timeline", exact: true }).click(); await assertAll("spaces timeline again");
    await workspace.getByRole("button", { name: "Recursos", exact: true }).click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-testid="assisted-workspace"] [data-planning-task-id]').length>0);
    const defaults=await ids();assert.ok(defaults.length>0,"resource default must render assigned tasks without selection");
    report.views.push({view:"resources default",renderedTasks:defaults.length});
    await workspace.getByRole("combobox").click();
    const options = page.getByRole("option"); const count = await options.count(); assert.ok(count > 0);
    for (let index = 0; index < count; index++) await options.nth(index).click();
    await page.keyboard.press("Escape");
    const resourceIds = await ids();
    assert.deepEqual(resourceIds,defaults,"explicit all and default all render the same effective assignments");
    const spaceAssignments=(await db.query("SELECT space_id,plan_resource_item_id FROM public.plan_space_resource_assignments WHERE plan_id=$1",[planId])).rows;
    const assignedSpaces=new Set(spaceAssignments.map(row=>Number(row.space_id)));
    for(const task of live.dailyTasks.filter((task:any)=>assignedSpaces.has(Number(task.spaceId))))assert.ok(resourceIds.includes(Number(task.id)),`space-assigned task ${task.id} is visible`);
    assert.ok(resourceIds.length > 0);
    assert.ok(resourceIds.every(id => expectedIds.includes(id)), "resource view contains only real persisted tasks");
    for (const task of live.dailyTasks.filter((t: any) => t.assignedResources?.length)) assert.ok(resourceIds.includes(Number(task.id)), `assigned task ${task.id} must be visible`);
    report.views.push({ view: "resources all selections", totalPlanTasks: 266, renderedTasks: resourceIds.length, filteredTasks: 266 - resourceIds.length });
    // Resources retains Legacy's filtering: resource-free tasks have no card
    // there. Compare the actual Legacy renderer, then recover all 266 tasks.
    await page.getByRole("button", { name: "Legacy", exact: true }).click();
    await page.waitForFunction(count => new Set([...document.querySelectorAll('[data-planning-task-id]')].map(el => el.getAttribute("data-planning-task-id"))).size === count, resourceIds.length);
    assert.deepEqual(await page.locator("[data-planning-task-id]").evaluateAll(elements => [...new Set(elements.map(el => Number(el.getAttribute("data-planning-task-id"))))].sort((a, b) => a - b)), resourceIds);
    report.legacyResourceParity = true;
    await page.getByRole("button", { name: "Asistida", exact: true }).click(); await workspace.waitFor();
    await workspace.getByRole("button", { name: "Por concursante", exact: true }).click(); await assertAll("contestants restored");
    const opened = page.waitForResponse(response => response.url().endsWith("/history/timings") && response.status() === 200);
    await page.getByText("Historial", { exact: true }).click(); await opened;
    const history = workspace.getByTestId("section-assisted-history");
    await history.getByText("Generación", { exact: true }).first().waitFor();
    await history.getByText("Solicitud a aceptación", { exact: true }).first().waitFor();
    await history.getByText("No disponible", { exact: true }).first().waitFor();
    assert.equal(requests.filter(r => r.url.endsWith("/history/timings")).length, 1, "one timing query when opened");
    const metadata = (await api(`${path}/history/timings`)).data;
    const actual = (await db.query("SELECT s.id,s.ordinal,s.accepted_at,r.created_at,r.started_at,r.finished_at FROM public.assisted_planning_stages s LEFT JOIN public.planning_runs r ON r.id=s.proposal_run_id AND r.plan_id=s.plan_id AND r.assisted_session_id=s.session_id WHERE s.plan_id=$1 ORDER BY s.ordinal", [planId])).rows;
    assert.equal(metadata.length, actual.length);
    for (const stage of actual) {
      const timing = metadata.find((row: any) => Number(row.stageId) === Number(stage.id));
      assert.deepEqual(Object.keys(timing).sort(), ["generation", "requestToAcceptance", "stageId"]);
      if (stage.ordinal === 0) { assert.equal(timing.generation, null); assert.equal(timing.requestToAcceptance, null); continue; }
      assert.equal(timing.generation.durationMs, stage.finished_at.getTime() - stage.started_at.getTime());
      assert.equal(timing.requestToAcceptance.durationMs, stage.accepted_at.getTime() - stage.created_at.getTime());
      for (const interval of [timing.generation, timing.requestToAcceptance]) {
        assert.ok(await history.locator(`time[datetime="${interval.start}"]`).count());
        assert.ok(await history.locator(`time[datetime="${interval.end}"]`).count());
      }
    }
    for (const role of ["anon", "norole", "viewer", "aux", "production", "admin"]) {
      const response = await api(`${path}/history/timings`, role);
      assert.equal(response.status, role === "anon" ? 401 : role === "norole" ? 403 : 200);
      report.roles.push({ role, status: response.status });
    }
    assert.equal((await api("/api/plans/2147483647/assisted/history/timings")).status, 404);
    assert.equal((await api("/api/plans/invalid/assisted/history/timings")).status, 400);
    await page.getByText("Historial", { exact: true }).click();
    await page.getByText("Historial", { exact: true }).click();
    assert.equal(requests.filter(r => r.url.endsWith("/history/timings")).length, 1, "reopen reuses timings without requests");
    assert.deepEqual(requests.filter(r => !["GET", "OPTIONS"].includes(r.method) && new URL(r.url).pathname !== "/api/bootstrap-role"), [], "all view, template and history actions are read-only");
    assert.deepEqual(await material(), before, "Draft, Stage, resources, locks, validation and run material are literal after visual actions");
    assert.deepEqual((await api(path)).data, initial);
    await history.screenshot({ path: `${directory}/views-history-real-ui.png` });
    report.history = { lazy: true, exactRunIntervals: true, stageZeroUnavailable: true, roleBoundary: true, noEvidencePayload: true };
    report.noMutations = true; report.status = "PASS";
    pass(`S${initial.activeStage.ordinal} persisted UI: 266 tasks in contestant and space timeline/list; ${resourceIds.length} resource-filtered tasks with Legacy parity; real template sort/name reset; lazy history times and authorization; zero mutations`);
    return report;
  } catch (error) {
    report.status = "FAIL"; report.error = error instanceof Error ? error.stack : String(error); report.requests = requests;
    report.renderedTaskIds = await ids().catch(() => []);
    report.missingTasks = live.dailyTasks.filter((task: any) => !report.renderedTaskIds.includes(Number(task.id))).map((task: any) => ({ id: task.id, template: task.template?.name, spaceId: task.spaceId, zoneId: task.zoneId, assignedResources: task.assignedResources }));
    await page.screenshot({ path: `${directory}/views-history-failure-real-ui.png` }).catch(() => {}); throw error;
  } finally {
    save(); page.off("request", observe);

  }
}
