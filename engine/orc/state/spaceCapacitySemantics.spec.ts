import test from "node:test";
import assert from "node:assert/strict";
import { evaluateORCSpaceCapacitySemantics } from "./spaceCapacitySemantics";

test("shared capacity 2 rejects only the third concurrent blocking occupancy", () => {
  const tasks = new Map([[1,{id:1,countsAsWork:true,allowsSpaceOverlap:true}],[2,{id:2,countsAsWork:true,allowsSpaceOverlap:true}],[3,{id:3,countsAsWork:true,allowsSpaceOverlap:true}]] as any);
  const spaces = { parentById:{}, nameById:{1:"S"}, capacityById:{1:2}, concurrencyById:{1:2}, exclusiveById:{}, priorityById:{} };
  const e = (taskId:number) => ({ taskId, startPlanned:"09:00", endPlanned:"09:30", assignedResourceIds:[], spaceId:1 });
  assert.equal(evaluateORCSpaceCapacitySemantics({ entries:[e(1),e(2)] as any, tasks, spaces }).length, 0);
  const violations = evaluateORCSpaceCapacitySemantics({ entries:[e(1),e(2),e(3)] as any, tasks, spaces });
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0].taskIds, [1,2,3]);
});
