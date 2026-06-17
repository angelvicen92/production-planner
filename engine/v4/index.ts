import type { EngineInput, EngineOutput } from "../types";
import type { EngineV3Options } from "../v3/types";
import { analyzeStrategicScenario, type V4StrategicAnalysis } from "./analysis";
import type { V4GuidedOrderingDiagnostics } from "./guidedInput";
import type { V4PlanQualityEvaluation } from "./quality";
import type { MainFlowImprovementDiagnostics } from "./improvement";
import { runV4CandidateStrategies, type V4CandidateRunnerDiagnostics, type V4CandidateStrategyId } from "./candidates";

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
  mainFlowImprovement: MainFlowImprovementDiagnostics;
  candidateRunner: V4CandidateRunnerDiagnostics;
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
  const plannedTasks = Array.isArray((output as any).plannedTasks) ? (output as any).plannedTasks.length : 0;
  const unplannedTasks = Array.isArray((output as any).unplanned) ? (output as any).unplanned.length : 0;

  return {
    output,
    diagnostics: {
      status: (output as any).hardFeasible === false ? "infeasible" : "success",
      engineVersion: ENGINE_V4_VERSION,
      generatedAt: new Date().toISOString(),
      plannedTasks,
      unplannedTasks,
      warning: "Motor V4 evalúa múltiples estrategias rápidas, selecciona la mejor por calidad jerárquica y delega la viabilidad hard en V3.",
      strategicAnalysis,
      guidedOrdering,
      quality,
      qualityBeforeImprovement: initialQuality,
      mainFlowImprovement: improvementDiagnostics,
      candidateRunner: candidatesDiagnostics,
      bestStrategyId,
    },
  };
}
