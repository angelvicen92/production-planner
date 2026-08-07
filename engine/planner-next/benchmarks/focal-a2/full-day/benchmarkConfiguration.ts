export const A2_BENCHMARK_SOURCE_CONFIGURATION = Object.freeze({
  version: "A2-FULL-005.source-configuration.v1" as const,
  executionDate: "2025-06-15" as const,
  effectiveDayWindow: Object.freeze({
    start: "09:00" as const,
    end: "21:00" as const,
    source: "PRD_DAY_SETUP_DEFAULT" as const,
  }),
  spaceAvailability: "INHERIT_CONTAINER_OR_DAY_UNLESS_OVERRIDDEN" as const,
  resourceAvailability: "INHERIT_DAY_UNLESS_OVERRIDDEN" as const,
  productiveIds: "DERIVE_FROM_CANONICAL_IDENTITIES" as const,
  participantAvailability: Object.freeze({
    start: "08:00" as const,
    end: "19:00" as const,
    appliesTo: "ALL_19_PARTICIPANTS" as const,
    source: "PRODUCTION_DECISION_2026-08-08" as const,
  }),
  itinerantUnitAvailability: Object.freeze({
    start: "08:00" as const,
    end: "19:00" as const,
    appliesTo: "ALL_ITINERANT_UNITS" as const,
    source: "PRODUCTION_DECISION_2026-08-08" as const,
  }),
  scopedMealPolicies: Object.freeze({
    mode: "SOURCE_SPACE_BREAKS_FLEXIBLE_WITHIN_GENERAL_MEAL_WINDOW" as const,
    source: "SOURCE_PDF_CONFIRMED_BY_PRODUCTION_2026-08-08" as const,
    note: "Los cuadros de descanso para comer pertenecen a cada espacio; el inicio no se copia del planning humano y se elige donde sea viable dentro de la ventana general de comidas." as const,
  }),
  outTransportPolicy: Object.freeze({
    minimumParticipantsPerGroup: 1 as const,
    source: "PRODUCTION_DEFAULT_2026-08-08" as const,
  }),
  unresolvedCreationInputs: Object.freeze([] as const),
});

export type A2BenchmarkUnresolvedCreationInput =
  typeof A2_BENCHMARK_SOURCE_CONFIGURATION.unresolvedCreationInputs[number];
