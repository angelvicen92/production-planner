import { generatePlanV3 } from "../v3";
import type { EngineInput, EngineOutput } from "../types";
import type { EngineV3Options } from "../v3/types";
import { analyzeStrategicScenario, type V4StrategicAnalysis } from "./analysis";
import { buildV4GuidedInput, type V4GuidedOrderingDiagnostics } from "./guidedInput";
import { evaluateV4PlanQuality, type V4PlanQualityEvaluation } from "./quality";
import { improveMainFlowContinuity, type MainFlowImprovementDiagnostics } from "./improvement";

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
}

export interface EngineV4Result {
  output: EngineOutput;
  diagnostics: EngineV4Diagnostics;
}

export function generatePlanV4(input: EngineInput, options?: EngineV3Options): EngineV4Result {
  const strategicAnalysis = analyzeStrategicScenario(input);
  const { input: guidedInput, guidedOrdering } = buildV4GuidedInput(input, strategicAnalysis);
  const initialOutput = generatePlanV3(guidedInput, options);
  const initialQuality = evaluateV4PlanQuality(guidedInput, initialOutput, strategicAnalysis);
  const { output, improvementDiagnostics } = improveMainFlowContinuity(guidedInput, initialOutput, strategicAnalysis, initialQuality);
  const quality = evaluateV4PlanQuality(guidedInput, output, strategicAnalysis);
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
      warning: "Motor V4 aplica análisis estratégico, ordenación guiada y un pase conservador de continuidad del flujo principal antes de delegar la viabilidad hard en V3.",
      strategicAnalysis,
      guidedOrdering,
      quality,
      qualityBeforeImprovement: initialQuality,
      mainFlowImprovement: improvementDiagnostics,
    },
  };
}
