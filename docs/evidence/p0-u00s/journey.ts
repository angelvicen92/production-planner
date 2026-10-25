import { configurationAttacks, certificateAttacks } from "./attacks";
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium} from 'playwright';
import type {EngineInput} from '../../../engine/types';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {preflightEngineInputForPlannerNext as preflight} from '../../../engine/planner-next/integration/engineInputPreflight';
import {buildAssistedProblem,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {validatePlan} from '../../../engine/planner-next/validate';
import {getTechnicalChains,pendingTechnicalChains} from '../../../engine/planner-next/technicalChains';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
const hhmm=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
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
 const observe=(input:EngineInput)=>({preflight:preflight(input),adapter:adapt(input)});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),days:any[]=[];
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'08:00',defaultWorkEnd:'16:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'u00s_physical',name:'U00s physical equipment'});
  // Catalogue and day inventory are resolved by resourceItemId, never numeric coincidence.
  await api('/api/resource-items','POST',{typeId:type.id,name:'Unconsumed catalogue reference'});
  if(process.env.U00S_REPEAT==='1'){
   const z=await api('/api/zones','POST',{name:'Repeat identity padding'});
   const sp=await api('/api/spaces','POST',{name:'Repeat padding room',zoneId:z.id});
   const tt=await api('/api/task-templates','POST',{name:'Repeat padding task',defaultDuration:5,spaceId:sp.id,zoneId:z.id,autoCreateOnContestantCreate:false});
   const day=await api('/api/plans','POST',{date:'2027-06-01',configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'}}});
   await api('/api/daily-tasks','POST',{planId:day.id,templateId:tt.id,spaceId:sp.id,zoneId:z.id,contestantId:null});
   await api('/api/resource-items','POST',{typeId:type.id,name:'Repeat identity padding rig'});
  }
  for(const [index,label] of ['A','B','C','D'].entries()){
   const durations=(index===1||index===2)?[20,15,25,15]:[15,20,10,20];
   const zone=await api('/api/zones','POST',{name:`U00s ${label} production`}),spaces:any[]=[],templates:any[]=[];
   for(let n=0;n<4;n++)spaces.push(await api('/api/spaces','POST',{name:`U00s ${label} station ${n}`,zoneId:zone.id}));
   const catalogue=await api('/api/resource-items','POST',{typeId:type.id,name:`U00s ${label} measurement rig`,defaultAvailabilityStart:(index===1||index===2)?'10:00':'09:00',defaultAvailabilityEnd:(index===1||index===2)?'12:00':'11:00'});
   const spare=await api('/api/resource-items','POST',{typeId:type.id,name:`U00s ${label} substitute rig`,defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'16:00'});
   const windows=(index===1||index===2)?[['10:00',index===2?'11:00':'10:20'],['10:40','11:30'],['11:00','12:00'],['11:30','12:00']]:[['09:00','09:20'],['09:15','09:50'],['09:35','10:00'],['09:00','11:00']];
   for(let n=0;n<4;n++){
    await api(`/api/spaces/${spaces[n].id}/default-availability`,'PATCH',{availabilityStart:windows[n][0],availabilityEnd:windows[n][1]});
    templates.push(await api('/api/task-templates','POST',{name:`U00s ${label} ${n<3?'T'+(n+1):'independent'}`,defaultDuration:durations[n],spaceId:spaces[n].id,zoneId:zone.id,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,rulesJson:{plannerNextOperation:{contractVersion:1,kind:n===3?'auxiliary':'technical'}},resourceRequirements:{byItem:{[catalogue.id]:1}},dependsOnTemplateIds:n>0&&n<3?[templates[n-1].id]:[]}));
   }
   const general=await api('/api/new-day-planner-configuration');
   const config={contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0};
   await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:config});
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();
   const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(index===3?'2027-06-19':index===2?'2027-06-18':index?'2027-06-17':'2027-06-14');
   const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');
   await modal.getByRole('button',{name:'Crear día',exact:true}).click();const response=await created;assert.equal(response.status(),201);const day=await response.json(),planId=Number(day.id),path=`/api/plans/${planId}/assisted`,tasks:any[]=[];
   const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`U00s ${label} independent operator`,availabilityStart:windows[3][0],availabilityEnd:windows[3][1]});
   for(const n of [2,0,1,3])tasks[n]=await api('/api/daily-tasks','POST',{planId,templateId:templates[n].id,contestantId:n===3?person.id:null,spaceId:spaces[n].id,zoneId:zone.id});
   const inventory=await api(`/api/plans/${planId}/resource-items`),kit=inventory.find((r:any)=>r.resourceItemId===catalogue.id),substitute=inventory.find((r:any)=>r.resourceItemId===spare.id);
   assert.ok(kit&&substitute);assert.equal(kit.planId,planId);
   const chainIds=tasks.slice(0,3).map(t=>t.id),configPath=`/api/plans/${planId}/day-configuration`;
   const before=await buildEngineInput(planId,storage);save(`${label}-before-input`,before);
   assert.equal(before.technicalChains,undefined);
   const ordinary=adapt(before);assert.equal(ordinary.status,'SUPPORTED');if(ordinary.status!=='SUPPORTED')throw Error('unsupported');
   const ordinarySolution=execute(buildAssistedProblem(ordinary.problem,resolveAssistedScope(before,ordinary,{kind:'TASK_IDS',taskIds:chainIds}).scope,[]));
   save(`${label}-ordinary-solver`,ordinarySolution);assert.ok(ordinarySolution.proposal);
   const state=await api(path+'/session','POST',{});save(`${label}-S0`,state);
   await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);
   const editor=page.getByTestId('daily-technical-chain');await editor.waitFor();
   await editor.getByRole('button',{name:'Crear cadena técnica',exact:true}).click();
   for(let n=0;n<3;n++)await editor.getByLabel(`Miembro U00s ${label} T${n+1}`,{exact:true}).check();
   await editor.getByLabel(`Equipo U00s ${label} measurement rig`,{exact:true}).check();
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname===configPath&&r.request().method()==='PUT');
   await editor.getByRole('button',{name:'Guardar cadena técnica',exact:true}).click();const written=await saved;assert.equal(written.status(),200,await written.text());
   save(`${label}-stored-authority`,(await db.query('SELECT daily_technical_chains FROM plans WHERE id=$1',[planId])).rows);
   save(`${label}-immediate-input`,await buildEngineInput(planId,storage));
   const {buildEffectiveConfigurationView}=await import('../../../server/effectiveConfigurationView');
   save(`${label}-immediate-view`,await buildEffectiveConfigurationView(storage,planId));
   await page.reload();await editor.getByText(/Cadena efectiva y versionada/).waitFor();await editor.screenshot({path:`${directory}/${label}-configuration.png`});
   let effective=await api(`/api/plans/${planId}/effective-configuration`);save(`${label}-effective`,effective);
   const structure=effective.technicalChains.authority;
   assert.deepEqual(structure.policies[0].orderedTaskIds,chainIds);assert.notDeepEqual(chainIds,[...chainIds].sort((a,b)=>a-b));
   const input=await buildEngineInput(planId,storage);save(`${label}-input`,input);save(`${label}-preflight`,observe(input));
   assert.equal(preflight(input).status,'SUPPORTED');assert.equal(effective.readiness.status,'READY');
   assert.deepEqual(input.technicalChains,structure.policies);
   const adapted=adapt(input);assert.equal(adapted.status,'SUPPORTED');if(adapted.status!=='SUPPORTED')throw Error('unsupported');
   assert.deepEqual(resolveAssistedScope(input,adapted,{kind:'TASK_IDS',taskIds:[chainIds[1]]}).productTaskIds,[...chainIds].sort((a,b)=>a-b));
   await configurationAttacks({db,storage,planId,users,structure,revision:effective.technicalChains.revisionId,directory,label,request,configPath,substituteId:substitute.id,foreignTaskId:days[0]?.chainIds[0],foreignResourceId:days[0]?.kitId});
   effective=await api(`/api/plans/${planId}/effective-configuration`);
   const stages:any[]=[];
   if(index===1){
    const b=await api(path),run=await poll(path,(await api(path+'/proposals','POST',{...expected(b),selector:{kind:'TASK_IDS',taskIds:[chainIds[0]]},includePrerequisites:true})).runId);
    save(`${label}-no-proposal`,run);assert.equal(run.assisted_result_json.outcome,'NO_PROPOSAL');
    assert.ok(!run.assisted_result_json.reasonCodes.includes('TIME_LIMIT'));
    const refused=await request(path+'/accept-stage','POST',expected(b));save('B-no-validation-accept',refused);assert.equal(refused.status,409);
    // The real pre-policy ordinary proposal fits with gaps; it cannot certify REQUIRED.
    const bad=structuredClone(b.draft);
    for(const t of ordinarySolution.proposal!){const row=bad.tasks.find((x:any)=>x.taskId===Number(t.id.slice(5)));Object.assign(row,{startPlanned:hhmm(t.start),endPlanned:hhmm(t.end),assignedResourceIds:[kit.id]});}
    let refusal:any;await db.query('BEGIN');
    try{await db.query('SET LOCAL ROLE service_role');await db.query('SELECT public.assert_daily_technical_chain_snapshot($1,$2,$3,NULL)',[planId,bad,b.currentConfigRevisionId]);refusal={accepted:true};}
    catch(e:any){refusal={accepted:false,code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
    save('B-ordinary-gap-certificate-rejected',refusal);assert.equal(refusal.message,'TECHNICAL_CHAIN_CERTIFICATE_INVALID');
    await page.goto(`${appUrl}/plans/${planId}?tab=planning`);await page.getByTestId('assisted-workspace').waitFor();
    await page.getByRole('button',{name:'Sugerir siguiente alcance',exact:true}).click();
    await page.getByRole('button',{name:'Generar propuesta',exact:true}).click();
    await page.getByText(/No existe un tramo continuo compatible/).waitFor();
    await page.screenshot({path:`${directory}/${label}-no-proposal.png`,fullPage:true});
    days.push({label,planId,chainIds,kitId:kit.id,stageIds:[],outcome:'NO_PROPOSAL'});pass('B: valid rule, physically empty REQUIRED domain, no Stage');continue;
   }
   for(const [stage,ids] of (index===3?[[tasks[3].id],[chainIds[1]]]:[[chainIds[1]],[tasks[3].id]]).entries()){
    const b=await api(path),req={...expected(b),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true};save(`${label}-S${stage+1}-request`,req);
    const run=await poll(path,(await api(path+'/proposals','POST',req)).runId);save(`${label}-S${stage+1}-run`,run);
    assert.equal(run.assisted_result_json.outcome,'PROPOSAL');
    const again=await poll(path,(await api(path+'/proposals','POST',req)).runId);save(`${label}-S${stage+1}-repeat`,again);
    assert.deepEqual(again.assisted_result_json.proposedDraftSnapshot,run.assisted_result_json.proposedDraftSnapshot);
    assert.equal(again.assisted_result_json.evidence.fingerprint,run.assisted_result_json.evidence.fingerprint);
    save(`${label}-S${stage+1}-repeat-discarded`,await api(path+`/proposals/${again.id}/discard`,'POST',expected(b)));
    await certificateAttacks({db,run,state:b,planId,directory,label:label+'-S'+(stage+1),chainIds,substituteId:substitute.id});
    const pending=await request(configPath,'PUT',{technicalChains:{contractVersion:1,policies:[]},expectedRevisionId:effective.technicalChains.revisionId});save(`${label}-pending-proposal`,pending);assert.equal(pending.status,409);
    await api(path+`/proposals/${run.id}/apply`,'POST',expected(b));const draft=await api(path);save(`${label}-S${stage+1}-draft`,draft);
    const dirty=await request(configPath,'PUT',{technicalChains:{contractVersion:1,policies:[]},expectedRevisionId:effective.technicalChains.revisionId});save(`${label}-S${stage+1}-dirty-draft-edit`,dirty);assert.equal(dirty.status,409);assert.match(dirty.body.message,/TECHNICAL_CHAIN_DIRTY_DRAFT/);
    await api(path+'/validate','POST',expected(draft));const validated=await api(path);save(`${label}-S${stage+1}-validation`,validated.validation);
    assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
    const accepted=await api(path+'/accept-stage','POST',expected(validated));save(`${label}-S${stage+1}-accepted`,accepted);stages.push(accepted.activeStage);
    assert.equal(accepted.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned).length,stage===0?(index===3?1:3):4);
    for(const old of b.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((t:any)=>t.taskId===old.taskId),old);
    save(`${label}-S${stage+1}-persisted`,(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
    await page.goto(`${appUrl}/plans/${planId}?tab=planning`);await page.getByTestId('assisted-workspace').waitFor();await page.screenshot({path:`${directory}/${label}-S${stage+1}.png`,fullPage:true});
   }
   const stored=(await db.query('SELECT daily_technical_chains,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows;
   const rollback=await api(path+'/rollback','POST',{targetStageId:state.activeStage.id});
   const historical=await request(configPath,'PUT',{technicalChains:{contractVersion:1,policies:[]},expectedRevisionId:effective.technicalChains.revisionId});save(`${label}-historical-protected-removal`,historical);assert.equal(historical.body.message,'TECHNICAL_CHAIN_PROTECTED_DECISIONS');
   const redo1=await api(path+'/redo','POST',{}),redo=await api(path+'/redo','POST',{});save(`${label}-restore`,{rollback,redo1,redo});
   assert.deepEqual(redo.activeStage,stages[1]);assert.deepEqual((await db.query('SELECT daily_technical_chains,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows,stored);
   const removal=await request(configPath,'PUT',{technicalChains:{contractVersion:1,policies:[]},expectedRevisionId:effective.technicalChains.revisionId});save(`${label}-protected-removal`,removal);assert.equal(removal.status,409);assert.equal(removal.body.message,'TECHNICAL_CHAIN_PROTECTED_DECISIONS');
   save(`${label}-configuration-receipt`,(await db.query('SELECT p.daily_technical_chains,r.* FROM plans p JOIN plan_config_revisions r ON r.id=p.current_config_revision_id WHERE p.id=$1',[planId])).rows);
   if(index===3){
    const future=JSON.parse(readFileSync(`${directory}/D-S1-run.json`,'utf8')).assisted_result_json;
    assert.equal(future.proposal.length,1);assert.equal(future.proposal[0].taskId,tasks[3].id);
    assert.ok(future.proposedDraftSnapshot.tasks.filter((t:any)=>chainIds.includes(t.taskId)).every((t:any)=>t.startPlanned===null));
    assert.equal(future.evidence.technicalChainCertificate.tasks.length,3);
   }
   days.push({label,planId,chainIds,kitId:kit.id,stageIds:stages.map(s=>s.id),completed:4});pass(index===3?"D: independent S1 with context-only REQUIRED witness → chain S2 → 4/4":`${label}: UI REQUIRED rule → contiguous chain S1 → independent S2 → 4/4`);
  }
  save('days',days);return {days,remoteWrites:0};
 }finally{await browser.close();}
}
