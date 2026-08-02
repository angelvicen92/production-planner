import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
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

test("SPEC10-007: snake_case preserves identities, flags and null snapshot", () => {
  const [result] = projectPlanResourceItemsForEngineInput([Object.freeze({
    id: 8, resource_item_id: 80, type_id: 4, type_code: "camera", type_name: "Camera",
    name: "C", is_available: false, availability_start: null, availability_end: null,
  })]);
  assert.deepEqual(result, { id: 8, resourceItemId: 80, typeId: 4, typeCode: "camera", typeName: "Camera", category: undefined,
    name: "C", isAvailable: false, availabilityStart: null, availabilityEnd: null });
});

test("SPEC10-007: present camelCase undefined wins over valid snake_case", () => {
  const [result] = projectPlanResourceItemsForEngineInput([{ ...base,
    availabilityStart: undefined, availabilityEnd: undefined,
    availability_start: "09:00", availability_end: "17:00",
  }]);
  assert.equal(result.availabilityStart, undefined);
  assert.equal(result.availabilityEnd, undefined);
});

test("SPEC10-007: frozen rows stay deeply immutable and order is stable", () => {
  const nested = Object.freeze({ note: "unchanged" });
  const rows = Object.freeze([
    Object.freeze({ ...base, id: 4, availabilityStart: "10:00", availabilityEnd: "11:00", nested }),
    Object.freeze({ ...base, id: 2, availabilityStart: "08:00", availabilityEnd: "09:00", nested }),
  ]);
  const before = structuredClone(rows);
  const normal = projectPlanResourceItemsForEngineInput(rows);
  const reversed = projectPlanResourceItemsForEngineInput([...rows].reverse());
  assert.deepEqual(normal, reversed);
  assert.deepEqual(rows, before);
  assert.deepEqual(nested, { note: "unchanged" });
});

test("SPEC10-007: build projection never reads the global availability table", () => {
  const source = readFileSync(new URL("./buildInput.ts", import.meta.url), "utf8");
  assert.equal(source.includes("resource_availability"), false);
});
