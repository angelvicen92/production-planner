import type { EngineOutput } from "../types";
import { generatePlanV2 } from "../solve_v2";
import type { EngineV3Input, EngineV3Options } from "./types";

export function generatePlanV3(input: EngineV3Input, options?: EngineV3Options): EngineOutput {
  const fallbackToV2 = options?.fallbackToV2 !== false;

  options?.onProgress?.({ phase: "prevalidation", progressPct: 5, message: "Motor V3 inicializando" });

  if (fallbackToV2) {
    options?.onProgress?.({ phase: "solving_feasible", progressPct: 35, message: "Motor V3 en modo fallback a V2" });
    const output = generatePlanV2(input);
    options?.onProgress?.({ phase: "optimizing", progressPct: 70, message: "Fallback V2 completado" });
    return output;
  }

  return {
    feasible: false,
    complete: false,
    hardFeasible: false,
    plannedTasks: [],
    warnings: [
      {
        code: "ENGINE_V3_NOT_ENABLED",
        message: "Motor V3 todavía no está habilitado para optimización real.",
      },
    ],
    reasons: [
      {
        code: "ENGINE_V3_NOT_ENABLED",
        message: "Motor V3 stub activo: habilita fallback o usa engine v2.",
      },
    ],
    unplanned: [],
    insights: [
      {
        code: "ENGINE_V3_STUB",
        message: "Motor V3 ejecutado en modo stub sin optimización.",
        details: {
          requestId: options?.requestId ?? null,
          requestedTimeLimitMs: options?.timeLimitMs ?? null,
        },
      },
    ],
    report: {
      repairsTried: 0,
      degradations: [],
      attemptsSummary: [
        {
          level: 0,
          ok: false,
          reason: "ENGINE_V3_STUB",
          topReasons: ["ENGINE_V3_NOT_ENABLED"],
        },
      ],
    },
  };
}
