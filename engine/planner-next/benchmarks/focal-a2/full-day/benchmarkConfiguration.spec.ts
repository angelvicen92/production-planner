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
  assert.deepEqual(config.unresolvedCreationInputs, []);
  assert.deepEqual(config.participantAvailability.C01, { start: "09:00", end: "15:30" });
  assert.equal(config.participantAvailability.C19.end, "18:40");
  assert.equal(config.transportPolicy.arrival.minGapMinutes, 35);
  assert.equal(config.transportPolicy.departure.groupingTarget, 3);
  assert.equal("minParticipantsPerGroup" in config.transportPolicy.departure, false);
  assert.equal(config.meals.operational.realityDurationMinutes, 75);
  assert.deepEqual(createCanonicalFullA2Template().requiredCreationInputs, config.unresolvedCreationInputs);
});

test("A2 resolved source configuration contains no human schedule ordering or task timing", () => {
  const serialized = JSON.stringify(A2_BENCHMARK_SOURCE_CONFIGURATION);
  for (const forbidden of [
    "referenceOrder", "startPlanned", "endPlanned", "17:15", "18:35",
    "Cristina", "Julio", "José Javier",
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});
