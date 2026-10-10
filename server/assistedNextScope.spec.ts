import assert from 'node:assert/strict';
import test from 'node:test';
import {buildA2ImportRows} from '../script/demo/a2ImportRows';
import {a2ImportStorageFixture} from '../script/demo/a2ImportStorageFixture';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from './assistedPlanningSnapshot';
process.env.SUPABASE_URL??='http://localhost';process.env.SUPABASE_SERVICE_ROLE_KEY??='test';process.env.SUPABASE_ANON_KEY??='test';
const {AssistedPlanningService}=await import('./assistedPlanningService');

test('suggestion uses the real persisted input, excludes accepted obligations and never writes',async()=>{
 for(const offset of [0,50000]){
  const dataset=buildA2ImportRows('2026-10-30',offset),fixture=a2ImportStorageFixture(dataset);
  let draft=buildAssistedPlanningSnapshotV1(dataset.input.tasks.map(t=>({id:t.id,startPlanned:null,endPlanned:null,zoneId:t.zoneId??null,spaceId:t.spaceId??null})));
  fixture.storage.getActiveAssistedPlanningSession=async()=>({draftSnapshotJson:draft,draftFingerprint:fingerprintAssistedPlanningSnapshotV1(draft),draftBaseStageId:1}) as any;
  let writes=0;const service=new AssistedPlanningService(fixture.storage,async()=>{writes++;throw Error('read-only recommendation cannot write');});
  const first=await service.recommendNextScope(dataset.input.planId);
  assert.deepEqual(first.selector,{kind:'SPACE',spaceId:dataset.input.plannerNext!.mainFlow.spaceId});assert.equal(first.taskIds.length,19);
  const accepted=new Set(first.taskIds);
  draft={...draft,tasks:draft.tasks.map(t=>accepted.has(t.taskId)?{...t,startPlanned:'09:00',endPlanned:'09:15'}:t)};
  const next=await service.recommendNextScope(dataset.input.planId);assert.equal(next.selector?.kind,'TASK_IDS');assert.ok(next.taskIds.every(id=>!accepted.has(id)));assert.equal(next.taskIds.length,19);
  draft={...draft,tasks:draft.tasks.map(t=>({...t,startPlanned:'09:00',endPlanned:'09:15'}))};
  assert.equal((await service.recommendNextScope(dataset.input.planId)).selector,null);assert.equal(writes,0);
 }
});
test('suggestion requires an active session',async()=>{
 const dataset=buildA2ImportRows('2026-10-30'),fixture=a2ImportStorageFixture(dataset);fixture.storage.getActiveAssistedPlanningSession=async()=>null;
 await assert.rejects(()=>new AssistedPlanningService(fixture.storage).recommendNextScope(dataset.input.planId),/SESSION_NOT_FOUND/);
});
