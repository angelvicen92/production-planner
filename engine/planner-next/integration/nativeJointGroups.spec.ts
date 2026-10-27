import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../../types';
import {withDailyJointGroups,applyDailyJointGroups} from '../../../server/jointGroupStructure';
import {jointGroupStructureSchema} from '../../../shared/jointGroupStructure';
import {dayConfigEditSchema} from '../../../shared/dayConfig';
import {adaptEngineInputToPlannerNextProblem as adapt} from './engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../assistedPlanning';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {projectEffectiveAuthoritiesFromEngineInputV1} from '../../../server/effectivePlanConfigRevision';
import {validatePlan} from '../validate';
import {canPlaceTask} from '../placement';
const receipts=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u00y/diagnostic/before.json.gz')).toString());
const source=():EngineInput=>structuredClone(receipts['ordinary-input.json']);
const structure={contractVersion:1 as const,groups:[{id:'operation',taskIds:[2,5]}]};
function solve(input:EngineInput,ids=input.tasks.map(t=>t.id),fixed:any[]=[]){
 const adapter=adapt(input);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error();
 const scope=resolveAssistedScope(input,adapter,{kind:'TASK_IDS',taskIds:ids});
 const problem=buildAssistedProblem(adapter.problem,scope.scope,fixed,analyticalFutureEligibleTaskIds(input,adapter.identityMap));
 return {adapter,scope,problem,result:executeAssistedPlanning(problem)};
}
test('native group preserves both identities, dependencies and one shared physical occupation',()=>{
 const input=source(),before=structuredClone(input),next=withDailyJointGroups(input,structure),r=solve(next);
 assert.deepEqual(input,before);assert.equal(r.result.proposal?.length,7);assert.equal(r.result.evidence.hardValid,true);
 const tasks=r.result.proposal!,a=tasks.find(t=>t.id==='task:2')!,b=tasks.find(t=>t.id==='task:5')!;
 assert.equal(a.start,b.start);assert.equal(a.end,b.end);assert.equal(a.spaceId,b.spaceId);assert.notEqual(a.participantId,b.participantId);assert.deepEqual(a.requiredResourceIds,['plan-resource:1']);assert.deepEqual(b.requiredResourceIds,a.requiredResourceIds);
 assert.equal(validatePlan(r.adapter.problem,tasks).hardValid,true);
 assert.ok(tasks.find(t=>t.id==='task:1')!.end<=a.start);assert.ok(tasks.find(t=>t.id==='task:4')!.end<=b.start);
 for(const person of [a.participantId,b.participantId])assert.equal(canPlaceTask(r.adapter.problem,{...a,id:'external',jointGroupId:undefined,participantId:person,dependencies:[],requiredResourceIds:[],spaceId:'space:3'},a.start,tasks),false);
 const fake=structuredClone(tasks);fake.find(t=>t.id==='task:7')!.start=a.start;fake.find(t=>t.id==='task:7')!.end=a.start+15;assert.equal(validatePlan(r.adapter.problem,fake).hardValid,false);
 assert.deepEqual(r.result.proposal,solve(next).result.proposal);
});
test('single-member scopes close visibly even without visible prerequisites; future groups stay complete and unaccepted',()=>{
 const i=withDailyJointGroups(source(),structure),r=solve(i,[2]);assert.deepEqual(r.scope.productTaskIds,[2,5]);assert.deepEqual(r.result.proposal!.map(t=>t.id).sort(),['task:2','task:5']);
 const direct=buildAssistedProblem(r.adapter.problem,createPlanningScope({kind:'TASK_IDS',value:'one'},{},['task:2']),[],new Set(r.adapter.problem.tasks.map(t=>t.id)));assert.deepEqual(direct.scope.resolvedTaskIds,['task:2','task:5']);
 const future=solve(i,[7]);assert.deepEqual(future.result.proposal!.map(t=>t.id),['task:7']);
 const proof=future.result.evidence.nominalPhysicalFutureWitness!;assert.equal(proof.tasks.length,7);assert.equal(validatePlan(future.adapter.problem,proof.tasks).hardValid,true);
 assert.equal(proof.tasks.filter(t=>t.jointGroupId).length,2);
});
test('partial protection rejects explicitly; complete protection is preserved literally during continuation',()=>{
 const i=withDailyJointGroups(source(),structure),full=solve(i),fixed=full.result.proposal!.filter(t=>['task:1','task:4','task:2','task:5'].includes(t.id));
 assert.throws(()=>solve(i,[7],[fixed.find(t=>t.id==='task:2')]),/JOINT_GROUP_PARTIALLY_PROTECTED/);
 const pending=i.tasks.filter(t=>!fixed.some(f=>f.id===`task:${t.id}`)).map(t=>t.id),r=solve(i,pending,fixed);
 assert.ok(r.result.proposal);assert.equal(r.result.evidence.protectedPlacementsPreserved,true);
 for(const f of fixed)assert.deepEqual(r.result.evidence.nominalPhysicalFutureWitness!.tasks.find(t=>t.id===f.id),f);
});
test('both participants govern feeding feasibility; incompatible feeding is physical, never exhausted search',()=>{
 const i=source();i.tasks.find(t=>t.id===4)!.durationOverrideMin=145;
 const r=solve(withDailyJointGroups(i,structure));assert.equal(r.result.proposal,null);assert.ok(!r.result.evidence.reasonCodes.some(c=>/BUDGET|EXHAUST/.test(c)));
 const i2=source();i2.contestantAvailabilityById![2]={start:'11:30',end:'11:45'};assert.throws(()=>withDailyJointGroups(i2,structure),/NO_COMMON_AVAILABILITY/);
});
test('declarations reject unequal duration, space, resources, duplicate people, foreign/missing and internal dependencies',()=>{
 const cases:[string,(i:EngineInput)=>void][]=[['DURATION',i=>i.tasks[4].durationOverrideMin=5],['SPACE',i=>i.tasks[4].spaceId=3],['RESOURCE',i=>i.tasks[4].resourceRequirements={}],['DUPLICATE_PARTICIPANT',i=>i.tasks[4].contestantId=1],['INVALID_MEMBER',i=>i.tasks[4].planId=999],['INTERNAL_DEPENDENCY',i=>i.tasks[4].dependsOnTaskIds=[2]],['INVALID_MEMBER',i=>i.tasks[4].status='cancelled']];
 for(const [reason,change] of cases){const i=source();change(i);assert.throws(()=>withDailyJointGroups(i,structure),new RegExp(reason));}
 for(const groups of [[{id:'a',taskIds:[2]}],[{id:'a',taskIds:[2,2]}],[{id:'a',taskIds:[2,5]},{id:'b',taskIds:[2,6]}]])assert.equal(jointGroupStructureSchema.safeParse({contractVersion:1,groups}).success,false);
 assert.throws(()=>withDailyJointGroups(source(),{contractVersion:1,groups:[{id:'a',taskIds:[2,999]}]}),/INVALID_MEMBER/);
 assert.equal(dayConfigEditSchema.safeParse({jointGroups:structure,expectedRevisionId:1}).success,true);assert.equal(dayConfigEditSchema.safeParse({jointGroups:structure}).success,false);
});
test('native authority is opt-in, cold revision replay verifies every member and absence stays historical',()=>{
 const i=source(),next=withDailyJointGroups(i,structure),row={planner_next_profile:{},current_config_revision_id:2,daily_joint_groups:{...structure,by:'00000000-0000-0000-0000-000000000001',at:'2026-10-27T10:00:00Z'}};
 const replay={authorities:{plan_workday:projectEffectiveAuthoritiesFromEngineInputV1(next).plan_workday!.semanticValue}};
 assert.deepEqual(applyDailyJointGroups(i,row,replay),next);
 const forged=structuredClone(replay) as any;delete forged.authorities.plan_workday[0].plannerNextAuthorities.taskOperations[4].jointGroupId;assert.throws(()=>applyDailyJointGroups(i,row,forged),/REVISION_NOT_MATERIALIZED/);
 assert.deepEqual(applyDailyJointGroups(i,{}),i);assert.equal(adapt(i).status,'SUPPORTED');
});
test('the existing consumer supports three different participants without a pair-only authoring restriction',()=>{
 const i=source();i.contestantAvailabilityById![3]={start:'09:20',end:'11:30'};i.tasks.push({...structuredClone(i.tasks[4]),id:8,contestantId:3});
 const r=solve(withDailyJointGroups(i,{contractVersion:1,groups:[{id:'trio',taskIds:[2,5,8]}]}));assert.equal(r.result.proposal!.length,8);assert.equal(r.result.evidence.hardValid,true);assert.equal(new Set(r.result.proposal!.filter(t=>t.jointGroupId).map(t=>t.start)).size,1);
});


test('reversing member and input set order preserves the authored authority and deterministic proposal',()=>{
 const i=source(),a=withDailyJointGroups(i,structure),other=source();other.tasks.reverse();other.planSpaceSettings!.reverse();other.planResourceItems.reverse();
 const b=withDailyJointGroups(other,{contractVersion:1,groups:[{id:'operation',taskIds:[5,2]}]});
 assert.deepEqual(a.dailyJointGroups,b.dailyJointGroups);assert.deepEqual(solve(a).result.proposal,solve(b).result.proposal);assert.equal(solve(a).result.evidence.fingerprint,solve(b).result.evidence.fingerprint);
});
