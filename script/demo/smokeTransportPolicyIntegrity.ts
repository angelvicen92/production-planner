/** P10: owned disposable PostgreSQL/Auth/HTTP/Chromium only. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type {Page} from 'playwright';
import type {runA2BrowserJourney} from './smokeA2Journey';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {validateTransportGrouping} from '../../engine/planner-next/transportGrouping';

export async function runTransportPolicyIntegrity(options:Parameters<typeof runA2BrowserJourney>[0],page:Page){
 const {appUrl,users,db,planId,directory,buildInput,pass}=options;
 assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const api=async(path:string,method='GET',body?:unknown,role='production')=>{
  const response=await fetch(`${appUrl}/api${path}`,{method,headers:{Authorization:`Bearer ${users[role].token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json() as any};
 };
 const day=`/plans/${planId}/day-configuration`,assisted=`/plans/${planId}/assisted`;
 const state=async()=>(await api(assisted)).body;
 const guard=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:Number(s.draftBaseStageId)});
 const view=async()=>{const r=await api(`/plans/${planId}/effective-configuration`);assert.equal(r.status,200);return r.body.values.find((v:any)=>v.capabilityId==='OPTIMIZATION').value;};
 const original=(await view()),originalInput=await buildInput();
 const protectedRows=async()=>JSON.stringify((await db.query(`SELECT
  (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM assisted_planning_stages s WHERE plan_id=$1) stages,
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM daily_tasks t WHERE plan_id=$1) tasks,
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM planning_accepted_exceptions e WHERE plan_id=$1) exceptions,
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM plans p WHERE id<>$1) others`,[planId])).rows);
 const untouched=await protectedRows();
 assert.equal(original.effectiveTransport.arrivalMinimumGroupSize,1);
 assert.equal(original.effectiveTransport.arrivalMaximumGroupSize,3);
 assert.equal(original.effectiveTransport.departureMaximumGroupSize,6);
 assert.equal(original.effectiveTransport.vanCapacity,3);
 const originalSnapshot={...original};delete originalSnapshot.effectiveTransport;delete originalSnapshot.transportSources;
 const settings=(await api('/optimizer-settings')).body;
 const generalFields=['arrivalTaskTemplateName','departureTaskTemplateName','arrivalMinimumGroupSize','departureMinimumGroupSize','arrivalMaximumGroupSize','departureMaximumGroupSize','arrivalGroupingTarget','departureGroupingTarget','arrivalMinGapMinutes','departureMinGapMinutes','vanCapacity','weightArrivalDepartureGrouping'];
 const savedGeneral=Object.fromEntries(generalFields.map(key=>[key,settings[key]??(key.endsWith('GroupSize')?null:key.endsWith('Name')?'':0)]));
 // General UI: independent values survive save/reload and never rewrite the day.
 const adminPage=await page.context().browser()!.newPage();
 try{
  await adminPage.goto(`${appUrl}/login`);await adminPage.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await adminPage.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await adminPage.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await adminPage.waitForURL('**/dashboard');
  await adminPage.goto(`${appUrl}/settings`);await adminPage.getByRole('tab',{name:/recursos|resources/i}).click();
  const card=adminPage.getByTestId('settings-section-transport'),toggle=card.locator('h3 > button').first();
  if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  await card.getByLabel('Plantilla Llegada IN',{exact:true}).selectOption(originalInput.arrivalTaskTemplateName!);
  await card.getByLabel('Plantilla Salida OUT',{exact:true}).selectOption(originalInput.departureTaskTemplateName!);
  await card.getByLabel('Mínimo participantes HARD IN',{exact:true}).fill('2');
  await card.getByLabel('Máximo participantes HARD IN',{exact:true}).fill('4');
  await card.getByLabel('Tamaño objetivo preferido IN',{exact:true}).fill('3');
  await card.getByLabel('Mínimo participantes HARD OUT',{exact:true}).fill('2');
  await card.getByLabel('Máximo participantes HARD OUT',{exact:true}).fill('6');
  await card.getByLabel('Tamaño objetivo preferido OUT',{exact:true}).fill('1');
  const response=adminPage.waitForResponse(r=>r.url().endsWith('/api/optimizer-settings')&&r.request().method()==='PATCH');
  await card.getByRole('button',{name:'Guardar transporte',exact:true}).click();assert.equal((await response).status(),200);
  await adminPage.reload();await adminPage.getByRole('tab',{name:/recursos|resources/i}).click();
  if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  assert.equal(await card.getByLabel('Mínimo participantes HARD IN',{exact:true}).inputValue(),'2');
  assert.equal(await card.getByLabel('Tamaño objetivo preferido OUT',{exact:true}).inputValue(),'1');
  await card.screenshot({path:`${directory}/p10-general.png`});
 }finally{await adminPage.close();}
 assert.deepEqual((await view()).effectiveTransport,original.effectiveTransport);
 const invalidGeneral=await api('/optimizer-settings','PATCH',{arrivalMinimumGroupSize:5,arrivalMaximumGroupSize:2},'admin');assert.equal(invalidGeneral.status,400);
 pass('P10 general UI saves/reloads independent IN/OUT bounds and target; existing day ignores changed general values; invalid bounds rejected');
 // Native daily editor must show max OUT 6, although vehicle capacity remains 3.
 await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);
 const editor=page.getByTestId('day-editor-OPTIMIZATION');await editor.waitFor();
 assert.equal(await editor.getByLabel('Máximo participantes HARD OUT',{exact:true}).inputValue(),'6');
 assert.equal(await editor.getByLabel('Mínimo participantes HARD IN',{exact:true}).inputValue(),'1');
 for(const role of ['viewer','aux','norole'])assert.equal((await api(day,'PUT',{optimizer:originalSnapshot},role)).status,403);
 assert.equal((await api(day,'PUT',{optimizer:{...originalSnapshot,transport:{...originalSnapshot.transport,arrivalMinimumGroupSize:3,arrivalMaximumGroupSize:2}}})).status,400);
 const before=await state();
 const revisionBefore=before.currentConfigRevisionId??before.session.currentConfigRevisionId;
 await editor.getByLabel('Mínimo participantes HARD IN',{exact:true}).fill('2');
 const editedResponse=page.waitForResponse(r=>r.url().endsWith(day)&&r.request().method()==='PUT');
 await editor.getByRole('button',{name:'Guardar optimización',exact:true}).click();assert.equal((await editedResponse).status(),200);
 await page.reload();await editor.waitFor();
 assert.equal(await editor.getByLabel('Mínimo participantes HARD IN',{exact:true}).inputValue(),'2');
 assert.equal(await editor.getByLabel('Máximo participantes HARD OUT',{exact:true}).inputValue(),'6');
 await editor.screenshot({path:`${directory}/p10-day-effective.png`});
 const effective=await view(),after=await state(),input=await buildInput(),adapter=adaptEngineInputToPlannerNextProblem(input);
 assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('Transport contract must be representable');
 assert.equal(input.arrivalMinimumGroupSize,2);assert.equal(adapter.problem.transportPolicy!.arrival.minimumGroupSize,2);
 assert.equal(adapter.problem.transportPolicy!.arrival.targetGroupSize,3);assert.equal(adapter.problem.transportPolicy!.departure.maximumGroupSize,6);
 assert.notEqual(after.currentConfigRevisionId??after.session.currentConfigRevisionId,revisionBefore);assert.equal(after.session.draftValidationId,null);
 assert.equal((await api(`${assisted}/accept-stage`,'POST',{...guard(after),confirmation:'NONE'})).status,409);
 const revision=(await db.query('SELECT fingerprint,replay_snapshot_json FROM plan_config_revisions WHERE id=(SELECT current_config_revision_id FROM plans WHERE id=$1)',[planId])).rows[0];
 assert.equal(revision.replay_snapshot_json.optimizerSnapshot.transport.arrivalMinimumGroupSize,2);
 // Independent validator sees the same effective minimum on the accepted geometry.
 const rows=(await db.query('SELECT id,start_planned,end_planned FROM daily_tasks WHERE plan_id=$1',[planId])).rows;
 const scheduled=adapter.problem.tasks.map(task=>{const row=rows.find((r:any)=>String(r.id)===task.id.split(':')[1]);const minute=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3,5));return {...task,start:minute(row.start_planned),end:minute(row.end_planned)};});
 const validation=validateTransportGrouping(adapter.problem,scheduled);
 assert.ok(validation.violations.some(v=>v.dimensions.kind==='GROUP_SIZE'&&v.dimensions.minimumGroupSize===2));
 assert.equal(await protectedRows(),untouched);
 const direct=await db.query('BEGIN');void direct;
 try{await assert.rejects(()=>db.query('UPDATE plan_optimizer_snapshots SET arrival_minimum_group_size=1 WHERE plan_id=$1',[planId]),/TRANSPORT_POLICY_REQUIRES_VERSIONED_OPERATION/);}finally{await db.query('ROLLBACK');}
 // An explicit refresh advances only the inherited baseline while keeping this override.
 assert.equal((await api(`${day}/refresh`,'POST',{capabilities:['OPTIMIZATION'],legacyTreatment:'ADOPT_GENERAL_AS_INHERITED'})).status,200);
 assert.equal((await buildInput()).arrivalMinimumGroupSize,2);
 const restored=await api(`${day}/restore`,'POST',{capability:'OPTIMIZATION'});assert.equal(restored.status,200,JSON.stringify(restored));
 assert.equal((await buildInput()).arrivalMaximumGroupSize,3,'immutable legacy daily maximum still outranks inherited general maximum 4');
 // Return future actions to the original effective A2 authority via a new revision.
 assert.equal((await api(day,'PUT',{optimizer:originalSnapshot})).status,200);
 const finalInput=await buildInput();assert.equal(finalInput.arrivalMinimumGroupSize,undefined);assert.equal(finalInput.arrivalMaximumGroupSize,originalInput.arrivalMaximumGroupSize);assert.equal(finalInput.departureMaximumGroupSize,originalInput.departureMaximumGroupSize);
 assert.equal((await api('/optimizer-settings','PATCH',savedGeneral,'admin')).status,200);
 assert.equal(await protectedRows(),untouched);
 pass('P10 daily UI -> atomic revision -> real storage -> adapter -> independent minimum HARD; stale validation, role checks, local restore and direct-write guard; Stages and 266 tasks unchanged');
 const result={status:'PASS',remoteWrites:0,original:original.effectiveTransport,originalSources:original.transportSources,effective:effective.effectiveTransport,sources:effective.transportSources,policy:adapter.problem.transportPolicy,revisionFingerprint:revision.fingerprint,validation:validation.violations,protectedMaterial:'UNCHANGED',invalidGeneral:invalidGeneral.status,staleAcceptance:409,restore:restored.status};
 writeFileSync(`${directory}/transport-policy.json`,JSON.stringify(result,null,2));return result;
}
