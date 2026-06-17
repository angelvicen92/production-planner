import { generatePlanV3 } from "../v3";
import type { EngineInput, EngineOutput } from "../types";
import type { EngineV3Options } from "../v3/types";

export const ENGINE_V4_VERSION = "v4" as const;

export interface EngineV4Diagnostics {
  status: "success" | "infeasible";
  engineVersion: typeof ENGINE_V4_VERSION;
  generatedAt: string;
  plannedTasks: number;
  unplannedTasks: number;
  warning: string;
}

export interface EngineV4Result {
  output: EngineOutput;
  diagnostics: EngineV4Diagnostics;
}

export function generatePlanV4(input: EngineInput, options?: EngineV3Options): EngineV4Result {
  const output = generatePlanV3(input, options);
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
      warning: "La lógica real del Motor V4 aún no está implementada; esta fase delega temporalmente en V3 y persiste el resultado por separado.",
    },
  };
}
