import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import type pg from "pg";
import type { Page } from "playwright";
import type { buildA2ImportRows } from "./a2ImportRows";
import { fingerprintAssistedPlanningSnapshotV1 } from "../../server/assistedPlanningSnapshot";

/** Test catalog only, on the smoke runner's freshly created local PostgreSQL.
 * Daily snapshots and EngineInput keep the unmodified canonical A2 authorities.
 */
export async function seedA2ScopeCatalog(db: pg.Client, dataset: ReturnType<typeof buildA2ImportRows>) {
  const memberIds = ["p15-croma", "p15-estrellas-sillon"].map(name => dataset.tables.spaces.find(space => space.name === name)!.id);
  // The import now owns the canonical multi-space parent; do not fabricate it.
  assert.equal(new Set(dataset.tables.spaces.filter(space=>memberIds.includes(space.id)).map(space=>space.zone_id)).size,1);
  // An existing space has real obligations but shares the Croma display name.
  // It must never enter the P15 scope through that coincidental label.
  const decoy = dataset.tables.spaces.find(space => space.name === "caracola-lucia")!;
  await db.query("INSERT INTO public.spaces(name,zone_id) VALUES('Sin obligaciones',$1)", [decoy.zone_id]);
  await db.query("UPDATE public.spaces SET name='p15-croma' WHERE id=$1", [decoy.id]);
}

type Options = { appUrl: string; users: Record<string, { token: string }>; db: pg.Client; planId: number;
  directory: string; pass: (message: string) => void };
export async function runA2ScopeSelectionJourney(options: Options, page: Page, phase: "initial" | "accepted") {
  const { appUrl, users, db, planId, directory, pass } = options;
  const api = async (path: string) => {
    const response = await fetch(`${appUrl}${path}`, { headers: { Authorization: `Bearer ${users.production.token}` } });
    assert.equal(response.status, 200); return response.json() as Promise<any>;
  };
  const path = `/api/plans/${planId}/assisted`, initial = await api(path), live = await api(`/api/plans/${planId}`);
  const spaces = (await db.query("SELECT id,name,zone_id FROM public.spaces ORDER BY id")).rows;
  const pending = (ids: number[]) => live.dailyTasks.filter((task: any) => ids.includes(Number(task.spaceId))
    && ["pending", "interrupted"].includes(task.status)
    && !initial.activeStage.snapshotJson.tasks.some((row: any) => Number(row.taskId) === Number(task.id) && row.startPlanned && row.endPlanned))
    .map((task: any) => Number(task.id)).sort((a: number, b: number) => a - b);
  const material = async () => {
    const out: Record<string, unknown> = {};
    for (const table of ["zones", "spaces", "plan_space_settings", "daily_tasks", "assisted_planning_sessions", "assisted_planning_stages", "planning_runs", "planning_stage_validations", "plan_config_revisions"])
      out[table] = (await db.query(`SELECT to_jsonb(x) AS row FROM public.${table} x ORDER BY id`)).rows;
    return out;
  };
  const before = await material(), writes: string[] = [];
  const observe = (request: any) => { if (!["GET", "OPTIONS"].includes(request.method())) writes.push(request.url()); };
  page.on("request", observe);
  const workspace = page.getByTestId("assisted-workspace");
  const count = async (expected: number) => {
    await page.waitForFunction(n => document.querySelector('[data-testid="assisted-scope-count"]')?.textContent?.startsWith(`${n} obligaciones`), expected);
  };
  const toggle = async (id: number) => workspace.getByTestId("assisted-location-scope").locator(`[data-testid="scope-space-${id}"]`).click();
  try {
    await workspace.getByRole("button", { name: "Espacios y zonas", exact: true }).click();
    const clear = workspace.getByRole("button", { name: "Retirar selección de ubicaciones", exact: true });
    if (await clear.isEnabled()) await clear.click();
    await count(0); assert.equal(await workspace.getByRole("button", { name: "Generar propuesta", exact: true }).isDisabled(), true);
    const p15 = (await db.query("SELECT id FROM public.zones WHERE name='Plató 15'")).rows[0];
    const members = spaces.filter(space => Number(space.zone_id) === Number(p15.id)).map(space => Number(space.id));
    const zone = workspace.getByTestId(`scope-zone-${p15.id}`).getByRole("checkbox", { name: "Seleccionar zona Plató 15", exact: true });
    await zone.click(); await count(pending(members).length);
    if (phase === "initial") assert.equal(pending(members).length, 36);
    for (const id of members) assert.equal(await workspace.getByTestId(`scope-space-${id}`).getAttribute("aria-checked"), "true");
    await toggle(members[0]); await count(pending([members[1]]).length); assert.equal(await zone.getAttribute("aria-checked"), "mixed");
    await toggle(members[0]); await count(pending(members).length); await zone.click(); await count(0);
    const caracolas = spaces.filter(space => space.name === "caracola-jose-maria" || (space.name === "p15-croma" && !members.includes(Number(space.id)))).map(space => Number(space.id));
    assert.equal(caracolas.length, 2);
    await toggle(caracolas[0]); await count(pending([caracolas[0]]).length);
    await toggle(caracolas[1]); await count(pending(caracolas).length);
    if (phase === "initial") assert.equal(pending(caracolas).length, 19);
    await toggle(members[0]); await count(pending([...caracolas, members[0]]).length);
    await toggle(members[0]); await count(pending(caracolas).length);
    const empty = spaces.find(space => space.name === "Sin obligaciones")!;
    await toggle(Number(empty.id)); await count(pending(caracolas).length);
    await workspace.getByRole("button", { name: "Retirar selección de ubicaciones", exact: true }).click(); await count(0);
    if (phase === "accepted") {
      const acceptedSpaces = [...new Set<number>(initial.activeStage.snapshotJson.tasks.filter((row: any) => row.startPlanned && row.endPlanned && row.spaceId).map((row: any) => Number(row.spaceId)))];
      assert.ok(acceptedSpaces.length > 0);
      for (const id of acceptedSpaces) { await toggle(id); await count(pending([id]).length); await toggle(id); }
    }
    await workspace.getByRole("button", { name: "Tareas", exact: true }).click();
    assert.deepEqual(writes, [], "selection, mode and removal actions make zero writes");
    const selectionWrites = writes.length;
    assert.deepEqual(await material(), before, "catalog, Draft, Stage, validation, resources and planning remain identical");
    const after = await api(path); assert.deepEqual(after, initial);
    assert.equal(after.activeStage.id, initial.activeStage.id);
    assert.equal(fingerprintAssistedPlanningSnapshotV1(after.activeStage.snapshotJson), initial.activeStage.snapshotFingerprint);
    let generatedTaskIds: number[] | null = null;
    if (phase === "initial") {
      await workspace.getByRole("button", { name: "Espacios y zonas", exact: true }).click();
      for (const id of caracolas) await toggle(id); await count(19);
      const response = page.waitForResponse(r => r.url().endsWith(path + "/proposals") && r.request().method() === "POST");
      await workspace.getByRole("button", { name: "Generar propuesta", exact: true }).click();
      const requested = await response; assert.equal(requested.status(), 202);
      const body = requested.request().postDataJSON();
      assert.deepEqual(body.selector, { kind: "TASK_IDS", taskIds: pending(caracolas) });
      assert.equal(body.includePrerequisites, false);
      const runId = Number((await requested.json()).runId);
      await workspace.getByRole("button", { name: "Generar propuesta", exact: true }).waitFor({ timeout: 180_000 });
      const run = await api(path + `/proposals/${runId}`);
      assert.equal(run.status, "success"); assert.deepEqual(run.scope_task_ids_json, pending(caracolas));
      generatedTaskIds = run.scope_task_ids_json;
      assert.deepEqual((await api(path)).draft, initial.draft, "generating a preview does not mutate Draft");
      assert.deepEqual((await api(path)).activeStage, initial.activeStage);
      // Switching scope drops this preview locally before the existing recommendation flow.
      await workspace.getByRole("button", { name: "Tareas", exact: true }).click();
    }
    const report = { status: "PASS", phase, p15: { structuredMemberSpaceIds: members, pending: pending(members).length },
      caracolas: { spaceIds: caracolas, pending: pending(caracolas).length }, selectionWrites,
      generatedTaskIds, acceptedStageId: initial.activeStage.id, acceptedFingerprint: initial.activeStage.snapshotFingerprint, planningUnchanged: true };
    writeFileSync(`${directory}/scope-selection-${phase}.json`, JSON.stringify(report, null, 2));
    pass(`${phase}: real location UI, A2 19/36, zone membership, partial/remove/combine/empty/accepted selections; zero writes and identical Stage/Draft`);
    return report;
  } finally { page.off("request", observe); }
}
