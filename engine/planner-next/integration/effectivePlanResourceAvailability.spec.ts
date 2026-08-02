import assert from "node:assert/strict";
import test from "node:test";
import type { PlanResourceItemInput, TimeWindow } from "../../types";
import { resolveEffectivePlanResourceAvailability as resolve } from "./effectivePlanResourceAvailability";

const day: TimeWindow = { start: "08:30", end: "18:30" };
const resource = (overrides: Partial<PlanResourceItemInput> = {}): PlanResourceItemInput => ({ id: 7, resourceItemId: 70, typeId: 1, name: "ignored", isAvailable: true, availabilityStart: null, availabilityEnd: null, ...overrides });

test("SPEC10-007: full day and exact intersections", () => {
  assert.deepEqual(resolve(day, resource()), { status: "AVAILABLE", planResourceItemId: 7, sourceMode: "FULL_WORKDAY", rawStart: null, rawEnd: null, effectiveWindow: day });
  for (const [start, end, expected] of [
    ["09:00", "17:00", { start: "09:00", end: "17:00" }], ["07:00", "14:00", { start: "08:30", end: "14:00" }],
    ["12:00", "20:00", { start: "12:00", end: "18:30" }], ["07:00", "20:00", day], ["08:30", "18:30", day],
  ] as const) assert.deepEqual(resolve(day, resource({ availabilityStart: start, availabilityEnd: end })).effectiveWindow, expected);
});

test("SPEC10-007: empty intersections and disabled resources", () => {
  for (const [start, end] of [["06:00", "08:00"], ["19:00", "20:00"], ["07:00", "08:30"]]) {
    assert.equal((resolve(day, resource({ availabilityStart: start, availabilityEnd: end })) as any).reason, "EMPTY_WORKDAY_INTERSECTION");
  }
  assert.equal((resolve(day, resource({ isAvailable: false })) as any).reason, "RESOURCE_DISABLED");
});

test("SPEC10-007: invalid contracts follow deterministic precedence", () => {
  const cases: [TimeWindow, Partial<PlanResourceItemInput>, string][] = [
    [{ start: "18:00", end: "08:00" }, {}, "INVALID_WORKDAY"], [day, { availabilityStart: undefined, availabilityEnd: undefined }, "MISSING_SNAPSHOT_WINDOW"],
    [day, { availabilityStart: "09:00", availabilityEnd: undefined }, "PARTIAL_SNAPSHOT_WINDOW"], [day, { availabilityStart: null, availabilityEnd: "10:00" }, "MIXED_NULL_AND_STRING"],
    [day, { availabilityStart: "9:00", availabilityEnd: "10:00" }, "INVALID_TIME_FORMAT"], [day, { availabilityStart: "24:00", availabilityEnd: "25:00" }, "INVALID_TIME_FORMAT"],
    [day, { availabilityStart: "10:00", availabilityEnd: "10:00" }, "INVALID_TIME_ORDER"], [day, { availabilityStart: "20:00", availabilityEnd: "08:00" }, "INVALID_TIME_ORDER"],
  ];
  for (const [workDay, overrides, reason] of cases) assert.equal((resolve(workDay, resource(overrides)) as any).reason, reason);
});

test("SPEC10-007: pure, deterministic and deeply frozen", () => {
  const input = Object.freeze(resource({ name: "camera", typeName: "type", availabilityStart: "07:00", availabilityEnd: "14:00" }));
  const before = structuredClone(input); const first = resolve(day, input); const second = resolve(day, { ...input, name: "coach", typeName: "other" });
  assert.deepEqual(input, before); assert.deepEqual(first, second); assert.ok(Object.isFrozen(first));
  assert.ok(first.effectiveWindow && Object.isFrozen(first.effectiveWindow));
});

test("SPEC10-007: partial end, string/null and end contact retain exact causes", () => {
  assert.equal((resolve(day, resource({ availabilityStart: undefined, availabilityEnd: "10:00" })) as any).reason, "PARTIAL_SNAPSHOT_WINDOW");
  assert.equal((resolve(day, resource({ availabilityStart: "09:00", availabilityEnd: null })) as any).reason, "MIXED_NULL_AND_STRING");
  assert.equal((resolve(day, resource({ availabilityStart: "18:30", availabilityEnd: "19:00" })) as any).reason, "EMPTY_WORKDAY_INTERSECTION");
});

test("SPEC10-007: invalid workdays and invalid snapshot precede disabled flag", () => {
  assert.equal((resolve({ start: "8:30", end: "18:30" }, resource()) as any).reason, "INVALID_WORKDAY");
  assert.equal((resolve({ start: "08:30", end: "08:30" }, resource()) as any).reason, "INVALID_WORKDAY");
  const disabledInvalid = resolve(day, resource({ isAvailable: false, availabilityStart: "bad", availabilityEnd: "10:00" }));
  assert.equal((disabledInvalid as any).reason, "INVALID_TIME_FORMAT");
});

test("SPEC10-007: runtime values are rejected without coercion", () => {
  for (const value of [42, { time: "09:00" }, ["09:00"]]) {
    const result = resolve(day, resource({ availabilityStart: value as never, availabilityEnd: "10:00" }));
    assert.equal((result as any).reason, "INVALID_TIME_FORMAT");
    assert.ok(Object.isFrozen(result));
  }
});

test("SPEC10-007: frozen inputs produce deeply frozen unavailable and invalid outputs", () => {
  const frozenDay = Object.freeze({ ...day });
  const frozenResource = Object.freeze(resource({ isAvailable: false }));
  const unavailable = resolve(frozenDay, frozenResource);
  const invalid = resolve(frozenDay, Object.freeze(resource({ availabilityStart: "bad", availabilityEnd: "10:00" })));
  assert.ok(Object.isFrozen(unavailable)); assert.ok(Object.isFrozen(invalid));
  assert.deepEqual(frozenDay, day); assert.equal(frozenResource.isAvailable, false);
});
