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
 const {appUrl,url,anon,users,db,planId,directory,buildInput,pass}=options;
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
 const criticalState=async()=>JSON.stringify((await db.query(`SELECT
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM daily_tasks t WHERE plan_id=$1) tasks,
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM assisted_planning_stages t WHERE plan_id=$1) stages,
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM assisted_planning_sessions t WHERE plan_id=$1) sessions,
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM planning_accepted_exceptions t WHERE plan_id=$1) exceptions,
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM planning_stage_validations t WHERE plan_id=$1) validations`,[planId])).rows);
 const forbiddenAccept=async(body:unknown,role='production',expectedStatus=403)=>{
  const before=await criticalState(),response=await api('/accept-stage','POST',body,role);
  assert.equal(response.status,expectedStatus,JSON.stringify(response));assert.equal(await criticalState(),before,'rejected acceptance changes no Stage, Draft, validation, exception or task');return response;
 };
 const setRole=async(user:string,role:string)=>db.query('UPDATE user_roles SET role_id=(SELECT id FROM roles WHERE key=$2) WHERE user_id=$1',[users[user].id,role]);
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
 // Revoke after validation, keeping the same valid Auth token; authorization is fresh.
 await setRole('production','viewer');
 try{await forbiddenAccept({...guard(valid.state),confirmation:'NONE'});}finally{await setRole('production','production');}
 // Production retains clean manual acceptance, including every material field of all 266 rows.
 assert.equal((await api('/accept-stage','POST',{...guard(await state()),confirmation:'NONE'})).status,200);
 const validAccepted=await state();assert.deepEqual(validAccepted.activeStage.snapshotJson,validState.draft);await assertConsolidated(validState.draft);
 assert.equal((await api('/rollback','POST',{targetStageId:initial.activeStage.id},'admin')).status,200);await assertConsolidated(base);
 assert.equal((await api('/draft','PATCH',{...guard(await state()),changes:[move]})).status,200);
 assert.equal((await api('/validate','POST',guard(await state()))).status,200);
 for(const role of ['viewer','aux','norole']){
  await forbiddenAccept({...guard(await state()),confirmation:'HARD_EXCEPTIONS'},role);
 }
 for(const confirmation of ['NONE','REQUIRED_DEVIATIONS','HARD_EXCEPTIONS'])await forbiddenAccept({...guard(await state()),confirmation});
 await forbiddenAccept({...guard(await state()),confirmation:'HARD_EXCEPTIONS',userId:users.admin.id,userRole:'admin',reportJson:{newHardCount:0}},'production',400);
 // Even a previously admin token is not current authority after demotion.
 await setRole('admin','production');
 try{await forbiddenAccept({...guard(await state()),confirmation:'HARD_EXCEPTIONS'},'admin');}finally{await setRole('admin','admin');}
 const rpcBoundary:any[]=[];
 for(const role of ['admin','production','viewer','aux','norole']){
  const before=await criticalState();
  const response=await fetch(`${url}/rest/v1/rpc/assisted_accept_stage`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${users[role].token}`,'Content-Type':'application/json'},body:JSON.stringify({p_plan_id:planId,p_user_id:users.admin.id,p_expected_fingerprint:(await state()).draftFingerprint,p_expected_base:(await state()).draftBaseStageId,p_confirmation:'HARD_EXCEPTIONS'})});
  assert.equal(response.status,403);assert.equal(await criticalState(),before);rpcBoundary.push({role,status:response.status,spoofedActor:'admin',writes:0});
 }
 const rpcPrivileges=(await db.query("SELECT has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='assisted_accept_stage'")).rows;
 assert.deepEqual(rpcPrivileges,[{anon:false,authenticated:false,service:true}]);
 const noConsent=await api('/accept-stage','POST',{...guard(await state()),confirmation:'NONE'},'admin');
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
  const blocked=await api('/accept-stage','POST',{...guard(current),confirmation:'HARD_EXCEPTIONS'},'admin');assert.equal(blocked.status,409);assert.equal(blocked.body.code,'STALE_VALIDATION');
 }finally{await db.query('UPDATE assisted_planning_sessions SET current_config_revision_id=$1,draft_validation_id=$3 WHERE id=$2',[configId,current.session.id,current.session.draftValidationId]);}
 await page.reload();await page.getByTestId('stage-validation-report').getByText('IN: grupo de 4 participantes; máximo permitido 3.',{exact:false}).waitFor();
 await page.getByTestId('stage-validation-report').scrollIntoViewIfNeeded();
 assert.match(await page.getByTestId('stage-validation-report').innerText(),/antes 12:00–12:05; después 11:30–11:35/);
 await page.getByTestId('assisted-workspace').screenshot({path:`${directory}/p9-four-in-report.png`});
 await page.getByTestId('assisted-hard-admin-required').waitFor();assert.equal(await page.getByRole('button',{name:'Aceptar etapa',exact:true}).isEnabled(),false);
 await page.getByTestId('assisted-workspace').screenshot({path:`${directory}/p9-admin-required.png`});
 const adminPage=await page.context().browser()!.newPage({viewport:{width:1440,height:1000}});adminPage.setDefaultTimeout(30_000);
 await adminPage.goto(`${appUrl}/login`);await adminPage.getByLabel('Email',{exact:true}).fill(users.admin.email);await adminPage.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
 await adminPage.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await adminPage.waitForURL('**/dashboard');await adminPage.goto(`${appUrl}/plans/${planId}?tab=planning`);
 await adminPage.getByTestId('stage-validation-report').waitFor();
 const cancel=adminPage.waitForEvent('dialog');const cancelClick=adminPage.getByRole('button',{name:'Aceptar etapa',exact:true}).click();
 const cancelled=await cancel;assert.match(cancelled.message(),/grupo de 4 participantes/);await cancelled.dismiss();await cancelClick;await assertConsolidated(base);
 const acceptedResponse=adminPage.waitForResponse(r=>r.url().endsWith('/assisted/accept-stage')&&r.request().method()==='POST');
 const consent=adminPage.waitForEvent('dialog');const acceptClick=adminPage.getByRole('button',{name:'Aceptar etapa',exact:true}).click();
 const dialog=await consent,confirmationText=dialog.message();await dialog.accept();await acceptClick;
 assert.match(confirmationText,/antes 12:00–12:05; después 11:30–11:35/);assert.match(confirmationText,/usuario administrador/);assert.match(confirmationText,/indicador crítico/);
 const acceptanceHttp=await acceptedResponse;assert.equal(acceptanceHttp.status(),200);
 const acceptanceRequest=acceptanceHttp.request().postDataJSON();assert.equal(acceptanceRequest.confirmation,'HARD_EXCEPTIONS');
 trace.push({suffix:'/accept-stage',method:'POST',role:'admin',source:'Chromium',request:acceptanceRequest,response:{status:200}});
 const hardAccepted=await state();assert.deepEqual(hardAccepted.activeStage.snapshotJson,moved);assert.equal(hardAccepted.activeStage.validationSummaryJson.hardValid,false);await assertConsolidated(moved);
 await adminPage.getByTestId('accepted-exception-marker').scrollIntoViewIfNeeded();await adminPage.getByTestId('assisted-workspace').screenshot({path:`${directory}/p9-accepted-hard.png`});await adminPage.close();
 const exceptions=(await db.query('SELECT * FROM planning_accepted_exceptions WHERE stage_id=$1',[hardAccepted.activeStage.id])).rows;
 assert.equal(exceptions.length,1);const exception=exceptions[0];
 assert.equal(exception.rule_code,'TRANSPORT_GROUPING_VIOLATION');assert.equal(exception.severity,'HARD');assert.equal(exception.violation_key,violation.violationKey);
 assert.equal(exception.snapshot_fingerprint,fp(moved));assert.equal(exception.accepted_by,users.admin.id);assert.ok(exception.accepted_at);assert.equal(Number(exception.config_revision_id),Number(configId));
 assert.deepEqual(exception.affected_task_ids_json,violation.affectedTaskIds);assert.deepEqual(exception.details_json.dimensions,violation.details.dimensions);
 // An unrelated valid move can inherit exactly the same material conflict.
 assert.equal((await api('/draft','PATCH',{...guard(hardAccepted),changes:[valid.change]})).status,200);
 assert.equal((await api('/validate','POST',guard(await state()))).status,200);
 const inherited=await state();assert.equal(inherited.validation.reportJson.newHardCount,0);assert.equal(inherited.validation.reportJson.violations[0].inheritedAcceptedExceptionId,Number(exception.id));
 await page.reload();await page.getByTestId('stage-validation-report').getByText('Aceptada previamente',{exact:true}).waitFor();
 const inheritedDialogs:string[]=[];const onInheritedDialog=async(dialog:any)=>{inheritedDialogs.push(dialog.message());await dialog.dismiss();};page.on('dialog',onInheritedDialog);
 const inheritedResponse=page.waitForResponse(r=>r.url().endsWith('/assisted/accept-stage')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Aceptar etapa',exact:true}).click();const inheritedHttp=await inheritedResponse;page.off('dialog',onInheritedDialog);
 assert.equal(inheritedHttp.status(),200);assert.equal(inheritedHttp.request().postDataJSON().confirmation,'NONE');assert.deepEqual(inheritedDialogs,[]);
 trace.push({suffix:'/accept-stage',method:'POST',role:'production',source:'Chromium',request:inheritedHttp.request().postDataJSON(),response:{status:200},dialogs:0});
 const inheritedStage=await state();assert.equal(inheritedStage.activeStage.validationSummaryJson.hardValid,false);
 assert.equal((await db.query('SELECT count(*) n FROM planning_accepted_exceptions WHERE plan_id=$1',[planId])).rows[0].n,'1');
 // Touching a member while retaining a new transport conflict requires a new decision.
 const shifted={...move,startPlanned:minuteToEngineTime(engineTimeToMinute(move.startPlanned)+5),endPlanned:minuteToEngineTime(engineTimeToMinute(move.endPlanned)+5)};
 assert.equal((await api('/draft','PATCH',{...guard(inheritedStage),changes:[shifted]})).status,200);
 assert.equal((await api('/validate','POST',guard(await state()))).status,200);
 const changed=await state();assert.ok(changed.validation.reportJson.newHardCount>0);assert.ok(changed.validation.reportJson.violations.every((v:any)=>v.inheritedAcceptedExceptionId===null));
 await forbiddenAccept({...guard(changed),confirmation:'HARD_EXCEPTIONS'});
 await page.reload();await page.getByTestId('assisted-hard-admin-required').waitFor();assert.equal(await page.getByRole('button',{name:'Aceptar etapa',exact:true}).isEnabled(),false);
 assert.equal((await api('/accept-stage','POST',{...guard(changed),confirmation:'NONE'},'admin')).body.code,'HARD_CONFIRMATION_REQUIRED');
 assert.equal((await api('/accept-stage','POST',{...guard(changed),confirmation:'HARD_EXCEPTIONS'},'admin')).status,200);
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
 assert.equal((await api('/accept-stage','POST',{...guard(await state()),confirmation:'NONE'})).status,409);
 await page.getByTestId('assisted-workspace').screenshot({path:`${directory}/p9-unsupported.png`});
 assert.equal((await api('/draft/reset','POST',guard(await state()))).status,200);await assertConsolidated(base);
 const report={mode:'P9_NATIVE_MANUAL_VALIDATION',remoteReads:0,remoteWrites:0,remoteCaseReproduced:false,baselineFingerprint:fp(base),
  baseline,move:{before:original,after:move,targetIds},fourIN:{evidence,validation,draftFingerprint:fp(moved),draftValidationId:afterValidation.session?.draftValidationId??null,transport},
  valid:{change:valid.change,validation:valid.validation,status:'ACCEPTED_AND_ROLLED_BACK'},trace,acceptedMaterial:'EXACT_DELTA_AND_ROLLBACK',confirmationText,
  lifecycle:{hardAcceptedStageId:hardAccepted.activeStage.id,exceptionId:exception.id,
   acceptedException:{ruleCode:exception.rule_code,severity:exception.severity,violationKey:exception.violation_key,snapshotFingerprint:exception.snapshot_fingerprint,configRevisionId:Number(exception.config_revision_id),affectedTaskIds:exception.affected_task_ids_json,details:exception.details_json,acceptedBy:exception.accepted_by,acceptedAt:exception.accepted_at,statusAtAcceptance:exception.status,actorRole:'admin'},
   inheritedStageId:inheritedStage.activeStage.id,newHardCountAfterMemberEdit:changed.validation.reportJson.newHardCount,oldExceptionAfterReconfirmation:superseded,unsupported},
  authorization:{newHard:'ADMIN_ONLY',productionClean:true,requiredAcceptance:'SEPARATE_IMMUTABLE_FIXTURE',productionInheritedWithoutConsent:true,inheritedDialogs,rpcBoundary,rpcPrivileges,revocation:{productionToViewer:403,adminToProduction:403},rejectionsWriteNothing:true},
  shape:{tasks:base.tasks.length,meals:base.operationalMeals?.length,setup:base.setupPreparations?.length,round:base.roundPreparations?.length},identityMap:adapter.identityMap};
 writeFileSync(`${directory}/manual-validation-probe.json`,JSON.stringify(report,null,2));
 writeFileSync(`${directory}/manual-validation-input.json`,JSON.stringify({input,base,moved},null,2));
 pass('P9 manual validation: admin-only new HARD, production clean/inherited without new consent, fresh role revocation, manipulated HTTP and direct RPC rejection without writes, exact exception lifecycle, unsupported-family UI and rollback; 266 tasks preserved');
 return report;
}

/** A separate day is configured REQUIRED before insertion: 088 stays immutable.
 * Geometry is an explicit fixture Draft; validation and acceptance are real. */
export async function runRequiredDeviationAcceptance(options:Parameters<typeof runA2BrowserJourney>[0],sourcePath:string){
 const {appUrl,db,planId,users,directory,pass,buildInput}=options;
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const bytes=readFileSync(sourcePath),recorded=JSON.parse(bytes.toString()),snapshot=recorded.base as AssistedPlanningSnapshotV1;
 assert.equal(recorded.input.planId,planId);assert.equal(snapshot.tasks.length,266);
 const input=await buildInput();assert.ok(Object.values(input.resourcePresenceConcentrationPolicies??{}).every(value=>value==='REQUIRED'));
 const api=async(suffix:string,body?:unknown)=>{
  const response=await fetch(`${appUrl}/api/plans/${planId}/assisted${suffix}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${users.production.token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json() as any};
 };
 const material=async()=>JSON.stringify((await db.query(`SELECT
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM daily_tasks t WHERE plan_id=$1) tasks,
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM assisted_planning_stages t WHERE plan_id=$1) stages,
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM assisted_planning_sessions t WHERE plan_id=$1) sessions,
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM planning_accepted_exceptions t WHERE plan_id=$1) exceptions`,[planId])).rows);
 const bootstrap=await api('/session',{});assert.equal(bootstrap.status,200);const initial=bootstrap.body;
 // Trusted fixture preparation supplies only an UNCERTIFIED complete Draft.
 // No accepted Stage, exception, validation or daily timing is seeded. The
 // immutable day configuration and all client/RPC privileges stay enabled.
 await db.query("UPDATE assisted_planning_sessions SET draft_snapshot_json=$1,draft_fingerprint=$2,draft_scope_json=$3 WHERE id=$4",[snapshot,fp(snapshot),{editKind:'MANUAL',manualTouchedTaskIds:snapshot.tasks.map(task=>task.taskId)},initial.session.id]);
 assert.equal((await db.query('SELECT count(*) n FROM planning_accepted_exceptions WHERE plan_id=$1',[planId])).rows[0].n,'0');
 assert.equal((await db.query('SELECT count(*) n FROM daily_tasks WHERE plan_id=$1 AND start_planned IS NOT NULL',[planId])).rows[0].n,'0');
 const draft=(await api('')).body,guard={expectedDraftFingerprint:draft.draftFingerprint,expectedBaseStageId:Number(draft.draftBaseStageId)};
 assert.equal((await api('/validate',guard)).status,200);const validated=(await api('')).body,report=validated.validation.reportJson;
 assert.equal(validated.validation.hardCount,0);assert.equal(report.newHardCount,0);assert.ok(report.newRequiredCount>0);
 assert.ok(report.violations.some((v:any)=>v.ruleCode==='RESOURCE_REQUIRED_PRESENCE_VIOLATION'&&v.severity==='REQUIRED'));
 const before=await material();const missing=await api('/accept-stage',{...guard,confirmation:'NONE'});
 assert.equal(missing.status,422);assert.equal(missing.body.code,'REQUIRED_CONFIRMATION_REQUIRED');assert.equal(await material(),before);
 assert.equal((await api('/accept-stage',{...guard,confirmation:'HARD_EXCEPTIONS'})).status,403);assert.equal(await material(),before);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 let confirmationText:string;
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30_000);
  await page.goto(`${appUrl}/login`);await page.getByLabel('Email',{exact:true}).fill(users.production.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.production.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');await page.goto(`${appUrl}/plans/${planId}?tab=planning`);
  await page.getByTestId('stage-validation-report').waitFor();assert.equal(await page.getByTestId('assisted-hard-admin-required').count(),0);
  const response=page.waitForResponse(r=>r.url().endsWith('/assisted/accept-stage')&&r.request().method()==='POST');
  const consent=page.waitForEvent('dialog');const click=page.getByRole('button',{name:'Aceptar etapa',exact:true}).click();
  const dialog=await consent;confirmationText=dialog.message();assert.match(confirmationText,/desviación\(es\) operativas nuevas/);await dialog.accept();await click;
  const http=await response;assert.equal(http.status(),200);assert.equal(http.request().postDataJSON().confirmation,'REQUIRED_DEVIATIONS');
  await page.getByTestId('stage-validation-report').waitFor({state:'detached'});await page.getByTestId('assisted-workspace').screenshot({path:`${directory}/p9-required-accepted.png`});
 }finally{await browser.close();}
 const accepted=(await api('')).body;assert.deepEqual(accepted.activeStage.snapshotJson,snapshot);assert.equal(accepted.activeStage.validationSummaryJson.hardValid,true);
 const decisions=(await db.query('SELECT severity,rule_code,accepted_by,snapshot_fingerprint FROM planning_accepted_exceptions WHERE stage_id=$1',[accepted.activeStage.id])).rows;
 assert.ok(decisions.length);assert.ok(decisions.every(e=>e.severity==='REQUIRED'&&e.accepted_by===users.production.id&&e.snapshot_fingerprint===fp(snapshot)));
 const rows=(await db.query('SELECT * FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows;assert.equal(rows.length,266);
 for(const task of snapshot.tasks){const row=rows.find(r=>Number(r.id)===task.taskId)!;
  assert.deepEqual([row.start_planned,row.end_planned,row.zone_id==null?null:Number(row.zone_id),row.space_id==null?null:Number(row.space_id),row.assigned_resource_ids,row.location_label,row.duration_override,row.cameras_override],
   [task.startPlanned,task.endPlanned,task.zoneId,task.spaceId,task.assignedResourceIds??[],task.locationLabel,task.durationOverride,task.camerasOverride]);
 }
 const result={status:'PASS',mode:'IMMUTABLE_REQUIRED_DAY_FIXTURE',generatedPlan:false,draftSeed:'RECORDED_GEOMETRY_ONLY_UNCERTIFIED',remoteWrites:0,sourceSha256:createHash('sha256').update(bytes).digest('hex'),configuredBeforeInsert:true,
  report,confirmation:'REQUIRED_DEVIATIONS',confirmationText,actorRole:'production',acceptedStageId:accepted.activeStage.id,configurationRevisionId:accepted.currentConfigRevisionId,decisions,tasks:rows.length};
 writeFileSync(`${directory}/required-acceptance.json`,JSON.stringify(result,null,2));pass('Production validates and accepts REQUIRED with explicit UI consent, exact audit and 266 material task rows; immutable configuration and missing-consent rejection preserved');return result;
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
  const manual=process.argv.includes('--transport-policy-only')?undefined:await runManualDraftValidationProbe(options,page);
  const transportPolicy=process.argv.includes('--transport-policy')?await (await import('./smokeTransportPolicyIntegrity')).runTransportPolicyIntegrity(options,page):undefined;
  return {sourceSha256:createHash('sha256').update(bytes).digest('hex'),generatedPlan:false,manual,transportPolicy};
 }finally{await browser.close();}
}
