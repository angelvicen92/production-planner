/** Causal probe only: all operational writes target the disposable native stack. */
import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import type pg from "pg";
import {chromium} from "playwright";
import {buildEngineInput} from "../../engine/buildInput";
import {adaptEngineInputToPlannerNextProblem} from "../../engine/planner-next/integration/engineInputAdapter";
import {resolveFlexibleParticipantMealTasks} from "../../engine/planner-next/integration/flexibleParticipantMealTasks";
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from "../../engine/planner-next/assistedPlanning";

type User={id:string;email:string;password:string;token:string};
export async function runU00gMealJourney({appUrl,users,db,directory,pass}:{appUrl:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(name:string)=>void}){
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
  const nativeDiagnostic=process.argv.includes("--participant-meals-native-diagnostic");
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
    const prepare=await template("Preparación U00g",10,room.id);
    const record=await template("Entrevista U00g",15,room.id,[prepare.id]);
    const meal=await template("Almuerzo individual U00g",20,null);
    await page.goto(`${appUrl}/settings`);await page.getByRole("tab",{name:/general/i}).click();
    await page.getByLabel("Perfil de la jornada",{exact:true}).selectOption("STANDALONE_ONLY");
    let pending=responseFor("/api/new-day-planner-configuration","PUT");
    await page.getByRole("button",{name:"Guardar Planner para futuras jornadas",exact:true}).click();assert.equal((await pending).status(),200);
    await page.getByText("Configuración guardada. Las jornadas existentes conservan su snapshot.",{exact:true}).waitFor();
    await page.getByLabel("Inicio habitual",{exact:true}).fill("11:00");await page.getByLabel("Fin habitual",{exact:true}).fill("14:00");
    await page.getByLabel("Inicio ventana global comida (default)",{exact:true}).fill("12:00");
    await page.getByLabel("Fin ventana global comida (default)",{exact:true}).fill("13:00");
    await page.getByLabel("Modo de comida",{exact:true}).click();await page.getByRole("option",{name:"Ventana flexible y comidas escalonadas",exact:true}).click();
    await page.getByLabel("Duración comida concursantes (min, default)",{exact:true}).fill("20");
    await page.getByLabel("Máx. concursantes comiendo a la vez (default)",{exact:true}).fill("1");
    await page.getByLabel("Nombre de la tarea que representa “comida” (default)",{exact:true}).click();
    await page.getByRole("option",{name:meal.name,exact:true}).click();
    const settings=page.getByTestId("settings-section-program");
    pending=responseFor("/api/program-settings","PATCH");await settings.getByRole("button",{name:"Guardar",exact:true}).click();
    assert.equal((await pending).status(),200);await page.screenshot({path:`${directory}/meal-configuration.png`,fullPage:true});
    await page.goto(`${appUrl}/plans`);await page.getByRole("button",{name:"Crear día",exact:true}).click();const modal=page.getByRole("dialog");
    await modal.getByLabel("Fecha",{exact:true}).fill("2026-12-01");pending=responseFor("/api/plans","POST");
    await modal.getByRole("button",{name:"Crear día",exact:true}).click();const created=await pending;assert.equal(created.status(),201,await created.text());const planId=Number((await created.json()).id);
    await modal.waitFor({state:"hidden"});
    for(const name of ["Irene U00g","Mario U00g"]){
      await page.goto(`${appUrl}/plans/${planId}?tab=tasks`);await page.getByLabel("Nombre del nuevo concursante").fill(name);
      await page.getByText("Disponibilidad",{exact:true}).locator("..").getByRole("checkbox").check();
      await page.getByTitle("Hora inicio",{exact:true}).fill("11:30");await page.getByTitle("Hora fin",{exact:true}).fill("13:00");
      pending=responseFor(`/api/plans/${planId}/contestants`,"POST");await page.getByRole("button",{name:"Añadir",exact:true}).click();assert.equal((await pending).status(),201);
    }
    pass("UI new day, two participants, ordinary dependency and individually configured meals");
    const input=await buildEngineInput(planId,storage);save("original-input",input);
    // Observe the same builder immediately before the new-day profile, using a
    // read-only storage view; the persisted day and all other loaders stay real.
    const beforeProfile=await buildEngineInput(planId,new Proxy(storage,{get(target,key){
      if(key==="getPlanEngineInputDetails")return async(id:number)=>{const details=await target.getPlanEngineInputDetails(id);return details?{...details,plan:{...details.plan,planner_next_profile:null}}:details;};
      const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
    }}));
    save("builder-before-profile",beforeProfile);
    save("authorities",{settings:await api("/api/program-settings"),plan:await storage.getPlan(planId),
      templateSnapshots:(await db.query("SELECT to_jsonb(t) row FROM plan_task_template_snapshots t WHERE plan_id=$1 ORDER BY id",[planId])).rows,
      tasks:await storage.getTasksForPlan(planId),templateIds:{prepare:prepare.id,record:record.id,meal:meal.id}});
    const original=adaptEngineInputToPlannerNextProblem(input);save("original-adapter",original);
    save("original-recognition",resolveFlexibleParticipantMealTasks(input));
    save("readiness",await api(`/api/plans/${planId}/effective-configuration`));
    await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);await page.screenshot({path:`${directory}/original-readiness.png`,fullPage:true});
    if(nativeDiagnostic){
      assert.equal(original.status,"UNSUPPORTED");
      assert.ok(process.env.OPTIPLAN_U00G_MARKER,"Use the isolated archive runner");
      writeFileSync(process.env.OPTIPLAN_U00G_MARKER!,"identity-only counterfactual");
      const restored=await buildEngineInput(planId,storage);save("restored-native-input",restored);
      const expected=structuredClone(input);expected.mealTaskTemplateId=meal.id;
      assert.deepEqual(restored,expected,"the archive intervention restores only the builder's discarded template ID");
      const restoredAdapter=adaptEngineInputToPlannerNextProblem(restored);save("restored-native-adapter",restoredAdapter);
      assert.equal(restoredAdapter.status,"SUPPORTED");
      const path=`/api/plans/${planId}/assisted`;
      const beforeSession=await request(path);
      const bootstrap=beforeSession.status===404?responseFor(path+"/session","POST"):null;
      await page.goto(`${appUrl}/plans/${planId}?tab=planning`);if(bootstrap)assert.equal((await bootstrap).status(),200);
      const selectMeals=async()=>{
        const scope=page.getByTestId("section-assisted-scope");await scope.getByRole("checkbox").first().waitFor();
        for(const checkbox of await scope.getByRole("checkbox").all())await checkbox.uncheck();
        const selected="Almuerzo individual U00g";
        for(const label of await scope.locator("label").filter({hasText:selected}).all())await label.getByRole("checkbox").check();
      };
      const generate=async(label:string)=>{
        const pending=responseFor(path+"/proposals","POST");await page.getByRole("button",{name:"Generar propuesta",exact:true}).click();
        const response=await pending;assert.equal(response.status(),202,await response.text());const {runId}=await response.json();
        let run:any;const deadline=Date.now()+180_000;
        do{run=await api(path+`/proposals/${runId}`);if(["success","failed","error","cancelled"].includes(run.status))break;await new Promise(r=>setTimeout(r,250));}while(Date.now()<deadline);
        save(`${label}-run`,run);return {runId,run,result:run.assisted_result_json??run.assistedResultJson};
      };
      const action=async(name:string,suffix:string)=>{const pending=responseFor(path+suffix,"POST");await page.getByRole("button",{name,exact:true}).click();const r=await pending;return {status:r.status(),body:await r.json()};};
      await selectMeals();const first=await generate("meal-only");assert.equal(first.result?.outcome,"PROPOSAL",JSON.stringify(first));
      const beforeApply=await api(path);save("before-apply",beforeApply);
      const rowsBeforeApply=(await db.query("SELECT to_jsonb(t) row FROM daily_tasks t WHERE plan_id=$1 ORDER BY id",[planId])).rows;save("rows-before-apply",rowsBeforeApply);
      const applied=await action("Aplicar al borrador",`/proposals/${first.runId}/apply`);save("apply-response",applied);
      assert.equal(applied.status,200,JSON.stringify(applied));
      const appliedDraft=await api(path);save("meal-only-draft",appliedDraft);
      const validation=await action("Validar borrador","/validate");save("validate-response",validation);
      const afterValidation=await api(path);save("meal-only-validation",afterValidation);
      assert.equal(validation.status,422);assert.equal(validation.body.code,"RUN_RESULT_INVALID");
      assert.deepEqual(afterValidation.activeStage,appliedDraft.activeStage);assert.deepEqual(afterValidation.draft,appliedDraft.draft);
      const rowsAfter=(await db.query("SELECT to_jsonb(t) row FROM daily_tasks t WHERE plan_id=$1 ORDER BY id",[planId])).rows;save("rows-after-validation",rowsAfter);
      assert.deepEqual(rowsAfter,rowsBeforeApply);
      const predicates=(await db.query(`SELECT
        r.result_fingerprint=encode(extensions.digest(convert_to(r.assisted_result_json::text,'UTF8'),'sha256'),'hex') AS result_fingerprint_matches,
        jsonb_array_length(r.assisted_result_json->'proposal') AS proposal_array_length,
        r.assisted_result_json->'proposedDraftSnapshot'=s.draft_snapshot_json AS snapshot_matches,
        r.assisted_result_json->>'proposedDraftFingerprint'=s.draft_fingerprint AS draft_fingerprint_matches,
        r.assisted_result_json->'scopeTaskIds'=r.scope_task_ids_json AS run_scope_matches,
        r.assisted_result_json->'scopeTaskIds'=s.draft_scope_json->'resolvedTaskIds' AS draft_scope_matches,
        r.assisted_result_json->'includePrerequisites'=to_jsonb(r.include_prerequisites) AS prerequisites_match,
        r.assisted_result_json->'evidence'->>'completeForScope' AS complete_for_scope,
        r.assisted_result_json->'evidence'->>'hardValid' AS hard_valid,
        r.assisted_result_json->'evidence'->>'requiredValid' AS required_valid,
        pg_get_functiondef('public.assisted_record_proposal_clean_validation(integer,text,bigint,bigint)'::regprocedure) AS function_source
        FROM planning_runs r JOIN assisted_planning_sessions s ON s.id=r.assisted_session_id WHERE r.id=$1`,[first.runId])).rows;
      save("sql-validation-predicates",predicates);
      assert.equal(predicates[0].proposal_array_length,0);assert.equal(predicates[0].result_fingerprint_matches,true);
      assert.equal(predicates[0].snapshot_matches,true);assert.equal(predicates[0].draft_fingerprint_matches,true);
      await page.screenshot({path:`${directory}/validation-blocked.png`,fullPage:true});
      save("diagnostic-summary",{status:"BLOCKED_VALIDATION_BEFORE_STAGE",planId,identityIntervention:"builder ID only in isolated archive",applyStatus:200,validation,
        engineOutcome:first.result.outcome,scopeTaskIds:first.result.scopeTaskIds,proposalArrayLength:0,scheduledParticipantMeals:2,
        previousAppliedDraftIntact:true,S0Intact:true,dailyTasksIntact:true,remoteWrites:0,uiErrors});
      pass("native meal-only proposal applies but clean validation rejects the empty productive array; S0/Draft/rows intact");
      return {status:"DIAGNOSTIC_BLOCKED_VALIDATION",planId};
    }
    assert.equal(input.mealTaskTemplateId,null);assert.equal(resolveFlexibleParticipantMealTasks(input).obligations.length,0);
    assert.equal(original.status,"UNSUPPORTED");
    // Minimal intervention on a cloned EngineInput only: no persisted mutation,
    // role rewrite, physical channel changes, budgets or solver changes.
    const counterfactual=structuredClone(input);counterfactual.mealTaskTemplateId=meal.id;
    save("counterfactual-input",counterfactual);save("counterfactual-recognition",resolveFlexibleParticipantMealTasks(counterfactual));
    const adapted=adaptEngineInputToPlannerNextProblem(counterfactual);save("counterfactual-adapter",adapted);
    if(adapted.status==="SUPPORTED"){
      const ids=[...adapted.problem.tasks.map(t=>t.id),...(adapted.problem.participantMeals??[]).map(m=>m.sourceTaskId)];
      const scope=createPlanningScope({kind:"DAY",value:"u00g-causal"},{},ids);
      const assisted=buildAssistedProblem(adapted.problem,scope,[]);save("counterfactual-assisted-input",assisted);
      const result=executeAssistedPlanning(assisted);save("counterfactual-result",result);
    }
    save("diagnostic-summary",{planId,templateIds:{prepare:prepare.id,record:record.id,meal:meal.id},original:original.status,counterfactual:adapted.status,remoteWrites:0,uiErrors});
    assert.deepEqual(uiErrors,[]);pass("causal original and ID-only counterfactual captured without engine changes");
    return {planId,status:"DIAGNOSTIC_ONLY",original:original.status,counterfactual:adapted.status};
  }finally{await browser.close();}
}
