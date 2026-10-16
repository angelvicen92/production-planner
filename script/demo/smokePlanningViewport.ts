/** UI-01B browser assertions, on the real product and historical A2 harness. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import type { Page } from "playwright";
import type pg from "pg";

/** Presentation-only fixture configured before the SQL invariance snapshot. */
export async function seedPlanningViewportPresentation(db: pg.Client, planId: number) {
  assert.equal((db as any).host, "127.0.0.1");
  await db.query(`UPDATE task_templates SET
    ui_color = CASE id % 3 WHEN 0 THEN '#164e63' WHEN 1 THEN '#fde68a' ELSE '#5b21b6' END,
    ui_color_secondary = CASE id % 3 WHEN 0 THEN '#164e63' WHEN 1 THEN '#fde68a' ELSE '#5b21b6' END,
    name = CASE WHEN name='PASILLO' THEN 'Pasillo entrevista y preparación con un título muy largo SinEspaciosParaComprobarElAjusteDePalabras' ELSE name END
    WHERE id IN (SELECT template_id FROM daily_tasks WHERE plan_id=$1)`, [planId]);
}

export async function runPlanningViewport(page: Page, directory: string, baseline = false) {
  const report: any = { baseline, fits: [], resources: [], screenshots: [] };
  const panel = (view: string) => page.getByTestId(`planning-panel-${view}`);
  const capture = async (name: string) => { await page.screenshot({ path: `${directory}/${name}.png` }); report.screenshots.push(`${name}.png`); };
  const axes = (view: string) => panel(view).locator(".planning-panel").evaluate(el => [Number(el.getAttribute("data-zoom-x")), Number(el.getAttribute("data-zoom-y"))]);
  await panel("contestants").scrollIntoViewIfNeeded();
  await panel("contestants").getByRole("button", { name: "Maximizar", exact: true }).click();
  for (let i = 0; i < 5; i++) {
    await panel("contestants").getByRole("button", { name: "Ajustar", exact: true }).click();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    report.fits.push(await axes("contestants"));
  }
  await capture(baseline ? "before-fit" : "after-fit");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Mostrar Recursos", exact: true }).click();
  const resources = panel("resources");
  await resources.getByRole("button", { name: "Filtros", exact: true }).click();
  await resources.locator(".planning-filters input").fill("");
  const choices = resources.locator(".planning-filters label").filter({ has: page.getByRole("checkbox") });
  await choices.nth(1).getByRole("checkbox").check();
  await resources.getByRole("button", { name: /^Filtros/ }).click();
  await resources.getByRole("button", { name: "Maximizar", exact: true }).click();
  await capture(baseline ? "before-resource-one" : "after-resource-one");
  report.resources.push(await resources.locator("[data-planning-canvas]").evaluate(el => ({ canvas: el.getBoundingClientRect().width, firstColumn: el.firstElementChild?.firstElementChild?.getBoundingClientRect().width })));
  report.resourceFits = [];
  for (let press = 0; press < 5; press++) {
    await resources.getByRole("button", { name: "Ajustar", exact: true }).click();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    report.resourceFits.push(await axes("resources"));
  }
  await capture("before-resource-fit-repeated");
  await page.keyboard.press("Escape");
  writeFileSync(`${directory}/planning-viewport.json`, JSON.stringify(report, null, 2));
  return report;
}

export async function verifyPlanningViewport(page: Page, directory: string, planId: number) {
  const report: any = { fits: [], resources: [], layouts: [], screenshots: [] };
  const views = ["contestants", "spaces", "resources"];
  const workspace = page.getByTestId("planning-multiview");
  const panel = (view: string) => page.getByTestId(`planning-panel-${view}`);
  const axes = (view: string) => panel(view).locator(".planning-panel").evaluate(el => [Number(el.getAttribute("data-zoom-x")), Number(el.getAttribute("data-zoom-y"))]);
  const settle = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const capture = async (name: string) => { await page.screenshot({ path: `${directory}/${name}.png` }); report.screenshots.push(`${name}.png`); };
  const fit = async (view: string, context: string) => {
    const results: number[][] = [];
    for (let press = 0; press < 5; press++) {
      await panel(view).getByRole("button", { name: "Ajustar", exact: true }).click(); await settle();
      results.push(await axes(view));
    }
    for (const result of results) for (let axis = 0; axis < 2; axis++) assert.ok(Math.abs(result[axis] - results[0][axis]) <= 1, `${context}/${view}: fit drift ${JSON.stringify(results)}`);
    const dimensions = await panel(view).locator(".planning-scroll-viewport").evaluate(el => ({ width: el.clientWidth, height: el.clientHeight, contentWidth: el.scrollWidth, contentHeight: el.scrollHeight }));
    if (view === "resources") assert.ok(dimensions.contentWidth <= dimensions.width + 1, JSON.stringify(dimensions));
    report.fits.push({ view, context, results, dimensions });
  };
  try {
    await page.goto(new URL(`/plans/${planId}?tab=planning`, page.url()).href);
    await workspace.waitFor();
    // Seed actual persisted preferences to exercise the three requested starts.
    for (const seed of [25, 100, 250]) {
      await page.goto(new URL("/dashboard", page.url()).href);
      await page.getByTestId("planning-multiview").waitFor({ state: "detached" });
      await page.evaluate(({ seed, planId }) => {
        for (const key of Object.keys(localStorage)) if (key.startsWith("optiplan:workspace:") && key.includes(`:${planId}`)) {
          if (key.endsWith(":geometry")) localStorage.setItem(key, JSON.stringify({ zoomX: seed, zoomY: seed, frame: "day", axis: "linked" }));
          if (key.endsWith(":filter")) localStorage.setItem(key, "[]");
          if (key.endsWith(`:${planId}`)) {
            localStorage.setItem(key, JSON.stringify({ visible: ["contestants"], layout: "horizontal", ratio: 58 }));
            for (const view of ["contestants", "spaces", "resources"]) {
              localStorage.setItem(`${key}:${view}:geometry`, JSON.stringify({ zoomX: seed, zoomY: seed, frame: "day", axis: "linked" }));
              localStorage.setItem(`${key}:${view}:filter`, "[]");
            }
          }
        }
      }, { seed, planId });
      await page.goto(new URL(`/plans/${planId}?tab=planning`, page.url()).href); await panel("contestants").waitFor();
      assert.deepEqual(await axes("contestants"), [seed, seed]);
      await fit("contestants", `small/start-${seed}`);
      await workspace.getByRole("button", { name: "Maximizar conjunto", exact: true }).click();
      assert.equal(await workspace.locator(".planning-retained:not([hidden])").count(), 1);
      await page.keyboard.press("Escape");
      await workspace.getByRole("button", { name: "Mostrar Platós y espacios", exact: true }).click();
      assert.deepEqual(await axes("spaces"), [seed, seed]);
      const divider = workspace.getByRole("separator", { name: "Redimensionar paneles", exact: true });
      await divider.focus(); await page.keyboard.press("ArrowRight"); await settle();
      for (const view of views.slice(0, 2)) await fit(view, `two-horizontal/start-${seed}`);
      const ratio = await divider.getAttribute("aria-valuenow");
      await workspace.getByRole("button", { name: "Maximizar conjunto", exact: true }).click();
      assert.equal(await workspace.locator(".planning-retained:not([hidden])").count(), 2);
      assert.equal(await divider.getAttribute("aria-valuenow"), ratio);
      await page.keyboard.press("Escape");
      await workspace.getByRole("button", { name: "Mostrar Recursos", exact: true }).click();
      assert.deepEqual(await axes("resources"), [seed, seed]);
      for (const view of views) await fit(view, `three/start-${seed}`);
      await workspace.getByRole("button", { name: "Maximizar conjunto", exact: true }).click();
      for (const view of views) await fit(view, `workspace/start-${seed}`);
      await page.keyboard.press("Escape");
      console.log(`PASS viewport fit from ${seed}%`);
    }
    for (const width of [1365, 1920]) {
      await page.setViewportSize({ width, height: width === 1365 ? 900 : 1080 });
      for (const layout of ["horizontal", "vertical", "rejilla"]) {
        await workspace.getByRole("button", { name: `Distribución ${layout}`, exact: true }).click();
        await panel("contestants").scrollIntoViewIfNeeded();
        const scroll = await page.evaluate(() => ({ y: scrollY, overflow: document.body.style.overflow }));
        const before = await panel("contestants").locator(".planning-panel").evaluate(el => { (el as HTMLElement).dataset.mountProbe = "retained"; return el.getAttribute("data-zoom-x"); });
        await workspace.getByRole("button", { name: "Maximizar conjunto", exact: true }).click(); await settle();
        const workspaceBox = await workspace.boundingBox();
        assert.ok(workspaceBox && workspaceBox.y === 0 && workspaceBox.x === 0);
        for (const view of views) {
          const box = await panel(view).locator(".planning-scroll-viewport").boundingBox(); assert.ok(box && box.height > 0 && box.y >= 0 && box.y + box.height <= (width === 1365 ? 900 : 1080) + 1, `${layout}/${view}: ${JSON.stringify(box)}`);
          await fit(view, `${width}/${layout}/workspace`);
        }
        await capture(`after-workspace-${width}-${layout}`);
        await panel("spaces").getByRole("button", { name: "Maximizar", exact: true }).click();
        assert.equal(await page.locator('.planning-panel[data-fullscreen="true"]').count(), 1);
        await fit("spaces", `${width}/${layout}/individual`);
        await page.keyboard.press("Escape");
        assert.equal(await workspace.getAttribute("data-workspace-fullscreen"), "true");
        assert.equal(await page.locator('.planning-panel[data-fullscreen="true"]').count(), 0);
        // A real card menu owns Escape before the workspace does.
        const card = panel("resources").locator("[data-planning-task-id]").first();
        await card.scrollIntoViewIfNeeded(); await card.click();
        if (await page.locator('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]').count()) {
          await page.keyboard.press("Escape"); assert.equal(await workspace.getAttribute("data-workspace-fullscreen"), "true");
        }
        await workspace.getByRole("button", { name: "Restaurar conjunto (Esc)", exact: true }).click(); await settle();
        assert.equal(await panel("contestants").locator(".planning-panel").getAttribute("data-mount-probe"), "retained");
        assert.equal(await page.evaluate(() => document.body.style.overflow), scroll.overflow);
        assert.ok(Math.abs(await page.evaluate(() => scrollY) - scroll.y) <= 1);
        assert.ok(Number(before) > 0);
        report.layouts.push({ width, layout, restored: true });
      }
    }
    await panel("spaces").getByLabel("Encuadre", { exact: true }).selectOption("tasks");
    await fit("spaces", "tasks-frame");
    await panel("spaces").getByRole("button", { name: "Lista", exact: true }).click();
    await panel("spaces").getByLabel("Densidad", { exact: true }).selectOption("pdf");
    await fit("spaces", "pdf-list");
    await panel("spaces").getByLabel("Densidad", { exact: true }).selectOption("normal");
    await panel("spaces").getByRole("button", { name: "Timeline", exact: true }).click();
    await panel("spaces").getByLabel("Encuadre", { exact: true }).selectOption("day");
    // One/two/three/many resources, compact cards and unchanged typography.
    await panel("resources").getByRole("button", { name: "Maximizar", exact: true }).click();
    for (const width of [1365, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const count of [1, 2, 3, 8]) {
        await panel("resources").getByRole("button", { name: /^Filtros/ }).click();
        await panel("resources").getByRole("button", { name: "Mostrar todos", exact: true }).click();
        const choices = panel("resources").locator(".planning-filters label").filter({ has: page.getByRole("checkbox") });
        for (let i = 1; i <= count; i++) await choices.nth(i).getByRole("checkbox").check();
        await panel("resources").getByRole("button", { name: /^Filtros/ }).click();
        await fit("resources", `${width}/${count}-resources`);
        const columns = await panel("resources").locator("[data-planning-resource]").evaluateAll(els => els.map(el => ({ width: el.getBoundingClientRect().width, overflow: el.scrollWidth > el.clientWidth + 1 })));
        assert.equal(columns.length, count); assert.ok(columns.every(col => col.width <= 400 && col.width >= 240 && !col.overflow), JSON.stringify(columns));
        const text = await panel("resources").locator(".planning-resource-task").first().evaluate(el => {
          const name = el.querySelector(".text-sm")!; return { font: parseFloat(getComputedStyle(name).fontSize), height: el.getBoundingClientRect().height, text: el.textContent };
        });
        assert.ok(text.font >= 14 && text.height >= 88);
        const cards = await panel("resources").locator(".planning-resource-task").evaluateAll(els => els.map(el => ({ color: getComputedStyle(el).backgroundColor, overflow: el.scrollWidth > el.clientWidth + 1, long: el.textContent?.includes("SinEspaciosParaComprobarElAjusteDePalabras") })));
        assert.ok(cards.every(card => !card.overflow));
        if (process.argv.includes("--planning-viewport")) {
          assert.ok(new Set(cards.map(card => card.color)).size >= 2);
          assert.ok(cards.some(card => card.long));
        }
        report.resources.push({ width, count, columns, text, colors: [...new Set(cards.map(card => card.color))], longTitlePresent: cards.some(card => card.long) });
        await capture(`after-resources-${width}-${count}`);
      }
    }
    await page.keyboard.press("Escape");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole("button", { name: "Planning aceptado · ejecución", exact: true }).click();
    await workspace.getByRole("button", { name: "Maximizar conjunto", exact: true }).click();
    await panel("resources").locator("[data-planning-task-id]").first().click();
    const dialog = page.locator('[role="dialog"][data-state="open"]');
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await workspace.getAttribute("data-workspace-fullscreen"), "true");
    assert.equal(await dialog.count(), 0);
    await page.locator("[data-radix-popper-content-wrapper]").waitFor({ state: "detached" });
    await page.keyboard.press("Escape");
    assert.equal(await workspace.getAttribute("data-workspace-fullscreen"), "false");
    report.dialogEscape = "PASS";
    report.status = "PASS";
    return report;
  } catch (error) { report.status = "FAIL"; report.error = String(error); await capture("viewport-failure"); throw error; }
  finally { writeFileSync(`${directory}/planning-viewport.json`, JSON.stringify(report, null, 2)); }
}
