/** Native catalogs and declarations. Counterfactuals never write placements. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {withDailyTaskOperationScopes,taskScopeDirectResources} from '../../../server/dailyTaskOperationScopes';
import {inspect} from '../p0-u00w/consumer';
import {nativeDay} from './native';
export async function journey({appUrl,url,anon,users,db,directory,pass}:any){
 assert.equal((db as pg.Client).host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const receipts:unknown[]=[];
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});const response={status:r.status,body:await r.json() as any};receipts.push({path,method,role,request:body,response});return response;};
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),days:any[]=[];
 const browserEvents:any[]=[];page.on('pageerror',(e:any)=>browserEvents.push({message:e.message}));page.on('response',(r:any)=>{if(r.status()>=400&&['document','script','stylesheet'].includes(r.request().resourceType()))browserEvents.push({status:r.status(),path:new URL(r.url()).pathname});});
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'17:00',mealStart:'14:00',mealEnd:'15:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const physical=await api('/api/resource-types','POST',{code:'u00x_physical',name:'Physical equipment'}),coachType=await api('/api/resource-types','POST',{code:'vocal_coach',name:'Vocal Coach'});
  for(const [index,label] of (process.argv.includes('--native')&&!process.argv.includes('--shared-negative')?['A','B']:['A']).entries()){
   const start=index?'10:00':'09:00',end=index?'13:30':'12:00',earlyEnd=index?'11:10':'10:00';
   const zone=await api('/api/zones','POST',{name:`${label} production`}),spaces:any[]=[],resources:any[]=[],units:any[]=[];
   for(const n of (index?['Stage','Studio','Atrium','Gallery','Garden']:['Main','Vocal','Corner','Hall','External']))spaces.push(await api('/api/spaces','POST',{name:`${label} ${n}`,zoneId:zone.id}));
   for(const n of ['CAM1','Mobile camera A','Mobile sound A','Mobile camera B','Mobile sound B','Kit 0','Kit 1','Kit 2','Independent kit'])resources.push(await api('/api/resource-items','POST',{typeId:physical.id,name:`${label} ${n}`,defaultAvailabilityStart:start,defaultAvailabilityEnd:end}));
   const coach=await api('/api/resource-items','POST',{typeId:coachType.id,name:`${label} coach`,defaultAvailabilityStart:start,defaultAvailabilityEnd:end});
   for(const [i,n] of ['A','B'].entries())units.push(await api('/api/itinerant-teams','POST',{code:`U00X_${label}_${n}`,name:`${label} mobile ${n}`,resourceItemIds:process.argv.includes('--shared-negative')&&i===1?[resources[1].id,resources[4].id]:resources.slice(1+i*2,3+i*2).map(r=>r.id),availabilityWindows:[{start,end:i?index?'12:05':'10:40':end}],transitionMinutes:index?5:0,isActive:true,orderIndex:i}));
   const tmpl=async(n:string,kind:string,s:number,d:number,deps:number[]=[],req:any={},unit?:number)=>api('/api/task-templates','POST',{name:`${label} ${n}`,defaultDuration:d,spaceId:spaces[s].id,zoneId:zone.id,requiresCoach:kind==='main'||kind==='vocal',participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:deps,resourceRequirements:req,...(unit?{itinerantTeamRequirement:'specific',itinerantTeamId:unit}:{}),rulesJson:{plannerNextOperation:{contractVersion:1,kind}}});
   const templates:any[][]=[];
   for(let i=0;i<5;i++){
    const kit=resources[5+i/2],v=await tmpl(`Vocal ${i}`,'vocal',1,10),m=await tmpl(`Main ${i}`,'main',0,15,[v.id],i%2===0?{byItem:{[kit.id]:1}}:{});
    templates.push(i%2===0?[v,m,await tmpl(`Before ${i}`,'auxiliary',index?3:0,15,[],{byItem:{[kit.id]:1}}),await tmpl(`After ${i}`,'auxiliary',index?4:0,15,[],{byItem:{[kit.id]:1}})]:[v,m]);
   }
   const independent=[await tmpl('Reality Corner','auxiliary',2,index?25:30,[],{byItem:{[resources[8].id]:1}},units[0].id),await tmpl('Hall camera','auxiliary',3,index?25:30,[],{byItem:{[resources[0].id]:1}}),await tmpl('Ordinary Corner','auxiliary',2,20)];
   if(index)independent.push(await tmpl('Reality Garden','auxiliary',4,20,[],{byItem:{[resources[8].id]:1}},units[1].id));
   const general=await api('/api/new-day-planner-configuration');
   await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'MAIN_WITH_VOCAL_FEEDER',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0,mainFlow:{spaceId:spaces[0].id,preferredEnd:index?'12:00':'11:30',continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1}}});
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(index?'2027-10-21':'2027-10-07');
   const creating=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const created=await creating;assert.equal(created.status(),201);const planId=Number((await created.json()).id),path=`/api/plans/${planId}/assisted`,configPath=`/api/plans/${planId}/day-configuration`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),dailyCoach=inventory.find((r:any)=>r.resourceItemId===coach.id);
   await api(`/api/plans/${planId}/spaces/${spaces[2].id}/space-resource-assignments`,'PATCH',{planResourceItemIds:[inventory.find((r:any)=>r.resourceItemId===resources[0].id).id]});
   const groups:any[][]=[],tasks:any[]=[];
   for(const [i,group] of [...templates,...independent.map(t=>[t])].entries()){
    const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`${label} participant ${i}`,...(i<5?{vocalCoachPlanResourceItemId:dailyCoach.id}:{}),availabilityStart:start,availabilityEnd:i===5||i===6?earlyEnd:end});
    const daily=[];for(const t of group)daily.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:person.id,spaceId:t.spaceId,zoneId:zone.id}));groups.push(daily);tasks.push(...daily);
   }
   const ordinary=await buildEngineInput(planId,storage);save(`${label}-ordinary-input`,ordinary);
   const view=await api(`/api/plans/${planId}/effective-configuration`),dailyUnits=units.map(u=>view.anchoredAccompaniments.units.find((d:any)=>d.name===u.name).id);
   const policies=groups.filter(g=>g.length===4).map((g,i)=>({id:`${label}-anchored-${i}`,anchorTaskId:g[1].id,beforeTaskIds:[g[2].id],afterTaskIds:[g[3].id],eligibleItinerantUnitIds:dailyUnits,adjacency:'REQUIRED',internalTransition:'INCLUDED',resourceContinuity:'REQUIRED'}));
   const s0=await api(path+'/session','POST',{});save(`${label}-S0`,s0);
   for(const [i,p] of policies.entries()){
    await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);const editor=page.getByTestId('daily-anchored-accompaniment');await editor.getByRole('button',{name:'Crear operación anclada',exact:true}).click();
    await editor.getByLabel('Actividad principal anclada',{exact:true}).selectOption(String(p.anchorTaskId));await editor.getByLabel('Segmento anterior al Main',{exact:true}).selectOption(String(p.beforeTaskIds[0]));await editor.getByLabel('Segmento posterior al Main',{exact:true}).selectOption(String(p.afterTaskIds[0]));await editor.getByLabel('Contrato de equipo anclado',{exact:true}).selectOption('domain');
    for(const id of dailyUnits)await editor.getByLabel(`Equipo elegible ${view.anchoredAccompaniments.units.find((u:any)=>u.id===id).name}`,{exact:true}).check();
    const saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar operación anclada',exact:true}).click();const response=await saving;assert.equal(response.status(),200,await response.text());
    save(`${label}-anchor-${i}`,await api(`/api/plans/${planId}/effective-configuration`));
   }
   const anchored=await buildEngineInput(planId,storage),reality=groups[5][0];
   const scopePolicies=[5,...(index?[8]:[])].map(i=>({taskId:groups[i][0].id,agendaScope:'ITINERANT_UNIT' as const,resourceInheritance:'OPERATION_ONLY' as const,blocksSpace:true,itinerantUnitId:dailyUnits[i===5?0:1],declaredResourceIds:taskScopeDirectResources(anchored,anchored.tasks.find(t=>t.id===groups[i][0].id)!)}));
   const structure={contractVersion:1 as const,policies:scopePolicies},effective=await api(`/api/plans/${planId}/effective-configuration`);
   if(!process.argv.includes('--native')){
    const rows=await db.query('SELECT daily_anchored_accompaniments,daily_task_operation_scopes,current_config_revision_id FROM plans WHERE id=$1',[planId]);
    const denied=await request(configPath,'PUT',{taskOperationScopes:structure,expectedRevisionId:effective.taskOperationScopes.revisionId});save('original-422',denied);assert.equal(denied.status,422);assert.equal(denied.body.message,'UNSUPPORTED_TASK_SCOPE_COMBINATION');
    const original=JSON.stringify(anchored),combined=withDailyTaskOperationScopes({...structuredClone(anchored),anchoredAccompaniments:undefined},structure);combined.anchoredAccompaniments=anchored.anchoredAccompaniments;
    for(const [name,input] of Object.entries({anchors:anchored,standalone:withDailyTaskOperationScopes(ordinary,structure),combined}))save(`control-${name}`,{input,...inspect(input)});
    save('combined-partial',{input:combined,...inspect(combined,[policies[0].anchorTaskId])});
    assert.equal(JSON.stringify(anchored),original);assert.deepEqual((await db.query('SELECT daily_anchored_accompaniments,daily_task_operation_scopes,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows,rows.rows);
    const after=await api(path);assert.deepEqual(after.activeStage,s0.activeStage);assert.deepEqual(after.draft,s0.draft);save('final-S0',after);
    days.push({planId,policies,scopePolicies,dailyUnits,realityTaskId:reality.id,persistenceUnchanged:true,experimentIsStage:false});pass('original 422 and three same-source memory controls; S0 unchanged');
   }else {days.push(await nativeDay({label,index,planId,policies,dailyUnits,scopePolicies,page,appUrl,db,api,request,save,s0,directory,url,anon,users}));pass(`${label}: composed native authorities through Stage`);}
  }
  return {days,remoteWrites:0};
 }finally{save('api-receipts',receipts);save('browser-events',browserEvents);save('browser-final',{url:page.url(),text:await page.locator('body').innerText().catch(()=>null)});await browser.close();}
}
