import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import type pg from "pg";
import { applyDailyItinerantComposition } from "../../server/itinerantComposition";
import { materializeItinerantUnitAssignment } from "../../engine/planner-next/itinerantUnitAssignment";
import { canPlaceTask } from "../../engine/planner-next/placement";
import { validatePlan } from "../../engine/planner-next/validate";
import { api as routes } from "../../shared/routes";
import { chromium } from "playwright";
import { buildEngineInput } from "../../engine/buildInput";
import { buildAssistedProblem,createPlanningScope,executeAssistedPlanning } from "../../engine/planner-next/assistedPlanning";
import { adaptEngineInputToPlannerNextProblem } from "../../engine/planner-next/integration/engineInputAdapter";

type User={id:string;email:string;password:string;token:string};
export async function runNewDayItinerantJourney({appUrl,url,anon,service,users,db,directory,pass}:{appUrl:string;url:string;anon:string;service:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(name:string)=>void}) {
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
    await page.getByText('Parámetros técnicos de Planner Next',{exact:true}).click();
    await page.getByLabel('Transición entre recursos',{exact:true}).fill('5');
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
    assert.equal(input.itinerantCompositionSnapshot?.units.length,3);
    assert.ok(input.tasks.every(task=>task.plannerNextKind),"physical mapping preserves every explicit Next role");
    const ready=await api(`/api/plans/${planId}/effective-configuration`);assert.equal(ready.readiness.status,"READY",JSON.stringify(ready.readiness));
    assert.equal(ready.plannerProfile.sourceRevision,authority.planner_next_profile.sourceRevision);
    assert.equal(ready.itinerantComposition.units.length,3);
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
    const persisted=await rows();
    for(const task of accepted.activeStage.snapshotJson.tasks){
      const daily=persisted.find((entry:any)=>Number(entry.row.id)===task.taskId)!.row;
      assert.deepEqual(daily.assigned_resource_ids,task.assignedResourceIds);
    }
    writeFileSync(`${directory}/${label}-daily-tasks.json`,JSON.stringify(persisted,null,2));
    const revisions=(await db.query("SELECT id,fingerprint,replay_snapshot_json FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id",[planId])).rows;
    const acceptedRevision=revisions.find(revision=>Number(revision.id)===Number(accepted.currentConfigRevisionId));
    assert.deepEqual(acceptedRevision.replay_snapshot_json.authorities.plan_workday[0].itinerantComposition,input.itinerantCompositionSnapshot);
    writeFileSync(`${directory}/${label}-config-revisions.json`,JSON.stringify(revisions,null,2));
    writeFileSync(`${directory}/${label}-stage.json`,JSON.stringify(accepted,null,2));await page.screenshot({path:`${directory}/${label}-accepted.png`,fullPage:true});
    return {planId,obligations:input.tasks.length,completed:final.length,stages:1,durationMs:Math.round(performance.now()-started),problemFingerprint:adapter.problemFingerprint,
      combinedAuthorities:{plannerProfileRevision:authority.planner_next_profile.sourceRevision,itinerantCompositionVersion:1,itinerantUnitCount:3},
      branches:result.evidence?.branchesExplored??result.evidence?.work,hardCount:0,requiredCount:0};
  };
  const editTeamRequirement=async(template:any,teams:any[])=>{
    await page.goto(`${appUrl}/settings`);await page.getByRole('tab',{name:/plantillas|templates/i}).click();
    const card=page.locator('.bg-card').filter({has:page.getByText(template.name,{exact:true})}).last();
    await card.getByRole('button',{name:'Editar',exact:true}).click();
    const editing=page.locator('.bg-card').filter({has:page.getByRole('button',{name:'Cancelar',exact:true})}).last();
    await editing.getByRole('checkbox',{name:'Requiere equipo itinerante',exact:true}).check();
    for(const team of teams)await editing.getByRole('checkbox',{name:team.name,exact:true}).check();
    const pending=page.waitForResponse(r=>new URL(r.url()).pathname===routes.taskTemplates.update.path.replace(':id',String(template.id))&&r.request().method()==='PATCH');
    await editing.getByRole('button',{name:'Guardar',exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());
    const updated=await response.json();assert.deepEqual(updated.rulesJson.itinerantTeamAllowedIds,teams.map(t=>t.id));
    assert.equal(updated.rulesJson.plannerNextOperation.kind,template.rulesJson.plannerNextOperation.kind);
    return updated;
  };
  try {
    await login();
    await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'18:00',mealStart:'13:00',mealEnd:'14:00',mealMode:'global_hard_break'});
    const zone=await api('/api/zones','POST',{name:'Jornada con equipos reales'});
    const rooms=[];for(const name of ['Cámara A','Cámara B','Grabación compuesta','Alternativa física','Entrevista','Preparación'])rooms.push(await api('/api/spaces','POST',{name,zoneId:zone.id}));
    const type=await api('/api/resource-types','POST',{code:'new_day_physical',name:'Recursos de rodaje'});
    await page.goto(`${appUrl}/settings`);await page.getByRole('tab',{name:/recursos|resources/i}).click();
    const resourceSection=page.getByTestId('settings-section-resources');const members:any[]=[];
    for(const name of ['CAM_A','CAM_B','SON_1','KIT_INDEPENDIENTE']){
      await resourceSection.getByRole('button',{name:'Añadir unidad',exact:true}).click();
      const form=resourceSection.locator('.bg-card').filter({has:page.getByText('Añadir unidad (1 a 1)',{exact:true})}).last();
      await form.getByRole('combobox').click();await page.getByRole('option',{name:type.name,exact:true}).click();await form.getByRole('textbox').fill(name);
      const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/resource-items'&&r.request().method()==='POST');
      await form.getByRole('button',{name:'Crear unidad',exact:true}).click();const created=await pending;assert.equal(created.status(),200);members.push(await created.json());
    }
    await page.locator('[role=tab][aria-controls$="-content-staff"]').click();
    const section=page.getByTestId('settings-section-teams');const editor=page.getByTestId('itinerant-compositions');
    if(!await editor.isVisible())await section.locator('h3 > button').first().click();
    const teams:any[]=[];
    for(const [index,ids] of [[0,[0]],[1,[1]],[2,[0,2]]] as [number,number[]][]){
      await editor.getByLabel('Código de equipo',{exact:true}).fill(`U00D_${index}`);await editor.getByLabel('Nombre de equipo',{exact:true}).fill(`Equipo ${['A','B','C'][index]}`);
      for(const id of ids)await editor.getByRole('checkbox',{name:`Integrante ${members[id].name}`,exact:true}).check();
      await editor.getByLabel('Disponibilidad propia del equipo',{exact:true}).check();
      await editor.getByLabel('Disponible desde 1',{exact:true}).fill(index===2?'10:00':'09:00');await editor.getByLabel('Disponible hasta 1',{exact:true}).fill('12:00');
      await editor.getByLabel('Transición del equipo',{exact:true}).fill('3');
      const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/itinerant-teams'&&r.request().method()==='POST');
      await editor.getByRole('button',{name:'Crear composición',exact:true}).click();const created=await pending;assert.equal(created.status(),201,await created.text());teams.push(await created.json());
      await editor.getByText('Composición guardada para nuevas jornadas.',{exact:true}).waitFor();
    }
    await editor.screenshot({path:`${directory}/catalog.png`});report.teams=teams;report.members=members;
    check('physical resources and A=CAM_A, B=CAM_B, C=CAM_A+SON_1 created in the normal catalog UI');
    await configure();
    // An ordinary unused day makes catalog and daily unit IDs observably different.
    await createDay('2026-12-09');
    const templates:any[]=[];
    for(const [i,name,allowed] of [[0,'Operar cámara A',[teams[0]]],[1,'Operar cámara B',[teams[1]]],[2,'Operar composición C',[teams[2]]],[3,'Elegir cámara alternativa',[teams[0],teams[1]]]] as [number,string,any[]][])
      templates.push(await editTeamRequirement(await createTemplate(name,'technical',rooms[i].id,i>=2?[templates[i-2].id]:[]),allowed));
    // Independent catalog requirement, using the production template API.
    await api(routes.taskTemplates.update.path.replace(':id',String(templates[3].id)),'PATCH',{resourceRequirements:{byItem:{[members[3].id]:1}}});
    const first=await createDay('2026-12-10');
    for(const t of templates)await addTechnicalTask(first,t.name);
    for(const [i,room] of rooms.slice(0,4).entries())await api(`/api/plans/${first}/spaces/${room.id}/availability`,'PATCH',{
      availabilityStart:i<2?'09:30':'10:00',availabilityEnd:i<2?'09:40':'10:10'});
    const resources=await api(`/api/plans/${first}/resource-items`);
    for(const resource of resources)await api(`/api/plans/${first}/resource-items/${resource.id}`,'PATCH',{availabilityStart:resource.name==='SON_1'?'10:00':'09:30',availabilityEnd:'12:00'});
    const captured=await captureInput(first,'technical');report.firstIdentity={snapshot:captured.input.itinerantCompositionSnapshot,tasks:captured.input.tasks,adapter:captured.adapter};save();
    const snapshots=await storage.getPlanItinerantUnitSnapshots(first) as any[];
    const local=(team:any)=>snapshots.find(unit=>unit.source_team_id===team.id)!;
    assert.ok(teams.every(team=>local(team).id!==team.id));
    assert.deepEqual(captured.input.tasks.find(t=>t.templateId===templates[3].id)!.allowedItinerantTeamIds,[local(teams[0]).id,local(teams[1]).id]);
    await page.goto(`${appUrl}/plans/${first}?tab=configuration`);
    if(process.argv.includes('--expect-blocked')){
      assert.equal(captured.adapter.status,'UNSUPPORTED');assert.ok(captured.adapter.reasonCodes.includes('UNSUPPORTED_TASK_ROLE'));
      const ready=await api(`/api/plans/${first}/effective-configuration`);assert.equal(ready.readiness.status,'UNSUPPORTED');
      await page.getByText(/requiere una unidad itinerante/).first().waitFor();
      await page.screenshot({path:`${directory}/blocked.png`,fullPage:true});report.blocked=ready;save();
      check('baseline rejects UI-created tasks before considering valid daily compositions');return report;
    }
    report.days.push(await planToStage(first,'technical'));
    const state=await api(`/api/plans/${first}/assisted`);const rows=state.activeStage.snapshotJson.tasks;
    const row=(index:number)=>rows.find((r:any)=>r.taskId===captured.input.tasks.find(t=>t.templateId===templates[index].id)!.id)!;
    assert.equal(row(0).startPlanned,'09:30');assert.equal(row(1).startPlanned,'09:30');
    assert.equal(row(2).startPlanned,'10:00');assert.equal(row(3).startPlanned,'10:00');
    assert.equal(row(3).itinerantTeamId,local(teams[1]).id);
    const physical=(index:number)=>resources.find((r:any)=>r.resourceItemId===members[index].id).id;
    assert.deepEqual(row(0).assignedResourceIds,[physical(0)]);assert.deepEqual(row(1).assignedResourceIds,[physical(1)]);
    assert.deepEqual(row(2).assignedResourceIds,[physical(0),physical(2)].sort((a,b)=>a-b));
    assert.deepEqual(row(3).assignedResourceIds,[physical(1),physical(3)].sort((a,b)=>a-b));
    check('real proposal selects B alongside C, A+B run simultaneously and Stage reserves exactly the selected members plus the independent kit');
    assert.equal(captured.adapter.status,'SUPPORTED');if(captured.adapter.status!=='SUPPORTED')throw Error('unsupported');
    const problem=captured.adapter.problem;
    const source=(index:number)=>problem.tasks.find(t=>t.id===`task:${captured.input.tasks.find(t=>t.templateId===templates[index].id)!.id}`)!;
    const select=(index:number,team:number)=>materializeItinerantUnitAssignment(problem,source(index),`itinerant-team:${local(teams[team]).id}`)!;
    const a=select(3,0),b=select(3,1),c=select(2,2),placed={...c,start:600,end:610};
    assert.equal(canPlaceTask(problem,a,600,[placed]),false);assert.equal(canPlaceTask(problem,b,600,[placed]),true);
    assert.equal(materializeItinerantUnitAssignment(problem,source(3),c.itinerantUnitId!),null);
    assert.equal(validatePlan({...problem,tasks:[a,c]},[{...a,start:600,end:610},placed]).hardValid,false);
    // These probes retain the actual UI-created problem and only select a time.
    const openSpaces={...problem,spaces:problem.spaces.map(space=>({...space,availability:[problem.day]}))};
    const next={...select(1,1),id:'transition-probe',spaceId:source(3).spaceId,availability:undefined};
    const previous={...select(1,1),start:570,end:580};
    assert.equal(canPlaceTask(openSpaces,next,580,[previous]),false);assert.equal(canPlaceTask(openSpaces,next,585,[previous]),true);
    const unitOnly={...openSpaces,resources:problem.resources.map(resource=>({...resource,availability:[problem.day]}))};
    assert.equal(canPlaceTask(unitOnly,{...c,availability:undefined},590,[]),false);
    assert.equal(canPlaceTask(openSpaces,{...select(0,0),availability:undefined},560,[]),false);
    const invalid={...captured.input,tasks:[{...captured.input.tasks[0],itinerantTeamRequirement:'specific' as const,itinerantTeamId:2147483647}]};
    assert.throws(()=>applyDailyItinerantComposition(invalid,snapshots,first),/correspondencia/);
    assert.throws(()=>applyDailyItinerantComposition(captured.input,[...snapshots,snapshots[0]],first),/ambigua/);
    const missing=structuredClone(captured.input);missing.itinerantTeamAvailability!.pop();assert.equal(adaptEngineInputToPlannerNextProblem(missing).status,'UNSUPPORTED');
    report.physicalProbes={AplusB:true,AplusC:false,forbiddenChoiceRejected:true,missingUnitRejected:true,ambiguousMappingRejected:true,unitWindowRespected:true,memberWindowRespected:true,physicalTransitionMinutes:5};
    check('existing placement/preflight authorities reject shared CAM_A, forbidden alternatives, missing/ambiguous mappings, out-of-window operations and insufficient physical transitions');
    const frozen=await buildEngineInput(first,storage);
    const auxA=await editTeamRequirement(await createTemplate('Entrevista itinerante','auxiliary',rooms[4].id),teams.slice(0,2));
    const auxC=await editTeamRequirement(await createTemplate('Grabación itinerante','auxiliary',rooms[5].id,[auxA.id]),[teams[2]]);
    const second=await createDay('2026-12-11');
    await addParticipant(second,'Marta rodaje','10:30','12:00');await addParticipant(second,'Nora rodaje','10:30','12:00');
    report.days.push(await planToStage(second,'auxiliary'));assert.equal(report.days[1].completed,4);
    assert.deepEqual(await buildEngineInput(first,storage),frozen);
    check('four auxiliary tasks with two participants, template dependencies and daily team mappings complete a second UI-created day without changing the first');
    const negative=await createDay('2026-12-12');for(const t of templates)await addTechnicalTask(negative,t.name);
    const kit=(await api(`/api/plans/${negative}/resource-items`)).find((r:any)=>r.resourceItemId===members[3].id);
    await api(`/api/plans/${negative}/resource-items/${kit.id}`,'PATCH',{availabilityStart:'09:00',availabilityEnd:'09:05'});
    const impossible=await captureInput(negative,'infeasible');assert.equal(impossible.adapter.status,'SUPPORTED');
    await api(`/api/plans/${negative}/assisted/session`,'POST',{});const before=await api(`/api/plans/${negative}/assisted`);
    const run=await api(`/api/plans/${negative}/assisted/proposals`,'POST',{selector:{kind:'TASK_IDS',taskIds:impossible.input.tasks.map(t=>t.id)},includePrerequisites:true,expectedDraftFingerprint:before.draftFingerprint,expectedBaseStageId:before.draftBaseStageId});
    let finished:any;for(let attempt=0;attempt<600;attempt++){finished=await api(`/api/plans/${negative}/assisted/proposals/${run.runId}`);if(!['pending','running'].includes(finished.status))break;await page.waitForTimeout(100);}
    assert.equal((finished.assisted_result_json??finished.assistedResultJson).outcome,'NO_PROPOSAL');
    const after=await api(`/api/plans/${negative}/assisted`);assert.deepEqual(after.draft,before.draft);assert.deepEqual(after.activeStage,before.activeStage);
    writeFileSync(`${directory}/infeasible-run.json`,JSON.stringify(finished,null,2));
    check('an independent resource with insufficient availability prevents a proposal and preserves S0/Draft');
    assert.deepEqual(uiErrors,[]);report.finishedAt=new Date().toISOString();save();return report;
  }catch(error){await page.screenshot({path:`${directory}/failure.png`,fullPage:true});writeFileSync(`${directory}/failure.txt`,await page.locator('body').innerText());throw error;}
  finally{await context.tracing.stop({path:`${directory}/trace-private.zip`});await browser.close();}
}
