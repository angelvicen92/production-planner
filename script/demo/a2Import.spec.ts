import assert from 'node:assert/strict';
import test from 'node:test';
import {buildA2ImportRows} from './a2ImportRows';
import {a2ImportStorageFixture} from './a2ImportStorageFixture';
import {buildA2ImportSQL} from './prepareA2Import';
import {buildEngineInput} from '../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {applyPlanPlannerNextConfiguration} from '../../server/planPlannerNextConfiguration';
import {projectEffectiveAuthoritiesFromEngineInputV1} from '../../server/effectivePlanConfigRevision';

test('unscheduled import preserves the complete canonical problem through real buildEngineInput',async()=>{
 for(const offset of [0,50000]){
  const dataset=buildA2ImportRows('2026-10-30',offset),fixture=a2ImportStorageFixture(dataset);
  const input=await buildEngineInput(dataset.input.planId,fixture.storage),actual=adaptEngineInputToPlannerNextProblem(input),expected=adaptEngineInputToPlannerNextProblem(dataset.input);
  assert.equal(actual.status,'SUPPORTED',JSON.stringify(actual.issues));assert.equal(expected.status,'SUPPORTED');
  if(actual.status==='SUPPORTED'&&expected.status==='SUPPORTED')assert.deepEqual(actual.problem,expected.problem);
  assert.equal(input.tasks.length,266);assert.ok(input.tasks.every(t=>t.startPlanned==null&&t.endPlanned==null));
  assert.deepEqual(fixture.tables.contestants.map((c:any)=>c.name),Array.from({length:19},(_,i)=>`C${String(i+1).padStart(2,'0')}`));
 }
});
test('invalid persisted contracts and foreign identities fail closed',async()=>{
 const dataset=buildA2ImportRows('2026-10-30');
 for(const mutate of [(c:any)=>c.taskOperations.push(c.taskOperations[0]),(c:any)=>c.taskOperations.pop(),(c:any)=>c.taskOperations[0].dependsOnTaskIds.push(999999),(c:any)=>c.plannerNext.searchBudget.maxBranchExpansions=100001,(c:any)=>c.taskOperations[0].startPlanned='09:00',(c:any)=>c.operationalMealPolicies[0].planResourceItemIds.push(999999)]){
  const raw=structuredClone(dataset.configuration);mutate(raw);assert.throws(()=>applyPlanPlannerNextConfiguration(dataset.input,raw));
 }
 assert.equal(applyPlanPlannerNextConfiguration(dataset.input,null),dataset.input);
});
test('operational authorities enter configuration identity without changing legacy projection',()=>{
 const dataset=buildA2ImportRows('2026-10-30');const original=projectEffectiveAuthoritiesFromEngineInputV1(dataset.input);
 const altered=structuredClone(dataset.input);altered.technicalChains![0].orderedTaskIds.reverse();
 assert.notDeepEqual(original.plan_workday,projectEffectiveAuthoritiesFromEngineInputV1(altered).plan_workday);
 delete altered.plannerNext;assert.ok(!JSON.stringify(projectEffectiveAuthoritiesFromEngineInputV1(altered).plan_workday).includes('plannerNextAuthorities'));
});
test('deterministic SQL requires approval and backup, preserves existing rows and restarts sequences atomically',()=>{
 const {sql,dataset}=buildA2ImportSQL('2026-10-30');assert.equal(sql,buildA2ImportSQL('2026-10-30').sql);
 assert.match(sql,/DEMO_TARGET_CONFIRMATION_REQUIRED/);assert.match(sql,/VERIFIED_BACKUP_REQUIRED/);assert.match(sql,/IMPORT_APPROVAL_REQUIRED/);assert.match(sql,/EXISTING_ROWS_CHANGED/);assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);
 assert.doesNotMatch(sql,/\b(UPDATE|DELETE|TRUNCATE|UPSERT|setval)\b/);assert.equal(dataset.tables.daily_tasks.length,266);
 assert.equal(dataset.tables.program_settings,undefined);assert.equal(dataset.tables.optimizer_settings,undefined);
 assert.match(sql,/ALTER SEQUENCE %s RESTART/);assert.match(sql,/A2_UNIQUE_COLLISION/);
 assert.throws(()=>buildA2ImportSQL('2026-02-30'));
});
