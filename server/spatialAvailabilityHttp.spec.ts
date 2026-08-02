import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { executeSpatialAvailabilityAction, parsePositiveIntegerRouteId, parseSpatialRequestBody, SpatialEntityNotFoundError } from "./spatialAvailabilityHttp";
import { SpatialAvailabilityValidationError } from "./spatialAvailabilityErrors";

test("malformed route IDs are 400 before storage", async () => {
  for (const value of [undefined, "", "abc", "1.5", "0", "-1"]) {
    let called = false;
    const result = await executeSpatialAvailabilityAction(async () => { const id = parsePositiveIntegerRouteId(value, "plan id"); called = true; return id; });
    assert.equal(result.status, 400); assert.equal(called, false);
  }
});
test("invalid shared-schema body is 400", async () => {
  const schema = z.object({ value: z.string() }).strict();
  const result = await executeSpatialAvailabilityAction(async () => parseSpatialRequestBody(schema, { value: 1 }));
  assert.equal(result.status, 400);
});
test("missing or inaccessible plan, zone and space are 404", async () => {
  for (const error of [new SpatialEntityNotFoundError(), { code: "PGRST116" }, { code: "42501" }]) {
    const result = await executeSpatialAvailabilityAction(async () => { throw error; });
    assert.deepEqual(result, { status: 404, body: { message: "Not found" } });
  }
});
test("unexpected storage failure is sanitized as 500", async () => {
  const result = await executeSpatialAvailabilityAction(async () => { throw new Error("password SQL stack"); });
  assert.deepEqual(result, { status: 500, body: { message: "Internal Server Error" } });
});
test("typed spatial domain conflicts are safe 400 responses", async () => {
  for (const reason of ["ZONE_OUTSIDE_WORKDAY", "SPACE_OUTSIDE_ZONE", "INVALID_WORKDAY", "SPACE_ZONE_NOT_FOUND", "WORKDAY_REQUEST_PARTIAL"] as const) {
    const result = await executeSpatialAvailabilityAction(async () => { throw new SpatialAvailabilityValidationError(reason, `${reason}: internal ids`); });
    assert.deepEqual(result, { status: 400, body: { message: reason } });
  }
});
test("valid empty lists and successful responses remain 200", async () => {
  assert.deepEqual(await executeSpatialAvailabilityAction(async () => []), { status: 200, body: [] });
  assert.deepEqual(await executeSpatialAvailabilityAction(async () => ({ id: 1 })), { status: 200, body: { id: 1 } });
});
