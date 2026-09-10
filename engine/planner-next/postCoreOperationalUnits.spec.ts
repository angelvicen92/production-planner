import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "./contracts";
import { derivePostCoreOperationalUnits } from "./postCoreOperationalUnits";

const task = (id:string, requiredResourceIds:string[]=[], itinerantUnitId?:string):Task => ({
  id, kind:"auxiliary", participantId:`participant-${id}`, duration:5, spaceId:`space-${id}`,
  dependencies:[], requiredResourceIds, itinerantUnitId,
});
const item = (id:string, tasks:Task[]) => ({ id, tasks });

test("two camera tasks are one operational unit rather than top-level resource tasks",()=>{
  const units=derivePostCoreOperationalUnits([
    item("resource:a",[task("a",["camera-a"])]),item("resource:b",[task("b",["camera-a"])]),
  ]);
  assert.equal(units.length,1);assert.equal(units[0]!.workItems.length,2);assert.equal(units[0]!.memberCount,2);
});

test("a setup work item joins another work item through an explicit required resource",()=>{
  const units=derivePostCoreOperationalUnits([
    item("setup:studio",[task("setup",["camera-a"])]),item("resource:shot",[task("shot",["camera-a"])]),
  ]);
  assert.equal(units.length,1);assert.deepEqual(units[0]!.workItems.map(({id})=>id),["resource:shot","setup:studio"]);
});

test("itinerant authority groups work items across resources and input permutations deterministically",()=>{
  const workItems=[item("resource:a",[task("a",["camera-a"],"touring")]),
    item("resource:b",[task("b",["sound-b"],"touring")]),item("resource:c",[task("c",["other"])])];
  const signature=(items:typeof workItems)=>derivePostCoreOperationalUnits(items).map((unit)=>({id:unit.id,members:unit.workItems.map(({id})=>id)}));
  assert.deepEqual(signature(workItems),signature([...workItems].reverse()));
  assert.equal(signature(workItems).find(({members})=>members.includes("resource:a"))!.members.length,2);
});

test("shared-resource connectivity is transitive while authority-free structured items remain separate",()=>{
  const units=derivePostCoreOperationalUnits([item("a",[task("a",["one"])]),
    item("bridge",[task("bridge",["one","two"])]),item("c",[task("c",["two"])]),item("joint:free",[task("free")])]);
  assert.deepEqual(units.map(({workItems})=>workItems.map(({id})=>id)),[["a","bridge","c"],["joint:free"]]);
});
