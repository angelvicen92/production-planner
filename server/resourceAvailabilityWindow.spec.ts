import assert from "node:assert/strict";
import test from "node:test";
import {
  ResourceAvailabilityWindowError,
  buildAdHocPlanResourceItemRow,
  buildAvailabilityWindowPatch,
  buildDefaultPlanResourceItemSnapshotRows,
  mapGlobalAvailabilityDefaultToSnapshot,
  normalizeResourceAvailabilityWindow,
} from "./resourceAvailabilityWindow";

test("missing fields and a null pair mean the full workday", () => {
  assert.deepEqual(normalizeResourceAvailabilityWindow({}), {
    mode: "FULL_WORKDAY", start: null, end: null,
  });
  assert.deepEqual(normalizeResourceAvailabilityWindow({ start: null, end: null }), {
    mode: "FULL_WORKDAY", start: null, end: null,
  });
});

test("valid explicit windows remain exact, including 00:00-23:59", () => {
  assert.deepEqual(normalizeResourceAvailabilityWindow({ start: "08:30", end: "17:45" }), {
    mode: "EXPLICIT", start: "08:30", end: "17:45",
  });
  assert.deepEqual(normalizeResourceAvailabilityWindow({ start: "00:00", end: "23:59" }), {
    mode: "EXPLICIT", start: "00:00", end: "23:59",
  });
});

test("partial pairs are rejected with a typed error", () => {
  for (const input of [
    { start: "08:00" },
    { end: "17:00" },
    { start: "08:00", end: null },
    { start: null, end: "17:00" },
  ]) {
    assert.throws(() => normalizeResourceAvailabilityWindow(input), ResourceAvailabilityWindowError);
  }
});

test("empty, non-canonical, and out-of-range times are rejected", () => {
  const invalid = [
    ["", "17:00"],
    ["8:00", "17:00"],
    ["08:0", "17:00"],
    ["24:00", "25:00"],
    ["08:60", "17:00"],
    ["08:00:00", "17:00"],
  ];
  for (const [start, end] of invalid) {
    assert.throws(
      () => normalizeResourceAvailabilityWindow({ start, end }),
      ResourceAvailabilityWindowError,
    );
  }
});

test("zero duration, inverted windows, and midnight crossing are rejected", () => {
  for (const input of [
    { start: "08:00", end: "08:00" },
    { start: "17:00", end: "08:00" },
    { start: "22:00", end: "02:00" },
  ]) {
    assert.throws(() => normalizeResourceAvailabilityWindow(input), ResourceAvailabilityWindowError);
  }
});

test("numbers, objects, arrays, and invalid containers are never coerced", () => {
  const values: unknown[] = [8, {}, [], ["08:00"]];
  for (const value of values) {
    assert.throws(
      () => normalizeResourceAvailabilityWindow({ start: value as string, end: "17:00" }),
      ResourceAvailabilityWindowError,
    );
  }
  for (const input of [null, [], 2]) {
    assert.throws(
      () => normalizeResourceAvailabilityWindow(input as never),
      ResourceAvailabilityWindowError,
    );
  }
});

test("normalization is pure and its output is frozen", () => {
  const input = Object.freeze({ start: "08:00", end: "17:00" });
  const before = { ...input };
  const output = normalizeResourceAvailabilityWindow(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(output), true);
  assert.notEqual(output, input);
});

test("global defaults map to an independent frozen snapshot", () => {
  const global = { defaultAvailabilityStart: "09:00", defaultAvailabilityEnd: "18:00" };
  const snapshot = mapGlobalAvailabilityDefaultToSnapshot(global);
  global.defaultAvailabilityStart = "10:00";
  global.defaultAvailabilityEnd = "16:00";
  assert.deepEqual(snapshot, { availabilityStart: "09:00", availabilityEnd: "18:00" });
  assert.equal(Object.isFrozen(snapshot), true);
});

test("a null global default preserves nulls in the snapshot", () => {
  assert.deepEqual(mapGlobalAvailabilityDefaultToSnapshot({
    defaultAvailabilityStart: null,
    defaultAvailabilityEnd: null,
  }), { availabilityStart: null, availabilityEnd: null });
});

test("default snapshot rows copy explicit and null defaults without later synchronization", () => {
  const items = [
    { id: 1, typeId: 2, name: "A", defaultAvailabilityStart: "08:00", defaultAvailabilityEnd: "12:00" },
    { id: 3, typeId: 2, name: "B", defaultAvailabilityStart: null, defaultAvailabilityEnd: null },
  ];
  const rows = buildDefaultPlanResourceItemSnapshotRows(7, items);
  items[0].defaultAvailabilityStart = "09:00";
  assert.equal(rows[0].availability_start, "08:00");
  assert.equal(rows[0].availability_end, "12:00");
  assert.equal(rows[1].availability_start, null);
  assert.equal(rows[1].availability_end, null);
  assert.equal(Object.isFrozen(rows), true);
  assert.equal(rows.every(Object.isFrozen), true);
});

test("an invalid global row prevents construction of any snapshot row array", () => {
  assert.throws(() => buildDefaultPlanResourceItemSnapshotRows(7, [
    { id: 1, typeId: 2, name: "valid", defaultAvailabilityStart: "08:00", defaultAvailabilityEnd: "12:00" },
    { id: 2, typeId: 2, name: "invalid", defaultAvailabilityStart: "13:00", defaultAvailabilityEnd: null },
  ]), ResourceAvailabilityWindowError);
});

test("ad hoc rows use full-workday nulls by default and preserve valid explicit windows", () => {
  const fullDay = buildAdHocPlanResourceItemRow({ planId: 4, typeId: 2, name: "A" });
  assert.equal(fullDay.availability_start, null);
  assert.equal(fullDay.availability_end, null);
  const explicit = buildAdHocPlanResourceItemRow({
    planId: 4, typeId: 2, name: "B", availability: { start: "11:00", end: "15:00" },
  });
  assert.equal(explicit.availability_start, "11:00");
  assert.equal(explicit.availability_end, "15:00");
});

test("invalid ad hoc and override pairs fail before producing a persistence row", () => {
  assert.throws(() => buildAdHocPlanResourceItemRow({
    planId: 4, typeId: 2, name: "A", availability: { start: "11:00" },
  }), ResourceAvailabilityWindowError);
  assert.throws(() => buildAvailabilityWindowPatch({ start: "18:00", end: "12:00" }), ResourceAvailabilityWindowError);
});

test("availability-only patches do not contain or erase is_available", () => {
  const stored = { is_available: false, availability_start: "08:00", availability_end: "12:00" };
  const patch = buildAvailabilityWindowPatch({ start: "09:00", end: "11:00" });
  const updated = { ...stored, ...patch };
  assert.equal(updated.is_available, false);
  assert.equal(updated.availability_start, "09:00");
  assert.equal(updated.availability_end, "11:00");
  assert.equal(Object.isFrozen(patch), true);
});
