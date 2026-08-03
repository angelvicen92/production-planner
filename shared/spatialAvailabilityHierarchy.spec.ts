import assert from "node:assert/strict";
import test from "node:test";
import { resolveEffectiveSpaceAvailabilityHierarchy } from "./spatialAvailabilityHierarchy";

const resolve = (zone: Record<string, unknown>, space: Record<string, unknown>, workDay: Record<string, unknown> = { start: "08:00", end: "18:00" }) =>
  resolveEffectiveSpaceAvailabilityHierarchy({ workDay: workDay as any, zoneAvailability: zone as any, spaceAvailability: space as any });

test("SPEC10-009 shared: valid hierarchy inherits null pairs and freezes output", () => {
  const input = Object.freeze({ zone: Object.freeze({ start: null, end: null }), space: Object.freeze({ start: null, end: null }) });
  const result = resolve(input.zone, input.space);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.space.effectiveWindow, { start: "08:00", end: "18:00" });
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.zone) && Object.isFrozen(result.space) && Object.isFrozen(result.space.effectiveWindow));
  }
  assert.deepEqual(input, { zone: { start: null, end: null }, space: { start: null, end: null } });
});

for (const [name, workDay, zone, space, reason] of [
  ["invalid workday", { start: "8:00", end: "18:00" }, { start: null, end: null }, { start: null, end: null }, "INVALID_WORKDAY"],
  ["absent pair", { start: "08:00", end: "18:00" }, {}, { start: null, end: null }, "MISSING_ZONE_WINDOW_ENDPOINT"],
  ["partial pair", { start: "08:00", end: "18:00" }, { start: "09:00" }, { start: null, end: null }, "MISSING_ZONE_WINDOW_ENDPOINT"],
  ["mixed null string", { start: "08:00", end: "18:00" }, { start: null, end: "17:00" }, { start: null, end: null }, "MIXED_ZONE_WINDOW"],
  ["invalid format", { start: "08:00", end: "18:00" }, { start: "9:00", end: "17:00" }, { start: null, end: null }, "INVALID_ZONE_TIME_FORMAT"],
  ["invalid order", { start: "08:00", end: "18:00" }, { start: "17:00", end: "09:00" }, { start: null, end: null }, "INVALID_ZONE_TIME_ORDER"],
  ["zone outside workday", { start: "08:00", end: "18:00" }, { start: "07:00", end: "17:00" }, { start: null, end: null }, "ZONE_OUTSIDE_WORKDAY"],
  ["space outside zone", { start: "08:00", end: "18:00" }, { start: "09:00", end: "17:00" }, { start: "08:30", end: "16:00" }, "SPACE_OUTSIDE_ZONE"],
] as const) test(`SPEC10-009 shared: ${name}`, () => assert.deepEqual(resolve(zone, space, workDay), { valid: false, reason, workDay: reason === "INVALID_WORKDAY" ? null : { start: "08:00", end: "18:00" } }));

