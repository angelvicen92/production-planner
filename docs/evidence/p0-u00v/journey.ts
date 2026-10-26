/** Causal gate: native source, memory-only declaration, no accepted placements. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {resolveEffectiveTaskResourceAssignments as assignments} from '../../../engine/planner-next/integration/effectiveTaskResourceAssignments';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {preflightEngineInputForPlannerNext as preflight} from '../../../engine/planner-next/integration/engineInputPreflight';
import {buildAssistedProblem,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope} from '../../../server/assistedScopeResolver';
import {validatePlan} from '../../../engine/planner-next/validate';
import {canPlaceTask,diagnoseTaskPlacement,exactTaskStartDomain} from '../../../engine/planner-next/placement';
import {projectTaskOperationScopes,usesItinerantAgenda} from '../../../shared/taskOperationScope';
type User={id:string;email:string;password:string;token:string};
export async function journey({appUrl,users,db,directory,pass}:{appUrl:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(s:string)=>void}){
 assert.equal((db as any).host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(name:string,v:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(v,null,2));
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users.admin.token}`},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json() as any;assert.ok(r.status<300,JSON.stringify({path,status:r.status,value}));return value;};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'16:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const zone=await api('/api/zones','POST',{name:'U00v production'}),spaces:any[]=[];
  for(const name of ['Corner','Hall'])spaces.push(await api('/api/spaces','POST',{name,zoneId:zone.id}));
  const type=await api('/api/resource-types','POST',{code:'u00v_physical',name:'Physical equipment'});
  const resources:any[]=[];for(const name of ['CAM1 fixed','Mobile camera','Mobile sound','Direct kit'])resources.push(await api('/api/resource-items','POST',{typeId:type.id,name,defaultAvailabilityStart:'09:00',defaultAvailabilityEnd:'12:00'}));
  const unit=await api('/api/itinerant-teams','POST',{code:'U00V_A',name:'Mobile A',resourceItemIds:resources.slice(1,3).map(m=>m.id),availabilityWindows:[{start:'09:00',end:'12:00'}],transitionMinutes:0,isActive:true,orderIndex:0});
  const templates:any[]=[];
  for(let n=0;n<4;n++)templates.push(await api('/api/task-templates','POST',{name:['Reality','Ordinary Corner','CAM1 elsewhere','Second mobile'][n],defaultDuration:20,spaceId:spaces[n<2?0:1].id,zoneId:zone.id,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,itinerantTeamRequirement:n===0||n===3?'specific':'none',itinerantTeamId:n===0||n===3?unit.id:null,resourceRequirements:n===0?{byItem:{[resources[3].id]:1}}:n===2?{byItem:{[resources[0].id]:1}}:null,rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}}));
  const general=await api('/api/new-day-planner-configuration');
  await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0}});
  await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill('2027-08-01');
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const created=await pending;assert.equal(created.status(),201);const day=await created.json(),planId=Number(day.id);
  const inventory=await api(`/api/plans/${planId}/resource-items`),daily=(i:number)=>inventory.find((r:any)=>r.resourceItemId===resources[i].id).id;
  await api(`/api/plans/${planId}/spaces/${spaces[0].id}/space-resource-assignments`,'PATCH',{planResourceItemIds:[daily(0)]});
  const tasks:any[]=[];
  for(const t of templates){const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:t.name+' participant',availabilityStart:'09:00',availabilityEnd:'12:00'});tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:person.id,spaceId:t.spaceId,zoneId:zone.id}));}
  const input=await buildEngineInput(planId,storage),untouched=structuredClone(input);
  save('ordinary-input',input);save('ordinary-assignments',assignments(input));save('ordinary-preflight',preflight(input));
  save('S0',await api(`/api/plans/${planId}/assisted/session`,'POST',{}));save('effective',await api(`/api/plans/${planId}/effective-configuration`));
  save('snapshot',(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
  save('revisions',(await db.query('SELECT * FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id',[planId])).rows);
  const projected=structuredClone(input);
  projected.tasks=projected.tasks.map(t=>t.id===tasks[0].id?{...t,agendaScope:'ITINERANT_UNIT' as const,resourceInheritance:'OPERATION_ONLY' as const,blocksSpace:true}:t);
  for(const [label,source] of [['ordinary',input],['counterfactual',projected]] as const){
   const adapter=adapt(source);save(label+'-adapter',adapter);save(label+'-preflight',preflight(source));save(label+'-assignments',assignments(source));assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('unsupported');
   const scope=resolveAssistedScope(source,adapter,{kind:'TASK_IDS',taskIds:tasks.map(t=>t.id)}),problem=buildAssistedProblem(adapter.problem,scope.scope,[]),result=execute(problem),repeat=execute(problem);
   save(label+'-scope',scope);save(label+'-problem',problem);save(label+'-result',result);
   assert.deepEqual(result.proposal,repeat.proposal);assert.equal(result.evidence.fingerprint,repeat.evidence.fingerprint);assert.ok(result.proposal);
   save(label+'-validation',validatePlan(adapter.problem,[...result.proposal!]));
   const reality=adapter.problem.tasks.find(t=>t.id===`task:${tasks[0].id}`)!,placement=result.proposal!.find(p=>p.id===reality.id)!;
   const probes=adapter.problem.tasks.filter(t=>t.id!==reality.id).map(t=>({taskId:t.id,sameStart:canPlaceTask(adapter.problem,t,placement.start,[placement]),decision:diagnoseTaskPlacement(adapter.problem,t,placement.start,[placement]),domain:exactTaskStartDomain(adapter.problem,t,[placement])}));save(label+'-physical-probes',probes);
   if(label==='counterfactual'){
    const effective=assignments(source).assignments.find(t=>t.taskId===tasks[0].id)!;assert.ok(!effective.effectiveResourceIds.includes(daily(0)));assert.ok(resources.slice(1).every((_,i)=>effective.effectiveResourceIds.includes(daily(i+1))));
    assert.equal(probes.find(p=>p.taskId===`task:${tasks[1].id}`)!.sameStart,false);
    assert.equal(probes.find(p=>p.taskId===`task:${tasks[2].id}`)!.sameStart,true);
    assert.equal(probes.find(p=>p.taskId===`task:${tasks[3].id}`)!.sameStart,false);
    const directPeer={...adapter.problem.tasks.find(t=>t.id===`task:${tasks[2].id}`)!,requiredResourceIds:[`plan-resource:${daily(3)}`]};
    const directConflict=diagnoseTaskPlacement(adapter.problem,directPeer,placement.start,[placement]);save('direct-resource-conflict',directConflict);assert.equal(directConflict.firstRejectionReason,'OVERLAP_REQUIRED_RESOURCE');
   }
  }
  const visual=projectTaskOperationScopes(input.tasks,projected.tasks.map(t=>({taskId:t.id,agendaScope:t.agendaScope,resourceInheritance:t.resourceInheritance,blocksSpace:t.blocksSpace,itinerantTeamId:t.itinerantTeamId??undefined})));
  save('agenda-projection',visual);assert.equal(visual.filter(t=>usesItinerantAgenda(t)).length,1);assert.equal(visual.find(t=>t.id===tasks[0].id)!.spaceId,spaces[0].id);
  assert.deepEqual(input,untouched);save('final-S0',await api(`/api/plans/${planId}/assisted`));
  pass('same native EngineInput: physical exclusivity, fixed camera released, unit and direct kit retained; memory-only');
  return {planId,taskIds:tasks.map(t=>t.id),experimentIsStage:false,remoteWrites:0};
 }finally{await browser.close();}
}
