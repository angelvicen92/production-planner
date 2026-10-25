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
import {getTechnicalChains,pendingTechnicalChains} from '../../../engine/planner-next/technicalChains';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
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
 const observe=(input:EngineInput)=>({preflight:preflight(input),adapter:adapt(input)});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),days:any[]=[];
 try{
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await api('/api/program-settings','PATCH',{defaultWorkStart:'08:00',defaultWorkEnd:'16:00',mealStart:'13:00',mealEnd:'14:00',mealTaskTemplateId:null,mealMode:'global_hard_break'});
  const type=await api('/api/resource-types','POST',{code:'u00r_physical',name:'U00r physical equipment'});
  // Catalogue and day inventory are resolved by resourceItemId, never numeric coincidence.
  await api('/api/resource-items','POST',{typeId:type.id,name:'Unconsumed catalogue reference'});
  if(process.env.U00R_REPEAT==='1'){
   const z=await api('/api/zones','POST',{name:'Repeat identity padding'});
   const sp=await api('/api/spaces','POST',{name:'Repeat padding room',zoneId:z.id});
   const tt=await api('/api/task-templates','POST',{name:'Repeat padding task',defaultDuration:5,spaceId:sp.id,zoneId:z.id,autoCreateOnContestantCreate:false});
   const day=await api('/api/plans','POST',{date:'2027-06-01',configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'}}});
   await api('/api/daily-tasks','POST',{planId:day.id,templateId:tt.id,spaceId:sp.id,zoneId:z.id,contestantId:null});
   await api('/api/resource-items','POST',{typeId:type.id,name:'Repeat identity padding rig'});
  }
  for(const [index,label] of ['A','B'].entries()){
   const durations=index?[20,15,25,15]:[15,20,10,20];
   const zone=await api('/api/zones','POST',{name:`U00r ${label} production`}),spaces:any[]=[],templates:any[]=[];
   for(let n=0;n<4;n++)spaces.push(await api('/api/spaces','POST',{name:`U00r ${label} station ${n}`,zoneId:zone.id}));
   const catalogue=await api('/api/resource-items','POST',{typeId:type.id,name:`U00r ${label} measurement rig`,defaultAvailabilityStart:index?'10:00':'09:00',defaultAvailabilityEnd:index?'12:00':'11:00'});
   const spare=await api('/api/resource-items','POST',{typeId:type.id,name:`U00r ${label} substitute rig`,defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'16:00'});
   const windows=index?[['10:00','10:20'],['10:40','11:30'],['11:00','12:00'],['11:30','12:00']]:[['09:00','09:20'],['09:15','09:50'],['09:35','10:00'],['09:00','11:00']];
   for(let n=0;n<4;n++){
    await api(`/api/spaces/${spaces[n].id}/default-availability`,'PATCH',{availabilityStart:windows[n][0],availabilityEnd:windows[n][1]});
    templates.push(await api('/api/task-templates','POST',{name:`U00r ${label} ${n<3?'T'+(n+1):'independent'}`,defaultDuration:durations[n],spaceId:spaces[n].id,zoneId:zone.id,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,rulesJson:{plannerNextOperation:{contractVersion:1,kind:n===3?'auxiliary':'technical'}},resourceRequirements:{byItem:{[catalogue.id]:1}},dependsOnTemplateIds:n>0&&n<3?[templates[n-1].id]:[]}));
   }
   const general=await api('/api/new-day-planner-configuration');
   const config={contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0};
   await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:config});
   await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();
   const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill(index?'2027-06-17':'2027-06-14');
   const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans'&&r.request().method()==='POST');
   await modal.getByRole('button',{name:'Crear día',exact:true}).click();const response=await created;assert.equal(response.status(),201);const day=await response.json(),planId=Number(day.id),path=`/api/plans/${planId}/assisted`,tasks:any[]=[];
   const person=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:`U00r ${label} independent operator`,availabilityStart:windows[3][0],availabilityEnd:windows[3][1]});
   for(let n=0;n<4;n++)tasks.push(await api('/api/daily-tasks','POST',{planId,templateId:templates[n].id,contestantId:n===3?person.id:null,spaceId:spaces[n].id,zoneId:zone.id}));
   const inventory=await api(`/api/plans/${planId}/resource-items`),kit=inventory.find((r:any)=>r.resourceItemId===catalogue.id),substitute=inventory.find((r:any)=>r.resourceItemId===spare.id);
   assert.ok(kit&&substitute);assert.equal(kit.planId,planId);
   // B starts from an ordinary human planned root captured by the native S0
   // bootstrap. No policy/revision/snapshot injection or SQL state mutation.
   if(index)await api(`/api/daily-tasks/${tasks[0].id}`,'PATCH',{plannedStart:'10:00',plannedEnd:'10:20'});
   const input=await buildEngineInput(planId,storage);
   const chainIds=tasks.slice(0,3).map(t=>t.id);
   save(`${label}-created`,{day,spaces,templates,tasks,catalogue,spare,inventory,kit,substitute,windows,durations});
   save(`${label}-native-input`,input);save(`${label}-preflight`,observe(input));
   assert.equal(input.technicalChains,undefined);const adapted=adapt(input);assert.equal(adapted.status,'SUPPORTED');if(adapted.status!=='SUPPORTED')throw Error('unsupported');
   assert.deepEqual(input.tasks.filter(t=>chainIds.includes(t.id)).map(t=>t.dependsOnTaskIds),[[],[tasks[0].id],[tasks[1].id]]);
   const bootstrap=await api(path+'/session','POST',{});save(`${label}-S0`,bootstrap);
   if(index)assert.equal(bootstrap.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned).length,1);
   const stages:any[]=[],runs:any[]=[];
   const prefixCount=index?1:2;
   const selections=index?[chainIds.slice(1),[tasks[3].id]]:[chainIds.slice(0,2),chainIds.slice(2),[tasks[3].id]];
   for(const [stage,ids] of selections.entries()){
    const before=await api(path),req={...expected(before),selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true};save(`${label}-S${stage+1}-request`,req);
    const run=await poll(path,(await api(path+'/proposals','POST',req)).runId);save(`${label}-S${stage+1}-run`,run);runs.push(run);
    assert.equal(run.assisted_result_json.outcome,'PROPOSAL');
    const again=await poll(path,(await api(path+'/proposals','POST',req)).runId);save(`${label}-S${stage+1}-repeat`,again);
    assert.deepEqual(again.assisted_result_json.proposedDraftSnapshot,run.assisted_result_json.proposedDraftSnapshot);
    assert.equal(again.assisted_result_json.evidence.fingerprint,run.assisted_result_json.evidence.fingerprint);
    for(const old of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(run.assisted_result_json.proposedDraftSnapshot.tasks.find((t:any)=>t.taskId===old.taskId),old);
    const stale=await request(path+`/proposals/${run.id}/apply`,'POST',{...expected(before),expectedDraftFingerprint:'0'.repeat(64)});save(`${label}-S${stage+1}-stale`,stale);assert.equal(stale.status,409);
    if(stage===(index?0:1)){
     const fixed=before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned);
     // Product snapshots can use timestamps; derive canonical protected placements
     // from the first native proposal whose hours were accepted unchanged.
     const acceptedIds=new Set<string>(fixed.map((t:any)=>`task:${t.taskId}`));
     const prefix=runs[0].assisted_result_json.evidence;save(`${label}-prefix-product-evidence`,prefix);
     const all=buildAssistedProblem(adapted.problem,resolveAssistedScope(input,adapted,{kind:'TASK_IDS',taskIds:chainIds}).scope,[]);
     const original=execute(all);assert.ok(original.proposal);
     const anchors=original.proposal!.filter(t=>acceptedIds.has(t.id));
     const resolution=resolveAssistedScope(input,adapted,{kind:'TASK_IDS',taskIds:chainIds.slice(prefixCount)});
     const scoped=buildAssistedProblem(adapted.problem,resolution.scope,anchors,analyticalFutureEligibleTaskIds(input,adapted.identityMap));
     const pending=scoped.problem.tasks.filter(t=>!acceptedIds.has(t.id));
     save(`${label}-classification`,{pendingOnly:getTechnicalChains(pending).map(c=>c.map(t=>t.id)),effective:pendingTechnicalChains(scoped.problem.tasks,pending,acceptedIds).map(c=>c.map(t=>t.id)),scoped,anchors});
     const result=execute(scoped),reverse=structuredClone(scoped);reverse.problem.tasks.reverse();reverse.problem.spaces.reverse();reverse.problem.resources.reverse();
     assert.ok(result.proposal);assert.deepEqual(execute(reverse),result);save(`${label}-inverse-collections`,{original:result,inverted:execute(reverse)});
     const wrong=structuredClone(anchors);wrong[0].requiredResourceIds=[`plan-resource:${substitute.id}`];
     assert.throws(()=>buildAssistedProblem(adapted.problem,resolution.scope,wrong),/PROTECTED_PLACEMENT_TASK_MISMATCH/);
     save(`${label}-protected-resource-rejection`,{error:'PROTECTED_PLACEMENT_TASK_MISMATCH',attempted:wrong});
     const changed=result.proposal!.map(t=>({...t,requiredResourceIds:[`plan-resource:${substitute.id}`]}));
     const invalid=validatePlan(scoped.originalValidationProblem,[...anchors,...changed]);save(`${label}-nominal-substitution`,invalid);assert.equal(invalid.hardValid,false);
    }
    await api(path+`/proposals/${run.id}/apply`,'POST',expected(before));let draft=await api(path);
    save(`${label}-S${stage+1}-draft`,draft);
    await api(path+'/validate','POST',expected(draft));let validated=await api(path);save(`${label}-S${stage+1}-validation`,validated.validation);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
    const staleAccept=await request(path+'/accept-stage','POST',{...expected(validated),expectedBaseStageId:2147483000});save(`${label}-S${stage+1}-forged-stage`,staleAccept);assert.equal(staleAccept.status,409);
    const forgedSnapshot=await request(path+'/draft','PATCH',{...expected(validated),changes:[{taskId:tasks[0].id,assignedResourceIds:[substitute.id]}]});save(`${label}-S${stage+1}-forged-resource`,forgedSnapshot);assert.ok(forgedSnapshot.status>=400);assert.match(forgedSnapshot.body.message,/assignedResourceIds/);assert.deepEqual((await api(path)).draft,validated.draft);
    const accepted=await api(path+'/accept-stage','POST',expected(validated));save(`${label}-S${stage+1}-accepted`,accepted);stages.push(accepted.activeStage);
    const complete=accepted.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned);assert.equal(complete.length,index?(stage===0?3:4):(stage===0?prefixCount:stage===1?3:4));
    for(const old of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(complete.find((t:any)=>t.taskId===old.taskId),old);
    save(`${label}-S${stage+1}-persisted`,(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
    await page.goto(`${appUrl}/plans/${planId}?tab=planning`);await page.getByTestId('assisted-workspace').waitFor();await page.screenshot({path:`${directory}/${label}-S${stage+1}.png`,fullPage:true});
   }
   const initial=await api(path);const s0=initial.history.find((s:any)=>s.ordinal===0);
   const rollback=await api(path+'/rollback','POST',{targetStageId:s0.id}),redos=[];
   for(let n=0;n<stages.length;n++)redos.push(await api(path+'/redo','POST',{}));save(`${label}-restore`,{rollback,redos});assert.deepEqual(redos.at(-1).activeStage,stages.at(-1));
   // A human edit creates a fresh non-empty delta; validate it before changing
   // configuration, then demonstrate that its proof cannot authorize acceptance.
   const independent=stages.at(-1).snapshotJson.tasks.find((t:any)=>t.taskId===tasks[3].id);
   const plus5=(value:string)=>{const m=Number(value.slice(0,2))*60+Number(value.slice(3,5))+5;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;};
   const edited=await api(path+'/draft','PATCH',{...expected(redos.at(-1)),changes:[{taskId:tasks[3].id,startPlanned:plus5(independent.startPlanned),endPlanned:plus5(independent.endPlanned)}]});
   await api(path+'/validate','POST',expected(edited));const validBefore=await api(path);save(`${label}-validated-negative-draft`,validBefore);
   const edit=await api(`/api/plans/${planId}/day-configuration`,'PUT',{workday:{start:'08:00',end:'16:05'}});save(`${label}-configuration-after-validation`,edit);
   const staleConfig=await request(path+'/accept-stage','POST',expected(validBefore));save(`${label}-stale-configuration-accept`,staleConfig);assert.equal(staleConfig.status,409);assert.equal(staleConfig.body.code,'STALE_VALIDATION');
   assert.deepEqual((await api(path)).activeStage,stages.at(-1));
   days.push({label,planId,taskIds:tasks.map(t=>t.id),kitId:kit.id,catalogueId:catalogue.id,prefixCount,stageIds:stages.map(s=>s.id),fingerprints:stages.map(s=>s.snapshotFingerprint),completed:4});pass(`${label}: protected prefix ${prefixCount}, real continuation, 4/4, rollback/redo and negatives`);
  }
  save('days',days);return {days,remoteWrites:0,explicitStagesAccepted:0};
 }finally{await browser.close();}
}
