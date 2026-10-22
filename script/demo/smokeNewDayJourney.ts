import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
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
    const zone=await api("/api/zones","POST",{name:"Nuevo estudio de producción"});
    const main=await api("/api/spaces","POST",{name:"Escenario de entrevistas",zoneId:zone.id});
    const vocal=await api("/api/spaces","POST",{name:"Preparación de voz",zoneId:zone.id});
    const types=await api("/api/resource-types-with-items");let coachType=types.find((type:any)=>String(type.code).toLowerCase().includes("coach"));
    if(!coachType)coachType=await api("/api/resource-types","POST",{code:"vocal_coach",name:"Vocal Coach"});
    await api("/api/resource-items","POST",{typeId:coachType.id,name:"Coach de esta producción",defaultAvailabilityStart:"09:00",defaultAvailabilityEnd:"18:00"});
    const feeder=await createTemplate("Preparación de voz para entrevista","vocal",vocal.id);
    const principal=await createTemplate("Entrevista individual","main",main.id,[feeder.id]);
    report.templates=[feeder,principal];check("two templates created in the real UI with explicit roles, spaces, availability margins and a dependency");
    // Before configuration, the same ordinary create-day path has no Next base.
    const beforeId=await createDay("2026-11-20");await addParticipant(beforeId,"Participante de diagnóstico","09:00","17:00","Coach de esta producción");
    const before=await captureInput(beforeId,"before");assert.equal(before.adapter.status,"UNSUPPORTED");
    for(const code of ["MISSING_SEARCH_POLICY_CONFIGURATION","MISSING_SEARCH_BUDGET_CONFIGURATION","MISSING_MAIN_FLOW_CONFIGURATION"])assert.ok(before.adapter.reasonCodes.includes(code as any));
    assert.notEqual((await api(`/api/plans/${beforeId}/effective-configuration`)).readiness.status,"READY");report.before={planId:beforeId,reasonCodes:before.adapter.reasonCodes};check("ordinary UI-created day reproduces the absent authorities and never reports READY");
    await configure(main.id);
    const first=await createDay("2026-11-21");await addParticipant(first,"Ana entrevista","09:00","17:00","Coach de esta producción");await addParticipant(first,"Luis entrevista","09:30","16:30","Coach de esta producción");
    report.days.push(await planToStage(first,"first"));check("first new day: productive Next proposal, Draft, validation, accepted Stage and all obligations scheduled through the UI");
    // Second day has another physical main space, another family and more people.
    const secondMain=await api("/api/spaces","POST",{name:"Escenario de segunda producción",zoneId:zone.id});
    await api("/api/resource-items","POST",{typeId:coachType.id,name:"Coach segunda producción",defaultAvailabilityStart:"09:00",defaultAvailabilityEnd:"18:00"});
    await api(`/api/ta/${principal.id}`,"PATCH",{spaceId:secondMain.id});
    const auxiliary=await createTemplate("Fotografía individual","auxiliary",vocal.id,[feeder.id]);
    await configure(secondMain.id,"11:30");
    const second=await createDay("2026-11-22");
    for(const [index,name] of ["Berta sesión","Clara sesión","Diego sesión"].entries())await addParticipant(second,name,index?"09:30":"09:00","17:00",index===1?"Coach segunda producción":"Coach de esta producción");
    report.days.push(await planToStage(second,"second"));check("second independent new day completes nine obligations with different participants, templates and main space");
    const firstAgain=await captureInput(first,"first-after-general-change");assert.equal(firstAgain.adapter.problemFingerprint,report.days[0].problemFingerprint);
    assert.equal((await api(`/api/plans/${first}/assisted`)).activeStage.ordinal,1);
    const frozen=(await db.query("SELECT planner_next_profile,planner_next_configuration FROM plans WHERE id=$1",[first])).rows[0];assert.equal(frozen.planner_next_configuration,null);
    await assert.rejects(db.query("UPDATE plans SET planner_next_profile='{}' WHERE id=$1",[first]),/PLANNER_NEXT_PROFILE_IMMUTABLE/);
    for(const role of ["production","viewer","aux","norole"]){const r=await request("/api/new-day-planner-configuration","PUT",{expectedRevision:0,configuration:null},role);assert.equal(r.status,403);}
    const stale=await request("/api/new-day-planner-configuration","PUT",{expectedRevision:0,configuration:null});assert.equal(stale.status,409);
    const rest=await fetch(url+"/rest/v1/new_day_planner_configuration?select=*",{headers:{apikey:anon,Authorization:`Bearer ${users.admin.token}`}});assert.equal(rest.status,403);

    // An addition after S0 must invalidate the old configuration identity,
    // while its original Stage/Draft remain immutable. Reconciliation is a
    // separate product capability; do not pretend the prior snapshot grew.
    const changed=await createDay("2026-11-25");await addParticipant(changed,"Alta inicial","09:00","17:00","Coach de esta producción");
    const prior=await api(`/api/plans/${changed}/assisted/session`,"POST",{});
    await addParticipant(changed,"Alta posterior","09:30","17:00","Coach segunda producción");
    const changedInput=await captureInput(changed,"added-after-s0");assert.equal(changedInput.adapter.status,"SUPPORTED");
    const submitted=await api(`/api/plans/${changed}/assisted/proposals`,"POST",{selector:{kind:"TASK_IDS",taskIds:changedInput.input.tasks.map(task=>task.id)},includePrerequisites:true,
      expectedDraftFingerprint:prior.draftFingerprint,expectedBaseStageId:prior.draftBaseStageId});
    let staleRun:any;
    for(let attempt=0;attempt<40;attempt++){
      staleRun=await api(`/api/plans/${changed}/assisted/proposals/${submitted.runId}`);
      if(staleRun.status!=="running")break;await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(staleRun.status,"error");assert.match(staleRun.message,/STALE_CONFIG_REVISION/);
    const afterAddition=await api(`/api/plans/${changed}/assisted`);
    assert.deepEqual(afterAddition.activeStage,prior.activeStage);assert.deepEqual(afterAddition.draft,prior.draft);
    report.addition={planId:changed,effectiveTasks:changedInput.input.tasks.length,stageTasks:prior.draft.tasks.length,
      reasonCode:staleRun.message,protectedStageUnchanged:true};
    writeFileSync(`${directory}/added-after-s0-state.json`,JSON.stringify({prior,afterAddition,run:staleRun},null,2));
    for(const task of changedInput.input.tasks.filter(task=>task.plannerNextKind==="main"))await api(`/api/daily-tasks/${task.id}`,"DELETE");
    const withoutMain=await captureInput(changed,"without-main");assert.equal(withoutMain.adapter.status,"UNSUPPORTED");
    assert.equal((await api(`/api/plans/${changed}/effective-configuration`)).readiness.status,"UNSUPPORTED");
    report.withoutMain={planId:changed,reasonCodes:withoutMain.adapter.reasonCodes};
    check("post-S0 additions change effective task identity and reject stale runs; days without main flow remain explicitly UNSUPPORTED");

    const unclassified=await createTemplate("Actividad pendiente de clasificación","",vocal.id);
    const incomplete=await createDay("2026-11-23");await addParticipant(incomplete,"Persona de revisión","09:00","17:00","Coach de esta producción");
    const missingRole=await captureInput(incomplete,"missing-role");assert.equal(missingRole.adapter.status,"UNSUPPORTED");
    assert.equal((await api(`/api/plans/${incomplete}/effective-configuration`)).readiness.status,"INCOMPLETE");
    const preTasks=await storage.getTasksForPlan(incomplete);
    const feederTask=preTasks.find(task=>task.templateId===feeder.id)!;
    await api(`/api/daily-tasks/${feederTask.id}`,"DELETE");
    const missingDependency=await captureInput(incomplete,"missing-dependency");assert.equal(missingDependency.adapter.status,"UNSUPPORTED");
    assert.ok(missingDependency.adapter.reasonCodes.includes("MISSING_DEPENDENCY_REFERENCE"));
    const startedSession=await api(`/api/plans/${incomplete}/assisted/session`,"POST",{});
    const denied=await request(`/api/plans/${incomplete}/assisted/proposals`,"POST",{selector:{kind:"TASK_IDS",taskIds:missingDependency.input.tasks.map(task=>task.id)},
      includePrerequisites:true,expectedDraftFingerprint:startedSession.draftFingerprint,expectedBaseStageId:startedSession.draftBaseStageId});
    assert.equal(denied.status,422);assert.equal(denied.body.code,"UNSUPPORTED_ENGINE_INPUT");
    assert.equal((await db.query("SELECT count(*)::int n FROM planning_runs WHERE plan_id=$1",[incomplete])).rows[0].n,0);
    report.incomplete={planId:incomplete,missingRole:missingRole.adapter.reasonCodes,missingDependency:missingDependency.adapter.reasonCodes,proposalStatus:denied.status};
    check("unclassified roles and absent prerequisite instances produce actionable INCOMPLETE and prevent a solver run");
    await configure(secondMain.id,"15:00");
    const incompatible=await createDay("2026-11-24");await addParticipant(incompatible,"Fin incompatible","09:00","17:00","Coach de esta producción");
    const unclassifiedTask=(await storage.getTasksForPlan(incompatible)).find(task=>task.templateId===unclassified.id)!;
    await api(`/api/daily-tasks/${unclassifiedTask.id}`,"DELETE");
    const incompatibleView=await api(`/api/plans/${incompatible}/effective-configuration`);
    assert.equal(incompatibleView.readiness.status,"INCOMPATIBLE");await captureInput(incompatible,"incompatible-preferred-end");
    report.incompatible={planId:incompatible,readiness:incompatibleView.readiness};
    await configure(secondMain.id,"11:30");
    const {dataApiCatalog,privilegeContract}=await import("./dataApiCatalog");
    const catalog=await dataApiCatalog(db);
    const privileges=privilegeContract(catalog);
    writeFileSync(`${directory}/privileges.json`,JSON.stringify(privileges,null,2));
    // Every new object is present in the complete, independently reviewed ACL contract.
    const {assertPrivilegeContract,assertSourcePrivileges}=await import("./dataApiGrantsGate");
    assertPrivilegeContract(catalog);assertSourcePrivileges(catalog);
    check("incompatible preferred end is diagnosed; complete native table/function privilege matrix agrees with the reviewed contract");

    report.uiErrors=uiErrors;assert.deepEqual(uiErrors,[]);report.status="PASS";check("snapshot isolation, immutable day profile, catalog permissions, stale writes and direct REST denial");return report;
  } finally {
    if(report.status!=="PASS")await page.screenshot({path:`${directory}/failure.png`,fullPage:true}).catch(()=>{});
    save();await context.tracing.stop({path:`${directory}/browser-private-trace.zip`});await browser.close();
  }
}
