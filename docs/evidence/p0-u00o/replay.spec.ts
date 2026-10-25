/** Cold replay: receipts only; no storage, Auth, credentials or network calls. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import type {EngineInput} from '../../../engine/types';

const receipts=JSON.parse(gunzipSync(readFileSync(process.env.U00O_RECEIPTS??'docs/evidence/p0-u00o/native/receipts.json.gz')).toString());
const read=(name:string)=>receipts[name+'.json'];
// These seven existing CPU telemetry fields are the only excluded values.
const timingKeys=new Set(['futureItinerantOperationalMealsMs','futureItinerantParticipantFutureMs','futureItinerantParticipantMealsMs','futureItinerantPrerequisiteSearchMs','futureItinerantPriorRevalidationMs','futureItinerantStructuralSearchMs','futureItinerantTechnicalFutureMs']);
const semantic=(value:unknown)=>JSON.parse(JSON.stringify(value,(key,v)=>timingKeys.has(key)?undefined:v));
for(const label of ['A','B']){
 test(`${label}: cold solver replay, identity/order determinism, complete snapshots`,()=>{
  const input:EngineInput=read(label+'-counterfactual-input');
  const adapted=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapted.status,'SUPPORTED');if(adapted.status!=='SUPPORTED')throw Error('unsupported');
  const ids=input.roundSynchronizations!.flatMap(p=>p.lanes.flatMap(l=>l.taskIds));
  const make=(value:EngineInput)=>{
   const a=adaptEngineInputToPlannerNextProblem(value);if(a.status!=='SUPPORTED')throw Error('unsupported');
   return executeAssistedPlanning(buildAssistedProblem(a.problem,resolveAssistedScope(value,a,{kind:'TASK_IDS',taskIds:ids}).scope,[],analyticalFutureEligibleTaskIds(value,a.identityMap)));
  };
  assert.deepEqual(JSON.parse(JSON.stringify(make(input))),read(label+'-solver'));
  const reordered=structuredClone(input);reordered.tasks.reverse();reordered.planSpaceSettings?.reverse();reordered.roundSynchronizations!.reverse();
  for(const p of reordered.roundSynchronizations!){p.lanes.reverse();for(const lane of p.lanes)lane.taskIds.reverse();}
  const reversed=adaptEngineInputToPlannerNextProblem(reordered);assert.equal(reversed.status,'SUPPORTED');
  assert.equal(reversed.problemFingerprint,adapted.problemFingerprint);
  assert.deepEqual(JSON.parse(JSON.stringify(make(reordered))),read(label+'-solver'));
  const proposed=read(label+'-simulated-product-proposal').result;
  assert.equal(proposed.proposedDraftSnapshot.tasks.length,5);assert.equal(proposed.proposedDraftSnapshot.roundPreparations.length,2);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(proposed.proposedDraftSnapshot),proposed.proposedDraftFingerprint);
  const stage=read(label+'-product-stage').activeStage;
  assert.equal(fingerprintAssistedPlanningSnapshotV1(stage.snapshotJson),stage.snapshotFingerprint);
  assert.equal(stage.snapshotJson.roundPreparations,undefined);
  assert.notEqual(read(label+'-identities').actual.configurationFingerprint,read(label+'-identities').counterfactual.configurationFingerprint);
 });
 test(`${label}: future unit survives independent scope; negative schedules never become proposals`,()=>{
  const future=read(label+'-independent-scope');
  const result=executeAssistedPlanning(future.problem);assert.deepEqual(semantic(result),semantic(future.result));
  assert.equal(result.evidence.futureStructuralWitnesses!.filter(w=>w.kind==='ROUND_SYNCHRONIZATION').length,1);
  assert.equal(result.proposal!.length,1);
  for(const name of ['preparation','impossible']){
   const input:EngineInput=read(`${label}-negative-${name}`).input,a=adaptEngineInputToPlannerNextProblem(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
   const ids=input.roundSynchronizations!.flatMap(p=>p.lanes.flatMap(l=>l.taskIds));
   const r=executeAssistedPlanning(buildAssistedProblem(a.problem,resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:ids}).scope,[],analyticalFutureEligibleTaskIds(input,a.identityMap)));
   assert.equal(r.proposal,null);assert.deepEqual(JSON.parse(JSON.stringify(r)),read(`${label}-negative-${name}-solver`));
   assert.ok(!r.evidence.reasonCodes.some(code=>/BUDGET|TIME_LIMIT/.test(code)));
  }
  assert.ok(read(label+'-negative-impossible-without-sync').proposal);
  for(const name of ['wrongSpace','missingTask'])assert.equal(read(`${label}-negative-${name}`).adapter.status,'UNSUPPORTED');
  assert.equal(read(label+'-mixed-preflight').adapter.status,'UNSUPPORTED');
  assert.equal(read(label+'-validation').hardValid,true);
  assert.equal(read(label+'-missing-preparation-validation').hardValid,false);
  assert.equal(read(label+'-desynchronized-validation').hardValid,false);
  assert.equal(read(label+'-stage-barrier').code,'STALE_CONFIG_REVISION');
  assert.equal(read(label+'-SQL-authority-barrier').message,'PLANNER_NEXT_CONFIGURATION_IMMUTABLE');
  assert.equal(read(label+'-SQL-replay-barrier').message,'STALE_ROUND_PREPARATION_CANDIDATE');
 });
}
