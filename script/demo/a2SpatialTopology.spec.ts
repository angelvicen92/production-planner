import test from "node:test";
import assert from "node:assert/strict";
import {buildA2ImportRows} from "./a2ImportRows";
import {resolveA2SpatialTopology} from "./a2SpatialTopology";

test("A2 import has explicit multi-space parent groups, stable space/task identities and 266 unscheduled obligations", () => {
  const d=buildA2ImportRows("2026-10-12");
  assert.equal(d.spatialTopologyVersion,2);
  assert.equal(d.tables.daily_tasks.length,266);
  assert.equal(d.tables.spaces.length,24);
  assert.equal(d.tables.zones.length,11);
  for (const [id, children] of [[6005,[3005,3006,3007,3014]], [6008,[3008,3009]], [6019,[3019,3020,3021]]] as const)
    assert.deepEqual(d.tables.spaces.filter(space=>space.zone_id===id).map(space=>space.id),children);
  const parents=new Map(d.tables.spaces.map(space=>[space.id,space.zone_id]));
  for (const task of d.tables.daily_tasks) {
    assert.equal(task.start_planned,null);assert.equal(task.end_planned,null);
    if(task.space_id!=null)assert.equal(task.zone_id,parents.get(task.space_id));
  }
  assert.deepEqual(d.tables.zones.map(zone=>zone.ui_order_index),Array.from({length:11},(_,i)=>i));
  const offset=buildA2ImportRows("2026-10-12",50000);
  assert.deepEqual(offset.tables.spaces.map(space=>space.zone_id-50000),d.tables.spaces.map(space=>space.zone_id));
  assert.deepEqual(offset.input.tasks.map(task=>task.id-50000),d.input.tasks.map(task=>task.id));
});
test("topology drift and duplicate source identities fail closed", () => {
  const spaces=buildA2ImportRows("2026-10-12").tables.spaces.map(space=>space.name);
  assert.throws(()=>resolveA2SpatialTopology([...spaces,"unknown"]),/exact canonical space set/);
  assert.throws(()=>resolveA2SpatialTopology(spaces.slice(1)),/exact canonical space set/);
  assert.throws(()=>resolveA2SpatialTopology([...spaces.slice(1),spaces[1]]),/exact canonical space set/);
});
