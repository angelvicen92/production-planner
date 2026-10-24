import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import type {EngineInput} from '../../types';
import {adaptEngineInputToPlannerNextProblem} from './engineInputAdapter';
import {resolveNominalResourceRequirements} from './nominalResourceRequirements';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../assistedPlanning';
import {validatePlan} from '../validate';
import {fingerprint} from '../fingerprint';
const captured=()=>JSON.parse(readFileSync('docs/evidence/p0-u00j/gate1/A-input.json','utf8')) as EngineInput;
function problem(input=captured()){
 const a=adaptEngineInputToPlannerNextProblem(input);assert.equal(a.status,'SUPPORTED',JSON.stringify(a));if(a.status!=='SUPPORTED')throw Error('unsupported');return a.problem;
}
const run=(p:ReturnType<typeof problem>,ids=p.tasks.map(t=>t.id),fixed:Parameters<typeof buildAssistedProblem>[2]=[])=>executeAssistedPlanning(buildAssistedProblem(p,createPlanningScope({kind:'TASK_IDS',value:'typed'},{},ids),fixed,new Set(p.tasks.map(t=>t.id))));
test('native type request preserves scarce A and uses B, without mutating input',()=>{
 const input=captured(),before=structuredClone(input),p=problem(input),a=run(p),b=run(p);
 assert.ok(a.proposal&&a.evidence.completeForScope&&a.evidence.hardValid&&a.evidence.requiredValid);
 assert.equal(a.proposal[0].nominalResourceChoice?.selectedResourceId,'plan-resource:5');
 assert.equal(a.proposal[0].nominalResourceChoice?.requestedResourceTypeId,'resource-type:1');
 assert.deepEqual(a.proposal[1].requiredResourceIds,['plan-resource:4']);assert.deepEqual(a.proposal,b.proposal);
 assert.deepEqual(a.evidence.work,b.evidence.work);assert.deepEqual(input,before);
 const first=run(p,['task:1']);assert.equal(first.proposal?.length,1);assert.equal(first.evidence.nominalPhysicalFutureWitness?.tasks.length,2);
 assert.equal(run(p,['task:2'],first.proposal).evidence.completeForScope,true);
});
test('type resolution separates inventory, available alternatives and selected identity; ad hoc has no global dependency',()=>{
 const input=captured();Object.assign(input.planResourceItems[1],{resourceItemId:null});
 input.planResourceItems[0].isAvailable=false;input.tasks=input.tasks.slice(0,1);
 const domain=resolveNominalResourceRequirements(input,input.tasks[0]);
 assert.deepEqual(domain.compatibleResourceIds,[4,5]);assert.deepEqual(domain.resourceIds,[4,5]);assert.deepEqual(domain.availableResourceIds,[5]);assert.equal(domain.selectedResourceId,undefined);
 const a=run(problem(input));assert.equal(a.proposal?.[0].nominalResourceChoice?.selectedResourceId,'plan-resource:5');
});
test('ineligible physical capacities are excluded without requiring every item of a type',()=>{
 const input=captured();input.resourceItemComponents={1:[{componentResourceItemId:3,quantity:1}]};input.tasks=input.tasks.slice(0,1);
 const domain=resolveNominalResourceRequirements(input,input.tasks[0]);assert.deepEqual(domain.resourceIds,[5]);assert.equal(domain.excludedResources?.[0].reason,'NOMINAL_COMPOSITE_RESOURCE_UNSUPPORTED');
 assert.deepEqual(run(problem(input)).proposal?.[0].requiredResourceIds,['plan-resource:5']);
});
test('independent byItem is preserved alongside the selected individual',()=>{
 const input=captured();input.tasks[0].resourceRequirements!.byItem={3:1};
 const p=problem(input),a=run(p);assert.deepEqual(a.proposal?.[0].requiredResourceIds,['plan-resource:5','plan-resource:6']);
 const falseTasks=a.proposal!.map(t=>t.id==='task:1'?{...t,requiredResourceIds:['plan-resource:5']}:t);
 assert.equal(validatePlan(p,falseTasks).hardValid,false);
});
test('type identity, selection and physical use are authenticated by validation and fingerprint',()=>{
 const p=problem(),tasks=run(p).proposal!;
 for(const edit of [
  (t:any)=>({...t,requiredResourceIds:[]}),
  (t:any)=>({...t,requiredResourceIds:['plan-resource:4','plan-resource:5']}),
  (t:any)=>({...t,requiredResourceIds:['plan-resource:6'],nominalResourceChoice:{...t.nominalResourceChoice,selectedResourceId:'plan-resource:6'}}),
  (t:any)=>({...t,nominalResourceChoice:{...t.nominalResourceChoice,requestedResourceTypeId:'resource-type:2'}}),
  (t:any)=>({...t,nominalResourceChoice:{...t.nominalResourceChoice,selectedResourceId:undefined}}),
  (t:any)=>({...t,requiredResourceIds:['plan-resource:4'],nominalResourceChoice:{...t.nominalResourceChoice,selectedResourceId:'plan-resource:4'}}),
 ]){const forged=tasks.map(t=>t.id==='task:1'?edit(t):t);assert.equal(validatePlan(p,forged).hardValid,false);assert.notEqual(fingerprint(forged),fingerprint([...tasks]));}
});
for(const [label,edit,reason] of [
 ['unknown type',(s:EngineInput)=>s.tasks[0].resourceRequirements={byType:{999:1}},'NO_COMPATIBLE_DAILY_RESOURCE'],
 ['type without daily inventory',(s:EngineInput)=>s.planResourceItems=s.planResourceItems.filter(r=>r.typeId!==1),'NO_COMPATIBLE_DAILY_RESOURCE'],
 ['all unavailable',(s:EngineInput)=>s.planResourceItems.forEach(r=>r.isAvailable=false),'NO_AVAILABLE_NOMINAL_RESOURCE'],
 ['quantity two',(s:EngineInput)=>s.tasks[0].resourceRequirements={byType:{1:2}},'UNREPRESENTABLE_QUANTITY'],
 ['multiple types',(s:EngineInput)=>s.tasks[0].resourceRequirements={byType:{1:1,2:1}},'BYTYPE_REQUIRES_SINGLE_TYPE'],
 ['type and anyOf',(s:EngineInput)=>s.tasks[0].resourceRequirements!.anyOf=[{quantity:1,resourceItemIds:[1,2]}],'BYTYPE_ANYOF_COMBINATION_UNSUPPORTED'],
 ['shared auxiliary',(s:EngineInput)=>s.planResourceItems.forEach(r=>r.typeCode='auxiliar'),'NO_AVAILABLE_NOMINAL_RESOURCE'],
 ['macro resources',(s:EngineInput)=>s.resourcePresenceConcentrationPolicies={4:'REQUIRED',5:'PREFERRED'},'NO_AVAILABLE_NOMINAL_RESOURCE'],
 ['Main',(s:EngineInput)=>s.tasks[0].plannerNextKind='main','NOMINAL_REQUIRES_ORDINARY_STANDALONE_AUXILIARY_OR_MAIN'],
 ['Vocal',(s:EngineInput)=>s.tasks[0].plannerNextKind='vocal','NOMINAL_REQUIRES_ORDINARY_STANDALONE_AUXILIARY_OR_MAIN'],
 ['technical',(s:EngineInput)=>s.tasks[0].plannerNextKind='technical','NOMINAL_REQUIRES_ORDINARY_STANDALONE_AUXILIARY_OR_MAIN'],
 ['grouped',(s:EngineInput)=>s.tasks[0].jointGroupId='joint','NOMINAL_REQUIRES_ORDINARY_STANDALONE_AUXILIARY_OR_MAIN'],
] as const)test(`${label} fails explicitly`,()=>{const s=captured();edit(s);const a=adaptEngineInputToPlannerNextProblem(s);assert.equal(a.status,'UNSUPPORTED');assert.ok(JSON.stringify(a).includes(reason),JSON.stringify(a));});
test('lock on scarce A cannot be bypassed with B',()=>{
 const s=captured();s.locks=[{id:1,planId:s.planId,taskId:1,lockType:'resource',lockedResourceId:4}];assert.equal(run(problem(s)).evidence.completeForScope,false);
});

test('resource IDs and inventory order cannot override scarce physical demand',()=>{
 const input=captured();input.planResourceItems[0].id=500;input.planResourceItems[1].id=400;input.planResourceItems.reverse();
 const a=run(problem(input));assert.ok(a.evidence.completeForScope);
 assert.equal(a.proposal?.[0].nominalResourceChoice?.selectedResourceId,'plan-resource:400');
 assert.deepEqual(a.proposal?.[1].requiredResourceIds,['plan-resource:500']);
});

test('type domains exclude configured coaches and resource macros while keeping a physical alternative',()=>{
 const input=captured();input.tasks=input.tasks.slice(0,1);input.vocalCoachPlanResourceItemIdByContestantId={1:4};
 assert.deepEqual(resolveNominalResourceRequirements(input,input.tasks[0]).resourceIds,[5]);
 assert.equal(run(problem(input)).proposal?.[0].nominalResourceChoice?.selectedResourceId,'plan-resource:5');
 delete input.vocalCoachPlanResourceItemIdByContestantId;input.resourcePresenceConcentrationPolicies={4:'REQUIRED'};
 assert.deepEqual(resolveNominalResourceRequirements(input,input.tasks[0]).resourceIds,[5]);
 assert.equal(run(problem(input)).proposal?.[0].nominalResourceChoice?.selectedResourceId,'plan-resource:5');
});
