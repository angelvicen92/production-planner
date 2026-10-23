import {incorporateBootstrapAdditions} from "./smokeBootstrapAdditions";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import type pg from "pg";
import { chromium } from "playwright";
import { buildEngineInput } from "../../engine/buildInput";
import { adaptEngineInputToPlannerNextProblem } from "../../engine/planner-next/integration/engineInputAdapter";

type User={id:string;email:string;password:string;token:string};
export async function runNewDayJourney({appUrl,url,anon,service,users,db,directory,pass}:{appUrl:string;url:string;anon:string;service:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(name:string)=>void}) {
  assert.equal(db.host,"127.0.0.1");
  const {storage}=await import("../../server/storage");
  const request=async(path:string,method="GET",body?:unknown,role="admin")=>{
    const response=await fetch(appUrl+path,{method,headers:{"Content-Type":"application/json",Authorization:`Bearer ${users[role].token}`},body:body===undefined?undefined:JSON.stringify(body)});
    const value=await response.json() as any;
    assert.ok(response.status<500,JSON.stringify({path,status:response.status,value}));
    return {status:response.status,body:value};
  };
  const api=async(path:string,method="GET",body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
  const report:any={diagnosticOnly:true,intervention:"restore existing buildInput authorities; no solver changes",remoteWrites:0,days:[],checks:[],startedAt:new Date().toISOString()};
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
    await modal.getByLabel("Auto-crear al crear concursante",{exact:true}).check();
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
  const addParticipant=async(planId:number,name:string,start:string,end:string,coach:string)=>{
    await page.goto(`${appUrl}/plans/${planId}?tab=tasks`);
    await page.getByLabel("Nombre del nuevo concursante").fill(name);
    await page.getByRole("combobox",{name:"Vocal Coach del nuevo concursante",exact:true}).click();await page.getByRole("option",{name:coach,exact:true}).click();
    await page.getByText("Disponibilidad",{exact:true}).locator("..").getByRole("checkbox").check();
    await page.getByTitle("Hora inicio",{exact:true}).fill(start);await page.getByTitle("Hora fin",{exact:true}).fill(end);
    const pending=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/plans/${planId}/contestants`&&response.request().method()==="POST");
    await page.getByRole("button",{name:"Añadir",exact:true}).click();const response=await pending;assert.equal(response.status(),201,await response.text());return response.json();
  };
  const configure=async(spaceId:number,end="12:00")=>{
    await page.goto(`${appUrl}/settings`);await page.getByRole("tab",{name:/general/i}).click();
    await page.getByLabel("Espacio del flujo principal",{exact:true}).selectOption(String(spaceId));
    await page.getByLabel("Fin preferido del flujo principal",{exact:true}).fill(end);
    const pending=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/new-day-planner-configuration"&&response.request().method()==="PUT");
    await page.getByRole("button",{name:"Guardar Planner para futuras jornadas",exact:true}).click();assert.equal((await pending).status(),200);
    await page.getByText("Configuración guardada. Las jornadas existentes conservan su snapshot.",{exact:true}).waitFor();
    await page.screenshot({path:`${directory}/general-planner.png`,fullPage:true});
  };
  const captureInput=async(planId:number,label:string)=>{
    const input=await buildEngineInput(planId,storage);const adapter=adaptEngineInputToPlannerNextProblem(input);
    writeFileSync(`${directory}/${label}-input.json`,JSON.stringify(input,null,2));writeFileSync(`${directory}/${label}-preflight.json`,JSON.stringify(adapter,null,2));return {input,adapter};
  };
  const planToStage=async(planId:number,label:string)=>{
    const {input,adapter}=await captureInput(planId,label);assert.equal(adapter.status,"SUPPORTED",JSON.stringify(adapter.issues));
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
    const existingSession=await request(`/api/plans/${planId}/assisted`);
    const bootstrap=existingSession.status===404?page.waitForResponse(response=>new URL(response.url()).pathname===`/api/plans/${planId}/assisted/session`&&response.request().method()==="POST"):null;
    await page.goto(`${appUrl}/plans/${planId}?tab=planning`);if(bootstrap)assert.equal((await bootstrap).status(),200);
    const path=`/api/plans/${planId}/assisted`;
    const initial=await api(path);assert.equal(initial.activeStage.ordinal,0);assert.equal(initial.draft.tasks.length,input.tasks.length);
    const scope=page.getByTestId("section-assisted-scope");
    await scope.getByRole("checkbox").first().waitFor();
    for(const checkbox of await scope.getByRole("checkbox").all())await checkbox.check();
    const pending=page.waitForResponse(response=>new URL(response.url()).pathname===path+"/proposals"&&response.request().method()==="POST");
    const started=performance.now();await page.getByRole("button",{name:"Generar propuesta",exact:true}).click();const generated=await pending;
    assert.equal(generated.status(),202,await generated.text());const {runId}=await generated.json();
    let run:any;
    const deadline=Date.now()+180_000;
    do{run=await api(path+`/proposals/${runId}`);if(["success","failed","error","cancelled"].includes(run.status))break;await new Promise(resolve=>setTimeout(resolve,250));}while(Date.now()<deadline);
    const result=run.assisted_result_json??run.assistedResultJson;
    writeFileSync(`${directory}/${label}-run.json`,JSON.stringify(run,null,2));
    if(result?.outcome!=="PROPOSAL"){return {planId,outcome:result?.outcome,status:run.status,message:run.message,reasonCodes:result?.reasonCodes,evidence:result?.evidence,stageReached:0};}
    await page.getByRole("button",{name:"Aplicar al borrador",exact:true}).waitFor({timeout:180_000});
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
    const zone=await api("/api/zones","POST",{name:"Producción transporte U00f"});
    const main=await api("/api/spaces","POST",{name:"Entrevistas nuevas",zoneId:zone.id});
    const vocal=await api("/api/spaces","POST",{name:"Preparación nueva",zoneId:zone.id});
    const transport=await api("/api/spaces","POST",{name:"Punto de encuentro",zoneId:zone.id});
    let coachType=(await api("/api/resource-types-with-items")).find((type:any)=>String(type.code).toLowerCase().includes("coach"));
    if(!coachType)coachType=await api("/api/resource-types","POST",{code:"vocal_coach",name:"Vocal Coach"});
    await api("/api/resource-items","POST",{typeId:coachType.id,name:"Coach transporte",defaultAvailabilityStart:"09:00",defaultAvailabilityEnd:"18:00"});
    const arrival=await createTemplate("Traslado azul","auxiliary",transport.id);
    const feeder=await createTemplate("Preparación entrevista","vocal",vocal.id,[arrival.id]);
    const principal=await createTemplate("Entrevista nueva","main",main.id,[feeder.id]);
    const departure=await createTemplate("Retorno verde","auxiliary",transport.id,[principal.id]);
    await configure(main.id);
    await page.goto(`${appUrl}/settings`);
    await page.getByRole("tab",{name:/recursos|resources/i}).click();
    await page.getByLabel("Plantilla Llegada IN",{exact:true}).selectOption(arrival.name);
    await page.getByLabel("Plantilla Salida OUT",{exact:true}).selectOption(departure.name);
    for(const [name,value] of Object.entries({"Mínimo participantes HARD IN":2,"Máximo participantes HARD IN":2,"Tamaño objetivo preferido IN":2,"Separación mínima entre inicios (min) IN":20,"Mínimo participantes HARD OUT":1,"Máximo participantes HARD OUT":2,"Tamaño objetivo preferido OUT":1,"Separación mínima entre inicios (min) OUT":15,"Capacidad de vehículo":2,"Peso agrupación (0-10)":5}))await page.getByLabel(name,{exact:true}).fill(String(value));
    const saved=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/optimizer-settings"&&r.request().method()==="PATCH");
    await page.getByRole("button",{name:"Guardar transporte",exact:true}).click();assert.equal((await saved).status(),200);
    await page.screenshot({path:`${directory}/transport-configuration.png`,fullPage:true});
    const first=await createDay("2026-11-24");
    for(const name of ["Alba propia","Bruno propio"])await addParticipant(first,name,"09:00","17:00","Coach transporte");
    const original=await captureInput(first,"original");
    assert.equal(original.input.transportSettings,undefined);
    assert.ok(original.input.tasks.every(task=>task.operationalRole==="productive_task"));
    assert.equal(original.adapter.status,"SUPPORTED");
    assert.equal(original.adapter.problem.transportPolicy,undefined);
    report.original={planId:first,obligations:original.input.tasks.length,status:original.adapter.status,transportPolicyAbsent:true};
    report.original.readiness=(await api(`/api/plans/${first}/effective-configuration`)).readiness;
    await page.goto(`${appUrl}/plans/${first}?tab=configuration`);
    await page.getByText("Planner Next: READY",{exact:true}).waitFor();
    await page.screenshot({path:`${directory}/original.png`,fullPage:true});
    check("original UI-created day loses configured transport and is falsely supported without transport policy");
    writeFileSync(process.env.OPTIPLAN_U00F_MARKER!,"counterfactual only");
    const counterfactual=await captureInput(first,"counterfactual");
    assert.equal(counterfactual.input.transportSettings?.source,"engine-buildInput-optimizer-transport");
    assert.equal(counterfactual.adapter.status,"SUPPORTED",JSON.stringify(counterfactual.adapter.issues));
    report.days.push(await planToStage(first,"first"));
    check("main-flow counterfactual reaches real proposal, Draft, validation and Stage");
    // Rewind the disposable session through the supported service, then accept a
    // real partial Stage through UI. The completed Stage remains in its history.
    const path=`/api/plans/${first}/assisted`;
    const full=await api(path);const zero=full.history.find((stage:any)=>stage.ordinal===0);
    await api(path+"/rollback","POST",{targetStageId:zero.id});
    await page.goto(`${appUrl}/plans/${first}?tab=planning`);
    const scope=page.getByTestId("section-assisted-scope");await scope.getByRole("checkbox").first().waitFor();
    for(const checkbox of await scope.getByRole("checkbox").all())await checkbox.check();
    for(const label of await scope.locator("label").filter({hasText:"Retorno verde"}).all())await label.getByRole("checkbox").uncheck();
    const generate=async(label:string)=>{
      const pending=page.waitForResponse(r=>new URL(r.url()).pathname===path+"/proposals"&&r.request().method()==="POST");
      await page.getByRole("button",{name:"Generar propuesta",exact:true}).click();const response=await pending;assert.equal(response.status(),202);const {runId}=await response.json();
      let run:any;const deadline=Date.now()+180_000;
      do{run=await api(path+`/proposals/${runId}`);if(["success","failed","error","cancelled"].includes(run.status))break;await new Promise(resolve=>setTimeout(resolve,250));}while(Date.now()<deadline);
      writeFileSync(`${directory}/${label}-run.json`,JSON.stringify(run,null,2));return {runId,run,result:run.assisted_result_json??run.assistedResultJson};
    };
    const partial=await generate("protected-base");assert.equal(partial.result.outcome,"PROPOSAL");
    for(const [name,suffix] of [["Aplicar al borrador",`/proposals/${partial.runId}/apply`],["Validar borrador","/validate"],["Aceptar etapa","/accept-stage"]]){
      const pending=page.waitForResponse(r=>new URL(r.url()).pathname===path+suffix&&r.request().method()==="POST");
      await page.getByRole("button",{name,exact:true}).click();assert.equal((await pending).status(),200);
    }
    const protectedBase=await api(path);writeFileSync(`${directory}/protected-base-stage.json`,JSON.stringify(protectedBase,null,2));
    await page.goto(`${appUrl}/plans/${first}?tab=planning`);await scope.getByRole("checkbox").first().waitFor();
    for(const checkbox of await scope.getByRole("checkbox").all())await checkbox.uncheck();
    for(const label of await scope.locator("label").filter({hasText:"Retorno verde"}).all())await label.getByRole("checkbox").check();
    const continuation=await generate("protected-continuation");
    const after=await api(path);writeFileSync(`${directory}/protected-after.json`,JSON.stringify(after,null,2));
    assert.deepEqual(after.activeStage,protectedBase.activeStage);assert.deepEqual(after.draft,protectedBase.draft);
    report.protectedContinuation={outcome:continuation.result?.outcome,reasonCodes:continuation.result?.reasonCodes,basePreserved:true};
    await page.screenshot({path:`${directory}/protected-continuation.png`,fullPage:true});
    if(continuation.result?.outcome==="PROPOSAL"){
      for(const [name,suffix] of [["Aplicar al borrador",`/proposals/${continuation.runId}/apply`],["Validar borrador","/validate"],["Aceptar etapa","/accept-stage"]]){
        const pending=page.waitForResponse(r=>new URL(r.url()).pathname===path+suffix&&r.request().method()==="POST");
        await page.getByRole("button",{name,exact:true}).click();assert.equal((await pending).status(),200);
      }
      const complete=await api(path);
      const fixed=protectedBase.activeStage.snapshotJson.tasks.filter((task:any)=>task.startPlanned);
      for(const task of fixed)assert.deepEqual(complete.activeStage.snapshotJson.tasks.find((x:any)=>x.taskId===task.taskId),task);
      assert.ok(complete.activeStage.snapshotJson.tasks.every((task:any)=>task.startPlanned&&task.endPlanned));
      writeFileSync(`${directory}/protected-complete-stage.json`,JSON.stringify(complete,null,2));
      report.protectedContinuation.acceptedOrdinal=complete.activeStage.ordinal;report.protectedContinuation.completed=complete.activeStage.snapshotJson.tasks.length;
    }
    check("real protected Stage continuation captured without changing accepted work or Draft");
    await api(`/api/ta/${feeder.id}`,"PATCH",{autoCreateOnContestantCreate:false});
    await api(`/api/ta/${principal.id}`,"PATCH",{autoCreateOnContestantCreate:false});
    const activity=await createTemplate("Retrato independiente","auxiliary",vocal.id,[arrival.id]);
    await api(`/api/ta/${departure.id}`,"PATCH",{autoCreateOnContestantCreate:false});
    const standaloneDeparture=await createTemplate("Vuelta retrato","auxiliary",transport.id,[activity.id]);
    await page.goto(`${appUrl}/settings`);await page.getByRole("tab",{name:/general/i}).click();
    await page.getByLabel("Perfil de la jornada",{exact:true}).selectOption("STANDALONE_ONLY");
    const profileSaved=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/new-day-planner-configuration"&&r.request().method()==="PUT");
    await page.getByRole("button",{name:"Guardar Planner para futuras jornadas",exact:true}).click();assert.equal((await profileSaved).status(),200);
    await page.getByRole("tab",{name:/recursos|resources/i}).click();await page.getByLabel("Máximo participantes HARD IN",{exact:true}).fill("3");
    await page.getByLabel("Capacidad de vehículo",{exact:true}).fill("3");
    await page.getByLabel("Plantilla Salida OUT",{exact:true}).selectOption(standaloneDeparture.name);
    const transportSaved=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/optimizer-settings"&&r.request().method()==="PATCH");
    await page.getByRole("button",{name:"Guardar transporte",exact:true}).click();assert.equal((await transportSaved).status(),200);
    const second=await createDay("2026-11-25");
    for(const name of ["Celia retrato","Dario retrato","Elena retrato"])await addParticipant(second,name,"09:00","17:00","Coach transporte");
    report.days.push(await planToStage(second,"second"));
    check("standalone counterfactual outcome recorded without declaring false completeness");
    report.status=report.protectedContinuation.outcome==="PROPOSAL"&&report.days[1].completed?"REVIEW_WIRING":"BLOCKED";
    const firstAgain=await captureInput(first,"first-after-general-change");
    assert.equal(firstAgain.adapter.problemFingerprint,report.days[0].problemFingerprint);
    check("first daily transport snapshot survives changes to general transport and profile");
    save();return report;
  } finally {
    save();await context.tracing.stop({path:`${directory}/browser-private.zip`});await browser.close();
    try{unlinkSync(process.env.OPTIPLAN_U00F_MARKER!);}catch{}
  }
}
