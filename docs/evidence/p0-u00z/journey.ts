import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {inspect} from '../p0-u00y/consumer';
import {assessOperationalMealFutureFeasibility} from '../../../engine/planner-next/operationalMeals';
import {validatePlan} from '../../../engine/planner-next/validate';
export async function journey(ctx:any){
 if(process.argv.includes('--joint-integration'))return (await import('../p0-u00y/nativeJourney')).nativeJourney(ctx);
 const {appUrl,users,db,directory,pass}=ctx;
 assert.equal(db.host,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const receipts:any[]=[];
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});const response={status:r.status,body:await r.json() as any};receipts.push({path,method,body,response});return response;};
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});const page=await browser.newPage({viewport:{width:1440,height:1100}});
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'08:00',defaultWorkEnd:'16:00',mealStart:'15:00',mealEnd:'15:15',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'operational_equipment',name:'Physical equipment'}),zone=await api('/api/zones','POST',{name:'Generic production'});
  const spaces:any[]=[];for(const name of ['North','South','Remote','Unrelated'])spaces.push(await api('/api/spaces','POST',{name,zoneId:zone.id}));
  const members:any[]=[];for(const name of ['Camera amber','Sound amber','Camera violet','Sound violet'])members.push(await api('/api/resource-items','POST',{typeId:type.id,name,defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'16:00'}));
  const teams:any[]=[];
  for(const [name,indices] of [['Mobile amber',[0,1]],['Mobile violet',[2,3]],['Recombined',[0,3]]] as const){const t=await api('/api/itinerant-teams','POST',{code:'unit_'+teams.length,name,resourceItemIds:indices.map(i=>members[i].id),availabilityWindows:[{start:teams.length===1?'11:00':'08:00',end:teams.length===0?'11:30':'16:00'}],transitionMinutes:0,isActive:true});teams.push(t);}
  const profile=await api('/api/new-day-planner-configuration');await api('/api/new-day-planner-configuration','PUT',{expectedRevision:profile.revision,configuration:{contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0}});
  const templates:any[]=[];
  for(const [name,s,d,resource,team] of [['Studio work',0,30,0,-1],['Other subspace',1,20,0,-1],['Unaffected',3,30,-1,-1],['Mobile first',0,25,-1,0],['Mobile second',1,30,-1,1],['Mobile recomposed',2,20,-1,2]] as const){templates.push(await api('/api/task-templates','POST',{name,defaultDuration:d,spaceId:spaces[s].id,zoneId:zone.id,requiresCoach:false,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,resourceRequirements:resource<0?{}:{byItem:{[members[resource].id]:1}},...(team<0?{}:{itinerantTeamRequirement:'specific',itinerantTeamId:teams[team].id}),rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}}));}
  for(const [label,indices,windows] of [['A',[0,1,2],[['10:55','11:25'],['11:20','12:30'],['11:25','11:55']]],['B',[3,4,5,2],[['09:50','10:15'],['11:50','12:20'],['10:30','11:30'],['10:15','10:45']]],...(process.argv.includes('--native')?[['D',[3,4,5,2],[['09:50','10:15'],['11:50','12:20'],['10:30','11:30'],['10:15','10:45']]]] as const:[])] as const){
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Fecha',{exact:true}).fill(label==='A'?'2027-11-10':label==='D'?'2027-11-13':'2027-11-11');const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Crear día',exact:true}).click();const created=await pending;assert.equal(created.status(),201);const planId=Number((await created.json()).id);
   for(const [i,index] of indices.entries()){const p=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`${label} participant ${i}`,availabilityStart:windows[i][0],availabilityEnd:windows[i][1]});const t=templates[index];await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id});}
   let ordinary=await buildEngineInput(planId,storage);
   if(process.argv.includes('--native')&&['B','D'].includes(label)){
    const v=await api(`/api/plans/${planId}/effective-configuration`),task=ordinary.tasks[0];
    await api(`/api/plans/${planId}/day-configuration`,'PUT',{taskOperationScopes:{contractVersion:1,policies:[{taskId:task.id,agendaScope:'ITINERANT_UNIT',resourceInheritance:'OPERATION_ONLY',blocksSpace:false,itinerantUnitId:task.itinerantTeamId,declaredResourceIds:task.declaredResourceIds??[]}]},expectedRevisionId:v.taskOperationScopes.revisionId});
    ordinary=await buildEngineInput(planId,storage);
   }
   const resources=ordinary.planResourceItems;
   const ids=(list:number[])=>list.map(i=>resources.find(r=>r.resourceItemId===members[i].id)!.id);
   const policies=label==='A'?[{id:'studio-common',window:{start:'11:00',end:'12:20'},durationMinutes:25,planResourceItemIds:ids([0]),spaceIds:spaces.slice(0,2).map(s=>s.id)}]:[{id:'mobile-amber',window:{start:'10:00',end:'10:55'},durationMinutes:20,planResourceItemIds:ids([0,1]),spaceIds:[]},{id:'mobile-violet',window:{start:'12:00',end:'12:55'},durationMinutes:25,planResourceItemIds:ids([2,3]),spaceIds:[]}];
   if(label==='D')policies.push({id:'physical-location-only',window:{start:'10:00',end:'10:20'},durationMinutes:20,planResourceItemIds:[],spaceIds:[spaces[0].id]});
   const state=await api(`/api/plans/${planId}/assisted/session`,'POST',{}),before=(await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows;
   const effective=await api(`/api/plans/${planId}/effective-configuration`);
   if(process.argv.includes('--native')){await (await import('./native')).nativeDay({...ctx,page,api,request,save,label,planId,policies,ordinary,state});continue;}
   const rejected=await request(`/api/plans/${planId}/day-configuration`,'PUT',{operationalMealPolicies:{contractVersion:1,policies},expectedRevisionId:effective.taskOperationScopes.revisionId});save(label+'-productive-rejection',rejected);assert.equal(rejected.status,400);
   await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);await page.getByTestId('daily-task-operation-scopes').waitFor();save(label+'-ui-before',{text:await page.locator('body').innerText(),editors:await page.getByTestId('daily-operational-meals').count()});await page.screenshot({path:`${directory}/${label}-before.png`,fullPage:true});
   const declared={...ordinary,operationalMealPolicies:policies};
   save(label+'-input',ordinary);save(label+'-declared',declared);
   for(const [control,input,taskIds] of [['without',ordinary,undefined],['with',declared,undefined],['partial',declared,[ordinary.tasks.at(-1)!.id]]] as const){
    const result=inspect(input,taskIds?[...taskIds]:undefined);save(label+'-'+control,result);
    assert.equal(result.adapter.status,'SUPPORTED',JSON.stringify(result.preflight));assert.ok(result.result?.proposal,JSON.stringify(result.result?.evidence));
    const meals=assessOperationalMealFutureFeasibility(result.adapter.problem,result.result.proposal,{remaining:10000},'MATERIALIZE');
    save(label+'-'+control+'-meals',meals);
    if(control==='with'){assert.ok(meals.complete);const valid=validatePlan(result.adapter.problem,[...result.result.proposal],[],[],[],[],[],[],[...meals.scheduled]);save(label+'-validation',valid);assert.ok(valid.hardValid,JSON.stringify(valid));assert.equal(meals.scheduled.length,policies.length);}
   }
   assert.deepEqual((await db.query('SELECT * FROM plans WHERE id=$1',[planId])).rows,before);const after=await api(`/api/plans/${planId}/assisted`);assert.deepEqual(after.activeStage,state.activeStage);assert.deepEqual(after.draft,state.draft);
   pass(`${label}: real rejection; same input with and without memory-only policies; S0 unchanged`);
  }
  if(process.argv.includes('--native'))await (await import('./main-native')).mainDay({...ctx,page,api,request,save});
 }finally{save('api-receipts',receipts);await browser.close();}
 return {remoteWrites:0,experimentIsStage:false};
}
