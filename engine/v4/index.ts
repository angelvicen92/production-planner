import { generatePlanV3 } from "../v3";
import type { EngineInput, EngineOutput } from "../types";
import type { EngineV3Options } from "../v3/types";
import { analyzeStrategicScenario, type V4StrategicAnalysis } from "./analysis";
import { buildV4GuidedInput, type V4GuidedOrderingDiagnostics } from "./guidedInput";

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
}

export interface EngineV4Result {
  output: EngineOutput;
  diagnostics: EngineV4Diagnostics;
}

export function generatePlanV4(input: EngineInput, options?: EngineV3Options): EngineV4Result {
  const strategicAnalysis = analyzeStrategicScenario(input);
  const { input: guidedInput, guidedOrdering } = buildV4GuidedInput(input, strategicAnalysis);
  const output = generatePlanV3(guidedInput, options);
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
      warning: "Motor V4 aplica ordenación guiada de tareas pending y delega la planificación segura en V3.",
      strategicAnalysis,
      guidedOrdering,
    },
  };
}
