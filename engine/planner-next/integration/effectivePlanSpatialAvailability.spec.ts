import assert from "node:assert/strict";
import test from "node:test";
import { resolveEffectivePlanSpatialAvailability } from "./effectivePlanSpatialAvailability";

test("SPEC10-009: zone inherits workday and space inherits daily zone", () => {
  const result = resolveEffectivePlanSpatialAvailability({ start: "08:00", end: "18:00" }, [{ zoneId: 2, availabilityStart: "09:00", availabilityEnd: "17:00" }], [{ spaceId: 4, zoneId: 2, availabilityStart: null, availabilityEnd: null }]);
  assert.deepEqual(result.spacesById.get(4)?.effectiveWindow, { start: "09:00", end: "17:00" });
  assert.equal(result.spacesById.get(4)?.mode, "INHERITED_ZONE");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.spacesById.get(4)));
});

test("SPEC10-009: invalid hierarchy and missing daily zone remain explicit and deterministic", () => {
  const zones = Object.freeze([{ zoneId: 2, availabilityStart: null, availabilityEnd: null }]);
  const spaces = Object.freeze([{ spaceId: 5, zoneId: 3, availabilityStart: null, availabilityEnd: null }, { spaceId: 4, zoneId: 2, availabilityStart: "07:00", availabilityEnd: "09:00" }]);
  const normal = resolveEffectivePlanSpatialAvailability({ start: "08:00", end: "18:00" }, zones, spaces);
  const inverted = resolveEffectivePlanSpatialAvailability({ start: "08:00", end: "18:00" }, zones, [...spaces].reverse());
  assert.deepEqual([...normal.spacesById], [...inverted.spacesById]);
  assert.deepEqual(normal.defects.map((entry) => entry.reason), ["SPACE_OUTSIDE_ZONE", "MISSING_ZONE_SNAPSHOT"]);
});

test("SPEC10-009: published maps are immutable at runtime while retaining the complete read API", () => {
  const result = resolveEffectivePlanSpatialAvailability({ start: "08:00", end: "18:00" }, [{ zoneId: 2, availabilityStart: null, availabilityEnd: null }], [{ spaceId: 4, zoneId: 2, availabilityStart: null, availabilityEnd: null }]);
  for (const view of [result.zonesById, result.spacesById]) {
    const runtime = view as unknown as Record<string, unknown>;
    assert.equal(runtime.set, undefined);
    assert.equal(runtime.delete, undefined);
    assert.equal(runtime.clear, undefined);
    assert.throws(() => (runtime.set as Function)(99, {}), TypeError);
    assert.throws(() => (runtime.delete as Function)(2), TypeError);
    assert.throws(() => (runtime.clear as Function)(), TypeError);
    assert.equal(Object.getOwnPropertyNames(view).some((key) => /map|value|back/i.test(key)), false);
    assert.equal([...view.entries()].length, view.size);
    assert.deepEqual([...view.keys()], [...view].map(([key]) => key));
    assert.equal([...view.values()].length, view.size);
    let visited = 0; view.forEach((_value, key, map) => { visited++; assert.equal(map, view); assert.ok(view.has(key)); assert.ok(view.get(key)); });
    assert.equal(visited, view.size);
  }
  assert.deepEqual([...result.zonesById.keys()], [2]);
  assert.deepEqual([...result.spacesById.keys()], [4]);
});

test("SPEC10-009: duplicate zone snapshots are blocking, unusable, immutable and order invariant", () => {
  const zones = Object.freeze([
    Object.freeze({ id: 2, zoneId: 7, availabilityStart: "09:00", availabilityEnd: "17:00", source: "edited" }),
    Object.freeze({ id: 1, zoneId: 7, availabilityStart: null, availabilityEnd: null, source: "default" }),
  ]);
  const spaces = Object.freeze([Object.freeze({ spaceId: 4, zoneId: 7, availabilityStart: null, availabilityEnd: null })]);
  const before = structuredClone({ zones, spaces });
  const normal = resolveEffectivePlanSpatialAvailability({ start: "08:00", end: "18:00" }, zones, spaces);
  const inverted = resolveEffectivePlanSpatialAvailability({ start: "08:00", end: "18:00" }, [...zones].reverse(), spaces);
  assert.equal(normal.zonesById.get(7)?.effectiveWindow, null);
  assert.equal(normal.spacesById.get(4)?.effectiveWindow, null);
  assert.deepEqual(snapshot(normal), snapshot(inverted));
  assert.deepEqual({ zones, spaces }, before);
  assert.deepEqual(normal.defects.map((defect) => defect.reason), ["DUPLICATE_ZONE_SNAPSHOT"]);
});

test("SPEC10-009: duplicate space snapshots never overwrite and remain order invariant", () => {
  const zones = Object.freeze([Object.freeze({ zoneId: 2, availabilityStart: null, availabilityEnd: null })]);
  const spaces = Object.freeze([
    Object.freeze({ id: 2, spaceId: 4, zoneId: 2, availabilityStart: "09:00", availabilityEnd: "17:00" }),
    Object.freeze({ id: 1, spaceId: 4, zoneId: 2, availabilityStart: null, availabilityEnd: null }),
  ]);
  const normal = resolveEffectivePlanSpatialAvailability({ start: "08:00", end: "18:00" }, zones, spaces);
  const inverted = resolveEffectivePlanSpatialAvailability({ start: "08:00", end: "18:00" }, zones, [...spaces].reverse());
  assert.equal(normal.spacesById.get(4)?.effectiveWindow, null);
  assert.equal(normal.spacesById.get(4)?.defect?.reason, "DUPLICATE_SPACE_SNAPSHOT");
  assert.deepEqual(snapshot(normal), snapshot(inverted));
});

function snapshot(result: ReturnType<typeof resolveEffectivePlanSpatialAvailability>) {
  return { zones: [...result.zonesById], spaces: [...result.spacesById], defects: result.defects };
}
