import assert from 'node:assert/strict';
import test from 'node:test';
import breaks from './fixtures/a2-27002-legacy-breaks.json';
import {buildA2ImportRows} from './a2ImportRows';
import {a2HistoricalCatalog} from './a2HistoricalCatalog';
import {a2ImportStorageFixture} from './a2ImportStorageFixture';
import {buildEngineInput} from '../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {applyPlanPlannerNextConfiguration,PlanPlannerNextConfigurationError} from '../../server/planPlannerNextConfiguration';

test('persisted 27002 break shape coexists with the complete structured day without changing the problem',async()=>{
 const dataset=buildA2ImportRows('2026-10-31',100000,{historicalCatalog:a2HistoricalCatalog,planId:27002});
 const fixture=a2ImportStorageFixture(dataset),read=fixture.storage.getPlanEngineInputDetails.bind(fixture.storage);
 const clean=await buildEngineInput(27002,fixture.storage),original=structuredClone(breaks);
 fixture.storage.getPlanEngineInputDetails=async id=>({...await read(id),breaks} as any);
 const actual=await buildEngineInput(27002,fixture.storage);
 assert.equal(breaks.length,52);assert.equal(breaks.filter(b=>b.kind==='space_meal').length,49);
 assert.equal(actual.tasks.length,266);assert.deepEqual(actual,clean);
 assert.equal(adaptEngineInputToPlannerNextProblem(actual).status,'SUPPORTED');
 assert.deepEqual(breaks,original);
 // A positive obligation may never be silently dropped to repair coverage.
 const missing=structuredClone(dataset.configuration);missing.taskOperations.pop();
 assert.throws(()=>applyPlanPlannerNextConfiguration(actual,missing),e=>e instanceof PlanPlannerNextConfigurationError&&e.reasonCode==='TASK_OPERATIONS_MISMATCH');
});

test('legacy days retain all break projections and explicit boundaries fail closed on structured days',async()=>{
 const dataset=buildA2ImportRows('2026-10-31',100000,{historicalCatalog:a2HistoricalCatalog,planId:27002});
 const fixture=a2ImportStorageFixture(dataset),details=(await fixture.storage.getPlanEngineInputDetails(27002))!;
 const rows:any[]=structuredClone(breaks);
 fixture.storage.getPlanEngineInputDetails=async()=>({...details,breaks:rows});
 for(const key of ['locked_start','locked_end'] as const){
  rows[0][key]='12:00';
  await assert.rejects(()=>buildEngineInput(27002,fixture.storage),e=>e instanceof PlanPlannerNextConfigurationError&&e.reasonCode==='LOCKED_LEGACY_BREAK');
  rows[0][key]=null;
 }
 (details.plan as any).planner_next_configuration=null;
 rows[0].locked_start='12:00';
 const input=await buildEngineInput(27002,fixture.storage);
 assert.equal(input.tasks.length,318);
 assert.equal((input.tasks.find(t=>t.breakId===rows[0].id) as any)?.lockedStart,'12:00');
 assert.equal(input.tasks.filter(t=>t.id>0).length,266);
});
