import type { EngineInput, EngineOutput } from "../types";
import type { EngineV3Options } from "../v3/types";
import { analyzeStrategicScenario, type V4StrategicAnalysis } from "./analysis";
import type { V4GuidedOrderingDiagnostics } from "./guidedInput";
import type { V4PlanQualityEvaluation } from "./quality";
import type { MainFlowImprovementDiagnostics } from "./improvement";
import { optimizeV4PlanPostSelection, type V4PostOptimizerDiagnostics } from "./postOptimizer";
import { runV4CandidateStrategies, type V4CandidateRunnerDiagnostics, type V4CandidateStrategyId } from "./candidates";
import { compareV3AndV4Quality, type V3V4QualityComparison } from "./comparison";

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
  mainFlowImprovement: MainFlowImprovementDiagnostics;
  candidateRunner: V4CandidateRunnerDiagnostics;
  v3V4Comparison: { v3Baseline: V4PlanQualityEvaluation | null; v4Final: V4PlanQualityEvaluation; comparison: V3V4QualityComparison | null };
  bestStrategyId: V4CandidateStrategyId;
}

export interface EngineV4Result {
  output: EngineOutput;
  diagnostics: EngineV4Diagnostics;
}

export function generatePlanV4(input: EngineInput, options?: EngineV3Options): EngineV4Result {
  const strategicAnalysis = analyzeStrategicScenario(input);
  const {
    bestOutput: output,
    bestQuality: quality,
    bestStrategyId,
    candidatesDiagnostics,
    bestGuidedOrdering: guidedOrdering,
    bestMainFlowImprovement: improvementDiagnostics,
    bestQualityBeforeImprovement: initialQuality,
  } = runV4CandidateStrategies(input, strategicAnalysis, options);
  const optimized = optimizeV4PlanPostSelection(
    input,
    output,
    strategicAnalysis,
    quality,
    options,
  );
  const finalOutput = optimized.output;
  const finalQuality = optimized.quality;
  const plannedTasks = Array.isArray((finalOutput as any).plannedTasks) ? (finalOutput as any).plannedTasks.length : 0;
  const v3BaselineQuality = candidatesDiagnostics.candidates.find((candidate) => candidate.strategyId === "strategy_baseline_v3_order")?.quality ?? null;
  const comparison = v3BaselineQuality ? compareV3AndV4Quality(v3BaselineQuality, finalQuality) : null;
  const unplannedTasks = Array.isArray((finalOutput as any).unplanned) ? (finalOutput as any).unplanned.length : 0;

  return {
    output: finalOutput,
    diagnostics: {
      status: (finalOutput as any).hardFeasible === false ? "infeasible" : "success",
      engineVersion: ENGINE_V4_VERSION,
      generatedAt: new Date().toISOString(),
      plannedTasks,
      unplannedTasks,
      warning: "Motor V4 evalúa múltiples estrategias rápidas, selecciona la mejor por calidad jerárquica y delega la viabilidad hard en V3.",
      strategicAnalysis,
      guidedOrdering,
      quality: finalQuality,
      qualityBeforeImprovement: initialQuality,
      qualityBeforePostOptimizer: quality,
      postOptimizer: optimized.diagnostics,
      mainFlowImprovement: improvementDiagnostics,
      candidateRunner: candidatesDiagnostics,
      v3V4Comparison: { v3Baseline: v3BaselineQuality, v4Final: finalQuality, comparison },
      bestStrategyId,
    },
  };
}
