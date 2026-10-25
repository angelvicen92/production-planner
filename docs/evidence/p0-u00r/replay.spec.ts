/** Cold replay of public native receipts; no DB, credentials, or policy injection. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {buildAssistedProblem,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {preflight,validatePlan} from '../../../engine/planner-next/validate';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {resolveAssistedScope} from '../../../server/assistedScopeResolver';
import {createManualDeltaValidationHarness} from '../../../server/assistedProposalService';
import {fingerprintAssistedPlanningSnapshotV1 as fingerprint} from '../../../server/assistedPlanningSnapshot';
const bundle=JSON.parse(gunzipSync(readFileSync(process.env.U00R_RECEIPTS??'docs/evidence/p0-u00r/native/receipts.json.gz')).toString());
const read=(name:string)=>bundle[name+'.json'];
for(const label of ['A','B']){
 test(`${label}: authentic Stages, immutable prefix, nominal inventory and rollback/redo`,()=>{
  const created=read(label+'-created'),prefix=label==='A'?2:1;
  assert.equal(read(label+'-native-input').technicalChains,undefined);
  let prior:any[]=[];
  for(let n=1;n<=3;n++){
   const stage=read(`${label}-S${n}-accepted`).activeStage,run=read(`${label}-S${n}-run`).assisted_result_json;
   assert.equal(fingerprint(stage.snapshotJson),stage.snapshotFingerprint);assert.equal(stage.snapshotJson.tasks.length,4);
   const placed=stage.snapshotJson.tasks.filter((t:any)=>t.startPlanned);assert.equal(placed.length,n===1?prefix:n===2?3:4);
   assert.ok(placed.every((t:any)=>JSON.stringify(t.assignedResourceIds)===JSON.stringify([created.kit.id])));
   assert.equal(stage.validationSummaryJson.hardCount,0);assert.equal(stage.validationSummaryJson.requiredCount,0);
   for(const old of prior)assert.deepEqual(placed.find((t:any)=>t.taskId===old.taskId),old);
   const rows=read(`${label}-S${n}-persisted`);assert.equal(rows.filter((r:any)=>r.start_planned).length,placed.length);
   for(const t of placed){const row=rows.find((r:any)=>Number(r.id)===t.taskId);assert.deepEqual(row.assigned_resource_ids??[],t.assignedResourceIds);assert.equal(row.start_planned.slice(0,5),t.startPlanned);assert.equal(row.end_planned.slice(0,5),t.endPlanned);}
   assert.equal(read(`${label}-S${n}-stale`).body.code,'STALE_DRAFT');assert.equal(read(`${label}-S${n}-forged-stage`).body.code,'STALE_BASE_STAGE');
   assert.ok(read(`${label}-S${n}-forged-resource`).status>=400);
   assert.deepEqual(run.proposedDraftSnapshot,read(`${label}-S${n}-repeat`).assisted_result_json.proposedDraftSnapshot);
   prior=placed;
  }
  assert.deepEqual(read(label+'-restore').redos.at(-1).activeStage,read(label+'-S3-accepted').activeStage);
  assert.equal(read(label+'-stale-configuration-accept').body.code,'STALE_VALIDATION');
  if(label==='B'){
   const t=read('B-S2-accepted').activeStage.snapshotJson.tasks;
   assert.deepEqual(t.slice(0,3).map((x:any)=>[x.startPlanned,x.endPlanned]),[['10:00','10:20'],['10:40','10:55'],['11:00','11:25']]);
  }
 });
 test(`${label}: residual recognition and collection inversion replay`,()=>{
  const c=read(label+'-classification');assert.deepEqual(c.pendingOnly,[]);assert.equal(c.effective[0].length,label==='A'?1:2);
  const result=execute(c.scoped);assert.deepEqual(JSON.parse(JSON.stringify(result)),read(label+'-inverse-collections').original);
  const reverse=structuredClone(c.scoped);reverse.problem.tasks.reverse();reverse.problem.spaces.reverse();reverse.problem.resources.reverse();assert.deepEqual(execute(reverse),result);
  assert.equal(result.proposal!.length,label==='A'?1:2);assert.equal(result.evidence.protectedPlacementsPreserved,true);
 });
 test(`${label}: missing reference, cycle and branching stay representational failures`,()=>{
  const c=read(label+'-classification');
  for(const [kind,expected] of [['missing','MISSING_TASK_REFERENCE'],['cycle','TECHNICAL_CHAIN_CYCLE'],['branch','TECHNICAL_CHAIN_BRANCHING_UNSUPPORTED']]){
   const scoped=structuredClone(c.scoped),tasks=scoped.problem.tasks.sort((a:any,b:any)=>a.id.localeCompare(b.id));
   if(kind==='missing')tasks[2].dependencies=['absent'];if(kind==='cycle')tasks[0].dependencies=[tasks[2].id];if(kind==='branch')tasks[2].dependencies=[tasks[0].id];
   assert.ok(preflight(scoped.problem).includes(expected));const result=execute(scoped);assert.equal(result.proposal,null);assert.equal(result.evidence.work.branchesExplored,0);
  }
 });
 test(`${label}: true physical zero domains never become unsupported or exhaustion`,()=>{
  for(const kind of ['resource','window']){
   const scoped=structuredClone(read(label+'-classification').scoped);
   if(kind==='resource')scoped.problem.resources.find((r:any)=>r.id===`plan-resource:${read(label+'-created').kit.id}`).availability=[{start:480,end:485}];
   else scoped.problem.tasks.find((t:any)=>t.id===`task:${read(label+'-created').tasks[2].id}`).availability=[{start:480,end:485}];
   const r=execute(scoped);assert.equal(r.proposal,null);assert.ok(!r.evidence.reasonCodes.some((s:string)=>/UNSUPPORTED|BUDGET|TIME_LIMIT/.test(s)),r.evidence.reasonCodes.join());
  }
 });
 test(`${label}: altered member, protected identity and snapshot integrity boundaries`,()=>{
  const created=read(label+'-created'),input=read(label+'-native-input'),a=adapt(input);if(a.status!=='SUPPORTED')throw Error('unsupported');
  const c=read(label+'-classification'),good=execute(c.scoped).proposal!;
  assert.equal(validatePlan(c.scoped.originalValidationProblem,[...c.anchors,...good.map(t=>({...t,id:t.id+'-forged'}))]).hardValid,false);
  assert.equal(read(label+'-nominal-substitution').hardValid,false);
  const resolution=resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:created.tasks.slice(label==='A'?2:1,3).map((t:any)=>t.id)});
  const altered=structuredClone(c.anchors);altered[0].spaceId='absent';assert.throws(()=>buildAssistedProblem(a.problem,resolution.scope,altered),/PROTECTED_PLACEMENT_TASK_MISMATCH/);
  const snapshot=structuredClone(read(label+'-S3-accepted').activeStage.snapshotJson);snapshot.tasks[1].assignedResourceIds=[created.substitute.id];
  assert.notEqual(fingerprint(snapshot),read(label+'-S3-accepted').activeStage.snapshotFingerprint);
  // The isolated manual seam rematerializes fixed byItem from source; its
  // known-ID assignment is not itself a proof of snapshot authenticity.
  const validation=createManualDeltaValidationHarness(a.problem,a.identityMap)(input,snapshot,[created.tasks[1].id]);assert.equal(validation.hardValid,true);
  snapshot.tasks[1].endPlanned=snapshot.tasks[1].startPlanned;
  assert.throws(()=>createManualDeltaValidationHarness(a.problem,a.identityMap)(input,snapshot,[created.tasks[1].id]),/INVALID_PROTECTED_PLACEMENT/);
 });
}
