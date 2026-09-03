export const A2_BENCHMARK_SOURCE_CONFIGURATION = Object.freeze({
  version: "A2-FULL-009.source-configuration.v1" as const,
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
    "reality-unit-a": "inherits_day_unless_overridden" as const,
    "reality-unit-b": "inherits_day_unless_overridden" as const,
    "reality-unit-combined": "inherits_day_unless_overridden" as const,
  }),
  participantAvailability: Object.freeze(Object.fromEntries(Array.from({ length: 19 }, (_, index) => {
    const id = `C${String(index + 1).padStart(2, "0")}`;
    return [id, Object.freeze({ start: "09:00" as const, end: index === 0 ? "15:30" as const : "18:40" as const })];
  }))),
  transportPolicy: Object.freeze({
    arrival: Object.freeze({ targetGroupSize: 3 as const, maximumGroupSize: 6 as const, minGapMinutes: 35 as const, groupingWeight: 3 as const }),
    departure: Object.freeze({ targetGroupSize: 1 as const, maximumGroupSize: 6 as const, minGapMinutes: 20 as const, groupingWeight: 3 as const }),
  }),
  meals: Object.freeze({
    effectiveWindow: Object.freeze({ start: "13:00" as const, end: "16:30" as const }),
    operational: Object.freeze({ defaultDurationMinutes: 75 as const, realityDurationMinutes: 75 as const, flexible: true as const, followsAssignedResourcesAcrossRecomposition: true as const, fixedHumanCutIntervals: Object.freeze([] as const), legacyItinerantMealBreakMinutesAuthoritative: false as const }),
    participant: Object.freeze({ sodexoDurationMinutes: 40 as const, maxSimultaneous: 10 as const, independentFromOperationalMeal: true as const }),
  }),
  provenance: Object.freeze({
    itinerantUnitAvailability: "SPEC-08.v1.1" as const,
    participantAvailability: "A2-FULL-008-effective-configuration-probe" as const,
    transportPolicy: "A2-FULL-008-effective-configuration-probe+ADDENDUM_OFICIAL_SEMANTICA_AGRUPACION_TRANSPORTE_2026-08-08+SPEC-11" as const,
    meals: "ADDENDUM_A2_DESCANSOS_OPERATIVOS_Y_COMIDAS_2026-08-08+A2-FULL-008+SPEC-07/08/11" as const,
  }),
  unresolvedCreationInputs: Object.freeze([] as const),
});

export type A2BenchmarkUnresolvedCreationInput =
  typeof A2_BENCHMARK_SOURCE_CONFIGURATION.unresolvedCreationInputs[number];
