import type { AuxiliaryPolicy, PlannerNextProblem } from "../../contracts";
import {
  itinerantOperationProfiles,
  type ItinerantOperationProfile,
  projectCombinedFocalA2ItinerantProblem,
} from "./focalA2RealityReference";

export const focalA2ExactConstructiveAuxiliaryPolicy: AuxiliaryPolicy = {
  participantPresencePreference: "LOW",
};

export const focalA2ExactConstructiveEvidence = {
  iteration: "SPEC09-008",
  sourceExperiment: "SPEC09-007",
  policyClass: "POSITIVE",
  representativePolicy: "LOW",
  officialDefaultChanged: false,
  historicalPolicyChanged: false,
  engineDefaultChanged: false,
  weightCalibrationClaimed: false,
  fallbackUsed: false,
  acceptedFingerprints: {
    selectedCore:
      "0948b758c96f17ec546c331ce6d8b42464dbdbe95970d0640ae5fbea95fdbae9",
    full: "fded1fd188ba3daa833f68ce74533e6db43fd6e801d64f7f4cebea42aa5224d6",
    quality: "a64f641fcde8d470808a1b3e2eda986b5a99390600dd5c70ab189d37fc16189f",
  },
  acceptedMetrics: {
    tasks: 53,
    remainingTasks: 0,
    itinerantOperations: 12,
    itinerantMinutes: 375,
    branches: 85_557,
    totalPresenceMinutes: 3_515,
    totalProductiveMinutes: 900,
    totalIdleMinutes: 2_615,
    overallIdleRatio: 0.7439544807965861,
    maximumPresenceMinutes: 440,
    maximumIdleMinutes: 380,
    maximumGapMinutes: 225,
    gaps: 28,
    spaceChanges: 34,
  },
} as const;

export function createAcceptedExactConstructiveFocalA2Problem(
  operationalCorpus: ItinerantOperationProfile[] = itinerantOperationProfiles,
): PlannerNextProblem {
  const problem = projectCombinedFocalA2ItinerantProblem(operationalCorpus);
  return {
    ...problem,
    searchPolicy: "EXACT_CONSTRUCTIVE",
    auxiliaryPolicy: {
      ...problem.auxiliaryPolicy,
      ...focalA2ExactConstructiveAuxiliaryPolicy,
    },
  };
}
