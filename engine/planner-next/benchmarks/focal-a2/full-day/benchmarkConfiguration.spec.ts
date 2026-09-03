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
    "reality-unit-a": "inherits_day_unless_overridden",
    "reality-unit-b": "inherits_day_unless_overridden",
    "reality-unit-combined": "inherits_day_unless_overridden",
  });
  assert.equal(config.provenance.itinerantUnitAvailability, "SPEC-08.v1.1");
  assert.deepEqual(config.unresolvedCreationInputs, []);
  assert.deepEqual(config.participantAvailability.C01, { start: "09:00", end: "15:30" });
  assert.equal(config.participantAvailability.C19.end, "18:40");
  assert.equal(config.transportPolicy.arrival.minGapMinutes, 30);
  assert.deepEqual(config.transportPolicy.arrival, { targetGroupSize: 3, maximumGroupSize: 6, minGapMinutes: 30, groupingWeight: 3 });
  assert.deepEqual(config.transportPolicy.departure, { targetGroupSize: 1, maximumGroupSize: 6, minGapMinutes: 20, groupingWeight: 3 });
  assert.equal(config.meals.operational.realityDurationMinutes, 75);
  assert.deepEqual(createCanonicalFullA2Template().requiredCreationInputs, config.unresolvedCreationInputs);
});

test("A2 camera authority and vocal block policy preserve the clarified domain", () => {
  const template = createCanonicalFullA2Template();
  assert.deepEqual(template.spaceResourceAssignments, {
    "p14-recursos": ["cam-4"], "p14-pasillo": ["cam-4"],
    "p15-croma": ["cam-2"], "p15-estrellas-sillon": ["cam-2"],
    "totales-1": ["cam-5"], "totales-coreo": ["cam-6"],
  });
  assert.equal(template.spaceResourceAssignments["p14-giratuto"], undefined);
  assert.equal(template.rules.mainFlow.blockLimit, "UNBOUNDED");
  assert.equal("maxBlocksPerCoach" in template.rules.mainFlow, false);
  assert.ok(template.resources.some(({ id }) => id === "cam-5"));
  assert.ok(template.resources.some(({ id }) => id === "cam-6"));
});

test("A2 resolved source configuration contains no human schedule ordering or task timing", () => {
  const serialized = JSON.stringify(A2_BENCHMARK_SOURCE_CONFIGURATION);
  for (const forbidden of [
    "referenceOrder", "startPlanned", "endPlanned", "17:15", "18:35",
    "11:00", "11:15", "13:30", "14:00", "16:00", "18:00", "SPEC08_FOCAL_A2_SECTION_24",
    "Cristina", "Julio", "José Javier",
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});
