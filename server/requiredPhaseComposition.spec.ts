import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../engine/types';
import {technicalChainStructureSchema} from '../shared/technicalChainStructure';
import {preflightEngineInputForPlannerNext} from '../engine/planner-next/integration/engineInputPreflight';
import {preflight} from '../engine/planner-next/validate';
import {validateDailyTechnicalChains} from './technicalChainStructure';
import {withDailyJointGroups} from './jointGroupStructure';
import {dailyOperationalMealsSchema} from '../shared/operationalMealPolicy';
import {withDailyOperationalMeals} from './operationalMealPolicy';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../engine/planner-next/integration/engineInputAdapter';
import {resolveAssistedScope} from './assistedScopeResolver';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../engine/planner-next/assistedPlanning';
import {certifyDailyTechnicalChain} from './technicalChainCertificate';
const receipts=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u01a/native/receipts.json.gz')).toString());
const fixture=()=>{
 const base:EngineInput=structuredClone(receipts['integrated-input.json']);
 const policy=structuredClone(receipts['integrated-requested-policy.json']);
 const input=validateDailyTechnicalChains(base,{contractVersion:1,policies:[policy]});
 const adapter=adapt(input);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('adapter');
 return {base,policy,input,adapter};
};
test('representative, non-representative peer and space close the visible REQUIRED unit without prerequisites',()=>{
 const {input,policy,adapter}=fixture();
 const joint=input.dailyJointGroups![0],all=[...new Set([...policy.orderedTaskIds,...joint.taskIds])].sort((a,b)=>a-b);
 for(const selector of [{kind:'TASK_IDS' as const,taskIds:[joint.taskIds[0]]},{kind:'TASK_IDS' as const,taskIds:[joint.taskIds[1]]},{kind:'SPACE' as const,spaceId:input.tasks.find(t=>t.id===joint.taskIds[1])!.spaceId!}]){
  const scope=resolveAssistedScope(input,adapter,selector);assert.deepEqual(scope.productTaskIds,all);
  const problem=buildAssistedProblem(adapter.problem,scope.scope,[],new Set(adapter.problem.tasks.map(t=>t.id)));
  assert.ok(problem.supportingTaskIds.length);assert.equal(scope.scope.resolvedTaskIds.length,8);
 }
});
test('authority accepts all authoring orders but rejects physical duplication, bad phases and backwards dependencies',()=>{
 const {base,policy}=fixture(),structure={contractVersion:1 as const,policies:[policy]};
 const plain={...base,dailyJointGroups:undefined,dailyJointGroupsVersion:undefined,operationalMealPolicies:undefined,dailyOperationalMealsVersion:undefined,tasks:base.tasks.map(t=>({...t,jointGroupId:undefined}))};
 const joints={contractVersion:1 as const,groups:base.dailyJointGroups!},meals=dailyOperationalMealsSchema.parse({contractVersion:1,policies:base.operationalMealPolicies!});
 for(const order of ['cjm','cmj','jcm','jmc','mcj','mjc']){
  let input:EngineInput=structuredClone(plain);
  for(const step of order)input=step==='c'?validateDailyTechnicalChains(input,structure):step==='j'?withDailyJointGroups(input,joints):withDailyOperationalMeals(input,meals);
  assert.deepEqual(validateDailyTechnicalChains(input,structure).technicalChains,[policy]);
 }
 for(const mutate of [(p:any)=>p.phases[0].pop(),(p:any)=>{p.phases[2].push(base.dailyJointGroups![0].taskIds[1]);p.orderedTaskIds=p.phases.flat();}]){
  const p=structuredClone(policy);mutate(p);assert.throws(()=>validateDailyTechnicalChains(base,{contractVersion:1,policies:[p]}));
 }
 const bad=structuredClone(base);bad.tasks.find(t=>t.id===policy.phases[0][0])!.dependsOnTaskIds=[policy.phases[2][0]];
 assert.throws(()=>validateDailyTechnicalChains(bad,structure),/INCOMPATIBLE_DEPENDENCIES/);
 for(const field of ['setupPolicies','roundSynchronizations','anchoredAccompaniments','dailyTaskOperationScopes','transportSettings']){
  const bad:any=structuredClone(base);bad[field]=field==='transportSettings'?{}:[{}];
  assert.throws(()=>validateDailyTechnicalChains(bad,structure),/UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION/);
 }
});
test('partial scope certifies the authentic global future with its physical pause, zero extra search, then preserves S1',()=>{
 const {input,adapter}=fixture(),rival=input.tasks.at(-1)!;
 const scope=resolveAssistedScope(input,adapter,{kind:'TASK_IDS',taskIds:[rival.id]});
 const first=executeAssistedPlanning(buildAssistedProblem(adapter.problem,scope.scope,[],new Set(adapter.problem.tasks.map(t=>t.id))));
 assert.equal(first.proposal?.length,1);const proof=first.evidence.nominalPhysicalFutureWitness!;
 assert.equal(proof.tasks.length,15);assert.equal((proof.operationalMeals as any[]).length,1);
 assert.equal(certifyDailyTechnicalChain(adapter.problem,[...first.proposal!],0,proof)?.status,'WITNESS');
 assert.equal(certifyDailyTechnicalChain(adapter.problem,[...first.proposal!],0,proof)?.consumed,0);
 assert.equal(certifyDailyTechnicalChain(adapter.problem,[...first.proposal!],10000,{...proof,operationalMeals:[]})?.status,'INVALID');
 assert.equal(certifyDailyTechnicalChain(adapter.problem,[...first.proposal!],10000,{...proof,tasks:proof.tasks.slice(1)})?.status,'INVALID');
 const rest=createPlanningScope({kind:'TASK_IDS',value:'pending'},{},adapter.problem.tasks.filter(t=>t.id!==first.proposal![0].id).map(t=>t.id));
 const second=executeAssistedPlanning(buildAssistedProblem(adapter.problem,rest,first.proposal!,new Set(adapter.problem.tasks.map(t=>t.id))));
 assert.equal(second.proposal?.length,14);assert.deepEqual(second.evidence.nominalPhysicalFutureWitness!.tasks.find(t=>t.id===first.proposal![0].id),proof.tasks.find(t=>t.id===first.proposal![0].id));
});
test('each phase exposes multiple realized permutations, and HARD dependencies can require a non-nominal one',()=>{
 const {adapter}=fixture(),p=adapter.problem,policy=p.technicalChains![0];
 const run=(problem:typeof p)=>executeAssistedPlanning(buildAssistedProblem(problem,createPlanningScope({kind:'TASK_IDS',value:'all'},{},problem.tasks.map(t=>t.id)),[]));
 const baseline=run(p);assert.ok(baseline.proposal);
 for(let phase=0;phase<policy.phases!.length;phase++){
  const changed=structuredClone(p),ids=changed.technicalChains![0].phases![phase];
  const originalOrder=baseline.evidence.nominalPhysicalFutureWitness!.tasks.filter(t=>ids.includes(t.id)).sort((a,b)=>a.start-b.start).map(t=>t.id);
  ids.reverse();changed.technicalChains![0].orderedTaskIds=changed.technicalChains![0].phases!.flat();
  // A same-phase dependency makes the original first operation wait for last.
  const last=originalOrder.at(-1)!,first=originalOrder[0];
  changed.tasks.find(t=>t.id===first)!.dependencies.push(last);
  const alternative=run(changed);assert.ok(alternative.proposal,`phase ${phase}`);
  const proof=alternative.evidence.nominalPhysicalFutureWitness!.tasks;
  assert.ok(proof.find(t=>t.id===last)!.end<=proof.find(t=>t.id===first)!.start);
  assert.notDeepEqual(proof.filter(t=>ids.includes(t.id)).sort((a,b)=>a.start-b.start).map(t=>t.id),originalOrder);
 }
});

test('phased technical operations retain their kind and accept flexible internal dependencies',()=>{
 const old=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u00q/native/receipts.json.gz')).toString());
 const input:EngineInput=structuredClone(old['A-explicit-input.json']),policy=input.technicalChains![0];
 policy.phases=[policy.orderedTaskIds.slice(0,2),policy.orderedTaskIds.slice(2)];
 for(const space of input.planSpaceSettings??[]){space.availabilityStart='09:00';space.availabilityEnd='11:00';}
 for(const task of input.tasks.filter(t=>policy.orderedTaskIds.includes(t.id))){task.dependsOnTaskIds=[];task.dependsOnTaskId=null;}
 // The opposite of the nominal first two IDs must now be realized.
 input.tasks.find(t=>t.id===policy.orderedTaskIds[0])!.dependsOnTaskIds=[policy.orderedTaskIds[1]];
 const native=validateDailyTechnicalChains(input,{contractVersion:1,policies:[policy]}),adapter=adapt(native);
 assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('adapter');
 const all=createPlanningScope({kind:'TASK_IDS',value:'all'},{},adapter.problem.tasks.map(t=>t.id));
 const result=executeAssistedPlanning(buildAssistedProblem(adapter.problem,all,[]));assert.ok(result.proposal,JSON.stringify(result.evidence.reasonCodes));
 const proof=result.evidence.nominalPhysicalFutureWitness!;assert.ok(proof);
 assert.ok(proof.tasks.filter(t=>policy.orderedTaskIds.includes(Number(t.id.slice(5)))).every(t=>t.kind==='technical'));
 assert.equal(certifyDailyTechnicalChain(adapter.problem,[...result.proposal!],0,proof)?.status,'WITNESS');
});

test('a locally valid competitor prefix cannot consume the last contiguous future realization',()=>{
 const {input,policy}=fixture(),kit=policy.requiredResourceIds[0];
 input.planResourceItems.find(r=>r.id===kit)!.availabilityEnd='09:10';
 input.operationalMealPolicies![0].window={start:'08:55',end:'09:10'};
 const a=adapt(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
 const rival=a.problem.tasks.find(t=>t.id==='task:'+input.tasks.at(-1)!.id)!;
 const requested=createPlanningScope({kind:'TASK_IDS',value:'competitor'},{},[rival.id]);
 const eligible=new Set(a.problem.tasks.map(t=>t.id));
 const valid=executeAssistedPlanning(buildAssistedProblem(a.problem,requested,[],eligible));assert.ok(valid.proposal);
 // The remaining resource windows on either side are both < the 40 minute
 // REQUIRED unit, although the prefix itself is individually hard-valid.
 const fixed={...rival,start:500,end:515};
 const pending=createPlanningScope({kind:'TASK_IDS',value:'remaining'},{},a.problem.tasks.filter(t=>t.id!==rival.id).map(t=>t.id));
 const rejected=executeAssistedPlanning(buildAssistedProblem(a.problem,pending,[fixed],eligible));
 assert.equal(rejected.proposal,null);assert.ok(!rejected.evidence.reasonCodes.some(c=>c.includes('BUDGET_EXHAUSTED')));
});

const mixedFixture=()=>{
 const r=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u01c/native/receipts.json.gz')).toString());
 const base:EngineInput=structuredClone(r['mixed-input.json']);
 const policy={...r['mixed-requested-policy.json'],requiredResourceIds:[]};
 return {base,policy,structure:{contractVersion:1 as const,policies:[policy]}};
};
test('explicit empty common identities survive daily authority and adapter; missing and null fail closed',()=>{
 const {base,policy,structure}=mixedFixture();
 assert.ok(technicalChainStructureSchema.safeParse(structure).success);
 assert.equal(technicalChainStructureSchema.safeParse({...structure,policies:[{...policy,phases:undefined}]}).success,false);
 const native=validateDailyTechnicalChains(base,structure),adapter=adapt(native);
 assert.deepEqual(native.technicalChains![0].requiredResourceIds,[]);
 assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('adapter');
 assert.deepEqual(adapter.problem.technicalChains![0].requiredResourceIds,[]);
 assert.deepEqual(native.tasks,base.tasks);
 for(const value of [undefined,null]){
  const invalid:any={...policy,requiredResourceIds:value};
  assert.equal(technicalChainStructureSchema.safeParse({...structure,policies:[invalid]}).success,false);
  assert.throws(()=>validateDailyTechnicalChains(base,{...structure,policies:[invalid]}));
  const bad:any={...native,technicalChains:[invalid]};
  assert.equal(preflightEngineInputForPlannerNext(bad).status,'UNSUPPORTED');
  const problem=structuredClone(adapter.problem);problem.technicalChains![0].requiredResourceIds=value as any;
  assert.ok(preflight(problem).includes('INVALID_TECHNICAL_CHAIN_POLICY'));
 }
 for(const ids of [[base.planResourceItems[0].id],[2147483647]])
  assert.throws(()=>validateDailyTechnicalChains(base,{...structure,policies:[{...policy,requiredResourceIds:ids}]}),/RESOURCE_NOT_REQUIRED/);
});
test('mixed 17 obligation REQUIRED future is physical, certificate searches zero branches and continuation preserves S1',()=>{
 const {base,structure}=mixedFixture(),input=validateDailyTechnicalChains(base,structure),a=adapt(input);
 assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
 const rival=base.tasks.at(-3)!;
 const scope=resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:[rival.id]}),eligible=new Set(a.problem.tasks.map(t=>t.id));
 const first=executeAssistedPlanning(buildAssistedProblem(a.problem,scope.scope,[],eligible));
 assert.equal(first.proposal?.length,1);const proof=first.evidence.nominalPhysicalFutureWitness!;
 assert.equal(proof.tasks.length,17);assert.equal((proof.operationalMeals as any[]).length,1);
 const certificate=certifyDailyTechnicalChain(a.problem,[...first.proposal!],0,proof);
 assert.equal(certificate?.status,'WITNESS');assert.equal(certificate?.consumed,0);
 const rest=createPlanningScope({kind:'TASK_IDS',value:'pending'},{},a.problem.tasks.filter(t=>t.id!==first.proposal![0].id).map(t=>t.id));
 const second=executeAssistedPlanning(buildAssistedProblem(a.problem,rest,first.proposal!,eligible));
 assert.equal(second.proposal?.length,16);assert.equal(second.evidence.protectedPlacementsPreserved,true);
});
