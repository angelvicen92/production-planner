import test from "node:test";
import assert from "node:assert/strict";
import { effectivePlanningResourceIds, planningFilterIds, planningGroupOrder } from "./planning-view-policy";

test("Assisted retains unordered groups while Legacy keeps its explicit hide contract", () => {
  for (const absent of [null, undefined, "invalid"]) {
    assert.equal(planningGroupOrder(absent, true), Number.MAX_SAFE_INTEGER);
    assert.equal(planningGroupOrder(absent, false), null);
  }
  assert.equal(planningGroupOrder(0, true), 0);
  assert.equal(planningGroupOrder(4, false), 4);
});
test("Assisted resources default to the current catalog and ignore stale cross-day selections", () => {
  assert.deepEqual(planningFilterIds([], ["a", "b"], true, true), ["a", "b"]);
  assert.deepEqual(planningFilterIds(["old"], ["a", "b"], true, true), ["a", "b"]);
  assert.deepEqual(planningFilterIds(["old", "b"], ["a", "b"], true, true), ["b"]);
  assert.deepEqual(planningFilterIds([99], [1, 2], true), []);
  assert.deepEqual(planningFilterIds([], ["a"], false, true), []);
  assert.deepEqual(planningFilterIds([99], [1], false), [99]);
});
test("resource lanes union exact draft direct, space and parent assignments without duplicates", () => {
  const spaces = new Map([[3, {zoneId: 1}], [4, {zoneId: 2}]]);
  const task = {spaceId: 3, zoneId: 1, assignedResources: [7, 7]};
  assert.deepEqual(effectivePlanningResourceIds(task, spaces, {3: [7, 8]}, {1: [8, 9], 9: [99]}), [7, 8, 9]);
  assert.deepEqual(effectivePlanningResourceIds({...task, spaceId: 4, zoneId: 2, assignedResources: []}, spaces, {3: [7]}, {2: [10]}), [10]);
  assert.deepEqual(effectivePlanningResourceIds({zoneId: 1}, spaces, {}, {1: [9]}), [9]);
  assert.deepEqual(effectivePlanningResourceIds({}, spaces, {}, {}), []);
  assert.deepEqual(task, {spaceId: 3, zoneId: 1, assignedResources: [7, 7]});
});

test("zone conflicts and incomplete hierarchy do not invent inherited consumption; malformed arrays fail closed",()=>{
  const spaces=new Map([[3,{zoneId:1}]]);
  assert.deepEqual(effectivePlanningResourceIds({spaceId:3,zoneId:9,assignedResources:[7]},spaces,{3:[8]},{1:[10],9:[11]}),[7,8]);
  assert.deepEqual(effectivePlanningResourceIds({spaceId:4,zoneId:9},spaces,{4:[8]},{9:[11]}),[8]);
  assert.deepEqual(effectivePlanningResourceIds({assignedResources:"7" as any},spaces,{},{}),[]);
  assert.deepEqual(effectivePlanningResourceIds({assignedResources:[7,"8",null,1.5] as any},spaces,{},{}),[7]);
});

test("own resources include only a fixed or selected team, never all eligible compositions",()=>{
 const teams=[{itinerantTeamId:50,planResourceItemIds:[7,8]}];
 const source={resourceInheritance:"OPERATION_ONLY" as const,spaceId:3,zoneId:1,assignedResources:[9]};
 assert.deepEqual(effectivePlanningResourceIds({...source,itinerantTeamId:50},new Map([[3,{zoneId:1}]]),{3:[10]},{1:[11]},teams),[7,8,9]);
 assert.deepEqual(effectivePlanningResourceIds(source,new Map([[3,{zoneId:1}]]),{3:[10]},{1:[11]},teams),[9]);
});
