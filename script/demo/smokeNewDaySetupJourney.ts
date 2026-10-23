import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import type pg from "pg";
import {materializeAssistedSnapshotOccupations} from "../../server/assistedProposalService";
import {setupFamilySequence,hasSetupReentry} from "../../engine/planner-next/setupGrouping";
import { validatePlan } from "../../engine/planner-next/validate";
import { api as routes } from "../../shared/routes";
import { chromium } from "playwright";
import { buildEngineInput } from "../../engine/buildInput";
import { buildAssistedProblem,createPlanningScope,executeAssistedPlanning } from "../../engine/planner-next/assistedPlanning";
import { adaptEngineInputToPlannerNextProblem } from "../../engine/planner-next/integration/engineInputAdapter";

type User={id:string;email:string;password:string;token:string};
export async function runNewDaySetupJourney({appUrl,url,anon,service,users,db,directory,pass}:{appUrl:string;url:string;anon:string;service:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(name:string)=>void}) {
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
  const createTemplate=async(name:string,kind:string,spaceId:number,dependencyIds:number[]=[],familyId?:number,duration=10)=>{
    await page.goto(`${appUrl}/settings`);await page.getByRole("tab",{name:/plantillas|templates/i}).click();
    await page.getByRole("button",{name:"Create",exact:true}).click();const modal=page.getByRole("dialog");
    await modal.getByPlaceholder("Name",{exact:true}).fill(name);
    await modal.getByLabel("Rol operativo Planner Next",{exact:true}).selectOption(kind);
    if(familyId!=null)await modal.getByLabel("Familia de montaje",{exact:true}).selectOption(String(familyId));
    if(kind==="main"||kind==="vocal")await modal.getByText("Requiere el coach asignado al participante",{exact:true}).getByRole("checkbox").check();
    await modal.getByLabel("Espacio de la plantilla",{exact:true}).selectOption(String(spaceId));
    await modal.getByLabel("Plantillas previas",{exact:true}).selectOption(dependencyIds.map(String));
    await modal.locator('input[type="number"]').first().fill(String(duration));
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
  const configure=async(roomId?:number,explicit=false)=>{
    await page.goto(`${appUrl}/settings`);await page.getByRole("tab",{name:/general/i}).click();
    await page.getByLabel("Perfil de la jornada",{exact:true}).selectOption("STANDALONE_ONLY");
    assert.equal(await page.getByLabel("Espacio del flujo principal",{exact:true}).count(),0);
    await page.getByText('Parámetros técnicos de Planner Next',{exact:true}).click();
    await page.getByLabel('Transición entre recursos',{exact:true}).fill('5');
    if(roomId!=null){
      if(!explicit){
        await page.getByLabel('Montajes',{exact:true}).selectOption('FAMILIES');
        for(const name of ['Montaje A','Montaje B']){await page.getByLabel('Nombre de nueva familia',{exact:true}).fill(name);await page.getByRole('button',{name:'Añadir familia',exact:true}).click();}
        await page.getByRole('button',{name:'Añadir espacio de montaje',exact:true}).click();
        await page.getByLabel('Espacio de montaje 1',{exact:true}).selectOption(String(roomId));
        await page.getByLabel('Permitir Montaje A en espacio 1',{exact:true}).check();
        await page.getByLabel('Permitir Montaje B en espacio 1',{exact:true}).check();
      }else{
        await page.getByLabel('Nombre de nueva familia',{exact:true}).fill('Montaje C');await page.getByRole('button',{name:'Añadir familia',exact:true}).click();
        await page.getByLabel('Permitir Montaje C en espacio 1',{exact:true}).check();
        await page.getByLabel('Orden de familias 1',{exact:true}).selectOption('EXPLICIT');
        // Configure C → A → B using the normal order controls.
        await page.getByRole('button',{name:'Subir familia 3 en espacio 1',exact:true}).click();
        await page.getByRole('button',{name:'Subir familia 2 en espacio 1',exact:true}).click();
      }
      await page.getByLabel('Continuidad temporal 1',{exact:true}).selectOption(explicit?'REQUIRED':'PREFERRED');
      await page.getByLabel('Agrupación por familia 1',{exact:true}).selectOption(explicit?'PREFERRED':'REQUIRED');
      await page.getByLabel('Preparación entre familias 1',{exact:true}).fill(explicit?'5':'10');
    }
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
    assert.equal("mainFlow" in adapter.problem,false);assert.equal(adapter.problem.coaches.length,0);
    assert.ok(input.tasks.every(task=>task.plannerNextKind==="auxiliary"||task.plannerNextKind==="technical"));
    const replayScope=createPlanningScope({kind:"DAY",value:"replay"},{},adapter.problem.tasks.map(task=>task.id));
    const replayA=executeAssistedPlanning(buildAssistedProblem(adapter.problem,replayScope,[]));
    const replayB=executeAssistedPlanning(buildAssistedProblem(adapter.problem,replayScope,[]));
    assert.equal(replayA.evidence.completeForScope,true,replayA.evidence.reasonCodes.join(","));
    assert.deepEqual(replayA.proposal,replayB.proposal);assert.equal(replayA.evidence.fingerprint,replayB.evidence.fingerprint);
    assert.equal(validatePlan(adapter.problem,[...replayA.proposal!],[...(replayA.evidence.selectedSetupPreparations??[])]).hardValid,true);
    assert.equal(hasSetupReentry([...replayA.proposal!]),false);
    writeFileSync(`${directory}/${label}-replay.json`,JSON.stringify({a:replayA,b:replayB},null,2));
    const ready=await api(`/api/plans/${planId}/effective-configuration`);assert.equal(ready.readiness.status,"READY",JSON.stringify(ready.readiness));
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
      assert.deepEqual(daily.assigned_resource_ids??[],task.assignedResourceIds??[]);
    }
    writeFileSync(`${directory}/${label}-daily-tasks.json`,JSON.stringify(persisted,null,2));
    const preparations=accepted.activeStage.snapshotJson.setupPreparations;
    assert.equal(preparations?.length,input.setupPolicies![0].families.length-1);
    assert.ok(preparations.every((p:any)=>p.duration===input.setupPolicies![0].preparationMinutesBetweenFamilies));
    const sequence=setupFamilySequence([...replayA.proposal!]);
    if(input.setupPolicies![0].orderConstraint==='EXPLICIT')assert.deepEqual(sequence,adapter.problem.spaces.find(space=>space.setupPolicy)!.setupPolicy!.familyOrder);
    const revisions=(await db.query("SELECT id,fingerprint,replay_snapshot_json FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id",[planId])).rows;
    const acceptedRevision=revisions.find(revision=>Number(revision.id)===Number(accepted.currentConfigRevisionId));

    writeFileSync(`${directory}/${label}-config-revisions.json`,JSON.stringify(revisions,null,2));
    writeFileSync(`${directory}/${label}-stage.json`,JSON.stringify(accepted,null,2));await page.screenshot({path:`${directory}/${label}-accepted.png`,fullPage:true});
    return {planId,obligations:input.tasks.length,completed:final.length,stages:1,durationMs:Math.round(performance.now()-started),problemFingerprint:adapter.problemFingerprint,

      branches:result.evidence?.branchesExplored??result.evidence?.work,hardCount:0,requiredCount:0};
  };
  try {
    await login();
    await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'18:00',mealStart:'13:00',mealEnd:'14:00',mealMode:'global_hard_break'});
    const zone=await api('/api/zones','POST',{name:'Montajes nuevos'});
    const room=await api('/api/spaces','POST',{name:'Espacio compartido',zoneId:zone.id});
    const baseline=process.argv.includes('--expect-blocked');
    await configure(baseline?undefined:room.id);
    const configuration=await api('/api/new-day-planner-configuration');
    const families=configuration.configuration.setupFamilies?.families??[{id:101,name:'Montaje A'},{id:202,name:'Montaje B'}];
    const templates:any[]=[];
    for(const family of families){
      const t=await createTemplate(family.name,'auxiliary',room.id,[],baseline?undefined:family.id);
      if(baseline)await api(routes.taskTemplates.update.path.replace(':id',String(t.id)),'PATCH',{setupId:family.id});
      templates.push({...t,setupId:family.id});
    }
    if(!baseline){
      for(const family of [families[1],families[0]]){
        await page.goto(`${appUrl}/settings`);await page.getByRole('tab',{name:/plantillas|templates/i}).click();
        const card=page.locator('.bg-card').filter({has:page.getByText(templates[0].name,{exact:true})}).last();
        await card.getByRole('button',{name:'Editar',exact:true}).click();
        const editing=page.locator('.bg-card').filter({has:page.getByRole('button',{name:'Cancelar',exact:true})}).last();
        await editing.getByLabel('Familia de montaje',{exact:true}).selectOption(String(family.id));
        const pending=page.waitForResponse(r=>new URL(r.url()).pathname===routes.taskTemplates.update.path.replace(':id',String(templates[0].id))&&r.request().method()==='PATCH');
        await editing.getByRole('button',{name:'Guardar',exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());assert.equal((await response.json()).setupId,family.id);
      }
    }
    const first=await createDay('2026-12-15');
    await addParticipant(first,'Ada montaje','09:00','12:00');
    await addParticipant(first,'Berta montaje','09:00','12:00');
    const captured=await captureInput(first,'setup');
    if(baseline){
      assert.equal(captured.adapter.status,'UNSUPPORTED');assert.ok(captured.adapter.reasonCodes.includes('UNSUPPORTED_SETUP_MAPPING'));
      const ready=await api(`/api/plans/${first}/effective-configuration`);assert.equal(ready.readiness.status,'UNSUPPORTED');
      await page.goto(`${appUrl}/plans/${first}?tab=configuration`);await page.getByText(/declara un montaje/).first().waitFor();
      await page.screenshot({path:`${directory}/blocked.png`,fullPage:true});report.blocked=ready;report.templates=templates;report.room=room;save();
      check('original UNSUPPORTED_SETUP_MAPPING reproduced using UI-created templates, participants and day with productive setupId API');return report;
    }
    report.days.push(await planToStage(first,'setup'));
    const frozen=await buildEngineInput(first,storage);
    const acceptedFirst=await api(`/api/plans/${first}/assisted`);
    await configure(room.id,true);
    const explicit=await api('/api/new-day-planner-configuration');
    const allFamilies=explicit.configuration.setupFamilies.families;
    for(const template of templates)await api(routes.taskTemplates.update.path.replace(':id',String(template.id)),'PATCH',{autoCreateOnContestantCreate:false});
    const nextTemplates:any[]=[];
    for(const [index,duration] of [[2,5],[0,15],[1,10]]){
      const family=allFamilies[index];
      nextTemplates.push(await createTemplate(`Segunda jornada ${family.name}`,'auxiliary',room.id,nextTemplates.length?[nextTemplates.at(-1).id]:[],family.id,duration));
    }
    const resourceType=await api('/api/resource-types','POST',{code:'setup_equipment',name:'Material de montaje'});
    const resource=await api('/api/resource-items','POST',{name:'Equipo de iluminación',typeId:resourceType.id});
    const second=await createDay('2026-12-16');
    const dailyResource=(await api(`/api/plans/${second}/resource-items`)).find((item:any)=>item.resourceItemId===resource.id);
    await api(`/api/plans/${second}/spaces/${room.id}/space-resource-assignments`,'PATCH',{planResourceItemIds:[dailyResource.id]});
    await addParticipant(second,'Carla segunda','09:00','11:00');await addParticipant(second,'Diana segunda','09:10','12:00');
    report.days.push(await planToStage(second,'explicit'));
    assert.deepEqual(await buildEngineInput(first,storage),frozen);
    assert.deepEqual((await api(`/api/plans/${first}/assisted`)).activeStage,acceptedFirst.activeStage);
    const secondInput=await buildEngineInput(second,storage);
    const physical=secondInput.planResourceItems.find(item=>item.resourceItemId===resource.id)!;
    const secondStage=await api(`/api/plans/${second}/assisted`);
    const secondAdapter=adaptEngineInputToPlannerNextProblem(secondInput);assert.equal(secondAdapter.status,'SUPPORTED');
    if(secondAdapter.status!=='SUPPORTED')throw Error('unsupported');
    const occupations=materializeAssistedSnapshotOccupations(secondAdapter.problem,secondAdapter.identityMap,secondStage.activeStage.snapshotJson);
    assert.ok(occupations.protectedPlacements.every(task=>task.requiredResourceIds?.includes(`plan-resource:${physical.id}`)));
    writeFileSync(`${directory}/physical-occupations.json`,JSON.stringify({spaceAssignments:secondInput.spaceResourceAssignments,physical,occupations},null,2));
    check('two independent UI-created days reach complete Stages with flexible/explicit order, physical preparations, dependencies, availability and exact resources; first Stage and effective input stay frozen');
    // Product permissions, CAS, reference validation and immutable day snapshots.
    for(const role of ['production','aux','viewer','norole'])assert.equal((await request('/api/new-day-planner-configuration','PUT',{expectedRevision:explicit.revision,configuration:explicit.configuration},role)).status,403);
    assert.equal((await request('/api/new-day-planner-configuration','PUT',{expectedRevision:configuration.revision,configuration:explicit.configuration})).status,409);
    const bad=structuredClone(explicit.configuration);bad.setupFamilies.policies[0].spaceId=2147483647;
    assert.equal((await request('/api/new-day-planner-configuration','PUT',{expectedRevision:explicit.revision,configuration:bad})).status,400);
    bad.setupFamilies.policies[0].spaceId=room.id;bad.setupFamilies.policies[0].familyIds.push(2147483647);
    assert.equal((await request('/api/new-day-planner-configuration','PUT',{expectedRevision:explicit.revision,configuration:bad})).status,400);
    const response=await fetch(`${url}/rest/v1/plans?id=eq.${first}`,{method:'PATCH',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({planner_next_profile:{contractVersion:1,sourceRevision:999,configuration:null}})});
    assert.equal(response.ok,false);assert.match(await response.text(),/PLANNER_NEXT_PROFILE_IMMUTABLE/);
    check('unknown references, stale configuration, unauthorized edits and attempts to rewrite historical day profiles are rejected');
    // Negative placements use the genuine canonical problem and existing validators.
    assert.equal(captured.adapter.status,'SUPPORTED');if(captured.adapter.status!=='SUPPORTED')throw Error('unsupported');
    const problem=captured.adapter.problem;
    const result=executeAssistedPlanning(buildAssistedProblem(problem,createPlanningScope({kind:'DAY',value:'negatives'},{},problem.tasks.map(t=>t.id)),[]));
    const scheduled=[...result.proposal!],preparations=[...(result.evidence.selectedSetupPreparations??[])];
    assert.equal(validatePlan(problem,scheduled,preparations).hardValid,true);
    assert.equal(validatePlan(problem,scheduled,[]).hardValid,false);
    const overlap=scheduled.map((task,index)=>index===1?{...task,start:scheduled[0].start,end:scheduled[0].start+task.duration}:task);
    assert.equal(validatePlan(problem,overlap,preparations).hardValid,false);
    const reentry=[scheduled[0],scheduled[2],scheduled[1],scheduled[3]].map((task,index)=>({...task,start:540+index*20,end:540+index*20+task.duration}));
    assert.equal(hasSetupReentry(reentry),true);assert.equal(validatePlan(problem,reentry,preparations).hardValid,false);
    const unknown=structuredClone(captured.input);unknown.tasks[0].setupFamilyId='unknown';assert.equal(adaptEngineInputToPlannerNextProblem(unknown).status,'UNSUPPORTED');
    const incomplete=structuredClone(captured.input);delete incomplete.setupPolicies;assert.equal(adaptEngineInputToPlannerNextProblem(incomplete).status,'UNSUPPORTED');
    const explicitProblem=adaptEngineInputToPlannerNextProblem(secondInput);assert.equal(explicitProblem.status,'SUPPORTED');
    if(explicitProblem.status==='SUPPORTED'){
      const replay=executeAssistedPlanning(buildAssistedProblem(explicitProblem.problem,createPlanningScope({kind:'DAY',value:'wrong-order'},{},explicitProblem.problem.tasks.map(t=>t.id)),[]));
      const reversePolicy={...explicitProblem.problem,spaces:explicitProblem.problem.spaces.map(space=>space.setupPolicy?{...space,setupPolicy:{...space.setupPolicy,familyOrder:[...space.setupPolicy.familyOrder].reverse()}}:space)};
      assert.equal(validatePlan(reversePolicy,[...replay.proposal!],[...(replay.evidence.selectedSetupPreparations??[])]).hardValid,false);
    }
    report.negatives={insufficientPreparation:true,capacity:true,reentry:true,unknownFamily:true,incompletePolicy:true,wrongOrder:true,stale:true,permissions:true,protectedStage:true};
    check('existing preflight and validators reject missing preparation, shared capacity violation, reentry, unknown family, incomplete policy and wrong explicit order');
    assert.deepEqual(uiErrors,[]);report.finishedAt=new Date().toISOString();save();return report;
  }catch(error){await page.screenshot({path:`${directory}/failure.png`,fullPage:true});writeFileSync(`${directory}/failure.txt`,await page.locator('body').innerText());throw error;}
  finally{await context.tracing.stop({path:`${directory}/trace-private.zip`});await browser.close();}
}
