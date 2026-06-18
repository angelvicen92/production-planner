import type { EngineInput, EngineOutput } from "../types";
import type { EngineV3Options } from "../v3/types";
import type { V4StrategicAnalysis } from "./analysis";
import type { V4GuidedOrderingDiagnostics } from "./guidedInput";
import type { V4PlanQualityEvaluation } from "./quality";
import type { MainFlowImprovementDiagnostics } from "./improvement";
import type { V4PostOptimizerDiagnostics } from "./postOptimizer";
import type { V4BlockRepackerDiagnostics } from "./blockRepacker";
import type { V4CandidateRunnerDiagnostics, V4CandidateStrategyId } from "./candidates";
import type { V3V4QualityComparison } from "./comparison";
import { runV4ProOrchestrator } from "./orchestrator";

export const ENGINE_V4_VERSION = "v4" as const;

export interface EngineV4Diagnostics {
  status: "success" | "infeasible";
  engineVersion: typeof ENGINE_V4_VERSION;
  generatedAt: string;
  plannedTasks: number;
  unplannedTasks: number;
  warning: string;
  strategicAnalysis: V4StrategicAnalysis;
  guidedOrdering: V4GuidedOrderingDiagnostics;
  quality: V4PlanQualityEvaluation;
  qualityBeforeImprovement?: V4PlanQualityEvaluation;
  qualityBeforePostOptimizer?: V4PlanQualityEvaluation;
  postOptimizer: V4PostOptimizerDiagnostics;
  blockRepacker?: V4BlockRepackerDiagnostics;
  mainFlowImprovement: MainFlowImprovementDiagnostics;
  candidateRunner: V4CandidateRunnerDiagnostics;
  v3V4Comparison: { v3Baseline: V4PlanQualityEvaluation | null; v4Final: V4PlanQualityEvaluation; comparison: V3V4QualityComparison | null };
  bestStrategyId: V4CandidateStrategyId;
  finalAcceptance?: { accepted: boolean; fallbackToV3Baseline: boolean; reason: string; checks?: Record<string, boolean> };
  performance?: { runtimeMs: number; strategiesEvaluated: number; profile: string; budgetExceeded: boolean; skippedStrategies: V4CandidateStrategyId[]; warnings?: string[] };
  executiveSummary?: { verdict: string; headline: string; wins: string[]; losses: string[]; risks: string[]; selectedStrategy: V4CandidateStrategyId };
}

export interface EngineV4Result {
  output: EngineOutput;
  diagnostics: EngineV4Diagnostics;
}

export function generatePlanV4(input: EngineInput, options?: EngineV3Options): EngineV4Result {
  return runV4ProOrchestrator(input, options as any);
}
