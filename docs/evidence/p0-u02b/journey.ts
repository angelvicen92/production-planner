/** Productive fixed composition gate. All operational data is authored through the real API. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {inspect} from '../p0-u00y/consumer';
import {validatePlan} from '../../../engine/planner-next/validate';
import {buildCanonicalPlanConfig} from '../../../server/dayConfigurationService';
import {withDailyOperationalMeals} from '../../../server/operationalMealPolicy';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {readFileSync,writeFileSync} from 'node:fs';
import {buildEngineInput} from '../../../engine/buildInput';
import {resolveEffectiveTaskResourceAssignments} from '../../../engine/planner-next/integration/effectiveTaskResourceAssignments';
import {requiredFunctionBodies} from '../../../script/demo/a2Preflight';

import {certificateAttacks} from './attacks';
import {acceptAttacks} from './accept-attacks';
import {repairSupporting} from './supporting';
import {fixedAttacks} from './fixed-attacks';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';

export async function journey({appUrl,users,db,directory,pass}:any){
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const receipts:any[]=[];
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
  const r=await fetch(appUrl+path,{method,headers:{Connection:'close','Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)}).catch((error:any)=>{save('transport-failure',{path,method,message:error.message,cause:{code:error.cause?.code,message:error.cause?.message}});throw error;});
  const response={status:r.status,body:await r.json() as any};receipts.push({path,method,request:body,response});return response;
 };
 const contentions:any[]=[];
 // Historical baseline probes keep their original HTTP contract.
 const versionedResourceWindows=(await db.query("SELECT to_regprocedure('public.guard_resource_availability_operation()') IS NOT NULL present")).rows[0].present;
 const api=async(path:string,method='GET',body?:unknown)=>{
  if(versionedResourceWindows&&method==='PATCH'&&/^\/api\/plans\/\d+\/resource-items\/\d+$/.test(path)&&body&&typeof body==='object'&&'availabilityStart' in body){
   const revision=await request(path.replace(/\/resource-items\/\d+$/,'/day-configuration/refresh'));assert.equal(revision.status,200);body={...body,expectedRevisionId:revision.body.revisionId};
  }

  const plan=path.match(/^\/api\/plans\/(\d+)\/assisted\/validate$/)?.[1];
  const token=plan?(await db.query('SELECT assisted_bootstrap_source_token($1) token',[Number(plan)])).rows[0].token:null;
  let r=await request(path,method,body);
  if(plan&&r.status===409&&r.body.code==='REBOOTSTRAP_STALE_SOURCES'){
   const after=(await db.query('SELECT assisted_bootstrap_source_token($1) token',[Number(plan)])).rows[0].token;
   const locks=(await db.query("SELECT a.backend_type,l.mode,l.granted,c.relname FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid LEFT JOIN pg_class c ON c.oid=l.relation WHERE a.datname=current_database() AND l.locktype='relation' AND l.mode<>'AccessShareLock' ORDER BY a.backend_type,c.relname,l.mode")).rows;
   assert.equal(after,token,'source authority changed; do not retry');
   const current=await request(`/api/plans/${plan}/assisted`);assert.equal(current.body.draftFingerprint,(body as any).expectedDraftFingerprint);assert.equal(current.body.draftBaseStageId,(body as any).expectedBaseStageId);
   contentions.push({path,first:r,sourceTokenUnchanged:true,locks,reason:'Existing SQL NOWAIT protects concurrent source reads; one explicit validation retry with the same Draft/base and source token.'});save('source-contention',contentions);
   r=await request(path,method,body);
  }
  assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;
 };
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium'});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const browserEvents:any[]=[];page.on('pageerror',e=>browserEvents.push({message:e.message}));page.on('requestfailed',r=>browserEvents.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
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

 const sql=async(name:string,plan:number,body:any)=>{try{await db.query(`SELECT public.${name}($1,$2)`,[plan,body]);return {accepted:true};}catch(e:any){return {accepted:false,code:e.code,message:e.message};}};
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  // Compare every existing SQL contract byte for byte, without replacing it.
  const catalog=[];
  for(const [name,expected] of requiredFunctionBodies(false)){
   const rows=(await db.query("SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1",[name])).rows;
   assert.ok(rows.some((d:any)=>{const m=d.definition.match(/\bAS\s+(\$\w*\$)([\s\S]*)/i);return m&&m[2].slice(0,m[2].indexOf(m[1])).trim()===expected;}),name);catalog.push({name,exactBody:true});
  }save('sql-catalog',catalog);
  await api('/api/program-settings','PATCH',{defaultWorkStart:'08:00',defaultWorkEnd:'16:00',mealStart:'14:00',mealEnd:'15:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'physical_tools',name:'Physical tools'}),zone=await api('/api/zones','POST',{name:'Production'});
  const spaces:any[]=[];for(const name of ['First phase','Second phase','Third phase','Preparation and closing','Competition A','Competition B','Competition C'])spaces.push(await api('/api/spaces','POST',{name,zoneId:zone.id}));
  const tools:any[]=[];for(const name of ['Cámara móvil','Operador de cámara','Técnico de sonido'])tools.push(await api('/api/resource-items','POST',{typeId:type.id,name,defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'12:00'}));
  const main=await api('/api/spaces','POST',{name:'Entrevistas',zoneId:zone.id}),vocal=await api('/api/spaces','POST',{name:'Preparación vocal',zoneId:zone.id});
  const coachType=await api('/api/resource-types','POST',{code:'vocal_coach',name:'Vocal Coach'});
  for(const name of ['Coach de voz 1','Coach de voz 2'])await api('/api/resource-items','POST',{typeId:coachType.id,name,defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'12:00'});
  const feeder=await createTemplate('Preparación vocal','vocal',vocal.id),principal=await createTemplate('Entrevista','main',main.id,[feeder.id]);
  const general=await api('/api/new-day-planner-configuration');await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'MAIN_WITH_VOCAL_FEEDER',mainFlow:{spaceId:main.id,preferredEnd:'11:00',continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1},transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0}});
  await configure(main.id,'11:00');
  const tmpl=async(name:string,s:number,d:number,deps:number[]=[],resources:number[]=[],team?:number)=>api('/api/task-templates','POST',{name,defaultDuration:d,spaceId:spaces[s].id,zoneId:zone.id,requiresCoach:false,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:deps,resourceRequirements:{byItem:Object.fromEntries(resources.map(i=>[tools[i].id,1]))},...(team?{itinerantTeamRequirement:'specific',itinerantTeamId:team}:{}),rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}});
  const days=[];let units:any[]=[];
  for(const [ordinal,label] of ['integrated','reverse-order','segmented-joint','impossible'].entries()){
   if(ordinal===0)for(const [code,indices] of [['ab',[0,1]],['ac',[0,2]],['b',[1]],['tight-ab',[0,1]]] as const){
    units.push(await api('/api/itinerant-teams','POST',{code:'unit-'+code,name:'Unit '+code,resourceItemIds:indices.map(i=>tools[i].id),availabilityWindows:[{start:'08:00',end:code==='tight-ab'?'11:00':'12:00'}],transitionMinutes:0,isActive:true,orderIndex:units.length}));
   }
   const second=label==='second',common=label==='common-unit',firstUnit=common||label==='segmented-joint'?3:0;
   const moving=!['baseline','unused-snapshot'].includes(label),segmented=label==='segmented-joint',jointUnit=segmented||common;
   const pre=await tmpl(label+' preparation',3,5),a=await tmpl(label+' first',0,segmented?10:5,[pre.id],moving?[]:[0,1],moving?units[firstUnit].id:undefined);
   const b=await tmpl(label+' second',1,5,[a.id],moving?[]:[0,1],moving?units[segmented?1:firstUnit].id:undefined);
   const joint=await tmpl(label+' joint',2,10,[b.id],jointUnit?[]:[1],jointUnit?units[common?3:2].id:undefined),last=await tmpl(label+' final',2,5,[a.id],[2],common?units[3].id:undefined);
   const alternateIdentity=common?await tmpl(label+' alternative identity',2,10,[],[],units[0].id):null;
   const postJoint=await tmpl(label+' closing joint',3,5,[joint.id]),postLast=await tmpl(label+' closing final',3,5,[last.id]);
   const rivals=[await tmpl(label+' rival A',4,segmented?20:15,[],[0]),await tmpl(label+' rival B',5,10,[],[1]),await tmpl(label+' rival C',6,10,[],[2])];
   const technical=await api('/api/task-templates','POST',{name:label+' signal verification',itinerantTeamRequirement:'specific',itinerantTeamId:units[2].id,defaultDuration:5,spaceId:spaces[6].id,zoneId:zone.id,requiresCoach:false,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,resourceRequirements:{byItem:{[tools[2].id]:1}},rulesJson:{plannerNextOperation:{contractVersion:1,kind:'technical'}}});
   const planId=await createDay(`2027-06-${String(ordinal+1).padStart(2,'0')}`);
   const configPath=`/api/plans/${planId}/day-configuration`,viewPath=`/api/plans/${planId}/effective-configuration`,path=`/api/plans/${planId}/assisted`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),daily=tools.map(t=>inventory.find((r:any)=>r.resourceItemId===t.id));
   if(label==='impossible')await api(`/api/plans/${planId}/resource-items/${daily[0].id}`,'PATCH',{availabilityStart:'08:00',availabilityEnd:'08:40'});
   const groups:any[][]=[];
   for(let i=0;i<(second?2:3);i++){
    const p=await addParticipant(planId,`${segmented?'Presentador':'Participante'} ${i+1}`,'08:00','12:00',`Coach de voz ${segmented?(i===0?1:2):(i===1?2:1)}`),tasks=[];
    for(const t of [feeder,principal])await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id,...(segmented?{durationOverride:15}:{})});
    for(const t of [pre,a,...(i<2?[b,joint,postJoint]:[last,postLast])])tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id}));groups.push(tasks);
   }
   const competitors=[];
   for(let i=0;i<(second?2:3);i++){
    const p=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`Independent ${i+1}`,availabilityStart:'08:00',availabilityEnd:'12:00'});
    const t=rivals[i];competitors.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id}));
   }
   if(label==='C-joint-unit'||common){
    const attempts=[];
    for(const mode of ['different-physical-peers',...(common?['equal-members-different-unit']:[])]){
     let error:any;await db.query('BEGIN');try{
      const peer=groups[1][3].id;
      if(mode==='different-physical-peers')await db.query('UPDATE daily_tasks SET assigned_resource_ids=$2 WHERE id=$1',[peer,JSON.stringify([daily[2].id])]);
      else await db.query('UPDATE daily_tasks SET template_id=$2 WHERE id=$1',[peer,alternateIdentity.id]);
      await db.query('SET LOCAL ROLE service_role');
      await db.query('SELECT assert_daily_joint_groups($1,$2)',[planId,{contractVersion:1,groups:[{id:'negative',taskIds:groups.slice(0,2).map(g=>g[3].id)}]}]);
     }catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
     assert.equal(error?.message,mode==='different-physical-peers'?'JOINT_RESOURCE_MISMATCH':'JOINT_UNIT_MISMATCH');attempts.push({mode,error,rolledBack:true,realDailySources:true});
    }save(label+'-joint-source-negatives',attempts);
   }
   // A technical obligation is independent of participant identity and consumes real sound equipment.
   const technicalTask=await api('/api/daily-tasks','POST',{planId,templateId:technical.id,spaceId:spaces[6].id,zoneId:zone.id});
   const s0=await api(path+'/session','POST',{});save(label+'-S0',s0);
   const phases=[groups.map(g=>g[1].id),groups.slice(0,2).map(g=>g[2].id),[groups[0][3].id,groups[2][2].id]];
   const policy={id:'required-unit',orderedTaskIds:phases.flat(),phases,adjacency:'REQUIRED' as const,resourceContinuity:'REQUIRED' as const,requiredResourceIds:[]};
   const jointStructure={contractVersion:1,groups:[{id:'synchronized-operation',taskIds:groups.slice(0,2).map(g=>g[3].id)}]};
   const structure={contractVersion:1 as const,policies:[policy]};
   const rest={contractVersion:1,policies:[{id:'physical-rest',window:{start:'09:00',end:'09:30'},durationMinutes:15,planResourceItemIds:[daily[0].id,daily[1].id],spaceIds:spaces.slice(0,3).map(s=>s.id)}]};
   let view=await api(viewPath);
   // Use the existing production pause editor; disabled phased/joint buttons are captured below.
   await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);
   const restEditor=page.getByTestId('daily-operational-meals');await restEditor.getByRole('button',{name:'Crear descanso operativo',exact:true}).click();
   for(const r of daily.slice(0,2))await restEditor.getByLabel(`Recurso del descanso ${r.name}`,{exact:true}).check();
   for(const space of spaces.slice(0,3))await restEditor.getByLabel(`Espacio del descanso ${space.name}`,{exact:true}).check();
   await restEditor.getByLabel('Ventana del descanso desde',{exact:true}).fill('09:00');await restEditor.getByLabel('Ventana del descanso hasta',{exact:true}).fill('09:30');await restEditor.getByLabel('Duración del descanso',{exact:true}).fill('15');
   const saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await restEditor.getByRole('button',{name:'Guardar descanso operativo',exact:true}).click();assert.equal((await saving).status(),200);
   await page.reload();view=await api(viewPath);save(label+'-ui-pause-created',view);await api(configPath,'PUT',{operationalMealPolicies:rest,expectedRevisionId:view.operationalMeals.revisionId});view=await api(viewPath);const storedRest=view.operationalMeals.authority;
   assert.equal(await page.getByRole('button',{name:'Crear cadena técnica',exact:true}).isDisabled(),false);
   assert.equal(await page.getByRole('button',{name:'Crear operación conjunta',exact:true}).isDisabled(),false);
   await page.goto('about:blank');
   const before=(await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows[0];const attempts=[];
   for(const kind of label==='reverse-order'?['technicalChains','jointGroups']:['jointGroups','technicalChains']){
    view=await api(viewPath);const value=kind==='technicalChains'?structure:jointStructure;
    const response=await request(configPath,'PUT',{[kind]:value,expectedRevisionId:view[kind].revisionId});
    const consumer=await sql(kind==='technicalChains'?'assert_daily_technical_chains':'assert_daily_joint_groups',planId,value);
    attempts.push({kind,payload:value,response,sql:consumer});assert.equal(response.status,200,JSON.stringify(response));assert.equal(consumer.accepted,true,JSON.stringify(consumer));
   }
   save(label+'-authoring',{policy,jointStructure,rest:storedRest,attempts,beforePlan:before,afterPlan:(await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows[0]});
   if(label!=='impossible'){
    await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);
    const chain=page.getByTestId('daily-technical-chain');await chain.getByRole('button',{name:'Modificar cadena técnica',exact:true}).click();
    assert.ok(await chain.getByLabel('Orden por fases',{exact:true}).isChecked());
    view=await api(viewPath);const firstPhaseTask=view.technicalChains.tasks.find((t:any)=>t.id===phases[0][0]);const check=chain.getByLabel(`Fase 1: ${firstPhaseTask.label}`,{exact:true});await check.uncheck();await check.check();
    let saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await chain.getByRole('button',{name:'Guardar cadena técnica',exact:true}).click();assert.equal((await saving).status(),200);
    await page.reload();let jointEditor=page.getByTestId('daily-joint-groups');
    saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await jointEditor.getByRole('button',{name:'Retirar operación conjunta 1',exact:true}).click();let response=await saving;assert.equal(response.status(),200,await response.text());
    await page.reload();jointEditor=page.getByTestId('daily-joint-groups');await jointEditor.getByRole('button',{name:'Crear operación conjunta',exact:true}).click();
    view=await api(viewPath);for(const id of jointStructure.groups[0].taskIds){const task=view.jointGroups.tasks.find((t:any)=>t.id===id);await jointEditor.getByLabel(`Miembro conjunto ${task.label}`,{exact:true}).check();}
    saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await jointEditor.getByRole('button',{name:'Guardar operación conjunta',exact:true}).click();response=await saving;assert.equal(response.status(),200,await response.text());
    save(label+'-ui-joint-created',await api(viewPath));
    await page.reload();await page.getByRole('button',{name:'Modificar cadena técnica',exact:true}).waitFor();
    save(label+'-ui',await api(viewPath));
    for(const [testId,name] of [['daily-technical-chain','phases'],['daily-joint-groups','joint'],['daily-operational-meals','pause']]){const editor=page.getByTestId(testId);await editor.scrollIntoViewIfNeeded();await editor.screenshot({path:`${directory}/${label}-${name}-editor.png`});}
    await page.screenshot({path:`${directory}/${label}-configuration.png`,fullPage:true});await page.goto('about:blank');
    // Restore declared flexible array order after editor canonicalization.
    view=await api(viewPath);await api(configPath,'PUT',{jointGroups:jointStructure,expectedRevisionId:view.jointGroups.revisionId});view=await api(viewPath);await api(configPath,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId});
   }
   view=await api(viewPath);const security=[];
   for(const role of ['viewer','aux','norole','anonymous']){const r=await request(configPath,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId},role);assert.equal(r.status,role==='anonymous'?401:403);security.push({role,...r});}
   const stale=await request(configPath,'PUT',{technicalChains:structure,expectedRevisionId:2147483647});assert.equal(stale.status,409);security.push({mode:'stale-CAS',...stale});save(label+'-security',security);
   const contractNegatives=[];
   for(const mode of ['omitted','null','false-common']){
    const bad:any=structuredClone(policy);if(mode==='omitted')delete bad.requiredResourceIds;else if(mode==='null')bad.requiredResourceIds=null;else bad.requiredResourceIds=[daily[2].id];
    view=await api(viewPath);const value={contractVersion:1,policies:[bad]},response=await request(configPath,'PUT',{technicalChains:value,expectedRevisionId:view.technicalChains.revisionId}),consumer=await sql('assert_daily_technical_chains',planId,value);
    assert.equal(response.status,mode==='false-common'?422:400);assert.equal(consumer.accepted,false);contractNegatives.push({mode,response,sql:consumer});
   }save(label+'-contract-negatives',contractNegatives);
   const revision=(await db.query('SELECT replay_snapshot_json FROM plan_config_revisions WHERE id=(SELECT current_config_revision_id FROM plans WHERE id=$1)',[planId])).rows[0].replay_snapshot_json;
   const forgedReplay=structuredClone(revision);forgedReplay.authorities.plan_workday[0].plannerNextAuthorities.taskOperations[0].dependsOnTaskIds=[2147483647];
   const forgedSource=await sql('assert_joint_revision',planId,forgedReplay);assert.equal(forgedSource.accepted,false);save(label+'-source-forgery',forgedSource);
   const input=await buildEngineInput(planId,storage);assert.equal(input.tasks.length,24);save(label+'-input',input);save(label+'-adapter',adapt(input));
   save(label+'-obligations',{groups,competitors,technicalTask,feeder,principal,spaces,main,vocal,daily,policy,jointStructure});
   save(label+'-effective',resolveEffectiveTaskResourceAssignments(input));
   // Offline consumer investigation is separate from the authentic authority and Stage.
   save(label+'-sql-resources',(await db.query('SELECT id,public.joint_task_resources($1,id) AS resources FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
   {
    const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
    const poll=async(id:number)=>{for(let i=0;i<600;i++){const run=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(run.status))return run;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
    if(label!=='impossible')for(const [entry,selector] of [['representative',{kind:'TASK_IDS',taskIds:[jointStructure.groups[0].taskIds[0]]}],['peer',{kind:'TASK_IDS',taskIds:[jointStructure.groups[0].taskIds[1]]}]] as const){
     const before=await api(path),start=await api(path+'/proposals','POST',{...expected(before),selector,includePrerequisites:false}),run=await poll(start.runId);save(`${label}-scope-${entry}`,run);
     assert.equal(run.assisted_result_json.outcome,'PROPOSAL',JSON.stringify(run));assert.equal(run.assisted_result_json.evidence.nominalPhysicalFutureWitness.tasks.length,24);assert.equal(run.assisted_result_json.proposal.length,policy.orderedTaskIds.length+1);assert.equal(run.assisted_result_json.evidence.acceptedSupportingPlacements.length,0);if(entry==='representative')await repairSupporting({db,planId,run,input,problem:adapt(input).problem,save,label});await api(`${path}/proposals/${run.id}/discard`,'POST',expected(before));
    }
    if(label!=='impossible')for(const kind of ['main','vocal']){
     const before=await api(path),ids=input.tasks.filter(t=>t.plannerNextKind===kind).map(t=>t.id);
     const start=await api(path+'/proposals','POST',{...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:false}),run=await poll(start.runId);save(`${label}-scope-${kind}`,run);
     assert.equal(run.assisted_result_json.outcome,'PROPOSAL');assert.equal(run.assisted_result_json.proposal.length,3);assert.equal(run.assisted_result_json.evidence.nominalPhysicalFutureWitness.tasks.length,24);assert.equal(run.assisted_result_json.evidence.acceptedSupportingPlacements.length,0);await api(`${path}/proposals/${run.id}/discard`,'POST',expected(before));
    }
    for(let n=1;n<=2;n++){
     const before=await api(path),ids=n===1?[competitors[0].id]:before.draft.tasks.filter((t:any)=>t.startPlanned==null).map((t:any)=>t.taskId);
     const start=await api(path+'/proposals','POST',{...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true});let run:any;
     for(let i=0;i<600;i++){run=await api(`${path}/proposals/${start.runId}`);if(!['pending','running'].includes(run.status))break;await new Promise(r=>setTimeout(r,100));}
     save(`${label}-S${n}-run`,run);
     if(label==='impossible'){assert.equal(run.assisted_result_json.outcome,'NO_PROPOSAL');assert.ok(run.assisted_result_json.evidence.reasonCodes.some((c:string)=>c.includes('BUDGET')));assert.equal(run.assisted_result_json.evidence.work.branchesExplored,10000);assert.equal((await api(path)).history.length,1);break;}
     assert.equal(run.assisted_result_json.outcome,'PROPOSAL',JSON.stringify(run));assert.equal(run.assisted_result_json.proposal.length,n===1?1:23);assert.equal(run.assisted_result_json.evidence.nominalPhysicalFutureWitness.tasks.length,24);assert.equal(run.assisted_result_json.evidence.acceptedSupportingPlacements.length,0);
     await api(`${path}/proposals/${run.id}/apply`,'POST',expected(before));let draft=await api(path);save(`${label}-S${n}-draft`,draft);await certificateAttacks({db,planId,run,draft,policy,input,save,label,ordinal:n});await fixedAttacks({db,planId,run,draft,policy,input,save,label,ordinal:n});await api(path+'/validate','POST',expected(draft));draft=await api(path);assert.equal(draft.validation.hardCount,0);assert.equal(draft.validation.requiredCount,0);
     await acceptAttacks({db,planId,draft,actor:users.admin.id,save,label,ordinal:n});
     const accepted=await api(path+'/accept-stage','POST',expected(draft));save(`${label}-S${n}-accepted`,accepted);
     save(`${label}-S${n}-sql`,(await db.query('SELECT id,ordinal,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE id=$1',[accepted.activeStage.id])).rows[0]);
     for(const row of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((t:any)=>t.taskId===row.taskId),row);
    }
   }
   if(label!=='impossible'){
    const final=await api(path),stage=final.activeStage,forged=structuredClone(stage.snapshotJson);forged.tasks.find((t:any)=>t.startPlanned).startPlanned='15:55';
    const failures=[];
    for(const role of ['service_role','postgres']){
     let error:any;await db.query('BEGIN');try{if(role==='service_role')await db.query('SET LOCAL ROLE service_role');await db.query('UPDATE assisted_planning_stages SET snapshot_json=$2,snapshot_fingerprint=$3 WHERE id=$1',[stage.id,forged,fingerprintAssistedPlanningSnapshotV1(forged)]);}catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
     assert.equal(error?.code,role==='service_role'?'42501':'P0001');failures.push({role,error,hashRecomputed:true});
    }save(label+'-immutable-stages',failures);
    await api(path+'/rollback','POST',{targetStageId:s0.activeStage.id});
    for(const id of final.history.filter((s:any)=>s.ordinal>0).map((s:any)=>s.id))await api(path+'/redo','POST',{targetStageId:id});
    assert.deepEqual((await api(path)).activeStage.snapshotJson,stage.snapshotJson);save(label+'-rollback-redo',await api(path));
    save(label+'-final-input',await buildEngineInput(planId,storage));
   }
   days.push({label,planId,taskCount:input.tasks.length});save('profiles',days);pass(`${label}: native authority, Draft, SQL and protected continuation`);
  }
  return {days,remoteWrites:0,diagnosticOnly:false};
 }finally{save('api-receipts',receipts);save('browser-events',browserEvents);await browser.close();}
}
