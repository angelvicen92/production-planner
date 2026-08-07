import assert from "node:assert/strict";
import test from "node:test";
import { A2_BENCHMARK_SOURCE_CONFIGURATION } from "./benchmarkConfiguration";
import { createCanonicalFullA2Template } from "./manifest";

test("A2 source configuration resolves all creation decisions explicitly", () => {
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
  assert.deepEqual(config.participantAvailability, {
    start: "08:00", end: "19:00", appliesTo: "ALL_19_PARTICIPANTS", source: "PRODUCTION_DECISION_2026-08-08",
  });
  assert.deepEqual(config.itinerantUnitAvailability, {
    start: "08:00", end: "19:00", appliesTo: "ALL_ITINERANT_UNITS", source: "PRODUCTION_DECISION_2026-08-08",
  });
  assert.equal(config.scopedMealPolicies.mode, "SOURCE_SPACE_BREAKS_FLEXIBLE_WITHIN_GENERAL_MEAL_WINDOW");
  assert.equal(config.outTransportPolicy.minimumParticipantsPerGroup, 1);
  assert.deepEqual(config.unresolvedCreationInputs, []);
  assert.deepEqual(createCanonicalFullA2Template().requiredCreationInputs, []);
});

test("A2 resolved source configuration contains no human schedule ordering or task timing", () => {
  const serialized = JSON.stringify(A2_BENCHMARK_SOURCE_CONFIGURATION);
  for (const forbidden of [
    "referenceOrder", "startPlanned", "endPlanned", "11:15", "17:15", "18:35",
    "Cristina", "Julio", "José Javier",
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});
