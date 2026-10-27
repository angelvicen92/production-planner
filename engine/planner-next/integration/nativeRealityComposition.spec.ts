import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {withDailyAnchoredAccompaniments} from '../../../server/anchoredAccompanimentStructure';
import {withDailyTaskOperationScopes,taskScopeDirectResources} from '../../../server/dailyTaskOperationScopes';
import {adaptEngineInputToPlannerNextProblem as adapt} from './engineInputAdapter';
import {buildAssistedProblem,executeAssistedPlanning} from '../assistedPlanning';
import {resolveAssistedScope,expandVisiblePrerequisites,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {validatePlan} from '../validate';
import type {EngineInput} from '../../types';
const receipts=JSON.parse(gunzipSync(readFileSync(new URL('../../../docs/evidence/p0-u00x/diagnostic/before.json.gz',import.meta.url))).toString());
const original:EngineInput=receipts['A-ordinary-input.json'],projected:EngineInput=receipts['control-combined.json'].input;
const anchored={contractVersion:2 as const,policies:projected.anchoredAccompaniments!.map(p=>({...p,eligibleItinerantUnitIds:projected.tasks.find(t=>t.id===p.anchorTaskId)!.allowedItinerantTeamIds!}))};
const scopes={contractVersion:1 as const,policies:projected.dailyTaskOperationScopes!};
const input=()=>withDailyTaskOperationScopes(withDailyAnchoredAccompaniments(structuredClone(original),anchored),scopes);
test('independent native authorities commute, retain physical declarations and do not mutate their source',()=>{
 const before=JSON.stringify(original),forward=input();
 const reverse=withDailyAnchoredAccompaniments(withDailyTaskOperationScopes(structuredClone(original),scopes),anchored);
 assert.deepEqual(forward,reverse);assert.equal(JSON.stringify(original),before);
 assert.deepEqual(forward.dailyTaskOperationScopes,scopes.policies);assert.equal(forward.anchoredAccompaniments!.length,3);
 const adapter=adapt(forward);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('unsupported');
 const reality=adapter.problem.tasks.find(t=>t.id==='task:17')!;
 assert.notEqual(reality.blocksSpace,false);assert.equal(forward.tasks.find(t=>t.id===17)!.agendaScope,'ITINERANT_UNIT');
 assert.ok(!reality.requiredResourceIds!.includes('plan-resource:1'));
 assert.ok(reality.requiredResourceIds!.includes('plan-resource:9'));
});
test('native coexistence reaches full and partial canonical search with a sound complete future witness',()=>{
 const i=input(),adapter=adapt(i);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('unsupported');
 for(const ids of [i.tasks.map(t=>t.id),[anchored.policies[0].anchorTaskId]]){
  const scope=expandVisiblePrerequisites(i,resolveAssistedScope(i,adapter,{kind:'TASK_IDS',taskIds:ids}),adapter);
  const result=executeAssistedPlanning(buildAssistedProblem(adapter.problem,scope.scope,[],analyticalFutureEligibleTaskIds(i,adapter.identityMap)));
  assert.ok(result.proposal);assert.equal(result.proposal!.length,ids.length===1?4:19);
  const proof=result.evidence.nominalPhysicalFutureWitness!;assert.equal(proof.tasks.length,19);assert.equal(validatePlan(adapter.problem,[...proof.tasks]).hardValid,true);
  for(const p of anchored.policies){const members=[...p.beforeTaskIds,p.anchorTaskId,...p.afterTaskIds].map(id=>proof.tasks.find(t=>t.id===`task:${id}`)!);assert.ok(members.every(t=>t.itinerantUnitId&&t.itinerantUnitId===members[0].itinerantUnitId));}
 }
});
test('neither daily authority can claim a task owned by the other',()=>{
 const i=input(),badScope={...scopes,policies:[{...scopes.policies[0],taskId:anchored.policies[0].beforeTaskIds[0]}]};
 assert.throws(()=>withDailyTaskOperationScopes(i,badScope),/TASK_SCOPE_ANCHORED_MEMBER/);
 const member=original.tasks.find(t=>t.id===anchored.policies[0].beforeTaskIds[0])!;
 const standalone=withDailyTaskOperationScopes(structuredClone(original),{...scopes,policies:[{...scopes.policies[0],taskId:member.id,itinerantUnitId:scopes.policies[0].itinerantUnitId,declaredResourceIds:taskScopeDirectResources(original,member)} ]});
 assert.throws(()=>withDailyAnchoredAccompaniments(standalone,anchored),/ANCHORED_TASK_SCOPE_MEMBER/);
});
test('a later shared coach release retains a complete anchored geometry without a human end-time hint',()=>{
 const evidence=JSON.parse(gunzipSync(readFileSync(new URL('../../../docs/evidence/p0-u00x/diagnostic/geometry-before-after.json.gz',import.meta.url))).toString());
 assert.equal(evidence.before.result.proposal,null);
 const i=evidence.input as EngineInput,adapter=adapt(i);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('unsupported');
 for(const ids of [i.tasks.map(t=>t.id),[i.anchoredAccompaniments![0].anchorTaskId]]){
  const scope=expandVisiblePrerequisites(i,resolveAssistedScope(i,adapter,{kind:'TASK_IDS',taskIds:ids}),adapter);
  const result=executeAssistedPlanning(buildAssistedProblem(adapter.problem,scope.scope,[],analyticalFutureEligibleTaskIds(i,adapter.identityMap)));
  assert.ok(result.proposal);assert.equal(result.proposal.length,ids.length===1?4:20);
  assert.equal(validatePlan(adapter.problem,[...result.evidence.nominalPhysicalFutureWitness!.tasks]).hardValid,true);
 }
});
