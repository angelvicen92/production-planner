import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {preflightEngineInputForPlannerNext as preflight} from '../../../engine/planner-next/integration/engineInputPreflight';
import {buildAssistedProblem,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope} from '../../../server/assistedScopeResolver';
import {validatePlan} from '../../../engine/planner-next/validate';
type User={id:string;email:string;password:string;token:string};
export async function journey({appUrl,users,db,directory,pass}:{appUrl:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(s:string)=>void}){
 assert.equal((db as any).host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(name:string,v:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(v,null,2));
 const request=async(path:string,method='GET',body?:unknown)=>{const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users.admin.token}`},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json() as any};};
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'16:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const zone=await api('/api/zones','POST',{name:'U00u production'}),spaces:any[]=[];
  for(const name of ['Physical main','Voice preparation','Virtual before location','Virtual after location','Competing operation'])spaces.push(await api('/api/spaces','POST',{name,zoneId:zone.id}));
  const type=await api('/api/resource-types','POST',{code:'u00u_physical',name:'U00u physical equipment'});
  const members=[];for(const name of ['Camera','Sound'])members.push(await api('/api/resource-items','POST',{typeId:type.id,name,defaultAvailabilityStart:'09:00',defaultAvailabilityEnd:'12:00'}));
  const coachType=await api('/api/resource-types','POST',{code:'vocal_coach',name:'Vocal Coach'});
  const coach=await api('/api/resource-items','POST',{typeId:coachType.id,name:'U00u coach',defaultAvailabilityStart:'09:00',defaultAvailabilityEnd:'12:00'});
  const unit=await api('/api/itinerant-teams','POST',{code:'U00U',name:'U00u nominal unit',resourceItemIds:members.map(m=>m.id),availabilityWindows:[{start:'09:00',end:'12:00'}],transitionMinutes:0,isActive:true,orderIndex:0});
  const templates:any[]=[];
  for(const [n,kind] of ['vocal','main','auxiliary','auxiliary','auxiliary'].entries()){
   const space=spaces[[1,0,2,3,4][n]];
   templates.push(await api('/api/task-templates','POST',{name:['Voice','Main','Before','After','Independent'][n],defaultDuration:n===0?10:15,spaceId:space.id,zoneId:zone.id,requiresCoach:n<2,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:n===1?[templates[0].id]:[],itinerantTeamRequirement:n===0?'none':'specific',itinerantTeamId:n===0?null:unit.id,rulesJson:{plannerNextOperation:{contractVersion:1,kind},...(n===2||n===3?{blocksSpace:false,agendaScope:'ITINERANT_UNIT',resourceInheritance:'OPERATION_ONLY'}:{})}}));
  }
  const general=await api('/api/new-day-planner-configuration');
  await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'MAIN_WITH_VOCAL_FEEDER',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0,mainFlow:{spaceId:spaces[0].id,preferredEnd:'12:00',continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1}}});
  await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill('2027-07-01');
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const created=await pending;assert.equal(created.status(),201);const day=await created.json(),planId=Number(day.id);
  const inventory=await api(`/api/plans/${planId}/resource-items`),dailyCoach=inventory.find((r:any)=>r.resourceItemId===coach.id);assert.ok(dailyCoach);
  const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:'U00u participant',vocalCoachPlanResourceItemId:dailyCoach.id,availabilityStart:'09:00',availabilityEnd:'12:00'});
  const tasks:any[]=[];for(const t of templates)tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:person.id,spaceId:t.spaceId,zoneId:zone.id}));
  const input=await buildEngineInput(planId,storage);save('input',input);save('preflight',preflight(input));save('adapter',adapt(input));
  const state=await api(`/api/plans/${planId}/assisted/session`,'POST',{});save('S0',state);
  save('effective',await api(`/api/plans/${planId}/effective-configuration`));
  save('ordinary-request-result',await request(`/api/plans/${planId}/assisted/proposals`,'POST',{expectedDraftFingerprint:state.draftFingerprint,expectedBaseStageId:state.draftBaseStageId,selector:{kind:'TASK_IDS',taskIds:tasks.map(t=>t.id)},includePrerequisites:true}));
  save('authority',(await db.query('SELECT current_config_revision_id,planner_next_profile,itinerant_composition_version FROM plans WHERE id=$1',[planId])).rows);
  save('revisions',(await db.query('SELECT * FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id',[planId])).rows);
  await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);await page.getByText(/requiere una unidad itinerante/).first().waitFor();await page.screenshot({path:`${directory}/ordinary-rejection.png`,fullPage:true});
  const untouched=structuredClone(input);
  const contract={id:'diagnostic-only',anchorTaskId:tasks[1].id,beforeTaskIds:[tasks[2].id],afterTaskIds:[tasks[3].id],adjacency:'REQUIRED' as const,internalTransition:'INCLUDED' as const,resourceContinuity:'REQUIRED' as const};
  const onlyContract={...structuredClone(input),anchoredAccompaniments:[contract]};
  save('contract-only',{input:onlyContract,preflight:preflight(onlyContract),adapter:adapt(onlyContract)});
  const localized={...structuredClone(onlyContract),plannerNextMaterializationIssues:onlyContract.plannerNextMaterializationIssues?.filter(i=>!(i.taskId===tasks[1].id&&i.code==='UNSUPPORTED_TASK_ROLE'))};
  save('localized-preflight',preflight(localized));const adapted=adapt(localized);save('localized-adapter',adapted);
  // A separate intervention materializes only the already-declared nominal unit.
  // Never reclassify its members as direct declaredResourceIds, never supply times.
  const materialized=structuredClone(localized),unitMembers=materialized.itinerantTeamAvailability!.find(u=>u.itinerantTeamId===materialized.tasks.find(t=>t.id===tasks[1].id)!.itinerantTeamId)!.planResourceItemIds!;
  materialized.tasks=materialized.tasks.map(t=>[tasks[1].id,tasks[2].id,tasks[3].id].includes(t.id)?{...t,assignedResourceIds:[...new Set([...(t.assignedResourceIds??[]),...unitMembers])],...(t.id===tasks[1].id?{agendaScope:'PHYSICAL_SPACE' as const,resourceInheritance:'LOCATION' as const}:{blocksSpace:false,agendaScope:'ITINERANT_UNIT' as const,resourceInheritance:'OPERATION_ONLY' as const})}:t);
  save('materialized-input',materialized);save('materialized-preflight',preflight(materialized));const consumer=adapt(materialized);save('materialized-adapter',consumer);
  if(consumer.status==='SUPPORTED'){
   const scope=resolveAssistedScope(materialized,consumer,{kind:'TASK_IDS',taskIds:tasks.map(t=>t.id)}),problem=buildAssistedProblem(consumer.problem,scope.scope,[]);
   save('localized-scope',scope);save('localized-assisted-problem',problem);
   const a=execute(problem),b=execute(problem);save('localized-result',{a,b});
   if(a.proposal)save('localized-validation',validatePlan(consumer.problem,[...a.proposal]));
   assert.deepEqual(a.proposal,b.proposal);assert.equal(a.evidence.fingerprint,b.evidence.fingerprint);
  }
  assert.deepEqual(input,untouched);
  save('final-S0',await api(`/api/plans/${planId}/assisted`));
  pass('native source captured; memory-only counterfactual; no Draft/Stage from experiment');
  return {planId,taskIds:tasks.map(t=>t.id),contract,ordinaryStatus:adapt(input).status,counterfactualStatus:adapted.status,experimentIsStage:false};
 }finally{await browser.close();}
}
