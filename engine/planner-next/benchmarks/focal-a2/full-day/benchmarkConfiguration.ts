export const A2_BENCHMARK_SOURCE_CONFIGURATION = Object.freeze({
  version: "A2-FULL-007.source-configuration.v2" as const,
  executionDate: "2025-06-15" as const,
  effectiveDayWindow: Object.freeze({
    start: "09:00" as const,
    end: "21:00" as const,
    source: "PRD_DAY_SETUP_DEFAULT" as const,
  }),
  spaceAvailability: "INHERIT_CONTAINER_OR_DAY_UNLESS_OVERRIDDEN" as const,
  resourceAvailability: "INHERIT_DAY_UNLESS_OVERRIDDEN" as const,
  productiveIds: "DERIVE_FROM_CANONICAL_IDENTITIES" as const,
  itinerantUnitAvailability: Object.freeze({
    "reality-unit-a": Object.freeze({ start: "11:00" as const, end: "14:00" as const, source: "SPEC08_FOCAL_A2_SECTION_24" as const }),
    "reality-unit-b": Object.freeze({ start: "11:15" as const, end: "13:30" as const, source: "SPEC08_FOCAL_A2_SECTION_24" as const }),
    "reality-unit-combined": Object.freeze({ start: "16:00" as const, end: "18:00" as const, source: "SPEC08_FOCAL_A2_SECTION_24" as const }),
  }),
  participantAvailabilityDefault: Object.freeze({
    mode: "INHERIT_EFFECTIVE_DAY_WINDOW" as const,
    source: "A2_PRODUCTION_OWNER_2026_08_08" as const,
  }),
  scopedMealPolicyDefault: Object.freeze({
    scopeSelector: "PDF_SPACE_SCOPES_MARKED_CORTE_COMIDA" as const,
    durationMinutes: 75 as const,
    placement: "OPTIMIZE_WITHIN_EFFECTIVE_MEAL_WINDOW" as const,
    effectiveMealWindow: "INHERIT_EFFECTIVE_PLAN_MEAL_WINDOW" as const,
    humanScheduleMealTimesAreAuthoritative: false as const,
    source: "A2_PRODUCTION_OWNER_2026_08_08" as const,
  }),
  outTransportPolicyDefault: Object.freeze({
    minParticipantsPerGroup: 1 as const,
    groupingRequired: false as const,
    departureMinGapMinutes: "INHERIT_EFFECTIVE_TRANSPORT_CONFIGURATION" as const,
    source: "A2_PRODUCTION_OWNER_2026_08_08" as const,
  }),
  sourceDecisionDocument: "docs/source/ADDENDUM_A2_CONFIGURACION_OPERATIVA_2026-08-08.md" as const,
  // These gates stay fail-closed until the resolved source decisions are materially
  // projected into the canonical Full A2 contract. Capturing a decision in source
  // configuration is not enough to claim representability.
  unresolvedCreationInputs: Object.freeze([
    "daily_participant_availability",
    "scoped_meal_policies",
    "out_transport_policy",
  ] as const),
});

export type A2BenchmarkUnresolvedCreationInput =
  typeof A2_BENCHMARK_SOURCE_CONFIGURATION.unresolvedCreationInputs[number];
