import test from 'node:test';
import assert from 'node:assert/strict';
import { executionPrecondition } from './execution-precondition';

test('Start/Finish use the observed cached version, preserve explicit stale versions and fail closed on disagreement', () => {
  const data = {status:'done',expectedStatus:'in_progress'};
  const task = {id:1,status:'in_progress',executionVersion:3};
  const write = (snapshots: unknown[], input: unknown=data) => executionPrecondition('PATCH','/api/tasks/1/status',input,snapshots);
  assert.deepEqual(write([[task],{dailyTasks:[task]}]),{...data,expectedVersion:3});
  assert.deepEqual(write([[task]],{...data,expectedVersion:1}),{...data,expectedVersion:1});
  assert.deepEqual(write([[task],{dailyTasks:[{...task,executionVersion:4}]}]),{...data,expectedVersion:undefined});
  assert.deepEqual(write([]),{...data,expectedVersion:undefined});
  assert.deepEqual(write([[{...task,status:'done'}]]),{...data,expectedVersion:undefined});
  assert.equal(executionPrecondition('PATCH','/api/tasks/1/real-time',data,[]),data);
});
