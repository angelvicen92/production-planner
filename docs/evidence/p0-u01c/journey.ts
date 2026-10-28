/** Diagnostic only. All persisted entities/configuration use the real application API. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {resolveEffectiveTaskResourceAssignments} from '../../../engine/planner-next/integration/effectiveTaskResourceAssignments';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {validateDailyTechnicalChains,requiredPhaseCompositionSupported} from '../../../server/technicalChainStructure';
import {memory} from './memory';

export async function journey({appUrl,users,db,directory,pass}:any){
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const receipts:any[]=[];
 const request=async(path:string,method='GET',body?:unknown)=>{
  const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users.admin.token}`},body:body===undefined?undefined:JSON.stringify(body)});
  const response={status:r.status,body:await r.json() as any};receipts.push({path,method,request:body,response});return response;
 };
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const sqlProbe=async(planId:number,structure:any)=>{
  try{await db.query('SELECT public.assert_daily_technical_chains($1,$2)',[planId,structure]);return {accepted:true};}
  catch(e:any){return {accepted:false,code:e.code,message:e.message};}
 };
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium'});
 const page=await browser.newPage();
 const days:any[]=[];
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'08:00',defaultWorkEnd:'16:00',mealStart:'14:00',mealEnd:'15:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'physical_tools',name:'Physical tools'}),zone=await api('/api/zones','POST',{name:'Production'});
  const spaces:any[]=[];for(const name of ['First phase','Second phase','Third phase','Preparation and closing','Competition A','Competition B','Competition C'])spaces.push(await api('/api/spaces','POST',{name,zoneId:zone.id}));
  const tools:any[]=[];for(const name of ['Tool A','Tool B','Tool C'])tools.push(await api('/api/resource-items','POST',{typeId:type.id,name,defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'12:00'}));
  const general=await api('/api/new-day-planner-configuration');await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0}});
  const tmpl=async(name:string,s:number,d:number,deps:number[]=[],resources:number[]=[],team?:number)=>api('/api/task-templates','POST',{name,defaultDuration:d,spaceId:spaces[s].id,zoneId:zone.id,requiresCoach:false,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:deps,resourceRequirements:{byItem:Object.fromEntries(resources.map(i=>[tools[i].id,1]))},...(team?{itinerantTeamRequirement:'specific',itinerantTeamId:team}:{}),rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}});
  const pre=await tmpl('Preparation',3,5),a=await tmpl('Phase one',0,5,[pre.id],[0,1]),b=await tmpl('Phase two',1,5,[a.id],[0,1]);
  const joint=await tmpl('Joint operation',2,10,[b.id],[1]),last=await tmpl('Single final operation',2,5,[a.id],[2]);
  const commonJoint=await tmpl('Common resource joint',2,10,[b.id],[0,1]),commonLast=await tmpl('Common resource final',2,5,[a.id],[0,2]);
  const closing=await tmpl('Closing joint',3,5,[joint.id]),closingCommon=await tmpl('Closing common joint',3,5,[commonJoint.id]),closingLast=await tmpl('Closing final',3,5,[last.id]),closingCommonLast=await tmpl('Closing common final',3,5,[commonLast.id]);
  const rivals=[await tmpl('Competitor A',4,15,[],[0]),await tmpl('Competitor B',5,10,[],[1]),await tmpl('Competitor C',6,10,[],[2])];
  for(const label of ['common','mixed','impossible']){
   const impossible=label==='impossible',common=label==='common';
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(`2027-03-0${days.length+1}`);const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const response=await pending;assert.equal(response.status(),201);const planId=Number((await response.json()).id);await page.goto('about:blank');
   const path=`/api/plans/${planId}/assisted`,configPath=`/api/plans/${planId}/day-configuration`,viewPath=`/api/plans/${planId}/effective-configuration`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),daily=tools.map(t=>inventory.find((r:any)=>r.resourceItemId===t.id));
   if(impossible)await api(`/api/plans/${planId}/resource-items/${daily[0].id}`,'PATCH',{availabilityStart:'08:00',availabilityEnd:'08:40'});
   const groups:any[][]=[],people:any[]=[];
   for(let i=0;i<3;i++){
    const p=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`Participant ${i+1}`,availabilityStart:'08:00',availabilityEnd:'12:00'});people.push(p);
    const sequence=[pre,a,...(i<2?[b,common?commonJoint:joint,common?closingCommon:closing]:[common?commonLast:last,common?closingCommonLast:closingLast])],tasks=[];
    for(const t of sequence)tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id}));groups.push(tasks);
   }
   const competitors=[];for(let i=0;i<3;i++){
    const independent=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`Independent participant ${i+1}`,availabilityStart:'08:00',availabilityEnd:'12:00'});
    competitors.push(await api('/api/daily-tasks','POST',{planId,templateId:rivals[i].id,contestantId:independent.id,spaceId:rivals[i].spaceId,zoneId:zone.id}));
   }
   const s0=await api(path+'/session','POST',{});save(`${label}-S0`,s0);
   let view=await api(viewPath);
   await api(configPath,'PUT',{jointGroups:{contractVersion:1,groups:[{id:'indivisible',taskIds:groups.slice(0,2).map(g=>g[3].id)}]},expectedRevisionId:view.jointGroups.revisionId});
   view=await api(viewPath);await api(configPath,'PUT',{operationalMealPolicies:{contractVersion:1,policies:[{id:'physical-rest',window:{start:impossible?'08:20':'09:00',end:impossible?'08:35':'09:30'},durationMinutes:15,planResourceItemIds:[daily[0].id,daily[1].id],spaceIds:spaces.slice(0,3).map(s=>s.id)}]},expectedRevisionId:view.operationalMeals.revisionId});
   view=await api(viewPath);const phases=[groups.map(g=>g[1].id),groups.slice(0,2).map(g=>g[2].id),[groups[0][3].id,groups[2][2].id]];
   const policy={id:'required-phases',orderedTaskIds:phases.flat(),phases,adjacency:'REQUIRED',resourceContinuity:'REQUIRED',requiredResourceIds:[daily[0].id]};
   save(`${label}-requested-policy`,policy);
   const before=(await db.query('SELECT to_jsonb(p) row FROM plans p WHERE id=$1',[planId])).rows;
   const rejected=[];
   if(!common){
    for(const ids of [[],[daily[0].id],[daily[1].id],[daily[2].id],[daily[0].id,daily[1].id]]){
     const structure={contractVersion:1,policies:[{...policy,requiredResourceIds:ids}]};
     const apiResult=await request(configPath,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId});
     const sqlResult=await sqlProbe(planId,structure);rejected.push({ids,api:apiResult,sql:sqlResult});assert.equal(apiResult.status,ids.length?422:400);assert.equal(sqlResult.accepted,false);
    }
    assert.deepEqual((await db.query('SELECT to_jsonb(p) row FROM plans p WHERE id=$1',[planId])).rows,before);
    assert.deepEqual((await api(path)).draft,s0.draft);
    save(`${label}-first-rejections`,rejected);
    const alternatives=[];
    for(const [name,policies] of [
     ['split-authorities',phases.map((phase,i)=>({...policy,id:`subunit-${i}`,orderedTaskIds:phase,phases:[phase],requiredResourceIds:[daily[Math.min(i,2)].id]}))],
     ['omit-common-field',[(({requiredResourceIds,...p})=>p)(policy)]],
     ['continuity-OFF',[{...policy,resourceContinuity:'OFF'}]],
    ] as const){alternatives.push({name,...await request(configPath,'PUT',{technicalChains:{contractVersion:1,policies},expectedRevisionId:view.technicalChains.revisionId})});}
    const scope=await request(configPath,'PUT',{taskOperationScopes:{contractVersion:1,policies:[{taskId:groups[0][1].id,agendaScope:'PHYSICAL_SPACE',resourceInheritance:'OPERATION_ONLY',blocksSpace:true,itinerantUnitId:null,declaredResourceIds:[daily[0].id,daily[1].id]}]},expectedRevisionId:view.technicalChains.revisionId});
    save(`${label}-alternative-A-api`,{alternatives,scope});
   }else await api(configPath,'PUT',{technicalChains:{contractVersion:1,policies:[policy]},expectedRevisionId:view.technicalChains.revisionId});
   const input=await buildEngineInput(planId,storage);save(`${label}-input`,input);save(`${label}-configuration`,await api(viewPath));save(`${label}-effective-resources`,resolveEffectiveTaskResourceAssignments(input));
   if(label==='mixed'){
    await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);const editor=page.getByTestId('daily-technical-chain');await editor.getByRole('button',{name:'Crear cadena técnica',exact:true}).click();await editor.getByLabel('Orden por fases',{exact:true}).check();
    for(let p=0;p<phases.length;p++){
     if(p)await editor.getByRole('button',{name:'Añadir fase',exact:true}).click();
     for(const id of phases[p]){
      const task=view.technicalChains.tasks.find((t:any)=>t.id===id);
      const group=task.jointMemberIds?.length?task.jointMemberIds.map((id:number)=>view.technicalChains.tasks.find((t:any)=>t.id===id).label).join(' + '):task.label;
      await editor.getByLabel(`Fase ${p+1}: ${group}`,{exact:true}).check();
     }
    }
    assert.ok(await editor.getByRole('button',{name:'Guardar cadena técnica',exact:true}).isDisabled());
    assert.equal(await editor.getByLabel(/^Equipo /).count(),0);await editor.screenshot({path:`${directory}/mixed-no-common-resource.png`});
    save('mixed-ui-boundary',{saveDisabled:true,commonResourceOptions:0,phases});await page.goto('about:blank');
   }
   const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
   const stages=[];
   for(let n=0;n<(impossible?1:2);n++){
    const before=await api(path),ids=n===0&&!impossible?[competitors[0].id]:before.draft.tasks.filter((t:any)=>t.startPlanned==null).map((t:any)=>t.taskId);
    const started=await api(path+'/proposals','POST',{...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true});let run:any;
    for(let j=0;j<600;j++){run=await api(`${path}/proposals/${started.runId}`);if(!['pending','running'].includes(run.status))break;await new Promise(r=>setTimeout(r,100));}
    save(`${label}-S${n+1}-run`,run);
    if(impossible){assert.notEqual(run.assisted_result_json?.outcome,'PROPOSAL');assert.equal((await api(path)).history.length,1);break;}
    assert.equal(run.assisted_result_json.outcome,'PROPOSAL');await api(`${path}/proposals/${run.id}/apply`,'POST',expected(before));const draft=await api(path);save(`${label}-S${n+1}-draft`,draft);await api(path+'/validate','POST',expected(draft));const validated=await api(path);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);save(`${label}-S${n+1}-validation`,validated.validation);
    const accepted=await api(path+'/accept-stage','POST',expected(validated));save(`${label}-S${n+1}-accepted`,accepted);stages.push(accepted.activeStage);
    for(const t of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((r:any)=>r.taskId===t.taskId),t);
    save(`${label}-S${n+1}-sql`,(await db.query('SELECT id,ordinal,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE id=$1',[accepted.activeStage.id])).rows[0]);
   }
   if(!common){
    memory(input,policy,competitors[0].id,save,label);
    // SQL aggregate semantics used by the current Stage consumer, read-only.
    save(`${label}-sql-empty-subset-semantics`,(await db.query("SELECT jsonb_agg(v) aggregate, '[]'::jsonb @> jsonb_agg(v) containment FROM jsonb_array_elements('[]'::jsonb) v")).rows[0]);
   }
   days.push({label,planId,obligations:input.tasks.length,representedRequired:common?8:0,stages:stages.length,requiredStage:common,phases,competitorIds:competitors.map(t=>t.id)});pass(label+': authentic API/SQL and memory evidence separated');
  }
  // A configured fixed itinerant unit, independently of any phased authority.
  const team=await api('/api/itinerant-teams','POST',{code:'fixed-unit',name:'Fixed physical composition',resourceItemIds:tools.slice(0,2).map(t=>t.id),availabilityWindows:[{start:'08:00',end:'12:00'}],transitionMinutes:0,isActive:true,orderIndex:0});
  const moving=await tmpl('Team operation',0,5,[],[],team.id),secondTeam=await tmpl('Second team operation',1,5,[moving.id],[],team.id),after=await tmpl('After team',2,5,[secondTeam.id],[2]);
  await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill('2027-03-04');const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const created=await pending;assert.equal(created.status(),201);const planId=Number((await created.json()).id);await page.goto('about:blank');
  const p=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:'Itinerant participant',availabilityStart:'08:00',availabilityEnd:'12:00'});const ids:number[]=[];
  for(const t of [moving,secondTeam,after])ids.push((await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id})).id);
  const input=await buildEngineInput(planId,storage),view=await api(`/api/plans/${planId}/effective-configuration`),unit=input.itinerantTeamAvailability![0];
  const policy={id:'team-to-own-tool',orderedTaskIds:ids,phases:ids.map(id=>[id]),adjacency:'REQUIRED',resourceContinuity:'REQUIRED',requiredResourceIds:[unit.planResourceItemIds![0]]};
  const structure={contractVersion:1,policies:[policy]},rejection=await request(`/api/plans/${planId}/day-configuration`,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId});assert.equal(rejection.status,422);
  let guard:any;try{validateDailyTechnicalChains(input,structure as any);}catch(e:any){guard=e.message;}
  const declared={...input,dailyTechnicalChainsVersion:1 as const,technicalChains:[{...policy,requiredResourceIds:[]}] as any};
  const consumer=adapt(declared);
  save('itinerant-control',{input,effective:resolveEffectiveTaskResourceAssignments(input),rejection,sql:await sqlProbe(planId,structure),guard,requiredPhaseCompositionSupported:requiredPhaseCompositionSupported(declared),consumer});
  const forcedSameUnit=structuredClone(input);Object.assign(forcedSameUnit.tasks.find(t=>t.id===ids.at(-1))!,{itinerantTeamId:unit.itinerantTeamId,itinerantTeamRequirement:'specific',allowedItinerantTeamIds:[unit.itinerantTeamId]});
  save('itinerant-same-unit-counterfactual',{memoryOnly:true,explanation:'Reusing the same fixed unit on the last operation adds all its physical members, rather than expressing their release.',effective:resolveEffectiveTaskResourceAssignments(forcedSameUnit)});
  // Same memory experiment, retaining configured team and real physical members.
  memory(input,policy,ids[0],save,'itinerant');
  save('profile',days);return {days,remoteWrites:0,productChanges:0};
 }finally{save('api-receipts',receipts);await browser.close();}
}
