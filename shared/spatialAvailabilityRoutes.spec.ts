import assert from "node:assert/strict";
import test from "node:test";
import { api, availabilityWindowUpdateSchema, defaultWorkdayUpdateSchema, planSpaceAvailabilityResponseSchema, planZoneAvailabilityResponseSchema, spatialAvailabilityInitializationResponseSchema } from "./routes";

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

test("availability routes live in the correct namespaces with non-swapped paths", () => {
  assert.equal(api.zones.availability.path, "/api/zones/:id/default-availability");
  assert.equal(api.spaces.availability.path, "/api/spaces/:id/default-availability");
  assert.equal("availability" in api.optimizerSettings, false);
  assert.ok(api.plans.spatialAvailability.listZones.responses[200]);
  assert.ok(api.plans.spatialAvailability.listSpaces.responses[200]);
});

test("daily response contracts preserve complete camelCase zone and space snapshots", () => {
  const zone = { id: 1, planId: 2, zoneId: 3, availabilityStart: null, availabilityEnd: null, source: "default", createdAt: "2026-08-02T00:00:00Z", updatedAt: "2026-08-02T00:00:00Z" };
  const space = { id: 4, planId: 2, spaceId: 5, zoneId: 3, availabilityStart: "10:00", availabilityEnd: "18:00", source: "override", createdAt: "2026-08-02T00:00:00Z", updatedAt: "2026-08-02T00:00:00Z" };
  assert.deepEqual(planZoneAvailabilityResponseSchema.parse(zone), zone);
  assert.deepEqual(planSpaceAvailabilityResponseSchema.parse(space), space);
  assert.equal(planZoneAvailabilityResponseSchema.safeParse({ ...zone, source: undefined }).success, false);
  assert.equal(planSpaceAvailabilityResponseSchema.safeParse({ ...space, zoneId: undefined }).success, false);
  assert.equal(planSpaceAvailabilityResponseSchema.safeParse({ ...space, extra: true }).success, false);
});

test("initialization response accepts only non-negative integer counts", () => {
  assert.deepEqual(spatialAvailabilityInitializationResponseSchema.parse({ zonesCreated: 0, spacesCreated: 2 }), { zonesCreated: 0, spacesCreated: 2 });
  assert.equal(spatialAvailabilityInitializationResponseSchema.safeParse({ zonesCreated: -1, spacesCreated: 0 }).success, false);
});
