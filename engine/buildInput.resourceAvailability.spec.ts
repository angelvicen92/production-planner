import assert from "node:assert/strict";
import test from "node:test";
import { projectPlanResourceItemsForEngineInput } from "./buildInput";

const base = { id: 2, resourceItemId: 20, typeId: 3, typeCode: "x", typeName: "X", name: "R", isAvailable: true };

test("SPEC10-007: projection preserves presence, values, identity and deterministic order", () => {
  const rows = Object.freeze([
    Object.freeze({ ...base, availabilityStart: null, availabilityEnd: null }),
    Object.freeze({ ...base, id: 1, availability_start: "09:00", availability_end: "17:00" }),
  ]);
  const before = structuredClone(rows);
  const result = projectPlanResourceItemsForEngineInput(rows);
  assert.deepEqual(result.map((row) => row.id), [1, 2]);
  assert.deepEqual([result[0].availabilityStart, result[0].availabilityEnd], ["09:00", "17:00"]);
  assert.deepEqual([result[1].availabilityStart, result[1].availabilityEnd], [null, null]);
  assert.deepEqual(rows, before);
});

test("SPEC10-007: camelCase wins and absent/partial/invalid values are not repaired", () => {
  const [camel, absent, partial, invalid, disabled] = projectPlanResourceItemsForEngineInput([
    { ...base, id: 1, availabilityStart: null, availabilityEnd: null, availability_start: "10:00", availability_end: "11:00" },
    { ...base, id: 2 },
    { ...base, id: 3, availabilityStart: "09:00" },
    { ...base, id: 4, availabilityStart: 42, availabilityEnd: false },
    { ...base, id: 5, isAvailable: false, availabilityStart: "10:00", availabilityEnd: "11:00" },
  ]);
  assert.deepEqual([camel.availabilityStart, camel.availabilityEnd], [null, null]);
  assert.equal(Object.prototype.hasOwnProperty.call(absent, "availabilityStart"), true);
  assert.equal(absent.availabilityStart, undefined); assert.equal(absent.availabilityEnd, undefined);
  assert.equal(partial.availabilityStart, "09:00"); assert.equal(partial.availabilityEnd, undefined);
  assert.equal(invalid.availabilityStart, 42 as never); assert.equal(invalid.availabilityEnd, false as never);
  assert.equal(disabled.isAvailable, false);
});

test("SPEC10-007: names and types do not interpret availability", () => {
  const a = projectPlanResourceItemsForEngineInput([{ ...base, availabilityStart: "09:00", availabilityEnd: "10:00" }])[0];
  const b = projectPlanResourceItemsForEngineInput([{ ...base, name: "other", typeName: "other", availabilityStart: "09:00", availabilityEnd: "10:00" }])[0];
  assert.deepEqual([a.availabilityStart, a.availabilityEnd], [b.availabilityStart, b.availabilityEnd]);
});
