import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";

export type CpSatOptimizationResult = {
  output: EngineOutput;
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
): CpSatOptimizationResult | null {
  if (!existsSync(SCRIPT_PATH)) return null;

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
    return null;
  }

  if (py.status !== 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(py.stdout || "{}");
    if (!parsed || !parsed.output) return null;
    return parsed as CpSatOptimizationResult;
  } catch {
    return null;
  }
}
