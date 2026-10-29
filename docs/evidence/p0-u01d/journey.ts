/** Native composition gate. Every persisted operation uses the real product API. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {buildCanonicalPlanConfig} from '../../../server/dayConfigurationService';
import {validateDailyTechnicalChains} from '../../../server/technicalChainStructure';
import {buildEngineInput} from '../../../engine/buildInput';
import {resolveEffectiveTaskResourceAssignments} from '../../../engine/planner-next/integration/effectiveTaskResourceAssignments';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {certificateAttacks} from './attacks';
import {requiredFunctionBodies} from '../../../script/demo/a2Preflight';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
export async function journey({appUrl,users,db,directory,pass}:any){
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const catalogChecks:any[]=[];
 for(const [name,expected] of requiredFunctionBodies(false)){
  const definitions=(await db.query("SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1",[name])).rows;
  assert.ok(definitions.some((d:any)=>{const m=d.definition.match(/\bAS\s+(\$\w*\$)([\s\S]*)/i);return m&&m[2].slice(0,m[2].indexOf(m[1])).trim()===expected;}),name);
  catalogChecks.push({name,exactBody:true});
 }
 save('sql-catalog',catalogChecks);
 const receipts:any[]=[];
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});const response={status:r.status,body:await r.json() as any};receipts.push({path,method,request:body,response});return response;};
 // Historical baseline probes keep their original HTTP contract.
 const versionedResourceWindows=(await db.query("SELECT to_regprocedure('public.guard_resource_availability_operation()') IS NOT NULL present")).rows[0].present;
 const api=async(path:string,method='GET',body?:unknown)=>{
  if(versionedResourceWindows&&method==='PATCH'&&/^\/api\/plans\/\d+\/resource-items\/\d+$/.test(path)&&body&&typeof body==='object'&&'availabilityStart' in body){
   const revision=await request(path.replace(/\/resource-items\/\d+$/,'/day-configuration/refresh'));assert.equal(revision.status,200);body={...body,expectedRevisionId:revision.body.revisionId};
  }
 const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium'});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});await page.addInitScript(()=>{crypto.randomUUID=()=> '87f00000-0000-4000-8000-000000000001';});const events:any[]=[];page.on('pageerror',e=>events.push(e.message));
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
  const b2=await tmpl('Different middle operation',1,5,[a.id],[0,2]),j2=await tmpl('Different joint operation',2,10,[b2.id],[1]),post2=await tmpl('Different closing',3,5,[j2.id]);
  const days:any[]=[];
  for(const label of ['mixed','second','common','impossible']){
   const impossible=label==='impossible',second=label==='second',common=label==='common';
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill('2027-04-'+({mixed:'02',second:'03',common:'04',impossible:'05'}[label]));const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear día',exact:true}).click();const created=await pending;assert.equal(created.status(),201);const planId=Number((await created.json()).id),path=`/api/plans/${planId}/assisted`,configPath=`/api/plans/${planId}/day-configuration`,viewPath=`/api/plans/${planId}/effective-configuration`;
   const inventory=await api(`/api/plans/${planId}/resource-items`),daily=tools.map(t=>inventory.find((r:any)=>r.resourceItemId===t.id));
   if(impossible)await api(`/api/plans/${planId}/resource-items/${daily[0].id}`,'PATCH',{availabilityStart:'08:00',availabilityEnd:'08:40'});
   const groups:any[][]=[],people:any[]=[];
   for(let i=0;i<(second?2:3);i++){
    const p=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`Participant ${i+1}`,availabilityStart:'08:00',availabilityEnd:'12:00'});people.push(p);
    const sequence=[pre,a,...(i<2?(second?[b2,j2,post2]:[b,common?commonJoint:joint,common?closingCommon:closing]):[common?commonLast:last,common?closingCommonLast:closingLast])],tasks=[];
    for(const t of sequence)tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:zone.id}));groups.push(tasks);
   }
   const competitors=[];for(let i=0;i<(second?2:3);i++){
    const independent=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`Independent participant ${i+1}`,availabilityStart:'08:00',availabilityEnd:'12:00'});
    competitors.push(await api('/api/daily-tasks','POST',{planId,templateId:rivals[i].id,contestantId:independent.id,spaceId:rivals[i].spaceId,zoneId:zone.id}));
   }
   const s0=await api(path+'/session','POST',{});save(`${label}-S0`,s0);
   let view=await api(viewPath);
   const basePhases=[groups.map(g=>g[1].id),groups.slice(0,2).map(g=>g[2].id),[groups[0][3].id,...(groups[2]?[groups[2][2].id]:[])]];
   const phases=second?[basePhases[0],[groups[0][3].id,...basePhases[1]]]:basePhases;
   const policy={id:'required-unit',orderedTaskIds:phases.flat(),phases,adjacency:'REQUIRED',resourceContinuity:'REQUIRED',requiredResourceIds:common?[daily[0].id]:[]};save(`${label}-requested-policy`,policy);
   if(second){const early=await request(configPath,'PUT',{technicalChains:{contractVersion:1,policies:[policy]},expectedRevisionId:view.technicalChains.revisionId},'production');assert.equal(early.status,200);view=await api(viewPath);}

   await api(configPath,'PUT',{jointGroups:{contractVersion:1,groups:[{id:'synchronized-operation',taskIds:groups.slice(0,2).map(g=>g[3].id)}]},expectedRevisionId:view.jointGroups.revisionId});
   view=await api(viewPath);await api(configPath,'PUT',{operationalMealPolicies:{contractVersion:1,policies:[{id:'physical-rest',window:{start:impossible?'08:20':'09:00',end:impossible?'08:35':'09:30'},durationMinutes:15,planResourceItemIds:[daily[0].id,daily[1].id],spaceIds:[spaces[0].id,spaces[1].id,spaces[2].id]}]},expectedRevisionId:view.operationalMeals.revisionId});
   view=await api(viewPath);save(`${label}-configuration`,view);
   if(label==='mixed'){
    const failures=[];
    for(const mode of ['omitted','null','unknown','false-common']){
     const bad:any={...policy};
     if(mode==='omitted')delete bad.requiredResourceIds;
     if(mode==='null')bad.requiredResourceIds=null;
     if(mode==='unknown')bad.requiredResourceIds=[2147483647];
     if(mode==='false-common')bad.requiredResourceIds=[daily[0].id];
     const structure={contractVersion:1,policies:[bad]},response=await request(configPath,'PUT',{technicalChains:structure,expectedRevisionId:view.technicalChains.revisionId});
     assert.equal(response.status,mode==='false-common'?422:mode==='unknown'?422:400);
     let error:any;try{await db.query('SELECT assert_daily_technical_chains($1,$2)',[planId,structure]);}catch(e:any){error={code:e.code,message:e.message};}
     assert.equal(error?.code,'P0001');failures.push({mode,response,sql:error});
    }
    save('contract-negatives',failures);
   }
   const input=await buildEngineInput(planId,storage);save(`${label}-input`,input);
   // Save phases through the existing editor for the integrated day; API for
   // the other topologies exercises exactly the same versioned writer.
   if(label==='mixed'){
    await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);
    const editor=page.getByTestId('daily-technical-chain');await editor.getByRole('button',{name:'Crear cadena técnica',exact:true}).click();
    await editor.getByLabel('Orden por fases',{exact:true}).check();
    for(let p=0;p<phases.length;p++){
     if(p)await editor.getByRole('button',{name:'Añadir fase',exact:true}).click();
     for(const id of phases[p]){
      const task=view.technicalChains.tasks.find((t:any)=>t.id===id);
      const group=task.jointMemberIds?.length?task.jointMemberIds.map((id:number)=>view.technicalChains.tasks.find((t:any)=>t.id===id).label).join(' + '):task.label;
      await editor.getByLabel(`Fase ${p+1}: ${group}`,{exact:true}).check();
     }
    }
    assert.equal(await editor.getByLabel(/^Equipo /).count(),0);
    assert.equal(await editor.getByRole('button',{name:'Guardar cadena técnica',exact:true}).isEnabled(),true);
    assert.ok(await editor.getByText('Sin recurso común declarado.',{exact:false}).isVisible());
    const saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');
    await editor.getByRole('button',{name:'Guardar cadena técnica',exact:true}).click();{const response=await saving;assert.equal(response.status(),200,await response.text());};
   }else if(!second)await api(configPath,'PUT',{technicalChains:{contractVersion:1,policies:[policy]},expectedRevisionId:view.technicalChains.revisionId});
   view=await api(viewPath);assert.deepEqual(view.technicalChains.authority.policies[0].phases,phases);save(`${label}-configuration`,view);
   if(label==='mixed'){
    const saved=view.technicalChains.authority.policies[0],revision=view.technicalChains.revisionId;
    assert.deepEqual(saved.requiredResourceIds,[]);
    await page.reload();const editor=page.getByTestId('daily-technical-chain');
    await editor.getByRole('button',{name:'Modificar cadena técnica',exact:true}).click();
    assert.equal(await editor.getByLabel('Orden por fases',{exact:true}).isChecked(),true);
    assert.equal(await editor.getByRole('button',{name:'Guardar cadena técnica',exact:true}).isEnabled(),true);
    // A real edit changes the authoring order inside one flexible phase.
    // Saving the identical authority correctly returns TECHNICAL_CHAIN_NO_CHANGES.
    const first=phases[0][0],task=view.technicalChains.tasks.find((t:any)=>t.id===first);
    await editor.getByLabel(`Fase 1: ${task.label}`,{exact:true}).uncheck();
    await editor.getByLabel(`Fase 1: ${task.label}`,{exact:true}).check();
    phases[0].push(phases[0].shift()!);policy.orderedTaskIds=phases.flat();
    const saving=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');
    await editor.getByRole('button',{name:'Guardar cadena técnica',exact:true}).click();const response=await saving;assert.equal(response.status(),200,await response.text());
    view=await api(viewPath);assert.equal(view.technicalChains.authority.policies[0].id,saved.id);assert.deepEqual(view.technicalChains.authority.policies[0].requiredResourceIds,[]);
    save('ui-reload-edit',{before:saved,after:view.technicalChains.authority.policies[0],revisionBefore:revision,revisionAfter:view.technicalChains.revisionId,accessibleLabels:true});
   }
   const effectiveInput=await buildEngineInput(planId,storage);save(`${label}-input`,effectiveInput);save(`${label}-effective-resources`,resolveEffectiveTaskResourceAssignments(effectiveInput));save(`${label}-adapter`,adapt(effectiveInput));
   await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);await page.getByTestId('daily-joint-groups').waitFor();await page.getByTestId('daily-technical-chain').scrollIntoViewIfNeeded();await page.getByTestId('daily-technical-chain').screenshot({path:`${directory}/${label}-required-phases.png`});await page.screenshot({path:`${directory}/${label}-configuration.png`,fullPage:true});
   // UI configuration is complete. Stop its background polling before the
   // deliberate API transaction/rollback probes contend for NOWAIT locks.
   await page.goto('about:blank');
   if(label==='mixed'){
    const changed=structuredClone(view.technicalChains.authority);changed.policies[0].id+='-cas';
    const race=await Promise.all(['admin','production'].map(role=>request(configPath,'PUT',{technicalChains:changed,expectedRevisionId:view.technicalChains.revisionId},role)));
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);save(`${label}-CAS-race`,race);
    view=await api(viewPath);save(`${label}-configuration`,view);save(`${label}-input`,await buildEngineInput(planId,storage));
   }
   if(label==='mixed'){
    const old=await buildCanonicalPlanConfig(planId,storage),nextStructure=structuredClone(view.technicalChains.authority);nextStructure.policies[0].id+='-atomic';
    const next=await buildCanonicalPlanConfig(planId,storage,validateDailyTechnicalChains(old.input,nextStructure));
    const before=(await db.query('SELECT current_config_revision_id,daily_technical_chains FROM plans WHERE id=$1',[planId])).rows;
    let failure:any;await db.query('BEGIN');try{
     await db.query("CREATE FUNCTION pg_temp.reject_phase_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'U01D_ATOMIC_PROBE';END $$;CREATE TRIGGER u01d_atomic BEFORE INSERT ON plan_config_revisions FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_phase_revision()");await db.query('SET LOCAL ROLE service_role');
     await db.query("SELECT apply_day_config_operation_v5($1,$2,'EDIT',$3,$4,$5,$6,$7,$8,$9)",[planId,users.admin.id,{technicalChains:nextStructure,expectedRevisionId:view.technicalChains.revisionId},view.technicalChains.revisionId,old.identity,old.replay,next.identity,next.replay,{}]);
    }catch(e:any){failure={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}
    assert.equal(failure?.message,'U01D_ATOMIC_PROBE');assert.deepEqual((await db.query('SELECT current_config_revision_id,daily_technical_chains FROM plans WHERE id=$1',[planId])).rows,before);save(`${label}-atomic-rollback`,{failure,rolledBack:true});
   }
   const configNegatives:any[]=[];
   for(const role of ['viewer','aux','norole','anonymous']){const r=await request(configPath,'PUT',{technicalChains:view.technicalChains.authority,expectedRevisionId:view.technicalChains.revisionId},role);assert.equal(r.status,role==='anonymous'?401:403);configNegatives.push({role,...r});}
   const stale=await request(configPath,'PUT',{technicalChains:view.technicalChains.authority,expectedRevisionId:2147483647});assert.equal(stale.status,409);configNegatives.push({mode:'stale-CAS',...stale});save(`${label}-config-negatives`,configNegatives);
   const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
   const poll=async(id:number)=>{for(let i=0;i<600;i++){const r=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(r.status))return r;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
   // These selectors must expose the same operational closure even without
   // prerequisites. Pending proposals do not accept/protect supporting work.
   if(!impossible){
    const jointIds=effectiveInput.dailyJointGroups![0].taskIds;
    for(const [entry,selector] of [['representative',{kind:'TASK_IDS',taskIds:[jointIds[0]]}],['peer',{kind:'TASK_IDS',taskIds:[jointIds[1]]}],['space',{kind:'SPACE',spaceId:spaces[2].id}]] as const){
     const before=await api(path),started=await api(path+'/proposals','POST',{...expected(before),selector,includePrerequisites:false}),run=await poll(started.runId);
     save(`${label}-scope-${entry}`,run);assert.equal(run.assisted_result_json.outcome,'PROPOSAL');
     assert.deepEqual([...run.assisted_result_json.scopeTaskIds].sort((a:number,b:number)=>a-b),[...new Set([...policy.orderedTaskIds,...jointIds])].sort((a,b)=>a-b));
     assert.equal(run.assisted_result_json.proposal.length,policy.orderedTaskIds.length+1);
    }
   }
   const stages:any[]=[];
   for(let n=0;n<(impossible?1:2);n++){
    const before=await api(path),ids=n===0&&!impossible?[competitors[0].id]:before.draft.tasks.filter((t:any)=>t.startPlanned==null).map((t:any)=>t.taskId);
    const started=await api(path+'/proposals','POST',{...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true});const run=await poll(started.runId);save(`${label}-S${n+1}-run`,run);
    if(impossible){assert.notEqual(run.assisted_result_json?.outcome,'PROPOSAL');assert.ok(!run.assisted_result_json.evidence.reasonCodes.some((c:string)=>c.includes('BUDGET_EXHAUSTED')));assert.equal((await api(path)).history.length,1);break;}
    assert.equal(run.assisted_result_json.outcome,'PROPOSAL');const result=run.assisted_result_json;assert.equal(result.evidence.nominalPhysicalFutureWitness.tasks.length,input.tasks.length);
    await api(`${path}/proposals/${run.id}/apply`,'POST',expected(before));const draft=await api(path);save(`${label}-S${n+1}-draft`,draft);await certificateAttacks({db,planId,run,draft,policy,input:effectiveInput,save,label,ordinal:n+1});await api(path+'/validate','POST',expected(draft));const validated=await api(path);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);save(`${label}-S${n+1}-validation`,validated.validation);
    const accepted=await api(path+'/accept-stage','POST',expected(validated));save(`${label}-S${n+1}-accepted`,accepted);stages.push(accepted.activeStage);
    for(const t of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((r:any)=>r.taskId===t.taskId),t);
    save(`${label}-S${n+1}-sql`,(await db.query('SELECT id,ordinal,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE id=$1',[accepted.activeStage.id])).rows[0]);
   }
   if(!impossible){
    const final=await api(path),stage=final.activeStage,forged=structuredClone(stage.snapshotJson);forged.tasks.find((t:any)=>t.startPlanned).startPlanned='15:55';
    let failure:any;await db.query('BEGIN');try{await db.query('SET LOCAL ROLE service_role');await db.query('UPDATE assisted_planning_stages SET snapshot_json=$2,snapshot_fingerprint=$3 WHERE id=$1',[stage.id,forged,fingerprintAssistedPlanningSnapshotV1(forged)]);}catch(e:any){failure={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}assert.equal(failure?.code,'42501');save(`${label}-immutable-stage`,{failure,hashRecomputed:true});
    await db.query('BEGIN');let immutable:any;try{await db.query('UPDATE assisted_planning_stages SET snapshot_json=$2,snapshot_fingerprint=$3 WHERE id=$1',[stage.id,forged,fingerprintAssistedPlanningSnapshotV1(forged)]);}catch(e:any){immutable={message:e.message,code:e.code};}finally{await db.query('ROLLBACK');}assert.equal(immutable?.code,'P0001');save(`${label}-immutable-trigger`,{immutable,hashRecomputed:true});
    await api(path+'/rollback','POST',{targetStageId:s0.activeStage.id});for(const stage of stages)await api(path+'/redo','POST',{targetStageId:stage.id});
    assert.deepEqual((await api(path)).activeStage.snapshotJson,final.activeStage.snapshotJson);
    save(`${label}-rollback-redo`,await api(path));
    assert.equal((await api(path)).draft.tasks.filter((t:any)=>t.startPlanned!=null).length,input.tasks.length);save(`${label}-final-input`,await buildEngineInput(planId,storage));}
   days.push({label,planId,taskCount:input.tasks.length,phases,stages:stages.map(s=>({id:s.id,fingerprint:s.snapshotFingerprint})),rivalId:competitors[0].id});pass(`${label}: ${impossible?'material negative':'phases + joint + rest + independent obligations, two genuine Stages'}`);
  }
  save('profile',days);return {days,remoteWrites:0,phaseAuthorityAccepted:true};
 }finally{save('api-receipts',receipts);save('browser-events',events);await browser.close();}
}
