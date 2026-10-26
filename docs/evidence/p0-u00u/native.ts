import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope,expandVisiblePrerequisites,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {exactTaskStartDomain} from '../../../engine/planner-next/placement';
import {attacks,atomicityAttack} from './attacks';
type User={id:string;email:string;password:string;token:string};
export async function journey({appUrl,url,anon,users,db,directory,pass}:{appUrl:string;url:string;anon:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(s:string)=>void}){
 assert.equal((db as any).host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(name:string,v:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(v,null,2));
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json() as any};};
 const api=async(path:string,method='GET',body?:unknown,role='admin')=>{const r=await request(path,method,body,role);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
 const poll=async(path:string,id:number)=>{for(let i=0;i<600;i++){const r=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(r.status))return r;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),days:any[]=[];
 page.on('pageerror',error=>save('browser-error',{message:error.message,stack:error.stack}));
 try{
  await page.goto(appUrl+'/login',{waitUntil:'domcontentloaded'});await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'16:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'u00u_physical',name:'U00u physical equipment'}),coachType=await api('/api/resource-types','POST',{code:'vocal_coach',name:'Vocal Coach'});
  for(const [index,label] of ['A','B'].entries()){
   const zone=await api('/api/zones','POST',{name:`U00u ${label} production`}),spaces:any[]=[],templates:any[]=[];
   for(const name of ['Physical main','Voice preparation','Before location','After location','Competing operation'])spaces.push(await api('/api/spaces','POST',{name:`${label} ${name}`,zoneId:zone.id}));
   const members=[];for(const name of ['Camera','Sound'])members.push(await api('/api/resource-items','POST',{typeId:type.id,name:`${label} ${name}`,defaultAvailabilityStart:'09:00',defaultAvailabilityEnd:index?'12:30':'12:00'}));
   const coach=await api('/api/resource-items','POST',{typeId:coachType.id,name:`${label} coach`,defaultAvailabilityStart:'09:00',defaultAvailabilityEnd:'12:30'});
   const unit=await api('/api/itinerant-teams','POST',{code:`U00U_${label}`,name:`${label} nominal unit`,resourceItemIds:members.map(m=>m.id),availabilityWindows:[{start:'09:00',end:index?'12:30':'12:00'}],transitionMinutes:15,isActive:true,orderIndex:index});
   const durations=index?[10,20,10,10,15]:[10,15,15,15,15];
   for(const [n,kind] of ['vocal','main','auxiliary','auxiliary','auxiliary'].entries()){
    const space=spaces[[1,0,2,3,4][n]];
    templates.push(await api('/api/task-templates','POST',{name:`${label} ${['Voice','Main','Before','After','Independent'][n]}`,defaultDuration:durations[n],spaceId:space.id,zoneId:zone.id,requiresCoach:n<2,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:n===1?[templates[0].id]:n===3?[templates[2].id]:[],itinerantTeamRequirement:n===4?'specific':'none',itinerantTeamId:n===4?unit.id:null,rulesJson:{plannerNextOperation:{contractVersion:1,kind}}}));
   }
   const general=await api('/api/new-day-planner-configuration');
   await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'MAIN_WITH_VOCAL_FEEDER',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0,mainFlow:{spaceId:spaces[0].id,preferredEnd:index?'12:15':'12:00',continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1}}});
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(index?'2027-07-06':'2027-07-01');
   const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const created=await pending;assert.equal(created.status(),201);const day=await created.json(),planId=Number(day.id),path=`/api/plans/${planId}/assisted`,configPath=`/api/plans/${planId}/day-configuration`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),dailyCoach=inventory.find((r:any)=>r.resourceItemId===coach.id);assert.ok(dailyCoach);
   const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`${label} participant`,vocalCoachPlanResourceItemId:dailyCoach.id,availabilityStart:'09:00',availabilityEnd:index?'12:30':'12:00'});
   const tasks:any[]=[];for(const t of templates)tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:person.id,spaceId:t.spaceId,zoneId:zone.id}));
   if(index)await api(`/api/plans/${planId}/spaces/${spaces[0].id}/availability`,'PATCH',{availabilityStart:'10:00',availabilityEnd:'12:30'});
   const before=await buildEngineInput(planId,storage),ordinary=adapt(before);save(`${label}-ordinary-input`,before);assert.equal(ordinary.status,'SUPPORTED');if(ordinary.status!=='SUPPORTED')throw Error('unsupported');
   save(`${label}-ordinary-result`,execute(buildAssistedProblem(ordinary.problem,resolveAssistedScope(before,ordinary,{kind:'TASK_IDS',taskIds:tasks.map(t=>t.id)}).scope,[])));
   const s0=await api(path+'/session','POST',{});save(`${label}-S0`,s0);
   await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);const editor=page.getByTestId('daily-anchored-accompaniment');await editor.waitFor();
   await editor.getByRole('button',{name:'Crear operación anclada',exact:true}).click();
   await editor.getByLabel('Actividad principal anclada',{exact:true}).selectOption(String(tasks[1].id));
   await editor.getByLabel('Segmento anterior al Main',{exact:true}).selectOption(String(tasks[2].id));await editor.getByLabel('Segmento posterior al Main',{exact:true}).selectOption(String(tasks[3].id));
   const effectiveBefore=await api(`/api/plans/${planId}/effective-configuration`),dailyUnit=effectiveBefore.anchoredAccompaniments.units.find((u:any)=>u.name===unit.name);assert.ok(dailyUnit);
   await editor.getByLabel('Unidad de la operación anclada',{exact:true}).selectOption(String(dailyUnit.id));
   const saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar operación anclada',exact:true}).click();const saved=await saving;assert.equal(saved.status(),200,await saved.text());
   save(`${label}-immediate-authority`,(await db.query('SELECT daily_anchored_accompaniments,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows);
   save(`${label}-immediate-input`,await buildEngineInput(planId,storage));save(`${label}-immediate-view`,await api(`/api/plans/${planId}/effective-configuration`));
   await page.reload({waitUntil:'domcontentloaded'});await editor.getByText(/Operación anclada efectiva y versionada/).waitFor();await editor.screenshot({path:`${directory}/${label}-configuration.png`});
   let effective=await api(`/api/plans/${planId}/effective-configuration`),structure=effective.anchoredAccompaniments.authority;
   save(`${label}-legal-retire`,await api(configPath,'PUT',{anchoredAccompaniments:{contractVersion:1,policies:[]},expectedRevisionId:effective.anchoredAccompaniments.revisionId},'production'));
   effective=await api(`/api/plans/${planId}/effective-configuration`);assert.equal(effective.anchoredAccompaniments.authority.policies.length,0);
   save(`${label}-legal-restore`,await api(configPath,'PUT',{anchoredAccompaniments:structure,expectedRevisionId:effective.anchoredAccompaniments.revisionId},'production'));
   effective=await api(`/api/plans/${planId}/effective-configuration`);
   const racing=structuredClone(structure);racing.policies[0].id+='-edited';
   const race=await Promise.all([0,1].map(()=>request(configPath,'PUT',{anchoredAccompaniments:racing,expectedRevisionId:effective.anchoredAccompaniments.revisionId})));
   save(`${label}-concurrent-edit`,race);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
   effective=await api(`/api/plans/${planId}/effective-configuration`);structure=effective.anchoredAccompaniments.authority;save(`${label}-effective`,effective);
   const input=await buildEngineInput(planId,storage),adapted=adapt(input);save(`${label}-input`,input);save(`${label}-adapter`,adapted);assert.equal(adapted.status,'SUPPORTED');if(adapted.status!=='SUPPORTED')throw Error('unsupported');
   await atomicityAttack({db,storage,planId,input,structure,actorId:users.admin.id,save:(n,v)=>save(`${label}-${n}`,v)});
   for(const role of ['admin','production','viewer','aux','norole']){
    const beforeRow=(await db.query('SELECT daily_anchored_accompaniments,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows;
    const r=await fetch(`${url}/rest/v1/plans?id=eq.${planId}`,{method:'PATCH',headers:{apikey:anon,Authorization:`Bearer ${users[role].token}`,'Content-Type':'application/json'},body:JSON.stringify({daily_anchored_accompaniments:null})});
    save(`${label}-data-api-${role}`,{status:r.status,body:await r.json()});assert.ok([400,401,403].includes(r.status));
    assert.deepEqual((await db.query('SELECT daily_anchored_accompaniments,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows,beforeRow);
   }
   if(index)for(const [name,change] of [['foreign-unit',(p:any)=>p.itinerantUnitId=days[0].structure.policies[0].itinerantUnitId],['foreign-task',(p:any)=>p.beforeTaskIds=[days[0].taskIds[2]]]] as const){const bad=structuredClone(structure);change(bad.policies[0]);const denied=await request(configPath,'PUT',{anchoredAccompaniments:bad,expectedRevisionId:effective.anchoredAccompaniments.revisionId});save(`B-${name}`,denied);assert.equal(denied.status,422);}
   save(`${label}-revisions`,(await db.query('SELECT * FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id',[planId])).rows);
   const stale=await request(configPath,'PUT',{anchoredAccompaniments:{contractVersion:1,policies:[]},expectedRevisionId:effectiveBefore.anchoredAccompaniments.revisionId});save(`${label}-stale`,stale);assert.equal(stale.status,409);
   for(const role of ['viewer','aux','norole','anonymous']){const denied=await request(configPath,'PUT',{anchoredAccompaniments:{contractVersion:1,policies:[]},expectedRevisionId:effective.anchoredAccompaniments.revisionId},role);save(`${label}-role-${role}`,denied);assert.equal(denied.status,role==='anonymous'?401:403);}
   for(const [name,change] of [['missing',(p:any)=>p.afterTaskIds=[]],['duplicate',(p:any)=>p.afterTaskIds=p.beforeTaskIds],['contradictory-order',(p:any)=>{[p.beforeTaskIds,p.afterTaskIds]=[p.afterTaskIds,p.beforeTaskIds];}],['unknown-unit',(p:any)=>p.itinerantUnitId=2147483647],['unknown-task',(p:any)=>p.beforeTaskIds=[2147483647]]] as const){const bad=structuredClone(structure);change(bad.policies[0]);const denied=await request(configPath,'PUT',{anchoredAccompaniments:bad,expectedRevisionId:effective.anchoredAccompaniments.revisionId});save(`${label}-negative-${name}`,denied);assert.ok([400,409,422].includes(denied.status));}
   const stages=[];
   for(const [stage,ids] of (index?[[tasks[1].id],[tasks[4].id]]:[tasks.map(t=>t.id)]).entries()){
    const state=await api(path),req={...expected(state),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true};save(`${label}-S${stage+1}-request`,req);
    const run=await poll(path,(await api(path+'/proposals','POST',req)).runId);save(`${label}-S${stage+1}-run`,run);assert.equal(run.assisted_result_json.outcome,'PROPOSAL');
    const result=run.assisted_result_json;
    const editing=await request(configPath,'PUT',{anchoredAccompaniments:{contractVersion:1,policies:[]},expectedRevisionId:effective.anchoredAccompaniments.revisionId});save(`${label}-S${stage+1}-pending-proposal-edit`,editing);assert.equal(editing.status,409);
    await attacks({db,storage,planId,input,snapshot:result.proposedDraftSnapshot,revision:run.config_revision_id,save:(n,v)=>save(`${label}-S${stage+1}-${n}`,v)});
    if(index&&stage===0){
     const resolution=expandVisiblePrerequisites(input,resolveAssistedScope(input,adapted,{kind:'TASK_IDS',taskIds:ids}),adapted);
     const scoped=buildAssistedProblem(adapted.problem,resolution.scope,[],analyticalFutureEligibleTaskIds(input,adapted.identityMap));const replay=execute(scoped);save('B-replay',replay);assert.equal(replay.evidence.fingerprint,result.evidence.fingerprint);
     const competitor=adapted.problem.tasks.find(t=>t.id===`task:${tasks[4].id}`)!,domain=exactTaskStartDomain(adapted.problem,competitor,[...replay.proposal!]);save('B-future-witness',{contextOnly:true,taskId:competitor.id,start:[...domain.starts()][0],duration:competitor.duration,domainSize:domain.eligibleStartCount});assert.ok(domain.eligibleStartCount>0);
     assert.equal(result.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===tasks[4].id).startPlanned,null);
    }
    await api(path+`/proposals/${run.id}/apply`,'POST',expected(state));const draft=await api(path);save(`${label}-S${stage+1}-draft`,draft);
    await api(path+'/validate','POST',expected(draft));const validated=await api(path);save(`${label}-S${stage+1}-validation`,validated.validation);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
    const accepted=await api(path+'/accept-stage','POST',expected(validated));save(`${label}-S${stage+1}-accepted`,accepted);stages.push(accepted.activeStage);
    for(const t of state.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((r:any)=>r.taskId===t.taskId),t);
    save(`${label}-S${stage+1}-sql`,(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
    await page.goto(`${appUrl}/plans/${planId}?tab=planning`);await page.getByTestId('assisted-workspace').waitFor();await page.screenshot({path:`${directory}/${label}-S${stage+1}.png`,fullPage:true});
   }
   const denied=await request(configPath,'PUT',{anchoredAccompaniments:{contractVersion:1,policies:[]},expectedRevisionId:effective.anchoredAccompaniments.revisionId});save(`${label}-protected-removal`,denied);assert.equal(denied.status,409);
   const rollback=await api(path+'/rollback','POST',{targetStageId:s0.activeStage.id});save(`${label}-rollback`,rollback);
   for(const st of stages)save(`${label}-redo-${st.ordinal}`,await api(path+'/redo','POST',{targetStageId:st.id}));
   await page.reload();save(`${label}-reconstructed`,await api(path));
   days.push({label,planId,taskIds:tasks.map(t=>t.id),structure,stages:stages.map(s=>({id:s.id,fingerprint:s.snapshotFingerprint}))});pass(`${label}: native UI declaration, proposal, Draft, validation, Stage, SQL and browser reload`);
  }
  return {days,mode:'NATIVE_PRODUCT_STAGES',remoteWrites:0};
 }finally{await browser.close();}
}
