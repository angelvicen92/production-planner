import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope} from '../../../server/assistedScopeResolver';
import {resolveEffectiveTaskResourceAssignments as assignments} from '../../../engine/planner-next/integration/effectiveTaskResourceAssignments';
import {diagnoseTaskPlacement,exactTaskStartDomain} from '../../../engine/planner-next/placement';
import {attacks} from './attacks';
type User={id:string;email:string;password:string;token:string};
export async function journey({appUrl,url,anon,users,db,directory,pass}:{appUrl:string;url:string;anon:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(s:string)=>void}){
 assert.equal((db as any).host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(name:string,v:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(v,null,2));
 const apiJournal:unknown[]=[],uiJournal:unknown[]=[],uiReads:Promise<unknown>[]=[];
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});const receipt={status:r.status,body:await r.json() as any};apiJournal.push({path,method,request:body,role,...receipt});return receipt;};
 const api=async(path:string,method='GET',body?:unknown,role='admin')=>{const r=await request(path,method,body,role);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1600,height:1200}}),days:any[]=[];
 page.on('response',response=>{const path=new URL(response.url()).pathname;if(/^\/api\/plans(?:\/\d+\/(?:day-configuration|assisted).*)?$/.test(path)&&response.request().method()!=='GET')uiReads.push(response.json().then(body=>uiJournal.push({path,method:response.request().method(),request:response.request().postDataJSON(),status:response.status(),body})));});
 page.on('pageerror',error=>save('browser-error',{message:error.message,stack:error.stack}));
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'16:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'u00v_physical',name:'Physical equipment'});
  const emptyUnit=await request('/api/itinerant-teams','POST',{code:'EMPTY',name:'Empty negative unit',resourceItemIds:[],availabilityWindows:[{start:'09:00',end:'12:00'}],transitionMinutes:0,isActive:true,orderIndex:0});save('empty-unit',emptyUnit);assert.equal(emptyUnit.status,400);
  for(const [index,label] of ['A','B'].entries()){
   const zone=await api('/api/zones','POST',{name:`${label} production`}),spaces:any[]=[],resources:any[]=[],templates:any[]=[],tasks:any[]=[];
   for(const name of (index?['Atrium','Garden','Gallery']:['Corner','Hall']))spaces.push(await api('/api/spaces','POST',{name:`${label} ${name}`,zoneId:zone.id}));
   const start=index?'10:00':'09:00',finish=index?'12:30':'12:00',realityFinish=index?'11:15':'10:00',duration=index?15:20;
   for(const name of ['Fixed camera','Mobile camera','Mobile sound','Direct kit'])resources.push(await api('/api/resource-items','POST',{typeId:type.id,name:`${label} ${name}`,defaultAvailabilityStart:start,defaultAvailabilityEnd:finish}));
   const unit=await api('/api/itinerant-teams','POST',{code:`U00V_${label}`,name:`${label} mobile unit`,resourceItemIds:resources.slice(1,3).map(m=>m.id),availabilityWindows:[{start,end:finish}],transitionMinutes:index?5:0,isActive:true,orderIndex:1-index});
   const names=['Reality location','Ordinary location','Fixed camera elsewhere','Second mobile',...(index?['Independent garden','Independent gallery']:[])];
   for(let n=0;n<names.length;n++)templates.push(await api('/api/task-templates','POST',{name:`${label} ${names[n]}`,defaultDuration:duration+(index&&n===4?10:0),spaceId:spaces[n<2?0:n===5?2:1].id,zoneId:zone.id,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,itinerantTeamRequirement:n===3?'specific':'none',itinerantTeamId:n===3?unit.id:null,resourceRequirements:n===0?{byItem:{[resources[3].id]:1}}:n===2?{byItem:{[resources[0].id]:1}}:n===5?{byItem:{[resources[3].id]:1}}:null,rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}}));
   const general=await api('/api/new-day-planner-configuration');
   await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0}});
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(index?'2027-08-08':'2027-08-01');
   const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const created=await pending;assert.equal(created.status(),201);const day=await created.json(),planId=Number(day.id),path=`/api/plans/${planId}/assisted`,configPath=`/api/plans/${planId}/day-configuration`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),daily=(i:number)=>inventory.find((r:any)=>r.resourceItemId===resources[i].id).id;
   await api(`/api/plans/${planId}/spaces/${spaces[0].id}/space-resource-assignments`,'PATCH',{planResourceItemIds:[daily(0)]});
   for(const [n,t] of templates.entries()){const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`${label} participant ${n+1}`,availabilityStart:start,availabilityEnd:n===0?realityFinish:finish});tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:person.id,spaceId:t.spaceId,zoneId:zone.id}));}
   const before=await buildEngineInput(planId,storage),ordinary=adapt(before);save(`${label}-ordinary-input`,before);assert.equal(ordinary.status,'SUPPORTED');if(ordinary.status!=='SUPPORTED')throw Error('unsupported');
   save(`${label}-ordinary-result`,execute(buildAssistedProblem(ordinary.problem,resolveAssistedScope(before,ordinary,{kind:'TASK_IDS',taskIds:tasks.map(t=>t.id)}).scope,[])));
   const s0=await api(path+'/session','POST',{});save(`${label}-S0`,s0);
   const beforeEffective=await api(`/api/plans/${planId}/effective-configuration`);save(`${label}-ordinary-effective`,beforeEffective);
   await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);let editor=page.getByTestId('daily-task-operation-scopes');
   await editor.getByLabel('Actividad de ámbito operativo',{exact:true}).selectOption(String(tasks[0].id));
   await editor.getByLabel('Propietario de agenda',{exact:true}).selectOption('ITINERANT_UNIT');await editor.getByLabel('Herencia de recursos',{exact:true}).selectOption('OPERATION_ONLY');
   await editor.getByLabel('Ocupa físicamente el espacio',{exact:true}).check();
   const dailyUnit=before.itinerantCompositionSnapshot!.units.find(u=>u.source_team_id===unit.id)!;
   if(index)assert.notEqual(dailyUnit.id,unit.id,'daily identity differs from catalog');
   await editor.getByLabel('Unidad nominal de la actividad',{exact:true}).selectOption(String(dailyUnit.id));
   const saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar ámbito operativo',exact:true}).click();const saved=await saving;assert.equal(saved.status(),200,await saved.text());
   await page.reload();editor=page.getByTestId('daily-task-operation-scopes');await editor.getByLabel('Actividad de ámbito operativo',{exact:true}).selectOption(String(tasks[0].id));
   await editor.getByText(/Valor efectivo guardado: agenda itinerante/).waitFor();await editor.screenshot({path:`${directory}/${label}-configuration.png`});
   if(index){
    await editor.getByLabel('Actividad de ámbito operativo',{exact:true}).selectOption(String(tasks[3].id));
    await editor.getByLabel('Propietario de agenda',{exact:true}).selectOption('ITINERANT_UNIT');await editor.getByLabel('Herencia de recursos',{exact:true}).selectOption('OPERATION_ONLY');
    const secondSaving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar ámbito operativo',exact:true}).click();const secondSaved=await secondSaving;assert.equal(secondSaved.status(),200,await secondSaved.text());
   }
   let effective=await api(`/api/plans/${planId}/effective-configuration`),structure=effective.taskOperationScopes.authority;
   // Exercise all three independent switches, legal retirement and restoration.
   const physical=structuredClone(structure);physical.policies[0].agendaScope='PHYSICAL_SPACE';physical.policies[0].blocksSpace=false;physical.policies[0].resourceInheritance='LOCATION';
   save(`${label}-legal-edit`,await api(configPath,'PUT',{taskOperationScopes:physical,expectedRevisionId:effective.taskOperationScopes.revisionId},'production'));
   effective=await api(`/api/plans/${planId}/effective-configuration`);
   save(`${label}-legal-retire`,await api(configPath,'PUT',{taskOperationScopes:{contractVersion:1,policies:[]},expectedRevisionId:effective.taskOperationScopes.revisionId},'production'));
   effective=await api(`/api/plans/${planId}/effective-configuration`);
   save(`${label}-legal-restore`,await api(configPath,'PUT',{taskOperationScopes:structure,expectedRevisionId:effective.taskOperationScopes.revisionId},'production'));
   effective=await api(`/api/plans/${planId}/effective-configuration`);
   const raceValue=structuredClone(structure);raceValue.policies[0].agendaScope='PHYSICAL_SPACE';
   const race=await Promise.all([0,1].map(()=>request(configPath,'PUT',{taskOperationScopes:raceValue,expectedRevisionId:effective.taskOperationScopes.revisionId})));save(`${label}-race`,race);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
   effective=await api(`/api/plans/${planId}/effective-configuration`);await api(configPath,'PUT',{taskOperationScopes:structure,expectedRevisionId:effective.taskOperationScopes.revisionId});
   effective=await api(`/api/plans/${planId}/effective-configuration`);save(`${label}-effective`,effective);
   const input=await buildEngineInput(planId,storage),adapted=adapt(input);save(`${label}-input`,input);save(`${label}-adapter`,adapted);save(`${label}-assignments`,assignments(input));assert.equal(adapted.status,'SUPPORTED');if(adapted.status!=='SUPPORTED')throw Error('unsupported');
   await attacks({db,storage,planId,input,structure,revision:effective.taskOperationScopes.revisionId,actorId:users.admin.id,save:(n,v)=>save(`${label}-${n}`,v)});
   const authorityBeforeDataApi=(await db.query('SELECT daily_task_operation_scopes,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows;
   for(const role of ['admin','production','viewer','aux','norole']){const response=await fetch(`${url}/rest/v1/plans?id=eq.${planId}`,{method:'PATCH',headers:{apikey:anon,Authorization:`Bearer ${users[role].token}`,'Content-Type':'application/json'},body:JSON.stringify({daily_task_operation_scopes:null})});save(`${label}-data-api-${role}`,{status:response.status,body:await response.json()});assert.ok([400,401,403].includes(response.status));assert.deepEqual((await db.query('SELECT daily_task_operation_scopes,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows,authorityBeforeDataApi);}
   for(const role of ['viewer','aux','norole','anonymous']){const denied=await request(configPath,'PUT',{taskOperationScopes:{contractVersion:1,policies:[]},expectedRevisionId:effective.taskOperationScopes.revisionId},role);save(`${label}-role-${role}`,denied);assert.equal(denied.status,role==='anonymous'?401:403);}
   const stale=await request(configPath,'PUT',{taskOperationScopes:{contractVersion:1,policies:[]},expectedRevisionId:beforeEffective.taskOperationScopes.revisionId});save(`${label}-stale`,stale);assert.equal(stale.status,409);
   if(index){const foreign=structuredClone(structure);foreign.policies[0].itinerantUnitId=days[0].structure.policies[0].itinerantUnitId;const denied=await request(configPath,'PUT',{taskOperationScopes:foreign,expectedRevisionId:effective.taskOperationScopes.revisionId});save('B-foreign-unit',denied);assert.equal(denied.status,422);
    const incompatible=structuredClone(structure);incompatible.policies.find((p:any)=>p.taskId===tasks[3].id).itinerantUnitId=input.itinerantCompositionSnapshot!.units.find(u=>u.source_team_id!==unit.id)!.id;const wrong=await request(configPath,'PUT',{taskOperationScopes:incompatible,expectedRevisionId:effective.taskOperationScopes.revisionId});save('B-incompatible-unit',wrong);assert.equal(wrong.status,422);}
   const stages=[];
   for(const [stage,selected] of (index?[[tasks[0],tasks[2]],tasks.filter((_,n)=>n!==0&&n!==2)]:[tasks]).entries()){
    await page.goto(`${appUrl}/plans/${planId}?tab=planning`);const scope=page.getByTestId('section-assisted-scope');await scope.getByRole('checkbox').first().waitFor();
    for(const checkbox of await scope.getByRole('checkbox').all())await checkbox.uncheck();
    for(const t of selected)await scope.locator('label').filter({has:page.getByText(templates[tasks.indexOf(t)].name,{exact:true})}).getByRole('checkbox').check();
    const previous=await api(path),generation=page.waitForResponse(r=>new URL(r.url()).pathname===path+'/proposals'&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Generar propuesta',exact:true}).click();const generated=await generation;assert.equal(generated.status(),202,await generated.text());const {runId}=await generated.json();
    await page.getByRole('button',{name:'Aplicar al borrador',exact:true}).waitFor({timeout:180_000});const run=await api(path+`/proposals/${runId}`);save(`${label}-S${stage+1}-run`,run);const result=run.assisted_result_json;assert.equal(result.outcome,'PROPOSAL');
    const blocked=await request(configPath,'PUT',{taskOperationScopes:{contractVersion:1,policies:[]},expectedRevisionId:effective.taskOperationScopes.revisionId});save(`${label}-S${stage+1}-pending-edit`,blocked);assert.equal(blocked.status,409);
    if(index&&stage===0){const proposal=result.proposal.map((row:any)=>({...adapted.problem.tasks.find(t=>t.id===`task:${row.taskId}`)!,start:Number(row.startPlanned.slice(0,2))*60+Number(row.startPlanned.slice(3)),end:Number(row.endPlanned.slice(0,2))*60+Number(row.endPlanned.slice(3))}));
     const competitor=adapted.problem.tasks.find(t=>t.id===`task:${tasks[3].id}`)!,domain=exactTaskStartDomain(adapted.problem,competitor,proposal);save('B-future-witness',{contextOnly:true,taskId:competitor.id,start:[...domain.starts()][0],domainSize:domain.eligibleStartCount});assert.ok(domain.eligibleStartCount>0);assert.equal(result.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===tasks[3].id).startPlanned,null);}
    const action=async(name:string,suffix:string)=>{const pending=page.waitForResponse(r=>new URL(r.url()).pathname===path+suffix&&r.request().method()==='POST');await page.getByRole('button',{name,exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());return response.json();};
    const rows=async()=>(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows,beforeRows=await rows();
    await action('Aplicar al borrador',`/proposals/${runId}/apply`);assert.deepEqual(await rows(),beforeRows);save(`${label}-S${stage+1}-draft`,await api(path));
    await action('Validar borrador','/validate');const validated=await api(path);save(`${label}-S${stage+1}-validation`,validated.validation);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
    await action('Aceptar etapa','/accept-stage');const accepted=await api(path);save(`${label}-S${stage+1}-accepted`,accepted);save(`${label}-S${stage+1}-sql`,await rows());stages.push(accepted.activeStage);
    for(const t of previous.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((r:any)=>r.taskId===t.taskId),t);
    await page.screenshot({path:`${directory}/${label}-S${stage+1}.png`,fullPage:true});
   }
   const final=await api(path),placed=final.activeStage.snapshotJson.tasks;
   assert.ok(placed.every((t:any)=>t.startPlanned));const reality=placed.find((t:any)=>t.taskId===tasks[0].id),cam=placed.find((t:any)=>t.taskId===tasks[2].id),corner=placed.find((t:any)=>t.taskId===tasks[1].id);
   assert.ok(reality.startPlanned<cam.endPlanned&&cam.startPlanned<reality.endPlanned,'fixed camera independent simultaneous');assert.ok(corner.startPlanned>=reality.endPlanned,'physical competitor waits');assert.deepEqual(reality.assignedResourceIds,[daily(1),daily(2),daily(3)]);
   const realityTask=adapted.problem.tasks.find(t=>t.id===`task:${tasks[0].id}`)!,directPeer={...adapted.problem.tasks.find(t=>t.id===`task:${tasks[2].id}`)!,requiredResourceIds:[`plan-resource:${daily(3)}`]},startMin=Number(reality.startPlanned.slice(0,2))*60+Number(reality.startPlanned.slice(3));
   const direct=diagnoseTaskPlacement(adapted.problem,directPeer,startMin,[{...realityTask,start:startMin,end:startMin+duration}]);save(`${label}-direct-HARD`,direct);assert.equal(direct.firstRejectionReason,'OVERLAP_REQUIRED_RESOURCE');
   save(`${label}-staged-attacks`,await attacks({db,storage,planId,input:await buildEngineInput(planId,storage),structure,revision:effective.taskOperationScopes.revisionId,actorId:users.admin.id,snapshot:final.activeStage.snapshotJson,save:(n,v)=>save(`${label}-staged-${n}`,v)}));
   const denied=await request(configPath,'PUT',{taskOperationScopes:{contractVersion:1,policies:[]},expectedRevisionId:effective.taskOperationScopes.revisionId});save(`${label}-protected`,denied);assert.equal(denied.status,409);
   save(`${label}-rollback`,await api(path+'/rollback','POST',{targetStageId:s0.activeStage.id}));const rollbackDenied=await request(configPath,'PUT',{taskOperationScopes:{contractVersion:1,policies:[]},expectedRevisionId:effective.taskOperationScopes.revisionId});save(`${label}-rollback-protected`,rollbackDenied);assert.equal(rollbackDenied.status,409);assert.match(rollbackDenied.body.message,/TASK_SCOPE_PROTECTED/);
   for(const s of stages)save(`${label}-redo-${s.ordinal}`,await api(path+'/redo','POST',{targetStageId:s.id}));
   await page.reload();save(`${label}-reconstructed`,await api(`/api/plans/${planId}`));
   const spacesButton=page.getByRole('button',{name:'Mostrar Platós y espacios',exact:true});if(await spacesButton.getAttribute('aria-pressed')!=='true')await spacesButton.click();
   for(const name of ['Mostrar Concursantes','Mostrar Recursos']){const button=page.getByRole('button',{name,exact:true});if(await button.getAttribute('aria-pressed')==='true')await button.click();}
   const notice=page.getByTestId('itinerant-physical-occupancy');await notice.waitFor();await notice.locator('summary').click();assert.equal(await page.locator(`[data-physical-occupation-task-id="${tasks[0].id}"]`).count(),1);await notice.screenshot({path:`${directory}/${label}-occupancy.png`});
   for(const mode of ['Timeline','Lista']){await page.getByRole('button',{name:mode,exact:true}).click();const card=page.locator(`[data-planning-task-id="${tasks[0].id}"]:visible`);assert.equal(await card.count(),1);assert.equal(await card.getAttribute('data-planning-agenda'),'ITINERANT_UNIT');assert.equal(await card.getAttribute('data-planning-team-id'),String(dailyUnit.id));assert.equal(await card.getAttribute('data-planning-space-id'),String(spaces[0].id));await page.screenshot({path:`${directory}/${label}-${mode}.png`,fullPage:true});}
   save(`${label}-revisions`,(await db.query('SELECT * FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id',[planId])).rows);
   days.push({label,planId,taskIds:tasks.map(t=>t.id),structure,stages:stages.map(s=>({id:s.id,fingerprint:s.snapshotFingerprint}))});pass(`${label}: UI declaration and proposal/Draft/validate/Stage; SQL, physical controls, rollback and redo`);
  }
  return {days,remoteWrites:0};
 }finally{await Promise.allSettled(uiReads);save('api-receipts',apiJournal);save('ui-receipts',uiJournal);await browser.close();}
}
