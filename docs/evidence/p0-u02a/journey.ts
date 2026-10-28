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

import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';

export async function journey({appUrl,users,db,directory,pass}:any){
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const receipts:any[]=[];
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
  const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});
  const response={status:r.status,body:await r.json() as any};receipts.push({path,method,request:body,response});return response;
 };
 const contentions:any[]=[];
 const api=async(path:string,method='GET',body?:unknown)=>{
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
  for(const [name,expected] of requiredFunctionBodies(false,124)){
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
  for(const [ordinal,label] of ['integrated','reverse-order','impossible'].entries()){
   if(ordinal===0)for(const [code,indices] of [['ab',[0,1]],['ac',[0,2]],['b',[1]],['tight-ab',[0,1]]] as const){
    units.push(await api('/api/itinerant-teams','POST',{code:'unit-'+code,name:'Unit '+code,resourceItemIds:indices.map(i=>tools[i].id),availabilityWindows:[{start:'08:00',end:code==='tight-ab'?'11:00':'12:00'}],transitionMinutes:0,isActive:true,orderIndex:units.length}));
   }
   const second=label==='second',common=label==='common-unit',firstUnit=common?3:0;
   const moving=!['baseline','unused-snapshot'].includes(label),segmented=['B-segments','D-rest-competition'].includes(label),jointUnit=label==='C-joint-unit'||common;
   const pre=await tmpl(label+' preparation',3,5),a=await tmpl(label+' first',0,5,[pre.id],moving?[]:[0,1],moving?units[firstUnit].id:undefined);
   const b=await tmpl(label+' second',1,5,[a.id],moving?[]:[0,1],moving?units[segmented?1:firstUnit].id:undefined);
   const joint=await tmpl(label+' joint',2,10,[b.id],jointUnit?[]:[1],jointUnit?units[common?3:2].id:undefined),last=await tmpl(label+' final',2,5,[a.id],[2],common?units[3].id:undefined);
   const alternateIdentity=common?await tmpl(label+' alternative identity',2,10,[],[],units[0].id):null;
   const postJoint=await tmpl(label+' closing joint',3,5,[joint.id]),postLast=await tmpl(label+' closing final',3,5,[last.id]);
   const rivals=[await tmpl(label+' rival A',4,15,[],[0]),await tmpl(label+' rival B',5,10,[],[1]),await tmpl(label+' rival C',6,10,[],[2])];
   const technical=await api('/api/task-templates','POST',{name:label+' signal verification',itinerantTeamRequirement:'specific',itinerantTeamId:units[2].id,defaultDuration:5,spaceId:spaces[6].id,zoneId:zone.id,requiresCoach:false,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,resourceRequirements:{byItem:{[tools[2].id]:1}},rulesJson:{plannerNextOperation:{contractVersion:1,kind:'technical'}}});
   const planId=await createDay(`2027-06-${String(ordinal+1).padStart(2,'0')}`);
   const configPath=`/api/plans/${planId}/day-configuration`,viewPath=`/api/plans/${planId}/effective-configuration`,path=`/api/plans/${planId}/assisted`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),daily=tools.map(t=>inventory.find((r:any)=>r.resourceItemId===t.id));
   if(label==='impossible')await api(`/api/plans/${planId}/resource-items/${daily[0].id}`,'PATCH',{availabilityStart:'08:00',availabilityEnd:'08:40'});
   const groups:any[][]=[];
   for(let i=0;i<(second?2:3);i++){
    const p=await addParticipant(planId,`Participante ${i+1}`,'08:00','12:00',`Coach de voz ${i===1?2:1}`),tasks=[];
    for(const t of [feeder,principal])await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id});
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
   await page.reload();view=await api(viewPath);const storedRest=view.operationalMeals.authority;
   save(label+'-ui',{technicalChainDisabled:await page.getByRole('button',{name:'Crear cadena técnica',exact:true}).isDisabled(),jointDisabled:await page.getByRole('button',{name:'Crear operación conjunta',exact:true}).isDisabled(),view});
   await page.screenshot({path:`${directory}/${label}-configuration.png`,fullPage:true});
   await page.goto('about:blank');
   const before=(await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows[0];const attempts=[];
   for(const kind of label==='reverse-order'?['technicalChains','jointGroups']:['jointGroups','technicalChains']){
    view=await api(viewPath);const value=kind==='technicalChains'?structure:jointStructure;
    const response=await request(configPath,'PUT',{[kind]:value,expectedRevisionId:view[kind].revisionId});
    const consumer=await sql(kind==='technicalChains'?'assert_daily_technical_chains':'assert_daily_joint_groups',planId,value);
    attempts.push({kind,payload:value,response,sql:consumer});assert.equal(response.status,422);assert.equal(consumer.accepted,false);
   }
   save(label+'-authoring',{policy,jointStructure,rest:storedRest,attempts,beforePlan:before,afterPlan:(await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows[0]});
   const input=await buildEngineInput(planId,storage);assert.equal(input.tasks.length,24);save(label+'-input',input);save(label+'-adapter',adapt(input));
   save(label+'-obligations',{groups,competitors,technicalTask,feeder,principal,spaces,main,vocal,daily,policy,jointStructure});
   const declared=structuredClone(input);Object.assign(declared,{dailyTechnicalChainsVersion:1,technicalChains:[policy],dailyJointGroupsVersion:1,dailyJointGroups:jointStructure.groups});
   for(const group of jointStructure.groups)for(const id of group.taskIds)declared.tasks.find(t=>t.id===id)!.jointGroupId=group.id;
   save(label+'-memory-input',declared);
   // Offline consumer investigation is separate from the authentic authority and Stage.
   save(label+'-sql-resources',(await db.query('SELECT id,public.joint_task_resources($1,id) AS resources FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
   days.push({label,planId,taskCount:input.tasks.length,attempts:attempts.map(a=>({kind:a.kind,status:a.response.status}))});save('profiles',days);pass(`${label}: 24 real obligations, UI pause and explicit composed-authority rejection`);
  }
  return {days,remoteWrites:0,diagnosticOnly:true};
 }finally{save('api-receipts',receipts);save('browser-events',browserEvents);await browser.close();}
}
