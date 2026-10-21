/** Presentation-only browser gate. No database, credentials or productive writes.
 * npm exec tsx script/demo/smokePlanningExecutionVisuals.ts [--baseline]
 * Uses the real timeline and query-cache updates; does not validate server transitions.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

const baseline = process.argv.includes("--baseline");
const root = resolve("work/execution-visuals");
const evidence = resolve("docs/evidence/PLANNING-EXECUTION-STATUS");
mkdirSync(root, { recursive: true });
mkdirSync(evidence, { recursive: true });
if (baseline) {
  const ref = process.argv.find(arg => arg.startsWith("--baseline-ref="))?.slice("--baseline-ref=".length) ?? "HEAD";
  for (const [source, target] of [["client/src/components/planning-timeline.tsx", "baseline-timeline.tsx"], ["client/src/index.css", "baseline.css"]])
    writeFileSync(`${root}/${target}`, execFileSync("git", ["show", `${ref}:${source}`]));
}
const timeline = baseline ? `${root}/baseline-timeline.tsx` : resolve("client/src/components/planning-timeline.tsx");
const css = baseline ? `${root}/baseline.css` : resolve("client/src/index.css");
writeFileSync(`${root}/auth.ts`, "export const useAuth = () => ({user:null});");
writeFileSync(`${root}/index.html`, '<html lang="es"><head><meta charset="utf-8"><title>OptiPlan · Ejecución</title></head><body><div id="root"></div><script type="module" src="/harness.tsx"></script></body></html>');
writeFileSync(`${root}/harness.tsx`, `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider, useQuery} from '@tanstack/react-query';
import {PlanningTimeline} from ${JSON.stringify(timeline)};
import {PlanningDensityContext} from '@/components/planning/fullscreen-planning-panel';
import {ConfirmDialogProvider} from '@/components/ui/confirm-dialog';
import ${JSON.stringify(css)};
const query = new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}});
query.setQueryData(['/api/program-settings'],{clockMode:'auto'});
const statuses=['pending','in_progress','done','interrupted','cancelled'];
const hhmm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const tasks=[0,1,2].flatMap(lane=>statuses.map((status,index)=>({
 id:lane*10+index+1,templateId:index+1,contestantId:lane+1,status,
 startPlanned:hhmm(540+index*35),endPlanned:hhmm(565+index*35),
 startReal:status==='pending'||status==='cancelled'?null:hhmm(540+index*35+1),
 endReal:status==='done'||status==='interrupted'?hhmm(560+index*35):null,
 spaceId:lane===2?null:1,zoneId:lane===2?null:1,itinerantTeamId:lane===1?7:null,
 template:{name:['Vocal','Ensayo','Coreografía','Entrevista','Estilismo'][index],abbrev:['VOC','ENS','COR','ENT','EST'][index],uiColor:'#164e63',uiColorSecondary:'#fde68a'},assignedResources:[101]
})));
tasks.push({...tasks[1],id:90,contestantId:4,startPlanned:'09:00',endPlanned:'09:05',template:{name:'Actividad breve',uiColor:'#5b21b6',uiColorSecondary:'#5b21b6'}});
tasks.push({...tasks[0],id:91,contestantId:4,status:'unknown',startPlanned:'09:15',endPlanned:'09:35',template:{name:'Sin estado de ejecución',uiColor:'#dbeafe',uiColorSecondary:'#dbeafe'}});
tasks.push({...tasks[0],id:92,contestantId:4,isManualBlock:true,startPlanned:'10:00',endPlanned:'10:30',manualTitle:'Reserva manual',manualColor:'#bae6fd'});
const initial=structuredClone(tasks);
query.setQueryData(['visual-tasks'],tasks);
const contestants=[{id:1,name:'Ana'},{id:2,name:'Bea'},{id:3,name:'Carla'},{id:4,name:'Diana'}];
function App(){
 const [options,setOptions]=useState({view:'contestants',list:false,density:'normal',mode:'accepted',pendingOnly:false,projectedMeals:false,shortStatus:null,dark:false,showExecutionStatus:true,sampleOnly:false});
 const {data}=useQuery({queryKey:['visual-tasks'],queryFn:()=>initial});
 const update=(id,status)=>query.setQueryData(['visual-tasks'],rows=>rows.map(t=>t.id===id?{...t,status}:t));
 window.visuals={options,setOptions,update,reset:()=>query.setQueryData(['visual-tasks'],structuredClone(initial)),rows:()=>query.getQueryData(['visual-tasks'])};
 document.documentElement.classList.toggle('dark',options.dark);
 let dailyTasks=options.pendingOnly?data.map(t=>({...t,status:t.status==='unknown'?'unknown':'pending'})):data;
 if(options.shortStatus)dailyTasks=dailyTasks.map(t=>t.id===90?{...t,status:options.shortStatus}:t);
 if(options.sampleOnly)dailyTasks=dailyTasks.filter(t=>t.id<=5);
 const plan={workStart:'09:00',workEnd:'12:00',mealStart:null,mealEnd:null,dailyTasks,
  breaks:[{id:1,kind:'space_meal',spaceId:1,itinerantTeamId:null,plannedStart:'11:50',plannedEnd:'11:55'}],
  plannerNextConfiguration:{taskOperations:tasks.filter(t=>t.itinerantTeamId).map(t=>({taskId:t.id,agendaScope:'ITINERANT_UNIT',itinerantTeamId:7}))}};
 return <ConfirmDialogProvider><main className="p-4 bg-background text-foreground" style={{height:'100vh',display:'flex',flexDirection:'column'}} data-view={options.view} data-mode={options.mode}>
  <h1 className="text-xl mb-1">OptiPlan · Planning de producción</h1>
  <p className="text-sm text-muted-foreground mb-4">{options.view==='contestants'?'Concursantes':options.view==='spaces'?'Platós y espacios':'Recursos'} · {options.mode==='accepted'?'Planning aceptado':'Borrador'} · {options.density==='pdf'?'Densidad PDF':options.list?'Lista compacta':'Vista normal'}</p>
  <PlanningDensityContext.Provider value={options.density}>
  <PlanningTimeline plan={plan} contestants={contestants} viewMode={options.view} mode={options.mode} showExecutionStatus={options.showExecutionStatus} readOnly={options.mode==='accepted'}
   spaceVerticalMode={options.list?'list':'timeline'} zones={[{id:1,name:'Plató 14',uiOrderIndex:1}]} spaces={[{id:1,name:'Ensayo',zoneId:1}]}
   resourceSelectables={[{id:'resource_item:101',kind:'resource_item',label:'Cámara 1'}]} resourceFilterIds={['resource_item:101']} planResourceItemNameById={{101:'Cámara 1'}}
   uiItinerantGroupOrderIndex={2} uiUnlocatedGroupOrderIndex={3} spaceResourceAssignments={{1:[101]}} itinerantTeams={[{id:7,name:'Equipo móvil',isActive:true}]} timeLockedTaskIds={[1]}
   onTaskStatusChange={async(task,status)=>update(task.id,status)} onPinTask={async()=>{window.pinCalls=(window.pinCalls||0)+1;}} onUnpinTask={async()=>{window.unpinCalls=(window.unpinCalls||0)+1;}}
   taskVisualStates={{1:'SCOPE_SELECTED'}}
   operationalMeals={options.projectedMeals?{authority:'accepted',unavailable:false,meals:[{policyId:'meal-policy',spaceIds:[1],resourceIds:[101],teamIds:[7],interval:{startPlanned:'11:50',endPlanned:'11:55'}}]}:{authority:'legacy',unavailable:false,meals:[]}}
  /></PlanningDensityContext.Provider>
 </main></ConfirmDialogProvider>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={query}><App/></QueryClientProvider>);
`);

const server = await createServer({
  configFile: false, root, plugins: [{
    name: "local-fixture-auth", enforce: "pre",
    load(id) { if (id === resolve("client/src/hooks/use-auth.tsx")) return "export const useAuth = () => ({user:null});"; },
  }, react()],
  resolve: { alias: { "@/hooks/use-auth": `${root}/auth.ts`, "@": resolve("client/src"), "@shared": resolve("shared") } },
  css: { postcss: resolve(".") },
  server: { host: "127.0.0.1", port: 4187, strictPort: true, fs: { allow: [resolve(".")] } },
});
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
page.setDefaultTimeout(15000);
const errors: string[] = [], writes: string[] = [];
page.on("pageerror", e => errors.push(e.message));
page.on("request", r => { if (r.url().includes("/api/") && !["GET", "HEAD", "OPTIONS"].includes(r.method())) writes.push(`${r.method()} ${r.url()}`); });
const report: { checks: string[]; screenshots: string[]; status?: string } = { checks: [], screenshots: [] };
const options = async (patch: Record<string, unknown>) => {
  await page.evaluate(patch => (window as any).visuals.setOptions((old: Record<string, unknown>) => ({ ...old, ...patch })), patch);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
const card = (id: number) => page.locator(`[data-planning-task-id="${id}"]`).first();
const capture = async (name: string) => {
  const filename = `${baseline ? "before" : "after"}-${name}.png`;
  await page.screenshot({ path: `${evidence}/${filename}` }); report.screenshots.push(filename);
};
try {
  await page.goto("http://127.0.0.1:4187");
  await card(1).waitFor();
  const original = await page.evaluate(() => (window as any).visuals.rows());
  for (const view of ["contestants", "spaces", "resources"]) {
    await options({ view, density: "normal", list: false });
    await card(1).waitFor();
    if (view === "resources") await options({ sampleOnly: true });
    await capture(view);
    if (view === "resources") await options({ sampleOnly: false });
    if (baseline) continue;
    assert.equal(await page.getByRole("group", { name: "Estados de ejecución" }).count(), 1);
    for (const offset of [0, 10, 20]) {
      for (const [index, status] of ["pending", "in_progress", "done", "interrupted", "cancelled"].entries()) {
        const task = card(offset + index + 1);
        assert.equal(await task.getAttribute("data-execution-status"), status);
        assert.equal(await task.locator("[data-execution-marker]").count(), status === "pending" ? 0 : 1);
        assert.match((await task.getAttribute("aria-label"))!, /Pendiente|En curso|Completada|Interrumpida|Cancelada/);
        const style = await task.evaluate(el => ({ opacity: getComputedStyle(el).opacity, background: getComputedStyle(el).backgroundColor }));
        assert.equal(style.opacity, "1");
        assert.equal(style.background, view === "spaces" ? "rgb(253, 230, 138)" : "rgb(22, 78, 99)");
      }
    }
    assert.equal(await card(91).getAttribute("data-execution-status"), null);
    if (await card(92).count()) assert.equal(await card(92).getAttribute("data-execution-status"), null);
    if (view !== "contestants") {
      assert.equal(await card(-1).getAttribute("data-execution-status"), null);
      assert.equal(await card(-1).locator("[data-execution-marker]").count(), 0);
      await options({ projectedMeals: true });
      assert.ok(await page.locator("[data-operational-meal-policy-id]").count());
      assert.equal(await page.locator("[data-operational-meal-policy-id] [data-execution-marker]").count(), 0);
      await options({ projectedMeals: false });
    }
    report.checks.push(`${view}: five states, physical/itinerant/unlocated, original colours, full text opacity, no synthetic status`);
    if (view === "spaces") {
      await options({ list: true }); await capture("spaces-list");
      for (const status of ["in_progress", "done", "interrupted", "cancelled"]) {
        await options({ shortStatus: status });
        const marker = card(90).locator("[data-execution-marker]");
        assert.ok(await marker.isVisible());
        const box = await marker.boundingBox(), taskBox = await card(90).boundingBox();
        assert.ok(box && taskBox && box.height >= 6 && box.y >= taskBox.y && box.y + box.height <= taskBox.y + taskBox.height);
      }
      await options({ shortStatus: null });
      report.checks.push("compact space lists and 5-minute / 10px cards retain each active glyph inside the card");
    }
    await options({ density: "pdf" });
    assert.equal(await card(3).getAttribute("data-execution-status"), "done");
    if (view === "resources") await options({ sampleOnly: true });
    await capture(`${view}-pdf`);
    if (view === "resources") await options({ sampleOnly: false });
    await options({ showExecutionStatus: false });
    assert.equal(await page.locator("[data-planning-task-id][data-execution-status]").count(), 0);
    assert.equal(await page.getByRole("group", { name: "Estados de ejecución" }).count(), 0);
    await options({ showExecutionStatus: true, mode: "assisted-draft" });
    assert.equal(await page.locator("[data-planning-task-id][data-execution-status]").count(), 0);
    assert.equal(await page.locator("[data-planning-task-id] [data-execution-marker]").count(), 0);
    assert.equal(await page.getByRole("group", { name: "Estados de ejecución" }).count(), 0);
    await options({ mode: "accepted", density: "normal", pendingOnly: true });
    assert.equal(await page.locator("[data-planning-task-id] [data-execution-marker]").count(), 0);
    await options({ pendingOnly: false });
    report.checks.push(`${view}: PDF density, Draft separation and all-pending day`);
  }
  if (!baseline) {
    await options({ view: "contestants", list: false });
    const geometryBefore = await card(1).evaluate(el => ({ left: (el as HTMLElement).style.left, width: (el as HTMLElement).style.width }));
    // Existing card menu callbacks update the observed rows; no navigation/reload.
    await card(1).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-planning-task-id="1"]')?.getAttribute("data-execution-status") === "in_progress");
    await card(1).click(); await page.getByRole("button", { name: "Finish", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-planning-task-id="1"]')?.getAttribute("data-execution-status") === "done");
    for (const [from, action, status] of [["in_progress", "Interrupt", "interrupted"], ["pending", "Cancel", "cancelled"]]) {
      await page.evaluate(status => (window as any).visuals.update(1, status), from);
      await card(1).click(); await page.getByRole("button", { name: action, exact: true }).click();
      await page.waitForFunction(status => document.querySelector('[data-planning-task-id="1"]')?.getAttribute("data-execution-status") === status, status);
      assert.equal(await card(1).locator("[data-execution-marker]").count(), 1);
    }
    await page.evaluate(() => (window as any).visuals.update(1, "pending"));
    await page.waitForFunction(() => document.querySelector('[data-planning-task-id="1"]')?.getAttribute("data-execution-status") === "pending");
    assert.equal(await card(1).locator("[data-execution-marker]").count(), 0);
    await card(1).focus(); await page.keyboard.press("Enter");
    const unpin = page.getByRole("button", { name: "Quitar fijación", exact: true });
    await unpin.click();
    assert.equal(await page.evaluate(() => (window as any).unpinCalls), 1);
    assert.deepEqual(await card(1).evaluate(el => ({ left: (el as HTMLElement).style.left, width: (el as HTMLElement).style.width })), geometryBefore);
    assert.deepEqual(await page.evaluate(() => (window as any).visuals.rows()), original);
    report.checks.push("menu Start/Finish/Interrupt/Cancel, supplied reset, keyboard menu and time-lock action without reload or geometry/data changes");
    await options({ mode: "assisted-draft" });
    // The existing Draft pointer handler still selects/drags pending tasks.
    const box = await card(1).boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 4 }); await page.mouse.up();
    assert.equal(await card(1).locator("[data-execution-marker]").count(), 0);
    assert.notEqual(await card(1).evaluate(el => (el as HTMLElement).style.left), geometryBefore.left);
    assert.deepEqual(await page.evaluate(() => (window as any).visuals.rows()), original);
    await page.reload(); await card(1).waitFor();
    await options({ mode: "accepted", dark: true }); await capture("dark");
    await options({ dark: false });
    await page.setViewportSize({ width: 390, height: 844 }); await capture("mobile");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.emulateMedia({ media: "print" });
    assert.ok(await card(3).locator("[data-execution-marker]").isVisible());
    await capture("print");
    report.checks.push("Draft pointer interaction, dark theme, 390px viewport, print glyphs and zero operational HTTP writes");
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  report.status = "PASS";
} catch (error) {
  console.error({ errors });
  await page.screenshot({ path: `${root}/failure.png` });
  throw error;
} finally {
  await browser.close(); await server.close();
}
writeFileSync(`${evidence}/${baseline ? "baseline" : "browser"}.json`, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
