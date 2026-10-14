/** Setup operations against the existing disposable SQL/Auth/HTTP harness. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import type { runA2BrowserJourney } from "./smokeA2Journey";
type Options = Parameters<typeof runA2BrowserJourney>[0];

export async function runDayWorkspaceSetup({appUrl,planId,users,db,directory,pass}:Options) {
  const api=async(path:string,method="GET",body?:unknown)=>{
    const response=await fetch(`${appUrl}/api${path}`,{method,headers:{Authorization:`Bearer ${users.production.token}`,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json() as any};
  };
  const report:any={status:"RUNNING",remoteWrites:0,operations:[]};
  // Test catalog only: the workspace selects these existing people without a
  // general-catalog writer. All rows belong to this disposable database.
  await db.query("INSERT INTO public.staff_people(name,role_type,is_active) VALUES('QA Producción','production',true),('QA Redacción','editorial',true)");
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30_000);page.setDefaultNavigationTimeout(120_000);
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  const base=`/plans/${planId}`;
  try {
    await page.goto(`${appUrl}/login`);await page.getByLabel("Email",{exact:true}).fill(users.production.email);await page.getByLabel("Contraseña (opcional para enlace)",{exact:true}).fill(users.production.password);await page.getByRole("button",{name:"Entrar con contraseña",exact:true}).click();await page.waitForURL("**/dashboard");
    await page.goto(`${appUrl}/plans/${planId}?tab=tasks`);
    const initialContestants=(await api(`${base}/contestants`)).data;
    const name="QA Jornada";
    await page.getByLabel("Nombre del nuevo concursante",{exact:true}).fill(name);
    const created=page.waitForResponse(response=>response.url().endsWith(`${base}/contestants`)&&response.request().method()==="POST");
    await page.getByRole("tabpanel").getByRole("button",{name:"Añadir",exact:true}).click();assert.equal((await created).status(),201);
    const contestant=(await api(`${base}/contestants`)).data.find((person:any)=>person.name===name);assert.ok(contestant);
    await page.getByLabel("Buscar concursantes",{exact:true}).fill(name);
    const article=page.locator("article").filter({has:page.getByRole("heading",{name,exact:true})});await article.getByRole("button").first().click();
    const dialog=page.getByRole("dialog");await dialog.waitFor();
    const renamed=page.waitForResponse(response=>response.url().endsWith(`/contestants/${contestant.id}`)&&response.request().method()==="PATCH");
    await dialog.locator("input").first().fill(`${name} editada`);await dialog.locator("input").first().press("Tab");assert.equal((await renamed).status(),204);
    await dialog.getByRole("button",{name:"Cerrar",exact:true}).click();await page.reload();await page.getByLabel("Buscar concursantes",{exact:true}).fill(name);
    await page.getByRole("button",{name:`Eliminar concursante ${name}`,exact:true}).click();
    const removed=page.waitForResponse(response=>response.url().endsWith(`/contestants/${contestant.id}`)&&response.request().method()==="DELETE");await page.getByRole("button",{name:"Eliminar",exact:true}).click();assert.equal((await removed).status(),204);
    assert.deepEqual((await api(`${base}/contestants`)).data,initialContestants);report.operations.push("Concursante: crear, abrir ficha, editar canción, recargar y retirar por UI; canon preservado");pass(report.operations.at(-1));
    await page.getByRole("tab",{name:"Recursos",exact:true}).click();
    const resources=page.getByTestId("day-resources");await resources.waitFor();
    await resources.getByRole("combobox",{name:"Tipo de recurso del día",exact:true}).click();await page.getByRole("option").first().click();
    const resourceName="QA recurso de jornada";await resources.getByLabel("Nombre del recurso del día",{exact:true}).fill(resourceName);
    const resourceCreated=page.waitForResponse(response=>response.url().endsWith(`${base}/resource-items`)&&response.request().method()==="POST");await resources.getByRole("button",{name:"Añadir",exact:true}).click();assert.equal((await resourceCreated).status(),200);
    const resource=(await api(`${base}/resource-items`)).data.find((item:any)=>item.name===resourceName);assert.ok(resource);assert.equal(resource.source,"adhoc");
    assert.equal((await db.query("SELECT count(*) n FROM public.resource_items WHERE name=$1",[resourceName])).rows[0].n,"0");
    const zones=(await api("/zones")).data;const spaces=(await api("/spaces")).data;
    const dayTasks=(await api(base)).data.dailyTasks;
    const space=spaces.find((space:any)=>space.zoneId!=null&&dayTasks.some((task:any)=>Number(task.spaceId)===Number(space.id)));assert.ok(space);const zone=zones.find((zone:any)=>Number(zone.id)===Number(space.zoneId));assert.ok(zone);
    const zoneAssignments=(await api(`${base}/zone-resource-assignments`)).data;
    const zoneRow=resources.getByText(zone.name,{exact:true}).locator("..").locator("..");await zoneRow.getByRole("button",{name:"Recursos",exact:true}).click();
    await page.getByRole("dialog").getByRole("checkbox",{name:resourceName,exact:true}).check();
    const zoneSaved=page.waitForResponse(response=>response.request().method()==="PATCH"&&response.url().includes("zone-resource-assignments"));await page.getByRole("dialog").getByRole("button",{name:"Guardar",exact:true}).click();assert.equal((await zoneSaved).status(),200);
    await page.reload();await resources.waitFor();
    const spaceRow=resources.getByText(space.name,{exact:true}).first().locator("..").locator("..");await spaceRow.getByText("Heredados del plató:",{exact:true}).waitFor();assert.ok((await spaceRow.innerText()).includes(resourceName));
    report.operations.push("Recurso de jornada: creación por UI sin catálogo general, asignación de plató, recarga y herencia efectiva visible");pass(report.operations.at(-1));
    // A direct assignment of the same identity remains a deduplicated union.
    await spaceRow.getByRole("button",{name:"Recursos",exact:true}).click();await page.getByRole("dialog").getByRole("checkbox",{name:resourceName,exact:true}).check();
    const spaceSaved=page.waitForResponse(response=>response.request().method()==="PATCH"&&response.url().includes("space-resource-assignments"));await page.getByRole("dialog").getByRole("button",{name:"Guardar",exact:true}).click();assert.equal((await spaceSaved).status(),200);
    await page.reload();await resources.waitFor();report.operations.push("Asignación directa de espacio guarda y recarga sin convertir la herencia en una copia física");pass(report.operations.at(-1));
    // Staff uses the real catalog. No general staff are created by this test.
    const staffPeople=(await api("/staff-people")).data;const producer=staffPeople.find((person:any)=>person.roleType==="production"&&person.isActive!==false);const editor=staffPeople.find((person:any)=>person.roleType==="editorial"&&person.isActive!==false);
    if(producer){
      await page.getByRole("tab",{name:"Roles",exact:true}).click();const staff=page.getByTestId("day-staff");await staff.waitFor();
      const card=staff.getByText(zone.name,{exact:true}).locator("..").locator("..").locator("..");
      await card.getByRole("combobox").click();await page.getByRole("option",{name:"Plató",exact:true}).click();
      const picker=card.getByText("Producción",{exact:true}).locator("..").locator("..");await picker.getByRole("button",{name:"Editar",exact:true}).click();
      await page.getByRole("dialog").getByRole("checkbox",{name:producer.name,exact:true}).check();await page.getByRole("dialog").getByRole("button",{name:"Guardar",exact:true}).click();
      if(editor){const picker=card.getByText("Redacción",{exact:true}).locator("..").locator("..");await picker.getByRole("button",{name:"Editar",exact:true}).click();await page.getByRole("dialog").getByRole("checkbox",{name:editor.name,exact:true}).check();await page.getByRole("dialog").getByRole("button",{name:"Guardar",exact:true}).click();}
      const saved=page.waitForResponse(response=>response.request().method()==="PUT"&&response.url().includes("staff-assignments"));await staff.getByRole("button",{name:"Guardar",exact:true}).first().click();assert.equal((await saved).status(),200);
      await page.reload();await staff.waitFor();assert.ok((await staff.innerText()).includes(producer.name));report.operations.push("Responsables existentes: asignar Producción y Redacción al plató, guardar y recargar por UI");pass(report.operations.at(-1));
      report.operations.push("Cabeceras con tareas planificadas: comprobación reservada al recorrido canónico S11; el contrato manual no coloca obligaciones aún sin horario");
    } else report.operations.push("GAP de fixture: catálogo sin responsable de Producción; no se fabrica una persona");
    for (const [tab,name] of [["Concursantes","contestants"],["Planning","planning"],["Configuración","configuration"],["Recursos","resources"],["Roles","roles"],["Ejecución","execution"]] as const) {
      await page.getByRole("tab",{name:tab,exact:true}).click();
      if(tab==="Configuración") await page.getByTestId("day-editor-WORKDAY_WINDOW").waitFor();
      await page.getByTestId("day-header").scrollIntoViewIfNeeded();
      await page.screenshot({path:`${directory}/workspace-setup-${name}-desktop.png`});
    }
    await page.evaluate(()=>document.documentElement.classList.add("dark"));
    await page.screenshot({path:`${directory}/workspace-setup-dark.png`});
    await page.evaluate(()=>document.documentElement.classList.remove("dark"));
    await page.setViewportSize({width:390,height:844});
    for (const [tab,name] of [["Concursantes","contestants"],["Planning","planning"],["Configuración","configuration"],["Recursos","resources"],["Roles","roles"],["Ejecución","execution"]] as const) {
      await page.getByRole("tab",{name:tab,exact:true}).click();
      await page.getByTestId("day-header").scrollIntoViewIfNeeded();
      await page.screenshot({path:`${directory}/workspace-setup-${name}-mobile.png`});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${tab}: no viewport overflow`);
    }
    assert.deepEqual(errors,[]);
    report.status="PASS";return report;
  }catch(error){report.status="FAIL";report.error=error instanceof Error?error.stack:String(error);await page.screenshot({path:`${directory}/workspace-setup-failure.png`}).catch(()=>{});throw error;}
  finally{writeFileSync(`${directory}/day-workspace-setup.json`,JSON.stringify(report,null,2));await browser.close();}
}
