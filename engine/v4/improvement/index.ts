import type { EngineInput, EngineOutput, TaskInput, TimeWindow } from "../../types";
import { validateHardConstraints } from "../../v3/hardValidation";
import type { V4StrategicAnalysis } from "../analysis";
import type { V4PlanQualityEvaluation } from "../quality";
import { evaluateV4PlanQuality } from "../quality";

type Interval = { start: number; end: number };
type Planned = EngineOutput["plannedTasks"][number];

export interface MainFlowGapDiagnostic {
  start: string;
  end: string;
  durationMinutes: number;
  previousTaskId: number;
  nextTaskId: number;
}

export interface MainFlowImprovementMove {
  taskId: number;
  from: "unplanned";
  toStart: string;
  toEnd: string;
  coveredGapStart: string;
  coveredGapEnd: string;
}

export interface MainFlowImprovementDiagnostics {
  applied: boolean;
  reason?: string;
  gapsBefore?: number;
  gapMinutesBefore?: number;
  gapsAfter?: number;
  gapMinutesAfter?: number;
  moves?: MainFlowImprovementMove[];
  skippedReasons?: string[];
  qualityBeforeImprovement?: V4PlanQualityEvaluation;
  detectedGaps?: MainFlowGapDiagnostic[];
}

const toMinutes = (value?: string | null): number | null => {
  const [h, m] = String(value ?? "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const toHHMM = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const taskDuration = (task: TaskInput): number => Math.max(0, Number(task.durationOverrideMin ?? 30) || 30);
const taskSpaceId = (task?: TaskInput): number | null => {
  const id = Number(task?.spaceId ?? task?.zoneId);
  return Number.isFinite(id) ? id : null;
};
function windowToInterval(window?: TimeWindow | null): Interval | null {
  const start = toMinutes(window?.start);
  const end = toMinutes(window?.end);
  return start === null || end === null || end <= start ? null : { start, end };
}

function excludedIntervals(input: EngineInput): Interval[] {
  return [input.actualMeal, input.mealMode === "global_hard_break" ? input.meal : null, ...(input.globalHardBreaks ?? []), ...(input.protectedBreaks ?? [])]
    .map(windowToInterval)
    .filter((item): item is Interval => item !== null);
}

function resourceIds(task: TaskInput, planned?: Planned): number[] {
  return Array.from(new Set([
    ...((planned?.assignedResources ?? []) as number[]),
    ...((task.assignedResourceIds ?? []) as number[]),
    ...Object.keys(task.resourceRequirements?.byItem ?? {}).map(Number),
  ].map(Number).filter((id) => Number.isFinite(id) && id > 0)));
}

function findMainFlowGaps(input: EngineInput, output: EngineOutput, mainFlowId: number | null): MainFlowGapDiagnostic[] {
  if (mainFlowId === null) return [];
  const tasksById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const exclusions = excludedIntervals(input);
  const planned = (output.plannedTasks ?? [])
    .map((planned) => ({ planned, task: tasksById.get(Number(planned.taskId)), start: toMinutes(planned.startPlanned), end: toMinutes(planned.endPlanned) }))
    .filter((item) => item.task && taskSpaceId(item.task) === mainFlowId && item.start !== null && item.end !== null && item.end > item.start)
    .sort((a, b) => (a.start as number) - (b.start as number) || (a.end as number) - (b.end as number));

  const gaps: MainFlowGapDiagnostic[] = [];
  for (let i = 1; i < planned.length; i += 1) {
    const start = planned[i - 1].end as number;
    const end = planned[i].start as number;
    if (end <= start) continue;
    const raw = { start, end };
    const excluded = exclusions.reduce((sum, item) => sum + Math.max(0, Math.min(raw.end, item.end) - Math.max(raw.start, item.start)), 0);
    const net = Math.max(0, end - start - excluded);
    if (net <= 0) continue;
    gaps.push({ start: toHHMM(start), end: toHHMM(end), durationMinutes: net, previousTaskId: Number(planned[i - 1].planned.taskId), nextTaskId: Number(planned[i].planned.taskId) });
  }
  return gaps;
}

function hasLock(input: EngineInput, taskId: number): boolean {
  return (input.locks ?? []).some((lock) => Number(lock.taskId) === taskId);
}

function unplannedCount(output: EngineOutput): number {
  return Array.isArray(output.unplanned) ? output.unplanned.length : 0;
}

function candidateOutputWithTask(output: EngineOutput, task: TaskInput, start: number, end: number): EngineOutput {
  const planned = { taskId: task.id, startPlanned: toHHMM(start), endPlanned: toHHMM(end), assignedResources: resourceIds(task) };
  return {
    ...output,
    plannedTasks: [...(output.plannedTasks ?? []), planned],
    unplanned: (output.unplanned ?? []).filter((item) => Number(item.taskId) !== Number(task.id)),
    complete: Math.max(0, (output.unplanned ?? []).length - 1) === 0 ? true : output.complete,
  };
}

export function improveMainFlowContinuity(
  input: EngineInput,
  output: EngineOutput,
  strategicAnalysis: V4StrategicAnalysis,
  quality: V4PlanQualityEvaluation,
): { output: EngineOutput; improvementDiagnostics: MainFlowImprovementDiagnostics } {
  const mainFlowId = strategicAnalysis.mainFlow?.id ?? null;
  const gaps = findMainFlowGaps(input, output, mainFlowId);
  const gapMinutesBefore = quality.mainFlowQuality?.internalGapMinutes ?? gaps.reduce((sum, gap) => sum + gap.durationMinutes, 0);
  const baseDiagnostics = { gapsBefore: gaps.length, gapMinutesBefore, qualityBeforeImprovement: quality, detectedGaps: gaps };
  if (!mainFlowId || !quality.mainFlowQuality || gaps.length === 0) {
    return { output, improvementDiagnostics: { applied: false, reason: "No safe main flow continuity improvement found.", ...baseDiagnostics } };
  }

  const plannedIds = new Set((output.plannedTasks ?? []).map((item) => Number(item.taskId)));
  const candidates = (input.tasks ?? []).filter((task) => taskSpaceId(task) === mainFlowId && task.status === "pending" && !plannedIds.has(Number(task.id)) && !hasLock(input, Number(task.id)));
  const skippedReasons: string[] = [];
  const beforeUnplanned = unplannedCount(output);
  const beforeMakespan = quality.makespan.fromWorkDayStartMinutes ?? quality.makespan.plannedDayDurationMinutes;

  for (const gap of gaps) {
    const gapStart = toMinutes(gap.start)!;
    const gapEnd = toMinutes(gap.end)!;
    for (const task of candidates) {
      const duration = taskDuration(task);
      if (duration > gapEnd - gapStart) { skippedReasons.push(`Task ${task.id} does not fit gap ${gap.start}-${gap.end}.`); continue; }
      const candidate = candidateOutputWithTask(output, task, gapStart, gapStart + duration);
      const validation = validateHardConstraints(input as any, candidate);
      if (!validation.hardValidationPassed) { skippedReasons.push(`Task ${task.id} rejected by hard validation: ${validation.hardConstraintViolationCodes.join(",") || "unknown"}.`); continue; }
      const afterQuality = evaluateV4PlanQuality(input, candidate, strategicAnalysis);
      const afterGapMinutes = afterQuality.mainFlowQuality?.internalGapMinutes ?? gapMinutesBefore;
      const afterUnplanned = unplannedCount(candidate);
      const afterMakespan = afterQuality.makespan.fromWorkDayStartMinutes ?? afterQuality.makespan.plannedDayDurationMinutes;
      if (afterGapMinutes >= gapMinutesBefore || afterUnplanned > beforeUnplanned || afterMakespan > beforeMakespan + 15 || candidate.hardFeasible === false) {
        skippedReasons.push(`Task ${task.id} did not pass conservative acceptance criteria.`);
        continue;
      }
      const afterGaps = afterQuality.mainFlowQuality?.internalGapCount ?? findMainFlowGaps(input, candidate, mainFlowId).length;
      return {
        output: candidate,
        improvementDiagnostics: {
          applied: true,
          ...baseDiagnostics,
          gapsAfter: afterGaps,
          gapMinutesAfter: afterGapMinutes,
          moves: [{ taskId: task.id, from: "unplanned", toStart: toHHMM(gapStart), toEnd: toHHMM(gapStart + duration), coveredGapStart: gap.start, coveredGapEnd: gap.end }],
          skippedReasons,
        },
      };
    }
  }

  return { output, improvementDiagnostics: { applied: false, reason: "No safe main flow continuity improvement found.", ...baseDiagnostics, moves: [], skippedReasons } };
}
