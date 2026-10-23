/** Two new UI-created days on the real disposable application stack. */
import assert from "node:assert/strict";
import {participantMealSqlAdversaries,protectedMealSqlAdversary} from "./participantMealSqlAdversaries";
import {fingerprintAssistedPlanningSnapshotV1} from "../../server/assistedPlanningSnapshot";
import {writeFileSync} from "node:fs";
import type pg from "pg";
import {chromium} from "playwright";
import {buildEngineInput} from "../../engine/buildInput";
import {api as routes} from "../../shared/routes";
import {adaptEngineInputToPlannerNextProblem} from "../../engine/planner-next/integration/engineInputAdapter";
import {resolveFlexibleParticipantMealTasks} from "../../engine/planner-next/integration/flexibleParticipantMealTasks";
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from "../../engine/planner-next/assistedPlanning";

type User={id:string;email:string;password:string;token:string};
export async function runU00gFunctionalJourney({appUrl,users,db,directory,pass}:{appUrl:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(name:string)=>void}){
  assert.equal(db.host,"127.0.0.1");
  const {storage}=await import("../../server/storage");
  const save=(name:string,value:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(value,null,2));
  const request=async(path:string,method="GET",body?:unknown)=>{
    const response=await fetch(appUrl+path,{method,headers:{"Content-Type":"application/json",Authorization:`Bearer ${users.admin.token}`},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json() as any};
  };
  const api=async(path:string,method="GET",body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(30_000);
  const uiErrors:string[]=[];page.on("pageerror",error=>uiErrors.push(error.message));
  const responseFor=(path:string,method:string)=>page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()===method);

  try{
    await page.goto(`${appUrl}/login`);await page.getByLabel("Email",{exact:true}).fill(users.admin.email);
    await page.getByLabel("Contraseña (opcional para enlace)",{exact:true}).fill(users.admin.password);
    await page.getByRole("button",{name:"Entrar con contraseña",exact:true}).click();await page.waitForURL("**/dashboard");
    const zone=await api("/api/zones","POST",{name:"U00g producción independiente"});
    const room=await api("/api/spaces","POST",{name:"Sala entrevista U00g",zoneId:zone.id});
    const template=async(name:string,duration:number,spaceId:number|null,dependencies:number[]=[])=>{
      await page.goto(`${appUrl}/settings`);await page.getByRole("tab",{name:/plantillas|templates/i}).click();
      await page.getByRole("button",{name:"Create",exact:true}).click();const modal=page.getByRole("dialog");
      await modal.getByPlaceholder("Name",{exact:true}).fill(name);
      await modal.getByLabel("Rol operativo Planner Next",{exact:true}).selectOption("auxiliary");
      await modal.getByLabel("Espacio de la plantilla",{exact:true}).selectOption(spaceId==null?"":String(spaceId));
      await modal.getByLabel("Plantillas previas",{exact:true}).selectOption(dependencies.map(String));
      await modal.locator('input[type="number"]').first().fill(String(duration));
      await modal.getByPlaceholder("Antes: heredado").fill("0");await modal.getByPlaceholder("Después: heredado").fill("0");
      await modal.getByLabel("Auto-crear al crear concursante",{exact:true}).check();
      const pending=responseFor("/api/task-templates","POST");await modal.getByRole("button",{name:"Guardar",exact:true}).click();
      const response=await pending;assert.equal(response.status(),201,await response.text());const result=await response.json();await modal.waitFor({state:"hidden"});return result;
    };
    const reports:any[]=[];
    for(const scenario of [{label:'A',participants:2,duration:20,capacity:1,end:'13:00',ordinary:2,date:'2026-12-01'},
      {label:'B',participants:3,duration:15,capacity:2,end:'12:30',ordinary:3,date:'2026-12-02'}]){
      const label=scenario.label;
      const prepare=await template(`Preparación ${label}`,10,room.id);
      const record=await template(`Entrevista ${label}`,15,room.id,[prepare.id]);
      const wrap=scenario.ordinary===3?await template(`Cierre ${label}`,10,room.id,[record.id]):null;
      const meal=await template(`Almuerzo individual ${label}`,scenario.duration,null);
      const templates=[prepare,record,...(wrap?[wrap]:[]),meal];
      await page.goto(`${appUrl}/settings`);await page.getByRole('tab',{name:/general/i}).click();
      await page.getByLabel('Perfil de la jornada',{exact:true}).selectOption('STANDALONE_ONLY');
      let pending=responseFor('/api/new-day-planner-configuration','PUT');
      await page.getByRole('button',{name:'Guardar Planner para futuras jornadas',exact:true}).click();assert.equal((await pending).status(),200);
      await page.getByText('Configuración guardada. Las jornadas existentes conservan su snapshot.',{exact:true}).waitFor();
      await page.getByLabel('Inicio habitual',{exact:true}).fill('11:00');await page.getByLabel('Fin habitual',{exact:true}).fill('14:00');
      await page.getByLabel('Inicio ventana global comida (default)',{exact:true}).fill('12:00');
      await page.getByLabel('Fin ventana global comida (default)',{exact:true}).fill(scenario.end);
      await page.getByLabel('Modo de comida',{exact:true}).click();await page.getByRole('option',{name:'Ventana flexible y comidas escalonadas',exact:true}).click();
      await page.getByLabel('Duración comida concursantes (min, default)',{exact:true}).fill(String(scenario.duration));
      await page.getByLabel('Máx. concursantes comiendo a la vez (default)',{exact:true}).fill(String(scenario.capacity));
      await page.getByLabel('Plantilla de comida individual (default)',{exact:true}).click();await page.getByRole('option',{name:meal.name,exact:true}).click();
      pending=responseFor('/api/program-settings','PATCH');await page.getByTestId('settings-section-program').getByRole('button',{name:'Guardar',exact:true}).click();
      assert.equal((await pending).status(),200);await page.screenshot({path:`${directory}/${label}-configuration.png`,fullPage:true});
      await page.goto(`${appUrl}/plans`);await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');
      await modal.getByLabel('Fecha',{exact:true}).fill(scenario.date);pending=responseFor('/api/plans','POST');
      await modal.getByRole('button',{name:'Crear día',exact:true}).click();const created=await pending;assert.equal(created.status(),201,await created.text());const planId=Number((await created.json()).id);
      await modal.waitFor({state:'hidden'});
      for(let index=0;index<scenario.participants;index++){
        await page.goto(`${appUrl}/plans/${planId}?tab=tasks`);await page.getByLabel('Nombre del nuevo concursante').fill(`Participante ${label}-${index+1}`);
        await page.getByText('Disponibilidad',{exact:true}).locator('..').getByRole('checkbox').check();
        await page.getByTitle('Hora inicio',{exact:true}).fill('11:00');await page.getByTitle('Hora fin',{exact:true}).fill('14:00');
        pending=responseFor(`/api/plans/${planId}/contestants`,'POST');await page.getByRole('button',{name:'Añadir',exact:true}).click();assert.equal((await pending).status(),201);
      }
      const input=await buildEngineInput(planId,storage);save(`${label}-input`,input);
      assert.equal(input.mealTaskTemplateId,meal.id);assert.equal(input.contestantMealDurationMinutes,scenario.duration);assert.equal(input.contestantMealMaxSimultaneous,scenario.capacity);
      assert.equal(input.tasks.length,scenario.participants*(scenario.ordinary+1));
      assert.equal(resolveFlexibleParticipantMealTasks(input).obligations.length,scenario.participants);
      const adapter=adaptEngineInputToPlannerNextProblem(input);save(`${label}-adapter`,adapter);assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter));
      const path=`/api/plans/${planId}/assisted`;
      const pre=await request(path);const bootstrap=pre.status===404?responseFor(path+'/session','POST'):null;
      await page.goto(`${appUrl}/plans/${planId}?tab=planning`);if(bootstrap)assert.equal((await bootstrap).status(),200);
      const state=()=>api(path);
      const poll=async(runId:number)=>{let run:any;const deadline=Date.now()+180_000;do{run=await api(path+`/proposals/${runId}`);if(run.status!=='running')return run;await new Promise(r=>setTimeout(r,250));}while(Date.now()<deadline);throw Error('proposal did not finish');};
      const stages=label==='A'?[[meal.id],[prepare.id,record.id]]:[[prepare.id,meal.id],[record.id],[wrap.id]];
      const stageReports:any[]=[];
      for(const [index,templateIds] of stages.entries()){
        await page.goto(`${appUrl}/plans/${planId}?tab=planning`);
        const scope=page.getByTestId('section-assisted-scope');await scope.getByRole('checkbox').first().waitFor();
        for(const checkbox of await scope.getByRole('checkbox').all())await checkbox.uncheck();
        const selectedNames=templates.filter(t=>templateIds.includes(t.id)).map(t=>t.name);
        for(const name of selectedNames)for(const item of await scope.locator('label').filter({hasText:name}).all())await item.getByRole('checkbox').check();
        const before=await state();save(`${label}-S${index}-state`,before);
        const expected={expectedDraftFingerprint:before.session.draftFingerprint,expectedBaseStageId:before.activeStage.id};
        const generating=responseFor(path+'/proposals','POST'),started=performance.now();
        await page.getByRole('button',{name:'Generar propuesta',exact:true}).click();const generated=await generating;assert.equal(generated.status(),202,await generated.text());
        const {runId}=await generated.json(),run=await poll(runId),result=run.assisted_result_json;save(`${label}-S${index+1}-run`,run);
        assert.equal(result?.outcome,'PROPOSAL',JSON.stringify(run));assert.equal(result.evidence.completeForScope,true);assert.equal(result.evidence.hardValid,true);assert.equal(result.evidence.requiredValid,true);
        const replayId=(await api(path+'/proposals','POST',{...expected,selector:{kind:'TASK_IDS',taskIds:result.scopeTaskIds},includePrerequisites:false})).runId;
        const replay=await poll(replayId);save(`${label}-S${index+1}-replay`,replay);
        assert.deepEqual(replay.assisted_result_json.proposedDraftSnapshot,result.proposedDraftSnapshot);
        assert.equal(replay.assisted_result_json.proposedDraftFingerprint,result.proposedDraftFingerprint);
        assert.equal(replay.assisted_result_json.evidence.fingerprint,result.evidence.fingerprint);
        assert.deepEqual(replay.assisted_result_json.evidence.work,result.evidence.work);
        for(const accepted of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(result.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===accepted.taskId),accepted);
        const action=async(name:string,suffix:string)=>{const pending=responseFor(path+suffix,'POST');await page.getByRole('button',{name,exact:true}).click();const r=await pending;assert.equal(r.status(),200,await r.text());return r.json();};
        await page.getByRole('button',{name:'Aplicar al borrador',exact:true}).waitFor();
        await action('Aplicar al borrador',`/proposals/${runId}/apply`);const draft=await state();save(`${label}-S${index+1}-draft`,draft);
        if(label==='A'&&index===0){save('sql-adversaries',await participantMealSqlAdversaries(db,planId,runId));pass('19 SQL adversaries reject forged meal-only results with matching hashes and Drafts');}
        if(index>0)save(`${label}-S${index+1}-protection-negative`,await protectedMealSqlAdversary(db,planId,runId));
        const stale=await request(path+`/proposals/${runId}/apply`,'POST',{...expected,expectedDraftFingerprint:'0'.repeat(64)});assert.equal(stale.status,409);
        assert.deepEqual((await state()).draft,draft.draft);
        await action('Validar borrador','/validate');const validated=await state();save(`${label}-S${index+1}-validation`,validated.validation);
        assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
        await action('Aceptar etapa','/accept-stage');const accepted=await state();save(`${label}-S${index+1}-stage`,accepted);
        assert.equal(accepted.activeStage.ordinal,index+1);assert.deepEqual(accepted.activeStage.snapshotJson,result.proposedDraftSnapshot);
        assert.equal(fingerprintAssistedPlanningSnapshotV1(accepted.activeStage.snapshotJson),result.proposedDraftFingerprint);
        const statuses=(await db.query('SELECT id,status,start_planned,end_planned,space_id,zone_id FROM public.daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows;
        assert.ok(statuses.every(t=>t.status==='pending'));save(`${label}-S${index+1}-execution-status`,statuses);
        for(const task of statuses){
          const row=accepted.activeStage.snapshotJson.tasks.find((t:any)=>t.taskId===Number(task.id));
          assert.deepEqual([task.start_planned,task.end_planned,task.space_id,task.zone_id],
            [row.startPlanned,row.endPlanned,row.spaceId,row.zoneId],'accepted Stage must be materialized in daily_tasks');
        }
        await page.screenshot({path:`${directory}/${label}-S${index+1}-accepted.png`,fullPage:true});
        stageReports.push({ordinal:index+1,runId,scope:result.scopeTaskIds,fingerprint:result.proposedDraftFingerprint,engineFingerprint:result.evidence.fingerprint,branches:result.evidence.work,elapsedMs:performance.now()-started,globalMealGate:result.evidence.globalMealGate,hardCount:0,requiredCount:0,deterministic:true});
      }
      const complete=await state();assert.ok(complete.activeStage.snapshotJson.tasks.every((t:any)=>t.startPlanned&&t.endPlanned));
      const mealRows=complete.activeStage.snapshotJson.tasks.filter((t:any)=>input.tasks.find(task=>task.id===t.taskId)?.templateId===meal.id);
      assert.equal(new Set(mealRows.map((t:any)=>t.startPlanned)).size,2,'capacity must require two meal starts');
      if(label==='A')assert.deepEqual(mealRows.map((t:any)=>[t.startPlanned,t.endPlanned]),[['12:00','12:20'],['12:20','12:40']]);
      reports.push({label,planId,completed:input.tasks.length,mealTemplateId:meal.id,scenario,stages:stageReports});
      for(const t of templates)await api(routes.taskTemplates.update.path.replace(':id',String(t.id)),routes.taskTemplates.update.method,{autoCreateOnContestantCreate:false});
      pass(`UI day ${label}: ${input.tasks.length}/${input.tasks.length}, ${stages.length} native accepted Stages, pending execution and deterministic replay`);
    }
    const negatives:any[]=[];
    const requestAs=async(role:string,path:string,method:string,body:any)=>{const response=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users[role].token}`},body:JSON.stringify(body)});return response.status;};
    const path=`/api/plans/${reports[0].planId}/assisted`;
    assert.equal(await requestAs('viewer',path+'/accept-stage','POST',{}),403);
    assert.equal(await requestAs('viewer','/api/program-settings','PATCH',{mealTaskTemplateId:1}),403);
    assert.equal((await request('/api/program-settings','PATCH',{mealTaskTemplateId:99999999})).status,400);
    negatives.push('viewer cannot accept or change meal defaults','unknown meal template ID rejected');
    const originalA=await buildEngineInput(reports[0].planId,storage);
    assert.equal(originalA.mealTaskTemplateId,reports[0].mealTemplateId);assert.equal(originalA.contestantMealDurationMinutes,20);assert.equal(originalA.contestantMealMaxSimultaneous,1);
    save('summary',{status:'PASS',days:reports,negatives,uiErrors,remoteWrites:0});assert.deepEqual(uiErrors,[]);
    return {status:'PASS',days:reports,remoteWrites:0};
  }finally{await browser.close();}
}
