import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium} from 'playwright';
import type {EngineInput} from '../../../engine/types';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {preflightEngineInputForPlannerNext} from '../../../engine/planner-next/integration/engineInputPreflight';
import {buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {validatePlan} from '../../../engine/planner-next/validate';
import {buildEffectivePlanConfigRevisionV1,projectEffectiveAuthoritiesFromEngineInputV1} from '../../../server/effectivePlanConfigRevision';
import {buildEffectivePlanConfigReplaySnapshotV1} from '../../../server/assistedPlanningConfigRevision';
import {buildAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {AssistedProposalService,createManualDeltaValidationHarness,type AssistedProposalRunAccess} from '../../../server/assistedProposalService';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {recommendNextAssistedScope} from '../../../server/assistedScopeOrchestrator';
import {plannerReadiness} from '../../../server/plannerReadiness';

type User={id:string;email:string;password:string;token:string};
export async function journey({appUrl,users,db,directory,pass}:{appUrl:string;users:Record<string,User>;db:pg.Client;directory:string;pass:(s:string)=>void}){
 assert.equal((db as any).host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const {storage}=await import('../../../server/storage');
 const save=(name:string,v:unknown)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(v,null,2));
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
  const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users[role].token}`},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json() as any};
 };
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;};
 const expected=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:s.draftBaseStageId});
 const poll=async(path:string,id:number)=>{for(let i=0;i<600;i++){const r=await api(`${path}/proposals/${id}`);if(!['pending','running'].includes(r.status))return r;await new Promise(r=>setTimeout(r,100));}throw Error('proposal timeout');};
 const configArgs=async(input:EngineInput)=>({planId:input.planId,optimizerSnapshot:await storage.getPlanOptimizerSnapshot(input.planId),taskTemplateSnapshots:await storage.getPlanTaskTemplateSnapshots(input.planId),optimizerProvenance:{authority:'plan_optimizer_snapshots',authorityContractVersion:1},taskTemplateProvenance:{authority:'plan_task_template_snapshots',authorityContractVersion:1},authorities:projectEffectiveAuthoritiesFromEngineInputV1(input)});
 const observe=(input:EngineInput)=>({preflight:preflightEngineInputForPlannerNext(input),adapter:adaptEngineInputToPlannerNextProblem(input),readiness:plannerReadiness(input,{status:'READY',issues:[]})});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),days:any[]=[];
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'08:00',defaultWorkEnd:'16:00',mealStart:'12:30',mealEnd:'13:30',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  for(const [index,label] of ['A','B'].entries()){
   const duration=index?30:20;
   const zone=await api('/api/zones','POST',{name:`U00o ${label} production`});
   const spaces:any[]=[];for(const name of ['East','West'])spaces.push(await api('/api/spaces','POST',{name:`U00o ${label} ${name}`,zoneId:zone.id}));
   for(const [n,s] of spaces.entries())await api(`/api/spaces/${s.id}/default-availability`,'PATCH',{availabilityStart:index?'09:00':n?'08:40':'08:30',availabilityEnd:n?'11:50':'12:00'});
   const templates:any[]=[];
   for(let n=0;n<5;n++)templates.push(await api('/api/task-templates','POST',{name:`U00o ${label} operation ${n}`,defaultDuration:n===1?duration+5:n===4?35:duration,spaceId:spaces[n<2?0:1].id,zoneId:zone.id,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}}));
   const general=await api('/api/new-day-planner-configuration');
   const config={contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0};
   await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:config});
   // The day itself is genuinely created by Chromium through the product dialog.
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();
   const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(index?'2027-04-12':'2027-04-11');
   const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');
   await modal.getByRole('button',{name:'Crear día',exact:true}).click();const response=await created;assert.equal(response.status(),201);const day=await response.json(),planId=Number(day.id),path=`/api/plans/${planId}/assisted`;
   const tasks:any[]=[];
   for(let n=0;n<5;n++){
    const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`U00o ${label} person ${n}`,availabilityStart:n%2?'09:10':index?'09:00':'08:45',availabilityEnd:n===3?'11:40':'12:00'});
    tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:templates[n].id,contestantId:person.id,spaceId:templates[n].spaceId,zoneId:zone.id}));
   }
   const policy:NonNullable<EngineInput['roundSynchronizations']>[number]={id:`u00o-${label}-rounds`,synchronization:'START_TOGETHER_WHILE_ALL_LANES_ACTIVE',lanes:spaces.map((s,i)=>({spaceId:s.id,taskIds:tasks.slice(i*2,i*2+2).map(t=>t.id),preparationMinutesBetweenRounds:5}))};
   save(`${label}-created`,{day,spaces,templates,tasks,requestedStructure:policy});
   const raw=await buildEngineInput(planId,storage);save(`${label}-before-input`,raw);save(`${label}-before-preflight`,observe(raw));
   assert.equal(raw.roundSynchronizations,undefined);assert.equal(observe(raw).adapter.status,'SUPPORTED');
   save(`${label}-effective`,await api(`/api/plans/${planId}/effective-configuration`));
   save(`${label}-day-authorities`,(await db.query('SELECT planner_next_profile,planner_next_configuration,itinerant_composition_version,round_preparation_overrides FROM plans WHERE id=$1',[planId])).rows[0]);
   // No unknown structural field can be silently saved through the existing API.
   const badGeneral=await request('/api/new-day-planner-configuration','PUT',{expectedRevision:(await api('/api/new-day-planner-configuration')).revision,configuration:{...config,roundSynchronizations:[policy]}});save(`${label}-general-structure-rejection`,badGeneral);assert.ok(badGeneral.status>=400);
   const mixed={...raw,roundSynchronizations:[policy]};save(`${label}-mixed-input`,mixed);save(`${label}-mixed-preflight`,observe(mixed));
   assert.equal(observe(mixed).adapter.status,'UNSUPPORTED');
   assert.ok(observe(mixed).preflight.issues.some(issue=>issue.code==='UNSUPPORTED_ROUND_SYNCHRONIZATION'&&issue.details?.durationMixValid===false));
   // One explicit product edit isolates the duration limit before starting Assisted.
   save(`${label}-uniform-product-edit`,await api(`/api/daily-tasks/${tasks[1].id}`,'PATCH',{durationOverride:duration}));
   const input=await buildEngineInput(planId,storage),projected:EngineInput={...input,roundSynchronizations:[policy]};
   const observed=observe(projected);save(`${label}-counterfactual-input`,projected);save(`${label}-counterfactual-preflight`,observed);assert.equal(observed.adapter.status,'SUPPORTED',JSON.stringify(observed));
   const adapted=observed.adapter;if(adapted.status!=='SUPPORTED')throw Error('unsupported');
   const blank=buildAssistedPlanningSnapshotV1(await storage.getTasksForPlan(planId));
   const recommendation=recommendNextAssistedScope(projected,blank);save(`${label}-scope-recommendation`,recommendation);
   assert.equal(recommendation?.selectedUnitId,`ROUND_SYNCHRONIZATION:${policy.id}`);
   const all=resolveAssistedScope(projected,adapted,{kind:'TASK_IDS',taskIds:tasks.slice(0,4).map(t=>t.id)});
   const futureEligible=analyticalFutureEligibleTaskIds(projected,adapted.identityMap);
   const fullProblem=buildAssistedProblem(adapted.problem,all.scope,[],futureEligible);const execution=executeAssistedPlanning(fullProblem),repeat=executeAssistedPlanning(fullProblem);
   save(`${label}-solver`,execution);save(`${label}-solver-repeat`,repeat);assert.ok(execution.proposal,JSON.stringify(execution.evidence.reasonCodes));assert.deepEqual(execution,repeat);
   assert.equal(execution.evidence.completeForScope,true);assert.equal(execution.evidence.hardValid,true);assert.equal(execution.evidence.selectedRoundPreparations?.length,2);
   const scheduled=[...execution.proposal!],preparations=[...(execution.evidence.selectedRoundPreparations??[])];
   save(`${label}-global-incomplete-validation`,validatePlan(adapted.problem,scheduled,[],[],[],[],[],preparations));
   const valid=validatePlan(fullProblem.originalValidationProblem,scheduled,[],[],[],[],[],preparations);save(`${label}-validation`,valid);assert.equal(valid.hardValid,true,JSON.stringify(valid.reasonCodes));
   save(`${label}-missing-preparation-validation`,validatePlan(fullProblem.originalValidationProblem,scheduled));
   assert.ok(validatePlan(fullProblem.originalValidationProblem,scheduled).reasonCodes.includes('ROUND_PREPARATION_VIOLATION'));
   const moved=scheduled.map((t,i)=>i===0?{...t,start:t.start+5,end:t.end+5}:t);
   const broken=validatePlan(adapted.problem,moved,[],[],[],[],[],preparations);save(`${label}-desynchronized-validation`,broken);assert.equal(broken.hardValid,false);
   // Smaller manual scopes must be observed separately from the recommended unit.
   for(const [kind,selector] of [['single',{kind:'TASK_IDS',taskIds:[tasks[0].id]}],['space',{kind:'SPACE',spaceId:spaces[0].id}],['independent',{kind:'TASK_IDS',taskIds:[tasks[4].id]}]] as const){
    const resolved=resolveAssistedScope(projected,adapted,selector as any),p=buildAssistedProblem(adapted.problem,resolved.scope,[],futureEligible),r=executeAssistedPlanning(p);
    save(`${label}-${kind}-scope`,{resolution:resolved,problem:p,result:r});
    assert.ok(r.proposal);
    if(kind==='independent'){
     assert.equal(p.problem.analyticalFutureRoundSynchronizations?.length,1);
     assert.equal(r.evidence.futureStructuralWitnesses?.filter(w=>w.kind==='ROUND_SYNCHRONIZATION').length,1);
     assert.deepEqual(r.proposal.map(t=>t.id),[`task:${tasks[4].id}`]);
    }else assert.equal(p.problem.tasks.length,4);
   }
   const negatives:Record<string,EngineInput>={
    wrongSpace:{...projected,roundSynchronizations:[{...policy,lanes:policy.lanes.map((lane,i)=>({...lane,taskIds:i?[tasks[0].id,tasks[3].id]:[tasks[2].id,tasks[1].id]}))}]},
    missingTask:{...projected,roundSynchronizations:[{...policy,lanes:policy.lanes.map((lane,i)=>i?lane:{...lane,taskIds:[2147483000,tasks[1].id]})}]},
    preparation:{...projected,roundSynchronizations:[{...policy,lanes:policy.lanes.map(l=>({...l,preparationMinutesBetweenRounds:240}))}]},
    impossible:{...projected,contestantAvailabilityById:{...projected.contestantAvailabilityById,...Object.fromEntries(input.tasks.filter(t=>tasks.slice(0,4).some(row=>row.id===t.id)).map(t=>[t.contestantId!,t.spaceId===spaces[0].id?{start:index?'09:00':'08:45',end:'10:20'}:{start:'10:30',end:'11:50'}]))}},
   };
   for(const [name,negative] of Object.entries(negatives)){
    const o=observe(negative);save(`${label}-negative-${name}`,{input:negative,...o});
    if(o.adapter.status==='SUPPORTED'){
     const a=o.adapter,r=executeAssistedPlanning(buildAssistedProblem(a.problem,resolveAssistedScope(negative,a,{kind:'TASK_IDS',taskIds:tasks.slice(0,4).map(t=>t.id)}).scope,[],analyticalFutureEligibleTaskIds(negative,a.identityMap)));save(`${label}-negative-${name}-solver`,r);assert.equal(r.proposal,null);
     if(name==='impossible'){
      const without={...negative,roundSynchronizations:undefined},a2=adaptEngineInputToPlannerNextProblem(without);assert.equal(a2.status,'SUPPORTED');if(a2.status!=='SUPPORTED')throw Error('unsupported');
      const independent=executeAssistedPlanning(buildAssistedProblem(a2.problem,resolveAssistedScope(without,a2,{kind:'TASK_IDS',taskIds:tasks.slice(0,4).map(t=>t.id)}).scope,[]));save(`${label}-negative-impossible-without-sync`,independent);assert.ok(independent.proposal);
     }
    }else assert.ok(['wrongSpace','missingTask'].includes(name));
   }
   const args=await configArgs(input),projectedArgs=await configArgs(projected),identity=buildEffectivePlanConfigRevisionV1(args),counterIdentity=buildEffectivePlanConfigRevisionV1(projectedArgs);
   save(`${label}-identities`,{actual:identity,counterfactual:counterIdentity,actualReplay:buildEffectivePlanConfigReplaySnapshotV1(args),counterfactualReplay:buildEffectivePlanConfigReplaySnapshotV1(projectedArgs)});assert.notEqual(identity.configurationFingerprint,counterIdentity.configurationFingerprint);
   // Authentic session/run with projected input: keep the genuine revision gate.
   const start=await api(path+'/session','POST',{});save(`${label}-S0`,start);
   const requested=await api(path+'/proposals','POST',{...expected(start),selector:{kind:'TASK_IDS',taskIds:tasks.map(t=>t.id)},includePrerequisites:true});const actualRun=await poll(path,requested.runId);save(`${label}-product-proposal`,actualRun);assert.equal(actualRun.assisted_result_json.outcome,'PROPOSAL');
   let captured:any;const access:AssistedProposalRunAccess={create:async()=>{throw Error('no write');},find:async()=>({data:actualRun,error:null}),fail:async()=>{throw Error('no write');},apply:async()=>{throw Error('no write');},finish:async(_p,_r,result)=>{captured=result;return {error:null};}};
   const strict=new AssistedProposalService(storage,()=>{},access,executeAssistedPlanning,{buildInput:async()=>projected,buildConfigRevision:buildEffectivePlanConfigRevisionV1});
   await assert.rejects(()=>strict.run(planId,actualRun.id),(e:any)=>{save(`${label}-stage-barrier`,{code:e.code,message:e.message,acceptedSynchronizedStage:false,intervention:'buildInput projection only; authentic stored revision'});return e.code==='STALE_CONFIG_REVISION';});
   // In-memory revision read is explicitly simulated, never persisted/accepted.
   const simulatedStorage=new Proxy(storage,{get(target,key){if(key==='getPlanConfigRevision')return async(id:number)=>({...await target.getPlanConfigRevision(id),fingerprint:counterIdentity.configurationFingerprint,identityJson:counterIdentity,replaySnapshotJson:buildEffectivePlanConfigReplaySnapshotV1(projectedArgs)});const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
   const simulation=new AssistedProposalService(simulatedStorage,()=>{},access,executeAssistedPlanning,{buildInput:async()=>projected,buildConfigRevision:buildEffectivePlanConfigRevisionV1});
   await simulation.run(planId,actualRun.id);save(`${label}-simulated-product-proposal`,{simulationOnly:true,intervention:'projected input and ephemeral revision read; no DB/run/Stage write',result:captured});
   assert.equal(captured.outcome,'PROPOSAL');assert.equal(captured.proposedDraftSnapshot.tasks.length,5);assert.equal(captured.proposedDraftSnapshot.roundPreparations.length,2);
   const materialized=createManualDeltaValidationHarness(adapted.problem,adapted.identityMap)(projected,captured.proposedDraftSnapshot,tasks.map(t=>t.id));save(`${label}-simulated-draft-validation`,materialized);assert.equal(materialized.hardValid,true);
   await db.query('BEGIN');try{
    await db.query('SAVEPOINT immutable');
    try{await db.query('UPDATE plans SET planner_next_configuration=$1 WHERE id=$2',[{contractVersion:1,taskOperations:[],roundSynchronizations:[policy]},planId]);assert.fail('immutable write passed');}catch(e:any){save(`${label}-SQL-authority-barrier`,{code:e.code,message:e.message});assert.equal(e.message,'PLANNER_NEXT_CONFIGURATION_IMMUTABLE');}
   }finally{await db.query('ROLLBACK');}
   await db.query('BEGIN');try{
    await db.query('SET LOCAL ROLE service_role');
    const planRevision=(await db.query('SELECT current_config_revision_id FROM plans WHERE id=$1',[planId])).rows[0].current_config_revision_id;
    try{await db.query('SELECT public.apply_day_config_operation_v5($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[planId,users.admin.id,'EDIT',{},planRevision,identity,buildEffectivePlanConfigReplaySnapshotV1(args),counterIdentity,buildEffectivePlanConfigReplaySnapshotV1(projectedArgs),{}]);assert.fail('new authority passed old SQL contract');}catch(e:any){save(`${label}-SQL-replay-barrier`,{code:e.code,message:e.message,planRevision,sessionRevision:start.currentConfigRevisionId});assert.equal(e.message,'STALE_ROUND_PREPARATION_CANDIDATE');}
   }finally{await db.query('ROLLBACK');}
   assert.deepEqual(await api(path),start,'counterfactual probes must not mutate session');
   // Genuine baseline Stage, without synchronization, through unmodified API.
   await api(path+`/proposals/${actualRun.id}/apply`,'POST',expected(start));const draft=await api(path);save(`${label}-product-draft`,draft);
   await api(path+'/validate','POST',expected(draft));const validated=await api(path);save(`${label}-product-validation`,validated.validation);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
   const accepted=await api(path+'/accept-stage','POST',expected(validated));save(`${label}-product-stage`,accepted);assert.equal(accepted.activeStage.ordinal,1);assert.equal(accepted.activeStage.snapshotJson.roundPreparations,undefined);
   await page.goto(`${appUrl}/plans/${planId}?tab=planning`);await page.getByTestId('assisted-workspace').waitFor();await page.screenshot({path:`${directory}/${label}-product-stage.png`,fullPage:true});
   const rollback=await api(path+'/rollback','POST',{targetStageId:start.activeStage.id}),redo=await api(path+'/redo','POST',{});save(`${label}-product-restore`,{rollback,redo});assert.deepEqual(redo.activeStage,accepted.activeStage);
   days.push({label,planId,spaceIds:spaces.map(s=>s.id),taskIds:tasks.map(t=>t.id),duration,baselineStageId:accepted.activeStage.id,synchronizedStage:false,counterfactualFingerprint:execution.evidence.fingerprint,baselineConfigFingerprint:identity.configurationFingerprint,counterfactualConfigFingerprint:counterIdentity.configurationFingerprint});pass(`${label}: native creation, authority loss, counterfactual rounds, negatives, real revision barrier and ordinary Stage`);
  }
  assert.ok(days[0].spaceIds.every((id:number)=>!days[1].spaceIds.includes(id)));save('days',days);return {days,remoteWrites:0,synchronizedStagesAccepted:0};
 }finally{await browser.close();}
}
