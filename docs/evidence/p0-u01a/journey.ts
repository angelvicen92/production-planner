/** Causal audit only. Every persisted operation uses the real product API. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {inspect} from '../p0-u00y/consumer';
export async function journey({appUrl,users,db,directory,pass}:any){
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const receipts:any[]=[];
 const request=async(path:string,method='GET',body?:unknown)=>{const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users.admin.token}`},body:body===undefined?undefined:JSON.stringify(body)});const response={status:r.status,body:await r.json() as any};receipts.push({path,method,request:body,response});return response;};
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium'});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});const events:any[]=[];page.on('pageerror',e=>events.push(e.message));
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'08:00',defaultWorkEnd:'16:00',mealStart:'14:00',mealEnd:'15:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'generic_equipment',name:'Shared equipment'}),zone=await api('/api/zones','POST',{name:'Production unit'}),spaces:any[]=[];
  for(const name of ['Phase A','Phase B','Phase C','Individual preparation','Independent work'])spaces.push(await api('/api/spaces','POST',{name,zoneId:zone.id}));
  const kit=await api('/api/resource-items','POST',{typeId:type.id,name:'Shared kit',defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'12:00'});
  const tmpl=async(name:string,s:number,d:number,deps:number[]=[],physical=false)=>api('/api/task-templates','POST',{name,defaultDuration:d,spaceId:spaces[s].id,zoneId:zone.id,requiresCoach:false,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:deps,resourceRequirements:physical?{byItem:{[kit.id]:1}}:{},rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}});
  const pre=await tmpl('Preparation',3,5),a=await tmpl('First phase',0,5,[pre.id],true),b=await tmpl('Second phase',1,5,[a.id],true),joint=await tmpl('Synchronized operation',2,10,[b.id],true),last=await tmpl('Final independent member',2,5,[a.id],true),postJ=await tmpl('Closing after joint',3,5,[joint.id]),postLast=await tmpl('Closing after single',3,5,[last.id]),competition=await tmpl('Independent competitor',4,15,[],true);
  const general=await api('/api/new-day-planner-configuration');await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0}});
  const days:any[]=[];
  for(const impossible of [false,true]){
   const label=impossible?'impossible':'integrated';
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(impossible?'2027-02-03':'2027-02-02');const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const created=await pending;assert.equal(created.status(),201);const planId=Number((await created.json()).id),path=`/api/plans/${planId}/assisted`,configPath=`/api/plans/${planId}/day-configuration`,viewPath=`/api/plans/${planId}/effective-configuration`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),dailyKit=inventory.find((r:any)=>r.resourceItemId===kit.id);
   if(impossible)await api(`/api/plans/${planId}/resource-items/${dailyKit.id}`,'PATCH',{availabilityStart:'08:00',availabilityEnd:'08:40'});
   const people:any[]=[],groups:any[][]=[];
   for(let i=0;i<3;i++){
    const p=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`Participant ${i+1}`,availabilityStart:'08:00',availabilityEnd:'12:00'});people.push(p);const tasks=[];
    for(const t of [pre,a,...(i<2?[b,joint,postJ]:[last,postLast])])tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id}));groups.push(tasks);
   }
   const rival=await api('/api/daily-tasks','POST',{planId,templateId:competition.id,contestantId:people[2].id,spaceId:competition.spaceId,zoneId:zone.id});
   const s0=await api(path+'/session','POST',{});save(`${label}-S0`,s0);
   let view=await api(viewPath);
   await api(configPath,'PUT',{jointGroups:{contractVersion:1,groups:[{id:'synchronized-operation',taskIds:groups.slice(0,2).map(g=>g[3].id)}]},expectedRevisionId:view.jointGroups.revisionId});
   view=await api(viewPath);await api(configPath,'PUT',{operationalMealPolicies:{contractVersion:1,policies:[{id:'physical-rest',window:{start:impossible?'08:20':'09:00',end:impossible?'08:35':'09:30'},durationMinutes:15,planResourceItemIds:[dailyKit.id],spaceIds:[spaces[0].id,spaces[1].id,spaces[2].id]}]},expectedRevisionId:view.operationalMeals.revisionId});
   view=await api(viewPath);save(`${label}-configuration`,view);
   const input=await buildEngineInput(planId,storage);save(`${label}-input`,input);
   const phases=[groups.map(g=>g[1].id),groups.slice(0,2).map(g=>g[2].id),[groups[0][3].id,groups[2][2].id]];
   const policy={id:'required-unit',orderedTaskIds:phases.flat(),phases,adjacency:'REQUIRED',resourceContinuity:'REQUIRED',requiredResourceIds:[dailyKit.id]};save(`${label}-requested-policy`,policy);
   const state=async()=>({plan:(await db.query('SELECT current_config_revision_id,daily_technical_chains,daily_joint_groups,daily_operational_meal_policies FROM plans WHERE id=$1',[planId])).rows[0],revisions:(await db.query('SELECT id,replay_snapshot_json FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id',[planId])).rows,session:await api(path),daily:(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows});
   const before=await state();
   const rejection=await request(configPath,'PUT',{technicalChains:{contractVersion:1,policies:[policy]},expectedRevisionId:view.technicalChains.revisionId});assert.equal(rejection.status,400);assert.match(rejection.body.message,/phases/);save(`${label}-first-api-rejection`,rejection);
   const {phases:omitted,...linear}=policy;const guard=await request(configPath,'PUT',{technicalChains:{contractVersion:1,policies:[linear]},expectedRevisionId:view.technicalChains.revisionId});assert.equal(guard.status,422);assert.equal(guard.body.message,'UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION');save(`${label}-linear-api-rejection`,guard);
   const scopeRejection=await request(configPath,'PUT',{taskOperationScopes:{contractVersion:1,policies:[{taskId:rival.id,agendaScope:'PHYSICAL_SPACE',resourceInheritance:'OPERATION_ONLY',blocksSpace:false,itinerantUnitId:null,declaredResourceIds:[dailyKit.id]}]},expectedRevisionId:view.technicalChains.revisionId});assert.equal(scopeRejection.status,422);assert.equal(scopeRejection.body.message,'UNSUPPORTED_TASK_SCOPE_COMBINATION');save(`${label}-scope-api-rejection`,scopeRejection);
   assert.deepEqual(await state(),before);save(`${label}-rejection-state-unchanged`,before);
   const sql:any[]=[];for(const structure of [{contractVersion:1,policies:[policy]},{contractVersion:1,policies:[linear]}]){try{await db.query('SELECT public.assert_daily_technical_chains($1,$2)',[planId,structure]);sql.push({accepted:true});}catch(e:any){sql.push({code:e.code,message:e.message});}}save(`${label}-sql-authority-boundary`,sql);assert.ok(sql.every(r=>r.code==='P0001'));
   await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);await page.getByTestId('daily-joint-groups').waitFor();await page.screenshot({path:`${directory}/${label}-configuration.png`,fullPage:true});
   const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
   const poll=async(id:number)=>{for(let i=0;i<600;i++){const r=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(r.status))return r;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
   const stages:any[]=[];
   for(let n=0;n<(impossible?1:2);n++){
    const before=await api(path),ids=n===0&&!impossible?[rival.id]:before.draft.tasks.filter((t:any)=>t.startPlanned==null).map((t:any)=>t.taskId);
    const started=await api(path+'/proposals','POST',{...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true});const run=await poll(started.runId);save(`${label}-S${n+1}-run`,run);
    if(impossible){assert.notEqual(run.assisted_result_json?.outcome,'PROPOSAL');assert.equal((await api(path)).history.length,1);break;}
    assert.equal(run.assisted_result_json.outcome,'PROPOSAL');const result=run.assisted_result_json;assert.equal(result.evidence.nominalPhysicalFutureWitness.tasks.length,input.tasks.length);
    await api(`${path}/proposals/${run.id}/apply`,'POST',expected(before));const draft=await api(path);save(`${label}-S${n+1}-draft`,draft);await api(path+'/validate','POST',expected(draft));const validated=await api(path);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);save(`${label}-S${n+1}-validation`,validated.validation);
    const accepted=await api(path+'/accept-stage','POST',expected(validated));save(`${label}-S${n+1}-accepted`,accepted);stages.push(accepted.activeStage);
    for(const t of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((r:any)=>r.taskId===t.taskId),t);
    save(`${label}-S${n+1}-sql`,(await db.query('SELECT id,ordinal,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE id=$1',[accepted.activeStage.id])).rows[0]);
   }
   if(!impossible){assert.equal((await api(path)).draft.tasks.filter((t:any)=>t.startPlanned!=null).length,input.tasks.length);save('integrated-final-input',await buildEngineInput(planId,storage));}
   days.push({label,planId,taskCount:input.tasks.length,phases,stages:stages.map(s=>({id:s.id,fingerprint:s.snapshotFingerprint})),rivalId:rival.id});pass(`${label}: authentic API rejection; ${impossible?'material negative':'joint + rest + independent obligations, two genuine Stages without phase authority'}`);
  }
  save('profile',days);return {days,remoteWrites:0,phaseAuthorityAccepted:false};
 }finally{save('api-receipts',receipts);save('browser-events',events);await browser.close();}
}
