import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {effectiveResourceTransitionMinutes} from '../../../engine/planner-next/resourceRouteTransitions';
import {validatePlan} from '../../../engine/planner-next/validate';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';

export async function journey({appUrl,url,anon,users,db,directory,pass}:any) {
 assert.equal(db.host,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(name:string,value:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(value,null,2));
 const receipts:any[]=[],negatives:any[]=[],deterministic:any[]=[];
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
  const response=await fetch(appUrl+path,{method,headers:{Connection:'close','Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});
  const r={status:response.status,body:await response.json()};receipts.push({path,method,request:body,role,response:r});save('receipts',receipts);return r;
 };
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body as any;};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium'});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
 const login=async()=>{await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');};
 const createDay=async(date:string)=>{
  await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(date);
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const r=await pending;assert.equal(r.status(),201,await r.text());const body=await r.json();receipts.push({producer:'CHROMIUM_DAY',request:r.request().postDataJSON(),response:body});await modal.waitFor({state:'hidden'});return Number(body.id);
 };
 const template=async(name:string,kind:string,spaceId:number,resources:number[],deps:number[]=[])=>{
  await page.goto(appUrl+'/settings');await page.getByRole('tab',{name:/plantillas|templates/i}).click();await page.getByRole('button',{name:'Create',exact:true}).click();const modal=page.getByRole('dialog');
  await modal.getByPlaceholder('Name',{exact:true}).fill(name);await modal.getByLabel('Rol operativo Planner Next',{exact:true}).selectOption(kind);
  if(['main','vocal'].includes(kind))await modal.getByText('Requiere el coach asignado al participante',{exact:true}).getByRole('checkbox').check();
  await modal.getByLabel('Espacio de la plantilla',{exact:true}).selectOption(String(spaceId));await modal.getByLabel('Plantillas previas',{exact:true}).selectOption(deps.map(String));
  await modal.locator('input[type="number"]').first().fill('10');await modal.getByPlaceholder('Antes: heredado').fill('0');await modal.getByPlaceholder('Después: heredado').fill('0');
  for(const id of resources){await modal.getByLabel('Recurso físico específico',{exact:true}).selectOption(String(id));await modal.getByRole('button',{name:'Añadir recurso',exact:true}).click();}
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/task-templates'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Guardar',exact:true}).click();const r=await pending;assert.equal(r.status(),201,await r.text());const t=await r.json();await modal.waitFor({state:'hidden'});receipts.push({producer:'CHROMIUM_TEMPLATE',request:r.request().postDataJSON(),response:t});return t;
 };
 const configure=async(scenario:string,spaceId?:number)=>{const general=await api('/api/new-day-planner-configuration');await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario,transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:5,...(spaceId?{mainFlow:{spaceId,preferredEnd:'12:00',continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1}}:{})}});};
 const routeUI=async(planId:number,route:any,index:number|null=null)=>{
  await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);const editor=page.getByTestId('daily-resource-routes');await editor.waitFor();
  await editor.getByRole('button',{name:index==null?'Añadir ruta de recurso':`Editar ruta ${index+1}`,exact:true}).click();
  await editor.getByLabel('Recurso de la ruta',{exact:true}).selectOption(String(route.planResourceItemId));await editor.getByLabel('Origen de la ruta',{exact:true}).selectOption(String(route.fromSpaceId));await editor.getByLabel('Destino de la ruta',{exact:true}).selectOption(String(route.toSpaceId));await editor.getByLabel('Minutos de traslado',{exact:true}).fill(String(route.minutes));
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/plans/${planId}/day-configuration`&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar ruta de recurso',exact:true}).click();const r=await pending;const body=await r.json();assert.equal(r.status(),200,JSON.stringify(body));receipts.push({producer:'CHROMIUM_ROUTE',request:r.request().postDataJSON(),response:body});
  await editor.getByRole('button',{name:'Guardar ruta de recurso',exact:true}).waitFor({state:'detached'});
 };
 const sqlNegative=async(name:string,action:()=>Promise<unknown>,category:string,pattern:RegExp)=>{
  let error:any;await db.query('BEGIN');try{await action();}catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  assert.ok(error,`${name}: expected SQL rejection`);assert.ok(['P0001','42501','23514'].includes(error.code),JSON.stringify({name,error}));assert.match(error.message,pattern);negatives.push({name,category,error,rolledBack:true});save('negatives',negatives);
 };
 const certify=async(planId:number,label:string,firstIds:number[])=>{
  const path=`/api/plans/${planId}/assisted`,input=await buildEngineInput(planId,storage),adapter=adaptEngineInputToPlannerNextProblem(input);save(label+'-input',input);save(label+'-adapter',adapter);assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter.issues));if(adapter.status!=='SUPPORTED')throw Error('adapter');
  assert.equal((await api(`/api/plans/${planId}/effective-configuration`)).readiness.status,'READY');
  const captures:any[]=[];
  for(let ordinal=1;ordinal<=2;ordinal++){
   const before=await api(path),ids=ordinal===1?firstIds:before.draft.tasks.filter((t:any)=>!t.startPlanned).map((t:any)=>t.taskId);
   const started=await api(path+'/proposals','POST',{...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true});
   let run:any;for(let n=0;n<600;n++){run=await api(`${path}/proposals/${started.runId}`);if(!['pending','running'].includes(run.status))break;await new Promise(r=>setTimeout(r,100));}
   save(`${label}-S${ordinal}-run`,run);assert.equal(run.assisted_result_json?.outcome,'PROPOSAL',JSON.stringify({status:run.status,outcome:run.assisted_result_json?.outcome,reasons:run.assisted_result_json?.reasonCodes}));
   const result=run.assisted_result_json,proof=result.evidence.nominalPhysicalFutureWitness;assert.equal(proof.tasks.length,adapter.problem.tasks.length);assert.equal(validatePlan(adapter.problem,proof.tasks,proof.setupPreparations,proof.spaceMeals,proof.participantMeals,proof.resourceMeals,proof.itinerantUnitMeals,proof.roundPreparations,proof.operationalMeals).hardValid,true);
   for(const a of proof.tasks)for(const b of proof.tasks)if(a.end<=b.start&&a.spaceId!==b.spaceId){const shared=[...new Set([...(a.requiredResourceIds??[]),a.coachId].filter(Boolean))].filter(id=>[...(b.requiredResourceIds??[]),b.coachId].includes(id));for(const id of shared)assert.ok(b.start-a.end>=effectiveResourceTransitionMinutes(adapter.problem,id as string,a.spaceId,b.spaceId));}
   const sqlBefore=(await db.query('SELECT id,start_planned,end_planned,assigned_resource_ids FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows;
   await api(`${path}/proposals/${run.id}/apply`,'POST',expected(before));let draft=await api(path);assert.deepEqual((await db.query('SELECT id,start_planned,end_planned,assigned_resource_ids FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows,sqlBefore);save(`${label}-S${ordinal}-draft`,draft);
   if(ordinal===1){
    for(const mode of ['physical-short-gap','missing-resource','invalid-snapshot','bad-hash','stale-revision']){
     await sqlNegative(label+'-'+mode,async()=>{
      const forged=structuredClone(result),p=forged.evidence.nominalPhysicalFutureWitness;
      if(mode==='physical-short-gap'){
       const consumes=(t:any,id:number)=>[...(t.requiredResourceIds??[]),t.coachId].includes('plan-resource:'+id);
       const rule=[...input.resourceRouteTransitions!].sort((a,b)=>b.minutes-a.minutes).find(r=>p.tasks.some((t:any)=>t.spaceId==='space:'+r.toSpaceId&&consumes(t,r.planResourceItemId)))!;
       const b=p.tasks.filter((t:any)=>t.spaceId==='space:'+rule.toSpaceId&&consumes(t,rule.planResourceItemId)).sort((a:any,b:any)=>a.start-b.start)[0],a=p.tasks.filter((t:any)=>t.spaceId==='space:'+rule.fromSpaceId&&t.end<=b.start&&consumes(t,rule.planResourceItemId)).sort((a:any,b:any)=>b.end-a.end)[0];assert.ok(a&&b);
       b.start=a.end+rule.minutes-5;b.end=b.start+b.duration;
      }
      if(mode==='missing-resource')p.tasks.find((t:any)=>t.requiredResourceIds?.length).requiredResourceIds=[];
      if(mode==='invalid-snapshot')p.tasks.pop();
      const hhmm=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
      for(const row of [...forged.proposedDraftSnapshot.tasks.filter((t:any)=>t.startPlanned),...(forged.proposal??[])]){const t=p.tasks.find((t:any)=>t.id==='task:'+row.taskId);if(t){row.startPlanned=hhmm(t.start);row.endPlanned=hhmm(t.end);}}
      p.fingerprint=fingerprint(p.tasks);forged.proposedDraftFingerprint=fingerprintAssistedPlanningSnapshotV1(forged.proposedDraftSnapshot);
      await db.query("UPDATE planning_runs SET assisted_result_json=$2::jsonb,result_fingerprint=encode(sha256(convert_to($2::jsonb::text,'UTF8')),'hex') WHERE id=$1",[run.id,JSON.stringify(forged)]);
      if(mode==='bad-hash')await db.query("UPDATE planning_runs SET result_fingerprint=repeat('0',64) WHERE id=$1",[run.id]);
      await db.query('SET LOCAL ROLE service_role');await db.query('SELECT public.assert_anchored_choice_witness($1,$2,$3)',[planId,forged.proposedDraftSnapshot,mode==='stale-revision'?draft.currentConfigRevisionId-1:draft.currentConfigRevisionId]);
     },mode==='bad-hash'?'AUTHENTICITY':mode==='stale-revision'?'VERSIONING':'PHYSICAL',mode==='bad-hash'?/AUTHENTIC_PROPOSAL/:mode==='stale-revision'?/STALE/:mode==='physical-short-gap'?/RESOURCE_CONFLICT|COACH_CONFLICT/:/PHYSICAL_RESOURCES|STRUCTURAL_WITNESS/);
    }
   }
   await api(path+'/validate','POST',expected(draft));draft=await api(path);assert.equal(draft.validation.hardCount,0);assert.equal(draft.validation.requiredCount,0);save(`${label}-S${ordinal}-validation`,draft.validation);
   const accepted=await api(path+'/accept-stage','POST',expected(draft));save(`${label}-S${ordinal}-accepted`,accepted);
   const sql=(await db.query('SELECT ordinal,snapshot_json,snapshot_fingerprint,config_revision_id FROM assisted_planning_stages WHERE id=$1',[accepted.activeStage.id])).rows[0];assert.deepEqual(sql.snapshot_json,accepted.activeStage.snapshotJson);assert.equal(sql.snapshot_fingerprint,fingerprintAssistedPlanningSnapshotV1(sql.snapshot_json));
   for(const old of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(sql.snapshot_json.tasks.find((t:any)=>t.taskId===old.taskId),old);
   captures.push({sql,proposal:result.proposal,witness:proof,work:result.evidence.work,protected:result.evidence.protectedPlacementsPreserved});
   if(ordinal===1){const view=await api(`/api/plans/${planId}/effective-configuration`);const rejected=await request(`/api/plans/${planId}/day-configuration`,'PUT',{resourceRouteTransitions:{contractVersion:1,routes:[]},expectedRevisionId:view.resourceRoutes.revisionId});assert.equal(rejected.status,409);negatives.push({name:label+'-protected-configuration',category:'PROTECTION',...rejected});}
  }
  const final=await api(path);assert.ok(final.draft.tasks.every((t:any)=>t.startPlanned));
  const cold=new (await import('pg')).default.Client({host:db.host,port:db.port,user:db.user,password:db.password,database:db.database});await cold.connect();try{assert.deepEqual((await cold.query('SELECT ordinal,snapshot_json,snapshot_fingerprint,config_revision_id FROM assisted_planning_stages WHERE plan_id=$1 AND ordinal>0 ORDER BY ordinal',[planId])).rows,captures.map(c=>c.sql));save(label+'-cold-sql',(await cold.query('SELECT id,start_planned,end_planned,assigned_resource_ids FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);}finally{await cold.end();}
  await sqlNegative(label+'-protected-source',async()=>{await db.query('SET LOCAL ROLE service_role');await db.query('UPDATE daily_tasks SET space_id=NULL WHERE id=$1',[firstIds[0]]);},'PROTECTION',/PROTECTED|guard|IMMUTABLE/i);
  deterministic.push({label,problem:adapter.problem,problemFingerprint:adapter.problemFingerprint,captures});save('deterministic',deterministic);pass(label+': UI routes → replay → physical witness → Draft → S1/S2 SQL and cold read');
 };
 try{
  await login();await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'18:00',mealStart:'13:00',mealEnd:'14:00',mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'g02_physical',name:'Recursos físicos'}),zone=await api('/api/zones','POST',{name:'Jornada G02'}),spaces:any[]=[],resources:any[]=[];
  for(const name of ['Origen','Destino','Independiente'])spaces.push(await api('/api/spaces','POST',{name,zoneId:zone.id}));
  for(const name of ['CAM1','SON1','Presentadora'])resources.push(await api('/api/resource-items','POST',{typeId:type.id,name}));
  const a=await template('A señal','technical',spaces[0].id,resources.map(r=>r.id)),b=await template('B grabación','technical',spaces[1].id,resources.map(r=>r.id),[a.id]),back=await template('Regreso cámara','technical',spaces[0].id,[resources[0].id],[b.id]),free=await template('Sin cámara','auxiliary',spaces[1].id,[]);
  await configure('STANDALONE_ONLY');const first=await createDay('2027-07-01');const independent=await api(`/api/plans/${first}/contestants`,'POST',{planId:first,name:'Control sin CAM',availabilityStart:'09:00',availabilityEnd:'12:00'});const tasks=[];for(const t of [a,b,back,free])tasks.push(await api('/api/daily-tasks','POST',{planId:first,templateId:t.id,spaceId:t.spaceId,zoneId:zone.id,...(t.id===free.id?{contestantId:independent.id}:{})}));
  const without=adaptEngineInputToPlannerNextProblem(await buildEngineInput(first,storage));assert.equal(without.status,'SUPPORTED');if(without.status!=='SUPPORTED')throw Error('baseline adapter');
  const before=executeAssistedPlanning(buildAssistedProblem(without.problem,createPlanningScope({kind:'DAY',value:'before'},{},without.problem.tasks.map(t=>t.id)),[]));assert.ok(before.proposal);save('before-no-routes',{problem:without.problem,result:before});
  await api(`/api/plans/${first}/assisted/session`,'POST',{});
  const daily=await api(`/api/plans/${first}/resource-items`),ids=resources.map(r=>daily.find((x:any)=>x.resourceItemId===r.id).id),rules=[{planResourceItemId:ids[0],fromSpaceId:spaces[0].id,toSpaceId:spaces[1].id,minutes:10},{planResourceItemId:ids[1],fromSpaceId:spaces[0].id,toSpaceId:spaces[1].id,minutes:15},{planResourceItemId:ids[2],fromSpaceId:spaces[0].id,toSpaceId:spaces[1].id,minutes:25},{planResourceItemId:ids[0],fromSpaceId:spaces[1].id,toSpaceId:spaces[0].id,minutes:5}];
  const initial=(await api(`/api/plans/${first}/effective-configuration`)).resourceRoutes;
  for(const rule of rules)await routeUI(first,rule);
  await routeUI(first,{...rules[0],minutes:20},0);await routeUI(first,rules[0],0);
  // Delete and recreate one direction through the native editor.
  await page.goto(`${appUrl}/plans/${first}?tab=configuration`);const editor=page.getByTestId('daily-resource-routes');await editor.waitFor();await editor.getByTestId('resource-route').first().waitFor();const count=await editor.getByTestId('resource-route').count();const remove=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/plans/${first}/day-configuration`&&r.request().method()==='PUT');await editor.getByRole('button',{name:`Eliminar ruta ${count}`,exact:true}).click();assert.equal((await remove).status(),200);await routeUI(first,rules[2]);
  const productionBase=await api(`/api/plans/${first}/effective-configuration`),productionRoutes=productionBase.resourceRoutes.authority.routes;
  const productionEdit=await request(`/api/plans/${first}/day-configuration`,'PUT',{resourceRouteTransitions:{contractVersion:1,routes:productionRoutes.map((r:any,i:number)=>i===0?{...r,minutes:15}:r)},expectedRevisionId:productionBase.resourceRoutes.revisionId},'production');assert.equal(productionEdit.status,200,JSON.stringify(productionEdit));
  const productionRestore=await request(`/api/plans/${first}/day-configuration`,'PUT',{resourceRouteTransitions:{contractVersion:1,routes:productionRoutes},expectedRevisionId:productionEdit.body.revisionId},'production');assert.equal(productionRestore.status,200,JSON.stringify(productionRestore));
  const view=await api(`/api/plans/${first}/effective-configuration`);assert.equal(view.resourceRoutes.by,users.production.id);save('standalone-effective',view);await page.reload();await page.getByTestId('daily-resource-routes').screenshot({path:directory+'/routes-reloaded.png'});
  const stale=await request(`/api/plans/${first}/day-configuration`,'PUT',{resourceRouteTransitions:{contractVersion:1,routes:[]},expectedRevisionId:initial.revisionId});assert.equal(stale.status,409);negatives.push({name:'stale',category:'VERSIONING',...stale});
  for(const role of ['viewer','aux','norole','anonymous']){const r=await request(`/api/plans/${first}/day-configuration`,'PUT',{resourceRouteTransitions:{contractVersion:1,routes:[]},expectedRevisionId:view.resourceRoutes.revisionId},role);assert.equal(r.status,role==='anonymous'?401:403);negatives.push({name:'API-'+role,category:'PERMISSION',...r});}
  for(const [name,routes] of [['unknown',[{...rules[0],planResourceItemId:999999}]],['duplicate',[rules[0],rules[0]]],['zero',[{...rules[0],minutes:0}]],['off-grid',[{...rules[0],minutes:7}]]] as const){const r=await request(`/api/plans/${first}/day-configuration`,'PUT',{resourceRouteTransitions:{contractVersion:1,routes},expectedRevisionId:view.resourceRoutes.revisionId});assert.ok([400,422].includes(r.status),JSON.stringify(r));negatives.push({name,category:'CONTRACT',...r});}
  await sqlNegative('falsified-source',async()=>{await db.query('SET LOCAL ROLE service_role');await db.query('UPDATE plans SET daily_resource_route_transitions=$2 WHERE id=$1',[first,JSON.stringify({contractVersion:1,routes:[]})]);},'AUTHENTICITY',/REQUIRES_VERSIONED/);
  await sqlNegative('unavailable-resource',async()=>{await db.query('UPDATE plan_resource_items SET is_available=false WHERE id=$1',[ids[0]]);await db.query('SET LOCAL ROLE service_role');await db.query('SELECT assert_daily_resource_routes($1,$2)',[first,{contractVersion:1,routes:[rules[0]]}]);},'CONTRACT',/UNAVAILABLE_CATALOG/);
  for(const role of ['anon','authenticated']){let readDenied=false;await db.query('BEGIN');try{await db.query('SET LOCAL ROLE '+role);const r=await db.query('SELECT id FROM plans WHERE id=$1',[first]);assert.equal(r.rows.length,0);}catch(e:any){assert.equal(e.code,'42501');readDenied=true;}finally{await db.query('ROLLBACK');}negatives.push({name:'read-'+role,category:'PERMISSION',readDenied,visibleRows:0});await sqlNegative('SQL-'+role,async()=>{await db.query('SET LOCAL ROLE '+role);await db.query('SELECT assert_daily_resource_routes($1,$2)',[first,{contractVersion:1,routes:[]}]);},'PERMISSION',/permission denied/);}
  pass('G02: Chromium route CRUD, reload, CAS, contract negatives and permissions');
  await certify(first,'standalone',[Number(tasks[0].id)]);
  // A second topology uses the dedicated coach channel and the same physical CAM resource.
  const coachType=await api('/api/resource-types','POST',{code:'vocal_coach',name:'Vocal Coach'});await api('/api/resource-items','POST',{typeId:coachType.id,name:'Coach G02'});
  const vocal=await template('Vocal G02','vocal',spaces[0].id,[]),cameraPrep=await template('Preparación cámara G02','auxiliary',spaces[0].id,[resources[0].id]),main=await template('Main G02','main',spaces[1].id,[resources[0].id],[vocal.id,cameraPrep.id]);
  await configure('MAIN_WITH_VOCAL_FEEDER',spaces[1].id);const second=await createDay('2027-07-02');const inventory=await api(`/api/plans/${second}/resource-items`),coach=inventory.find((r:any)=>r.name==='Coach G02');const mainTasks:number[]=[];
  for(const name of ['Luz','Ana']){
   await page.goto(`${appUrl}/plans/${second}?tab=tasks`);await page.getByLabel('Nombre del nuevo concursante').fill(name);await page.getByRole('combobox',{name:'Vocal Coach del nuevo concursante',exact:true}).click();await page.getByRole('option',{name:'Coach G02',exact:true}).click();
   const pending=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/plans/${second}/contestants`&&r.request().method()==='POST');await page.getByRole('button',{name:'Añadir',exact:true}).click();const response=await pending;assert.equal(response.status(),201);const p=await response.json();
   for(const t of [vocal,cameraPrep,main]){const task=await api('/api/daily-tasks','POST',{planId:second,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id});if(t.id===main.id)mainTasks.push(Number(task.id));}
  }
  await api(`/api/plans/${second}/assisted/session`,'POST',{});await routeUI(second,{planResourceItemId:coach.id,fromSpaceId:spaces[0].id,toSpaceId:spaces[1].id,minutes:30});await routeUI(second,{planResourceItemId:inventory.find((r:any)=>r.resourceItemId===resources[0].id).id,fromSpaceId:spaces[0].id,toSpaceId:spaces[1].id,minutes:10});
  await certify(second,'coach-main',[mainTasks[0]]);
  save('negatives',negatives);save('browser-errors',errors);assert.deepEqual(errors,[]);save('receipts',receipts);
  return {days:2,stages:4,remoteWrites:0};
 }finally{await browser.close();save('receipts',receipts);save('negatives',negatives);save('browser-errors',errors);}
}
