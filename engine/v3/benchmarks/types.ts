import type { EngineOutput } from "../../types";
import type { EngineV3Input } from "../types";
import type { PlannedTaskView } from "../metrics";

export type BenchmarkScenarioId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R";

export interface BenchmarkScenario {
  id: BenchmarkScenarioId;
  name: string;
  description: string;
  input: EngineV3Input;
  neighborhoodSeedOutput?: EngineOutput;
  cpSatPilotSeedOutput?: EngineOutput;
  benchmarkCandidateOutputs?: [EngineOutput, EngineOutput];
  operationalExpectation: string;
  riskNotes: string[];
  knownRisk?: string;
}

export interface BenchmarkRunResult {
  scenario: BenchmarkScenario;
  output: EngineOutput;
  runtimeMs: number;
  metrics: EngineBenchmarkMetrics;
}

export interface EngineBenchmarkMetrics {
  totalTasks: number;
  plannedTasks: number;
  unplannedTasks: number;
  makespan: number | null;
  runtimeMs: number;
  mainStageGapMinutes: number | null;
  mainStageGapCount: number | null;
  contestantWindowViolations: number;
  hardConstraintViolations: number;
  lockedTaskMovedCount: number;
  executedTaskMovedCount: number;
  coachSwitchCount: number | null;
  coachSwitchPenalty: number;
  restrictiveTalentAverageStartOffset: number | null;
  restrictiveTalentLatestFinishSlack: number | null;
  mainStageUtilizationPercent: number | null;
  tasksPerContestantMinMax: string | null;
  resourceUtilizationSummary: string | null;
  resourcePoolPressureSummary: string | null;
  maxAnyOfPoolConcurrency: number | null;
  resourceSwitchCount: number | null;
  compositeResourceCandidateCount: number | null;
  declaredResourceBundleCount: number;
  bundleComponentUsageCount: number;
  partialBundleUsageWarnings: number;
  bundleSpaceAffinityMatches: number;
  bundleSpaceAffinityMismatches: number;
  bundleSwitchPenalty: number;
  declaredBundleCandidateMatches: number;
  resourceDiagnosticWarnings: string[] | null;
  cpSatAttempted: boolean | null;
  cpSatAccepted: boolean | null;
  cpSatPilotAttempted: boolean | null;
  cpSatPilotAccepted: boolean | null;
  cpSatPilotTaskCount: number | null;
  cpSatPilotRuntimeMs: number | null;
  cpSatPilotReason: string | null;
  cpSatPilotImprovementSummary: string | null;
  cpSatSegmentsAttempted: number | null;
  cpSatSegmentsAccepted: number | null;
  cpSatSegmentReasons: string[] | null;
  cpSatSegmentTaskCounts: number[] | null;
  cpSatBestSegmentKind: string | null;
  cpSatSegmentImprovementSummary: string | null;
  phaseAUsed: boolean | null;
  backtrackingAttempted: boolean | null;
  backtrackingAccepted: boolean | null;
  backtrackingAttempts: number | null;
  backtrackingBranchesExplored: number | null;
  candidateSolutionsEvaluated: number | null;
  bestCandidateSource: string | null;
  candidateSelectionReason: string | null;
  bestCandidateScore: string | null;
  selectedCandidateMetrics: NonNullable<EngineOutput["v3Meta"]>["selectedCandidateMetrics"] | null;
  selectedCandidateMetricsConsistent: boolean | null;
  neighborhoodSearchAttempted: boolean | null;
  neighborhoodCandidatesGenerated: number | null;
  neighborhoodSearchDepth: number | null;
  neighborhoodDepth1Candidates: number | null;
  neighborhoodDepth2Candidates: number | null;
  neighborhoodChainsEvaluated: number | null;
  neighborhoodAcceptedChain: string | null;
  neighborhoodCandidateAccepted: boolean | null;
  neighborhoodAcceptedReason: string | null;
  neighborhoodSearchTimeMs: number | null;
  neighborhoodTypesAttempted: string[] | null;
  neighborhoodTypesGenerated: string[] | null;
  neighborhoodRejectedReasons: Record<string, number> | null;
  structuredBlockersCount: number;
  movableBlockersCount: number;
  immovableBlockersCount: number;
  unknownBlockersCount: number;
  solutionSource: string | null;
  warningsCount: number;
  infeasibleReasonCount: number;
}

export type { PlannedTaskView };
