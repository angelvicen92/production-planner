import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTaskTemplateCatalogEntry, taskTemplateSnapshotToPersistenceRow, projectTaskTemplateSnapshotRow } from "./taskTemplateSnapshot";
import { applyEffectiveOperationContinuity, candidateOperationContinuity, operationContinuityValues } from "./operationContinuity";
import { dayConfigEditSchema, dayConfigRestoreSchema } from "../shared/dayConfig";
import { createSupportedEngineInputAdapterFixture } from "../engine/planner-next/integration/engineInputAdapter.fixture";
import { adaptEngineInputToPlannerNextProblem } from "../engine/planner-next/integration/engineInputAdapter";
import { executePlannerNext } from "../engine/planner-next/executePlannerNext";
import { projectEffectiveAuthoritiesFromEngineInputV1, buildEffectivePlanConfigRevisionV1 } from "./effectivePlanConfigRevision";
import { buildEffectivePlanConfigReplaySnapshotV1 } from "./assistedPlanningConfigRevision";
import { normalizePlanOptimizerSnapshotV1 } from "./planOptimizerSnapshot";
import { preflightEngineInputForPlannerNext } from "../engine/planner-next/integration/engineInputPreflight";

const group={id:"89ec43df-77d9-4701-aefc-b006b0f9f9a0",name:"Preparations",policy:"OFF" as const,gapWeight:3,revision:1};
function generic() {
  const input=createSupportedEngineInputAdapterFixture();
  input.plannerNext!.searchBudget.maxBranchExpansions=100000;
  input.defaultParticipantTransitionMinutes=10;
  input.tasks=input.tasks.filter(task=>task.id!==105);input.locks=input.locks.filter(lock=>lock.taskId!==105);
  input.tasks.push(...[401,402,403].map((id,index)=>({id,planId:input.planId,templateId:index%2?951:950,status:"pending" as const,
    plannerNextKind:"auxiliary" as const,contestantId:index%2?202:201,spaceId:303,zoneId:403,durationOverrideMin:10})));
  const snapshots=[950,951].map(id=>normalizeTaskTemplateCatalogEntry({id,name:`Secondary family ${id}`,defaultDuration:10,continuityGroup:group}));
  const row={operation_continuity_overrides:[]};
  return {input:applyEffectiveOperationContinuity(input,row,snapshots),snapshots,row};
}
test("two templates retain one structured group through persist/reopen, fresh day, input, adapter and engine",()=>{
  const {input,snapshots,row}=generic();
  assert.deepEqual(input.operationContinuityGroups,[{id:group.id,policy:"OFF",gapWeight:3,taskIds:[401,402,403]}]);
  const reopened=snapshots.map((snapshot,index)=>projectTaskTemplateSnapshotRow({...taskTemplateSnapshotToPersistenceRow(701,snapshot),id:index+1}));
  assert.deepEqual(applyEffectiveOperationContinuity({...input,operationContinuityGroups:undefined},row,reopened),input);
  const updatedGeneral=normalizeTaskTemplateCatalogEntry({id:950,name:"Future family",defaultDuration:10,continuityGroup:{...group,policy:"REQUIRED",revision:2}});
  assert.notEqual(updatedGeneral.sourceFingerprint,snapshots[0].sourceFingerprint);
  assert.equal(reopened[0].continuityGroup!.policy,"OFF");
  const adapter=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapter.status,"SUPPORTED");if(adapter.status!=="SUPPORTED")return;
  assert.equal(adapter.problem.operationContinuityGroups![0].id,group.id);
  assert.deepEqual(adapter.problem.operationContinuityGroups![0].taskIds,["task:401","task:402","task:403"]);
  const run=executePlannerNext(adapter.problem);assert.equal(run.result?.complete,true);
});
test("daily precedence, explicit protected authority, RESTORE, fingerprints and durable replay",()=>{
  const {input,snapshots,row}=generic();
  const edited=candidateOperationContinuity(input,{groupId:group.id,policy:"PREFERRED",gapWeight:7},false,input);
  const beforeAdapter=adaptEngineInputToPlannerNextProblem(input),afterAdapter=adaptEngineInputToPlannerNextProblem(edited);
  assert.notEqual(beforeAdapter.sourceFingerprint,afterAdapter.sourceFingerprint);
  assert.notEqual(beforeAdapter.problemFingerprint,afterAdapter.problemFingerprint);
  const inverted=structuredClone(edited);inverted.operationContinuityGroups![0].taskIds.reverse();
  assert.equal(adaptEngineInputToPlannerNextProblem(inverted).sourceFingerprint,afterAdapter.sourceFingerprint);
  const without=structuredClone(input);delete without.operationContinuityGroups;
  assert.equal(preflightEngineInputForPlannerNext({...without,operationContinuityGroups:[]}).sourceFingerprint,preflightEngineInputForPlannerNext(without).sourceFingerprint);
  const override={groupId:group.id,policy:"PREFERRED",gapWeight:7,by:"00000000-0000-0000-0000-000000000001",at:"2026-10-21T12:00:00Z"};
  assert.deepEqual(applyEffectiveOperationContinuity({...input,operationContinuityGroups:undefined},{operation_continuity_overrides:[override]},snapshots),edited);
  assert.equal(operationContinuityValues(edited,{operation_continuity_overrides:[override]},snapshots)[0].source,"DAY_OVERRIDE");
  assert.deepEqual(candidateOperationContinuity(edited,{groupId:group.id},true,input),input);
  const explicit={...row,planner_next_configuration:{operationContinuityGroups:[{...input.operationContinuityGroups![0],policy:"REQUIRED"}]}};
  assert.equal(applyEffectiveOperationContinuity(input,explicit,snapshots).operationContinuityGroups![0].policy,"REQUIRED");
  const material=(value:typeof input)=>({planId:701,taskTemplateSnapshots:snapshots,optimizerSnapshot:normalizePlanOptimizerSnapshotV1({}),
    taskTemplateProvenance:{authority:"plan_task_template_snapshots",authorityContractVersion:1},optimizerProvenance:{authority:"plan_optimizer_snapshots",authorityContractVersion:1},authorities:JSON.parse(JSON.stringify(projectEffectiveAuthoritiesFromEngineInputV1(value)))});
  assert.notEqual(buildEffectivePlanConfigRevisionV1(material(edited)).configurationFingerprint,buildEffectivePlanConfigRevisionV1(material(input)).configurationFingerprint);
  const replay=buildEffectivePlanConfigReplaySnapshotV1(material(edited));
  assert.deepEqual((replay.authorities.plan_workday as any)[0].plannerNextAuthorities.operationContinuityGroups,edited.operationContinuityGroups);
});
test("invalid memberships and stale-edit shapes fail closed, preserving independent authorities",()=>{
  const {input,snapshots,row}=generic();
  const edit={groupId:group.id,policy:"REQUIRED",gapWeight:3};
  assert.equal(dayConfigEditSchema.safeParse({operationContinuity:edit,expectedRevisionId:null}).success,true);
  for(const body of [{operationContinuity:edit},{operationContinuity:edit,expectedRevisionId:null,participantTransitionMinutes:0},{operationContinuity:{...edit,taskIds:[1]},expectedRevisionId:2}])assert.equal(dayConfigEditSchema.safeParse(body).success,false);
  assert.equal(dayConfigRestoreSchema.safeParse({capability:"OPERATION_CONTINUITY",operationContinuity:{groupId:group.id},expectedRevisionId:2}).success,true);
  assert.throws(()=>applyEffectiveOperationContinuity(input,{operation_continuity_overrides:[{groupId:"invalid"}]},snapshots));
  const bad=structuredClone(input);bad.operationContinuityGroups![0].taskIds.push(987654);
  assert.equal(preflightEngineInputForPlannerNext(bad).status,"UNSUPPORTED");
  const unsupported=structuredClone(input);unsupported.operationContinuityGroups![0].taskIds.push(101);
  assert.equal(preflightEngineInputForPlannerNext(unsupported).status,"UNSUPPORTED");
  assert.equal(adaptEngineInputToPlannerNextProblem(unsupported).status,"UNSUPPORTED");
  const conflict=[snapshots[0],normalizeTaskTemplateCatalogEntry({id:951,name:"Conflicting family",defaultDuration:10,continuityGroup:{...group,policy:"REQUIRED"}})];
  assert.throws(()=>applyEffectiveOperationContinuity(input,row,conflict),/CONFIGURATION_CONFLICT/);
});
