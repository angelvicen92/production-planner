import assert from 'node:assert/strict';
import test from 'node:test';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from './assistedPlanningSnapshot';
import {projectAssistedWorkingOrigin} from './assistedWorkingOrigin';

test('rollback projection preserves the checkpoint and returns later tasks to their admitted pending decisions',()=>{
 const stage=buildAssistedPlanningSnapshotV1([{id:1,startPlanned:'09:00',endPlanned:'09:30',assignedResourceIds:[4]}],undefined,[{policyId:'space-meal:2',startPlanned:'13:00',endPlanned:'13:30'}]);
 const pending=buildAssistedPlanningSnapshotV1([{id:2,assignedResourceIds:[4]}]).tasks;
 const before=JSON.stringify(stage),fingerprint=fingerprintAssistedPlanningSnapshotV1(stage);
 const projected=projectAssistedWorkingOrigin(stage,pending);
 assert.equal(JSON.stringify(stage),before);assert.equal(fingerprintAssistedPlanningSnapshotV1(stage),fingerprint);
 assert.deepEqual(projected.snapshot.tasks[0],stage.tasks[0]);assert.equal(projected.snapshot.tasks[1].startPlanned,null);
 assert.deepEqual(projected.snapshot.operationalMeals,stage.operationalMeals);
 assert.notEqual(projected.fingerprint,fingerprint);
 const child=buildAssistedPlanningSnapshotV1([...stage.tasks.map(t=>({id:t.taskId,...t})),{id:2,startPlanned:'09:30',endPlanned:'10:00',assignedResourceIds:[4]}]);
 assert.deepEqual(projectAssistedWorkingOrigin(child,pending).snapshot,child);
});
