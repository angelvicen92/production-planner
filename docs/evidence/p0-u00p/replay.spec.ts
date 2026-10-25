/** Deterministic cold replay of the genuine persisted authorities and accepted snapshots. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {buildEffectivePlanConfigRevisionV1,projectEffectiveAuthoritiesFromEngineInputV1} from '../../../server/effectivePlanConfigRevision';
import {buildEffectivePlanConfigReplaySnapshotV1} from '../../../server/assistedPlanningConfigRevision';
import type {EngineInput} from '../../../engine/types';
const path=process.env.U00P_RECEIPTS??'docs/evidence/p0-u00p/native/receipts.json.gz';
const receipts=JSON.parse(gunzipSync(readFileSync(path)).toString());
const timingKeys=new Set(['futureItinerantOperationalMealsMs','futureItinerantParticipantFutureMs','futureItinerantParticipantMealsMs','futureItinerantPrerequisiteSearchMs','futureItinerantPriorRevalidationMs','futureItinerantStructuralSearchMs','futureItinerantTechnicalFutureMs']);
const semantic=(value:unknown)=>JSON.parse(JSON.stringify(value,(key,v)=>timingKeys.has(key)?undefined:v));
for(const label of ['A','B']){
 test(`${label}: real authority closes member/space scopes, keeps an independent witness, and replays deterministically`,()=>{
  const input:EngineInput=receipts[label+'-input.json'],before=structuredClone(input);
  const revision=receipts[label+'-revision.json'],replay=revision.replay_snapshot_json;
  const args={planId:input.planId,optimizerSnapshot:replay.optimizerSnapshot,taskTemplateSnapshots:replay.taskTemplateSnapshots,optimizerProvenance:{authority:'plan_optimizer_snapshots',authorityContractVersion:1},taskTemplateProvenance:{authority:'plan_task_template_snapshots',authorityContractVersion:1},authorities:projectEffectiveAuthoritiesFromEngineInputV1(input)};
  assert.deepEqual(buildEffectivePlanConfigRevisionV1(args),revision.identity_json);
  assert.deepEqual(buildEffectivePlanConfigReplaySnapshotV1(args),replay);
  const a=adaptEngineInputToPlannerNextProblem(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
  const members=input.roundSynchronizations!.flatMap(p=>p.lanes.flatMap(l=>l.taskIds));
  const make=(value:EngineInput,selector:any)=>{
   const adapter=adaptEngineInputToPlannerNextProblem(value);if(adapter.status!=='SUPPORTED')throw Error('unsupported');
   const resolution=resolveAssistedScope(value,adapter,selector);
   return executeAssistedPlanning(buildAssistedProblem(adapter.problem,resolution.scope,[],analyticalFutureEligibleTaskIds(value,adapter.identityMap)));
  };
  for(const suffix of ['member','space','independent']){
   const captured=receipts[`${label}-${suffix}-scope.json`];
   assert.deepEqual(semantic(executeAssistedPlanning(captured.problem)),semantic(captured.result));
  }
  const selector={kind:'TASK_IDS',taskIds:[members[0]]};
  assert.deepEqual(semantic(make(input,selector)),semantic(receipts[label+'-member-scope.json'].result));
  const reverse=structuredClone(input);reverse.tasks.reverse();reverse.planSpaceSettings?.reverse();
  for(const p of reverse.roundSynchronizations!){p.lanes.reverse();for(const l of p.lanes)l.taskIds.reverse();}
  assert.deepEqual(semantic(make(reverse,selector)),semantic(make(input,selector)));
  assert.deepEqual(input,before);
 });
 test(`${label}: accepted S1/S2 fingerprints and persisted placements prove synchronization`,()=>{
  const s1=receipts[label+'-S1.json'].activeStage,s2=receipts[label+'-S2.json'].activeStage;
  for(const stage of [s1,s2])assert.equal(fingerprintAssistedPlanningSnapshotV1(stage.snapshotJson),stage.snapshotFingerprint);
  const policy=receipts[label+'-input.json'].roundSynchronizations[0];
  const placements=receipts[label+'-persisted-placements.json'];
  const lanes=policy.lanes.map((l:any)=>placements.filter((t:any)=>l.taskIds.includes(t.id)).map((t:any)=>[t.start_planned,t.end_planned]));
  assert.equal(lanes[0].length,2);assert.deepEqual(lanes[0],lanes[1]);assert.equal(s1.snapshotJson.roundPreparations.length,2);
  assert.deepEqual(s1.snapshotJson.roundPreparations,s2.snapshotJson.roundPreparations);
  assert.equal(s2.snapshotJson.tasks.filter((t:any)=>t.startPlanned).length,5);
  assert.deepEqual(receipts[label+'-restore.json'].redo2.activeStage,s2);
 });
}
