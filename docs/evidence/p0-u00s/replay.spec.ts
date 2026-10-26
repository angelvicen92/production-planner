/** Cold replay of original productive receipts. No writes, database or EngineInput overrides. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../../../engine/types';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {preflightEngineInputForPlannerNext as preflight} from '../../../engine/planner-next/integration/engineInputPreflight';
import {buildAssistedProblem,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
process.env.SUPABASE_URL='http://127.0.0.1:1';process.env.SUPABASE_ANON_KEY='isolated-replay';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-replay';
const {materializeAssistedSnapshotOccupations}=await import('../../../server/assistedProposalService');
import {fingerprintAssistedPlanningSnapshotV1 as fingerprint} from '../../../server/assistedPlanningSnapshot';
import {buildEffectivePlanConfigRevisionV1,projectEffectiveAuthoritiesFromEngineInputV1} from '../../../server/effectivePlanConfigRevision';
import {buildEffectivePlanConfigReplaySnapshotV1} from '../../../server/assistedPlanningConfigRevision';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate';
const receipts=JSON.parse(gunzipSync(readFileSync(process.env.U00S_RECEIPTS??'docs/evidence/p0-u00s/native/receipts.json.gz')).toString());
const read=(name:string)=>receipts[name+'.json'];
for(const label of ['A','B','C','D']){
 test(`${label}: effective input, semantic order and scope survive a cold deterministic replay`,()=>{
  const input:EngineInput=read(label+'-input'),policy=input.technicalChains![0];
  assert.equal(preflight(input).status,'SUPPORTED');const a=adapt(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
  assert.notDeepEqual(policy.orderedTaskIds,[...policy.orderedTaskIds].sort((a,b)=>a-b));
  assert.deepEqual(resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:[policy.orderedTaskIds[1]]}).productTaskIds,[...policy.orderedTaskIds].sort((a,b)=>a-b));
  const reverse=structuredClone(input);reverse.tasks.reverse();reverse.planSpaceSettings?.reverse();reverse.planResourceItems.reverse();assert.equal(adapt(reverse).problemFingerprint,a.problemFingerprint);
  if(label==='B'){
   const run=read('B-no-proposal').assisted_result_json;
   const result=execute(buildAssistedProblem(a.problem,resolveAssistedScope(input,a,run.selector).scope,[],analyticalFutureEligibleTaskIds(input,a.identityMap)));
   assert.equal(result.proposal,null);assert.deepEqual(result.evidence.work,run.evidence.work);
   assert.equal(read('B-ordinary-gap-certificate-rejected').message,'TECHNICAL_CHAIN_CERTIFICATE_INVALID');
   assert.equal(read('B-no-validation-accept').status,409);
  }else{
   let base=read(label+'-S0').draft;
   for(const stage of [1,2]){
    const native=read(`${label}-S${stage}-run`).assisted_result_json;
    const context=materializeAssistedSnapshotOccupations(a.problem,a.identityMap,base);
    const scope=resolveAssistedScope(input,a,native.selector).scope;
    const problem=buildAssistedProblem(a.problem,scope,context.protectedPlacements,analyticalFutureEligibleTaskIds(input,a.identityMap));
    const result=execute(problem);assert.ok(result.proposal);
    assert.deepEqual(result.evidence.work,native.evidence.work);assert.equal(result.evidence.fingerprint,native.evidence.fingerprint);
    const proof=certifyDailyTechnicalChain(a.problem,[...context.protectedPlacements,...result.proposal!],a.problem.budget.maxBranchExpansions-Number(result.evidence.work.branchesExplored??0));
    assert.deepEqual(proof,native.evidence.technicalChainCertificate);
    const accepted=read(`${label}-S${stage}-accepted`).activeStage;
    assert.equal(fingerprint(accepted.snapshotJson),accepted.snapshotFingerprint);
    for(const old of base.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(accepted.snapshotJson.tasks.find((t:any)=>t.taskId===old.taskId),old);
    base=accepted.snapshotJson;
   }
   const row=read(label+'-configuration-receipt')[0],replay=row.replay_snapshot_json;
   const args={planId:input.planId,taskTemplateSnapshots:replay.taskTemplateSnapshots,optimizerSnapshot:replay.optimizerSnapshot,taskTemplateProvenance:{authority:'plan_task_template_snapshots',authorityContractVersion:1},optimizerProvenance:{authority:'plan_optimizer_snapshots',authorityContractVersion:1},authorities:projectEffectiveAuthoritiesFromEngineInputV1(input)};
   assert.deepEqual(buildEffectivePlanConfigRevisionV1(args),row.identity_json);assert.deepEqual(buildEffectivePlanConfigReplaySnapshotV1(args),replay);
   assert.deepEqual(read(label+'-restore').redo.activeStage,read(label+'-S2-accepted').activeStage);
  }
  assert.equal(read(label+'-SQL-U00q-replay-without-material-authority').message,'TECHNICAL_CHAIN_AUTHORITY_NOT_MATERIALIZED');
  for(const [name,r] of Object.entries(receipts) as [string,any][])if(name.startsWith(label+'-SQL-')||name.startsWith(label+'-S1-certificate-')||name.startsWith(label+'-S2-certificate-')){
   if(name.includes('editors-race')){assert.equal(r.filter((x:any)=>x.status===200).length,1);assert.equal(r.filter((x:any)=>x.status===409).length,1);}
   else if(name.includes('concurrent-source-http'))assert.equal(r.status,409);
   else assert.equal(r.accepted,false,name);
  }
 });
}
test('future witness is never a placement in the accepted independent Stage',()=>{
 const run=read('D-S1-run').assisted_result_json,ids=read('D-input').technicalChains[0].orderedTaskIds;
 assert.equal(run.proposal.length,1);assert.equal(run.evidence.technicalChainCertificate.tasks.length,3);
 assert.ok(run.proposedDraftSnapshot.tasks.filter((t:any)=>ids.includes(t.taskId)).every((t:any)=>t.startPlanned===null));
 assert.equal(read('D-S1-accepted').activeStage.snapshotJson.tasks.filter((t:any)=>t.startPlanned).length,1);
});
