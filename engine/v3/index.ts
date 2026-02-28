import type { EngineOutput, EngineOutputUnplanned } from "../types";
import { solve_v2_attempt } from "../solve_v2";
import type { EngineV3Input, EngineV3Options } from "./types";
import { optimizeWithCpSat } from "./cpSatOptimizer";
import { validateOptimizedCandidate } from "./validateCandidate";

type AttemptSummary = {
  level: number;
  ok: boolean;
  ms: number;
  topReasons: string[];
  reason?: string;
};

const GRID_MIN = 5;

const toMinutes = (hhmm: string) => {
  const [h, m] = String(hhmm ?? "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

const toHHMM = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const summarizeTopReasons = (output: EngineOutput): string[] => {
  const codes = new Map<string, number>();
  for (const item of (output.unplanned ?? [])) {
    const code = String(item?.reason?.code ?? "UNPLANNED");
    codes.set(code, (codes.get(code) ?? 0) + 1);
  }
  for (const reason of (output.reasons ?? [])) {
    const code = String(reason?.code ?? "REASON");
    codes.set(code, (codes.get(code) ?? 0) + 1);
  }
  return Array.from(codes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code]) => code);
};

const cloneWithSoftLevel = (input: EngineV3Input, level: number): EngineV3Input => {
  const normalizedLevel = Math.max(0, Math.min(9, Math.floor(level)));
  const ratio = normalizedLevel / 9;
  const baseWeights = (input.optimizerWeights ?? {}) as Record<string, number>;

  const scaledWeights: Record<string, number> = {};
  for (const [k, v] of Object.entries(baseWeights)) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    scaledWeights[k] = Math.max(0, Math.round(n * ratio));
  }

  const mapToLegacyLevel = (raw: any) => {
    const n = Number(raw ?? 0);
    const base = Number.isFinite(n) ? n : 0;
    const scaled = Math.max(0, Math.round(base * ratio));
    return Math.min(3, scaled);
  };

  return {
    ...input,
    optimizerMainZonePriorityLevel: mapToLegacyLevel(input.optimizerMainZonePriorityLevel),
    optimizerGroupingLevel: mapToLegacyLevel(input.optimizerGroupingLevel),
    optimizerContestantStayInZoneLevel: mapToLegacyLevel(input.optimizerContestantStayInZoneLevel),
    optimizerContestantCompactLevel: mapToLegacyLevel(input.optimizerContestantCompactLevel),
    optimizerWeights: scaledWeights,
  };
};

const prevalidateHard = (input: EngineV3Input): EngineOutput | null => {
  const reasons: Array<{ code: string; message: string; taskId?: number; details?: any }> = [];

  for (const task of (input.tasks ?? [])) {
    const taskId = Number((task as any)?.id ?? NaN);
    const status = String((task as any)?.status ?? "pending");
    if (status === "done" || status === "in_progress" || status === "cancelled") continue;
    if (Boolean((task as any)?.isManualBlock)) continue;

    const duration = Number((task as any)?.durationOverrideMin ?? (task as any)?.durationMin ?? NaN);
    if (!Number.isFinite(duration) || duration <= 0) {
      reasons.push({
        code: "MISSING_DURATION",
        taskId,
        message: `La tarea ${taskId} no tiene duración válida. Autoriza un valor por defecto para continuar.`,
      });
    }

    const spaceId = Number((task as any)?.spaceId ?? NaN);
    const zoneId = Number((task as any)?.zoneId ?? NaN);
    if (!Number.isFinite(spaceId) || spaceId <= 0 || !Number.isFinite(zoneId) || zoneId <= 0) {
      reasons.push({
        code: "MISSING_SPACE_OR_ZONE",
        taskId,
        message: `La tarea ${taskId} no tiene espacio/zona válidos.`,
        details: { spaceId: Number.isFinite(spaceId) ? spaceId : null, zoneId: Number.isFinite(zoneId) ? zoneId : null },
      });
    }
  }

  if (!reasons.length) return null;
  return {
    feasible: false,
    complete: false,
    hardFeasible: false,
    plannedTasks: [],
    unplanned: [],
    warnings: [],
    reasons,
    report: {
      repairsTried: 0,
      degradations: [],
      attemptsSummary: [{ level: 10, ok: false, topReasons: reasons.map((r) => r.code) }],
    },
  };
};

const estimateOvertimeMinRequired = (input: EngineV3Input, maxExtraMin = 240): number | null => {
  const end = toMinutes(input.workDay.end);
  if (end === null) return null;

  for (let extra = GRID_MIN; extra <= maxExtraMin; extra += GRID_MIN) {
    const trial = solve_v2_attempt({
      ...input,
      workDay: { ...input.workDay, end: toHHMM(end + extra) },
    });
    if (trial.complete) return extra;
  }
  return null;
};

const suggestManualBlockMoves = (input: EngineV3Input, unplanned: EngineOutputUnplanned[]): any[] => {
  const blocks = (input.tasks ?? [])
    .filter((t: any) => Boolean(t?.isManualBlock) && t?.startPlanned && t?.endPlanned)
    .map((t: any) => ({
      taskId: Number(t.id),
      spaceId: Number(t.spaceId ?? NaN),
      start: String(t.startPlanned),
      end: String(t.endPlanned),
    }));

  if (!blocks.length) return [];

  const requestedSpaces = new Set<number>();
  for (const u of unplanned) {
    const sid = Number((u as any)?.reason?.details?.spaceId ?? NaN);
    if (Number.isFinite(sid) && sid > 0) requestedSpaces.add(sid);
  }

  return blocks
    .filter((b) => requestedSpaces.size === 0 || requestedSpaces.has(b.spaceId))
    .slice(0, 3)
    .map((b) => ({
      manual_block_task_id: b.taskId,
      space_id: b.spaceId,
      current_start: b.start,
      current_end: b.end,
      suggested_action: "move_or_shorten",
    }));
};

const buildRescueProposal = (base: EngineOutput, input: EngineV3Input) => {
  const overtimeMinRequired = estimateOvertimeMinRequired(cloneWithSoftLevel(input, 0));
  const unplanned = Array.isArray(base.unplanned) ? base.unplanned : [];
  const suggestedMoves = suggestManualBlockMoves(input, unplanned);
  const canOvertime = overtimeMinRequired !== null;

  return {
    needs_user_approval: canOvertime || suggestedMoves.length > 0,
    canOvertime,
    overtime_min_required: overtimeMinRequired,
    suggested_moves: suggestedMoves,
  };
};

export function generatePlanV3(input: EngineV3Input, options?: EngineV3Options): EngineOutput {
  options?.onProgress?.({ phase: "prevalidation", progressPct: 5, message: "V3 Fase A: prevalidación de hard constraints" });

  const hardValidation = prevalidateHard(input);
  if (hardValidation) return hardValidation;

  const attemptsSummary: AttemptSummary[] = [];
  let best: EngineOutput | null = null;
  let bestPlanned = -1;

  for (let level = 9; level >= 0; level--) {
    options?.onProgress?.({
      phase: "solving_feasible",
      progressPct: 10 + Math.round(((9 - level) / 9) * 70),
      message: `V3 Fase A: intento factible con soft level=${level}`,
    });

    const t0 = Date.now();
    const out = solve_v2_attempt(cloneWithSoftLevel(input, level));
    const ms = Math.max(0, Date.now() - t0);
    const ok = Boolean(out.complete);
    attemptsSummary.push({ level, ok, ms, topReasons: summarizeTopReasons(out), reason: `soft_level_${level}` });

    const plannedCount = Array.isArray(out.plannedTasks) ? out.plannedTasks.length : 0;
    if (plannedCount > bestPlanned) {
      best = out;
      bestPlanned = plannedCount;
    }

    if (ok) {
      let output: EngineOutput = {
        ...out,
        report: {
          repairsTried: attemptsSummary.length - 1,
          degradations: attemptsSummary.filter((a) => !a.ok).map((a) => `soft_${a.level}`),
          attemptsSummary: attemptsSummary.map((a) => ({ level: a.level, ok: a.ok, ms: a.ms, topReasons: a.topReasons, reason: a.reason })),
        },
      };

      const timeLimitSeconds = Math.floor(Math.max(0, Number(options?.timeLimitMs ?? 0)) / 1000);
      if (timeLimitSeconds > 0) {
        options?.onProgress?.({ phase: "optimizing", progressPct: 90, message: `V3 Fase B (CP-SAT): optimizando hasta ${timeLimitSeconds}s` });
        const optimized = optimizeWithCpSat(input, output, timeLimitSeconds);
        const candidateErrors = optimized.noOptimized ? [] : validateOptimizedCandidate(input, output, optimized.output);
        const accepted = !optimized.noOptimized && candidateErrors.length === 0;
        const chosenOutput = accepted ? optimized.output : output;
        const insights = Array.isArray((chosenOutput as any).insights) ? (chosenOutput as any).insights : [];
        const qualityInsight = {
          code: "V3_PHASE_B_QUALITY",
          message: optimized.noOptimized
            ? optimized.message
            : accepted
              ? optimized.message
              : "CP-SAT produjo candidato con potenciales hard rotas; se conserva Fase A.",
          details: {
            ...optimized.quality,
            accepted,
            noOptimized: Boolean(optimized.noOptimized),
            candidateErrors,
            degradations: optimized.degradations,
            technical: optimized.technicalDetails,
          },
        };
        output = {
          ...chosenOutput,
          insights: [...insights, qualityInsight],
          report: {
            repairsTried: output.report?.repairsTried ?? 0,
            degradations: [...(output.report?.degradations ?? []), ...optimized.degradations.map((d: any) => `near_hard:${d.rule}:${d.taskId}`)],
            attemptsSummary: output.report?.attemptsSummary ?? [],
          },
        };
      }

      options?.onProgress?.({ phase: "optimizing", progressPct: 92, message: "V3: plan completo encontrado (Fase A/B)" });
      return output;
    }
  }

  const fallback = best ?? {
    feasible: false,
    complete: false,
    hardFeasible: false,
    plannedTasks: [],
    unplanned: [],
    warnings: [],
    reasons: [{ code: "NO_PLAN", message: "No se obtuvo ningún intento válido en V3 Fase A." }],
  };

  const rescue = buildRescueProposal(fallback, input);
  const fallbackReasons: any[] = rescue.canOvertime
    ? [{
        code: "NEEDS_USER_APPROVAL",
        message: "Se requiere ampliar jornada",
        details: rescue,
      }]
    : [{
        code: "INCOMPLETE_PLAN",
        message: "No se ha podido planificar todas las tareas con las restricciones actuales",
        details: fallback.unplanned,
      }];

  options?.onProgress?.({ phase: "optimizing", progressPct: 92, message: "V3 Fase A: sin plan completo, devolviendo diagnóstico" });

  return {
    ...fallback,
    feasible: false,
    complete: false,
    hardFeasible: false,
    reasons: fallbackReasons,
    report: {
      repairsTried: attemptsSummary.length,
      degradations: attemptsSummary.map((a) => `soft_${a.level}`),
      attemptsSummary: attemptsSummary.map((a) => ({ level: a.level, ok: a.ok, ms: a.ms, topReasons: a.topReasons, reason: a.reason })),
    },
  };
}
