/** Disposable native PostgreSQL/Auth/PostgREST/product HTTP/Chromium only. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import type pg from "pg";
import type { IStorage } from "../../server/storage";
import { buildEngineInput } from "../../engine/buildInput";
import { preflightEngineInputForPlannerNext } from "../../engine/planner-next/integration/engineInputPreflight";

type User={id:string;email:string;password:string;token:string};
export async function runOperationContinuityJourney({appUrl,db,users,directory,planId,storage,pass}:{appUrl:string;db:pg.Client;users:Record<string,User>;directory:string;planId:number;storage:IStorage;pass:(name:string)=>void}) {
  assert.equal(db.host,"127.0.0.1");assert.equal(new URL(appUrl).hostname,"127.0.0.1");
  const report:any={checks:[],remoteWrites:0};
  const check=(name:string)=>{report.checks.push(name);pass(name);writeFileSync(`${directory}/operation-continuity.json`,JSON.stringify(report,null,2));};
  const api=async(path:string,method="GET",body?:unknown,role="admin")=>{
    const response=await fetch(appUrl+"/api"+path,{method,headers:{"Content-Type":"application/json",...(role==="anonymous"?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json() as any};
  };
  const originalInput=await buildEngineInput(planId,storage);
  const arrivalIds=new Set(originalInput.tasks.filter(task=>task.operationalRole==="transport_arrival").map(task=>task.id));
  const entry=originalInput.tasks.find(task=>task.plannerNextKind==="auxiliary"&&task.dependsOnTaskIds?.some(id=>arrivalIds.has(id))&&originalInput.tasks.some(main=>main.plannerNextKind==="main"&&main.dependsOnTaskIds?.includes(task.id)));
  assert.ok(entry);
  const groupId=randomUUID();
  for(const role of ["production","aux","viewer","norole","anonymous"])assert.equal((await api(`/operation-continuity-groups/${groupId}`,"PUT",{name:"Reusable preparation group",policy:"OFF",gapWeight:2,expectedRevision:null},role)).status,role==="anonymous"?401:403);
  assert.equal((await api(`/operation-continuity-groups/${groupId}`,"PUT",{name:"Reusable preparation group",policy:"OFF",gapWeight:2,expectedRevision:null})).status,200);
  assert.equal((await api(`/operation-continuity-groups/${groupId}`,"PUT",{name:"Stale",policy:"REQUIRED",gapWeight:2,expectedRevision:null})).status,409);
  check("catalog role denials, UUID identity and optimistic revision conflict");
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();await page.goto(appUrl+"/login");await page.getByLabel("Email",{exact:true}).fill(users.admin.email);
    await page.getByLabel("Contraseña (opcional para enlace)",{exact:true}).fill(users.admin.password);
    await page.getByRole("button",{name:"Entrar con contraseña",exact:true}).click();await page.waitForURL("**/dashboard");
    const template=(await api("/task-templates")).body.find((row:any)=>row.id===entry.templateId);assert.ok(template);
    await page.goto(appUrl+"/settings");await page.getByRole("tab",{name:/plantillas|templates/i}).click();
    const card=page.locator(".bg-card").filter({has:page.getByText(template.name,{exact:true})}).last();
    await card.getByRole("button",{name:"Editar",exact:true}).click();
    await page.getByLabel("Grupo operativo",{exact:true}).selectOption(groupId);
    const saved=page.waitForResponse(response=>response.request().method()==="PATCH"&&new URL(response.url()).pathname.endsWith(`/ta/${template.id}`));
    await page.getByRole("button",{name:"Guardar",exact:true}).click();const response=await saved;assert.equal(response.status(),200);assert.equal((await response.json()).continuityGroupId,groupId);
    await page.reload();await page.getByRole("tab",{name:/plantillas|templates/i}).click();
    const reopened=page.locator(".bg-card").filter({has:page.getByText(template.name,{exact:true})}).last();await reopened.getByRole("button",{name:"Editar",exact:true}).click();
    await page.waitForFunction(id=>(document.querySelector('select[aria-label="Grupo operativo"]') as HTMLSelectElement)?.value===id,groupId);
    assert.equal(await page.getByLabel("Grupo operativo",{exact:true}).inputValue(),groupId);
    await page.locator("fieldset").filter({has:page.getByLabel("Grupo operativo",{exact:true})}).screenshot({path:`${directory}/continuity-template.png`});
    check("real template editor saves and reopens the structured group reference");

    // Two NEW template families and a genuinely new day use the real create APIs.
    const templateIds:number[]=[];
    for(const name of ["Generic preparation family alpha","Generic preparation family beta"]){const created=await api("/task-templates","POST",{name,defaultDuration:10,continuityGroupId:groupId});assert.equal(created.status,201);templateIds.push(created.body.id);}
    const fresh=await api("/plans","POST",{date:"2026-11-24",configuration:{workday:{intent:"INHERIT"},meal:{intent:"INHERIT"}}});assert.equal(fresh.status,201,JSON.stringify(fresh.body));
    const snap=await db.query("SELECT source_template_id,continuity_group FROM plan_task_template_snapshots WHERE plan_id=$1 AND source_template_id=ANY($2::integer[]) ORDER BY source_template_id",[fresh.body.id,templateIds]);
    assert.equal(snap.rows.length,2);snap.rows.forEach(row=>assert.equal(row.continuity_group.id,groupId));
    report.freshDay={planId:fresh.body.id,templateIds,snapshotGroupIds:snap.rows.map(row=>row.continuity_group.id),nextConfigurationPresent:!!(await storage.getPlan(fresh.body.id) as any)?.planner_next_configuration};
    check("two new templates share one group and the real create-day path snapshots their identity and policy");

    assert.equal((await api(`/plans/${planId}/assisted/session`,"POST",{})).status,200);
    const protectedRows=async()=>(await db.query(`SELECT (SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM daily_tasks d WHERE plan_id=$1) tasks,
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM assisted_planning_stages s WHERE plan_id=$1) stages,
      (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM locks l WHERE plan_id=$1) locks,
      (SELECT planner_next_configuration FROM plans WHERE id=$1) frozen`,[planId])).rows;
    const before=await protectedRows();
    const preview=await api(`/plans/${planId}/assisted/config-refresh`);assert.equal(preview.status,200);
    const refresh=await api(`/plans/${planId}/assisted/config-refresh`,"POST",{expectedConfigRevisionId:preview.body.expectedConfigRevisionId,selectedChangeKeys:[`task_templates:${template.id}`]});assert.equal(refresh.status,200,JSON.stringify(refresh.body));
    const view=async()=>{const result=await api(`/plans/${planId}/effective-configuration`);assert.equal(result.status,200,JSON.stringify(result.body));return result.body.operationContinuity;};
    let effective=await view();assert.equal(effective.groups[0].policy,"OFF");
    await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);
    const daily=page.locator("div.rounded.border.p-3").filter({has:page.getByRole("heading",{name:"Reusable preparation group",exact:true})}).last();
    await daily.getByLabel("Política de continuidad").selectOption("PREFERRED");
    const edit=page.waitForResponse(response=>response.request().method()==="PUT"&&new URL(response.url()).pathname.endsWith("/day-configuration"));
    await daily.getByRole("button",{name:"Guardar continuidad del día"}).click();assert.equal((await edit).status(),200);
    await page.reload();effective=await view();assert.equal(effective.groups[0].policy,"PREFERRED");assert.equal(effective.groups[0].source,"DAY_OVERRIDE");
    assert.equal(preflightEngineInputForPlannerNext(await buildEngineInput(planId,storage)).status,"SUPPORTED");
    const stale=await api(`/plans/${planId}/day-configuration`,"PUT",{operationContinuity:{groupId,policy:"REQUIRED",gapWeight:2},expectedRevisionId:preview.body.expectedConfigRevisionId});assert.equal(stale.status,409);
    for(const role of ["aux","viewer"])assert.equal((await api(`/plans/${planId}/day-configuration`,"PUT",{operationContinuity:{groupId,policy:"REQUIRED",gapWeight:2},expectedRevisionId:effective.revisionId},role)).status,403);
    check("real daily editor saves PREFERRED, reloads the effective input, and rejects stale or unauthorized writes");
    const restored=await api(`/plans/${planId}/day-configuration/restore`,"POST",{capability:"OPERATION_CONTINUITY",operationContinuity:{groupId},expectedRevisionId:effective.revisionId});assert.equal(restored.status,200,JSON.stringify(restored.body));
    assert.equal((await view()).groups[0].policy,"OFF");assert.deepEqual(await protectedRows(),before);
    check("versioned RESTORE preserves Draft/Stage, locks, accepted tasks and frozen Next JSON");
    report.status="PASS";writeFileSync(`${directory}/operation-continuity.json`,JSON.stringify(report,null,2));return report;
  } finally {await browser.close();}
}
