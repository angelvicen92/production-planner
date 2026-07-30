import type { AuxiliaryPolicy, Window } from "../../contracts";

export const focalA2RealityAuxiliaryPolicy: AuxiliaryPolicy = {
  participantPresencePreference: "OFF",
};

export const focalA2RealityParticipantAvailabilityOverrides: Record<string, Window[]> = {
  "lina-isabel-garcia-salcedo": [{ start: 570, end: 1035 }, { start: 1035, end: 1080 }],
  "marta-fonrali": [{ start: 670, end: 1035 }, { start: 1035, end: 1080 }],
  "linet-varela": [{ start: 600, end: 1035 }, { start: 1035, end: 1080 }],
  "carmen-maria-saborido": [{ start: 570, end: 1035 }, { start: 1035, end: 1080 }],
  "eva-martin-fernandez": [{ start: 630, end: 1035 }, { start: 1035, end: 1080 }],
};

export const participantAvailabilitySource = {
  type: "SPEC08_OPERATIONAL_BENCHMARK_CONFIGURATION",
  unitId: "reality-unit-afternoon-combined",
  participantIds: Object.keys(focalA2RealityParticipantAvailabilityOverrides),
  window: [960, 1080],
  orderSeeded: false,
  humanTaskTimesUsed: false,
} as const;

export const auxiliaryPolicyEvidence = {
  source: "FOCAL_A2_REALITY_BENCHMARK_CONFIGURATION",
  policy: "OFF",
  inherited: false,
  fallbackUsed: false,
} as const;
