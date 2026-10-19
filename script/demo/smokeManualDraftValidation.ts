/** P9 causal probe. Runs only inside the owned disposable integration database. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import type {runA2BrowserJourney} from './smokeA2Journey';
import type {Page} from 'playwright';
import {adaptEngineInputToPlannerNextProblem,engineTimeToMinute,minuteToEngineTime} from '../../engine/planner-next/integration/engineInputAdapter';
import {validateTransportGrouping} from '../../engine/planner-next/transportGrouping';
import {fingerprintAssistedPlanningSnapshotV1 as fp,type AssistedPlanningSnapshotV1} from '../../server/assistedPlanningSnapshot';

export async function runManualDraftValidationProbe(options:Parameters<typeof runA2BrowserJourney>[0],page:Page){
 const {appUrl,users,db,planId,directory,buildInput,pass}=options;
 // The preceding automatic journey dismisses every unexpected dialog. P9
 // explicitly owns both cancel and confirm decisions from this point onward.
 page.removeAllListeners('dialog');
 assert.equal(new URL(appUrl).hostname,'127.0.0.1');assert.equal(new URL(process.env.SUPABASE_URL!).hostname,'127.0.0.1');
 const {validateManualAssistedDelta,materializeAssistedSnapshotOccupations}=await import('../../server/assistedProposalService');
 const input=await buildInput(),adapter=adaptEngineInputToPlannerNextProblem(input);
 assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('Unrepresentable disposable input');
 const trace:any[]=[];
 const api=async(suffix:string,method='GET',body?:unknown,role='production')=>{
  const response=await fetch(`${appUrl}/api/plans/${planId}/assisted${suffix}`,{method,headers:{Authorization:`Bearer ${users[role].token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const result={status:response.status,body:await response.json() as any};
  if(method!=='GET')trace.push({suffix,method,role,request:body,response:suffix==='/validate'||result.status!==200?result:{status:result.status}});return result;
 };
 const state=async()=>{const r=await api('');assert.equal(r.status,200);return r.body;};
 const guard=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:Number(s.draftBaseStageId)});
 const initial=await state(),base=initial.draft as AssistedPlanningSnapshotV1;
 writeFileSync(`${directory}/manual-validation-baseline.json`,JSON.stringify({input,base},null,2));
 const accepted=async()=>JSON.stringify((await db.query('SELECT to_jsonb(t) row FROM daily_tasks t WHERE plan_id=$1 ORDER BY id',[planId])).rows);
 const before=await accepted();
 const assertConsolidated=async(snapshot:AssistedPlanningSnapshotV1)=>{
  const rows=(await db.query('SELECT id,start_planned,end_planned,zone_id,space_id,location_label,duration_override,cameras_override,assigned_resource_ids FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows;
  assert.equal(rows.length,266);
  for(const task of snapshot.tasks){const row=rows.find(row=>Number(row.id)===task.taskId)!;
   assert.equal(row.start_planned,task.startPlanned);assert.equal(row.end_planned,task.endPlanned);
   assert.equal(row.zone_id==null?null:Number(row.zone_id),task.zoneId);assert.equal(row.space_id==null?null:Number(row.space_id),task.spaceId);assert.deepEqual(row.assigned_resource_ids,task.assignedResourceIds??[]);
   assert.equal(row.location_label,task.locationLabel);assert.equal(row.duration_override,task.durationOverride);assert.equal(row.cameras_override,task.camerasOverride);
  }
 };
 const arrivals=input.tasks.filter(t=>t.operationalRole==='transport_arrival');
 const groups=new Map<string,number[]>();for(const task of arrivals){const start=base.tasks.find(t=>t.taskId===task.id)!.startPlanned!;groups.set(start,[...groups.get(start)??[],task.id]);}
 const target=[...groups.entries()].find(([start,ids])=>start==='11:30'&&ids.length===3)??[...groups.entries()].filter(([,ids])=>ids.length===3).at(-2)!;
 assert.ok(target);const [targetStart,targetIds]=target;
 const source=arrivals.find(t=>base.tasks.find(row=>row.taskId===t.id)!.startPlanned!>targetStart);assert.ok(source);
 const original=base.tasks.find(t=>t.taskId===source.id)!;
 const move={taskId:source.id,startPlanned:targetStart,endPlanned:minuteToEngineTime(engineTimeToMinute(targetStart)+engineTimeToMinute(original.endPlanned!)-engineTimeToMinute(original.startPlanned!))};
 const replay=(draft:AssistedPlanningSnapshotV1,touched:number[])=>validateManualAssistedDelta(input,draft,touched)!;
 const baseline=replay(base,[source.id]);assert.deepEqual(baseline.reasonCodes,[]);
 const patched=await api('/draft','PATCH',{...guard(initial),changes:[move]});assert.equal(patched.status,200);
 const movedState=await state(),moved=movedState.draft as AssistedPlanningSnapshotV1;
 const evidence=replay(moved,[source.id]);assert.equal(evidence.hardValid,false);
 const occupations=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,moved);
 const transport=validateTransportGrouping(adapter.problem,occupations.protectedPlacements,occupations.protectedParticipantMeals);
 const validation=await api('/validate','POST',guard(movedState));
 assert.equal(validation.status,200,JSON.stringify(validation));
 const afterValidation=await state();
 assert.equal(afterValidation.validation.hardCount,1);assert.equal(afterValidation.validation.reportJson.hardValid,false);
 const violation=afterValidation.validation.reportJson.violations[0];
 assert.deepEqual(violation.affectedTaskIds,[...targetIds,source.id].sort((a,b)=>a-b));assert.equal(violation.details.dimensions.actualGroupSize,4);
 assert.equal(violation.details.dimensions.maximumGroupSize,3);assert.equal(violation.severity,'HARD');
 assert.equal(await accepted(),before,'validation cannot write accepted daily tasks');
 const reset=await api('/draft/reset','POST',guard(afterValidation));assert.equal(reset.status,200);assert.equal((await state()).draftFingerprint,fp(base));
 let valid:any;
 for(const task of input.tasks.filter(t=>t.operationalRole!=='transport_arrival'&&t.operationalRole!=='transport_departure')){
  const row=base.tasks.find(t=>t.taskId===task.id);if(!row?.startPlanned||!row.endPlanned)continue;
  for(const offset of [-5,5]){
   const change={taskId:row.taskId,startPlanned:minuteToEngineTime(engineTimeToMinute(row.startPlanned)+offset),endPlanned:minuteToEngineTime(engineTimeToMinute(row.endPlanned)+offset)};
   const draft={...base,tasks:base.tasks.map(t=>t.taskId===row.taskId?{...t,...change}:t)};
   const check=replay(draft,[row.taskId]);if(check.hardValid){valid={change,before:row,evidence:check};break;}
  }if(valid)break;
 }
 assert.ok(valid,'a genuinely admissible five-minute manual move');
 assert.equal((await api('/draft','PATCH',{...guard(await state()),changes:[valid.change]})).status,200);
 const validState=await state();valid.validation=await api('/validate','POST',guard(validState));valid.state=await state();
 assert.equal(valid.validation.status,200);assert.ok(valid.state.validation);assert.ok(valid.state.session.draftValidationId??valid.state.validation.id);
 assert.equal(await accepted(),before);
 // A clean manual Draft is accepted by the existing atomic RPC, including all 266 rows.
 assert.equal((await api('/accept-stage','POST',{...guard(await state()),confirmation:'NONE'},'admin')).status,200);
 const validAccepted=await state();assert.deepEqual(validAccepted.activeStage.snapshotJson,validState.draft);await assertConsolidated(validState.draft);
 assert.equal((await api('/rollback','POST',{targetStageId:initial.activeStage.id},'admin')).status,200);await assertConsolidated(base);
 assert.equal((await api('/draft','PATCH',{...guard(await state()),changes:[move]})).status,200);
 assert.equal((await api('/validate','POST',guard(await state()))).status,200);
 for(const role of ['viewer','aux','norole']){
  assert.equal((await api('/accept-stage','POST',{...guard(await state()),confirmation:'HARD_EXCEPTIONS'},role)).status,403);
 }
 const noConsent=await api('/accept-stage','POST',{...guard(await state()),confirmation:'NONE'});
 assert.equal(noConsent.status,422);assert.equal(noConsent.body.code,'HARD_CONFIRMATION_REQUIRED');await assertConsolidated(base);
 const stale=await api('/validate','POST',{...guard(await state()),expectedDraftFingerprint:'0'.repeat(64)});
 assert.equal(stale.status,409);assert.equal(stale.body.code,'STALE_DRAFT');
 const wrongBase=await api('/validate','POST',{...guard(await state()),expectedBaseStageId:Number(initial.activeStage.id)+10000});
 assert.equal(wrongBase.status,409);assert.equal(wrongBase.body.code,'STALE_BASE_STAGE');
 // Only the owned disposable fixture receives a deliberately stale revision.
 const current=await state(),configId=current.currentConfigRevisionId;
 const staleRevision=(await db.query("INSERT INTO plan_config_revisions(plan_id,source,fingerprint,identity_json,replay_snapshot_json,created_by) SELECT plan_id,'DISPOSABLE_P9_STALE',$2,jsonb_set(identity_json,'{configurationFingerprint}',to_jsonb($2::text)),replay_snapshot_json,created_by FROM plan_config_revisions WHERE id=$1 RETURNING id",[configId,'0'.repeat(64)])).rows[0].id;
 try{
  await db.query('UPDATE assisted_planning_sessions SET current_config_revision_id=$1,draft_validation_id=NULL WHERE id=$2',[staleRevision,current.session.id]);
  const conflict=await api('/validate','POST',guard(current));assert.equal(conflict.status,409);assert.equal(conflict.body.code,'STALE_CONFIG_REVISION');
  const blocked=await api('/accept-stage','POST',{...guard(current),confirmation:'HARD_EXCEPTIONS'});assert.equal(blocked.status,409);assert.equal(blocked.body.code,'STALE_VALIDATION');
 }finally{await db.query('UPDATE assisted_planning_sessions SET current_config_revision_id=$1,draft_validation_id=$3 WHERE id=$2',[configId,current.session.id,current.session.draftValidationId]);}
 await page.reload();await page.getByTestId('stage-validation-report').getByText('IN: grupo de 4 participantes; máximo permitido 3.',{exact:false}).waitFor();
 await page.getByTestId('stage-validation-report').scrollIntoViewIfNeeded();
 assert.match(await page.getByTestId('stage-validation-report').innerText(),/antes 12:00–12:05; después 11:30–11:35/);
 await page.screenshot({path:`${directory}/p9-four-in-report.png`,fullPage:false});
 const cancel=page.waitForEvent('dialog');const cancelClick=page.getByRole('button',{name:'Aceptar etapa',exact:true}).click();
 const cancelled=await cancel;assert.match(cancelled.message(),/grupo de 4 participantes/);await cancelled.dismiss();await cancelClick;await assertConsolidated(base);
 const acceptedResponse=page.waitForResponse(r=>r.url().endsWith('/assisted/accept-stage')&&r.request().method()==='POST');
 const consent=page.waitForEvent('dialog');const acceptClick=page.getByRole('button',{name:'Aceptar etapa',exact:true}).click();
 const dialog=await consent,confirmationText=dialog.message();await dialog.accept();await acceptClick;
 const acceptanceHttp=await acceptedResponse;assert.equal(acceptanceHttp.status(),200);
 const acceptanceRequest=acceptanceHttp.request().postDataJSON();assert.equal(acceptanceRequest.confirmation,'HARD_EXCEPTIONS');
 trace.push({suffix:'/accept-stage',method:'POST',role:'production',source:'Chromium',request:acceptanceRequest,response:{status:200}});
 const hardAccepted=await state();assert.deepEqual(hardAccepted.activeStage.snapshotJson,moved);assert.equal(hardAccepted.activeStage.validationSummaryJson.hardValid,false);await assertConsolidated(moved);
 await page.getByTestId('accepted-exception-marker').scrollIntoViewIfNeeded();await page.screenshot({path:`${directory}/p9-accepted-hard.png`,fullPage:false});
 const exceptions=(await db.query('SELECT * FROM planning_accepted_exceptions WHERE stage_id=$1',[hardAccepted.activeStage.id])).rows;
 assert.equal(exceptions.length,1);const exception=exceptions[0];
 assert.equal(exception.rule_code,'TRANSPORT_GROUPING_VIOLATION');assert.equal(exception.severity,'HARD');assert.equal(exception.violation_key,violation.violationKey);
 assert.equal(exception.snapshot_fingerprint,fp(moved));assert.equal(exception.accepted_by,users.production.id);assert.ok(exception.accepted_at);assert.equal(Number(exception.config_revision_id),Number(configId));
 assert.deepEqual(exception.affected_task_ids_json,violation.affectedTaskIds);assert.deepEqual(exception.details_json.dimensions,violation.details.dimensions);
 // An unrelated valid move can inherit exactly the same material conflict.
 assert.equal((await api('/draft','PATCH',{...guard(hardAccepted),changes:[valid.change]})).status,200);
 assert.equal((await api('/validate','POST',guard(await state()))).status,200);
 const inherited=await state();assert.equal(inherited.validation.reportJson.newHardCount,0);assert.equal(inherited.validation.reportJson.violations[0].inheritedAcceptedExceptionId,Number(exception.id));
 assert.equal((await api('/accept-stage','POST',{...guard(inherited),confirmation:'NONE'},'admin')).status,200);
 const inheritedStage=await state();assert.equal(inheritedStage.activeStage.validationSummaryJson.hardValid,false);
 assert.equal((await db.query('SELECT count(*) n FROM planning_accepted_exceptions WHERE plan_id=$1',[planId])).rows[0].n,'1');
 // Touching a member while retaining a new transport conflict requires a new decision.
 const shifted={...move,startPlanned:minuteToEngineTime(engineTimeToMinute(move.startPlanned)+5),endPlanned:minuteToEngineTime(engineTimeToMinute(move.endPlanned)+5)};
 assert.equal((await api('/draft','PATCH',{...guard(inheritedStage),changes:[shifted]})).status,200);
 assert.equal((await api('/validate','POST',guard(await state()))).status,200);
 const changed=await state();assert.ok(changed.validation.reportJson.newHardCount>0);assert.ok(changed.validation.reportJson.violations.every((v:any)=>v.inheritedAcceptedExceptionId===null));
 assert.equal((await api('/accept-stage','POST',{...guard(changed),confirmation:'NONE'})).body.code,'HARD_CONFIRMATION_REQUIRED');
 assert.equal((await api('/accept-stage','POST',{...guard(changed),confirmation:'HARD_EXCEPTIONS'})).status,200);
 const superseded=(await db.query('SELECT status FROM planning_accepted_exceptions WHERE id=$1',[exception.id])).rows[0].status;
 assert.equal(superseded,'SUPERSEDED');
 assert.equal((await api('/rollback','POST',{targetStageId:initial.activeStage.id},'admin')).status,200);await assertConsolidated(base);
 // Keep another genuinely unstructured family fail-closed through HTTP and the UI.
 const anchored=input.tasks.find(t=>input.anchoredAccompaniments?.some(a=>a.anchorTaskId===t.id))!;assert.ok(anchored);
 const anchoredRow=base.tasks.find(t=>t.taskId===anchored.id)!;
 const unsupportedMove={taskId:anchored.id,startPlanned:minuteToEngineTime(engineTimeToMinute(anchoredRow.startPlanned!)+5),endPlanned:minuteToEngineTime(engineTimeToMinute(anchoredRow.endPlanned!)+5)};
 assert.equal((await api('/draft','PATCH',{...guard(await state()),changes:[unsupportedMove]})).status,200);
 await page.reload();const unsupportedResponse=page.waitForResponse(r=>r.url().endsWith('/assisted/validate')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Validar borrador',exact:true}).click();const unsupportedHttp=await unsupportedResponse;
 assert.equal(unsupportedHttp.status(),422);const unsupported=await unsupportedHttp.json();assert.ok(unsupported.validationDiagnostics.reasonCodes.includes('ANCHORED_ACCOMPANIMENT_VIOLATION'));
 trace.push({suffix:'/validate',method:'POST',role:'production',source:'Chromium',request:unsupportedHttp.request().postDataJSON(),response:{status:422,body:unsupported}});
 await page.getByText(/No se puede certificar este borrador/).scrollIntoViewIfNeeded();assert.equal((await state()).session.draftValidationId,null);
 assert.equal((await api('/accept-stage','POST',{...guard(await state()),confirmation:'HARD_EXCEPTIONS'})).status,409);
 await page.screenshot({path:`${directory}/p9-unsupported.png`,fullPage:false});
 assert.equal((await api('/draft/reset','POST',guard(await state()))).status,200);await assertConsolidated(base);
 const report={mode:'P9_NATIVE_MANUAL_VALIDATION',remoteReads:0,remoteWrites:0,remoteCaseReproduced:false,baselineFingerprint:fp(base),
  baseline,move:{before:original,after:move,targetIds},fourIN:{evidence,validation,draftFingerprint:fp(moved),draftValidationId:afterValidation.session?.draftValidationId??null,transport},
  valid:{change:valid.change,validation:valid.validation,status:'ACCEPTED_AND_ROLLED_BACK'},trace,acceptedMaterial:'EXACT_DELTA_AND_ROLLBACK',confirmationText,
  lifecycle:{hardAcceptedStageId:hardAccepted.activeStage.id,exceptionId:exception.id,
   acceptedException:{ruleCode:exception.rule_code,severity:exception.severity,violationKey:exception.violation_key,snapshotFingerprint:exception.snapshot_fingerprint,configRevisionId:Number(exception.config_revision_id),affectedTaskIds:exception.affected_task_ids_json,details:exception.details_json,acceptedBy:exception.accepted_by,acceptedAt:exception.accepted_at,statusAtAcceptance:exception.status,actorRole:'production'},
   inheritedStageId:inheritedStage.activeStage.id,newHardCountAfterMemberEdit:changed.validation.reportJson.newHardCount,oldExceptionAfterReconfirmation:superseded,unsupported},
  shape:{tasks:base.tasks.length,meals:base.operationalMeals?.length,setup:base.setupPreparations?.length,round:base.roundPreparations?.length},identityMap:adapter.identityMap};
 writeFileSync(`${directory}/manual-validation-probe.json`,JSON.stringify(report,null,2));
 writeFileSync(`${directory}/manual-validation-input.json`,JSON.stringify({input,base,moved},null,2));
 pass('P9 manual validation: clean atomic acceptance, explicit HARD decision, audit identity, exact inheritance, stale/version/config/RBAC gates, unsupported-family UI and rollback; 266 tasks preserved');
 return report;
}

/** Fast causal iteration from a previously recorded native A2. This is explicitly
 * replay, not evidence of generating a new plan; the full gate never uses it. */
export async function runRecordedManualValidationJourney(options:Parameters<typeof runA2BrowserJourney>[0],sourcePath:string){
 const {appUrl,db,planId,users,pass}=options;
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const bytes=readFileSync(sourcePath),recorded=JSON.parse(bytes.toString());
 assert.equal(recorded.input.planId,planId);assert.equal(recorded.base.tasks.length,266);
 const response=await fetch(`${appUrl}/api/plans/${planId}/assisted/session`,{method:'POST',headers:{Authorization:`Bearer ${users.production.token}`,'Content-Type':'application/json'},body:'{}'});
 assert.equal(response.status,200);const state:any=await response.json();
 const snapshot=recorded.base,stage=(await db.query("INSERT INTO assisted_planning_stages(session_id,plan_id,ordinal,parent_stage_id,scope_json,config_revision_id,snapshot_json,snapshot_fingerprint,validation_summary_json,accepted_by,accepted_at) VALUES($1,$2,11,$3,'{}',$4,$5,$6,'{\"hardValid\":true}',$7,now()) RETURNING id",[state.session.id,planId,state.activeStage.id,state.currentConfigRevisionId,snapshot,fp(snapshot),users.production.id])).rows[0].id;
 await db.query('UPDATE assisted_planning_sessions SET active_stage_id=$1,draft_base_stage_id=$1,draft_snapshot_json=$2,draft_fingerprint=$3 WHERE id=$4',[stage,snapshot,fp(snapshot),state.session.id]);
 await db.query('SELECT assisted_apply_snapshot($1,$2)',[planId,snapshot]);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30_000);
  await page.goto(`${appUrl}/login`);await page.getByLabel('Email',{exact:true}).fill(users.production.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.production.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await page.goto(`${appUrl}/plans/${planId}?tab=planning`);await page.getByTestId('assisted-workspace').waitFor();
  pass('recorded native A2 replay, generation explicitly not rerun');
  return {sourceSha256:createHash('sha256').update(bytes).digest('hex'),generatedPlan:false,manual:await runManualDraftValidationProbe(options,page)};
 }finally{await browser.close();}
}
