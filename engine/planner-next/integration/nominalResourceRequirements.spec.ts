import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import type {EngineInput} from '../../types';
import {adaptEngineInputToPlannerNextProblem} from './engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../assistedPlanning';
import {validatePlan} from '../validate';
import {fingerprint} from '../fingerprint';
import {executePlannerNext} from '../executePlannerNext';
import {materializeNominalResourceChoice} from '../nominalResourceChoice';

const captured=()=>JSON.parse(readFileSync('docs/evidence/p0-u00i/causal/A-input.json','utf8')) as EngineInput;
function adapted(input=captured()){
  const adapter=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter));
  if(adapter.status!=='SUPPORTED')throw Error('unsupported');return adapter.problem;
}
const run=(p:ReturnType<typeof adapted>,ids=p.tasks.map(task=>task.id),fixed:Parameters<typeof buildAssistedProblem>[2]=[])=>
  executeAssistedPlanning(buildAssistedProblem(p,createPlanningScope({kind:'TASK_IDS',value:'nominal'},{},ids),fixed,new Set(p.tasks.map(task=>task.id))));

test('captured API day chooses B alongside critical A, deterministically without input mutation',()=>{
  const input=captured(),before=structuredClone(input),p=adapted(input),first=run(p),second=run(p);
  assert.equal(first.evidence.completeForScope,true,JSON.stringify(first.evidence.reasonCodes));assert.ok(first.proposal);
  assert.equal(first.proposal.find(task=>task.id==='task:1')?.nominalResourceChoice?.selectedResourceId,'plan-resource:6');
  assert.equal(first.proposal.find(task=>task.id==='task:2')?.requiredResourceIds?.[0],'plan-resource:5');
  assert.deepEqual(first.proposal,second.proposal);assert.equal(first.evidence.fingerprint,second.evidence.fingerprint);
  assert.deepEqual(first.evidence.work,second.evidence.work);assert.deepEqual(input,before);
});
test('single search certifies cross-participant physical future without protecting its ephemeral choice',()=>{
  const p=adapted(),first=run(p,['task:1']);assert.ok(first.proposal);assert.equal(first.proposal.length,1);
  assert.equal(first.proposal[0].nominalResourceChoice?.selectedResourceId,'plan-resource:6');
  assert.equal(first.evidence.nominalPhysicalFutureWitness?.tasks.length,2);
  const next=run(p,['task:2'],first.proposal);assert.equal(next.evidence.completeForScope,true);
  assert.equal(next.proposal?.length,1);assert.equal(next.proposal?.[0].requiredResourceIds?.[0],'plan-resource:5');
});
test('ordinary validator rejects omitted, invented, duplicate-choice and altered fixed consumption',()=>{
  const p=adapted(),result=run(p),tasks=result.proposal!;
  for(const edit of [
    (t:any)=>({...t,requiredResourceIds:[]}),
    (t:any)=>({...t,nominalResourceChoice:{...t.nominalResourceChoice,selectedResourceId:'plan-resource:999'}}),
    (t:any)=>({...t,requiredResourceIds:['plan-resource:5','plan-resource:6']}),
    (t:any)=>({...t,nominalResourceChoice:undefined}),
  ])assert.equal(validatePlan(p,tasks.map(task=>task.id==='task:1'?edit(task):task)).hardValid,false);
  const altered=tasks.map(task=>task.id==='task:1'?{...task,requiredResourceIds:[]}:task);
  assert.notEqual(fingerprint([...tasks]),fingerprint(altered));
});
test('resource choice is a backtracking decision; unavailable alternative does not become a fixed obligation',()=>{
  const input=captured();input.tasks=input.tasks.filter(task=>task.id===1);
  input.planResourceItems.find(resource=>resource.id===5)!.isAvailable=false;
  const p=adapted(input);assert.equal(run(p).proposal?.[0].nominalResourceChoice?.selectedResourceId,'plan-resource:6');
});
test('ordinary backtracking replaces a previously materialized A by B after a collective dead end',()=>{
  const p=structuredClone(adapted()),flex=p.tasks[0];
  if(flex.kind!=='auxiliary')throw Error('expected ordinary auxiliary fixture');
  p.resources=p.resources.map(resource=>({...resource,availability:[{start:540,end:580}],transitionMinutes:0}));
  p.resourceTransitionMinutes=0;
  p.participants=p.participants.map(person=>({...person,availability:[p.day]}));
  p.participants.push({id:'participant:3',availability:[p.day]});p.spaces.push({id:'space:3',availability:[p.day]});
  p.tasks=[{...flex,availability:[{start:560,end:580}]},...[2,3].map(id=>({...flex,id:`task:${id}`,participantId:`participant:${id}`,spaceId:`space:${id}`,
    availability:[{start:540,end:580}],requiredResourceIds:['plan-resource:5'],
    nominalResourceChoice:{resourceIds:['plan-resource:5','plan-resource:6'],fixedResourceIds:['plan-resource:5']}}))];
  const result=run(p);assert.equal(result.evidence.completeForScope,true);
  assert.equal(result.proposal?.find(task=>task.id==='task:1')?.nominalResourceChoice?.selectedResourceId,'plan-resource:6');
  const execution=executePlannerNext(p,{causalDiagnostic:true});
  assert.ok(execution.kind==='EXACT_CONSTRUCTIVE'&&execution.result.evidence.standaloneBacktracks>0);
});
test('independent byItem survives selection and cannot be omitted or substituted',()=>{
  const input=captured();input.tasks[0].resourceRequirements!.byItem={1:1};const p=adapted(input),result=run(p);
  assert.ok(result.proposal);const flex=result.proposal.find(task=>task.id==='task:1')!;
  assert.deepEqual(flex.requiredResourceIds,['plan-resource:4','plan-resource:6']);
  assert.equal(validatePlan(p,result.proposal.map(task=>task===flex?{...task,requiredResourceIds:['plan-resource:6']}:task)).hardValid,false);
});
test('a lock on A cannot silently select B to manufacture a completion',()=>{
  const input=captured();input.locks=[{id:99,planId:input.planId,taskId:1,lockType:'resource',lockedResourceId:5}];
  assert.equal(run(adapted(input)).evidence.completeForScope,false);
});
test('different valid nominal choices have different fingerprints, while domain order is immaterial',()=>{
  const p=adapted(),source=p.tasks[0],a=materializeNominalResourceChoice(source,'plan-resource:5')!,b=materializeNominalResourceChoice(source,'plan-resource:6')!;
  const timed=(task:typeof a)=>({...task,start:540,end:560});
  assert.notEqual(fingerprint([timed(a)]),fingerprint([timed(b)]));
  assert.equal(fingerprint([timed(b)]),fingerprint([timed({...b,nominalResourceChoice:{...b.nominalResourceChoice!,resourceIds:[...b.nominalResourceChoice!.resourceIds].reverse()}})]));
});
for(const [name,edit] of [
  ['empty domain',(s:EngineInput)=>s.tasks[0].resourceRequirements!.anyOf![0].resourceItemIds=[]],
  ['missing identity',(s:EngineInput)=>s.tasks[0].resourceRequirements!.anyOf![0].resourceItemIds=[999]],
  ['ambiguous daily identity',(s:EngineInput)=>s.planResourceItems.push({...s.planResourceItems.find(r=>r.id===5)!,id:999})],
  ['quantity two',(s:EngineInput)=>s.tasks[0].resourceRequirements!.anyOf![0].quantity=2],
  ['multiple groups',(s:EngineInput)=>s.tasks[0].resourceRequirements!.anyOf!.push({quantity:1,resourceItemIds:[2,3]})],
  ['all unavailable',(s:EngineInput)=>s.planResourceItems.forEach(r=>r.isAvailable=false)],
  ['composite resource',(s:EngineInput)=>s.resourceItemComponents={2:[{componentResourceItemId:3,quantity:1}]}],
  ['shared auxiliary',(s:EngineInput)=>s.planResourceItems.find(r=>r.id===5)!.typeCode='auxiliar'],
  ['grouped task',(s:EngineInput)=>s.tasks[0].jointGroupId='joint'],
  ['Vocal',(s:EngineInput)=>s.tasks[0].plannerNextKind='vocal'],
  ['incompatible lock',(s:EngineInput)=>s.locks=[{id:99,planId:s.planId,taskId:1,lockType:'resource',lockedResourceId:4}]],
  ['explicit double assignment',(s:EngineInput)=>s.tasks[0].assignedResourceIds=[5,6]],
  ['byType',(s:EngineInput)=>s.tasks[0].resourceRequirements!.byType={1:1}],
  ['Main',(s:EngineInput)=>s.tasks[0].plannerNextKind='main'],
] as const)test(`${name} remains fail-closed`,()=>{const input=captured();edit(input);const a=adaptEngineInputToPlannerNextProblem(input);assert.equal(a.status,'UNSUPPORTED');});
