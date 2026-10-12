/** Runs only against the disposable database owned by smokeA2Integration. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type {runA2BrowserJourney} from './smokeA2Journey';
import {fingerprintAssistedPlanningSnapshotV1 as fp} from '../../server/assistedPlanningSnapshot';
export async function runA2ManualSnapshotJourney(options:Parameters<typeof runA2BrowserJourney>[0]){
 const {appUrl,users,db,planId,directory,buildInput,pass}=options;
 assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 assert.equal(new URL(process.env.SUPABASE_URL!).hostname,'127.0.0.1');
 // Import only after the disposable runner installs its local credentials.
 const {validateManualAssistedDelta}=await import('../../server/assistedProposalService');
 const path=`/api/plans/${planId}/assisted`;
 const api=async(suffix:string,method='GET',body?:unknown)=>{
  const response=await fetch(`${appUrl}${path}${suffix}`,{method,headers:{Authorization:`Bearer ${users.production.token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json() as any};
 };
 const state=async()=>{const r=await api('');assert.equal(r.status,200);return r.data;};
 const initial=await state(),base=initial.activeStage.snapshotJson;
 assert.equal(base.tasks.length,266);assert.equal(base.operationalMeals.length,8);assert.equal(base.roundPreparations.length,17);assert.equal(base.setupPreparations.length,1);
 const invariantTables=['daily_tasks','assisted_planning_stages','planning_accepted_exceptions','planning_stage_validations'];
 const invariants=async()=>Promise.all(invariantTables.map(async table=>(await db.query(`SELECT to_jsonb(x) AS row FROM public.${table} x WHERE plan_id=$1 ORDER BY id`,[planId])).rows));
 const before=await invariants();
 const input=await buildInput();
 const original=validateManualAssistedDelta(input,base,[10048])!;assert.deepEqual(original.validationSummary.reasonCodes,[]);
 const guard=(s:any)=>({expectedDraftFingerprint:s.draftFingerprint,expectedBaseStageId:Number(s.draftBaseStageId)});
 const action=async(suffix:string,extra:Record<string,unknown>={},method='POST')=>{const current=await state();const r=await api(suffix,method,{...guard(current),...extra});assert.equal(r.status,200,JSON.stringify(r.data));return state();};
 const moved=await action('/draft',{changes:[{taskId:10048,startPlanned:'19:00',endPlanned:'19:05'}]},'PATCH');
 assert.deepEqual(moved.draft.setupPreparations,base.setupPreparations);assert.deepEqual(moved.draft.roundPreparations,base.roundPreparations);assert.deepEqual(moved.draft.operationalMeals,base.operationalMeals);
 const complete=validateManualAssistedDelta(input,moved.draft,[10048])!;
 assert.deepEqual(complete.validationSummary.reasonCodes,['AVAILABILITY_VIOLATION','TRANSPORT_GROUPING_VIOLATION']);
 assert.deepEqual(complete.validationSummary.unstructuredReasonCodes,['TRANSPORT_GROUPING_VIOLATION']);
 assert.deepEqual(complete.structuredViolations[0].affectedTaskIds,[10048]);
 const blocked=await api('/validate','POST',guard(moved));assert.equal(blocked.status,422);assert.equal(blocked.data.code,'ASSISTED_DELTA_VALIDATION_UNSUPPORTED');
 assert.deepEqual(await invariants(),before,'manual replay records nothing when an anonymous family remains');
 const undone=await action('/draft/undo');assert.deepEqual(undone.draft,base);assert.equal(undone.draftFingerprint,initial.draftFingerprint);
 const redone=await action('/draft/redo');assert.deepEqual(redone.draft,moved.draft);assert.equal(redone.draftFingerprint,fp(moved.draft));
 const reset=await action('/draft/reset');assert.deepEqual(reset.draft,base);assert.equal(reset.draftFingerprint,initial.draftFingerprint);
 const first=input.tasks[0],members=input.tasks.filter(t=>t.templateId===first.templateId&&t.spaceId===first.spaceId).slice(0,2).map(t=>t.id);
 const blockedSnapshot=await action('/draft/blocks',{operation:{kind:'CREATE_BLOCK',memberTaskIds:members}});
 assert.equal(blockedSnapshot.draft.planningBlocks.length,1);assert.deepEqual(blockedSnapshot.draft.roundPreparations,base.roundPreparations);assert.deepEqual(blockedSnapshot.draft.setupPreparations,base.setupPreparations);
 assert.deepEqual((await action('/draft/undo')).draft,base);assert.deepEqual((await action('/draft/redo')).draft,blockedSnapshot.draft);
 assert.deepEqual((await action('/draft/reset')).draft,base);assert.deepEqual(await invariants(),before);
 const report={status:'PASS',mode:'NATIVE_DISPOSABLE_HTTP_SQL',remoteWrites:0,baselineFingerprint:initial.draftFingerprint,baseline:original.validationSummary,moved:complete.validationSummary,productViolations:complete.structuredViolations,manualUndoRedo:'PASS',blockUndoRedo:'PASS',reset:'EXACT_BASELINE',acceptedMaterial:'UNCHANGED',anonymousTransport:'FAIL_CLOSED'};
 writeFileSync(`${directory}/manual-snapshot-fidelity.json`,JSON.stringify(report,null,2));
 pass('complete manual snapshot replay, task/block Undo/Redo and exact reset; real transport conflict stays fail-closed; accepted material unchanged');
 return report;
}
