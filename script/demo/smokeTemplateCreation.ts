import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium, type Page} from 'playwright';
import {api, buildUrl} from '../../shared/routes';
import type {IStorage} from '../../server/storage';
import type {buildEngineInput as BuildEngineInput} from '../../engine/buildInput';
import {participantGapMinutes} from '../../engine/planner-next/participantTransition';

type User={token:string;email:string;password:string};
// Complete-table fingerprints include all protected days and catalog records.
const tables=['task_templates','plan_task_template_snapshots','plans','daily_tasks','locks','assisted_planning_stages','plan_config_revisions'];

export async function runTemplateCreation(options:{appUrl:string;baselineUrl?:string;db:pg.Client;users:Record<string,User>;directory:string;pass:(name:string)=>void;storage:IStorage;buildEngineInput:typeof BuildEngineInput}){
 const {appUrl,baselineUrl,db,users,directory,pass,storage,buildEngineInput}=options;
 assert.ok(baselineUrl,'TEMPLATE_CREATION_BASELINE_ROOT must identify the unchanged authorized base');
 for(const url of [appUrl,baselineUrl])assert.equal(new URL(url).hostname,'127.0.0.1');
 const fingerprints=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.query("SELECT count(*)::int AS count,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS hash FROM public."+table+' t')).rows[0]])));
 const request=async(url:string,path:string,method:string,role='admin',body?:unknown)=>{
  const response=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:'Bearer '+(role==='invalid-token'?'invalid-token':users[role].token)})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json()};
 };
 const read=async(id:number)=>(await request(appUrl,api.taskTemplates.list.path,'GET')).data.find((t:{id:number})=>t.id===Number(id));
 // A nonempty explicit lock makes preservation assertions meaningful.
 const lock=(await db.query("INSERT INTO public.locks(plan_id,task_id,lock_type,created_by,reason) SELECT plan_id,id,'full','U02 disposable probe','U02 preservation probe' FROM public.daily_tasks WHERE plan_id=26999 ORDER BY id LIMIT 1 RETURNING id")).rows[0];assert.ok(lock);
 const original=await fingerprints(),report:any={baseline:[],candidate:[],denials:[],invalid:[],snapshots:[],revisions:[],original};
 const save=()=>writeFileSync(directory+'/template-creation.json',JSON.stringify(report,null,2));
 const assertUpdated=async(id:number,before:any,patch:Record<string,unknown>)=>{
  const after=await read(id);
  assert.deepEqual(after,{...before,...patch,revision:before.revision+1},'successful UPDATE increments revision exactly once and preserves every other field');
  report.revisions.push({id,before:before.revision,after:after.revision,patch});
  return after;
 };
 const ids:number[]=[],planIds:number[]=[];
 const fixture=(await db.query("INSERT INTO public.task_templates(name,default_duration,default_cameras,abbrev,participant_margin_before_minutes,participant_margin_after_minutes) VALUES ('U02 edit probe',10,0,'U02',0,15) RETURNING id")).rows[0];
 ids.push(Number(fixture.id));
 const editPath=buildUrl(api.taskTemplates.update.path,{id:fixture.id});
 const browser=await chromium.launch({headless:true});
 const login=async(url:string,role='admin')=>{
  const page=await browser.newPage();await page.goto(url+'/login');
  await page.getByLabel('Email',{exact:true}).fill(users[role].email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users[role].password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await page.goto(url+'/settings');
  if(role==='admin')await page.getByRole('tab',{name:/plantillas|templates/i}).click();
  else await page.waitForURL(url=>url.pathname!=='/settings');
  return page;
 };
 const card=(page:Page)=>page.locator('.bg-card').filter({has:page.getByText('U02 edit probe',{exact:true})}).last();
 const createUI=async(page:Page,url:string,name:string)=>{
  await page.getByRole('button',{name:'Create',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByPlaceholder('Name',{exact:true}).fill(name);
  await dialog.getByPlaceholder('Abreviatura (ej. ENTR)',{exact:true}).fill('U02-UI');
  await dialog.getByPlaceholder('Antes: heredado',{exact:true}).fill('0');
  await dialog.getByPlaceholder('Después: heredado',{exact:true}).fill('10');
  const waiting=page.waitForResponse(r=>r.url()===url+api.taskTemplates.create.path&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Guardar',exact:true}).click();const response=await waiting;
  return {status:response.status(),payload:response.request().postDataJSON(),data:await response.json()};
 };
 try{
  const before=await fingerprints(),baseline=await login(baselineUrl);
  const created=await createUI(baseline,baselineUrl,'U02 baseline create');
  assert.equal(created.status,400);assert.match(created.data.message,/Unrecognized key/);
  assert.deepEqual(await fingerprints(),before);report.baseline.push({operation:'real UI create',...created});save();
  await baseline.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await card(baseline).getByRole('button',{name:'Editar',exact:true}).click();
  await baseline.getByPlaceholder('30',{exact:true}).fill('17');
  const waiting=baseline.waitForResponse(r=>new URL(r.url()).pathname===editPath&&r.request().method()==='PATCH');
  await baseline.getByRole('button',{name:'Guardar',exact:true}).click();const response=await waiting;
  const payload=response.request().postDataJSON(),error=await response.json();
  assert.equal(response.status(),400);assert.match(error.message,/location_label/);
  assert.equal('participantMarginBeforeMinutes' in payload,false);assert.equal('participantMarginAfterMinutes' in payload,false);
  assert.deepEqual(await fingerprints(),before);report.baseline.push({operation:'real UI full PATCH',status:response.status(),payload,error});
  const marginOnly=await request(baselineUrl,editPath,'PATCH','admin',{participantMarginBeforeMinutes:0,participantMarginAfterMinutes:15});
  assert.equal(marginOnly.status,400);report.baseline.push({operation:'HTTP margin PATCH',...marginOnly});
  await baseline.screenshot({path:directory+'/template-creation-baseline.png',fullPage:true});await baseline.close();save();
  pass('unchanged baseline reproduces real UI create rejection, omitted margins and native location_label failure without writes');

  const page=await login(appUrl),result=await createUI(page,appUrl,'U02 candidate create');
  if(result.status===201)ids.push(result.data.id);
  report.candidate.push({operation:'real UI create',...result});save();assert.equal(result.status,201);
  for(const [key,value] of Object.entries(result.payload))assert.deepEqual(result.data[key],value,key);
  assert.deepEqual(await read(result.data.id),result.data);
  await page.reload();await page.getByRole('tab',{name:/plantillas|templates/i}).click();
  // Seed non-visible but supported values through the same authenticated API.
  // Unchanged controls must preserve them exactly during a full UI save.
  const complete={...payload,defaultDuration:10,abbrev:'U02',requiresCoach:true,requiresPresenter:true,exclusiveAuxiliar:true,setupId:7,
   hasDependency:true,dependsOnTemplateIds:[result.data.id],dependsOnTemplateId:result.data.id,itinerantTeamRequirement:'any',itinerantTeamId:null,
   defaultComment1Color:'#123456',defaultComment2Color:'#abcdef',uiColor:'#aabbcc88',uiColorSecondary:'#11223344',
   rulesJson:{retained:{value:0}},resourceRequirements:{byType:{3:2},byItem:{4:1},anyOf:[]},participantMarginBeforeMinutes:0,participantMarginAfterMinutes:15};
  const beforeComplete=await read(fixture.id);
  assert.equal((await request(appUrl,editPath,'PATCH','admin',complete)).status,200);
  const full=await assertUpdated(fixture.id,beforeComplete,complete);report.candidate.push({operation:'HTTP full PATCH',value:full});
  assert.ok(full);for(const [key,value] of Object.entries(complete))assert.deepEqual(full[key],value,key);
  await page.reload();await page.getByRole('tab',{name:/plantillas|templates/i}).click();await card(page).getByRole('button',{name:'Editar',exact:true}).click();
  const beforeInput=page.getByRole('spinbutton',{name:'Margen antes (vacío = heredado)',exact:true});
  const afterInput=page.getByRole('spinbutton',{name:'Margen después (vacío = heredado)',exact:true});
  await beforeInput.fill('0');await afterInput.fill('20');
  const editRequests:{method:string;path:string}[]=[],editResponses:{status:number;path:string}[]=[];
  page.on('request',r=>{if(new URL(r.url()).pathname===editPath)editRequests.push({method:r.method(),path:editPath});});
  page.on('response',r=>{if(new URL(r.url()).pathname===editPath)editResponses.push({status:r.status(),path:editPath});});
  const edited=page.waitForResponse(r=>new URL(r.url()).pathname===editPath&&r.request().method()==='PATCH');
  const editedResponse=await (async()=>{try{
   await page.getByRole('button',{name:'Guardar',exact:true}).click();
   report.editUiAfterClick=await page.getByText('Selecciona al menos un equipo itinerante',{exact:true}).allTextContents();save();return await edited;
  }catch(error){report.editFailure={requests:editRequests,responses:editResponses,alerts:await page.getByRole('status').allTextContents()};save();throw error;}})();
  assert.equal(editedResponse.status(),200);const editedBody=editedResponse.request().postDataJSON();
  assert.equal('itinerantTeamRequirement' in editedBody,false);assert.equal('itinerantTeamId' in editedBody,false);
  report.candidate.push({operation:'real UI legacy itinerary margin PATCH',requests:editRequests,responses:editResponses,payload:editedBody});save();
  assert.equal(editedBody.participantMarginBeforeMinutes,0);assert.equal(editedBody.participantMarginAfterMinutes,20);
  await assertUpdated(fixture.id,full,{participantMarginAfterMinutes:20});
  for(const values of [[null,0],[5,null],[0,20]] as const){
   await page.reload();await page.getByRole('tab',{name:/plantillas|templates/i}).click();await card(page).getByRole('button',{name:'Editar',exact:true}).click();
   const current=await read(fixture.id);assert.equal(await beforeInput.inputValue(),current.participantMarginBeforeMinutes==null?'':String(current.participantMarginBeforeMinutes));
   assert.equal(await afterInput.inputValue(),current.participantMarginAfterMinutes==null?'':String(current.participantMarginAfterMinutes));
   await beforeInput.fill(values[0]==null?'':String(values[0]));await afterInput.fill(values[1]==null?'':String(values[1]));
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname===editPath&&r.request().method()==='PATCH');await page.getByRole('button',{name:'Guardar',exact:true}).click();assert.equal((await saved).status(),200);
   const after=await assertUpdated(fixture.id,current,{participantMarginBeforeMinutes:values[0],participantMarginAfterMinutes:values[1]});
   assert.deepEqual(after,{...full,participantMarginBeforeMinutes:values[0],participantMarginAfterMinutes:values[1],revision:current.revision+1});
  }
  await page.reload();await page.getByRole('tab',{name:/plantillas|templates/i}).click();await card(page).getByRole('button',{name:'Editar',exact:true}).click();
  let invalidWrites=0;page.on('request',r=>{if(r.method()==='PATCH'&&new URL(r.url()).pathname===editPath)invalidWrites++;});
  const invalidBefore=await fingerprints();
  for(const input of [beforeInput,afterInput]){
   const savedValue=await input.inputValue();
   for(const value of ['-1','1.5','2147483648']){
    await input.fill(value);await page.getByRole('button',{name:'Guardar',exact:true}).click();
    await page.getByText('Los márgenes deben ser minutos enteros no negativos o quedar vacíos para heredar.',{exact:true}).last().waitFor();
   }
   await input.fill(savedValue);
  }
  assert.equal(invalidWrites,0);assert.deepEqual(await fingerprints(),invalidBefore);report.invalid.push({operation:'real UI invalid edit',cases:6,writes:0});
  await page.screenshot({path:directory+'/template-creation-candidate.png',fullPage:true});await page.close();
  pass('real admin create/edit/reload preserves all supported fields, null, zero and positive margins');

  for(const beforeMargin of [null,0,5])for(const afterMargin of [null,0,15]){
   const body={...complete,name:'U02 full HTTP create',participantMarginBeforeMinutes:beforeMargin,participantMarginAfterMinutes:afterMargin};
   const created=await request(appUrl,api.taskTemplates.create.path,'POST','admin',body);assert.equal(created.status,201);ids.push(created.data.id);
   for(const [key,value] of Object.entries(body))assert.deepEqual(created.data[key],value,key);
   assert.deepEqual(await read(created.data.id),created.data);
   report.candidate.push({operation:'HTTP complete create and GET',beforeMargin,afterMargin,status:created.status});
  }

  for(const key of ['participantMarginBeforeMinutes','participantMarginAfterMinutes'])for(const value of [-1,1.5,'5','',true,{},2147483648]){
   for(const method of ['POST','PATCH']){
    const before=await fingerprints(),body=method==='POST'?{name:'Invalid U02',defaultDuration:10,[key]:value}:{[key]:value};
    const r=await request(appUrl,method==='POST'?api.taskTemplates.create.path:editPath,method,'admin',body);
    assert.equal(r.status,400);assert.deepEqual(await fingerprints(),before);report.invalid.push({method,key,value,status:r.status});
   }
  }
  for(const role of ['production','aux','viewer','norole','anonymous','invalid-token'])for(const [method,path,body] of [
   ['POST',api.taskTemplates.create.path,{name:'Denied U02',defaultDuration:10,participantMarginBeforeMinutes:0}],
   ['PATCH',editPath,complete],['PATCH','/API/tA/'+fixture.id+'/',{participantMarginBeforeMinutes:5}],
   ['DELETE',buildUrl(api.taskTemplates.delete.path,{id:fixture.id}),undefined],
  ] as const){
   const before=await fingerprints(),r=await request(appUrl,path,method,role,body);assert.equal(r.status,['anonymous','invalid-token'].includes(role)?401:403);assert.deepEqual(await fingerprints(),before);report.denials.push({role,method,path,status:r.status});
  }
  for(const role of ['production','aux','viewer']){
   const deniedPage=await login(appUrl,role),before=await fingerprints();
   assert.notEqual(new URL(deniedPage.url()).pathname,'/settings');assert.equal(await deniedPage.getByRole('tab',{name:/plantillas|templates/i}).count(),0);
   assert.deepEqual(await fingerprints(),before);await deniedPage.close();
   report.denials.push({role,operation:'real UI settings route denied',writes:0});
  }
  pass('invalid values and unauthorized HTTP/browser writes preserve every observed table');

  // New days use the current catalog through the real create-plan handler.
  // Keep this probe representable; the rich UI fixture above is not an engine fixture.
  const newTemplate=await request(appUrl,api.taskTemplates.create.path,'POST','admin',{name:'U02 snapshot probe',defaultDuration:10,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:15});assert.equal(newTemplate.status,201);ids.push(newTemplate.data.id);
  const newPlan=async(date:string)=>{const r=await request(appUrl,api.plans.create.path,'POST','admin',{date,configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'}}});assert.equal(r.status,201,JSON.stringify(r.data));planIds.push(r.data.id);return r.data.id as number;};
  const oldPlan=await newPlan('2026-11-20');
  const snapshot=async(planId:number)=>(await db.query('SELECT * FROM public.plan_task_template_snapshots WHERE plan_id=$1 AND source_template_id=$2',[planId,newTemplate.data.id])).rows[0];
  const oldSnapshot=await snapshot(oldPlan);
  const newPath=buildUrl(api.taskTemplates.update.path,{id:newTemplate.data.id});
  const beforeGlobalEdit=await fingerprints(),beforeFirstUpdate=await read(newTemplate.data.id);
  assert.equal((await request(appUrl,newPath,'PATCH','admin',{participantMarginBeforeMinutes:20,participantMarginAfterMinutes:0})).status,200);
  await assertUpdated(newTemplate.data.id,beforeFirstUpdate,{participantMarginBeforeMinutes:20,participantMarginAfterMinutes:0});
  const afterGlobalEdit=await fingerprints();for(const table of tables.filter(t=>t!=='task_templates'))assert.deepEqual(afterGlobalEdit[table],beforeGlobalEdit[table]);
  const nextPlan=await newPlan('2026-11-21');assert.deepEqual(await snapshot(oldPlan),oldSnapshot);
  const nextSnapshot=await snapshot(nextPlan);assert.equal(oldSnapshot.participant_margin_before_minutes,0);assert.equal(oldSnapshot.participant_margin_after_minutes,15);assert.equal(nextSnapshot.participant_margin_before_minutes,20);assert.equal(nextSnapshot.participant_margin_after_minutes,0);
  const beforeNullUpdate=await read(newTemplate.data.id);
  assert.equal((await request(appUrl,newPath,'PATCH','admin',{participantMarginBeforeMinutes:null,participantMarginAfterMinutes:null})).status,200);
  await assertUpdated(newTemplate.data.id,beforeNullUpdate,{participantMarginBeforeMinutes:null,participantMarginAfterMinutes:null});
  const nullPlan=await newPlan('2026-11-22');assert.deepEqual(await snapshot(oldPlan),oldSnapshot);assert.deepEqual(await snapshot(nextPlan),nextSnapshot);
  for(const planId of [oldPlan,nextPlan,nullPlan]){
   const task=await request(appUrl,api.dailyTasks.create.path,'POST','admin',{planId,templateId:newTemplate.data.id});assert.equal(task.status,201,JSON.stringify(task.data));
   const input=await buildEngineInput(planId,storage),projected=input.tasks.find(t=>t.id===task.data.id)!;
   assert.equal(projected.participantMarginBeforeMinutes,planId===oldPlan?0:planId===nextPlan?20:null);assert.equal(projected.participantMarginAfterMinutes,planId===oldPlan?15:planId===nextPlan?0:null);
   // Null daily overrides inherit the immutable snapshot, explicit zero wins.
   await db.query('UPDATE public.daily_tasks SET participant_margin_before_minutes=0,participant_margin_after_minutes=5 WHERE id=$1',[task.data.id]);
   const override=(await buildEngineInput(planId,storage)).tasks.find(t=>t.id===task.data.id)!;assert.equal(override.participantMarginBeforeMinutes,0);assert.equal(override.participantMarginAfterMinutes,5);
   await db.query('UPDATE public.daily_tasks SET participant_margin_before_minutes=NULL,participant_margin_after_minutes=NULL WHERE id=$1',[task.data.id]);
   assert.deepEqual((await buildEngineInput(planId,storage)).tasks.find(t=>t.id===task.data.id),projected);
   report.snapshots.push({planId,snapshot:await snapshot(planId),projected:{before:projected.participantMarginBeforeMinutes,after:projected.participantMarginAfterMinutes}});
  }
  for(const [after,before,expected] of [[null,null,5],[0,null,0],[null,0,0],[15,null,15],[0,20,20],[15,20,20]] as const){
   assert.equal(participantGapMinutes({participantTransitionMinutes:5} as any,{participantId:'probe',participantMarginAfterMinutes:after} as any,{participantId:'probe',participantMarginBeforeMinutes:before} as any),expected);
  }
  pass('real future plan snapshot and EngineInput preserve zero/null/positive overrides; previous day snapshot unchanged; existing max boundary reused');
 }finally{
  await browser.close();
  for(const id of planIds.reverse()){
   await db.query('DELETE FROM public.daily_tasks WHERE plan_id=$1',[id]);
   await db.query('DELETE FROM public.plans WHERE id=$1',[id]);
  }
  for(const id of ids.reverse())await db.query('DELETE FROM public.task_templates WHERE id=$1',[id]);
  report.final=await fingerprints();save();assert.deepEqual(report.final,original,'all imported A2 obligations, Stages, locks, revisions and existing data must remain identical');
  await db.query('DELETE FROM public.locks WHERE id=$1',[lock.id]);
 }
 return report;
}
