import assert from "node:assert/strict";
import test from "node:test";
import { A2_BENCHMARK_SOURCE_CONFIGURATION } from "./benchmarkConfiguration";
import { createCanonicalFullA2Template } from "./manifest";

test("A2 source configuration captures owner defaults while canonical projection remains fail-closed", () => {
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
  assert.deepEqual(config.participantAvailabilityDefault, {
    mode: "INHERIT_EFFECTIVE_DAY_WINDOW",
    source: "A2_PRODUCTION_OWNER_2026_08_08",
  });
  assert.deepEqual(config.scopedMealPolicyDefault, {
    scopeSelector: "PDF_SPACE_SCOPES_MARKED_CORTE_COMIDA",
    durationMinutes: 75,
    placement: "OPTIMIZE_WITHIN_EFFECTIVE_MEAL_WINDOW",
    effectiveMealWindow: "INHERIT_EFFECTIVE_PLAN_MEAL_WINDOW",
    humanScheduleMealTimesAreAuthoritative: false,
    source: "A2_PRODUCTION_OWNER_2026_08_08",
  });
  assert.deepEqual(config.outTransportPolicyDefault, {
    minParticipantsPerGroup: 1,
    groupingRequired: false,
    departureMinGapMinutes: "INHERIT_EFFECTIVE_TRANSPORT_CONFIGURATION",
    source: "A2_PRODUCTION_OWNER_2026_08_08",
  });
  assert.equal(config.sourceDecisionDocument, "docs/source/ADDENDUM_A2_CONFIGURACION_OPERATIVA_2026-08-08.md");

  // Capturing source decisions must not silently clear representability. The next
  // iteration has to project them into the canonical Full A2 contract first.
  assert.deepEqual(config.unresolvedCreationInputs, [
    "daily_participant_availability",
    "scoped_meal_policies",
    "out_transport_policy",
  ]);
  assert.deepEqual(createCanonicalFullA2Template().requiredCreationInputs, config.unresolvedCreationInputs);
});

test("A2 resolved source configuration contains no human schedule ordering or task timing", () => {
  const serialized = JSON.stringify(A2_BENCHMARK_SOURCE_CONFIGURATION);
  for (const forbidden of [
    "referenceOrder", "startPlanned", "endPlanned", "17:15", "18:35",
    "Cristina", "Julio", "José Javier",
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});
