import type { EngineOutput } from "../../types";
import type { EngineV3Input } from "../types";
import type { PlannedTaskView } from "../metrics";

export type BenchmarkScenarioId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";

export interface BenchmarkScenario {
  id: BenchmarkScenarioId;
  name: string;
  description: string;
  input: EngineV3Input;
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
  restrictiveTalentAverageStartOffset: number | null;
  restrictiveTalentLatestFinishSlack: number | null;
  mainStageUtilizationPercent: number | null;
  tasksPerContestantMinMax: string | null;
  resourceUtilizationSummary: string | null;
  cpSatAttempted: boolean | null;
  cpSatAccepted: boolean | null;
  phaseAUsed: boolean | null;
  backtrackingAttempted: boolean | null;
  backtrackingAccepted: boolean | null;
  backtrackingAttempts: number | null;
  backtrackingBranchesExplored: number | null;
  candidateSolutionsEvaluated: number | null;
  bestCandidateSource: string | null;
  candidateSelectionReason: string | null;
  bestCandidateScore: string | null;
  structuredBlockersCount: number;
  movableBlockersCount: number;
  immovableBlockersCount: number;
  unknownBlockersCount: number;
  solutionSource: string | null;
  warningsCount: number;
  infeasibleReasonCount: number;
}

export type { PlannedTaskView };
