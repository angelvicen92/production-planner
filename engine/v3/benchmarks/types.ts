import type { EngineOutput, TaskInput } from "../../types";
import type { EngineV3Input } from "../types";

export type BenchmarkScenarioId = "A" | "B" | "C" | "D" | "E" | "F" | "G";

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
  cpSatAttempted: boolean | null;
  cpSatAccepted: boolean | null;
  phaseAUsed: boolean | null;
  backtrackingAttempted: boolean | null;
  backtrackingAccepted: boolean | null;
  backtrackingAttempts: number | null;
  backtrackingBranchesExplored: number | null;
  structuredBlockersCount: number;
  movableBlockersCount: number;
  immovableBlockersCount: number;
  unknownBlockersCount: number;
  solutionSource: string | null;
  warningsCount: number;
  infeasibleReasonCount: number;
}

export interface PlannedTaskView {
  taskId: number;
  startPlanned: string;
  endPlanned: string;
  assignedResources: number[];
  task: TaskInput;
}
