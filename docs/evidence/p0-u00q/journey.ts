import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium} from 'playwright';
import type {EngineInput} from '../../../engine/types';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {preflightEngineInputForPlannerNext as preflight} from '../../../engine/planner-next/integration/engineInputPreflight';
import {buildAssistedProblem,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {validatePlan} from '../../../engine/planner-next/validate';
import {getTechnicalChains,generateTechnicalChainCandidates} from '../../../engine/planner-next/technicalChains';
import {probeTechnicalChainFutureReservations,PreparedFutureTechnicalChainAuthority} from '../../../engine/planner-next/technicalChainFutureFeasibility';
import {buildEffectivePlanConfigRevisionV1,projectEffectiveAuthoritiesFromEngineInputV1} from '../../../server/effectivePlanConfigRevision';
import {buildEffectivePlanConfigReplaySnapshotV1} from '../../../server/assistedPlanningConfigRevision';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {AssistedProposalService,createManualDeltaValidationHarness,type AssistedProposalRunAccess} from '../../../server/assistedProposalService';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {recommendNextAssistedScope} from '../../../server/assistedScopeOrchestrator';
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
 const observe=(input:EngineInput)=>({preflight:preflight(input),adapter:adapt(input)});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),days:any[]=[];
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'08:00',defaultWorkEnd:'16:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'u00q_physical',name:'U00q physical equipment'});
  // Catalogue and day inventory are resolved by resourceItemId, never numeric coincidence.
  await api('/api/resource-items','POST',{typeId:type.id,name:'Unconsumed catalogue reference'});
  for(const [index,label] of ['A','B'].entries()){
   const durations=index?[20,15,25,15]:[15,20,10,20];
   const zone=await api('/api/zones','POST',{name:`U00q ${label} production`}),spaces:any[]=[],templates:any[]=[];
   for(let n=0;n<4;n++)spaces.push(await api('/api/spaces','POST',{name:`U00q ${label} station ${n}`,zoneId:zone.id}));
   const catalogue=await api('/api/resource-items','POST',{typeId:type.id,name:`U00q ${label} measurement rig`,defaultAvailabilityStart:index?'10:00':'09:00',defaultAvailabilityEnd:index?'12:00':'11:00'});
   const spare=await api('/api/resource-items','POST',{typeId:type.id,name:`U00q ${label} substitute rig`,defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'16:00'});
   const windows=index?[['10:00','10:20'],['10:40','11:30'],['11:00','12:00'],['11:30','12:00']]:[['09:00','09:20'],['09:15','09:50'],['09:35','10:00'],['09:00','11:00']];
   for(let n=0;n<4;n++){
    await api(`/api/spaces/${spaces[n].id}/default-availability`,'PATCH',{availabilityStart:windows[n][0],availabilityEnd:windows[n][1]});
    templates.push(await api('/api/task-templates','POST',{name:`U00q ${label} ${n<3?'T'+(n+1):'independent'}`,defaultDuration:durations[n],spaceId:spaces[n].id,zoneId:zone.id,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,rulesJson:{plannerNextOperation:{contractVersion:1,kind:n===3?'auxiliary':'technical'}},resourceRequirements:{byItem:{[catalogue.id]:1}},dependsOnTemplateIds:n>0&&n<3?[templates[n-1].id]:[]}));
   }
   const general=await api('/api/new-day-planner-configuration');
   const config={contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0};
   await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:config});
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();
   const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(index?'2027-06-17':'2027-06-14');
   const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');
   await modal.getByRole('button',{name:'Crear día',exact:true}).click();const response=await created;assert.equal(response.status(),201);const day=await response.json(),planId=Number(day.id),path=`/api/plans/${planId}/assisted`,tasks:any[]=[];
   const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`U00q ${label} independent operator`,availabilityStart:windows[3][0],availabilityEnd:windows[3][1]});
   for(let n=0;n<4;n++)tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:templates[n].id,contestantId:n===3?person.id:null,spaceId:spaces[n].id,zoneId:zone.id}));
   const inventory=await api(`/api/plans/${planId}/resource-items`),kit=inventory.find((r:any)=>r.resourceItemId===catalogue.id),substitute=inventory.find((r:any)=>r.resourceItemId===spare.id);
   assert.ok(kit&&substitute);assert.equal(kit.planId,planId);
   const input=await buildEngineInput(planId,storage);
   const policy:NonNullable<EngineInput['technicalChains']>[number]={id:`u00q-${label}-chain`,orderedTaskIds:tasks.slice(0,3).map(t=>t.id),adjacency:'REQUIRED',resourceContinuity:'REQUIRED',requiredResourceIds:[kit.id]};
   const projected:EngineInput={...input,technicalChains:[policy]};
   save(`${label}-created`,{day,spaces,templates,tasks,catalogue,spare,inventory,kit,substitute,windows,durations,diagnosticPolicy:policy});
   save(`${label}-native-input`,input);save(`${label}-native-preflight`,observe(input));save(`${label}-explicit-input`,projected);save(`${label}-explicit-preflight`,observe(projected));
   assert.equal(input.technicalChains,undefined);assert.equal(adapt(input).status,'SUPPORTED');assert.equal(adapt(projected).status,'SUPPORTED');
   assert.deepEqual(input.tasks.slice(0,3).map(t=>t.dependsOnTaskIds),[[],[tasks[0].id],[tasks[1].id]]);
   save(`${label}-effective`,await api(`/api/plans/${planId}/effective-configuration`));
   const blank=buildAssistedPlanningSnapshotV1(await storage.getTasksForPlan(planId));
   save(`${label}-recommendations`,{native:recommendNextAssistedScope(input,blank),explicit:recommendNextAssistedScope(projected,blank)});
   const solve=(source:EngineInput,ids:number[],fixed:any[]=[])=>{
    const a=adapt(source);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
    const resolution=resolveAssistedScope(source,a,{kind:'TASK_IDS',taskIds:ids});
    const problem=buildAssistedProblem(a.problem,resolution.scope,fixed,analyticalFutureEligibleTaskIds(source,a.identityMap));
    return {resolution,problem,result:execute(problem)};
   };
   const chainIds=tasks.slice(0,3).map(t=>t.id),native=solve(input,chainIds),explicit=solve(projected,chainIds);
   save(`${label}-native-solver`,native);save(`${label}-explicit-solver`,explicit);
   save(`${label}-inferred-members`,getTechnicalChains(native.problem.problem.tasks));
   for(const [name,source] of [['native',input],['explicit',projected]] as const){
    save(`${label}-${name}-protected-prefix`,solve(source,chainIds.slice(1),native.result.proposal?.slice(0,1)??[]));
   }
   const isolatedTechnical={...input,tasks:input.tasks.map(t=>t.id===tasks[3].id?{...t,plannerNextKind:'technical' as const,contestantId:null}:t)};
   save(`${label}-isolated-technical`,{input:isolatedTechnical,...observe(isolatedTechnical),execution:solve(isolatedTechnical,[tasks[3].id])});
   assert.ok(native.result.proposal);assert.equal(native.result.evidence.hardValid,true);
   assert.deepEqual(native.result,execute(native.problem));assert.deepEqual(explicit.result,execute(explicit.problem));
   if(index){assert.equal(explicit.result.proposal,null);assert.ok(native.result.proposal![1].start>native.result.proposal![0].end);}
   else assert.ok(explicit.result.proposal);
   for(const [name,source] of [['native',input],['explicit',projected]] as const){
    save(`${label}-${name}-single`,solve(source,[tasks[0].id]));save(`${label}-${name}-tail`,solve(source,[tasks[2].id]));
    save(`${label}-${name}-independent`,solve(source,[tasks[3].id]));
   }
   const a=adapt(projected);if(a.status!=='SUPPORTED')throw Error('unsupported');
   const chainProblem=explicit.problem.originalValidationProblem;
   save(`${label}-native-under-explicit-validation`,validatePlan(chainProblem,[...native.result.proposal!]));
   // The B geometry requires an actual wait. This is a physical sensitivity probe only.
   const relaxed=index?{...projected,planSpaceSettings:projected.planSpaceSettings?.map(s=>s.spaceId===spaces[0].id?{...s,availabilityEnd:'11:00'}:s)}:projected;
   save(`${label}-relaxed-input`,relaxed);const feasible=solve(relaxed,chainIds);save(`${label}-relaxed-solver`,feasible);assert.ok(feasible.result.proposal);
   const good=feasible.result.proposal!;
   const gap=good.map((t,i)=>i?{...t,start:t.start+5,end:t.end+5}:t);
   const wrong=good.map((t,i)=>i===1?{...t,requiredResourceIds:[`plan-resource:${substitute.id}`]}:t);
   save(`${label}-gap-validation`,validatePlan(feasible.problem.originalValidationProblem,gap));
   save(`${label}-substitution-validation`,validatePlan(feasible.problem.originalValidationProblem,wrong));
   assert.ok(validatePlan(feasible.problem.originalValidationProblem,gap).reasonCodes.includes('TECHNICAL_CHAIN_VIOLATION'));
   assert.ok(validatePlan(feasible.problem.originalValidationProblem,wrong).reasonCodes.includes('TECHNICAL_CHAIN_VIOLATION'));
   const negatives:Record<string,EngineInput>={
    missingMember:{...projected,technicalChains:[{...policy,orderedTaskIds:[tasks[0].id,2147483000,tasks[2].id]}]},
    missingDependency:{...input,tasks:input.tasks.map(t=>t.id===tasks[1].id?{...t,dependsOnTaskId:2147483000,dependsOnTaskIds:[2147483000]}:t)},
    unavailableResource:{...projected,planResourceItems:projected.planResourceItems.map(r=>r.id===kit.id?{...r,availabilityStart:'08:00',availabilityEnd:'08:05'}:r)},
    unavailableSpace:{...projected,planSpaceSettings:projected.planSpaceSettings?.map(s=>s.spaceId===spaces[1].id?{...s,availabilityStart:'08:00',availabilityEnd:'08:05'}:s)},
   };
   for(const [name,negative] of Object.entries(negatives)){
    const observed=observe(negative);save(`${label}-negative-${name}`,{input:negative,...observed});
    if(observed.adapter.status==='SUPPORTED'){const r=solve(negative,chainIds);save(`${label}-negative-${name}-solver`,r);assert.equal(r.result.proposal,null);}else assert.ok(name.startsWith('missing'));
   }
   // Matching/candidate continuity: a physically available substitute cannot satisfy a required nominal ID.
   const substituted=structuredClone(feasible.problem.problem);substituted.tasks=substituted.tasks.map(t=>t.id===`task:${tasks[1].id}`?{...t,requiredResourceIds:[`plan-resource:${substitute.id}`]}:t);
   const candidateProbe=generateTechnicalChainCandidates(substituted,substituted.tasks,[],substituted.budget.maxBranchExpansions);
   save(`${label}-substitution-candidates`,candidateProbe);assert.equal(candidateProbe.candidates.length,0);
   if(!index){
    const futureExecution=solve(projected,[tasks[3].id]),future=futureExecution.problem.problem;
    assert.ok(futureExecution.result.proposal);assert.deepEqual(futureExecution.result.proposal.map(t=>t.id),[`task:${tasks[3].id}`]);
    let remaining=future.budget.maxBranchExpansions;const authority=new PreparedFutureTechnicalChainAuthority(future,()=>remaining,n=>{if(n>remaining)return false;remaining-=n;return true;});
    const reservation=authority.nextExactReservation(authority.reservationStructureIds()[0]!,futureExecution.result.proposal);
    save('A-future-exact-reservation',{contextOnly:true,reservation,evidence:authority.evidence,consumed:future.budget.maxBranchExpansions-remaining});
    assert.equal(reservation.status,'CANDIDATE');assert.equal(reservation.reservation?.scheduledTasks.length,3);assert.equal(authority.reservationRemainsValid(reservation.reservation!,futureExecution.result.proposal),true);
    const current=future.tasks.find(t=>t.id===`task:${tasks[3].id}`)!;
    const harmful={...current,start:550,end:570},safe={...current,start:600,end:620};
    const prune=probeTechnicalChainFutureReservations(future,[harmful],[harmful],future.budget.maxBranchExpansions),kept=probeTechnicalChainFutureReservations(future,[safe],[safe],future.budget.maxBranchExpansions);
    save('A-future-causal-probes',{future,harmful,safe,prune,kept,abstain:probeTechnicalChainFutureReservations(future,[harmful],[harmful],0)});
    assert.equal(prune.status,'PRUNE');assert.equal(prune.certifiedCausingTaskId,current.id);assert.equal(kept.status,'PASS');
   }
   const args=await configArgs(input),projectedArgs=await configArgs(projected),identity=buildEffectivePlanConfigRevisionV1(args),counterIdentity=buildEffectivePlanConfigRevisionV1(projectedArgs);
   save(`${label}-identities`,{actual:identity,explicit:counterIdentity,actualReplay:buildEffectivePlanConfigReplaySnapshotV1(args),explicitReplay:buildEffectivePlanConfigReplaySnapshotV1(projectedArgs)});assert.notEqual(identity.configurationFingerprint,counterIdentity.configurationFingerprint);
   const generalReject=await request('/api/new-day-planner-configuration','PUT',{expectedRevision:(await api('/api/new-day-planner-configuration')).revision,configuration:{...config,technicalChains:[policy]}});save(`${label}-general-rejection`,generalReject);assert.equal(generalReject.status,400);
   const state=await api(path+'/session','POST',{});save(`${label}-S0`,state);
   const dayReject=await request(`/api/plans/${planId}/day-configuration`,'PUT',{expectedRevisionId:state.currentConfigRevisionId,technicalChains:[policy]});save(`${label}-daily-rejection`,dayReject);assert.ok(dayReject.status>=400);
   for(const role of ['viewer','aux','norole']){const denial=await request(path+'/proposals','POST',{...expected(state),selector:{kind:'TASK_IDS',taskIds:chainIds}},role);save(`${label}-permission-${role}`,denial);assert.equal(denial.status,403);}
   const stages:any[]=[];
   for(const [stage,ids] of [chainIds,[tasks[3].id]].entries()){
    const before=await api(path),requested=await api(path+'/proposals','POST',{...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true}),run=await poll(path,requested.runId);
    save(`${label}-S${stage+1}-run`,run);assert.equal(run.assisted_result_json.outcome,'PROPOSAL');
    const again=await poll(path,(await api(path+'/proposals','POST',{...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true})).runId);save(`${label}-S${stage+1}-repeat`,again);
    assert.deepEqual(again.assisted_result_json.proposedDraftSnapshot,run.assisted_result_json.proposedDraftSnapshot);
    assert.equal(again.assisted_result_json.evidence.fingerprint,run.assisted_result_json.evidence.fingerprint);
    if(stage===0){
     const access:AssistedProposalRunAccess={create:async()=>{throw Error('no write');},find:async()=>({data:run,error:null}),fail:async()=>{throw Error('no write');},apply:async()=>{throw Error('no write');},finish:async()=>{throw Error('strict run must not finish');}};
     const strict=new AssistedProposalService(storage,()=>{},access,execute,{buildInput:async()=>projected,buildConfigRevision:buildEffectivePlanConfigRevisionV1});
     await assert.rejects(()=>strict.run(planId,run.id),(e:any)=>{save(`${label}-authentic-revision-barrier`,{code:e.code,message:e.message,acceptedExplicitStage:false});return e.code==='STALE_CONFIG_REVISION';});
     if(!index){
      let captured:any;
      const simulatedStorage=new Proxy(storage,{get(target,key){if(key==='getPlanConfigRevision')return async(id:number)=>({...await target.getPlanConfigRevision(id),fingerprint:counterIdentity.configurationFingerprint,identityJson:counterIdentity,replaySnapshotJson:buildEffectivePlanConfigReplaySnapshotV1(projectedArgs)});const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
      const simulation=new AssistedProposalService(simulatedStorage,()=>{},{...access,finish:async(_p,_r,result)=>{captured=result;return {error:null};}},execute,{buildInput:async()=>projected,buildConfigRevision:buildEffectivePlanConfigRevisionV1});
      await simulation.run(planId,run.id);
      save('A-simulated-explicit-snapshot',{simulationOnly:true,intervention:'projected input and ephemeral revision read; finish captured in memory, no DB/Draft/Stage write',result:captured});
      assert.equal(captured.outcome,'PROPOSAL');assert.equal(captured.proposedDraftSnapshot.tasks.length,4);
      const validation=createManualDeltaValidationHarness(a.problem,a.identityMap)(projected,captured.proposedDraftSnapshot,chainIds);
      save('A-simulated-explicit-snapshot-validation',validation);assert.equal(validation.hardValid,true);
      save('A-simulated-explicit-snapshot-fingerprint',{recomputed:fingerprintAssistedPlanningSnapshotV1(captured.proposedDraftSnapshot),declared:captured.proposedDraftFingerprint});assert.equal(fingerprintAssistedPlanningSnapshotV1(captured.proposedDraftSnapshot),captured.proposedDraftFingerprint);
     }
     await db.query('BEGIN');try{try{await db.query('UPDATE plans SET planner_next_configuration=$1 WHERE id=$2',[{contractVersion:1,taskOperations:[],technicalChains:[policy]},planId]);assert.fail('immutable write accepted');}catch(e:any){save(`${label}-SQL-immutable`,{code:e.code,message:e.message});assert.equal(e.message,'PLANNER_NEXT_CONFIGURATION_IMMUTABLE');}}finally{await db.query('ROLLBACK');}
     await db.query('BEGIN');try{await db.query('SET LOCAL ROLE service_role');const rev=(await db.query('SELECT current_config_revision_id FROM plans WHERE id=$1',[planId])).rows[0].current_config_revision_id;
      try{const written=await db.query('SELECT public.apply_day_config_operation_v5($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[planId,users.admin.id,'EDIT',{},rev,identity,buildEffectivePlanConfigReplaySnapshotV1(args),counterIdentity,buildEffectivePlanConfigReplaySnapshotV1(projectedArgs),{}]);save(`${label}-SQL-replay-accepted-rollback`,{transactionRolledBack:true,written:written.rows,plan:(await db.query('SELECT planner_next_profile,planner_next_configuration,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows,revision:(await db.query('SELECT * FROM plan_config_revisions WHERE id=(SELECT current_config_revision_id FROM plans WHERE id=$1)',[planId])).rows});}catch(e:any){save(`${label}-SQL-replay-barrier`,{code:e.code,message:e.message,rev});assert.notEqual(e.code,'ERR_ASSERTION');}
     }finally{await db.query('ROLLBACK');}
     assert.deepEqual(await api(path),before);
    }
    if(stage)for(const old of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(run.assisted_result_json.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===old.taskId),old);
    const stale=await request(path+`/proposals/${run.id}/apply`,'POST',{...expected(before),expectedDraftFingerprint:'0'.repeat(64)});save(`${label}-S${stage+1}-stale`,stale);assert.equal(stale.status,409);
    await api(path+`/proposals/${run.id}/apply`,'POST',expected(before));const draft=await api(path);save(`${label}-S${stage+1}-draft`,draft);
    await api(path+'/validate','POST',expected(draft));const validated=await api(path);save(`${label}-S${stage+1}-validation`,validated.validation);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
    const accepted=await api(path+'/accept-stage','POST',expected(validated));save(`${label}-S${stage+1}-accepted`,accepted);assert.equal(accepted.activeStage.ordinal,stage+1);stages.push(accepted.activeStage);
    save(`${label}-S${stage+1}-persisted`,(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
    await page.goto(`${appUrl}/plans/${planId}?tab=planning`);await page.getByTestId('assisted-workspace').waitFor();await page.screenshot({path:`${directory}/${label}-S${stage+1}.png`,fullPage:true});
   }
   const rollback=await api(path+'/rollback','POST',{targetStageId:state.activeStage.id}),redo1=await api(path+'/redo','POST',{}),redo=await api(path+'/redo','POST',{});save(`${label}-restore`,{rollback,redo1,redo});assert.deepEqual(redo.activeStage,stages[1]);
   if(!index){
    const reset=await api(path+'/rollback','POST',{targetStageId:state.activeStage.id});
    const prefixRun=await poll(path,(await api(path+'/proposals','POST',{...expected(reset),selector:{kind:'TASK_IDS',taskIds:chainIds.slice(0,2)},includePrerequisites:true})).runId);
    save('A-native-prefix-run',prefixRun);assert.equal(prefixRun.assisted_result_json.outcome,'PROPOSAL');
    await api(path+`/proposals/${prefixRun.id}/apply`,'POST',expected(reset));let prefixState=await api(path);await api(path+'/validate','POST',expected(prefixState));prefixState=await api(path);
    const prefixStage=await api(path+'/accept-stage','POST',expected(prefixState));save('A-native-prefix-accepted',prefixStage);
    const tailRun=await poll(path,(await api(path+'/proposals','POST',{...expected(prefixStage),selector:{kind:'TASK_IDS',taskIds:[chainIds[2]]},includePrerequisites:true})).runId);
    save('A-native-prefix-continuation',tailRun);assert.equal(tailRun.assisted_result_json.outcome,'NO_PROPOSAL');
    assert.ok(tailRun.assisted_result_json.reasonCodes.some((r:string)=>r.includes('UNSUPPORTED_STANDALONE_TASK_KIND')));
    assert.deepEqual((await api(path)).draft,prefixStage.draft);
   }
   days.push({label,planId,taskIds:tasks.map(t=>t.id),kitId:kit.id,catalogueId:catalogue.id,stageIds:stages.map(s=>s.id),nativeCompleted:4,explicitStageAccepted:false});pass(`${label}: dependencies, nominal identity, counterfactual policy, barriers and two real Stages`);
  }
  save('days',days);return {days,remoteWrites:0,explicitStagesAccepted:0};
 }finally{await browser.close();}
}
