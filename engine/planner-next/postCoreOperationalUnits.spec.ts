import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "./contracts";
import { derivePostCoreOperationalUnits } from "./postCoreOperationalUnits";

const task = (id:string, requiredResourceIds:string[]=[], itinerantUnitId?:string):Task => ({
  id, kind:"auxiliary", participantId:`participant-${id}`, duration:5, spaceId:`space-${id}`,
  dependencies:[], requiredResourceIds, itinerantUnitId,
});
const item = (id:string, tasks:Task[], kind="RESOURCE_TASK") => ({ id, tasks, kind });

test("two camera tasks are one operational unit rather than top-level resource tasks",()=>{
  const units=derivePostCoreOperationalUnits([
    item("resource:a",[task("a",["camera-a"])]),item("resource:b",[task("b",["camera-a"])]),
  ]);
  assert.equal(units.length,1);assert.equal(units[0]!.workItems.length,2);assert.equal(units[0]!.memberCount,2);
});

test("structural work items preserve their explicit identity despite shared resources",()=>{
  const units=derivePostCoreOperationalUnits([
    item("setup:studio",[task("setup",["camera-a"])],"SETUP_GROUP"),item("joint:shot",[task("shot",["camera-a"])],"JOINT"),
    item("round:shot",[task("round",["camera-a"])],"ROUND_SYNCHRONIZATION"),
    item("technical:shot",[task("technical",["camera-a"])],"TECHNICAL_CHAIN"),
  ]);
  assert.equal(units.length,4);
});

test("itinerant authority groups work items across resources and input permutations deterministically",()=>{
  const workItems=[item("resource:a",[task("a",["camera-a"],"touring")]),
    item("resource:b",[task("b",["sound-b"],"touring")]),item("resource:c",[task("c",["other"])])];
  const signature=(items:typeof workItems)=>derivePostCoreOperationalUnits(items).map((unit)=>({id:unit.id,members:unit.workItems.map(({id})=>id)}));
  assert.deepEqual(signature(workItems),signature([...workItems].reverse()));
  assert.equal(signature(workItems).find(({members})=>members.includes("resource:a"))!.members.length,2);
});

test("a multiresource task cannot bridge two exact resource signatures",()=>{
  const units=derivePostCoreOperationalUnits([item("a",[task("a",["one"])]),
    item("bridge",[task("bridge",["one","two"])]),item("c",[task("c",["two"])])]);
  assert.deepEqual(units.map(({workItems})=>workItems.map(({id})=>id)),[["a"],["bridge"],["c"]]);
});

test("Reality A, B, and combined remain three identities without transitive fusion",()=>{
  const units=derivePostCoreOperationalUnits([
    item("reality-a",[task("a",["CAM1"],"reality-a")]),
    item("reality-b",[task("b",["CAM2"],"reality-b")]),
    item("reality-combined",[task("combined",["CAM1","CAM2"],"reality-combined")]),
  ]);
  assert.deepEqual(units.map(({workItems})=>workItems.map(({id})=>id)),[["reality-a"],["reality-b"],["reality-combined"]]);
});

test("RESOURCE_TASKS with the same canonical CAM1/CAM2 signature group",()=>{
  const units=derivePostCoreOperationalUnits([
    item("first",[task("first",["CAM2","CAM1"])]),item("second",[task("second",["CAM1","CAM2"])]),
  ]);
  assert.deepEqual(units.map(({workItems})=>workItems.map(({id})=>id)),[["first","second"]]);
});
