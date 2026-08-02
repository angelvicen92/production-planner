import assert from "node:assert/strict";
import test from "node:test";
import { availabilityWindowUpdateSchema, defaultWorkdayUpdateSchema } from "./routes";

test("availability update accepts omission, inheritance and explicit windows", () => {
  assert.deepEqual(availabilityWindowUpdateSchema.parse({}), {});
  assert.deepEqual(availabilityWindowUpdateSchema.parse({ availabilityStart: null, availabilityEnd: null }), { availabilityStart: null, availabilityEnd: null });
  assert.deepEqual(availabilityWindowUpdateSchema.parse({ availabilityStart: "09:00", availabilityEnd: "21:00" }), { availabilityStart: "09:00", availabilityEnd: "21:00" });
});
test("availability update rejects partial, mixed, invalid, ordered and extra properties", () => {
  for (const value of [{ availabilityStart: "09:00" }, { availabilityStart: null, availabilityEnd: "21:00" }, { availabilityStart: "9:00", availabilityEnd: "21:00" }, { availabilityStart: "21:00", availabilityEnd: "09:00" }, { extra: true }]) assert.equal(availabilityWindowUpdateSchema.safeParse(value).success, false);
});
test("default workday contract requires a complete canonical ordered pair", () => {
  assert.equal(defaultWorkdayUpdateSchema.safeParse({ defaultWorkStart: "09:00", defaultWorkEnd: "21:00" }).success, true);
  for (const value of [{ defaultWorkStart: "09:00" }, { defaultWorkStart: "9:00", defaultWorkEnd: "21:00" }, { defaultWorkStart: "21:00", defaultWorkEnd: "09:00" }, { extra: true }]) assert.equal(defaultWorkdayUpdateSchema.safeParse(value).success, false);
});
