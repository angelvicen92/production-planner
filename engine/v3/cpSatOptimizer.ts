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

const toMinutes = (hhmm: string): number | null => {
  const [h, m] = String(hhmm ?? "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

const scoreWarmStart = (input: EngineV3Input, warmStart: EngineOutput) => {
  const mainZoneId = Number((input as any)?.optimizerMainZoneId ?? NaN);
  const hasMainZone = Number.isFinite(mainZoneId) && mainZoneId > 0;
  const tasksById = new Map<number, any>((input.tasks ?? []).map((t: any) => [Number(t.id), t]));

  const bySpace = new Map<number, Array<{ start: number; templateId: number }>>();
  const mainIntervals: Array<{ start: number; end: number }> = [];

  for (const p of warmStart.plannedTasks ?? []) {
    const tid = Number((p as any)?.taskId ?? NaN);
    if (!Number.isFinite(tid) || tid <= 0) continue;
    const task = tasksById.get(tid);
    if (!task) continue;
    const start = toMinutes(String((p as any).startPlanned));
    const end = toMinutes(String((p as any).endPlanned));
    if (start == null || end == null || end <= start) continue;

    const spaceId = Number(task.spaceId ?? 0);
    const templateId = Number(task.templateId ?? 0);
    if (spaceId > 0) {
      const list = bySpace.get(spaceId) ?? [];
      list.push({ start, templateId });
      bySpace.set(spaceId, list);
    }

    if (hasMainZone && Number(task.zoneId ?? 0) === mainZoneId) {
      mainIntervals.push({ start, end });
    }
  }

  let switches = 0;
  for (const list of bySpace.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) {
      if (list[i].templateId !== list[i - 1].templateId) switches += 1;
    }
  }

  let gap = 0;
  mainIntervals.sort((a, b) => a.start - b.start);
  for (let i = 1; i < mainIntervals.length; i++) {
    const g = mainIntervals[i].start - mainIntervals[i - 1].end;
    if (g > 0) gap += g;
  }

  const score = gap * 10 + switches * 5;
  return { score, gap, switches };
};

export function optimizeWithCpSat(
  input: EngineV3Input,
  warmStart: EngineOutput,
  timeLimitSeconds: number,
): CpSatOptimizationResult {
  const warmScore = scoreWarmStart(input, warmStart);

  const baselineResult = (message: string, technicalDetails: string[]): CpSatOptimizationResult => ({
    output: warmStart,
    noOptimized: true,
    quality: {
      improved: false,
      baselineScore: warmScore.score,
      optimizedScore: warmScore.score,
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
