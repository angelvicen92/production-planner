import {compositionAttacks} from './attacks';
import {acceptAttacks} from '../p0-u02b/accept-attacks';
import {inspect} from '../p0-u00y/consumer';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
/** Native API/UI composition, authenticated proposals and real disposable SQL Stages. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
import {buildEngineInput} from '../../../engine/buildInput';
import {requiredFunctionBodies} from '../../../script/demo/a2Preflight';


export async function journey({appUrl,users,db,directory,pass,authorTemplateResources}:any){
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const receipts:any[]=[];
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
  const r=await fetch(appUrl+path,{method,headers:{Connection:'close','Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)}).catch((error:any)=>{save('transport-failure',{path,method,message:error.message,cause:{code:error.cause?.code,message:error.cause?.message}});throw error;});
  const response={status:r.status,body:await r.json() as any};receipts.push({path,method,request:body,response});return response;
 };
 const contentions:any[]=[];
 const api=async(path:string,method='GET',body?:unknown)=>{
  // Optional UI producer, used by G01 against the unchanged composition assertions.
  if (authorTemplateResources && path === '/api/task-templates' && method === 'POST' && Object.keys((body as any)?.resourceRequirements?.byItem ?? {}).length) {
   return authorTemplateResources(body, async (input: unknown) => {
    const response = await request(path, method, input);
    assert.equal(response.status, 201); return response.body;
   });
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

 const sql=async(name:string,plan:number,body:any)=>{await db.query('BEGIN READ ONLY');try{await db.query('SET LOCAL ROLE service_role');await db.query(`SELECT public.${name}($1,$2)`,[plan,body]);return {accepted:true};}catch(e:any){return {accepted:false,code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}};
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  // Compare every existing SQL contract byte for byte, without replacing it.
  const catalog=[];
  const jointDefinition=(await db.query("SELECT pg_get_functiondef('public.assert_daily_joint_groups(integer,jsonb)'::regprocedure) definition")).rows[0].definition;
  const effectiveVersion=jointDefinition.includes("p.meal_mode='flexible_meal_window'")?130:129;
  for(const [name,expected] of requiredFunctionBodies(false,effectiveVersion)){
   const rows=(await db.query("SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1",[name])).rows;
   assert.ok(rows.some((d:any)=>{const m=d.definition.match(/\bAS\s+(\$\w*\$)([\s\S]*)/i);return m&&m[2].slice(0,m[2].indexOf(m[1])).trim()===expected;}),name);catalog.push({name,exactBody:true});
  }save('sql-catalog',catalog);
  save('sql-function-bodies',(await db.query("SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proacl FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'assert_%' OR p.proname LIKE 'joint_task_%' OR p.proname LIKE 'apply_day_config_%' OR p.proname LIKE 'assisted_accept_%') ORDER BY p.proname")).rows);

  await api('/api/program-settings','PATCH',{defaultWorkStart:'08:00',defaultWorkEnd:'16:00',mealStart:'14:00',mealEnd:'15:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'physical_tools',name:'Physical tools'}),zone=await api('/api/zones','POST',{name:'Production'});
  const spaces:any[]=[];for(const name of ['First phase','Second phase','Third phase','Preparation and closing','Competition A','Competition B','Competition C'])spaces.push(await api('/api/spaces','POST',{name,zoneId:zone.id}));
  const tools:any[]=[];for(const name of ['Cámara móvil','Operador de cámara','Técnico de sonido'])tools.push(await api('/api/resource-items','POST',{typeId:type.id,name,defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'12:00'}));
  const independentSpace=await api('/api/spaces','POST',{name:'Ubicación Reality independiente',zoneId:zone.id});
  const locationOnly=await api('/api/resource-items','POST',{typeId:type.id,name:'Kit fijo de ubicación independiente',defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'12:00'});
  const main=await api('/api/spaces','POST',{name:'Entrevistas',zoneId:zone.id}),vocal=await api('/api/spaces','POST',{name:'Preparación vocal',zoneId:zone.id});
  const coachType=await api('/api/resource-types','POST',{code:'vocal_coach',name:'Vocal Coach'});
  for(const name of ['Coach de voz 1','Coach de voz 2'])await api('/api/resource-items','POST',{typeId:coachType.id,name,defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'12:00'});
  const feeder=await createTemplate('Preparación vocal','vocal',vocal.id),principal=await createTemplate('Entrevista','main',main.id,[feeder.id]);
  const general=await api('/api/new-day-planner-configuration');await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'MAIN_WITH_VOCAL_FEEDER',mainFlow:{spaceId:main.id,preferredEnd:'11:00',continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1},transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0}});
  await configure(main.id,'11:00');
  const tmpl=async(name:string,s:number,d:number,deps:number[]=[],resources:number[]=[],team?:number)=>api('/api/task-templates','POST',{name,defaultDuration:d,spaceId:spaces[s].id,zoneId:zone.id,requiresCoach:false,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:deps,resourceRequirements:{byItem:Object.fromEntries(resources.map(i=>[tools[i].id,1]))},...(team?{itinerantTeamRequirement:'specific',itinerantTeamId:team}:{}),rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}});
  const days=[];let units:any[]=[];
  for(const [ordinal,label] of ['integrated','reverse-order','segmented-joint','segmented-reverse'].entries()){
   if(ordinal===0)for(const [code,indices] of [['ab',[0,1]],['ac',[0,2]],['b',[1]],['tight-ab',[0,1]]] as const){
    units.push(await api('/api/itinerant-teams','POST',{code:'unit-'+code,name:'Unit '+code,resourceItemIds:indices.map(i=>tools[i].id),availabilityWindows:[{start:'08:00',end:code==='tight-ab'?'11:00':'12:00'}],transitionMinutes:0,isActive:true,orderIndex:units.length}));
   }
   const second=label==='second',common=label==='common-unit',firstUnit=common||label.startsWith('segmented')?3:0;
   const moving=!['baseline','unused-snapshot'].includes(label),segmented=label.startsWith('segmented'),jointUnit=segmented||common;
   const pre=await tmpl(label+' preparation',3,5),a=await tmpl(label+' first',0,segmented?10:5,[pre.id],moving?[]:[0,1],moving?units[firstUnit].id:undefined);
   const b=await tmpl(label+' second',1,5,[a.id],moving?[]:[0,1],moving?units[segmented?1:firstUnit].id:undefined);
   const joint=await tmpl(label+' joint',2,10,[b.id],jointUnit?[]:[1],jointUnit?units[common?3:2].id:undefined),last=await tmpl(label+' final',2,5,[a.id],[2],common?units[3].id:undefined);
   const alternateIdentity=common?await tmpl(label+' alternative identity',2,10,[],[],units[0].id):null;
   const postJoint=await tmpl(label+' closing joint',3,5,[joint.id]),postLast=await tmpl(label+' closing final',3,5,[last.id]);
   const rivals=[await tmpl(label+' rival A',4,segmented?20:15,[],[0]),await tmpl(label+' rival B',5,10,[],[1]),await tmpl(label+' rival C',6,10,[],[2])];
   const technical=await api('/api/task-templates','POST',{name:label+' signal verification',itinerantTeamRequirement:'specific',itinerantTeamId:units[2].id,defaultDuration:5,spaceId:spaces[6].id,zoneId:zone.id,requiresCoach:false,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,resourceRequirements:{byItem:{[tools[2].id]:1}},rulesJson:{plannerNextOperation:{contractVersion:1,kind:'technical'}}});
   const realityTemplate=async(name:string,spaceId:number,duration:number,team?:number,resource?:number)=>api('/api/task-templates','POST',{name:label+' '+name,defaultDuration:duration,spaceId,zoneId:zone.id,requiresCoach:false,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,resourceRequirements:{byItem:resource==null?{}:{[resource]:1}},...(team?{itinerantTeamRequirement:'specific',itinerantTeamId:team}:{}),rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}});
   const beforeTemplate=await realityTemplate('Reality anterior',main.id,segmented?10:5),afterTemplate=await realityTemplate('Reality posterior',main.id,segmented?5:10);
   const standaloneTemplate=await realityTemplate('Reality independiente',independentSpace.id,segmented?20:15,units[1].id,tools[1].id);
   const planId=await createDay(`2027-06-${String(ordinal+1).padStart(2,'0')}`);
   const configPath=`/api/plans/${planId}/day-configuration`,viewPath=`/api/plans/${planId}/effective-configuration`,path=`/api/plans/${planId}/assisted`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),daily=tools.map(t=>inventory.find((r:any)=>r.resourceItemId===t.id));
   await api(`/api/plans/${planId}/spaces/${independentSpace.id}/space-resource-assignments`,'PATCH',{planResourceItemIds:[inventory.find((r:any)=>r.resourceItemId===locationOnly.id).id]});
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
   // A technical obligation is independent of participant identity and consumes real sound equipment.
   const technicalTask=await api('/api/daily-tasks','POST',{planId,templateId:technical.id,spaceId:spaces[6].id,zoneId:zone.id});
   const original=await buildEngineInput(planId,storage);assert.equal(original.tasks.length,24);save(label+'-original-24',original);
   const realityTasks=[];
   for(const template of [beforeTemplate,afterTemplate,standaloneTemplate])realityTasks.push(await api('/api/daily-tasks','POST',{planId,templateId:template.id,contestantId:groups[0][0].contestant_id,spaceId:template.spaceId,zoneId:zone.id}));
   const s0=await api(path+'/session','POST',{});save(label+'-S0',s0);
   const phases=[groups.map(g=>g[1].id),groups.slice(0,2).map(g=>g[2].id),[groups[0][3].id,groups[2][2].id]];
   const policy={id:'required-unit',orderedTaskIds:phases.flat(),phases,adjacency:'REQUIRED' as const,resourceContinuity:'REQUIRED' as const,requiredResourceIds:[]};
   const jointStructure={contractVersion:1,groups:[{id:'synchronized-operation',taskIds:groups.slice(0,2).map(g=>g[3].id)}]};
   const structure={contractVersion:1 as const,policies:[policy]};
   const rest={contractVersion:1 as const,policies:[{id:'physical-rest',window:{start:'09:00',end:'09:30'},durationMinutes:15,planResourceItemIds:[daily[0].id,daily[1].id],spaceIds:spaces.slice(0,3).map(s=>s.id)}]};
   let view=await api(viewPath);
   const anchorTask=(await buildEngineInput(planId,storage)).tasks.find(t=>t.plannerNextKind==='main'&&t.contestantId===groups[0][0].contestant_id)!;
   const unit=view.anchoredAccompaniments.units.find((u:any)=>u.name===units[0].name).id;
   const standaloneUnit=view.anchoredAccompaniments.units.find((u:any)=>u.name===units[1].name).id;
   const anchor={contractVersion:2 as const,policies:[{id:'reality-operation',anchorTaskId:anchorTask.id,beforeTaskIds:[realityTasks[0].id],afterTaskIds:[realityTasks[1].id],itinerantUnitId:unit,adjacency:'REQUIRED' as const,internalTransition:'INCLUDED' as const,resourceContinuity:'REQUIRED' as const}]};
   const scope={contractVersion:1 as const,policies:[{taskId:realityTasks[2].id,agendaScope:'ITINERANT_UNIT' as const,resourceInheritance:'OPERATION_ONLY' as const,blocksSpace:true,itinerantUnitId:standaloneUnit,declaredResourceIds:[daily[1].id]}]};
   const authorities:any={technicalChains:structure,jointGroups:jointStructure,operationalMealPolicies:rest,anchoredAccompaniments:anchor,taskOperationScopes:scope};
   const keys:any={operationalMealPolicies:'operationalMeals'};
   const functions:any={technicalChains:'assert_daily_technical_chains',jointGroups:'assert_daily_joint_groups',operationalMealPolicies:'assert_daily_operational_meals',anchoredAccompaniments:'assert_daily_anchored_accompaniments',taskOperationScopes:'assert_daily_task_operation_scopes'};
   const anchoredFirst=label.includes('reverse');
   const order=anchoredFirst?['anchoredAccompaniments','taskOperationScopes','technicalChains','jointGroups','operationalMealPolicies']:['jointGroups','technicalChains','operationalMealPolicies','anchoredAccompaniments','taskOperationScopes'];
   const state=async()=>({plan:(await db.query('SELECT daily_technical_chains,daily_joint_groups,daily_operational_meal_policies,daily_anchored_accompaniments,daily_task_operation_scopes,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows[0],revision:(await db.query('SELECT id,fingerprint,replay_snapshot_json FROM plan_config_revisions WHERE id=(SELECT current_config_revision_id FROM plans WHERE id=$1)',[planId])).rows,session:await api(path),view:await api(viewPath)});
   const attempts=[];
   for(const kind of order){
    const before=await state(),effectiveKey=keys[kind]??kind;let uiScopeResponse:any;
    // A single fixed operation defaults to v1 in Chromium; the API below explicitly adopts v2.
    if(kind==='anchoredAccompaniments'&&anchoredFirst){
     await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);const editor=page.getByTestId('daily-anchored-accompaniment');await editor.getByRole('button',{name:'Crear operación anclada',exact:true}).click();
     await editor.getByLabel('Actividad principal anclada',{exact:true}).selectOption(String(anchorTask.id));await editor.getByLabel('Segmento anterior al Main',{exact:true}).selectOption(String(realityTasks[0].id));await editor.getByLabel('Segmento posterior al Main',{exact:true}).selectOption(String(realityTasks[1].id));await editor.getByLabel('Unidad de la operación anclada',{exact:true}).selectOption(String(unit));
     const saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar operación anclada',exact:true}).click();const response=await saving;assert.equal(response.status(),200,await response.text());save(label+'-anchor-ui',{status:response.status(),body:await response.json()});await page.goto('about:blank');
    }
    if(kind==='taskOperationScopes'&&anchoredFirst){
     await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);const editor=page.getByTestId('daily-task-operation-scopes');await editor.getByLabel('Actividad de ámbito operativo',{exact:true}).selectOption(String(realityTasks[2].id));await editor.getByLabel('Propietario de agenda',{exact:true}).selectOption('ITINERANT_UNIT');await editor.getByLabel('Herencia de recursos',{exact:true}).selectOption('OPERATION_ONLY');await editor.getByLabel('Unidad nominal de la actividad',{exact:true}).selectOption(String(standaloneUnit));
     const saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar ámbito operativo',exact:true}).click();const response=await saving;assert.equal(response.status(),200,await response.text());uiScopeResponse={status:response.status(),body:await response.json()};save(label+'-scope-ui',uiScopeResponse);await page.goto('about:blank');
    }
    view=await api(viewPath);const response=uiScopeResponse??await request(configPath,'PUT',{[kind]:authorities[kind],expectedRevisionId:view[effectiveKey].revisionId});
    const consumer=await sql(functions[kind],planId,authorities[kind]),after=await state();
    const expected=true;
    assert.equal(response.status,expected?200:422,JSON.stringify({kind,response}));
    if(!expected){assert.deepEqual(after.plan,before.plan);assert.deepEqual(after.revision,before.revision);assert.deepEqual(after.session,before.session);}
    attempts.push({kind,payload:authorities[kind],response,sql:consumer,before,after,rejectionAtomic:expected?null:true});save(label+'-authoring',attempts);
   }
   await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);
   const editors=[];
   for(const testId of ['daily-anchored-accompaniment','daily-task-operation-scopes','daily-technical-chain','daily-joint-groups','daily-operational-meals']){
    const editor=page.getByTestId(testId);editors.push({testId,text:await editor.innerText(),buttons:await editor.getByRole('button').evaluateAll(nodes=>nodes.map(n=>({label:n.textContent,disabled:(n as HTMLButtonElement).disabled})))});await editor.screenshot({path:`${directory}/${label}-${testId}.png`});
   }save(label+'-editors',editors);await page.goto('about:blank');
   const actual=await buildEngineInput(planId,storage);save(label+'-actual-input',actual);
   save(label+'-sql-task-resources',(await db.query('SELECT id,public.joint_task_resources($1,id) resources FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
   save(label+'-sql-joint-reprojection',(await db.query(`SELECT public.joint_task_operations($1,replay_snapshot_json#>'{authorities,plan_workday,0,plannerNextAuthorities,taskOperations}',$2,$2) operations FROM plan_config_revisions WHERE id=(SELECT current_config_revision_id FROM plans WHERE id=$1)`,[planId,JSON.stringify(jointStructure.groups)])).rows);
   save(label+'-obligations',{originalTaskIds:original.tasks.map(t=>t.id),realityTasks,anchorTaskId:anchorTask.id,authorities,groups,competitors,technicalTask,daily,unit,standaloneUnit});

   const input=await buildEngineInput(planId,storage);save(label+'-input',input);
   assert.equal(input.tasks.length,27);
   for(const key of ['technicalChains','anchoredAccompaniments','dailyTaskOperationScopes','dailyJointGroups','operationalMealPolicies'])assert.ok((input as any)[key]?.length,key);
   view=await api(viewPath);save(label+'-effective-view',view);
   for(const key of ['technicalChains','anchoredAccompaniments','taskOperationScopes','jointGroups','operationalMeals'])assert.equal(view[key].supported,true,key);
   save(label+'-revision',(await db.query('SELECT id,fingerprint,replay_snapshot_json FROM plan_config_revisions WHERE id=$1',[view.technicalChains.revisionId])).rows[0]);
   const security=[];
   for(const role of ['viewer','aux','norole','anonymous']){const r=await request(configPath,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId},role);assert.equal(r.status,role==='anonymous'?401:403);security.push({role,...r});}
   const stale=await request(configPath,'PUT',{technicalChains:structure,expectedRevisionId:2147483647});assert.equal(stale.status,409);security.push({mode:'stale-CAS',...stale});save(label+'-security',security);
   const full=inspect(input);save(label+'-full',full);
   const expected=(state:any)=>({expectedDraftFingerprint:state.draftFingerprint,expectedBaseStageId:state.draftBaseStageId});
   const poll=async(id:number)=>{for(let n=0;n<600;n++){const run=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(run.status))return run;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
   if(segmented){
    const state=await api(path),started=await api(path+'/proposals','POST',{...expected(state),selector:{kind:'TASK_IDS',taskIds:input.tasks.map(t=>t.id)},includePrerequisites:true}),run=await poll(started.runId);
    save(label+'-exhausted-run',run);assert.equal(run.status,'success',JSON.stringify({status:run.status,message:run.message}));assert.equal(run.assisted_result_json.outcome,'NO_PROPOSAL');assert.equal(run.assisted_result_json.evidence.work.branchesExplored,10000);assert.equal((await api(path)).history.length,1);
    days.push({label,planId,status:'SEARCH_EXHAUSTED',acceptedStages:0});save('profiles',days);pass(label+': five native authorities; original search exhaustion preserved');continue;
   }
   assert.equal(full.result?.proposal?.length,27);
   for(const route of ['competitor','anchor']){
    if(route==='anchor')await api(path+'/rollback','POST',{targetStageId:s0.activeStage.id});
    for(let n=1;n<=2;n++){
     const before=await api(path),ids=n===1?(route==='competitor'?[competitors[0].id]:[anchorTask.id]):before.draft.tasks.filter((t:any)=>t.startPlanned==null).map((t:any)=>t.taskId);
     const start=await api(path+'/proposals','POST',{...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true}),run=await poll(start.runId);
     const prefix=`${label}-${route}-S${n}`;save(prefix+'-run',run);
     assert.equal(run.assisted_result_json.outcome,'PROPOSAL',JSON.stringify(run));assert.equal(run.assisted_result_json.proposal.length,n===1?(route==='competitor'?1:4):(route==='competitor'?26:23));
     assert.equal(run.assisted_result_json.evidence.nominalPhysicalFutureWitness.tasks.length,27);assert.equal(run.assisted_result_json.evidence.acceptedSupportingPlacements.length,0);
     await api(`${path}/proposals/${run.id}/apply`,'POST',expected(before));let draft=await api(path);save(prefix+'-draft',draft);
     if(n===1&&route==='competitor')await compositionAttacks({db,planId,run,draft,input,save,prefix});
     await api(path+'/validate','POST',expected(draft));draft=await api(path);save(prefix+'-validated',draft);assert.equal(draft.validation.hardCount,0);assert.equal(draft.validation.requiredCount,0);
     await acceptAttacks({db,planId,draft,actor:users.admin.id,save,label:label+'-'+route,ordinal:n});
     const accepted=await api(path+'/accept-stage','POST',expected(draft));save(prefix+'-accepted',accepted);
     const row=(await db.query('SELECT id,ordinal,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE id=$1',[accepted.activeStage.id])).rows[0];save(prefix+'-sql',row);
     assert.deepEqual(row.snapshot_json,accepted.activeStage.snapshotJson);assert.equal(row.snapshot_fingerprint,fingerprintAssistedPlanningSnapshotV1(row.snapshot_json));
     const reread=await api(path);assert.deepEqual(reread.activeStage.snapshotJson,row.snapshot_json);save(prefix+'-cold-read',reread);
     for(const old of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(row.snapshot_json.tasks.find((t:any)=>t.taskId===old.taskId),old);
    }
   }

   const final=await api(path),protection=[];
   const changed=structuredClone(structure);changed.policies[0].phases[0].reverse();changed.policies[0].orderedTaskIds=changed.policies[0].phases.flat();
   const denied=await request(configPath,'PUT',{technicalChains:changed,expectedRevisionId:final.currentConfigRevisionId});assert.equal(denied.status,409);protection.push({mode:'protected-configuration',response:denied});
   for(const role of ['service_role','postgres']){
    let error:any;await db.query('BEGIN');try{
     const forged=structuredClone(final.activeStage.snapshotJson);forged.tasks.find((t:any)=>t.startPlanned).startPlanned='15:55';
     if(role==='service_role')await db.query('SET LOCAL ROLE service_role');
     await db.query('UPDATE assisted_planning_stages SET snapshot_json=$2,snapshot_fingerprint=$3 WHERE id=$1',[final.activeStage.id,forged,fingerprintAssistedPlanningSnapshotV1(forged)]);
    }catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
    assert.equal(error?.code,role==='service_role'?'42501':'P0001');protection.push({mode:'immutable-stage',role,error,hashRecomputed:true});
   }
   const {default:pg}=await import('pg');const cp=db.connectionParameters;const cold=new pg.Client({host:cp.host,port:cp.port,user:cp.user,database:cp.database,password:cp.password});await cold.connect();
   try{const rows=(await cold.query('SELECT id,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE plan_id=$1 ORDER BY id',[planId])).rows;assert.deepEqual(rows.find((r:any)=>Number(r.id)===Number(final.activeStage.id)).snapshot_json,final.activeStage.snapshotJson);save(label+'-cold-sql-all-stages',rows);}finally{await cold.end();}
   const anchorStages=final.history.filter((h:any)=>h.ordinal>=3&&!h.archived).map((h:any)=>h.id);
   await api(path+'/rollback','POST',{targetStageId:s0.activeStage.id});for(const id of anchorStages)await api(path+'/redo','POST',{targetStageId:id});
   assert.deepEqual((await api(path)).activeStage.snapshotJson,final.activeStage.snapshotJson);save(label+'-rollback-redo',await api(path));save(label+'-protection',protection);
   save(label+'-final-input',await buildEngineInput(planId,storage));
   days.push({label,planId,status:'PRODUCTIVE_COMPOSED',acceptedStages:4});save('profiles',days);pass(label+': 27 obligations, competitor 1→26 and anchor/Vocal 4→23 through SQL');

  }
  return {days,remoteWrites:0,diagnosticOnly:false};
 }finally{save('api-receipts',receipts);save('browser-events',browserEvents);save('browser-final',{url:page.url(),text:await page.locator('body').innerText().catch(()=>null)});await browser.close();}
}
