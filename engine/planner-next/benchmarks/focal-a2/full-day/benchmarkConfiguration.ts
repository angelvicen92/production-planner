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
  itinerantUnitAvailability: Object.freeze({
    "reality-unit-a": Object.freeze({ start: "11:00" as const, end: "14:00" as const, source: "SPEC08_FOCAL_A2_SECTION_24" as const }),
    "reality-unit-b": Object.freeze({ start: "11:15" as const, end: "13:30" as const, source: "SPEC08_FOCAL_A2_SECTION_24" as const }),
    "reality-unit-combined": Object.freeze({ start: "16:00" as const, end: "18:00" as const, source: "SPEC08_FOCAL_A2_SECTION_24" as const }),
  }),
  unresolvedCreationInputs: Object.freeze([
    "daily_participant_availability",
    "scoped_meal_policies",
    "out_transport_policy",
  ] as const),
});

export type A2BenchmarkUnresolvedCreationInput =
  typeof A2_BENCHMARK_SOURCE_CONFIGURATION.unresolvedCreationInputs[number];
