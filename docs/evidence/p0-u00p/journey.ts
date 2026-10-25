import {configurationAttacks,roundCertificateAttacks} from "./attacks";
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import type pg from 'pg';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {preflightEngineInputForPlannerNext} from '../../../engine/planner-next/integration/engineInputPreflight';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {buildCanonicalPlanConfig} from '../../../server/dayConfigurationService';
type User={id:string;email:string;password:string;token:string};
export async function journey({appUrl,users,db,directory,pass}:{appUrl:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(s:string)=>void}){
 assert.equal((db as any).host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(name:string,v:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(v,null,2));
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
  const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json() as any};
 };
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
 const poll=async(path:string,id:number)=>{for(let i=0;i<600;i++){const r=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(r.status))return r;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),days:any[]=[];
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'08:00',defaultWorkEnd:'16:00',mealStart:'12:30',mealEnd:'13:30',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  for(const [index,label] of ['A','B'].entries()){
   const duration=index?30:20;
   const zone=await api('/api/zones','POST',{name:`U00p ${label} production`});
   const spaces:any[]=[];for(const name of ['East','West'])spaces.push(await api('/api/spaces','POST',{name:`U00p ${label} ${name}`,zoneId:zone.id}));
   for(const [n,s] of spaces.entries())await api(`/api/spaces/${s.id}/default-availability`,'PATCH',{availabilityStart:index?'09:00':n?'08:40':'08:30',availabilityEnd:n?'11:50':'12:00'});
   const templates:any[]=[];
   for(let n=0;n<5;n++)templates.push(await api('/api/task-templates','POST',{name:`U00p ${label} operation ${n}`,defaultDuration:n===4?35:duration,spaceId:spaces[n<2?0:1].id,zoneId:zone.id,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}}));
   const general=await api('/api/new-day-planner-configuration');
   await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0}});
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();
   const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(index?'2027-05-12':'2027-05-11');
   const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');
   await modal.getByRole('button',{name:'Crear día',exact:true}).click();const response=await created;assert.equal(response.status(),201);const day=await response.json(),planId=Number(day.id),path=`/api/plans/${planId}/assisted`,configPath=`/api/plans/${planId}/day-configuration`;
   const tasks:any[]=[];
   for(let n=0;n<5;n++){
    const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`U00p ${label} person ${n}`,availabilityStart:n%2?'09:10':index?'09:00':'08:45',availabilityEnd:n===3?'11:40':'12:00'});
    tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:templates[n].id,contestantId:person.id,spaceId:templates[n].spaceId,zoneId:zone.id}));
   }
   const before=await buildEngineInput(planId,storage);save(`${label}-before-input`,before);assert.equal(before.roundSynchronizations,undefined);
   const start=await api(path+'/session','POST',{});save(`${label}-S0`,start);save(`${label}-before-config-sources`,(await db.query('SELECT public.assisted_expected_obligation_sources($1) expected,public.assisted_read_bootstrap_sources($2) actual',[start.session.id,planId])).rows[0]);
   await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);
   const editor=page.getByTestId('daily-round-synchronization');
   // Sections are collapsed until production opens them.
   const section=page.getByRole('button',{name:/Rondas sincronizadas/});if(await section.count())await section.click();
   await editor.getByRole('button',{name:'Crear rondas sincronizadas',exact:true}).click();
   for(let i=0;i<2;i++){
    await editor.getByLabel(`Espacio del carril ${i+1}`,{exact:true}).selectOption(String(spaces[i].id));
    for(let n=i*2;n<i*2+2;n++)await editor.getByLabel(new RegExp(`U00p ${label} operation ${n} ·`)).check();
    await editor.getByLabel(`Preparación del carril ${i+1}`,{exact:true}).fill('5');
   }
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');
   await editor.getByRole('button',{name:'Guardar rondas',exact:true}).click();const written=await saved;assert.equal(written.status(),200,await written.text());
   await page.reload();await editor.getByText(/Regla configurada y efectiva/).waitFor();
   await editor.screenshot({path:`${directory}/${label}-configuration.png`});
   let effective=await api(`/api/plans/${planId}/effective-configuration`);save(`${label}-effective`,effective);
   const structure=effective.roundSynchronization.authority;assert.equal(structure.policies[0].lanes.flatMap((l:any)=>l.taskIds).length,4);
   assert.ok(!structure.policies[0].lanes.flatMap((l:any)=>l.taskIds).includes(tasks[4].id));
   const raceBody=(minutes:number)=>({roundSynchronization:{...structure,policies:structure.policies.map((p:any)=>({...p,lanes:p.lanes.map((l:any)=>({...l,preparationMinutesBetweenRounds:minutes}))}))},expectedRevisionId:effective.roundSynchronization.revisionId});
   const race=await Promise.all([request(configPath,'PUT',raceBody(10),'production'),request(configPath,'PUT',raceBody(15))]);
   save(`${label}-writer-race`,race);assert.equal(race.filter(r=>r.status===200).length,1);assert.equal(race.filter(r=>r.status===409).length,1);
   effective=await api(`/api/plans/${planId}/effective-configuration`);
   const removed=await request(configPath,'PUT',{roundSynchronization:{contractVersion:1,policies:[]},expectedRevisionId:effective.roundSynchronization.revisionId},'production');save(`${label}-production-removal`,removed);assert.equal(removed.status,200);
   const absent=await buildEngineInput(planId,storage);assert.deepEqual(JSON.parse(JSON.stringify(absent)),JSON.parse(JSON.stringify(before)));
   save(`${label}-removed-input`,absent);effective=await api(`/api/plans/${planId}/effective-configuration`);
   await api(configPath,'PUT',{roundSynchronization:structure,expectedRevisionId:effective.roundSynchronization.revisionId});
   effective=await api(`/api/plans/${planId}/effective-configuration`);save(`${label}-effective`,effective);
   const impossible=structuredClone(structure);impossible.policies[0].lanes.forEach((l:any)=>l.preparationMinutesBetweenRounds=240);
   await api(configPath,'PUT',{roundSynchronization:impossible,expectedRevisionId:effective.roundSynchronization.revisionId});
   const impossibleState=await api(path),impossibleRequest=await api(path+'/proposals','POST',{...expected(impossibleState),selector:{kind:'TASK_IDS',taskIds:[tasks[0].id]},includePrerequisites:true});
   const impossibleRun=await poll(path,impossibleRequest.runId);save(`${label}-impossible-product-proposal`,impossibleRun);assert.equal(impossibleRun.assisted_result_json.outcome,'NO_PROPOSAL');
   assert.ok(!impossibleRun.assisted_result_json.reasonCodes.some((c:string)=>/BUDGET|TIME_LIMIT/.test(c)));
   effective=await api(`/api/plans/${planId}/effective-configuration`);
   await api(configPath,'PUT',{roundSynchronization:structure,expectedRevisionId:effective.roundSynchronization.revisionId});
   effective=await api(`/api/plans/${planId}/effective-configuration`);save(`${label}-effective`,effective);
   const staleApply=await request(path+`/proposals/${impossibleRun.id}/apply`,'POST',expected(await api(path)));save(`${label}-stale-run`,staleApply);assert.equal(staleApply.status,409);
   const input=await buildEngineInput(planId,storage),canonical=await buildCanonicalPlanConfig(planId,storage);save(`${label}-input`,input);save(`${label}-canonical`,canonical);
   save(`${label}-revision`,(await db.query('SELECT * FROM plan_config_revisions WHERE id=$1',[effective.roundSynchronization.revisionId])).rows[0]);
   const adapter=adaptEngineInputToPlannerNextProblem(input);save(`${label}-preflight`,preflightEngineInputForPlannerNext(input));save(`${label}-adapter`,adapter);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('unsupported');
   for(const [name,selector] of [['member',{kind:'TASK_IDS',taskIds:[tasks[0].id]}],['space',{kind:'SPACE',spaceId:spaces[0].id}],['independent',{kind:'TASK_IDS',taskIds:[tasks[4].id]}]] as const){
    const resolution=resolveAssistedScope(input,adapter,selector as any),problem=buildAssistedProblem(adapter.problem,resolution.scope,[],analyticalFutureEligibleTaskIds(input,adapter.identityMap)),result=executeAssistedPlanning(problem);
    save(`${label}-${name}-scope`,{resolution,problem,result});assert.ok(result.proposal);
    if(name==='independent'){assert.equal(result.proposal.length,1);assert.equal(result.evidence.futureStructuralWitnesses?.filter(w=>w.kind==='ROUND_SYNCHRONIZATION').length,1);}
    else assert.deepEqual(resolution.productTaskIds,tasks.slice(0,4).map(t=>t.id));
   }
   const reject=async(name:string,body:any,role='admin')=>{const old=await api(`/api/plans/${planId}/effective-configuration`),r=await request(configPath,'PUT',body,role);save(`${label}-negative-${name}`,r);assert.ok(r.status>=400,JSON.stringify(r));assert.deepEqual((await api(`/api/plans/${planId}/effective-configuration`)).roundSynchronization,old.roundSynchronization);};
   await configurationAttacks({db,storage,planId,users,structure,revision:effective.roundSynchronization.revisionId,directory,label,request,configPath});
   const edit={roundSynchronization:structure,expectedRevisionId:effective.roundSynchronization.revisionId};
   for(const role of ['aux','viewer','norole','anonymous'])await reject(role,edit,role);
   await reject('stale',{...edit,expectedRevisionId:1});
   const invalid=(change:(s:any)=>void)=>{const s=structuredClone(structure);change(s);return {...edit,roundSynchronization:s};};
   await reject('duplicate',invalid(s=>s.policies[0].lanes[1].taskIds[0]=tasks[0].id));
   await reject('heterogeneous',invalid(s=>s.policies[0].lanes[1].taskIds[1]=tasks[4].id));
   await reject('missing',invalid(s=>s.policies[0].lanes[0].taskIds[0]=2147483000));
   if(days.length)await reject('other-day',invalid(s=>s.policies[0].lanes[0].taskIds[0]=days[0].taskIds[0]));
   await reject('wrong-space',invalid(s=>s.policies[0].lanes[0].spaceId=spaces[1].id));
   await reject('preparation',invalid(s=>s.policies[0].lanes[0].preparationMinutesBetweenRounds=3));
   let state=await api(path);assert.equal(state.session.id,start.session.id);assert.notEqual(state.currentConfigRevisionId,start.currentConfigRevisionId);
   const proposal=await api(path+'/proposals','POST',{...expected(state),selector:{kind:'TASK_IDS',taskIds:[tasks[0].id]},includePrerequisites:true});
   const run=await poll(path,proposal.runId);save(`${label}-proposal`,run);assert.equal(run.assisted_result_json.outcome,'PROPOSAL',JSON.stringify(run));
   assert.equal(run.assisted_result_json.proposal.length,4);assert.equal(run.assisted_result_json.proposedDraftSnapshot.roundPreparations.length,2);
   await reject('pending-proposal',invalid(s=>s.policies[0].lanes[0].preparationMinutesBetweenRounds=10));
   await roundCertificateAttacks({db,run,state,planId,directory,label});
   await api(path+`/proposals/${run.id}/apply`,'POST',expected(state));state=await api(path);save(`${label}-draft`,state);
   await reject('dirty-draft',invalid(s=>s.policies[0].lanes[0].preparationMinutesBetweenRounds=10));
   await api(path+'/validate','POST',expected(state));state=await api(path);save(`${label}-validation`,state.validation);assert.equal(state.validation.hardCount,0);assert.equal(state.validation.requiredCount,0);
   const accepted=await api(path+'/accept-stage','POST',expected(state));save(`${label}-S1`,accepted);assert.equal(accepted.activeStage.ordinal,1);
   await page.goto(`${appUrl}/plans/${planId}?tab=planning`);await page.getByTestId('assisted-workspace').waitFor();await page.getByTestId('assisted-workspace').screenshot({path:`${directory}/${label}-S1.png`});
   const placements=(await db.query('SELECT id,space_id,start_planned,end_planned FROM daily_tasks WHERE plan_id=$1 ORDER BY space_id,start_planned,id',[planId])).rows.map(t=>({...t,id:Number(t.id)}));save(`${label}-persisted-placements`,placements);
   const lanes=spaces.map(s=>placements.filter(t=>t.space_id===s.id&&tasks.slice(0,4).some(row=>row.id===t.id)));
   assert.deepEqual(lanes[0].map(t=>[t.start_planned,t.end_planned]),lanes[1].map(t=>[t.start_planned,t.end_planned]));
   assert.equal(accepted.activeStage.snapshotJson.roundPreparations.length,2);assert.equal(placements.find(t=>t.id===tasks[4].id).start_planned,null);
   await reject('protected-preparation',invalid(s=>s.policies[0].lanes[0].preparationMinutesBetweenRounds=10));
   await reject('protected-removal',{...edit,roundSynchronization:{contractVersion:1,policies:[]}});
   state=await api(path);const second=await api(path+'/proposals','POST',{...expected(state),selector:{kind:'TASK_IDS',taskIds:[tasks[4].id]},includePrerequisites:true});const secondRun=await poll(path,second.runId);save(`${label}-continuation`,secondRun);assert.equal(secondRun.assisted_result_json.outcome,'PROPOSAL');
   await api(path+`/proposals/${secondRun.id}/apply`,'POST',expected(state));state=await api(path);await api(path+'/validate','POST',expected(state));state=await api(path);const completed=await api(path+'/accept-stage','POST',expected(state));save(`${label}-S2`,completed);assert.equal(completed.activeStage.ordinal,2);assert.equal(completed.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned!=null).length,5);
   for(const task of accepted.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned!=null))assert.deepEqual(completed.activeStage.snapshotJson.tasks.find((t:any)=>t.taskId===task.taskId),task);
   assert.deepEqual(completed.activeStage.snapshotJson.roundPreparations,accepted.activeStage.snapshotJson.roundPreparations);
   await page.goto(`${appUrl}/plans/${planId}?tab=planning`);await page.getByTestId('assisted-workspace').waitFor();await page.screenshot({path:`${directory}/${label}-S2.png`,fullPage:true});
   const rollback=await api(path+'/rollback','POST',{targetStageId:start.activeStage.id}),redo1=await api(path+'/redo','POST',{}),redo2=await api(path+'/redo','POST',{});save(`${label}-restore`,{rollback,redo1,redo2});assert.deepEqual(redo2.activeStage,completed.activeStage);assert.equal(rollback.currentConfigRevisionId,completed.currentConfigRevisionId);
   assert.deepEqual((await api(`/api/plans/${planId}/effective-configuration`)).roundSynchronization.authority,structure);
   save(`${label}-sources`,(await db.query('SELECT public.assisted_expected_obligation_sources($1) expected,public.assisted_read_bootstrap_sources($2) actual',[state.session.id,planId])).rows[0]);
   if(label==='A'){
    const origin=await api(path+'/rollback','POST',{targetStageId:start.activeStage.id});
    const solo=await api(path+'/proposals','POST',{...expected(origin),selector:{kind:'TASK_IDS',taskIds:[tasks[4].id]},includePrerequisites:true});
    const soloRun=await poll(path,solo.runId);save('A-independent-first-proposal',soloRun);assert.equal(soloRun.assisted_result_json.outcome,'PROPOSAL');
    assert.ok(soloRun.assisted_result_json.evidence.futureStructuralWitnesses.some((w:any)=>w.kind==='ROUND_SYNCHRONIZATION'));
    await api(path+`/proposals/${soloRun.id}/apply`,'POST',expected(origin));state=await api(path);await api(path+'/validate','POST',expected(state));state=await api(path);const independentStage=await api(path+'/accept-stage','POST',expected(state));save('A-independent-first-stage',independentStage);
    const revision=(await api(`/api/plans/${planId}/effective-configuration`)).roundSynchronization.revisionId;
    const changed=structuredClone(structure);changed.policies[0].lanes.forEach((l:any)=>l.preparationMinutesBetweenRounds=10);
    save('A-compatible-post-stage-edit',await api(configPath,'PUT',{roundSynchronization:changed,expectedRevisionId:revision}));
    state=await api(path);assert.equal(state.session.id,start.session.id);assert.deepEqual(state.activeStage,independentStage.activeStage);
    const final=await api(path+'/proposals','POST',{...expected(state),selector:{kind:'TASK_IDS',taskIds:[tasks[0].id]},includePrerequisites:true});const finalRun=await poll(path,final.runId);save('A-compatible-post-stage-proposal',finalRun);assert.equal(finalRun.assisted_result_json.outcome,'PROPOSAL');
    await api(path+`/proposals/${finalRun.id}/apply`,'POST',expected(state));state=await api(path);await api(path+'/validate','POST',expected(state));state=await api(path);const finalStage=await api(path+'/accept-stage','POST',expected(state));save('A-compatible-post-stage-accepted',finalStage);
    const independentBefore=independentStage.activeStage.snapshotJson.tasks.find((t:any)=>t.taskId===tasks[4].id);assert.deepEqual(finalStage.activeStage.snapshotJson.tasks.find((t:any)=>t.taskId===tasks[4].id),independentBefore);
    assert.ok(finalStage.activeStage.snapshotJson.roundPreparations.every((p:any)=>p.duration===10));
    for(const historical of [accepted.activeStage,completed.activeStage]){const actual=finalStage.history.find((s:any)=>s.id===historical.id);assert.deepEqual(actual.snapshotJson,historical.snapshotJson);assert.equal(actual.snapshotFingerprint,historical.snapshotFingerprint);assert.equal(actual.configRevisionId,historical.configRevisionId);}
    // The same session retains U00n admission after the configuration transition.
    const laterPerson=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:'U00p A later independent',availabilityStart:'10:15',availabilityEnd:'12:00'});
    const later=await api('/api/daily-tasks','POST',{planId,templateId:templates[4].id,contestantId:laterPerson.id,spaceId:spaces[1].id,zoneId:zone.id});
    const preview=await api(path+'/bootstrap-additions');save('A-after-rounds-admission-preview',preview);assert.equal(preview.allowed,true,JSON.stringify(preview));
    const admitted=await api(path+'/bootstrap-additions','POST',{...expected(finalStage),expectedSessionId:finalStage.session.id,expectedConfigRevisionId:finalStage.currentConfigRevisionId,sourceToken:preview.sourceToken,addedTaskIds:preview.addedTaskIds,confirmation:'INCORPORATE_NEW_TASKS'});save('A-after-rounds-admission',admitted);assert.equal(admitted.session.id,start.session.id);
    assert.ok(!(await buildEngineInput(planId,storage)).roundSynchronizations!.flatMap(p=>p.lanes.flatMap(l=>l.taskIds)).includes(later.id));
    const next=await api(path+'/proposals','POST',{...expected(admitted),selector:{kind:'TASK_IDS',taskIds:[later.id]},includePrerequisites:true});const nextRun=await poll(path,next.runId);save('A-after-rounds-admission-proposal',nextRun);assert.equal(nextRun.assisted_result_json.outcome,'PROPOSAL');
    await api(path+`/proposals/${nextRun.id}/apply`,'POST',expected(admitted));state=await api(path);await api(path+'/validate','POST',expected(state));state=await api(path);const nextStage=await api(path+'/accept-stage','POST',expected(state));save('A-after-rounds-admission-stage',nextStage);assert.equal(nextStage.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned!=null).length,6);
    const back=await api(path+'/rollback','POST',{targetStageId:start.activeStage.id});assert.ok(back.draft.tasks.some((t:any)=>t.taskId===later.id&&t.startPlanned==null));save('A-admission-rollback',back);
    for(let n=0;n<3;n++)state=await api(path+'/redo','POST',{});assert.deepEqual(state.activeStage,nextStage.activeStage);save('A-admission-redo',state);
   }
   days.push({label,planId,spaceIds:spaces.map(s=>s.id),taskIds:tasks.map(t=>t.id),duration,stage1:accepted.activeStage.id,stage2:completed.activeStage.id,fingerprint:completed.activeStage.snapshotFingerprint,configFingerprint:canonical.identity.configurationFingerprint});pass(`${label}: UI round authority → genuine synchronized S1 → protected complete S2 → rollback/redo`);
  }
  assert.ok(days[0].spaceIds.every((id:number)=>!days[1].spaceIds.includes(id)));save('days',days);return {days,remoteWrites:0,synchronizedStagesAccepted:6};
 }finally{await browser.close();}
}
