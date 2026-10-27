import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {buildEngineInput} from '../../../engine/buildInput';
import {inspect} from './consumer';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {configurationAttacks,certificateAttacks} from './attacks';
export async function nativeJourney({appUrl,url,anon,users,db,directory,pass}:any){
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const receipts:unknown[]=[];
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});const response={status:r.status,body:await r.json() as any};receipts.push({path,method,role,request:body,response});return response;};
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),days:any[]=[];
 const events:any[]=[];page.on('pageerror',(e:any)=>events.push({message:e.message}));page.on('response',(r:any)=>{if(r.status()>=400)events.push({status:r.status(),path:new URL(r.url()).pathname});});page.on('requestfailed',(r:any)=>events.push({path:new URL(r.url()).pathname,failure:r.failure()}));
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'09:00',defaultWorkEnd:'17:00',mealStart:'14:00',mealEnd:'15:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'u00y_equipment',name:'Joint physical equipment'}),coachType=await api('/api/resource-types','POST',{code:'vocal_coach',name:'Vocal coach'});
  for(const [index,label] of ['A','B'].entries()){
   const start=index?'10:00':'09:00',end=index?'13:30':'11:45';
   const zone=await api('/api/zones','POST',{name:`${label} production`}),spaces:any[]=[];
   for(const name of ['Preparation','Shared operation','Finishing','Main'])spaces.push(await api('/api/spaces','POST',{name:`${label} ${name}`,zoneId:zone.id}));
   const kit=await api('/api/resource-items','POST',{typeId:type.id,name:`${label} common kit`,defaultAvailabilityStart:start,defaultAvailabilityEnd:end}),coach=await api('/api/resource-items','POST',{typeId:coachType.id,name:`${label} coach`,defaultAvailabilityStart:start,defaultAvailabilityEnd:end});
   const tmpl=async(name:string,kind:string,s:number,d:number,deps:number[]=[],req:any={})=>api('/api/task-templates','POST',{name:`${label} ${name}`,defaultDuration:d,spaceId:spaces[s].id,zoneId:zone.id,requiresCoach:kind==='main'||kind==='vocal',participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:deps,resourceRequirements:req,rulesJson:{plannerNextOperation:{contractVersion:1,kind}}});
   const pre=await tmpl('Individual preparation',index?'vocal':'auxiliary',0,index?10:5),main=index?await tmpl('Main','main',3,15,[pre.id]):null;
   const joint=await tmpl('Shared activity','auxiliary',1,10,[main?.id??pre.id],{byItem:{[kit.id]:1}}),second=await tmpl('Following activity','auxiliary',2,5,[joint.id],{byItem:{[kit.id]:1}}),post=index?await tmpl('Individual closing','auxiliary',0,5,[second.id]):null,competitor=await tmpl('Physical competitor','auxiliary',1,15,[],{byItem:{[kit.id]:1}});
   const general=await api('/api/new-day-planner-configuration');await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:index?'MAIN_WITH_VOCAL_FEEDER':'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0,...(index?{mainFlow:{spaceId:spaces[3].id,preferredEnd:'12:00',continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1}}:{})}});
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(index?'2027-11-19':'2027-11-03');
   const creating=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const created=await creating;assert.equal(created.status(),201);const planId=Number((await created.json()).id),path=`/api/plans/${planId}/assisted`,configPath=`/api/plans/${planId}/day-configuration`,viewPath=`/api/plans/${planId}/effective-configuration`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),dailyCoach=inventory.find((r:any)=>r.resourceItemId===coach.id);
   const people:any[]=[],groups:any[][]=[];
   for(const i of [0,1]){
    const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`${label} participant ${i+1}`,availabilityStart:i?index?'10:10':'09:15':start,availabilityEnd:i?end:index?'13:00':'11:30',...(index?{vocalCoachPlanResourceItemId:dailyCoach.id}:{})});people.push(person);
    const tasks=[];for(const t of [pre,...(main?[main]:[]),joint,second,...(post?[post]:[])])tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:person.id,spaceId:t.spaceId,zoneId:zone.id}));groups.push(tasks);
   }
   const competition=await api('/api/daily-tasks','POST',{planId,templateId:competitor.id,contestantId:people[0].id,spaceId:competitor.spaceId,zoneId:zone.id});
   const ordinary=await buildEngineInput(planId,storage);save(`${label}-ordinary-input`,ordinary);const s0=await api(path+'/session','POST',{});save(`${label}-S0`,s0);
   const groupIndex=index?2:1,policies=[{id:`${label}-joint-1`,taskIds:groups.map(g=>g[groupIndex].id)},...(index?[{id:`${label}-joint-2`,taskIds:groups.map(g=>g[groupIndex+1].id)}]:[])];
   const saveUI=async(policy:any)=>{
    await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);const editor=page.getByTestId('daily-joint-groups');await editor.getByRole('button',{name:'Crear operación conjunta',exact:true}).click();
    for(const id of policy.taskIds){const view=await api(viewPath),task=view.jointGroups.tasks.find((t:any)=>t.id===id);await editor.getByLabel(`Miembro conjunto ${task.label}`,{exact:true}).check();}
    const saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar operación conjunta',exact:true}).click();const saved=await saving;assert.equal(saved.status(),200,await saved.text());
    await page.reload();await editor.getByTestId('joint-operation').last().waitFor();save(`${label}-declaration-${policy.id}`,await api(viewPath));
   };
   for(const policy of policies)await saveUI(policy);
   if(!index){
    const editor=page.getByTestId('daily-joint-groups');
    const editMembers=async(ids:number[])=>{
     await editor.getByRole('button',{name:'Editar operación conjunta 1',exact:true}).click();
     for(const input of await editor.locator('input[type=checkbox]').all())if(await input.isChecked())await input.uncheck();
     const view=await api(viewPath);for(const id of ids)await editor.getByLabel(`Miembro conjunto ${view.jointGroups.tasks.find((t:any)=>t.id===id).label}`,{exact:true}).check();
     const saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Guardar operación conjunta',exact:true}).click();assert.equal((await saving).status(),200);await page.reload();await editor.getByTestId('joint-operation').waitFor();
    };
    await editMembers(groups.map(g=>g[0].id));await editMembers(policies[0].taskIds);
    const removing=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Retirar operación conjunta 1',exact:true}).click();assert.equal((await removing).status(),200);await page.reload();assert.equal((await api(viewPath)).jointGroups.authority.groups.length,0);await saveUI(policies[0]);
   }
   // UI-generated opaque identities are the effective authority, never inferred by labels.
   await configurationAttacks({planId,db,storage,api,request,url,anon,users,save:(n:string,v:unknown)=>save(`${label}-${n}`,v)});
   const view=await api(viewPath),authority=view.jointGroups.authority;save(`${label}-configuration`,view);await page.getByTestId('daily-joint-groups').screenshot({path:`${directory}/${label}-configuration.png`});
   const input=await buildEngineInput(planId,storage);save(`${label}-input`,input);save(`${label}-authority-row`,(await db.query('SELECT current_config_revision_id,planner_next_profile,planner_next_configuration,daily_joint_groups FROM plans WHERE id=$1',[planId])).rows[0]);save(`${label}-revision`,(await db.query('SELECT * FROM plan_config_revisions WHERE plan_id=$1 AND id=(SELECT current_config_revision_id FROM plans WHERE id=$1)',[planId])).rows[0]);save(`${label}-consumer`,inspect(input));
   const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
   const poll=async(id:number)=>{for(let i=0;i<600;i++){const r=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(r.status))return r;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
   const stages:any[]=[];
   for(let stage=0;stage<(index?2:1);stage++){
    const before=await api(path),ids=index&&stage===0?[policies[0].taskIds[0]]:before.draft.tasks.filter((t:any)=>t.startPlanned==null).map((t:any)=>t.taskId);
    const started=await api(path+'/proposals','POST',{...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true}),run=await poll(started.runId);save(`${label}-S${stage+1}-run`,run);assert.equal(run.assisted_result_json.outcome,'PROPOSAL');
    const result=run.assisted_result_json,witness=result.evidence.nominalPhysicalFutureWitness;assert.equal(witness.tasks.length,input.tasks.length);
    for(const g of authority.groups){const members=g.taskIds.map((id:number)=>witness.tasks.find((t:any)=>t.id===`task:${id}`));assert.ok(members.every((t:any)=>t.start===members[0].start&&t.end===members[0].end&&t.spaceId===members[0].spaceId));}
    if(index&&stage===0)for(const id of policies[1].taskIds)assert.equal(result.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===id).startPlanned,null);
    await api(`${path}/proposals/${run.id}/apply`,'POST',expected(before));const draft=await api(path);save(`${label}-S${stage+1}-draft`,draft);
    await certificateAttacks({planId,db,run,draft,authority,competitionId:competition.id,save:(n:string,v:unknown)=>save(`${label}-S${stage+1}-${n}`,v)});
    await api(path+'/validate','POST',expected(draft));const validated=await api(path);save(`${label}-S${stage+1}-validation`,validated.validation);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
    const accepted=await api(path+'/accept-stage','POST',expected(validated));save(`${label}-S${stage+1}-accepted`,accepted);stages.push(accepted.activeStage);
    for(const t of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((r:any)=>r.taskId===t.taskId),t);
    const sql=(await db.query('SELECT id,ordinal,config_revision_id,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE id=$1 AND plan_id=$2',[accepted.activeStage.id,planId])).rows[0];assert.deepEqual(sql.snapshot_json,accepted.activeStage.snapshotJson);save(`${label}-S${stage+1}-sql`,sql);save(`${label}-S${stage+1}-daily`,(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
    const forged=structuredClone(sql.snapshot_json);forged.tasks.find((t:any)=>t.startPlanned!=null).assignedResourceIds=[2147483647];
    let failure:any;await db.query('BEGIN');try{await db.query('SET LOCAL ROLE service_role');await db.query('UPDATE assisted_planning_stages SET snapshot_json=$2,snapshot_fingerprint=$3 WHERE id=$1',[sql.id,forged,fingerprintAssistedPlanningSnapshotV1(forged)]);}catch(e:any){failure={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}assert.ok(failure);save(`${label}-S${stage+1}-immutable-stage-forgery`,{...failure,hashRecomputed:true,rolledBack:true});

   }
   assert.equal((await api(path)).draft.tasks.filter((t:any)=>t.startPlanned!=null).length,input.tasks.length);
   const effective=await api(viewPath),denied=await request(configPath,'PUT',{jointGroups:{contractVersion:1,groups:[]},expectedRevisionId:effective.jointGroups.revisionId});assert.equal(denied.status,409);save(`${label}-protected-retire`,denied);
   save(`${label}-rollback`,await api(path+'/rollback','POST',{targetStageId:s0.activeStage.id}));for(const s of stages)save(`${label}-redo-${s.ordinal}`,await api(path+'/redo','POST',{targetStageId:s.id}));
   save(`${label}-reconstructed`,{input:await buildEngineInput(planId,storage),view:await api(viewPath),session:await api(path)});
   days.push({planId,authority,stages:stages.map(s=>({id:s.id,fingerprint:s.snapshotFingerprint})),taskCount:input.tasks.length,mainVocalIntegration:!!index,competitionId:competition.id});pass(`${label}: UI-authored joint groups through real Stage and continuation`);
  }
  return {days,remoteWrites:0};
 }finally{save('api-receipts',receipts);save('browser-events',events);save('browser-final',{url:page.url(),text:await page.locator('body').innerText().catch(()=>null)});await page.screenshot({path:`${directory}/browser-final.png`}).catch(()=>{});await browser.close();}
}
