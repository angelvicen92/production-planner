import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { optimizeWithCpSat, type CpSatOptimizationResult } from "./cpSatOptimizer";
import { calculateMainStageGaps, toMinutes } from "./metrics";
import { getDependencyIds } from "./operationalPriority";
import { compareCandidateSolutions, explainCandidateComparison, scoreCandidateSolution, summarizeCandidateScore } from "./solutionScoring";
import { validateOptimizedCandidate } from "./validateCandidate";

export const MAIN_STAGE_CP_SAT_PILOT_MAX_TASKS = 30;
export const MAIN_STAGE_CP_SAT_PILOT_TIME_LIMIT_SECONDS = 2;

export type MainStageCpSatPilotReason =
  | "eligible"
  | "missing_main_stage"
  | "no_main_stage_gap"
  | "no_direct_feeders"
  | "no_restrictive_talent"
  | "no_modelable_tasks"
  | "task_limit_exceeded"
  | "solver_unavailable"
  | "candidate_validation_failed"
  | "candidate_not_better"
  | "accepted";

export interface MainStageCpSatSubproblem {
  eligible: boolean;
  reason: MainStageCpSatPilotReason;
  taskIds: number[];
  mainStageTaskIds: number[];
  feederTaskIds: number[];
  restrictiveTalentIds: number[];
  excludedTaskIds: number[];
}

export interface MainStageCpSatPilotMeta {
  cpSatPilotAttempted: boolean;
  cpSatPilotAccepted: boolean;
  cpSatPilotTaskCount: number;
  cpSatPilotRuntimeMs: number;
  cpSatPilotReason: MainStageCpSatPilotReason | string;
  cpSatPilotImprovementSummary?: string;
}

const protectedByLock = (input: EngineV3Input, taskId: number): boolean => (input.locks ?? []).some((lock: any) => {
  if (Number(lock?.taskId) !== taskId) return false;
  const type = String(lock?.lockType ?? "").toLowerCase();
  return type === "time" || type === "full";
});

const isProtected = (input: EngineV3Input, task: any): boolean => {
  const status = String(task?.status ?? "pending").toLowerCase();
  return status === "done" || status === "in_progress" || status === "cancelled"
    || Boolean(task?.isManualBlock)
    || protectedByLock(input, Number(task?.id));
};

const hasModelableData = (task: any, plannedById: Map<number, any>): boolean => {
  const id = Number(task?.id);
  const duration = Number(task?.durationOverrideMin ?? task?.durationMin);
  const spaceId = Number(task?.spaceId);
  const zoneId = Number(task?.zoneId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(duration) || duration <= 0) return false;
  if (!Number.isFinite(spaceId) || spaceId <= 0 || !Number.isFinite(zoneId) || zoneId <= 0) return false;
  const requirements = task?.resourceRequirements?.anyOf;
  if (Array.isArray(requirements) && requirements.length > 0) {
    const assigned = plannedById.get(id)?.assignedResources;
    if (!Array.isArray(assigned) || assigned.length === 0) return false;
  }
  return true;
};

const restrictiveTalentIds = (input: EngineV3Input): Set<number> => {
  const dayStart = toMinutes(input.workDay?.start);
  const dayEnd = toMinutes(input.workDay?.end);
  const result = new Set<number>();
  if (dayStart === null || dayEnd === null) return result;
  for (const [rawId, window] of Object.entries(input.contestantAvailabilityById ?? {})) {
    const start = toMinutes(window?.start);
    const end = toMinutes(window?.end);
    const id = Number(rawId);
    if (Number.isFinite(id) && id > 0 && start !== null && end !== null && (start > dayStart || end < dayEnd)) result.add(id);
  }
  return result;
};

export const selectMainStageCpSatSubproblem = (
  input: EngineV3Input,
  warmStart: EngineOutput,
  maxTasks = MAIN_STAGE_CP_SAT_PILOT_MAX_TASKS,
): MainStageCpSatSubproblem => {
  const mainZoneId = Number(input.optimizerMainZoneId);
  const empty = (reason: MainStageCpSatPilotReason): MainStageCpSatSubproblem => ({
    eligible: false, reason, taskIds: [], mainStageTaskIds: [], feederTaskIds: [], restrictiveTalentIds: [], excludedTaskIds: [],
  });
  if (!Number.isFinite(mainZoneId) || mainZoneId <= 0) return empty("missing_main_stage");
  const gaps = calculateMainStageGaps(input, warmStart);
  if ((gaps?.minutes ?? 0) <= 0) return empty("no_main_stage_gap");

  const tasks = input.tasks ?? [];
  const byId = new Map(tasks.map((task: any) => [Number(task.id), task]));
  const plannedById = new Map((warmStart.plannedTasks ?? []).map((task: any) => [Number(task.taskId), task]));
  const mainTasks = tasks.filter((task: any) => Number(task.zoneId) === mainZoneId);
  if (!mainTasks.length) return empty("missing_main_stage");
  const feederIds = new Set<number>();
  for (const task of mainTasks) for (const depId of getDependencyIds(task)) if (byId.has(depId)) feederIds.add(depId);
  if (!feederIds.size) return empty("no_direct_feeders");

  const restrictive = restrictiveTalentIds(input);
  const linkedTalentIds = new Set(mainTasks.map((task: any) => Number(task.contestantId)).filter((id) => restrictive.has(id)));
  if (!linkedTalentIds.size) return empty("no_restrictive_talent");

  const relatedIds = new Set<number>([
    ...mainTasks.map((task: any) => Number(task.id)),
    ...feederIds,
  ]);
  for (const task of tasks as any[]) {
    const talentId = Number(task.contestantId);
    const taskId = Number(task.id);
    const assigned = plannedById.get(taskId)?.assignedResources ?? task.assignedResourceIds ?? [];
    if (linkedTalentIds.has(talentId) && (Number(task.zoneId) === mainZoneId || feederIds.has(taskId))) relatedIds.add(taskId);
    if (feederIds.has(taskId) && Array.isArray(assigned) && assigned.length > 0) relatedIds.add(taskId);
  }

  const excludedTaskIds: number[] = [];
  const taskIds = [...relatedIds].filter((id) => {
    const task = byId.get(id);
    const include = task && !isProtected(input, task) && plannedById.has(id) && hasModelableData(task, plannedById);
    if (!include) excludedTaskIds.push(id);
    return include;
  }).sort((a, b) => a - b);
  if (!taskIds.length) return { ...empty("no_modelable_tasks"), excludedTaskIds };
  if (taskIds.length > maxTasks) return {
    eligible: false, reason: "task_limit_exceeded", taskIds, excludedTaskIds,
    mainStageTaskIds: mainTasks.map((task: any) => Number(task.id)).filter((id) => taskIds.includes(id)),
    feederTaskIds: [...feederIds].filter((id) => taskIds.includes(id)), restrictiveTalentIds: [...linkedTalentIds].sort((a, b) => a - b),
  };
  return {
    eligible: true, reason: "eligible", taskIds, excludedTaskIds,
    mainStageTaskIds: mainTasks.map((task: any) => Number(task.id)).filter((id) => taskIds.includes(id)),
    feederTaskIds: [...feederIds].filter((id) => taskIds.includes(id)), restrictiveTalentIds: [...linkedTalentIds].sort((a, b) => a - b),
  };
};


const toHHMM = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const deterministicPilotFallback = (
  input: EngineV3Input,
  warmStart: EngineOutput,
  movableTaskIds: number[],
): CpSatOptimizationResult => {
  const taskById = new Map((input.tasks ?? []).map((task: any) => [Number(task.id), task]));
  const mainZoneId = Number(input.optimizerMainZoneId);
  const orderedIds = [...movableTaskIds].sort((a, b) => {
    const aMain = Number((taskById.get(a) as any)?.zoneId) === mainZoneId ? 1 : 0;
    const bMain = Number((taskById.get(b) as any)?.zoneId) === mainZoneId ? 1 : 0;
    return aMain - bMain || a - b;
  });
  let candidate: EngineOutput = { ...warmStart, plannedTasks: (warmStart.plannedTasks ?? []).map((row) => ({ ...row })) };
  const dayStart = toMinutes(input.workDay.start) ?? 0;
  const dayEnd = toMinutes(input.workDay.end) ?? dayStart;
  for (const taskId of orderedIds) {
    const task = taskById.get(taskId) as any;
    const duration = Number(task?.durationOverrideMin ?? task?.durationMin);
    if (!task || !Number.isFinite(duration) || duration <= 0) continue;
    for (let start = dayStart; start + duration <= dayEnd; start += 5) {
      const trial: EngineOutput = {
        ...candidate,
        plannedTasks: candidate.plannedTasks.map((row) => row.taskId === taskId
          ? { ...row, startPlanned: toHHMM(start), endPlanned: toHHMM(start + duration) }
          : row),
      };
      if (validateOptimizedCandidate(input, warmStart, trial).length === 0) {
        candidate = trial;
        break;
      }
    }
  }
  const baseScore = scoreCandidateSolution(input, warmStart);
  const candidateScore = scoreCandidateSolution(input, candidate);
  return {
    output: candidate,
    quality: {
      improved: compareCandidateSolutions(input, candidate, warmStart) > 0,
      baselineScore: baseScore.mainStageGapMinutes,
      optimizedScore: candidateScore.mainStageGapMinutes,
      objectiveDelta: candidateScore.mainStageGapMinutes - baseScore.mainStageGapMinutes,
      mainZoneGapMinutesDelta: candidateScore.mainStageGapMinutes - baseScore.mainStageGapMinutes,
      spaceSwitchesDelta: candidateScore.coachSwitchPenalty - baseScore.coachSwitchPenalty,
    },
    degradations: [],
    message: "Fallback determinista acotado usado porque OR-Tools no está disponible.",
    technicalDetails: ["deterministic_pilot_fallback"],
  };
};

export type MainStageCpSatSolver = (
  input: EngineV3Input,
  warmStart: EngineOutput,
  timeLimitSeconds: number,
  movableTaskIds: number[],
) => CpSatOptimizationResult;

const defaultSolver: MainStageCpSatSolver = (input, warmStart, timeLimitSeconds, movableTaskIds) => {
  const external = optimizeWithCpSat(input, warmStart, timeLimitSeconds, { movableTaskIds, pilotMode: true });
  if (external.technicalDetails.includes("ortools_import_failed")) {
    return deterministicPilotFallback(input, warmStart, movableTaskIds);
  }
  return external;
};

export const runMainStageCpSatPilot = (
  input: EngineV3Input,
  baseOutput: EngineOutput,
  solver: MainStageCpSatSolver = defaultSolver,
): { output: EngineOutput; meta: MainStageCpSatPilotMeta } => {
  const started = Date.now();
  const selection = selectMainStageCpSatSubproblem(input, baseOutput);
  const baseMeta: MainStageCpSatPilotMeta = {
    cpSatPilotAttempted: false,
    cpSatPilotAccepted: false,
    cpSatPilotTaskCount: selection.taskIds.length,
    cpSatPilotRuntimeMs: 0,
    cpSatPilotReason: selection.reason,
  };
  if (!selection.eligible) return { output: baseOutput, meta: { ...baseMeta, cpSatPilotRuntimeMs: Date.now() - started } };

  const optimized = solver(input, baseOutput, MAIN_STAGE_CP_SAT_PILOT_TIME_LIMIT_SECONDS, selection.taskIds);
  const runtime = Math.max(0, Date.now() - started);
  if (optimized.noOptimized) return {
    output: baseOutput,
    meta: { ...baseMeta, cpSatPilotAttempted: true, cpSatPilotRuntimeMs: runtime, cpSatPilotReason: "solver_unavailable", cpSatPilotImprovementSummary: optimized.message },
  };
  const errors = validateOptimizedCandidate(input, baseOutput, optimized.output);
  if (errors.length > 0) return {
    output: baseOutput,
    meta: { ...baseMeta, cpSatPilotAttempted: true, cpSatPilotRuntimeMs: runtime, cpSatPilotReason: "candidate_validation_failed", cpSatPilotImprovementSummary: errors.join(" | ") },
  };
  const baseScore = scoreCandidateSolution(input, baseOutput);
  const candidateScore = scoreCandidateSolution(input, optimized.output);
  if (compareCandidateSolutions(input, optimized.output, baseOutput) <= 0) return {
    output: baseOutput,
    meta: {
      ...baseMeta, cpSatPilotAttempted: true, cpSatPilotRuntimeMs: runtime, cpSatPilotReason: "candidate_not_better",
      cpSatPilotImprovementSummary: explainCandidateComparison("fallback", "cp_sat_pilot", baseScore, candidateScore),
    },
  };
  return {
    output: optimized.output,
    meta: {
      ...baseMeta, cpSatPilotAttempted: true, cpSatPilotAccepted: true, cpSatPilotRuntimeMs: runtime, cpSatPilotReason: "accepted",
      cpSatPilotImprovementSummary: `${explainCandidateComparison("cp_sat_pilot", "fallback", candidateScore, baseScore)}; ${summarizeCandidateScore(candidateScore)}`,
    },
  };
};
