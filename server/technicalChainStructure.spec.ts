import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../engine/types';
import {validateDailyTechnicalChains,applyDailyTechnicalChains} from './technicalChainStructure';
import {technicalChainStructureSchema} from '../shared/technicalChainStructure';
import {dayConfigEditSchema} from '../shared/dayConfig';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../engine/planner-next/integration/engineInputAdapter';
import {resolveAssistedScope} from './assistedScopeResolver';
import {buildEffectivePlanConfigRevisionV1,projectEffectiveAuthoritiesFromEngineInputV1} from './effectivePlanConfigRevision';
import {certifyDailyTechnicalChain} from './technicalChainCertificate';
const receipts=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u00q/native/receipts.json.gz')).toString());
const fixture=()=>{
 const input:EngineInput=structuredClone(receipts['A-explicit-input.json']);
 const structure={contractVersion:1 as const,policies:input.technicalChains!};
 return {input,structure};
};
test('daily REQUIRED authority needs CAS, strict topology and preserves true absence',()=>{
 const {input,structure}=fixture();
 assert.equal(dayConfigEditSchema.safeParse({technicalChains:structure}).success,false);
 assert.equal(dayConfigEditSchema.safeParse({technicalChains:structure,expectedRevisionId:1}).success,true);
 assert.equal(dayConfigEditSchema.safeParse({technicalChains:structure,expectedRevisionId:1,workday:{start:'08:00',end:'16:00'}}).success,false);
 assert.equal(applyDailyTechnicalChains(input,{}),input);
 assert.throws(()=>applyDailyTechnicalChains(input,{daily_technical_chains:{...structure,by:'00000000-0000-0000-0000-000000000001',at:'2026-10-25T00:00:00Z'},planner_next_configuration:{}}),/AUTHORITY_CONFLICT/);
 const saved=applyDailyTechnicalChains(input,{daily_technical_chains:{...structure,by:"00000000-0000-0000-0000-000000000001",at:"2026-10-25T00:00:00Z"},planner_next_profile:{}});assert.deepEqual(saved.technicalChains,structure.policies);
 const valid=validateDailyTechnicalChains(input,structure);assert.deepEqual(valid.technicalChains,structure.policies);
 assert.equal(technicalChainStructureSchema.safeParse({...structure,policies:[{...structure.policies[0],phases:[]}]}).success,false);
 assert.equal(technicalChainStructureSchema.safeParse({...structure,policies:[{...structure.policies[0],adjacency:'PREFERRED'}]}).success,false);
});
test('membership, nominal inventory and linear dependencies fail closed',()=>{
 const {input,structure}=fixture();
 for(const mutate of [
  (s:any)=>s.policies[0].orderedTaskIds.reverse(),
  (s:any)=>s.policies[0].orderedTaskIds[0]=2147483000,
  (s:any)=>s.policies[0].orderedTaskIds[1]=s.policies[0].orderedTaskIds[0],
  (s:any)=>s.policies[0].requiredResourceIds=[2147483000],
  (s:any)=>s.policies[0].requiredResourceIds.push(s.policies[0].requiredResourceIds[0]),
 ]){const s=structuredClone(structure);mutate(s);assert.throws(()=>validateDailyTechnicalChains(input,s));}
 const id=structure.policies[0].orderedTaskIds[1];
 for(const change of [{plannerNextKind:'auxiliary'},{contestantId:1},{resourceRequirements:{byItem:{}}},{resourceRequirements:{byType:{1:1}}},{resourceRequirements:{anyOf:[{quantity:1,resourceItemIds:[1]}]}},{dependsOnTaskIds:[]},{dependsOnTaskIds:structure.policies[0].orderedTaskIds}]){
  const next=structuredClone(input);Object.assign(next.tasks.find(t=>t.id===id)!,change);assert.throws(()=>validateDailyTechnicalChains(next,structure));
 }
});
test('order is semantic in revision identity and explicit sibling selection',()=>{
 const {input,structure}=fixture();
 const args={planId:input.planId,optimizerSnapshot:receipts['A-identities.json'].explicitReplay.optimizerSnapshot,taskTemplateSnapshots:receipts['A-identities.json'].explicitReplay.taskTemplateSnapshots,optimizerProvenance:{authority:'plan_optimizer_snapshots',authorityContractVersion:1},taskTemplateProvenance:{authority:'plan_task_template_snapshots',authorityContractVersion:1},authorities:projectEffectiveAuthoritiesFromEngineInputV1(input)};
 const changed=structuredClone(input);changed.technicalChains![0].orderedTaskIds.reverse();
 assert.notEqual(buildEffectivePlanConfigRevisionV1(args).configurationFingerprint,buildEffectivePlanConfigRevisionV1({...args,authorities:projectEffectiveAuthoritiesFromEngineInputV1(changed)}).configurationFingerprint);
 input.dailyTechnicalChainsVersion=1;
 const a=adapt(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
 assert.deepEqual(resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:[structure.policies[0].orderedTaskIds[1]]}).productTaskIds,[...structure.policies[0].orderedTaskIds].sort((a,b)=>a-b));
 const proof=certifyDailyTechnicalChain(a.problem,[],10000);assert.equal(proof?.status,'WITNESS');assert.equal(proof?.tasks.length,3);
 assert.equal(certifyDailyTechnicalChain(a.problem,[],0)?.status,'BUDGET_EXHAUSTED');
});

test('multiple common nominal resources are required in every real member',()=>{
 const {input,structure}=fixture(),policy=structure.policies[0];
 const second=input.planResourceItems.find(r=>!policy.requiredResourceIds.includes(r.id))!;
 policy.requiredResourceIds.push(second.id);
 for(const task of input.tasks.filter(t=>policy.orderedTaskIds.includes(t.id)))task.resourceRequirements={byItem:{...task.resourceRequirements?.byItem,[second.resourceItemId]:1}};
 assert.deepEqual(validateDailyTechnicalChains(input,structure).technicalChains,structure.policies);
 const a=adapt(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
 const proof=certifyDailyTechnicalChain(a.problem,[],10000);assert.equal(proof?.status,'WITNESS');
 assert.ok(proof?.tasks.every(t=>policy.requiredResourceIds.every(id=>t.assignedResourceIds.includes(id))));
});
