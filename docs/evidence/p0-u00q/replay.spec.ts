/** Cold deterministic replay: no database, credentials, network or configuration injection into product. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../../../engine/types';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {fingerprintAssistedPlanningSnapshotV1 as snapshotFingerprint} from '../../../server/assistedPlanningSnapshot';
import {buildEffectivePlanConfigRevisionV1,projectEffectiveAuthoritiesFromEngineInputV1} from '../../../server/effectivePlanConfigRevision';
import {buildEffectivePlanConfigReplaySnapshotV1} from '../../../server/assistedPlanningConfigRevision';
import {PreparedFutureTechnicalChainAuthority,probeTechnicalChainFutureReservations} from '../../../engine/planner-next/technicalChainFutureFeasibility';
import {generateTechnicalChainCandidates} from '../../../engine/planner-next/technicalChains';
import {validatePlan} from '../../../engine/planner-next/validate';
const receipts=JSON.parse(gunzipSync(readFileSync(process.env.U00Q_RECEIPTS??'docs/evidence/p0-u00q/native/receipts.json.gz')).toString());
const read=(name:string)=>receipts[name+'.json'];
const timingKeys=new Set(['futureItinerantOperationalMealsMs','futureItinerantParticipantFutureMs','futureItinerantParticipantMealsMs','futureItinerantPrerequisiteSearchMs','futureItinerantPriorRevalidationMs','futureItinerantStructuralSearchMs','futureItinerantTechnicalFutureMs']);
const semantic=(v:unknown)=>JSON.parse(JSON.stringify(v,(key,value)=>timingKeys.has(key)?undefined:value));
for(const label of ['A','B']){
 test(`${label}: input, policy identity, scope, solver and collection order replay`,()=>{
  const native:EngineInput=read(label+'-native-input'),explicit:EngineInput=read(label+'-explicit-input');
  const initial=structuredClone(native),ids=explicit.technicalChains![0]!.orderedTaskIds;
  for(const [mode,input] of [['native',native],['explicit',explicit],['relaxed',read(label+'-relaxed-input')]] as const){
   const a=adapt(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
   const make=(value:EngineInput)=>{const b=adapt(value);if(b.status!=='SUPPORTED')throw Error('unsupported');return execute(buildAssistedProblem(b.problem,resolveAssistedScope(value,b,{kind:'TASK_IDS',taskIds:ids}).scope,[],analyticalFutureEligibleTaskIds(value,b.identityMap)));};
   assert.deepEqual(semantic(make(input)),semantic(read(`${label}-${mode}-solver`).result));
   const reverse=structuredClone(input);reverse.tasks.reverse();reverse.planSpaceSettings?.reverse();reverse.planResourceItems.reverse();
   // Ordered chain members are semantic authority; their order is intentionally preserved.
   assert.equal(adapt(reverse).problemFingerprint,a.problemFingerprint);assert.deepEqual(semantic(make(reverse)),semantic(make(input)));
  }
  const identity=read(label+'-identities');
  for(const [input,key,replayKey] of [[native,'actual','actualReplay'],[explicit,'explicit','explicitReplay']] as const){
   const replay=identity[replayKey],args={planId:input.planId,optimizerSnapshot:replay.optimizerSnapshot,taskTemplateSnapshots:replay.taskTemplateSnapshots,optimizerProvenance:{authority:'plan_optimizer_snapshots',authorityContractVersion:1},taskTemplateProvenance:{authority:'plan_task_template_snapshots',authorityContractVersion:1},authorities:projectEffectiveAuthoritiesFromEngineInputV1(input)};
   assert.deepEqual(buildEffectivePlanConfigRevisionV1(args),identity[key]);assert.deepEqual(buildEffectivePlanConfigReplaySnapshotV1(args),replay);
  }
  assert.notEqual(identity.actual.configurationFingerprint,identity.explicit.configurationFingerprint);assert.deepEqual(native,initial);
 });
 test(`${label}: real Stages, nominal persistence, protected continuation and barriers`,()=>{
  const created=read(label+'-created'),kit=created.kit.id;
  const s1=read(label+'-S1-accepted').activeStage,s2=read(label+'-S2-accepted').activeStage;
  for(const stage of [s1,s2])assert.equal(snapshotFingerprint(stage.snapshotJson),stage.snapshotFingerprint);
  assert.equal(s1.snapshotJson.tasks.filter((t:any)=>t.startPlanned).length,3);assert.equal(s2.snapshotJson.tasks.filter((t:any)=>t.startPlanned).length,4);
  for(const old of s1.snapshotJson.tasks.filter((t:any)=>t.startPlanned))assert.deepEqual(s2.snapshotJson.tasks.find((t:any)=>t.taskId===old.taskId),old);
  assert.ok(s2.snapshotJson.tasks.every((t:any)=>JSON.stringify(t.assignedResourceIds)===JSON.stringify([kit])));
  const persisted=read(label+'-S2-persisted');assert.equal(persisted.length,4);assert.ok(persisted.every((t:any)=>t.start_planned&&t.end_planned&&t.assigned_resource_ids.includes(kit)));
  assert.deepEqual(read(label+'-restore').redo.activeStage,s2);
  assert.equal(read(label+'-authentic-revision-barrier').code,'STALE_CONFIG_REVISION');assert.equal(read(label+'-SQL-immutable').message,'PLANNER_NEXT_CONFIGURATION_IMMUTABLE');
  assert.equal(read(label+'-general-rejection').status,400);assert.equal(read(label+'-daily-rejection').status,400);
  const sql=read(label+'-SQL-replay-accepted-rollback');assert.equal(sql.transactionRolledBack,true);assert.equal(sql.plan[0].planner_next_configuration,null);
  assert.ok(read(label+'-native-protected-prefix').result.evidence.reasonCodes.some((x:string)=>x.includes('UNSUPPORTED_STANDALONE_TASK_KIND')));
  if(label==='A')assert.ok(read(label+'-explicit-protected-prefix').result.proposal);
 });
 test(`${label}: negatives distinguish unsupported references, physical zero domain and required violations`,()=>{
  for(const name of ['missingMember','missingDependency'])assert.equal(read(`${label}-negative-${name}`).adapter.status,'UNSUPPORTED');
  for(const name of ['unavailableResource','unavailableSpace']){
   const captured=read(`${label}-negative-${name}-solver`),result=execute(captured.problem);
   assert.deepEqual(semantic(result),semantic(captured.result));assert.equal(result.proposal,null);
   assert.ok(!result.evidence.reasonCodes.some(x=>/TIME_LIMIT|BUDGET/.test(x)));
  }
  const source=read(label+'-relaxed-solver'),created=read(label+'-created'),good=source.result.proposal;
  const gap=good.map((t:any,i:number)=>i?{...t,start:t.start+5,end:t.end+5}:t),wrong=good.map((t:any,i:number)=>i===1?{...t,requiredResourceIds:[`plan-resource:${created.substitute.id}`]}:t);
  assert.equal(validatePlan(source.problem.originalValidationProblem,good).hardValid,true);
  for(const tasks of [gap,wrong])assert.ok(validatePlan(source.problem.originalValidationProblem,tasks).reasonCodes.includes('TECHNICAL_CHAIN_VIOLATION'));
  const substituted=structuredClone(source.problem.problem);substituted.tasks=substituted.tasks.map((t:any)=>t.id===`task:${created.tasks[1].id}`?{...t,requiredResourceIds:[`plan-resource:${created.substitute.id}`]}:t);
  const candidates=generateTechnicalChainCandidates(substituted,substituted.tasks,[],substituted.budget.maxBranchExpansions);assert.deepEqual(candidates,read(label+'-substitution-candidates'));assert.equal(candidates.candidates.length,0);
 });
}
test('future chain reserves three real identities, prunes precisely the blocker and never enters the visible proposal',()=>{
 const captured=read('A-explicit-independent'),result=execute(captured.problem);assert.deepEqual(semantic(result),semantic(captured.result));assert.equal(result.proposal!.length,1);
 const probes=read('A-future-causal-probes');
 for(const [key,placement,allowance] of [['prune',probes.harmful,probes.future.budget.maxBranchExpansions],['kept',probes.safe,probes.future.budget.maxBranchExpansions],['abstain',probes.harmful,0]] as const){
  assert.deepEqual(probeTechnicalChainFutureReservations(probes.future,[placement],[placement],allowance),probes[key]);
 }
 assert.equal(probes.prune.domainComplete,true);assert.equal(probes.prune.certifiedCausingTaskId,probes.harmful.id);assert.equal(probes.abstain.status,'ABSTAIN');
 let remaining=captured.problem.problem.budget.maxBranchExpansions;
 const authority=new PreparedFutureTechnicalChainAuthority(captured.problem.problem,()=>remaining,n=>{if(n>remaining)return false;remaining-=n;return true;});
 const reservation=authority.nextExactReservation(authority.reservationStructureIds()[0]!,result.proposal!);
 assert.deepEqual(reservation,read('A-future-exact-reservation').reservation);assert.equal(reservation.reservation!.scheduledTasks.length,3);
 assert.ok(authority.reservationRemainsValid(reservation.reservation!,result.proposal!));
 const simulation=read('A-simulated-explicit-snapshot');assert.ok(simulation.simulationOnly);assert.equal(snapshotFingerprint(simulation.result.proposedDraftSnapshot),simulation.result.proposedDraftFingerprint);
 assert.equal(read('A-native-prefix-continuation').assisted_result_json.outcome,'NO_PROPOSAL');
});
