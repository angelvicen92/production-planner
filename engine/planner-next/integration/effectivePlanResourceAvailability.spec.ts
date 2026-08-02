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
