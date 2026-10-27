/** Tests the existing participant-meal contract beside the new physical authority. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {buildEngineInput} from '../../../engine/buildInput';
import {inspect} from '../p0-u00y/consumer';
import {validatePlan} from '../../../engine/planner-next/validate';
export async function individualDiagnostic(ctx:any){
 const {appUrl,users,db,directory,pass}=ctx,{storage}=await import('../../../server/storage');
 const receipts:any[]=[];const save=(n:string,v:any)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const request=async(path:string,method='GET',body?:unknown)=>{const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users.admin.token}`},body:body===undefined?undefined:JSON.stringify(body)});const response={status:r.status,body:await r.json() as any};receipts.push({path,method,body,response});return response;};
 const api=async(path:string,method='GET',body?:unknown)=>{const r=await request(path,method,body);assert.ok(r.status<300,JSON.stringify(r));return r.body;};
 try{
  const zone=await api('/api/zones','POST',{name:'Individual and operational meal diagnostic'}),room=await api('/api/spaces','POST',{name:'Physical room',zoneId:zone.id}),type=await api('/api/resource-types','POST',{code:'individual_physical',name:'Physical equipment'}),kit=await api('/api/resource-items','POST',{name:'Diagnostic physical kit',typeId:type.id,defaultAvailabilityStart:'08:00',defaultAvailabilityEnd:'16:00'});
  const template=async(name:string,duration:number,physical:boolean,dependency?:number)=>api('/api/task-templates','POST',{name,defaultDuration:duration,spaceId:physical?room.id:null,zoneId:physical?zone.id:null,requiresCoach:false,participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0,autoCreateOnContestantCreate:false,dependsOnTemplateIds:dependency?[dependency]:[],resourceRequirements:physical?{byItem:{[kit.id]:1}}:{},rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}});
  const pre=await template('Short preparation',10,true),record=await template('Individual recording',20,true,pre.id),meal=await template('Individual break',20,false);
  await api('/api/program-settings','PATCH',{defaultWorkStart:'08:00',defaultWorkEnd:'16:00',mealStart:'12:00',mealEnd:'13:00',mealMode:'flexible_meal_window',mealTaskTemplateId:meal.id,contestantMealDurationMinutes:20,contestantMealMaxSimultaneous:1});
  const general=await api('/api/new-day-planner-configuration');await api('/api/new-day-planner-configuration','PUT',{expectedRevision:general.revision,configuration:{contractVersion:1,scenario:'STANDALONE_ONLY',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0}});
  const day=await api('/api/plans','POST',{date:'2027-11-21',configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'}}}),planId=Number(day.id),path=`/api/plans/${planId}/assisted`;
  for(let i=0;i<2;i++){const p=await api(`/api/plans/${planId}/contestants`,'POST',{planId,name:'Diagnostic participant '+i,availabilityStart:'11:00',availabilityEnd:'14:00'});for(const t of [pre,record,meal])await api('/api/daily-tasks','POST',{planId,templateId:t.id,contestantId:p.id,spaceId:t.spaceId,zoneId:t.zoneId});}
  const s0=await api(path+'/session','POST',{}),ordinary=await buildEngineInput(planId,storage),view=await api(`/api/plans/${planId}/effective-configuration`),resource=ordinary.planResourceItems.find(r=>r.resourceItemId===kit.id)!;
  const declared=await request(`/api/plans/${planId}/day-configuration`,'PUT',{operationalMealPolicies:{contractVersion:1,policies:[{id:'common-availability',window:{start:'11:20',end:'12:20'},durationMinutes:25,planResourceItemIds:[resource.id],spaceIds:[room.id]}]},expectedRevisionId:view.operationalMeals.revisionId});save('declaration',declared);save('ordinary-input',ordinary);
  if(process.argv.includes('--expect-contract-rejection')){assert.equal(declared.status,422);assert.deepEqual((await api(path)).draft,s0.draft);pass('unsupported multi-channel SQL certificate rejects at authoring before any search or Stage');return {remoteWrites:0,experimentIsStage:false};}
  assert.equal(declared.status,200);const input=await buildEngineInput(planId,storage),control=inspect(input);save('input',input);save('consumer',control);assert.ok(control.result?.proposal);const proof=control.result.evidence.nominalPhysicalFutureWitness as any;assert.equal(proof.tasks.length,4);assert.equal(proof.participantMeals.length,2);assert.ok(validatePlan(control.adapter.problem!,proof.tasks,[],[],proof.participantMeals,[],[],[],proof.operationalMeals).hardValid);
  if(process.argv.includes('--individual-success')){
   const history:any[]=[];
   for(const ordinal of [1,2]){
    const before=await api(path),ids=ordinal===1?[input.tasks[0].id]:before.draft.tasks.filter((t:any)=>t.startPlanned==null).map((t:any)=>t.taskId);
    const started=await api(path+'/proposals','POST',{selector:{kind:'TASK_IDS',taskIds:ids},includePrerequisites:true,expectedDraftFingerprint:before.draftFingerprint,expectedBaseStageId:before.draftBaseStageId});
    let run:any;for(let i=0;i<600;i++){run=await api(path+`/proposals/${started.runId}`);if(!['pending','running','queued'].includes(run.status))break;await new Promise(r=>setTimeout(r,100));}save('E-S'+ordinal+'-run',run);assert.equal(run.assisted_result_json.outcome,'PROPOSAL');
    const proof=run.assisted_result_json.evidence.nominalPhysicalFutureWitness;assert.equal(proof.tasks.length,4);assert.equal(proof.participantMeals.length,2);assert.equal(proof.operationalMeals.length,1);
    await api(path+`/proposals/${run.id}/apply`,'POST',{expectedDraftFingerprint:before.draftFingerprint,expectedBaseStageId:before.draftBaseStageId});const draft=await api(path);save('E-S'+ordinal+'-draft',draft);
    await (await import('./attacks')).certificateAttacks({...ctx,planId,run,draft,label:'E',ordinal,save});
    await api(path+'/validate','POST',{expectedDraftFingerprint:draft.draftFingerprint,expectedBaseStageId:draft.draftBaseStageId});const validated=await api(path);save('E-S'+ordinal+'-validation',validated.validation);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
    const accepted=await api(path+'/accept-stage','POST',{expectedDraftFingerprint:validated.draftFingerprint,expectedBaseStageId:validated.draftBaseStageId});save('E-S'+ordinal+'-accepted',accepted);history.push(accepted.activeStage);
    save('E-S'+ordinal+'-daily-assignments',(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows);
    for(const t of before.activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.activeStage.snapshotJson.tasks.find((p:any)=>p.taskId===t.taskId),t);
    if(ordinal===1){assert.equal(accepted.draft.tasks.filter((t:any)=>t.startPlanned).length,1);assert.equal(accepted.draft.operationalMeals?.length??0,0);}else{assert.equal(accepted.draft.tasks.filter((t:any)=>t.startPlanned).length,6);assert.equal(accepted.draft.operationalMeals.length,1);}
   }
   save('E-S0',s0);save('E-input',input);save('E-ordinary-input',ordinary);save('E-authority-row',(await db.query('SELECT current_config_revision_id,planner_next_profile,planner_next_configuration,daily_operational_meal_policies FROM plans WHERE id=$1',[planId])).rows[0]);save('E-revision',(await db.query('SELECT * FROM plan_config_revisions WHERE id=(SELECT current_config_revision_id FROM plans WHERE id=$1)',[planId])).rows[0]);
   await (await import('./attacks')).protectedAttacks({api,request,db,planId,accepted:await api(path),save,label:'E'});
   await api(path+'/rollback','POST',{targetStageId:s0.activeStage.id});for(const stage of history)await api(path+'/redo','POST',{targetStageId:stage.id});assert.deepEqual((await api(path)).activeStage.snapshotJson,history.at(-1).snapshotJson);
   pass('individual + operational meals: authentic partial and complete Stages preserve one coupled global witness, assignments and rollback/redo');return {remoteWrites:0,experimentIsStage:true,days:1,stages:2};
  }
  const before=await api(path),started=await api(path+'/proposals','POST',{selector:{kind:'TASK_IDS',taskIds:input.tasks.map(t=>t.id)},includePrerequisites:true,expectedDraftFingerprint:before.draftFingerprint,expectedBaseStageId:before.draftBaseStageId});
  let run:any;for(let i=0;i<600;i++){run=await api(path+`/proposals/${started.runId}`);if(!['pending','running','queued'].includes(run.status))break;await new Promise(r=>setTimeout(r,100));}save('run',run);assert.equal(run.assisted_result_json.outcome,'PROPOSAL');
  await api(path+`/proposals/${run.id}/apply`,'POST',{expectedDraftFingerprint:before.draftFingerprint,expectedBaseStageId:before.draftBaseStageId});const draft=await api(path);save('draft',draft);const rejected=await request(path+'/validate','POST',{expectedDraftFingerprint:draft.draftFingerprint,expectedBaseStageId:draft.draftBaseStageId});save('validation-rejection',rejected);assert.equal(rejected.status,500);
  let failure:any;try{await db.query('SET ROLE service_role');await db.query('SELECT assert_operational_meal_snapshot($1,$2,$3)',[planId,draft.draft,draft.currentConfigRevisionId]);}catch(e:any){failure={message:e.message,code:e.code};}finally{await db.query('RESET ROLE');}save('first-SQL-barrier',failure);assert.equal(failure.message,'ANCHORED_FUTURE_STRUCTURAL_WITNESS_REQUIRED');assert.equal((await api(path)).activeStage.id,s0.activeStage.id);
  pass('individual meals and operational pause: consumer valid, existing SQL witness task-channel count rejects; no Stage fabricated');return {remoteWrites:0,experimentIsStage:false};
 }finally{save('api-receipts',receipts);}
}
