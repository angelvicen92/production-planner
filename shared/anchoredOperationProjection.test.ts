import test from 'node:test';import assert from 'node:assert/strict';
import {projectAnchoredOperations} from './anchoredOperationProjection';
const contract=[{id:'operation',beforeTaskIds:[1],anchorTaskId:2,afterTaskIds:[3]}];
const tasks=[{id:1,startPlanned:'10:00',endPlanned:'10:15',spaceId:90,contestantId:7,assignedResources:[11]},
 {id:2,startPlanned:'10:15',endPlanned:'10:30',spaceId:48,contestantId:7,assignedResources:[11,12]},
 {id:3,startPlanned:'10:30',endPlanned:'10:45',spaceId:90,contestantId:7,assignedResources:[11]}];
test('three contiguous segments project one operation; anchor occupies only 15 of its 45 minutes',()=>{
 const before=JSON.stringify(tasks),[p]=projectAnchoredOperations(contract,tasks);
 assert.equal(p.logicalOperationCount,1);assert.equal(p.durationMinutes,45);assert.equal(p.status,'CONTINUOUS');
 assert.equal(p.anchorOccupation?.durationMinutes,15);assert.equal(p.anchorOccupation?.spaceId,48);
 assert.deepEqual(p.resourceIds,[11,12]);assert.equal(p.additionalParticipantOccupation,false);assert.equal(JSON.stringify(tasks),before);
});
test('partial or separated segments never manufacture a continuous 45-minute operation',()=>{
 assert.equal(projectAnchoredOperations(contract,tasks.slice(0,2))[0].status,'INCOMPLETE');
 const rows=structuredClone(tasks);rows[2].startPlanned='10:35';rows[2].endPlanned='10:50';
 const [p]=projectAnchoredOperations(contract,rows);assert.equal(p.status,'INVALID_ADJACENCY');assert.equal(p.durationMinutes,null);
});
