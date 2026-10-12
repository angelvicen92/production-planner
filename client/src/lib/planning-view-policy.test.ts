import {resolveEffectiveTaskResourceAssignments} from "../../../engine/planner-next/integration/effectiveTaskResourceAssignments";
import type {EngineInput} from "../../../engine/types";
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

test("view assignment projection matches the existing engine authority for exact, sparse and conflicting identities",()=>{
  const spaces=new Map([[3,{zoneId:1}],[4,{zoneId:2}]]);
  for(const task of [{spaceId:3,zoneId:1,assignedResources:[7]}, {spaceId:3,assignedResources:[]},
    {spaceId:3,zoneId:2}, {spaceId:99,zoneId:2}, {zoneId:2}, {}]){
    const source:EngineInput={planId:1,workDay:{start:"08:00",end:"20:00"},meal:{start:"13:00",end:"14:00"},camerasAvailable:1,
      tasks:[{id:1,planId:1,templateId:1,status:"pending",...task,assignedResourceIds:task.assignedResources}],locks:[],
      planZoneSettings:[1,2].map(zoneId=>({zoneId,availabilityStart:null,availabilityEnd:null})),
      planSpaceSettings:[...spaces].map(([spaceId,space])=>({spaceId,zoneId:space.zoneId!,availabilityStart:null,availabilityEnd:null})),
      zoneResourceAssignments:{1:[8],2:[9]},spaceResourceAssignments:{3:[7,10]},zoneResourceTypeRequirements:{},spaceResourceTypeRequirements:{},
      planResourceItems:[],resourceItemComponents:{},groupingZoneIds:[]};
    assert.deepEqual(effectivePlanningResourceIds(task,spaces,source.spaceResourceAssignments,source.zoneResourceAssignments),resolveEffectiveTaskResourceAssignments(source).assignments[0].effectiveResourceIds);
  }
});
