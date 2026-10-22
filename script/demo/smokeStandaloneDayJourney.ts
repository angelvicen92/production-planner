import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import type pg from "pg";
import { chromium } from "playwright";
import { buildEngineInput } from "../../engine/buildInput";
import { buildAssistedProblem,createPlanningScope,executeAssistedPlanning } from "../../engine/planner-next/assistedPlanning";
import { adaptEngineInputToPlannerNextProblem } from "../../engine/planner-next/integration/engineInputAdapter";

type User={id:string;email:string;password:string;token:string};
export async function runStandaloneDayJourney({appUrl,url,anon,service,users,db,directory,pass}:{appUrl:string;url:string;anon:string;service:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(name:string)=>void}) {
  assert.equal(db.host,"127.0.0.1");
  const {storage}=await import("../../server/storage");
  const request=async(path:string,method="GET",body?:unknown,role="admin")=>{
    const response=await fetch(appUrl+path,{method,headers:{"Content-Type":"application/json",Authorization:`Bearer ${users[role].token}`},body:body===undefined?undefined:JSON.stringify(body)});
    const value=await response.json() as any;
    assert.ok(response.status<500,JSON.stringify({path,status:response.status,value}));
    return {status:response.status,body:value};
  };
  const api=async(path:string,method="GET",body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
  const report:any={remoteWrites:0,days:[],checks:[],startedAt:new Date().toISOString()};
  const save=()=>writeFileSync(`${directory}/journey.json`,JSON.stringify(report,null,2));
  const check=(name:string)=>{report.checks.push(name);pass(name);save();};
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  const page=await context.newPage();page.setDefaultTimeout(30_000);
  const uiErrors:string[]=[];page.on("pageerror",error=>uiErrors.push(error.message));
  const login=async()=>{
    await page.goto(`${appUrl}/login`);await page.getByLabel("Email",{exact:true}).fill(users.admin.email);
    await page.getByLabel("Contraseña (opcional para enlace)",{exact:true}).fill(users.admin.password);
    await page.getByRole("button",{name:"Entrar con contraseña",exact:true}).click();await page.waitForURL("**/dashboard");
  };
  const createTemplate=async(name:string,kind:string,spaceId:number,dependencyIds:number[]=[])=>{
    await page.goto(`${appUrl}/settings`);await page.getByRole("tab",{name:/plantillas|templates/i}).click();
    await page.getByRole("button",{name:"Create",exact:true}).click();const modal=page.getByRole("dialog");
    await modal.getByPlaceholder("Name",{exact:true}).fill(name);
    await modal.getByLabel("Rol operativo Planner Next",{exact:true}).selectOption(kind);
    if(kind==="main"||kind==="vocal")await modal.getByText("Requiere el coach asignado al participante",{exact:true}).getByRole("checkbox").check();
    await modal.getByLabel("Espacio de la plantilla",{exact:true}).selectOption(String(spaceId));
    await modal.getByLabel("Plantillas previas",{exact:true}).selectOption(dependencyIds.map(String));
    await modal.locator('input[type="number"]').first().fill("10");
    await modal.getByPlaceholder("Antes: heredado").fill("0");await modal.getByPlaceholder("Después: heredado").fill("0");
    if(kind!=="technical")await modal.getByLabel("Auto-crear al crear concursante",{exact:true}).check();
    const pending=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/task-templates"&&response.request().method()==="POST");
    await modal.getByRole("button",{name:"Guardar",exact:true}).click();const response=await pending;assert.equal(response.status(),201,await response.text());
    const template=await response.json();await modal.waitFor({state:"hidden"});
    return template;
  };
  const createDay=async(date:string)=>{
    await page.goto(`${appUrl}/plans`);await page.getByRole("button",{name:"Crear día",exact:true}).click();
    const modal=page.getByRole("dialog");await modal.getByLabel("Fecha",{exact:true}).fill(date);
    const pending=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/plans"&&response.request().method()==="POST");
    await modal.getByRole("button",{name:"Crear día",exact:true}).click();const response=await pending;
    assert.equal(response.status(),201,await response.text());const day=await response.json();await modal.waitFor({state:"hidden"});return Number(day.id);
  };
  const addParticipant=async(planId:number,name:string,start:string,end:string,coach?:string)=>{
    await page.goto(`${appUrl}/plans/${planId}?tab=tasks`);
    await page.getByLabel("Nombre del nuevo concursante").fill(name);
    if(coach){await page.getByRole("combobox",{name:"Vocal Coach del nuevo concursante",exact:true}).click();await page.getByRole("option",{name:coach,exact:true}).click();}
    await page.getByText("Disponibilidad",{exact:true}).locator("..").getByRole("checkbox").check();
    await page.getByTitle("Hora inicio",{exact:true}).fill(start);await page.getByTitle("Hora fin",{exact:true}).fill(end);
    const pending=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/plans/${planId}/contestants`&&response.request().method()==="POST");
    await page.getByRole("button",{name:"Añadir",exact:true}).click();const response=await pending;assert.equal(response.status(),201,await response.text());return response.json();
  };
  const configure=async()=>{
    await page.goto(`${appUrl}/settings`);await page.getByRole("tab",{name:/general/i}).click();
    await page.getByLabel("Perfil de la jornada",{exact:true}).selectOption("STANDALONE_ONLY");
    assert.equal(await page.getByLabel("Espacio del flujo principal",{exact:true}).count(),0);
    const pending=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/new-day-planner-configuration"&&response.request().method()==="PUT");
    await page.getByRole("button",{name:"Guardar Planner para futuras jornadas",exact:true}).click();assert.equal((await pending).status(),200);
    await page.getByText("Configuración guardada. Las jornadas existentes conservan su snapshot.",{exact:true}).waitFor();
    await page.screenshot({path:`${directory}/general-planner.png`,fullPage:true});
  };
  const addTechnicalTask=async(planId:number,name:string)=>{
    await page.goto(`${appUrl}/plans/${planId}?tab=tasks`);
    await page.getByRole("button",{name:"Añadir tarea",exact:true}).click();const modal=page.getByRole("dialog");
    await modal.getByRole("combobox",{name:"Plantilla de tarea",exact:true}).click();
    await page.getByRole("option",{name:`${name} (10min)`,exact:true}).click();
    const pending=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/daily-tasks"&&response.request().method()==="POST");
    await modal.getByRole("button",{name:"Añadir tarea",exact:true}).click();const response=await pending;
    assert.equal(response.status(),201,await response.text());await modal.waitFor({state:"hidden"});
  };
  const captureInput=async(planId:number,label:string)=>{
    const input=await buildEngineInput(planId,storage);const adapter=adaptEngineInputToPlannerNextProblem(input);
    writeFileSync(`${directory}/${label}-input.json`,JSON.stringify(input,null,2));writeFileSync(`${directory}/${label}-preflight.json`,JSON.stringify(adapter,null,2));return {input,adapter};
  };
  const planToStage=async(planId:number,label:string)=>{
    const {input,adapter}=await captureInput(planId,label);assert.equal(adapter.status,"SUPPORTED",JSON.stringify(adapter.issues));
    assert.equal("mainFlow" in adapter.problem,false);assert.equal(adapter.problem.coaches.length,0);
    assert.ok(input.tasks.every(task=>task.plannerNextKind==="auxiliary"||task.plannerNextKind==="technical"));
    const replayScope=createPlanningScope({kind:"DAY",value:"replay"},{},adapter.problem.tasks.map(task=>task.id));
    const replayA=executeAssistedPlanning(buildAssistedProblem(adapter.problem,replayScope,[]));
    const replayB=executeAssistedPlanning(buildAssistedProblem(adapter.problem,replayScope,[]));
    assert.equal(replayA.evidence.completeForScope,true,replayA.evidence.reasonCodes.join(","));
    assert.deepEqual(replayA.proposal,replayB.proposal);assert.equal(replayA.evidence.fingerprint,replayB.evidence.fingerprint);
    writeFileSync(`${directory}/${label}-replay.json`,JSON.stringify({a:replayA,b:replayB},null,2));
    const authority=(await db.query("SELECT planner_next_profile,itinerant_composition_version FROM plans WHERE id=$1",[planId])).rows[0];
    assert.equal(authority.itinerant_composition_version,1);
    assert.ok(authority.planner_next_profile.configuration,"the same created day freezes the Next profile");
    assert.deepEqual(input.itinerantCompositionSnapshot,{contractVersion:1,units:[]},"an empty physical catalog is a valid daily snapshot");
    assert.ok(input.tasks.every(task=>task.plannerNextKind),"physical mapping preserves every explicit Next role");
    const ready=await api(`/api/plans/${planId}/effective-configuration`);assert.equal(ready.readiness.status,"READY",JSON.stringify(ready.readiness));
    assert.equal(ready.plannerProfile.sourceRevision,authority.planner_next_profile.sourceRevision);
    assert.deepEqual(ready.itinerantComposition.units,[]);
    await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);await page.getByText("Planner Next: READY",{exact:true}).waitFor();
    await page.screenshot({path:`${directory}/${label}-ready.png`,fullPage:true});
    const bootstrap=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/plans/${planId}/assisted/session`&&response.request().method()==="POST");
    await page.goto(`${appUrl}/plans/${planId}?tab=planning`);assert.equal((await bootstrap).status(),200);
    const path=`/api/plans/${planId}/assisted`;
    const initial=await api(path);assert.equal(initial.activeStage.ordinal,0);assert.equal(initial.draft.tasks.length,input.tasks.length);
    const scope=page.getByTestId("section-assisted-scope");
    for(const checkbox of await scope.getByRole("checkbox").all())await checkbox.check();
    const pending=page.waitForResponse(response=>new URL(response.url()).pathname===path+"/proposals"&&response.request().method()==="POST");
    const started=performance.now();await page.getByRole("button",{name:"Generar propuesta",exact:true}).click();const generated=await pending;
    assert.equal(generated.status(),202,await generated.text());const {runId}=await generated.json();
    await page.getByRole("button",{name:"Aplicar al borrador",exact:true}).waitFor({timeout:180_000});
    const run=await api(path+`/proposals/${runId}`);const result=run.assisted_result_json??run.assistedResultJson;
    assert.equal(run.status,"success",JSON.stringify(run));assert.equal(result.outcome,"PROPOSAL");
    writeFileSync(`${directory}/${label}-proposal.json`,JSON.stringify(result,null,2));
    const rows=async()=>(await db.query("SELECT to_jsonb(t) row FROM daily_tasks t WHERE plan_id=$1 ORDER BY id",[planId])).rows;
    const before=await rows();
    const action=async(name:string,suffix:string)=>{
      const response=page.waitForResponse(response=>new URL(response.url()).pathname===path+suffix&&response.request().method()==="POST");
      await page.getByRole("button",{name,exact:true}).click();const done=await response;assert.equal(done.status(),200,await done.text());return done.json();
    };
    await action("Aplicar al borrador",`/proposals/${runId}/apply`);assert.deepEqual(await rows(),before);
    const draft=await api(path);writeFileSync(`${directory}/${label}-draft.json`,JSON.stringify(draft,null,2));
    await action("Validar borrador","/validate");const validated=await api(path);
    assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
    writeFileSync(`${directory}/${label}-validation.json`,JSON.stringify(validated.validation,null,2));
    await action("Aceptar etapa","/accept-stage");const accepted=await api(path);
    assert.equal(accepted.activeStage.ordinal,1);
    assert.ok(accepted.activeStage.snapshotJson.tasks.every((task:any)=>task.startPlanned&&task.endPlanned));
    assert.deepEqual(accepted.activeStage.snapshotJson,draft.draft);
    const final=await storage.getTasksForPlan(planId);assert.ok(final.every(task=>task.startPlanned&&task.endPlanned));
    const revisions=(await db.query("SELECT id,fingerprint,replay_snapshot_json FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id",[planId])).rows;
    const acceptedRevision=revisions.find(revision=>Number(revision.id)===Number(accepted.currentConfigRevisionId));
    assert.deepEqual(acceptedRevision.replay_snapshot_json.authorities.plan_workday[0].itinerantComposition,{contractVersion:1,units:[]},"the accepted revision freezes the empty physical authority alongside Next");
    writeFileSync(`${directory}/${label}-config-revisions.json`,JSON.stringify(revisions,null,2));
    writeFileSync(`${directory}/${label}-stage.json`,JSON.stringify(accepted,null,2));await page.screenshot({path:`${directory}/${label}-accepted.png`,fullPage:true});
    return {planId,obligations:input.tasks.length,completed:final.length,stages:1,durationMs:Math.round(performance.now()-started),problemFingerprint:adapter.problemFingerprint,
      combinedAuthorities:{plannerProfileRevision:authority.planner_next_profile.sourceRevision,itinerantCompositionVersion:1,itinerantUnitCount:0},
      branches:result.evidence?.branchesExplored??result.evidence?.work,hardCount:0,requiredCount:0};
  };
  try {
    await login();
    await api("/api/program-settings","PATCH",{defaultWorkStart:"09:00",defaultWorkEnd:"18:00",mealStart:"13:00",mealEnd:"14:00",mealMode:"global_hard_break"});
    const zone=await api("/api/zones","POST",{name:"Producción independiente"});
    const roomA=await api("/api/spaces","POST",{name:"Sala de preparación",zoneId:zone.id});
    const roomB=await api("/api/spaces","POST",{name:"Sala de grabación",zoneId:zone.id});
    const prepare=await createTemplate("Preparar entrevista auxiliar","auxiliary",roomA.id);
    const record=await createTemplate("Grabar entrevista auxiliar","auxiliary",roomB.id,[prepare.id]);
    await configure();
    const first=await createDay("2026-11-24");
    await addParticipant(first,"Marta auxiliar","09:00","11:00");
    await addParticipant(first,"Nora auxiliar","10:00","12:00");
    await addParticipant(first,"Pablo auxiliar","14:00","17:00");
    report.days.push(await planToStage(first,"first"));
    assert.equal(report.days[0].completed,6);check("six auxiliary tasks, three participants without coaches, two templates/spaces and dependencies reach an accepted Stage through the UI");
    const frozen=await captureInput(first,"first-frozen");
    const general=await api("/api/new-day-planner-configuration");
    const changed={...general.configuration,resourceTransitionMinutes:5};
    await api("/api/new-day-planner-configuration","PUT",{expectedRevision:general.revision,configuration:changed});
    const isolated=await captureInput(first,"first-after-general-change");assert.deepEqual(isolated.input,frozen.input);
    assert.equal((await request("/api/new-day-planner-configuration","PUT",{expectedRevision:general.revision,configuration:changed})).status,409);
    for(const role of ["production","aux","viewer","norole"]){
      assert.equal((await request("/api/new-day-planner-configuration","PUT",{expectedRevision:general.revision+1,configuration:changed},role)).status,403);
    }
    const immutable=await db.query("SELECT planner_next_profile FROM plans WHERE id=$1",[first]);
    await assert.rejects(db.query("UPDATE plans SET planner_next_profile=$2::jsonb WHERE id=$1",[first,JSON.stringify({...immutable.rows[0].planner_next_profile,sourceRevision:999})]));
    check("general CAS and roles, immutable day snapshot and exact isolation after changing general configuration");
    const type=await api("/api/resource-types","POST",{code:"measurement_kit",name:"Equipo de medición"});
    await api("/api/resource-items","POST",{typeId:type.id,name:"Kit físico compartido",defaultAvailabilityStart:"09:30",defaultAvailabilityEnd:"16:00"});
    const install=await createTemplate("Instalar sistema técnico","technical",roomA.id);
    const calibrate=await createTemplate("Calibrar sistema técnico","technical",roomB.id,[install.id]);
    const verify=await createTemplate("Verificar sistema técnico","technical",roomA.id,[calibrate.id]);
    const second=await createDay("2026-11-25");
    for(const t of [install,calibrate,verify])await addTechnicalTask(second,t.name);
    const resources=await api(`/api/plans/${second}/resource-items`);const kit=resources.find((r:any)=>r.name==="Kit físico compartido");assert.ok(kit);
    for(const room of [roomA,roomB])await api(`/api/plans/${second}/spaces/${room.id}/space-resource-assignments`,"PATCH",{planResourceItemIds:[kit.id]});
    await api(`/api/plans/${second}/spaces/${roomA.id}/availability`,"PATCH",{availabilityStart:"09:00",availabilityEnd:"12:00"});
    await api(`/api/plans/${second}/spaces/${roomB.id}/availability`,"PATCH",{availabilityStart:"10:00",availabilityEnd:"16:00"});
    report.days.push(await planToStage(second,"second"));assert.equal(report.days[1].completed,3);
    const technical=await captureInput(second,"second-accepted-input");
    assert.equal(technical.input.tasks.filter(t=>t.contestantId!=null).length,0);
    check("three technical operations with no participants, shared physical resource, dependencies and distinct spatial/resource windows reach Stage through the UI");
    const mixed=await createDay("2026-11-26");
    const bad=await createTemplate("Rol incompatible vocal","vocal",roomB.id);
    // Snapshot creation precedes catalog changes: add the incompatible role to a
    // fresh day, never reinterpret an existing frozen template.
    const incompatible=await createDay("2026-11-27");await addParticipant(incompatible,"Persona incompatible","09:00","17:00");
    const mismatch=await captureInput(incompatible,"incompatible-role");assert.equal(mismatch.adapter.status,"UNSUPPORTED");
    assert.ok(mismatch.adapter.reasonCodes.includes("UNSUPPORTED_TASK_ROLE"));
    assert.notEqual((await api(`/api/plans/${incompatible}/effective-configuration`)).readiness.status,"READY");
    for(const t of [install,calibrate,verify])await addTechnicalTask(mixed,t.name);
    const negativeResources=await api(`/api/plans/${mixed}/resource-items`);const narrow=negativeResources.find((r:any)=>r.name==="Kit físico compartido");
    await api(`/api/plans/${mixed}/resource-items/${narrow.id}`,"PATCH",{availabilityStart:"09:00",availabilityEnd:"09:05"});
    for(const room of [roomA,roomB])await api(`/api/plans/${mixed}/spaces/${room.id}/space-resource-assignments`,"PATCH",{planResourceItemIds:[narrow.id]});
    const impossible=await captureInput(mixed,"infeasible");assert.equal(impossible.adapter.status,"SUPPORTED");
    await api(`/api/plans/${mixed}/assisted/session`,"POST",{});
    const state=await api(`/api/plans/${mixed}/assisted`);
    const run=await api(`/api/plans/${mixed}/assisted/proposals`,"POST",{selector:{kind:"TASK_IDS",taskIds:impossible.input.tasks.map(t=>t.id)},includePrerequisites:true,expectedDraftFingerprint:state.draftFingerprint,expectedBaseStageId:state.draftBaseStageId});
    let result:any;
    for(let attempt=0;attempt<120;attempt++){
      const observed=await api(`/api/plans/${mixed}/assisted/proposals/${run.runId}`);
      result=observed.assisted_result_json??observed.assistedResultJson;if(result)break;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    assert.ok(result);assert.equal(result.outcome,"NO_PROPOSAL");assert.equal(result.proposal,null);assert.ok(result.reasonCodes.length);
    writeFileSync(`${directory}/infeasible-result.json`,JSON.stringify(result,null,2));
    const after=await api(`/api/plans/${mixed}/assisted`);assert.deepEqual(after.draft,state.draft);assert.equal(after.activeStage.ordinal,0);
    assert.deepEqual(uiErrors,[]);report.status="PASS";
    check("incompatible roles block readiness; physically infeasible resource window gives an explicit NO_PROPOSAL without partial Draft or Stage");return report;
  } finally {
    if(report.status!=="PASS")await page.screenshot({path:`${directory}/failure.png`,fullPage:true}).catch(()=>{});
    save();await context.tracing.stop({path:`${directory}/browser-private-trace.zip`});await browser.close();
  }
}
