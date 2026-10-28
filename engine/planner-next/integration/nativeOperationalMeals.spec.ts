import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../../types';
import {withDailyOperationalMeals,applyDailyOperationalMeals} from '../../../server/operationalMealPolicy';
import {withDailyJointGroups} from '../../../server/jointGroupStructure';
import {withDailyTaskOperationScopes} from '../../../server/dailyTaskOperationScopes';
import {dailyOperationalMealsSchema} from '../../../shared/operationalMealPolicy';
import {dayConfigEditSchema} from '../../../shared/dayConfig';
import {adaptEngineInputToPlannerNextProblem as adapt} from './engineInputAdapter';
import {buildAssistedProblem,executeAssistedPlanning} from '../assistedPlanning';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {projectEffectiveAuthoritiesFromEngineInputV1} from '../../../server/effectivePlanConfigRevision';
import {validatePlan} from '../validate';
const receipts=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u00z/diagnostic/receipts.json.gz')).toString());
const source=(label='A'):EngineInput=>structuredClone(receipts[`${label}-input.json`]);
const authority=(label='A')=>({contractVersion:1 as const,policies:structuredClone(receipts[`${label}-declared.json`].operationalMealPolicies)});
function solve(input:EngineInput,ids=input.tasks.map(t=>t.id),fixed:any[]=[],meals:any[]=[]){
 const adapter=adapt(input);assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter));if(adapter.status!=='SUPPORTED')throw Error();
 const scope=resolveAssistedScope(input,adapter,{kind:'TASK_IDS',taskIds:ids});
 const problem=buildAssistedProblem(adapter.problem,scope.scope,fixed,analyticalFutureEligibleTaskIds(input,adapter.identityMap),meals);
 return {adapter,problem,result:executeAssistedPlanning(problem)};
}
function proofValid(r:ReturnType<typeof solve>){const proof=r.result.evidence.nominalPhysicalFutureWitness!;assert.ok(proof);assert.equal(proof.tasks.length,r.adapter.problem.tasks.length);assert.ok(validatePlan(r.adapter.problem,proof.tasks,[],[],[],[],[],[],proof.operationalMeals as any).hardValid);return proof as any;}
test('one common pause spans both subspaces; unrelated work overlaps and no fixed time is supplied',()=>{
 const i=source(),before=structuredClone(i),r=solve(withDailyOperationalMeals(i,authority()));assert.deepEqual(i,before);
 const proof=proofValid(r),m=proof.operationalMeals[0];assert.equal(proof.operationalMeals.length,1);assert.deepEqual(m.spaceIds,['space:1','space:2']);assert.ok(m.start>660);
 const unrelated=proof.tasks.find((t:any)=>t.spaceId==='space:4');assert.ok(unrelated.start<m.end&&unrelated.end>m.start);
 const forged=structuredClone(proof);forged.operationalMeals[0].start=660;forged.operationalMeals[0].end=685;assert.equal(validatePlan(r.adapter.problem,forged.tasks,[],[],[],[],[],[],forged.operationalMeals).hardValid,false);
});
test('independent mobile units eat independently; a recomposed unit uses both authorities without inventing a third',()=>{
 const i=source('B'),ordinary=solve(i),r=solve(withDailyOperationalMeals(i,authority('B'))),proof=proofValid(r);
 assert.equal(proof.operationalMeals.length,2);assert.ok(proof.operationalMeals[0].end<proof.operationalMeals[1].start);
 const recomposed=proof.tasks.find((t:any)=>t.id==='task:6');assert.deepEqual(recomposed.requiredResourceIds,['plan-resource:5','plan-resource:8']);assert.equal(recomposed.start,635);
 assert.equal(ordinary.result.proposal!.find(t=>t.id==='task:6')!.start,630);
});
test('partial scope retains one globally valid witness; protected tasks and materialized pause survive continuation',()=>{
 const input=withDailyOperationalMeals(source('B'),authority('B')),first=solve(input,[4,6]),proof=proofValid(first);
 assert.equal(first.result.proposal!.length,2);const fixed=first.result.proposal!,meal=[proof.operationalMeals.find((m:any)=>m.id==='break:mobile-amber')];
 const next=solve(input,[5,7],fixed,meal);const nextProof=proofValid(next);assert.ok(next.result.evidence.protectedPlacementsPreserved);
 for(const t of fixed)assert.deepEqual(nextProof.tasks.find((x:any)=>x.id===t.id),t);assert.deepEqual(nextProof.operationalMeals.find((m:any)=>m.id===meal[0].id),meal[0]);
});
test('explicit scope also supports a single space, a resource alone and names unrelated to any fixture',()=>{
 for(const mode of ['space','resource']){const i=source(),p=authority();if(mode==='space'){p.policies[0].spaceIds=[1];p.policies[0].planResourceItemIds=[];}else p.policies[0].spaceIds=[];
  const a=solve(withDailyOperationalMeals(i,p));proofValid(a);for(const t of i.tasks){t.templateName='Renamed activity';t.contestantName='Renamed person';}i.planSpaceSettings!.forEach(s=>s.name='Renamed location');i.planResourceItems.forEach(r=>r.name='Renamed physical member');
  assert.deepEqual(solve(withDailyOperationalMeals(i,p)).result.proposal,a.result.proposal);
 }
});
test('the real joint consumer composes the same explicit pause without losing siblings or shared occupancy',()=>{
 const y=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u00y/diagnostic/before.json.gz')).toString());
 const input=withDailyJointGroups(structuredClone(y['ordinary-input.json']),{contractVersion:1,groups:[{id:'paired',taskIds:[2,5]}]});
 const next=withDailyOperationalMeals(input,{contractVersion:1,policies:[{id:'common',window:{start:'09:20',end:'11:30'},durationMinutes:20,planResourceItemIds:[1],spaceIds:[2]}]});
 const r=solve(next,[2]);assert.deepEqual(r.result.proposal!.map(t=>t.id).sort(),['task:2','task:5']);const proof=proofValid(r);assert.equal(proof.tasks.length,7);assert.equal(proof.operationalMeals.length,1);
});
test('visual agenda and inheritance do not create physical occupation, while shared unit members retain their pauses',()=>{
 const i=source('B'),task=i.tasks[0];
 const scoped=withDailyTaskOperationScopes(i,{contractVersion:1,policies:[{taskId:task.id,agendaScope:'ITINERANT_UNIT',resourceInheritance:'OPERATION_ONLY',blocksSpace:false,itinerantUnitId:task.itinerantTeamId!,declaredResourceIds:task.declaredResourceIds??[]}]});
 const p=authority('B');p.policies.push({id:'location-only',window:{start:'10:00',end:'10:20'},durationMinutes:20,planResourceItemIds:[],spaceIds:[task.spaceId!]});
 const r=solve(withDailyOperationalMeals(scoped,p)),proof=proofValid(r);
 const placed=proof.tasks.find((t:any)=>t.id===`task:${task.id}`),meal=proof.operationalMeals.find((m:any)=>m.id==='break:location-only');
 assert.equal(placed.blocksSpace,false);assert.ok(placed.start<meal.end&&placed.end>meal.start);assert.deepEqual(placed.requiredResourceIds,['plan-resource:5','plan-resource:6']);
 assert.equal(proof.operationalMeals.length,3);assert.equal(proof.operationalMeals.find((m:any)=>m.id==='break:mobile-amber').start,615);
});
test('foreign IDs, empty scopes, duplicate members, impossible windows and stale replay reject before search',()=>{
 const invalid=[{planResourceItemIds:[2147483647]},{spaceIds:[2147483647]},{planResourceItemIds:[],spaceIds:[]},{durationMinutes:1000},{durationMinutes:7},{window:{start:'16:00',end:'17:00'}}];
 for(const delta of invalid){const p=authority();Object.assign(p.policies[0],delta);assert.throws(()=>withDailyOperationalMeals(source(),p));}
 const duplicate=authority();duplicate.policies.push({...duplicate.policies[0],id:'other'});assert.equal(dailyOperationalMealsSchema.safeParse(duplicate).success,false);
 assert.equal(dayConfigEditSchema.safeParse({operationalMealPolicies:authority(),expectedRevisionId:1}).success,true);assert.equal(dayConfigEditSchema.safeParse({operationalMealPolicies:authority()}).success,false);
 const i=source(),next=withDailyOperationalMeals(i,authority()),row={planner_next_profile:{configuration:{}},current_config_revision_id:2,daily_operational_meal_policies:{...authority(),by:'00000000-0000-0000-0000-000000000001',at:'2026-10-27T17:00:00Z'}};
 const replay={authorities:{plan_workday:projectEffectiveAuthoritiesFromEngineInputV1(next).plan_workday!.semanticValue}};assert.deepEqual(applyDailyOperationalMeals(i,row,replay),next);
 const forged=structuredClone(replay) as any;forged.authorities.plan_workday[0].plannerNextAuthorities.operationalMealPolicies=[];assert.throws(()=>applyDailyOperationalMeals(i,row,forged),/REVISION_NOT_MATERIALIZED/);assert.deepEqual(applyDailyOperationalMeals(i,{}),i);
});
