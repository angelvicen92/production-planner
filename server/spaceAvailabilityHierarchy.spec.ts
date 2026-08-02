import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanSpatialAvailabilityInitializationBatch, buildPlanSpatialAvailabilitySnapshot, resolveEffectiveSpaceAvailabilityHierarchy, validateSpatialAvailabilityCatalog, type NullableAvailabilityWindow, type SpatialAvailabilityInput } from "./spaceAvailabilityHierarchy";

const base: SpatialAvailabilityInput = { workDay: { start: "09:00", end: "21:00" }, zoneAvailability: { start: null, end: null }, spaceAvailability: { start: null, end: null } };
const resolve = (patch: Partial<SpatialAvailabilityInput> = {}) => resolveEffectiveSpaceAvailabilityHierarchy({ ...base, ...patch });

test("valid workday and inherited hierarchy", () => {
  const result = resolve(); assert.equal(result.valid, true);
  if (result.valid) { assert.deepEqual(result.workDay, { start: "09:00", end: "21:00" }); assert.equal(result.zone.mode, "INHERITED_WORKDAY"); assert.equal(result.space.mode, "INHERITED_ZONE"); }
});

for (const [name, workDay] of [["format", { start: "9:00", end: "21:00" }], ["zero", { start: "09:00", end: "09:00" }], ["inverted", { start: "21:00", end: "09:00" }]] as const) {
  test(`invalid workday ${name}`, () => assert.deepEqual(resolve({ workDay }), { valid: false, reason: "INVALID_WORKDAY", workDay: null }));
}

test("explicit and equal zone windows are accepted", () => {
  for (const window of [{ start: "10:00", end: "20:00" }, { start: "09:00", end: "21:00" }]) {
    const result = resolve({ zoneAvailability: window }); assert.equal(result.valid && result.zone.mode, "EXPLICIT");
  }
});
for (const [name, window, reason] of [
  ["starts before", { start: "08:59", end: "20:00" }, "ZONE_OUTSIDE_WORKDAY"],
  ["ends after", { start: "10:00", end: "21:01" }, "ZONE_OUTSIDE_WORKDAY"],
  ["outside", { start: "01:00", end: "08:00" }, "ZONE_OUTSIDE_WORKDAY"],
  ["partial", { start: "10:00" } as unknown as NullableAvailabilityWindow, "MISSING_ZONE_WINDOW_ENDPOINT"],
  ["mixed", { start: null, end: "20:00" }, "MIXED_ZONE_WINDOW"],
  ["format", { start: "x", end: "20:00" }, "INVALID_ZONE_TIME_FORMAT"],
  ["order", { start: "20:00", end: "10:00" }, "INVALID_ZONE_TIME_ORDER"],
] as const) test(`zone ${name}`, () => { const result = resolve({ zoneAvailability: window }); assert.equal(!result.valid && result.reason, reason); });

test("explicit, equal and inherited space windows are accepted", () => {
  for (const window of [{ start: null, end: null }, { start: "11:00", end: "19:00" }, { start: "10:00", end: "20:00" }]) {
    const result = resolve({ zoneAvailability: { start: "10:00", end: "20:00" }, spaceAvailability: window }); assert.equal(result.valid, true);
  }
});
for (const [name, window, reason] of [
  ["starts before", { start: "09:59", end: "19:00" }, "SPACE_OUTSIDE_ZONE"],
  ["ends after", { start: "11:00", end: "20:01" }, "SPACE_OUTSIDE_ZONE"],
  ["outside", { start: "01:00", end: "09:00" }, "SPACE_OUTSIDE_ZONE"],
  ["partial", { start: "11:00" } as unknown as NullableAvailabilityWindow, "MISSING_SPACE_WINDOW_ENDPOINT"],
  ["mixed", { start: null, end: "19:00" }, "MIXED_SPACE_WINDOW"],
  ["format", { start: "11", end: "19:00" }, "INVALID_SPACE_TIME_FORMAT"],
  ["order", { start: "19:00", end: "11:00" }, "INVALID_SPACE_TIME_ORDER"],
] as const) test(`space ${name}`, () => { const result = resolve({ zoneAvailability: { start: "10:00", end: "20:00" }, spaceAvailability: window }); assert.equal(!result.valid && result.reason, reason); });

test("inherited zone permits an explicit space", () => assert.equal(resolve({ spaceAvailability: { start: "10:00", end: "20:00" } }).valid, true));
test("workday and zone modifications expose descendant invalidity", () => {
  assert.equal(!resolve({ workDay: { start: "11:00", end: "19:00" }, zoneAvailability: { start: "10:00", end: "20:00" } }).valid, true);
  assert.equal(!resolve({ zoneAvailability: { start: "11:00", end: "19:00" }, spaceAvailability: { start: "10:00", end: "20:00" } }).valid, true);
});
test("irrelevant names and parent ids do not influence deterministic immutable resolution", () => {
  const input: SpatialAvailabilityInput & { name: string; parent_space_id: number } = { ...structuredClone(base), name: "anything", parent_space_id: 99 };
  const before = structuredClone(input); const first = resolveEffectiveSpaceAvailabilityHierarchy(input); const second = resolveEffectiveSpaceAvailabilityHierarchy(input);
  assert.deepEqual(first, second); assert.deepEqual(input, before); assert.equal(Object.isFrozen(first), true);
  if (first.valid) { assert.equal(Object.isFrozen(first.zone), true); assert.equal(Object.isFrozen(first.zone.effectiveWindow), true); assert.equal(Object.isFrozen(first.space), true); }
});

const catalog = { planId: 7, requestedWorkDay: {}, defaultWorkDay: { start: "09:00", end: "21:00" }, zones: [{ id: 2, defaultAvailabilityStart: null, defaultAvailabilityEnd: null }, { id: 1, defaultAvailabilityStart: "10:00", defaultAvailabilityEnd: "20:00" }], spaces: [{ id: 4, zoneId: 2, defaultAvailabilityStart: null, defaultAvailabilityEnd: null }, { id: 3, zoneId: 1, defaultAvailabilityStart: "11:00", defaultAvailabilityEnd: "19:00" }] };
test("snapshot builder copies defaults, frozen zone relation, null inheritance and deterministic order", () => {
  const built = buildPlanSpatialAvailabilitySnapshot(structuredClone(catalog));
  assert.deepEqual([built.workStart, built.workEnd], ["09:00", "21:00"]); assert.deepEqual(built.zones.map(x => x.zone_id), [1, 2]); assert.deepEqual(built.spaces.map(x => x.space_id), [3, 4]);
  assert.deepEqual(built.zones[1].availability_start, null); assert.equal(built.zones[0].availability_start, "10:00"); assert.equal(built.spaces[0].zone_id, 1); assert.equal(built.spaces[1].availability_start, null);
  catalog.spaces[0].zoneId = 1; assert.equal(built.spaces[1].zone_id, 2);
});
test("snapshot builder honors complete override and rejects partial override", () => {
  const built = buildPlanSpatialAvailabilitySnapshot({ ...structuredClone(catalog), requestedWorkDay: { start: "08:00", end: "22:00" } }); assert.deepEqual([built.workStart, built.workEnd], ["08:00", "22:00"]);
  assert.throws(() => buildPlanSpatialAvailabilitySnapshot({ ...structuredClone(catalog), requestedWorkDay: { start: "08:00" } }), /WORKDAY_REQUEST_PARTIAL/);
});
test("one invalid catalog row rejects the complete logical batch", () => assert.throws(() => buildPlanSpatialAvailabilitySnapshot({ ...structuredClone(catalog), spaces: [...catalog.spaces, { id: 5, zoneId: 1, defaultAvailabilityStart: "09:00", defaultAvailabilityEnd: "21:00" }] }), /SPACE_OUTSIDE_ZONE/));
test("global catalog validation checks proposed workday, zone and space changes without mutation", () => {
  const input = Object.freeze({ workDay: Object.freeze({ start: "09:00", end: "21:00" }), zones: Object.freeze([{ id: 1, availabilityStart: "10:00", availabilityEnd: "20:00" }]), spaces: Object.freeze([{ id: 2, zoneId: 1, availabilityStart: "11:00", availabilityEnd: "19:00" }]) });
  assert.deepEqual(validateSpatialAvailabilityCatalog(input), { workDay: { start: "09:00", end: "21:00" }, zoneIds: [1], spaceIds: [2] });
  assert.throws(() => validateSpatialAvailabilityCatalog({ ...input, workDay: { start: "11:00", end: "21:00" } }), /ZONE_OUTSIDE_WORKDAY: zone 1/);
  assert.throws(() => validateSpatialAvailabilityCatalog({ ...input, workDay: { start: "12:00", end: "20:00" }, zones: [{ id: 1, availabilityStart: null, availabilityEnd: null }] }), /SPACE_OUTSIDE_ZONE: space 2, zone 1/);
  assert.throws(() => validateSpatialAvailabilityCatalog({ ...input, zones: [{ id: 1, availabilityStart: "11:30", availabilityEnd: "19:00" }] }), /SPACE_OUTSIDE_ZONE: space 2, zone 1/);
  assert.throws(() => validateSpatialAvailabilityCatalog({ ...input, spaces: [{ id: 2, zoneId: 1, availabilityStart: "09:00", availabilityEnd: "19:00" }] }), /SPACE_OUTSIDE_ZONE: space 2, zone 1/);
  assert.equal(validateSpatialAvailabilityCatalog({ ...input, zones: [{ id: 1, availabilityStart: null, availabilityEnd: null }], spaces: [{ id: 2, zoneId: 1, availabilityStart: null, availabilityEnd: null }] }).spaceIds[0], 2);
});

test("late initialization preserves daily authority, copies only missing rows and is deterministic", () => {
  const input = { planId: 7, workDay: { start: "09:00", end: "21:00" }, zones: [{ id: 1, availabilityStart: "09:00", availabilityEnd: "20:00" }, { id: 2, availabilityStart: null, availabilityEnd: null }], spaces: [{ id: 3, zoneId: 1, availabilityStart: "10:30", availabilityEnd: "17:30" }, { id: 4, zoneId: 2, availabilityStart: null, availabilityEnd: null }], existingZones: [{ zoneId: 1, availabilityStart: "10:00", availabilityEnd: "18:00", source: "override" }], existingSpaces: [{ spaceId: 4, zoneId: 2, availabilityStart: null, availabilityEnd: null, source: "override" }] };
  const batch = buildPlanSpatialAvailabilityInitializationBatch(input);
  assert.deepEqual(batch.zones.map((row) => row.zone_id), [2]); assert.deepEqual(batch.spaces.map((row) => row.space_id), [3]); assert.equal(batch.spaces[0].zone_id, 1);
  assert.deepEqual(batch, buildPlanSpatialAvailabilityInitializationBatch({ ...input, zones: [...input.zones].reverse(), spaces: [...input.spaces].reverse() }));
  const repeated = buildPlanSpatialAvailabilityInitializationBatch({ ...input, existingZones: [...input.existingZones, { zoneId: 2, availabilityStart: null, availabilityEnd: null, source: "default" }], existingSpaces: [...input.existingSpaces, { spaceId: 3, zoneId: 1, availabilityStart: "10:30", availabilityEnd: "17:30", source: "default" }] });
  assert.deepEqual(repeated, { zones: [], spaces: [] });
});

test("late initialization rejects missing space against existing daily zone rather than wider global zone", () => {
  assert.throws(() => buildPlanSpatialAvailabilityInitializationBatch({ planId: 7, workDay: { start: "09:00", end: "21:00" }, zones: [{ id: 1, availabilityStart: "09:00", availabilityEnd: "20:00" }], spaces: [{ id: 3, zoneId: 1, availabilityStart: "09:30", availabilityEnd: "19:00" }], existingZones: [{ zoneId: 1, availabilityStart: "10:00", availabilityEnd: "18:00", source: "override" }], existingSpaces: [] }), /SPACE_OUTSIDE_ZONE: space 3, zone 1/);
});
