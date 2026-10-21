import {writeFileSync} from "node:fs";
import assert from 'node:assert/strict';
import type {Page} from 'playwright';
import {autoMainFlowPreference} from '../../shared/mainFlowPreference';
import {mainFlowPreferenceResultMessage} from '../../client/src/lib/main-flow-preference-result';

const preference={blockCountPolicy:{mode:'SOFT_PREFER_N',count:4},mealSplitPreference:{mode:'PREFERRED',beforeMealBlocks:2,afterMealBlocks:2}} as const;
export async function configureMainFlowPreferenceJourney(options:any,page:Page){
 const {db,planId,appUrl,users,pass}=options;
 const api=async(suffix:string,method='GET',body?:unknown,role='production')=>{
  const r=await fetch(`${appUrl}/api${suffix}`,{method,headers:{'Content-Type':'application/json',...(role==='anon'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json() as any};
 };
 const original=(await db.query('SELECT planner_next_configuration FROM public.plans WHERE id=$1',[planId])).rows[0].planner_next_configuration;
 const otherDays=(await db.query('SELECT to_jsonb(p) row FROM public.plans p WHERE id<>$1 ORDER BY id',[planId])).rows;
 const saved=async()=>(await db.query('SELECT main_preferred_block_count,main_before_meal_blocks,current_config_revision_id FROM public.plans WHERE id=$1',[planId])).rows[0];
 const initial=await saved();assert.equal(initial.main_preferred_block_count,null);
 for(const role of ['anon','norole','viewer','aux']){const r=await api(`/plans/${planId}/day-configuration`,'PUT',{mainFlowPreference:preference},role);assert.equal(r.status,role==='anon'?401:403);}
 assert.deepEqual(await saved(),initial);
 // Exercise the habitual origin in the real settings UI, independently of
 // the exceptional daily editor. General changes never rewrite existing days.
 const adminPage=await page.context().browser()!.newPage();
 try{
  await adminPage.goto(`${appUrl}/login`);await adminPage.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await adminPage.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await adminPage.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await adminPage.waitForURL('**/dashboard');
  await adminPage.goto(`${appUrl}/settings`);const generalEditor=adminPage.getByTestId('main-flow-preference-editor');await generalEditor.waitFor();
  await generalEditor.getByLabel('Modo de bloques',{exact:true}).selectOption('SOFT');await generalEditor.getByLabel('Número preferido de bloques',{exact:true}).fill('3');
  const generalSaved=adminPage.waitForResponse(r=>r.url().endsWith('/api/program-settings')&&r.request().method()==='PATCH');
  await generalEditor.getByRole('button',{name:'Guardar estructura preferida',exact:true}).click();assert.equal((await generalSaved).status(),200);
  await adminPage.reload();await generalEditor.waitFor();assert.equal(await generalEditor.getByLabel('Número preferido de bloques',{exact:true}).inputValue(),'3');
  assert.deepEqual(await saved(),initial);
  const newDay=(await db.query(`INSERT INTO public.plans(date,work_start,work_end,meal_start,meal_end,work_baseline_start,work_baseline_end,work_config_source,meal_baseline_start,meal_baseline_end,meal_baseline_mode,meal_config_source)
   SELECT date+1,work_baseline_start,work_baseline_end,meal_baseline_start,meal_baseline_end,work_baseline_start,work_baseline_end,'INHERITED',meal_baseline_start,meal_baseline_end,meal_baseline_mode,'INHERITED' FROM public.plans WHERE id=$1 RETURNING id,main_preferred_block_count,main_baseline_preferred_block_count,main_preference_source`,[planId])).rows[0];
  assert.equal(newDay.main_preferred_block_count,3);assert.equal(newDay.main_baseline_preferred_block_count,3);assert.equal(newDay.main_preference_source,'INHERITED');
  assert.equal((await api('/program-settings','PATCH',{mainFlowPreference:autoMainFlowPreference},'admin')).status,200);
  assert.equal((await db.query('SELECT main_preferred_block_count FROM public.plans WHERE id=$1',[newDay.id])).rows[0].main_preferred_block_count,3);
  await db.query('DELETE FROM public.plans WHERE id=$1',[newDay.id]);
 }finally{await adminPage.close();}
 pass('habitual preference saved/reloaded in settings UI; new-day baseline inherits it and later general edits do not rewrite existing days');
 await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);const editor=page.getByTestId('main-flow-preference-editor');await editor.waitFor();
 await editor.getByLabel('Modo de bloques',{exact:true}).selectOption('SOFT');
 await editor.getByLabel('Número preferido de bloques',{exact:true}).selectOption('4');
 await editor.getByLabel('Preferir distribución de bloques antes y después de la comida',{exact:true}).check();
 await editor.getByLabel('Bloques antes de comer',{exact:true}).fill('2');
 assert.match(await editor.getByTestId('main-flow-preference-summary').innerText(),/4 bloques, 2 antes y 2 después/);
 const response=page.waitForResponse(r=>r.url().endsWith(`/plans/${planId}/day-configuration`)&&r.request().method()==='PUT');
 await editor.getByRole('button',{name:'Guardar estructura preferida',exact:true}).click();const write=await response;assert.equal(write.status(),200);assert.deepEqual(write.request().postDataJSON(),{mainFlowPreference:preference});
 await page.reload();await editor.waitFor();assert.equal(await editor.getByLabel('Modo de bloques',{exact:true}).inputValue(),'SOFT');assert.equal(await editor.getByLabel('Número preferido de bloques',{exact:true}).inputValue(),'4');assert.equal(await editor.getByLabel('Bloques antes de comer',{exact:true}).inputValue(),'2');
 assert.equal(await editor.getByLabel('Preferir distribución de bloques antes y después de la comida',{exact:true}).isChecked(),true);
 const view=(await api(`/plans/${planId}/effective-configuration`)).data,value=view.values.find((v:any)=>v.capabilityId==='BLOCK_COUNT_POLICY');
 assert.equal(value.source,'DAY_OVERRIDE');assert.ok(value.fingerprint);assert.ok(value.effectiveRevision);assert.equal(value.canRestoreInherited,true);
 assert.deepEqual(view.mainFlowPreference.value,preference);
 const revision=(await db.query('SELECT replay_snapshot_json,identity_json FROM public.plan_config_revisions WHERE id=$1',[value.effectiveRevision])).rows[0];
 assert.deepEqual(revision.replay_snapshot_json.authorities.plan_workday[0].plannerNextAuthorities.plannerNext.mainFlow.preference,preference);
 assert.equal(revision.identity_json.configurationFingerprint,value.fingerprint);
 assert.deepEqual((await db.query('SELECT planner_next_configuration FROM public.plans WHERE id=$1',[planId])).rows[0].planner_next_configuration,original);
 await db.query('SET ROLE service_role');try{await assert.rejects(()=>db.query('UPDATE public.plans SET main_preferred_block_count=3 WHERE id=$1',[planId]),/MAIN_PREFERENCE_REQUIRES_VERSIONED_OPERATION/);}finally{await db.query('RESET ROLE');}
 await assert.rejects(()=>db.query("UPDATE public.plans SET planner_next_configuration='{}'::jsonb WHERE id=$1",[planId]),/PLANNER_NEXT_CONFIGURATION_IMMUTABLE/);
 // Restore via OptiPlan's in-app confirmation; never depend on browser-native dialogs.
 const nativeDialogs:string[]=[];
 page.removeAllListeners('dialog');page.on('dialog',dialog=>{nativeDialogs.push(dialog.type());void dialog.dismiss();});
 const restored=page.waitForResponse(r=>r.url().endsWith(`/plans/${planId}/day-configuration/restore`));
 await page.locator('#config-BLOCK_COUNT_POLICY').getByRole('button',{name:'Restaurar heredado',exact:true}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Restaurar',exact:true}).click();
 assert.equal((await restored).status(),200);
 await page.reload();await editor.waitFor();assert.equal(await editor.getByLabel('Modo de bloques',{exact:true}).inputValue(),'AUTO');
 assert.deepEqual((await api(`/plans/${planId}/effective-configuration`)).data.mainFlowPreference.value,autoMainFlowPreference);
 const reapply=await api(`/plans/${planId}/day-configuration`,'PUT',{mainFlowPreference:preference});assert.equal(reapply.status,200);
 const generalThree={blockCountPolicy:{mode:'SOFT_PREFER_N',count:3},mealSplitPreference:{mode:'OFF'}};
 assert.equal((await api('/program-settings','PATCH',{mainFlowPreference:generalThree},'admin')).status,200);
 await page.reload();await editor.waitFor();
 const refreshed=page.waitForResponse(r=>r.url().endsWith(`/plans/${planId}/day-configuration/refresh`));
 await page.locator('#config-BLOCK_COUNT_POLICY').getByRole('button',{name:'Actualizar herencia desde configuración general',exact:true}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Actualizar herencia',exact:true}).click();
 assert.equal((await refreshed).status(),200);assert.deepEqual(nativeDialogs,[]);
 const refreshedView=(await api(`/plans/${planId}/effective-configuration`)).data;
 assert.deepEqual(refreshedView.mainFlowPreference.value,preference);assert.deepEqual(refreshedView.mainFlowPreference.baseline,generalThree);
 assert.equal((await api(`/plans/${planId}/day-configuration/restore`,'POST',{capability:'BLOCK_COUNT_POLICY'})).status,200);
 assert.deepEqual((await api(`/plans/${planId}/effective-configuration`)).data.mainFlowPreference.value,generalThree);
 assert.equal((await api('/program-settings','PATCH',{mainFlowPreference:autoMainFlowPreference},'admin')).status,200);
 assert.equal((await api(`/plans/${planId}/day-configuration`,'PUT',{mainFlowPreference:preference})).status,200);
 pass('explicit preference refresh advances inherited baseline, preserves active override and restores locally without consulting general');

 assert.deepEqual((await db.query('SELECT to_jsonb(p) row FROM public.plans p WHERE id<>$1 ORDER BY id',[planId])).rows,otherDays);
 pass('typed main preference: real configuration UI save/reload/restore, unauthorized HTTP denial, revision/replay and immutable 088 snapshot');
 page.removeAllListeners('dialog');page.on('dialog',dialog=>void dialog.dismiss());
 await page.goto(`${appUrl}/plans/${planId}?tab=planning`);await page.getByTestId('assisted-workspace').waitFor();
 return {preference,original,otherDays,api};
}
export async function verifyMainFlowPreferenceResult(options:any,page:Page,result:any,configured:any){
 const e=result.evidence.mainFlowSoftPreference;assert.ok(e);assert.equal(e.requested,4);assert.equal(e.achieved,4);assert.equal(e.mealSplitPreferenceAchieved,true);
 assert.deepEqual(e.mealSplitRequested,configured.preference.mealSplitPreference);assert.equal(e.mealSplitAchieved.blocksBeforeMeal,2);assert.equal(e.mealSplitAchieved.blocksAfterMeal,2);assert.equal(e.mealSplitAchieved.blockSpansMeal,false);
 const card=page.getByTestId('main-flow-preference-result');await card.waitFor();assert.equal((await card.innerText()).trim(),mainFlowPreferenceResultMessage(e));
 if(!options.diagnostics.mainFlowPreference){options.diagnostics.mainFlowPreference={soft:e,work:result.evidence.work,completeObligations:result.evidence.futureStructuralWitnesses.find((w:any)=>w.kind==='JOINT_COMPLETION').tasks.length+result.evidence.futureStructuralWitnesses.find((w:any)=>w.kind==='JOINT_COMPLETION').participantMeals.length};writeFileSync(`${options.directory}/main-flow-preference-S1-result.json`,JSON.stringify(result,null,2));}
 options.pass('selected production run Evidence renders achieved 4 blocks and real 2+2 distribution');
}
export async function verifyMainFlowPreferenceAfterStages(options:any,configured:any){
 const {db,planId,pass}=options,{api}=configured;
 const before=(await db.query('SELECT current_config_revision_id,main_preferred_block_count,main_before_meal_blocks FROM public.plans WHERE id=$1',[planId])).rows[0];
 const state=(await api(`/plans/${planId}/assisted`)).data;
 // Changing the preference cannot rewrite accepted Stages or restore old runs.
 const stages=(await db.query('SELECT to_jsonb(s) row FROM public.assisted_planning_stages s WHERE plan_id=$1 ORDER BY id',[planId])).rows;
 const changed=await api(`/plans/${planId}/day-configuration`,'PUT',{mainFlowPreference:{blockCountPolicy:{mode:'SOFT_PREFER_N',count:3},mealSplitPreference:{mode:'OFF'}}});assert.equal(changed.status,200);
 assert.deepEqual((await db.query('SELECT to_jsonb(s) row FROM public.assisted_planning_stages s WHERE plan_id=$1 ORDER BY id',[planId])).rows,stages);
 // Pin the old run's real base so configuration freshness is the first
 // differing authority, rather than testing an already stale base/draft.
 assert.equal((await api(`/plans/${planId}/assisted/rollback`,'POST',{targetStageId:Number(state.activeStage.parentStageId)})).status,200);
 const replayBase=(await api(`/plans/${planId}/assisted`)).data;
 const stale=await api(`/plans/${planId}/assisted/proposals/${state.activeStage.proposalRunId}/apply`,'POST',{expectedDraftFingerprint:replayBase.draftFingerprint,expectedBaseStageId:Number(replayBase.draftBaseStageId)});assert.equal(stale.status,409);assert.match(JSON.stringify(stale.data),/STALE_CONFIG_REVISION/);
 const s0=state.history.find((s:any)=>s.ordinal===0),rollback=await api(`/plans/${planId}/assisted/rollback`,'POST',{targetStageId:Number(s0.id)});assert.equal(rollback.status,200);
 const after=(await db.query('SELECT main_preferred_block_count,main_before_meal_blocks FROM public.plans WHERE id=$1',[planId])).rows[0];assert.equal(after.main_preferred_block_count,3);assert.equal(after.main_before_meal_blocks,null);
 for(let i=1;i<state.history.length;i++)assert.equal((await api(`/plans/${planId}/assisted/redo`,'POST',{})).status,200);
 assert.equal((await api(`/plans/${planId}/assisted`)).data.activeStage.id,state.activeStage.id);
 assert.equal((await api(`/plans/${planId}/day-configuration`,'PUT',{mainFlowPreference:configured.preference})).status,200);
 assert.notEqual((await db.query('SELECT current_config_revision_id FROM public.plans WHERE id=$1',[planId])).rows[0].current_config_revision_id,before.current_config_revision_id);
 assert.deepEqual((await db.query('SELECT planner_next_configuration FROM public.plans WHERE id=$1',[planId])).rows[0].planner_next_configuration,configured.original);
 assert.deepEqual((await db.query('SELECT to_jsonb(p) row FROM public.plans p WHERE id<>$1 ORDER BY id',[planId])).rows,configured.otherDays);
 pass('preference revision keeps accepted Stages, rejects stale proposals and survives real rollback/redo without touching other days');
}
