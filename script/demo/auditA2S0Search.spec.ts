import assert from 'node:assert/strict';
import test from 'node:test';
import {buildA2ImportRows} from './a2ImportRows';
import {a2HistoricalCatalog} from './a2HistoricalCatalog';
import {a2ImportStorageFixture} from './a2ImportStorageFixture';
import {buildEngineInput} from '../../engine/buildInput';
import {compareS0Inputs,compareCanonicalA2,projectS0} from './auditA2S0Search';

const dataset=()=>buildA2ImportRows('2026-10-31',100000,{historicalCatalog:a2HistoricalCatalog,planId:27002});

test('S0 comparison distinguishes source metadata from complete search equivalence',async()=>{
  const d=dataset(),persisted=await buildEngineInput(27002,a2ImportStorageFixture(d).storage);
  const before=structuredClone(persisted);
  persisted.tasks[0]!.contestantName='PRIVATE_NAME_SENTINEL';
  const report=compareS0Inputs(persisted,d.input);
  assert.ok(report.differingInputFields.includes('tasks'));
  assert.equal(report.problemEqual,true);assert.equal(report.assistedEqual,true);
  assert.equal(report.recommendationEqual,true);assert.equal(report.scope.count,19);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_NAME_SENTINEL'));
  persisted.tasks[0]!.contestantName=before.tasks[0]!.contestantName;
  assert.deepEqual(persisted,before);
});

test('266 obligations cannot mask different resource availability or REQUIRED meal geometry',()=>{
  const input=dataset().input;
  for(const change of ['resource','meal'] as const){
    const other=structuredClone(input);
    if(change==='resource')Object.assign(other.planResourceItems[0]!,{availabilityStart:'12:00',availabilityEnd:'21:00'});
    else other.operationalMealPolicies![0]!.durationMinutes+=5;
    const report=compareS0Inputs(input,other);
    assert.deepEqual(report.sourceObligations,[266,266]);
    assert.equal(report.problemEqual,false);assert.equal(report.assistedEqual,false);
  }
});

test('S0 diagnostic refuses to erase protected work or reconstruct a non-S0 run',()=>{
  const input=dataset().input;
  input.tasks[0]!.startPlanned='10:00';input.tasks[0]!.endPlanned='10:10';
  assert.throws(()=>projectS0(input),/unplaced pending S0/);
});

test('canonical identity reconciliation preserves task authorities without asserting identical search catalogs',()=>{
  const report=compareCanonicalA2(dataset().input);
  assert.ok(Object.values(report.mappedSectionsEqual).every(Boolean));
  assert.equal(report.exactSearchInputEqual,false);
  assert.equal(report.facts.productiveTasks+report.facts.participantMeals!,266);
});
