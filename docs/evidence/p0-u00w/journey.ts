/** Real disposable product catalogs. A/B experiments stay in memory. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {project,inspect} from './consumer';
import {nativeDay} from './native';
type User={id:string;email:string;password:string;token:string};
export async function journey({appUrl,users,db,directory,pass}:{appUrl:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(s:string)=>void}){
 assert.equal((db as any).host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(name:string,v:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(v,null,2));
 const receipts:unknown[]=[];
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});const response={status:r.status,body:await r.json() as any};receipts.push({path,method,role,request:body,response});return response;};
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),days:any[]=[];
 const browserEvents:any[]=[];
 page.on('pageerror',e=>browserEvents.push({kind:'pageerror',message:e.message}));
 page.on('response',r=>{if(r.status()>=400&&['script','stylesheet','document'].includes(r.request().resourceType()))browserEvents.push({kind:'asset',status:r.status(),path:new URL(r.url()).pathname});});
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'16:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const physicalType=await api('/api/resource-types','POST',{code:'u00w_physical',name:'U00w physical'});
  const coachType=await api('/api/resource-types','POST',{code:'vocal_coach',name:'Vocal Coach'});
  for(const [index,label] of (process.argv.includes('--shared-negative')?['choice']:['choice','multi']).entries()){
   const zone=await api('/api/zones','POST',{name:`U00w ${label}`}),spaces:any[]=[];
   for(const name of ['Main','Vocal','Before','After','External'])spaces.push(await api('/api/spaces','POST',{name:`${label} ${name}`,zoneId:zone.id}));
   const members:any[]=[],kits:any[]=[],units:any[]=[];
   for(const name of ['Camera A','Sound A','Camera B','Sound B'])members.push(await api('/api/resource-items','POST',{typeId:physicalType.id,name:`${label} ${name}`,defaultAvailabilityStart:'09:00',defaultAvailabilityEnd:'12:00'}));
   for(let i=0;i<(index?3:1);i++)kits.push(await api('/api/resource-items','POST',{typeId:physicalType.id,name:`${label} direct kit ${i}`,defaultAvailabilityStart:'09:00',defaultAvailabilityEnd:'12:00'}));
   const facility=process.argv.includes('--native')&&index?await api('/api/resource-items','POST',{typeId:physicalType.id,name:`${label} Main facility`,defaultAvailabilityStart:'09:00',defaultAvailabilityEnd:'12:00'}):null;
   const coach=await api('/api/resource-items','POST',{typeId:coachType.id,name:`${label} coach`,defaultAvailabilityStart:'09:00',defaultAvailabilityEnd:'12:00'});
   for(const [i,name] of ['A','B'].entries())units.push(await api('/api/itinerant-teams','POST',{code:`U00W_${label}_${name}`,name:`${label} unit ${name}`,resourceItemIds:process.argv.includes('--shared-negative')&&i===1?[members[0].id,members[3].id]:members.slice(i*2,i*2+2).map(m=>m.id),availabilityWindows:[{start:'09:00',end:process.argv.includes('--native')&&!index&&i===1?'10:05':'12:00'}],transitionMinutes:0,isActive:true,orderIndex:i}));
   const tmpl=async(name:string,kind:string,space:number,duration:number,deps:number[]=[],requirements:any={})=>api('/api/task-templates','POST',{name:`${label} ${name}`,defaultDuration:duration,spaceId:spaces[space].id,zoneId:zone.id,requiresCoach:kind==='main'||kind==='vocal',participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:deps,resourceRequirements:requirements,rulesJson:{plannerNextOperation:{contractVersion:1,kind}}});
   const templates:any[][]=[];
   for(let i=0;i<(index?5:1);i++){
    const operation=!index||i%2===0,kit=operation?kits[index?i/2:0]:null;
    const vocal=await tmpl(`Vocal ${i}`,'vocal',1,10),main=await tmpl(`Main ${i}`,'main',0,15,[vocal.id],kit?{byItem:{[kit.id]:1}}:{});
    templates.push(operation?[vocal,main,await tmpl(`Before ${i}`,'auxiliary',process.argv.includes('--native')&&index?0:2,15,[],{byItem:{[kit.id]:1}}),await tmpl(`After ${i}`,'auxiliary',process.argv.includes('--native')&&index?0:3,15,[],{byItem:{[kit.id]:1}})]:[vocal,main]);
   }
   const external=await tmpl('High pressure A','auxiliary',4,index?30:60,[],{byItem:{[members[0].id]:1,[members[1].id]:1}});
   const general=await api('/api/new-day-planner-configuration');
   await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'MAIN_WITH_VOCAL_FEEDER',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0,mainFlow:{spaceId:spaces[0].id,preferredEnd:index?'11:30':'10:15',continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1}}});
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(index?'2027-09-13':'2027-09-09');
   const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const created=await pending;assert.equal(created.status(),201);const day=await created.json(),planId=Number(day.id),path=`/api/plans/${planId}/assisted`,configPath=`/api/plans/${planId}/day-configuration`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),dailyCoach=inventory.find((r:any)=>r.resourceItemId===coach.id);assert.ok(dailyCoach);
   if(facility)await api(`/api/plans/${planId}/spaces/${spaces[0].id}/space-resource-assignments`,'PATCH',{planResourceItemIds:[inventory.find((r:any)=>r.resourceItemId===facility.id).id]});
   const tasks:any[][]=[];
   for(const [i,group] of templates.entries()){
    const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`${label} participant ${i}`,vocalCoachPlanResourceItemId:dailyCoach.id,availabilityStart:'09:00',availabilityEnd:index?'12:00':'10:15'});
    const daily=[];for(const t of group)daily.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:person.id,spaceId:t.spaceId,zoneId:zone.id}));tasks.push(daily);
   }
   const pressurePerson=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`${label} pressure`,availabilityStart:'09:00',availabilityEnd:index?'12:00':'10:15'});
   const pressure=await api('/api/daily-tasks','POST',{planId,templateId:external.id,contestantId:pressurePerson.id,spaceId:external.spaceId,zoneId:zone.id});
   if(!index)await api(`/api/plans/${planId}/spaces/${spaces[0].id}/availability`,'PATCH',{availabilityStart:'09:00',availabilityEnd:'10:15'});
   const effective=await api(`/api/plans/${planId}/effective-configuration`),dailyUnits=units.map(u=>effective.anchoredAccompaniments.units.find((d:any)=>d.name===u.name).id);
   const policies=tasks.filter(g=>g.length===4).map((g,i)=>({id:`${label}-${i}`,anchorTaskId:g[1].id,beforeTaskIds:[g[2].id],afterTaskIds:[g[3].id],itinerantUnitId:dailyUnits[0],adjacency:'REQUIRED' as const,internalTransition:'INCLUDED' as const,resourceContinuity:'REQUIRED' as const}));
   const ordinary=await buildEngineInput(planId,storage),s0=await api(path+'/session','POST',{});save(`${label}-ordinary-input`,ordinary);save(`${label}-S0`,s0);save(`${label}-effective`,effective);
   save(`${label}-sql`,(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
   save(`${label}-revisions`,(await db.query('SELECT * FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id',[planId])).rows);
   if(process.argv.includes('--native')){
    days.push(await nativeDay({label,index,planId,policies,dailyUnits,page,appUrl,db,api,request,save,s0,directory}));
    pass(process.argv.includes('--shared-negative')?'shared physical member prevents false A/B capacity; S0 unchanged':`${label}: native anchored choice through Stage`);continue;
   }
   const domain={contractVersion:1,policies:policies.map(({itinerantUnitId,...p})=>({...p,allowedItinerantUnitIds:dailyUnits}))};
   const domainDenied=await request(configPath,'PUT',{anchoredAccompaniments:domain,expectedRevisionId:effective.anchoredAccompaniments.revisionId});save(`${label}-domain-native`,domainDenied);assert.equal(domainDenied.status,400);
   if(index){const multipleDenied=await request(configPath,'PUT',{anchoredAccompaniments:{contractVersion:1,policies},expectedRevisionId:effective.anchoredAccompaniments.revisionId});save('multi-native',multipleDenied);assert.equal(multipleDenied.status,400);}
   const immutable=JSON.stringify(ordinary);
   const cases:any[]=[];
   for(let mask=0;mask<(1<<policies.length);mask++){
    const selections=policies.map((_,i)=>dailyUnits[(mask>>i)&1]);
    const memory=project(ordinary,policies,dailyUnits,selections),result=inspect(memory);save(`${label}-fixed-${mask}`,{input:memory,...result});
    cases.push({mask,requestedUnits:selections,...('result' in result?{work:result.result.evidence.work,reasons:result.result.evidence.reasonCodes,proposal:result.result.proposal,validation:result.validation,selections:result.operationSelections}:{adapter:result.adapter})});
   }
   const flexible=project(ordinary,policies,dailyUnits,policies.map(()=>null));save(`${label}-domain`,{input:flexible,...inspect(flexible)});
   save(`${label}-fixed-summary`,cases);assert.equal(JSON.stringify(ordinary),immutable);
   const partialIds=[policies[0].anchorTaskId];save(`${label}-partial-domain`,{input:flexible,...inspect(flexible,partialIds)});
   const final=await api(path);assert.deepEqual(final.activeStage,s0.activeStage);assert.deepEqual(final.draftSnapshot,s0.draftSnapshot);save(`${label}-final-S0`,final);
   await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);await page.getByTestId('daily-anchored-accompaniment').waitFor();await page.screenshot({path:`${directory}/${label}-configuration.png`,fullPage:true});
   days.push({label,planId,policies,dailyUnits,pressureTaskId:pressure.id,sourceUnchanged:true,experimentIsStage:false});pass(`${label}: authentic sources and A/B comparisons, no experimental Draft/Stage`);
  }
  return {days,remoteWrites:0};
 }finally{save('api-receipts',receipts);save('browser-events',browserEvents);save('browser-final',{url:page.url(),text:await page.locator('body').innerText().catch(()=>null)});await browser.close();}
}
