import assert from "node:assert/strict";
import test from "node:test";
import { buildDailySpaceZoneIdMapForEngineInput, projectPlanSpaceSettingsForEngineInput, projectPlanZoneSettingsForEngineInput } from "./buildInput";

test("SPEC10-009: daily zone and space projection preserves literal contracts and order", () => {
  const rows = Object.freeze([
    Object.freeze({ id: 2, space_id: 20, zone_id: 3, availability_start: null, availability_end: null, source: "default" }),
    Object.freeze({ id: 1, spaceId: 10, zoneId: 2, availabilityStart: undefined, availability_start: "09:00", availabilityEnd: "bad", source: "edited" }),
  ]);
  const before = structuredClone(rows);
  assert.deepEqual(projectPlanSpaceSettingsForEngineInput(rows), [
    { id: 1, spaceId: 10, zoneId: 2, availabilityStart: undefined, availabilityEnd: "bad", source: "edited" },
    { id: 2, spaceId: 20, zoneId: 3, availabilityStart: null, availabilityEnd: null, source: "default" },
  ]);
  assert.deepEqual(rows, before);
});

test("SPEC10-009: daily relation excludes duplicates and never consults a global catalog", () => {
  const rows = Object.freeze([
    Object.freeze({ spaceId: 20, zoneId: 40, availabilityStart: null, availabilityEnd: null }),
    Object.freeze({ spaceId: 21, zoneId: 41, availabilityStart: null, availabilityEnd: null }),
    Object.freeze({ spaceId: 21, zoneId: 99, availabilityStart: null, availabilityEnd: null }),
  ]);
  const before = structuredClone(rows);
  const relation = buildDailySpaceZoneIdMapForEngineInput(rows);
  assert.equal(relation.get(20), 40);
  assert.equal(relation.has(21), false);
  assert.deepEqual(rows, before);
});

test("SPEC10-009: zone projection accepts snake case and is order invariant", () => {
  const rows = [{ zone_id: 9, availability_start: "09:00", availability_end: "17:00", source: "edited" }, { zoneId: 2, availabilityStart: null, availabilityEnd: null }];
  assert.deepEqual(projectPlanZoneSettingsForEngineInput(rows), projectPlanZoneSettingsForEngineInput([...rows].reverse()));
});
