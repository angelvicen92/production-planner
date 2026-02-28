import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";

export type CpSatOptimizationResult = {
  output: EngineOutput;
  noOptimized?: boolean;
  quality: {
    improved: boolean;
    baselineScore: number;
    optimizedScore: number;
    objectiveDelta: number;
    mainZoneGapMinutesDelta: number;
    spaceSwitchesDelta: number;
  };
  degradations: any[];
  message: string;
  technicalDetails: string[];
};

const SCRIPT_PATH = path.resolve(process.cwd(), "engine/v3/python/cp_sat_service.py");

export function optimizeWithCpSat(
  input: EngineV3Input,
  warmStart: EngineOutput,
  timeLimitSeconds: number,
): CpSatOptimizationResult {
  const baselineResult = (message: string, technicalDetails: string[]): CpSatOptimizationResult => ({
    output: warmStart,
    noOptimized: true,
    quality: {
      improved: false,
      baselineScore: 0,
      optimizedScore: 0,
      objectiveDelta: 0,
      mainZoneGapMinutesDelta: 0,
      spaceSwitchesDelta: 0,
    },
    degradations: [],
    message,
    technicalDetails,
  });

  if (!existsSync(SCRIPT_PATH)) {
    return baselineResult("CP-SAT script no encontrado; se conserva Fase A.", ["cp_sat_script_missing"]);
  }

  const payload = JSON.stringify({
    engineInput: input,
    warmStart,
    timeLimitSeconds,
  });

  const py = spawnSync("python3", [SCRIPT_PATH], {
    input: payload,
    encoding: "utf-8",
    timeout: Math.max(5_000, Math.round(timeLimitSeconds * 1000) + 3_000),
  });

  if (py.error) {
    return baselineResult("Error invocando CP-SAT; se conserva Fase A.", [String(py.error?.message || py.error)]);
  }

  if (py.status !== 0) {
    const stderr = String(py.stderr || "").trim();
    const detail = stderr || `python_exit_status=${py.status}`;
    return baselineResult("CP-SAT devolvió error de ejecución; se conserva Fase A.", [detail]);
  }

  try {
    const parsed = JSON.parse(py.stdout || "{}");
    if (!parsed || !parsed.output) {
      return baselineResult("Respuesta CP-SAT inválida; se conserva Fase A.", ["missing_output_in_cp_sat_response"]);
    }
    return parsed as CpSatOptimizationResult;
  } catch (error) {
    const stderr = String(py.stderr || "").trim();
    return baselineResult("No se pudo parsear salida CP-SAT; se conserva Fase A.", [String((error as Error)?.message || error), stderr].filter(Boolean));
  }
}
