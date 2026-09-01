import assert from "node:assert/strict";
import test from "node:test";
import { A2_BENCHMARK_SOURCE_CONFIGURATION } from "./benchmarkConfiguration";
import { createCanonicalFullA2Template } from "./manifest";

test("A2 source configuration materializes all effective source decisions", () => {
  const config = A2_BENCHMARK_SOURCE_CONFIGURATION;
  assert.equal(config.executionDate, "2025-06-15");
  assert.deepEqual(config.effectiveDayWindow, {
    start: "09:00",
    end: "21:00",
    source: "PRD_DAY_SETUP_DEFAULT",
  });
  assert.equal(config.spaceAvailability, "INHERIT_CONTAINER_OR_DAY_UNLESS_OVERRIDDEN");
  assert.equal(config.resourceAvailability, "INHERIT_DAY_UNLESS_OVERRIDDEN");
  assert.equal(config.productiveIds, "DERIVE_FROM_CANONICAL_IDENTITIES");
  assert.deepEqual(config.itinerantUnitAvailability, {
    "reality-unit-a": { start: "11:00", end: "14:00", source: "SPEC08_FOCAL_A2_SECTION_24" },
    "reality-unit-b": { start: "11:15", end: "13:30", source: "SPEC08_FOCAL_A2_SECTION_24" },
    "reality-unit-combined": { start: "16:00", end: "18:00", source: "SPEC08_FOCAL_A2_SECTION_24" },
  });
  assert.deepEqual(config.unresolvedCreationInputs, [
    "band_resource_availability",
    "band_authorized_meal",
    "band_presence_concentration_policy",
  ]);
  assert.equal(config.resourceTransitionMinutes, 5);
  assert.equal(Object.keys(config.requiresBand).length, 19);
  assert.equal(Object.values(config.requiresBand).filter(Boolean).length, 13);
  assert.deepEqual(config.participantAvailability.C01, { start: "09:00", end: "15:30" });
  assert.equal(config.participantAvailability.C19.end, "18:40");
  assert.equal(config.transportPolicy.arrival.minGapMinutes, 35);
  assert.deepEqual(config.transportPolicy.arrival, { targetGroupSize: 3, maximumGroupSize: 6, minGapMinutes: 35, groupingWeight: 3 });
  assert.deepEqual(config.transportPolicy.departure, { targetGroupSize: 1, maximumGroupSize: 6, minGapMinutes: 20, groupingWeight: 3 });
  assert.equal(config.meals.operational.realityDurationMinutes, 75);
  assert.deepEqual(createCanonicalFullA2Template().requiredCreationInputs, config.unresolvedCreationInputs);
});

test("A2 requiresBand decisions are explicit participant configuration", () => {
  const expected = {
    C01: true, C02: false, C03: false, C04: true, C05: false,
    C06: false, C07: true, C08: true, C09: true, C10: true,
    C11: true, C12: false, C13: true, C14: true, C15: true,
    C16: true, C17: true, C18: true, C19: false,
  };
  assert.deepEqual(A2_BENCHMARK_SOURCE_CONFIGURATION.requiresBand, expected);
  assert.equal(JSON.stringify(expected).toLowerCase().includes("instrument"), false);
});

test("A2 resolved source configuration contains no human schedule ordering or task timing", () => {
  const serialized = JSON.stringify(A2_BENCHMARK_SOURCE_CONFIGURATION);
  for (const forbidden of [
    "referenceOrder", "startPlanned", "endPlanned", "17:15", "18:35",
    "Cristina", "Julio", "José Javier",
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});
