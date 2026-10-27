import assert from 'node:assert/strict';
import {buildEngineInput} from '../../../engine/buildInput';
export async function nativeDay(ctx:any){
 const {page,api,request,save,label,planId,policies,ordinary,state,appUrl,db,directory,pass}=ctx;
 const {storage}=await import('../../../server/storage');
 const path=`/api/plans/${planId}/assisted`,configuration=`/api/plans/${planId}/day-configuration`;
 save(label+'-ordinary-input',ordinary);save(label+'-S0',state);
 const effective=()=>api(`/api/plans/${planId}/effective-configuration`);
 await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);const editor=page.getByTestId('daily-operational-meals');await editor.waitFor();
 for(const [i,p] of (label==='A'?[{...policies[0],durationMinutes:20},policies[0]]:policies).entries()){
  await editor.getByRole('button',{name:'Crear descanso operativo',exact:true}).click();
  if(label==='B')await editor.getByLabel('Unidad física del descanso',{exact:true}).selectOption(String(ordinary.itinerantCompositionSnapshot.units[i].id));
  else for(const id of p.planResourceItemIds){const resource=ordinary.planResourceItems.find((r:any)=>r.id===id);await editor.getByLabel(`Recurso del descanso ${resource.name}`,{exact:true}).check();}
  for(const id of p.spaceIds){const space=ordinary.planSpaceSettings.find((s:any)=>s.spaceId===id);await editor.getByLabel(`Espacio del descanso ${space.name}`,{exact:true}).check();}
  await editor.getByLabel('Ventana del descanso desde',{exact:true}).fill(p.window.start);await editor.getByLabel('Ventana del descanso hasta',{exact:true}).fill(p.window.end);await editor.getByLabel('Duración del descanso',{exact:true}).fill(String(p.durationMinutes));
  const response=page.waitForResponse((r:any)=>new URL(r.url()).pathname===configuration&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar descanso operativo',exact:true}).click();const saved=await response;if(saved.status()!==200){const {buildCanonicalPlanConfig}=await import('../../../server/dayConfigurationService');const {withDailyOperationalMeals}=await import('../../../server/operationalMealPolicy');const body=JSON.parse(saved.request().postData()!);const old=await buildCanonicalPlanConfig(planId,storage);const next=await buildCanonicalPlanConfig(planId,storage,withDailyOperationalMeals(old.input,body.operationalMealPolicies));save(label+'-writer-definition',(await db.query("SELECT pg_get_functiondef('public.apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure) AS definition")).rows);save(label+'-writer-current',old);save(label+'-writer-next',next);await db.query('BEGIN');try{await db.query('SET LOCAL ROLE service_role');await db.query("SELECT apply_day_config_operation_v5($1,$2,'EDIT',$3,$4,$5,$6,$7,$8,$9)",[planId,ctx.users.admin.id,body,body.expectedRevisionId,old.identity,old.replay,next.identity,next.replay,{}]);}catch(e:any){save(label+'-writer-error',{message:e.message,detail:e.detail,where:e.where,internalQuery:e.internalQuery});console.error(e.message,e.detail,e.where);}finally{await db.query('ROLLBACK');}}assert.equal(saved.status(),200,await saved.text());await editor.getByTestId('operational-meal').last().waitFor();
  if(label==='A'&&i===0){await editor.getByRole('button',{name:'Editar descanso 1',exact:true}).click();await editor.getByLabel('Duración del descanso',{exact:true}).fill('25');const changed=page.waitForResponse((r:any)=>new URL(r.url()).pathname===configuration&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar descanso operativo',exact:true}).click();assert.equal((await changed).status(),200);await page.reload();await editor.getByRole('button',{name:'Retirar descanso 1',exact:true}).waitFor();const retired=page.waitForResponse((r:any)=>new URL(r.url()).pathname===configuration&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Retirar descanso 1',exact:true}).click();assert.equal((await retired).status(),200);await page.reload();await editor.waitFor();assert.equal(await editor.getByTestId('operational-meal').count(),0);}
 }
 const authority=await effective();save(label+'-effective',authority);await page.screenshot({path:`${directory}/${label}-configuration.png`,fullPage:true});
 let input=await buildEngineInput(planId,storage);save(label+'-input',input);assert.equal(input.operationalMealPolicies!.length,policies.length);assert.equal(input.dailyOperationalMealsVersion,1);
 save(label+'-revision',(await db.query('SELECT * FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id',[planId])).rows);
 const current=await api(path);assert.deepEqual(current.draft,state.draft);assert.equal(current.activeStage.id,state.activeStage.id);
 const editBody={operationalMealPolicies:authority.operationalMeals.authority,expectedRevisionId:authority.operationalMeals.revisionId};
 const invalid=structuredClone(editBody);invalid.operationalMealPolicies.policies[0].planResourceItemIds=[2147483647];const bad=await request(configuration,'PUT',invalid);save(label+'-foreign-resource',bad);assert.equal(bad.status,422);
 await (await import('./attacks')).configurationAttacks({...ctx,storage});
 input=await buildEngineInput(planId,storage);save(label+'-input',input);save(label+'-authority-row',(await db.query('SELECT current_config_revision_id,planner_next_profile,planner_next_configuration,daily_operational_meal_policies FROM plans WHERE id=$1',[planId])).rows[0]);save(label+'-revision',(await db.query('SELECT * FROM plan_config_revisions WHERE plan_id=$1 AND id=(SELECT current_config_revision_id FROM plans WHERE id=$1)',[planId])).rows[0]);
 const stage=async(ids:number[],ordinal:number)=>{
  const before=await api(path);await page.goto(`${appUrl}/plans/${planId}?tab=planning`);await page.getByTestId('section-assisted-scope').waitFor();
  const scope=page.getByTestId('section-assisted-scope');await scope.getByRole('checkbox').first().waitFor();
  for(const id of ids){const task=input.tasks.find((t:any)=>t.id===id)!;await scope.locator('label').filter({has:page.getByText(task.templateName,{exact:true})}).filter({hasText:task.contestantName}).getByRole('checkbox').check();}
  const pending=page.waitForResponse((r:any)=>new URL(r.url()).pathname===path+'/proposals'&&r.request().method()==='POST');await page.getByRole('button',{name:'Generar propuesta',exact:true}).click();const generated=await pending;assert.equal(generated.status(),202,await generated.text());const launched=await generated.json();
  let run:any;for(let attempt=0;attempt<600;attempt++){run=await api(path+`/proposals/${launched.runId}`);if(!['queued','pending','running'].includes(run.status))break;await page.waitForTimeout(100);}
  save(`${label}-S${ordinal}-run`,run);const result=run.assisted_result_json??run.assistedResultJson;assert.equal(result.outcome,'PROPOSAL',JSON.stringify(result));assert.ok(result.evidence.hardValid);assert.ok(result.evidence.requiredValid);
  assert.equal(result.evidence.nominalPhysicalFutureWitness.tasks.length,input.tasks.length);assert.equal(result.evidence.nominalPhysicalFutureWitness.operationalMeals.length,policies.length);
  await page.getByRole('button',{name:'Aplicar al borrador',exact:true}).waitFor();
  const action=async(name:string,suffix:string)=>{const pending=page.waitForResponse((r:any)=>new URL(r.url()).pathname===path+suffix&&r.request().method()==='POST');await page.getByRole('button',{name,exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());return response.json();};
  await action('Aplicar al borrador',`/proposals/${launched.runId}/apply`);const draft=await api(path);save(`${label}-S${ordinal}-draft`,draft);
  await (await import('./attacks')).certificateAttacks({...ctx,run,draft,ordinal});
  await action('Validar borrador','/validate');const validated=await api(path);save(`${label}-S${ordinal}-validation`,validated.validation);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
  await action('Aceptar etapa','/accept-stage');const accepted=await api(path);save(`${label}-S${ordinal}-accepted`,accepted);assert.equal(accepted.activeStage.ordinal,ordinal);assert.deepEqual(accepted.activeStage.snapshotJson,draft.draft);
  for(const t of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((p:any)=>p.taskId===t.taskId),t);
  for(const m of before.activeStage.snapshotJson.operationalMeals??[])assert.deepEqual(accepted.activeStage.snapshotJson.operationalMeals.find((p:any)=>p.policyId===m.policyId),m);
  save(`${label}-S${ordinal}-daily`,(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
  await page.getByRole('button',{name:'Planning aceptado · ejecución',exact:true}).click();
  for(const name of ['Mostrar Platós y espacios','Mostrar Recursos']){const toggle=page.getByRole('button',{name,exact:true});if(await toggle.getAttribute('aria-pressed')==='false')await toggle.click();}
  for(const meal of accepted.activeStage.snapshotJson.operationalMeals??[])await page.locator('[data-operational-meal-policy-id='+JSON.stringify(meal.policyId)+']').first().waitFor();
  save(`${label}-S${ordinal}-visible-meals`,await page.locator('[data-operational-meal-policy-id]').evaluateAll((nodes:any[])=>nodes.map(n=>({policyId:n.getAttribute('data-operational-meal-policy-id'),authority:n.getAttribute('data-operational-meal-authority'),scope:n.getAttribute('data-operational-meal-scope'),spaceId:n.getAttribute('data-operational-meal-space-id'),resourceIds:n.getAttribute('data-operational-meal-resource-ids')}))));
  await page.screenshot({path:`${directory}/${label}-S${ordinal}.png`,fullPage:true});return accepted;
 };
 let accepted:any;
 if(label!=='B')accepted=await stage(input.tasks.map((t:any)=>t.id),1);
 else{const s1=await stage([input.tasks[0].id,input.tasks[2].id],1);assert.equal(s1.activeStage.snapshotJson.operationalMeals.length,1);accepted=await stage([input.tasks[1].id,input.tasks[3].id],2);}
 assert.equal(accepted.activeStage.snapshotJson.operationalMeals.length,policies.length);assert.ok(accepted.activeStage.snapshotJson.tasks.every((t:any)=>t.startPlanned));
 await (await import('./attacks')).protectedAttacks({...ctx,accepted});
 save(label+'-rollback',await api(path+'/rollback','POST',{targetStageId:state.activeStage.id}));
 const rolledView=(await effective()).operationalMeals;const denied=await request(configuration,'PUT',{operationalMealPolicies:{contractVersion:1,policies:[]},expectedRevisionId:rolledView.revisionId});save(label+'-protected-after-rollback',denied);assert.equal(denied.status,409);
 const stored=(await db.query('SELECT id,ordinal FROM assisted_planning_stages WHERE plan_id=$1 AND ordinal>0 ORDER BY ordinal',[planId])).rows;for(const stage of stored)save(label+'-redo-'+stage.ordinal,await api(path+'/redo','POST',{targetStageId:Number(stage.id)}));
 assert.deepEqual((await api(path)).activeStage.snapshotJson,accepted.activeStage.snapshotJson);
 save(label+'-sql',(await db.query('SELECT snapshot_json,snapshot_fingerprint FROM assisted_planning_stages WHERE plan_id=$1 ORDER BY ordinal',[planId])).rows);
 pass(`${label}: UI authority → proposal → Draft → validation → real Stage, global pending meals and exact continuation`);
}
