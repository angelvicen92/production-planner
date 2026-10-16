import { configureMainFlowPreferenceJourney, verifyMainFlowPreferenceResult, verifyMainFlowPreferenceAfterStages } from "./smokeMainFlowPreferenceJourney";
import {buildCanonicalFullA2EngineInput} from "../../engine/planner-next/benchmarks/canonicalFullA2EngineInput";
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type pg from 'pg';
import {chromium,type Page,type Response as BrowserResponse} from 'playwright';
import {securityTables} from './a2Preflight';
import {fingerprintAssistedPlanningSnapshotV1} from '../../server/assistedPlanningSnapshot';
import type {EngineInput} from '../../engine/types';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {revalidateJointCompletionWitness} from '../../engine/planner-next/jointCompletionWitness';
import {validatePlan} from '../../engine/planner-next/validate';
import {materializeScheduledItinerantUnitMeals} from '../../engine/planner-next/itinerantUnitMeals';
import {PreparedFutureCollectiveParticipantClosure} from '../../engine/planner-next/futureCollectiveParticipantClosure';
import {buildAssistedPlanningView} from '../../client/src/lib/assisted-planning-view';
import {collectAssistedDraftWarnings} from '../../client/src/lib/assisted-draft-warnings';
import {auditComplete,auditOperationalMealConsolidation} from './probeA2StageOrder';
import {runA2ManualSnapshotJourney} from './smokeA2ManualSnapshotJourney';
import {runDayWorkspaceJourney} from "./smokeDayWorkspaceJourney";
import {runA2ViewsHistoryJourney} from './smokeA2ViewsHistoryJourney';
import {runA2HistoricalScopeJourney} from './smokeA2HistoricalScopeJourney';
import {runA2ScopeSelectionJourney} from './smokeA2ScopeSelectionJourney';

type User={id:string;email:string;password:string;token:string};
type Options={appUrl:string;url:string;anon:string;users:Record<string,User>;db:pg.Client;planId:number;directory:string;full:boolean;pass:(s:string)=>void;buildInput:()=>Promise<EngineInput>;diagnostics:Record<string,unknown>};

export async function runA2BrowserJourney({appUrl,url,anon,users,db,planId,directory,full,pass,buildInput,diagnostics}:Options){
 const path=`/api/plans/${planId}/assisted`;
 const api=async(suffix:string,method='GET',body?:unknown,role='production')=>{
  const response=await fetch(`${appUrl}${suffix}`,{method,headers:{'Content-Type':'application/json',...(role==='anon'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(180_000)});
  return {status:response.status,data:await response.json() as any};
 };
 const state=async()=>{const r=await api(path);assert.equal(r.status,200);return r.data;};
 const guard=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:Number(s.draftBaseStageId)});
 const tables=['daily_tasks','assisted_planning_sessions','assisted_planning_stages','planning_stage_validations','planning_runs','plan_config_revisions','planning_accepted_exceptions'];
 const databaseMaterial=async()=>{const out=[];for(const t of tables)out.push((await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') AS rows FROM public.${t} x WHERE plan_id=$1`,[planId])).rows[0].rows);return out;};
 const beforeReads=await databaseMaterial();
 const roleMatrix=[];
 for(const role of ['anon','norole','viewer','aux','production','admin']){
  const read=await api(`/api/plans/${planId}`,'GET',undefined,role);assert.equal(read.status,role==='anon'?401:role==='norole'?403:200);
  if(!['production','admin'].includes(role)){
   for(const [suffix,method,body] of [['/session','POST',{}],['/proposals','POST',{selector:{kind:'TASK_IDS',taskIds:[1]}}],['/proposals/1/apply','POST',{}],['/validate','POST',{}],['/accept-stage','POST',{}],['/draft','PATCH',{changes:[]}],['/rollback','POST',{}]] as const){
    const write=await api(path+suffix,method,body,role);assert.equal(write.status,role==='anon'?401:403,`${role} ${suffix}`);
   }
  }
  const headers={apikey:anon,Authorization:`Bearer ${role==='anon'?anon:users[role].token}`,'Content-Type':'application/json',Prefer:'return=representation'};
  for(const table of securityTables){
   const r=await fetch(`${url}/rest/v1/${table}?select=*&limit=1`,{headers});assert.equal(r.status,200,`${role} REST ${table}: ${r.status===200?'':await r.text()}`);
   const rows=await r.json() as any[];const source=(await db.query(`SELECT * FROM public.${table} LIMIT 1`)).rows;
   assert.equal(rows.length,['anon','norole'].includes(role)?0:source.length,`${role} REST ${table}`);
  }
  const update=await fetch(`${url}/rest/v1/daily_tasks?plan_id=eq.${planId}`,{method:'PATCH',headers,body:JSON.stringify({start_planned:'09:00'})});assert.equal(update.status,role==='anon'?401:403,'direct task writes are revoked by the live execution transaction boundary');
  const rpc=await fetch(`${url}/rest/v1/rpc/assisted_bootstrap_session`,{method:'POST',headers,body:JSON.stringify({p_plan_id:planId,p_user_id:users.production.id,p_identity:{},p_replay:{},p_snapshot:{},p_fingerprint:'forbidden'})});
  assert.equal(rpc.status,role==='anon'?401:403,`${role} client RPC must be denied`);
  roleMatrix.push({role,planRead:read.status,clientWrites:'DENIED',restReadBoundary:'PASS'});
 }
 assert.deepEqual(await databaseMaterial(),beforeReads);
 pass('HTTP role matrix, 15 real REST/RLS boundaries and client RPC denial; rejected writes leave DB unchanged');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});let page:Page|undefined;
 const stages:any[]=[];const pageErrors:string[]=[];
 try{
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30_000);page.setDefaultNavigationTimeout(120_000);
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('dialog',dialog=>{void dialog.dismiss();}); // A clean Stage never requires exception confirmation.
  await page.goto(`${appUrl}/login`);
  await page.getByLabel('Email',{exact:true}).fill(users.production.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.production.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  pass('actual browser password login and role bootstrap');
  const bootstrap=page.waitForResponse(r=>r.url().endsWith(`${path}/session`)&&r.request().method()==='POST');
  await page.goto(`${appUrl}/plans/${planId}?tab=planning`);assert.equal((await bootstrap).status(),200);
  await page.getByTestId('assisted-workspace').waitFor();await page.getByText(/^C01 ·/).first().waitFor();
  const names=new Set((await page.getByTestId('assisted-workspace').innerText()).match(/\bC(?:0[1-9]|1[0-9])\b/g));assert.equal(names.size,19,'all canonical contestants visible by name in scope UI');let current=await state();
  assert.equal(current.activeStage.ordinal,0);assert.equal(current.history.length,1);assert.equal(current.draft.tasks.length,266);assert.ok(current.draft.tasks.every((t:any)=>t.startPlanned===null&&t.endPlanned===null));
  const s0Id=Number(current.activeStage.id);const s0Material=await databaseMaterial();
  const again=await api(path+'/session','POST',{},'admin');assert.equal(again.status,200);assert.equal(Number(again.data.activeStage.id),s0Id);assert.deepEqual(await databaseMaterial(),s0Material);
  await page.reload();await page.getByTestId('assisted-workspace').waitFor();assert.equal(Number((await state()).activeStage.id),s0Id);
  pass('S0 creation from UI, all 19 contestant names, idempotence with admin, native persistence and reload');
  const daily=async()=>(await db.query('SELECT id,start_planned,end_planned,zone_id,space_id,location_label,duration_override,cameras_override,assigned_resource_ids FROM public.daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows.map(row=>({...row,id:Number(row.id),zone_id:row.zone_id==null?null:Number(row.zone_id),space_id:row.space_id==null?null:Number(row.space_id)}));
  const beforeS1=await daily();
  const preferenceJourney=process.argv.includes("--main-flow-preference")?await configureMainFlowPreferenceJourney({appUrl,url,anon,users,db,planId,directory,full,pass,buildInput,diagnostics},page):null;
  if(process.argv.includes('--historical-topology'))await runA2HistoricalScopeJourney({appUrl,url,anon,users,db,planId,directory,full,pass,buildInput,diagnostics},page);
  if(process.argv.includes('--scope-selection'))diagnostics.scopeSelectionInitial=await runA2ScopeSelectionJourney({appUrl,users,db,planId,directory,pass},page,'initial');
  const action=async(name:string,suffix:string)=>{
   const response=page!.waitForResponse(r=>r.url().endsWith(path+suffix)&&r.request().method()==='POST');
   await page!.getByRole('button',{name,exact:true}).click();const r=await response;assert.equal(r.status(),200,`${name}: ${await r.text()}`);return r.json();
  };
  for(let ordinal=1;ordinal<=(full?11:2);ordinal++){
   current=await state();const base=structuredClone(current.activeStage.snapshotJson);
   const suggestedResponse:Promise<BrowserResponse>=page.waitForResponse(r=>r.url().endsWith(path+'/next-scope'));
   await page.getByRole('button',{name:'Sugerir siguiente alcance',exact:true}).click();const suggestion=await suggestedResponse;assert.equal(suggestion.status(),200);const scope=await suggestion.json();assert.ok(scope.selector);assert.ok(scope.taskIds.length>0);
   await page.getByText(new RegExp(`Se han seleccionado ${scope.taskIds.length} obligaciones`)).waitFor();
   const requested:Promise<BrowserResponse>=page.waitForResponse(r=>r.url().endsWith(path+'/proposals')&&r.request().method()==='POST');const start=performance.now();
   await page.getByRole('button',{name:'Generar propuesta',exact:true}).click();const request=await requested;assert.equal(request.status(),202);const {runId}=await request.json();
   // Wait for the real product polling to expose the persisted proposal. No
   // forced focus, reload, API seeding or altered solver budgets rescue this UI.
   await Promise.race([
    page.getByRole('button',{name:'Aplicar al borrador',exact:true}).waitFor({timeout:420_000}),
    page.getByText('No se pudo generar una propuesta con la selección actual. Revisa disponibilidad y conflictos.',{exact:true}).waitFor({timeout:420_000}).then(()=>{throw Error('Product UI reported a failed proposal run; inspect failedRuns SQL diagnostic');}),
    page.getByText('No se encontró una propuesta válida',{exact:true}).waitFor({timeout:420_000}).then(()=>{throw Error('Product returned NO_PROPOSAL within its unchanged budget; inspect failedRuns and the selected result');}),
   ]);
   const run=await api(path+`/proposals/${runId}`);assert.equal(run.status,200);assert.equal(run.data.status,'success');const result=run.data.assisted_result_json??run.data.assistedResultJson;assert.equal(result.outcome,'PROPOSAL');
   if(preferenceJourney)await verifyMainFlowPreferenceResult({pass,directory,diagnostics},page,result,preferenceJourney);
   const generationMs=Math.round(performance.now()-start);
   const adapter=adaptEngineInputToPlannerNextProblem(await buildInput());assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('Invalid persisted input');
   const witness=result.evidence.futureStructuralWitnesses.find((w:any)=>w.kind==='JOINT_COMPLETION');assert.ok(witness);
   let charges=0;const consume=()=>charges<100_000?(charges++,true):false;
   const protectedIds=new Set(base.tasks.filter((t:any)=>t.startPlanned&&t.endPlanned).map((t:any)=>`task:${t.taskId}`));
   assert.equal(revalidateJointCompletionWitness(adapter.problem,witness,witness.tasks.filter((t:any)=>protectedIds.has(t.id)),consume),'PASS');
   const canonicalValidation=validatePlan(adapter.problem,witness.tasks,witness.preparations,witness.spaceMeals,witness.participantMeals,[],materializeScheduledItinerantUnitMeals(adapter.problem),witness.roundPreparations,witness.operationalMeals);
   assert.equal(canonicalValidation.hardValid,true);assert.deepEqual(canonicalValidation.violations,[]);
   assert.equal(new PreparedFutureCollectiveParticipantClosure(adapter.problem).evaluate(witness.tasks,witness.participantMeals,consume,'CERTIFY').certified,true);
   const unchanged=await daily();
   const rejectedBefore=await databaseMaterial();const stale=await api(path+`/proposals/${runId}/apply`,'POST',{...guard(current),expectedDraftFingerprint:'0'.repeat(64)});assert.equal(stale.status,409);assert.deepEqual(await databaseMaterial(),rejectedBefore);
   await action('Aplicar al borrador',`/proposals/${runId}/apply`);assert.deepEqual(await daily(),unchanged,'apply may update Draft only');
   const applied=await state();assert.equal(Number(applied.draftBaseStageId),Number(current.activeStage.id));assert.notEqual(applied.draftFingerprint,current.draftFingerprint);
   const live=(await api(`/api/plans/${planId}`)).data;assert.ok(live.plannerNextConfiguration?.taskOperations?.length===266);
   const view=buildAssistedPlanningView(live.dailyTasks,applied.draft);
   for(const task of applied.draft.tasks)assert.deepEqual(view.find(row=>Number(row.id)===Number(task.taskId))!.assignedResources,task.assignedResourceIds??[],'Draft resources are displayed before daily_tasks acceptance');
   assert.deepEqual(collectAssistedDraftWarnings(view,{start:live.workStart,end:live.workEnd},live.plannerNextConfiguration),[],'local UI checks agree with legal canonical occupancy');
   assert.equal(await page.getByTestId('local-draft-warnings').count(),0,'no false warning card for legal transport/joint occupancy');
   for(const row of base.tasks.filter((t:any)=>t.startPlanned&&t.endPlanned))assert.deepEqual(applied.draft.tasks.find((t:any)=>t.taskId===row.taskId),row,'previously accepted placements automatically protected');
   for(const [field,identity] of [['operationalMeals','policyId'],['setupPreparations','id'],['roundPreparations','id']] as const)
    for(const item of base[field]??[])assert.deepEqual((applied.draft[field]??[]).find((next:any)=>next[identity]===item[identity]),item,`${field}: accepted occupation protected`);
   const validation=await action('Validar borrador','/validate');
   const validated=await state();assert.ok(validated.validation);assert.equal(validated.validation.draftFingerprint,validated.draftFingerprint);assert.equal(validated.validation.hardCount,0);assert.equal(validated.validation.requiredCount,0);
   await page.getByTestId('stage-validation-report').waitFor();
   const accepted=await action('Aceptar etapa','/accept-stage');const after=await state();assert.equal(after.activeStage.ordinal,ordinal);assert.equal(Number(after.activeStage.proposalRunId),Number(runId));assert.equal(Number(after.activeStage.parentStageId),Number(current.activeStage.id));assert.deepEqual(after.activeStage.snapshotJson,applied.draft);
   assert.equal(after.activeStage.snapshotFingerprint,fingerprintAssistedPlanningSnapshotV1(after.activeStage.snapshotJson));
   const persisted=await daily();for(const task of after.activeStage.snapshotJson.tasks){const row=persisted.find(r=>r.id===task.taskId)!;assert.deepEqual(row,{id:task.taskId,start_planned:task.startPlanned,end_planned:task.endPlanned,zone_id:task.zoneId,space_id:task.spaceId,location_label:task.locationLabel,duration_override:task.durationOverride,cameras_override:task.camerasOverride,assigned_resource_ids:task.assignedResourceIds??[]});}
   assert.equal(after.history.length,ordinal+1);
   const stageBefore=(await db.query('SELECT to_jsonb(s) AS row FROM public.assisted_planning_stages s WHERE id=$1',[after.activeStage.id])).rows[0].row;
   await assert.rejects(()=>db.query("UPDATE public.assisted_planning_stages SET snapshot_fingerprint='forbidden' WHERE id=$1",[after.activeStage.id]),/immutable/);
   assert.deepEqual((await db.query('SELECT to_jsonb(s) AS row FROM public.assisted_planning_stages s WHERE id=$1',[after.activeStage.id])).rows[0].row,stageBefore);
   // Check stale rejection in the actual RPC as well as at the HTTP boundary.
   const frozen=await databaseMaterial();await assert.rejects(()=>db.query('SELECT public.assisted_patch_draft($1,$2,$3,$4,$5)',[planId,'stale',after.draftBaseStageId,after.draft,after.draftFingerprint]),/STALE_DRAFT/);assert.deepEqual(await databaseMaterial(),frozen);
   if(ordinal===1){
    assert.equal((await db.query("SELECT has_table_privilege('service_role','public.planning_stage_validations','UPDATE') AS allowed")).rows[0].allowed,false,'acceptance must not widen immutable validation privileges');
    for(const role of ['anon','norole','viewer','aux','production','admin']){
     const headers={apikey:anon,Authorization:`Bearer ${role==='anon'?anon:users[role].token}`,'Content-Type':'application/json'};
     for(const [table,body] of [['assisted_planning_stages',{snapshot_fingerprint:'forbidden'}],['assisted_planning_sessions',{draft_fingerprint:'forbidden'}]] as const){
      const r=await fetch(`${url}/rest/v1/${table}?plan_id=eq.${planId}`,{method:'PATCH',headers,body:JSON.stringify(body)});assert.equal(r.status,role==='anon'?401:403,`${role}: direct ${table} update denied`);
     }
    }
    assert.deepEqual(await databaseMaterial(),frozen);pass('all client identities denied direct Stage/Draft writes; validation UPDATE privileges unchanged');
   }
   await page.reload();await page.getByTestId('assisted-workspace').waitFor();const reloaded=await state();assert.deepEqual(reloaded,after);
   if(await page.getByRole('button',{name:'Historial',exact:true}).getAttribute('aria-expanded')==='false')await page.getByRole('button',{name:'Historial',exact:true}).click();await page.getByText(new RegExp(`Etapa S${ordinal} ·`)).waitFor();
   if(ordinal===1||ordinal===11){await page.getByTestId('assisted-workspace').scrollIntoViewIfNeeded();await page.screenshot({path:`${directory}/S${ordinal}-real-ui.png`,fullPage:false});}
   const completed=after.draft.tasks.filter((t:any)=>t.startPlanned&&t.endPlanned).length;
   const operationalMealConsolidation=auditOperationalMealConsolidation(stageBefore.snapshot_json,witness,adapter.problem);
   stages.push({ordinal,runId:Number(runId),scope:scope.selector,scopeCount:scope.taskIds.length,completed,generationMs,fingerprint:after.activeStage.snapshotFingerprint,hardCount:validated.validation.hardCount,requiredCount:validated.validation.requiredCount,independentCanonicalWitness:'PASS',witnessFingerprint:witness.fingerprint,closure:'CERTIFIED',auditCharges:charges,persistence:'PASS',reload:'PASS',protectedPlacements:'PASS',immutableStageTrigger:'PASS',staleHttpAndRpcAtomic:'PASS',draftResourceDisplay:'PASS',legalOccupancyWarnings:'PASS',operationalMealConsolidation});
   pass(`S${ordinal} UI → run → apply → validate → accept → SQL persistence → reload (${completed}/266)`);
   // S2 is always exercised to prove continuity and automatic protection.
  }
  let persistedCanonical;
  if(full){
   const final=await state();assert.equal(final.draft.tasks.filter((t:any)=>t.startPlanned&&t.endPlanned).length,266);
   // Fuente 06 v2.8 changes input/resource/capacity authorities. Comparing an
   // old schedule fingerprint is not a regression gate for this new model.
   diagnostics.spatialTopology={contractVersion:process.argv.includes('--historical-topology')?2:1,fingerprint:final.activeStage.snapshotFingerprint,inputModel:'SOURCE_06_V2_8',previousGeometryAuthority:false};
   const persisted=(await db.query('SELECT snapshot_json FROM public.assisted_planning_stages WHERE id=$1',[final.activeStage.id])).rows[0].snapshot_json;
   assert.deepEqual(persisted,final.draft,'SQL snapshot is the accepted and reloaded plan');
   const run=(await db.query('SELECT assisted_result_json FROM public.planning_runs WHERE id=$1',[final.activeStage.proposalRunId])).rows[0].assisted_result_json;
   const witness=run.evidence.futureStructuralWitnesses.find((w:any)=>w.kind==='JOINT_COMPLETION');assert.ok(witness);
   const adapter=adaptEngineInputToPlannerNextProblem(await buildInput());assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('Invalid final input');
   persistedCanonical=auditComplete(adapter,persisted,witness);diagnostics.persistedCanonical=persistedCanonical;
   assert.equal(persistedCanonical.status,'PASS',JSON.stringify(persistedCanonical.validation));
   assert.equal(persistedCanonical.operationalMeals,persistedCanonical.expectedOperationalMeals);assert.deepEqual(persistedCanonical.missingOperationalMealIds,[]);
   pass('complete SQL snapshot: canonical hard-valid 266/266, all eight operational meals and preparations valid');
   const next=await api(path+'/next-scope');assert.equal(next.status,200);assert.equal(next.data.selector,null);pass('complete canonical coverage 266/266 and certified corrected snapshot; no remaining scope');
  }
  assert.deepEqual(pageErrors,[]);assert.notDeepEqual(await daily(),beforeS1);
  const reader=await browser.newPage({viewport:{width:1440,height:1000}});
  try{
   await reader.goto(`${appUrl}/login`);await reader.getByLabel('Email',{exact:true}).fill(users.viewer.email);
   await reader.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.viewer.password);
   await reader.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await reader.waitForURL('**/dashboard');
   const loaded=reader.waitForResponse(r=>r.url().endsWith(path)&&r.request().method()==='GET');
   await reader.goto(`${appUrl}/plans/${planId}?tab=planning`);const r=await loaded;assert.equal(r.status(),200);
   const independent=await r.json();const expected=await state();assert.deepEqual(independent.activeStage,expected.activeStage);assert.deepEqual(independent.draft,expected.draft);
   await reader.getByText('Historial',{exact:true}).click();await reader.getByText(new RegExp(`Etapa S${stages.length} ·`)).waitFor();
   pass('independent viewer browser session reopens the same persisted Stage and Draft');
  }finally{await reader.close();}
  if(process.argv.includes('--scope-selection'))diagnostics.scopeSelectionAccepted=await runA2ScopeSelectionJourney({appUrl,users,db,planId,directory,pass},page,'accepted');
  // Real atomic rollback/redo restore full daily material and active authority.
  const final=await state(),material=await daily();const rollback=await api(path+'/rollback','POST',{targetStageId:s0Id},'admin');assert.equal(rollback.status,200);assert.deepEqual(await daily(),beforeS1);assert.equal(Number((await state()).activeStage.id),s0Id);
  for(let ordinal=1;ordinal<=stages.length;ordinal++){
   const redo=await api(path+'/redo','POST',{},'admin');assert.equal(redo.status,200);assert.equal((await state()).activeStage.ordinal,ordinal,'redo advances one accepted Stage at a time');
  }
  assert.deepEqual(await daily(),material);const restored=await state();assert.equal(Number(restored.activeStage.id),Number(final.activeStage.id));assert.equal(restored.draftFingerprint,final.draftFingerprint);
  pass('admin atomic rollback to S0 and redo to final accepted Stage');
  if(preferenceJourney)await verifyMainFlowPreferenceAfterStages({db,planId,pass},preferenceJourney);
  if(process.argv.includes("--assisted-history")){const {runAssistedActiveHistory}=await import("./smokeAssistedActiveHistory");diagnostics.activeHistory=await runAssistedActiveHistory({appUrl,url,anon,users,db,planId,directory,full,pass,buildInput,diagnostics},page);}
  if(full)diagnostics.viewsHistory=await (process.argv.includes("--day-workspace")?runDayWorkspaceJourney:runA2ViewsHistoryJourney)({appUrl,url,anon,users,db,planId,directory,full,pass,buildInput,diagnostics},page);
  if(full)diagnostics.manualSnapshotFidelity=await runA2ManualSnapshotJourney({appUrl,url,anon,users,db,planId,directory,full,pass,buildInput,diagnostics});
  return {roleMatrix,s0:'PASS',stages,completed:stages.at(-1)!.completed,pageErrors,secondBrowserSession:'PASS',rollbackRedo:'PASS',searchPoliciesUnchanged:true,persistedCanonical};
 }catch(error){
  // Preserve the actual SQL run outcome before the disposable database is
  // removed. No auth tokens, credentials or full private app logs are included.
  diagnostics.failedRuns=(await db.query("SELECT id,status,message,started_at,updated_at,finished_at,assisted_result_json->>'outcome' AS outcome FROM public.planning_runs WHERE plan_id=$1 ORDER BY id",[planId])).rows;
  if(page){diagnostics.workspaceText=await page.getByTestId('assisted-workspace').innerText().catch(()=>null);await page.screenshot({path:`${directory}/failure-real-ui.png`,fullPage:false}).catch(()=>{});}
  throw error;
 }
 finally{await browser.close();}
}
