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
