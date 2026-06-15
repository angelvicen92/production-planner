import type { EngineOutput, TaskInput } from "../types";
import type { EngineV3Input } from "./types";
import { detectCoachAssignments } from "./coachDetection";
import { validateHardConstraints } from "./hardValidation";
import { getMealMode, getMealWindow, isMealTask, mealOccupiesSpace } from "./mealSemantics";
import { toMinutes } from "./metrics";
import { calculateEngineOperationalCompactionMetrics } from "./operationalQuality";
import { getDependencyIds } from "./operationalPriority";
import { scoreCandidateSolution, type CandidateSolutionScore } from "./solutionScoring";
import { validateOptimizedCandidate } from "./validateCandidate";
import { getSpaceCapacity } from "./spaceCapacity";

export const SEGMENT_SOLVER_MAX_TASKS = 25;
export const SEGMENT_SOLVER_MAX_SEGMENTS = 3;
export const SEGMENT_SOLVER_MAX_MICROSEGMENTS = 4;
export const SEGMENT_SOLVER_MAX_MICRO_TASKS = 18;
export const SEGMENT_SOLVER_MAX_EXPANDED_TASKS = 22;
export const SEGMENT_SOLVER_MAX_MICRO_MOVABLE_TASKS = 14;
export const SEGMENT_SOLVER_MAX_EXPANDED_MOVABLE_TASKS = 16;
export const SEGMENT_SOLVER_MAX_ASSIGNMENTS = 2_500;
export const SEGMENT_SOLVER_GRID_MINUTES = 5;
export const SEGMENT_SOLVER_DEFAULT_TIMEOUT_MS = 4_000;
export const SEGMENT_SOLVER_MICRO_TIMEOUT_MS = 1_200;
export const SEGMENT_SOLVER_MAX_WINDOW_MINUTES = 5 * 60;
export const SEGMENT_SOLVER_MAX_REPAIR_DEPTH = 2;
export const SEGMENT_SOLVER_MAX_REPAIR_ADDED_TASKS = 6;
export const SEGMENT_SOLVER_MAX_REPAIR_MOVED_TASKS = 10;

type MicroSegmentStrategy = "bridge" | "left_shift_right_block" | "right_shift_left_block" | "coach_block_reorder" | "left_shift_with_blocker_expansion" | "right_shift_with_blocker_expansion" | "bridge_with_blocker_expansion";

export type SegmentSolverReason =
  | "accepted"
  | "candidate_not_better"
  | "segment_candidate_valid_but_not_better"
  | "no_problematic_coach_segment"
  | "segment_too_large"
  | "wide_segment_too_large_microsegments_attempted"
  | "microsegment_no_valid_candidate"
  | "solver_disabled"
  | "missing_solver_runtime"
  | "no_movable_tasks"
  | "segment_solver_timeout"
  | "primary_stage_fixed_overlap_no_safe_offset"
  | "cancelled";

export interface PrimaryStageFixedInterval {
  taskId: number;
  spaceId: number;
  spaceName: string;
  start: string;
  end: string;
  fixedReason: string;
}

export type SegmentSolverCompactMetrics = Pick<CandidateSolutionScore,
  | "maxCoachGapMinutes" | "coachSplitDayPenalty" | "coachIdlePenalty" | "coachSpanPenalty"
  | "talentIdlePenalty" | "makespan" | "hardConstraintViolations" | "mainStageGapMinutes" | "plannedTasks"
>;

export interface CriticalCoachGap {
  coachId: number;
  coachName: string;
  gapStart: number;
  gapEnd: number;
  gapMinutes: number;
  leftBlockTaskIds: number[];
  rightBlockTaskIds: number[];
  leftBlockTalentNames: string[];
  rightBlockTalentNames: string[];
}

export interface SegmentSolverMeta {
  segmentSolverAttempted: boolean;
  segmentSolverBackend: "bounded_exact_search";
  segmentSolverSegmentsBuilt: number;
  segmentSolverCandidatesGenerated: number;
  segmentSolverAccepted: boolean;
  segmentSolverReason: SegmentSolverReason | string;
  segmentSolverRejectedReasons: string[];
  segmentSolverTargetCoachName?: string;
  segmentSolverWindowStart?: string;
  segmentSolverWindowEnd?: string;
  segmentSolverTaskCount?: number;
  segmentSolverTalentNames?: string[];
  segmentSolverResourceNames?: string[];
  segmentSolverCriticalGapStart?: string;
  segmentSolverCriticalGapEnd?: string;
  segmentSolverCriticalGapMinutes?: number;
  segmentSolverLeftBlockTalentNames?: string[];
  segmentSolverRightBlockTalentNames?: string[];
  segmentSolverMicroSegmentsBuilt: number;
  segmentSolverMicroSegmentStrategiesTried: string[];
  segmentSolverMicroSegmentTaskCounts: number[];
  segmentSolverMicroSegmentRejectedReasons: string[];
  segmentSolverAssignmentsExplored: number;
  segmentSolverValidCandidates: number;
  segmentSolverBestCandidateMovedTaskIds: number[];
  segmentSolverBestCandidateMovedTalentNames: string[];
  segmentSolverBestCandidateReason?: string;
  segmentSolverBestBefore?: SegmentSolverCompactMetrics;
  segmentSolverBestAfter?: SegmentSolverCompactMetrics;
  segmentSolverImprovement?: string;
  segmentSolverTimeoutMs: number;
  segmentSolverElapsedMs: number;
  segmentSolverMealMovesAttempted: boolean;
  segmentSolverMealMovesAccepted: boolean;
  segmentSolverMealMoveCount: number;
  segmentSolverMealRejectedReasons: string[];
  segmentSolverTopBlockers: SegmentSolverBlocker[];
  segmentSolverTopResourceBlockers: SegmentSolverBlocker[];
  segmentSolverTopDependencyBlockers: SegmentSolverBlocker[];
  segmentSolverTopMealBlockers: SegmentSolverBlocker[];
  segmentSolverTopMainStageBlockers: SegmentSolverBlocker[];
  segmentSolverLocalChecksPerformed: number;
  segmentSolverLocalChecksRejected: number;
  segmentSolverFullValidationsPerformed: number;
  segmentSolverFullValidationsRejected: number;
  segmentSolverFullValidationTopFailures: SegmentSolverFullValidationFailure[];
  segmentSolverFullValidationFailureCodes: string[];
  segmentSolverFullValidationFailureSummary: Record<string, number>;
  segmentSolverUnderlyingFailureCodes: string[];
  segmentSolverUnderlyingFailureSummary: Record<string, number>;
  segmentSolverBestUnderlyingFailure?: string;
  segmentSolverBestUnderlyingFailureDetails?: Record<string, unknown>;
  segmentSolverCandidateIntegrityChecksPerformed: number;
  segmentSolverCandidateIntegrityFailures: number;
  segmentSolverCandidateIntegrityTopFailures: SegmentSolverCandidateIntegrityFailure[];
  segmentSolverBestRepairRejectedBy?: string;
  segmentSolverBestRepairMovedTaskIds: number[];
  segmentSolverBestRepairMovedTalentNames: string[];
  segmentSolverExpandedMicroSegmentsBuilt: number;
  segmentSolverExpansionTaskIds: number[];
  segmentSolverExpansionReasons: string[];
  segmentSolverExpansionRejectedReasons: string[];
  segmentSolverDirectRepairsAttempted: number;
  segmentSolverDirectRepairsAccepted: number;
  segmentSolverDirectRepairStrategiesTried: string[];
  segmentSolverDirectRepairRejectedReasons: string[];
  segmentSolverRepairChainsAttempted: number;
  segmentSolverRepairChainsAccepted: number;
  segmentSolverRepairChainMaxDepthReached: number;
  segmentSolverRepairChainDepths: number[];
  segmentSolverRepairChainMovedTaskIds: number[];
  segmentSolverRepairChainBlockedBy: string[];
  segmentSolverRepairChainRejectedReasons: string[];
  segmentSolverEarlyStopReason?: string;
  segmentSolverBestFeasibleSeenAtMs?: number;
  segmentSolverFeasibleButNotSelected: boolean;
  segmentSolverCandidateMetrics: SegmentSolverCandidateMetrics[];
  segmentSolverFeasibleComparison?: {
    selectedMaxCoachGap: number;
    candidateMaxCoachGap: number;
    selectedMakespan: number;
    candidateMakespan: number;
    notSelectedReason: string;
  };
  segmentSolverPrimaryStageGuardEnabled: boolean;
  segmentSolverPrimaryStageFixedIntervals: PrimaryStageFixedInterval[];
  segmentSolverPrimaryStagePrunedCandidates: number;
  segmentSolverPrimaryStagePruneReasons: string[];
  segmentSolverPrimaryStagePruneDetails: Array<Record<string, unknown>>;
  segmentSolverPrimaryStageGuardMisses: number;
  segmentSolverPrimaryStageGuardMissDetails: Array<Record<string, unknown>>;
}

export interface SegmentSolverOptions {
  timeoutMs?: number;
  maxSegments?: number;
  disabled?: boolean;
  shouldCancel?: () => boolean;
}

export const normalizeSegmentSolverMetadata = (meta?: Partial<NonNullable<EngineOutput["v3Meta"]>> | Partial<SegmentSolverMeta>): Partial<NonNullable<EngineOutput["v3Meta"]>> => ({
  segmentSolverAttempted: meta?.segmentSolverAttempted ?? false,
  segmentSolverBackend: meta?.segmentSolverBackend ?? "bounded_exact_search",
  segmentSolverSegmentsBuilt: meta?.segmentSolverSegmentsBuilt ?? 0,
  segmentSolverCandidatesGenerated: meta?.segmentSolverCandidatesGenerated ?? 0,
  segmentSolverAccepted: meta?.segmentSolverAccepted ?? false,
  segmentSolverReason: meta?.segmentSolverReason ?? "no_problematic_coach_segment",
  segmentSolverRejectedReasons: meta?.segmentSolverRejectedReasons ?? [],
  segmentSolverMicroSegmentsBuilt: meta?.segmentSolverMicroSegmentsBuilt ?? 0,
  segmentSolverMicroSegmentStrategiesTried: meta?.segmentSolverMicroSegmentStrategiesTried ?? [],
  segmentSolverMicroSegmentTaskCounts: meta?.segmentSolverMicroSegmentTaskCounts ?? [],
  segmentSolverMicroSegmentRejectedReasons: meta?.segmentSolverMicroSegmentRejectedReasons ?? [],
  segmentSolverAssignmentsExplored: meta?.segmentSolverAssignmentsExplored ?? 0,
  segmentSolverValidCandidates: meta?.segmentSolverValidCandidates ?? 0,
  segmentSolverBestCandidateMovedTaskIds: meta?.segmentSolverBestCandidateMovedTaskIds ?? [],
  segmentSolverBestCandidateMovedTalentNames: meta?.segmentSolverBestCandidateMovedTalentNames ?? [],
  segmentSolverTimeoutMs: meta?.segmentSolverTimeoutMs ?? SEGMENT_SOLVER_DEFAULT_TIMEOUT_MS,
  segmentSolverElapsedMs: meta?.segmentSolverElapsedMs ?? 0,
  segmentSolverMealMovesAttempted: meta?.segmentSolverMealMovesAttempted ?? false,
  segmentSolverMealMovesAccepted: meta?.segmentSolverMealMovesAccepted ?? false,
  segmentSolverMealMoveCount: meta?.segmentSolverMealMoveCount ?? 0,
  segmentSolverMealRejectedReasons: meta?.segmentSolverMealRejectedReasons ?? [],
  segmentSolverTopBlockers: meta?.segmentSolverTopBlockers ?? [],
  segmentSolverTopResourceBlockers: meta?.segmentSolverTopResourceBlockers ?? [],
  segmentSolverTopDependencyBlockers: meta?.segmentSolverTopDependencyBlockers ?? [],
  segmentSolverTopMealBlockers: meta?.segmentSolverTopMealBlockers ?? [],
  segmentSolverTopMainStageBlockers: meta?.segmentSolverTopMainStageBlockers ?? [],
  segmentSolverLocalChecksPerformed: meta?.segmentSolverLocalChecksPerformed ?? 0,
  segmentSolverLocalChecksRejected: meta?.segmentSolverLocalChecksRejected ?? 0,
  segmentSolverFullValidationsPerformed: meta?.segmentSolverFullValidationsPerformed ?? 0,
  segmentSolverFullValidationsRejected: meta?.segmentSolverFullValidationsRejected ?? 0,
  segmentSolverFullValidationTopFailures: meta?.segmentSolverFullValidationTopFailures ?? [],
  segmentSolverFullValidationFailureCodes: meta?.segmentSolverFullValidationFailureCodes ?? [],
  segmentSolverFullValidationFailureSummary: meta?.segmentSolverFullValidationFailureSummary ?? {},
  segmentSolverUnderlyingFailureCodes: meta?.segmentSolverUnderlyingFailureCodes ?? [],
  segmentSolverUnderlyingFailureSummary: meta?.segmentSolverUnderlyingFailureSummary ?? {},
  segmentSolverCandidateIntegrityChecksPerformed: meta?.segmentSolverCandidateIntegrityChecksPerformed ?? 0,
  segmentSolverCandidateIntegrityFailures: meta?.segmentSolverCandidateIntegrityFailures ?? 0,
  segmentSolverCandidateIntegrityTopFailures: meta?.segmentSolverCandidateIntegrityTopFailures ?? [],
  segmentSolverBestRepairMovedTaskIds: meta?.segmentSolverBestRepairMovedTaskIds ?? [],
  segmentSolverBestRepairMovedTalentNames: meta?.segmentSolverBestRepairMovedTalentNames ?? [],
  segmentSolverExpandedMicroSegmentsBuilt: meta?.segmentSolverExpandedMicroSegmentsBuilt ?? 0,
  segmentSolverExpansionTaskIds: meta?.segmentSolverExpansionTaskIds ?? [],
  segmentSolverExpansionReasons: meta?.segmentSolverExpansionReasons ?? [],
  segmentSolverExpansionRejectedReasons: meta?.segmentSolverExpansionRejectedReasons ?? [],
  segmentSolverDirectRepairsAttempted: meta?.segmentSolverDirectRepairsAttempted ?? 0,
  segmentSolverDirectRepairsAccepted: meta?.segmentSolverDirectRepairsAccepted ?? 0,
  segmentSolverDirectRepairStrategiesTried: meta?.segmentSolverDirectRepairStrategiesTried ?? [],
  segmentSolverDirectRepairRejectedReasons: meta?.segmentSolverDirectRepairRejectedReasons ?? [],
  segmentSolverRepairChainsAttempted: meta?.segmentSolverRepairChainsAttempted ?? 0,
  segmentSolverRepairChainsAccepted: meta?.segmentSolverRepairChainsAccepted ?? 0,
  segmentSolverRepairChainMaxDepthReached: meta?.segmentSolverRepairChainMaxDepthReached ?? 0,
  segmentSolverRepairChainDepths: meta?.segmentSolverRepairChainDepths ?? [],
  segmentSolverRepairChainMovedTaskIds: meta?.segmentSolverRepairChainMovedTaskIds ?? [],
  segmentSolverRepairChainBlockedBy: meta?.segmentSolverRepairChainBlockedBy ?? [],
  segmentSolverRepairChainRejectedReasons: meta?.segmentSolverRepairChainRejectedReasons ?? [],
  segmentSolverFeasibleButNotSelected: meta?.segmentSolverFeasibleButNotSelected ?? false,
  segmentSolverCandidateMetrics: meta?.segmentSolverCandidateMetrics ?? [],
  segmentSolverPrimaryStageGuardEnabled: meta?.segmentSolverPrimaryStageGuardEnabled ?? false,
  segmentSolverPrimaryStageFixedIntervals: meta?.segmentSolverPrimaryStageFixedIntervals ?? [],
  segmentSolverPrimaryStagePrunedCandidates: meta?.segmentSolverPrimaryStagePrunedCandidates ?? 0,
  segmentSolverPrimaryStagePruneReasons: meta?.segmentSolverPrimaryStagePruneReasons ?? [],
  segmentSolverPrimaryStagePruneDetails: meta?.segmentSolverPrimaryStagePruneDetails ?? [],
  segmentSolverPrimaryStageGuardMisses: meta?.segmentSolverPrimaryStageGuardMisses ?? 0,
  segmentSolverPrimaryStageGuardMissDetails: meta?.segmentSolverPrimaryStageGuardMissDetails ?? [],
}) as Partial<NonNullable<EngineOutput["v3Meta"]>>;

export interface CriticalCoachSegment {
  coachId: number;
  coachName: string;
  windowStart: number;
  windowEnd: number;
  taskIds: number[];
  movableTaskIds: number[];
  talentIds: number[];
  talentNames: string[];
  resourceIds: number[];
  resourceNames: string[];
}

export interface CoachMicroSegment extends CriticalCoachSegment {
  strategy: MicroSegmentStrategy;
  offsetMinutes: number[];
  targetTaskIds: number[];
}

const hhmm = (value: number): string => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const roundUpGrid = (value: number): number => Math.ceil(value / SEGMENT_SOLVER_GRID_MINUTES) * SEGMENT_SOLVER_GRID_MINUTES;
const normalize = (value: unknown): string => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const intervalOverlaps = (start: number, end: number, windowStart: number, windowEnd: number) => start < windowEnd && windowStart < end;
const uniq = <T>(values: T[]): T[] => [...new Set(values)];

const compactMetrics = (score: CandidateSolutionScore): SegmentSolverCompactMetrics => ({
  maxCoachGapMinutes: score.maxCoachGapMinutes,
  coachSplitDayPenalty: score.coachSplitDayPenalty,
  coachIdlePenalty: score.coachIdlePenalty,
  coachSpanPenalty: score.coachSpanPenalty,
  talentIdlePenalty: score.talentIdlePenalty,
  makespan: score.makespan,
  hardConstraintViolations: score.hardConstraintViolations,
  mainStageGapMinutes: score.mainStageGapMinutes,
  plannedTasks: score.plannedTasks,
});

const taskLabel = (input: EngineV3Input, task: TaskInput): string => normalize(task.templateName ?? input.taskTemplateNameById?.[Number(task.templateId)] ?? "");
const isTransportTask = (input: EngineV3Input, task: TaskInput): boolean => {
  if (Number(input.transportSpaceId ?? NaN) === Number(task.spaceId ?? NaN)) return true;
  const configured = [input.arrivalTaskTemplateName, input.departureTaskTemplateName].map(normalize).filter(Boolean);
  const label = taskLabel(input, task);
  return configured.includes(label) || /(^|\s)(transport|transporte|traslado|llegada|salida|recogida|pickup|dropoff)(\s|$)/.test(label);
};

const isFixedTask = (input: EngineV3Input, task: TaskInput): boolean => {
  const status = normalize(task.status);
  if (status === "done" || status === "in_progress" || status === "cancelled") return true;
  if (Boolean((task as any).isManualBlock)) return true;
  if ((input.locks ?? []).some((lock) => Number(lock.taskId) === Number(task.id))) return true;
  if (Number(task.zoneId ?? NaN) === Number(input.optimizerMainZoneId ?? NaN)) return true;
  if (isTransportTask(input, task)) return true;
  if ((task.fixedWindowStart || task.fixedWindowEnd) && !isMealTask(input, task)) return true;
  return false;
};

const fixedReason = (input: EngineV3Input, task: TaskInput): string => {
  const status = normalize(task.status);
  if (status === "done" || status === "in_progress") return status;
  if ((input.locks ?? []).some((lock) => Number(lock.taskId) === Number(task.id))) return "explicit_lock";
  if (Boolean((task as any).isManualBlock)) return "synthetic_block";
  if (task.fixedWindowStart || task.fixedWindowEnd) return "fixed_window";
  return "primary_stage_default_fixed";
};

export const buildPrimaryStageFixedIntervals = (
  input: EngineV3Input,
  output: EngineOutput,
): PrimaryStageFixedInterval[] => {
  const mainZoneId = Number(input.optimizerMainZoneId);
  if (!Number.isFinite(mainZoneId)) return [];
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  return (output.plannedTasks ?? []).flatMap((planned): PrimaryStageFixedInterval[] => {
    const task = taskById.get(Number(planned.taskId));
    const start = toMinutes(planned.startPlanned);
    const end = toMinutes(planned.endPlanned);
    const spaceId = Number(task?.spaceId);
    if (!task || Number(task.zoneId) !== mainZoneId || !Number.isFinite(spaceId) || spaceId <= 0 || start === null || end === null || !isFixedTask(input, task)) return [];
    return [{
      taskId: Number(task.id),
      spaceId,
      spaceName: spaceName(input, spaceId),
      start: hhmm(start),
      end: hhmm(end),
      fixedReason: fixedReason(input, task),
    }];
  }).slice(0, 10);
};

export const findCriticalCoachGap = (input: EngineV3Input, output: EngineOutput, coachId: number): CriticalCoachGap | null => {
  const group = detectCoachAssignments(input, output).find((item) => Number(item.coachId) === Number(coachId));
  if (!group || group.intervals.length < 2 || group.coachId === null) return null;
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const intervals = [...group.intervals].sort((a, b) => a.start - b.start || a.end - b.end || a.taskId - b.taskId);
  let mergedEnd = intervals[0].end;
  let currentBlock = [intervals[0].taskId];
  let best: { start: number; end: number; left: number[]; right: number[] } | null = null;
  for (let index = 1; index < intervals.length; index += 1) {
    const interval = intervals[index];
    if (interval.start > mergedEnd) {
      const right: number[] = [interval.taskId];
      for (let cursor = index + 1; cursor < intervals.length && intervals[cursor].start <= interval.end; cursor += 1) right.push(intervals[cursor].taskId);
      if (!best || interval.start - mergedEnd > best.end - best.start) best = { start: mergedEnd, end: interval.start, left: [...currentBlock], right };
      currentBlock = [interval.taskId];
      mergedEnd = interval.end;
    } else {
      currentBlock.push(interval.taskId);
      mergedEnd = Math.max(mergedEnd, interval.end);
    }
  }
  if (!best || best.end <= best.start) return null;
  const names = (ids: number[]) => uniq(ids.map((id) => String(taskById.get(id)?.contestantName ?? "").trim()).filter(Boolean));
  return {
    coachId: group.coachId,
    coachName: group.coachName,
    gapStart: best.start,
    gapEnd: best.end,
    gapMinutes: best.end - best.start,
    leftBlockTaskIds: best.left,
    rightBlockTaskIds: best.right,
    leftBlockTalentNames: names(best.left),
    rightBlockTalentNames: names(best.right),
  };
};

export const buildCriticalCoachSegments = (input: EngineV3Input, output: EngineOutput, maxSegments = SEGMENT_SOLVER_MAX_SEGMENTS): CriticalCoachSegment[] => {
  const plannedById = new Map((output.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const compaction = calculateEngineOperationalCompactionMetrics(input, output);
  const dayStart = toMinutes(input.workDay.start) ?? 0;
  const dayEnd = toMinutes(input.workDay.end) ?? 24 * 60;
  const resourceById = new Map((input.planResourceItems ?? []).map((resource) => [Number(resource.id), resource.name]));
  return compaction.coaches
    .filter((metric) => metric.maxGapMinutes > 0 && metric.idleMinutes > 0)
    .sort((a, b) => b.maxGapMinutes - a.maxGapMinutes || b.idleMinutes - a.idleMinutes || a.id - b.id)
    .slice(0, Math.max(0, maxSegments))
    .flatMap((metric): CriticalCoachSegment[] => {
      const gap = findCriticalCoachGap(input, output, metric.id);
      if (!gap) return [];
      let windowStart = Math.max(dayStart, gap.gapStart - 60);
      let windowEnd = Math.min(dayEnd, gap.gapEnd + 60);
      if (windowEnd - windowStart > SEGMENT_SOLVER_MAX_WINDOW_MINUTES) {
        const center = Math.floor((gap.gapStart + gap.gapEnd) / 2);
        windowStart = Math.max(dayStart, center - Math.floor(SEGMENT_SOLVER_MAX_WINDOW_MINUTES / 2));
        windowEnd = Math.min(dayEnd, windowStart + SEGMENT_SOLVER_MAX_WINDOW_MINUTES);
      }
      const coachTaskIds = new Set([...gap.leftBlockTaskIds, ...gap.rightBlockTaskIds]);
      const talentIds = new Set<number>();
      coachTaskIds.forEach((id) => {
        const talentId = Number(taskById.get(id)?.contestantId ?? NaN);
        if (Number.isFinite(talentId) && talentId > 0) talentIds.add(talentId);
      });
      const selected = new Set<number>();
      for (const task of input.tasks ?? []) {
        const planned = plannedById.get(Number(task.id));
        const start = toMinutes(planned?.startPlanned);
        const end = toMinutes(planned?.endPlanned);
        if (start === null || end === null || !intervalOverlaps(start, end, windowStart, windowEnd)) continue;
        if (coachTaskIds.has(Number(task.id)) || talentIds.has(Number(task.contestantId))) selected.add(Number(task.id));
      }
      let changed = true;
      while (changed && selected.size <= SEGMENT_SOLVER_MAX_TASKS * 4) {
        changed = false;
        for (const taskId of [...selected]) for (const dependencyId of getDependencyIds(taskById.get(taskId)!)) {
          if (taskById.has(dependencyId) && plannedById.has(dependencyId) && !selected.has(dependencyId)) { selected.add(dependencyId); changed = true; }
        }
      }
      const taskIds = [...selected].filter((id) => plannedById.has(id)).sort((a, b) => a - b);
      const movableTaskIds = taskIds.filter((id) => { const task = taskById.get(id); return Boolean(task && !isFixedTask(input, task)); });
      const resourceIds = uniq(taskIds.flatMap((id) => (plannedById.get(id)?.assignedResources ?? []).map(Number))).sort((a, b) => a - b);
      const talentNames = uniq([...talentIds].map((talentId) => input.tasks.find((task) => Number(task.contestantId) === talentId)?.contestantName?.trim() || `Talent ${talentId}`));
      return [{ coachId: gap.coachId, coachName: gap.coachName, windowStart, windowEnd, taskIds, movableTaskIds, talentIds: [...talentIds], talentNames, resourceIds, resourceNames: resourceIds.map((id) => resourceById.get(id) ?? `Resource ${id}`) }];
    });
};

export const buildCoachMicroSegments = (input: EngineV3Input, output: EngineOutput, gap: CriticalCoachGap): { segments: CoachMicroSegment[]; rejectedReasons: string[] } => {
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const plannedById = new Map((output.plannedTasks ?? []).map((task) => [Number(task.taskId), task]));
  const dayStart = toMinutes(input.workDay.start) ?? 0;
  const dayEnd = toMinutes(input.workDay.end) ?? 24 * 60;
  const resourceById = new Map((input.planResourceItems ?? []).map((resource) => [Number(resource.id), resource.name]));
  const rejected = new Set<string>();
  const definitions: Array<{ strategy: MicroSegmentStrategy; seeds: number[]; offsets: number[]; maxTalents: number; maxMovable: number }> = [
    { strategy: "left_shift_right_block", seeds: gap.rightBlockTaskIds.slice(0, 2), offsets: [-120, -90, -75, -60, -45, -30, -15], maxTalents: 3, maxMovable: 15 },
    { strategy: "bridge", seeds: [...gap.leftBlockTaskIds.slice(-2), ...gap.rightBlockTaskIds.slice(0, 2)], offsets: [-120, -90, -75, -60, -45, -30, -15, 15, 30], maxTalents: 4, maxMovable: 14 },
    { strategy: "coach_block_reorder", seeds: [...gap.leftBlockTaskIds.slice(-2), ...gap.rightBlockTaskIds.slice(0, 2)], offsets: [-60, -45, -30, -15, 15, 30], maxTalents: 4, maxMovable: 12 },
    { strategy: "right_shift_left_block", seeds: gap.leftBlockTaskIds.slice(-2), offsets: [15, 30, 45, 60, 75, 90, 120], maxTalents: 3, maxMovable: 15 },
  ];
  const segments: CoachMicroSegment[] = [];
  for (const definition of definitions) {
    const seedTasks = definition.seeds.map((id) => taskById.get(id)).filter((task): task is TaskInput => Boolean(task));
    const talentIds = uniq(seedTasks.map((task) => Number(task.contestantId)).filter((id) => Number.isFinite(id) && id > 0)).slice(0, definition.maxTalents);
    if (!talentIds.length) { rejected.add("microsegment_no_movable_tasks"); continue; }
    const windowStart = Math.max(dayStart, gap.gapStart - 45);
    const windowEnd = Math.min(dayEnd, gap.gapEnd + 45);
    const selected = new Set(definition.seeds);
    // Add only immediate dependencies and local flexible meals for directly involved talents.
    for (const seedId of definition.seeds) for (const depId of getDependencyIds(taskById.get(seedId)!)) if (plannedById.has(depId)) selected.add(depId);
    for (const task of input.tasks ?? []) {
      const id = Number(task.id);
      if (!talentIds.includes(Number(task.contestantId))) continue;
      const planned = plannedById.get(id);
      const start = toMinutes(planned?.startPlanned); const end = toMinutes(planned?.endPlanned);
      if (start === null || end === null || !intervalOverlaps(start, end, windowStart, windowEnd)) continue;
      if (definition.seeds.includes(id) || isMealTask(input, task) || getDependencyIds(task).some((depId) => definition.seeds.includes(depId))) selected.add(id);
    }
    // Destination conflicts deliberately stay outside until incremental checks identify a concrete blocker.
    const ordered = [...selected].filter((id) => plannedById.has(id)).sort((a, b) => {
      const aSeed = definition.seeds.includes(a) ? 0 : 1; const bSeed = definition.seeds.includes(b) ? 0 : 1;
      return aSeed - bSeed || Math.abs((toMinutes(plannedById.get(a)?.startPlanned) ?? gap.gapStart) - gap.gapStart) - Math.abs((toMinutes(plannedById.get(b)?.startPlanned) ?? gap.gapStart) - gap.gapStart) || a - b;
    });
    if (ordered.length > SEGMENT_SOLVER_MAX_MICRO_TASKS) rejected.add("microsegment_dependency_closure_too_large");
    const taskIds = ordered.slice(0, SEGMENT_SOLVER_MAX_MICRO_TASKS);
    const movableTaskIds = taskIds.filter((id) => { const task = taskById.get(id); return Boolean(task && !isFixedTask(input, task)); }).slice(0, definition.maxMovable);
    if (!movableTaskIds.length) { rejected.add(taskIds.length ? "microsegment_all_fixed" : "microsegment_no_movable_tasks"); continue; }
    const resourceIds = uniq(taskIds.flatMap((id) => (plannedById.get(id)?.assignedResources ?? []).map(Number))).sort((a, b) => a - b);
    segments.push({
      strategy: definition.strategy, coachId: gap.coachId, coachName: gap.coachName, windowStart, windowEnd,
      taskIds, movableTaskIds, targetTaskIds: definition.seeds.filter((id) => movableTaskIds.includes(id)), offsetMinutes: definition.offsets,
      talentIds, talentNames: uniq(talentIds.map((id) => input.tasks.find((task) => Number(task.contestantId) === id)?.contestantName?.trim() || `Talent ${id}`)),
      resourceIds, resourceNames: resourceIds.map((id) => resourceById.get(id) ?? `Resource ${id}`),
    });
    if (segments.length >= SEGMENT_SOLVER_MAX_MICROSEGMENTS) break;
  }
  return { segments, rejectedReasons: [...rejected] };
};

const compareSegmentScores = (candidate: CandidateSolutionScore, baseline: CandidateSolutionScore, changedTasks: number, baselineChanges: number): number => {
  const checks: Array<[number, number]> = [
    [candidate.hardConstraintViolations, baseline.hardConstraintViolations], [candidate.mainStageGapMinutes, baseline.mainStageGapMinutes],
    [baseline.plannedTasks, candidate.plannedTasks], [candidate.maxCoachGapMinutes, baseline.maxCoachGapMinutes],
    [candidate.coachSplitDayPenalty, baseline.coachSplitDayPenalty], [candidate.coachIdlePenalty, baseline.coachIdlePenalty],
    [candidate.coachSpanPenalty, baseline.coachSpanPenalty], [candidate.talentIdlePenalty, baseline.talentIdlePenalty],
    [candidate.makespan, baseline.makespan], [changedTasks, baselineChanges],
  ];
  for (const [left, right] of checks) if (left !== right) return left < right ? 1 : -1;
  return 0;
};

const changedTaskIds = (baseline: EngineOutput, candidate: EngineOutput): number[] => {
  const before = new Map((baseline.plannedTasks ?? []).map((task) => [Number(task.taskId), `${task.startPlanned}-${task.endPlanned}-${(task.assignedResources ?? []).join(",")}`]));
  return (candidate.plannedTasks ?? []).filter((task) => before.get(Number(task.taskId)) !== `${task.startPlanned}-${task.endPlanned}-${(task.assignedResources ?? []).join(",")}`).map((task) => Number(task.taskId));
};
const candidateWithStarts = (baseline: EngineOutput, starts: Map<number, number>): EngineOutput => ({ ...baseline, plannedTasks: (baseline.plannedTasks ?? []).map((planned) => {
  const start = starts.get(Number(planned.taskId)); if (start === undefined) return planned;
  const oldStart = toMinutes(planned.startPlanned); const oldEnd = toMinutes(planned.endPlanned);
  return oldStart === null || oldEnd === null ? planned : { ...planned, startPlanned: hhmm(start), endPlanned: hhmm(start + oldEnd - oldStart) };
}) });

export type SegmentMoveRejectionCode =
  | "resource_overlap_with_outside_task" | "dependency_predecessor_outside_segment" | "dependency_successor_outside_segment"
  | "meal_slot_resource_conflict" | "main_stage_gap_would_open" | "talent_overlap_with_outside_task"
  | "space_overlap_with_outside_task" | "fixed_task_blocks_shift" | "microsegment_expansion_limit_reached"
  | "local_move_outside_workday" | "microsegment_candidate_hard_invalid"
  | "primary_stage_fixed_overlap" | "main_stage_fixed_interval_overlap"
  | "primary_stage_task_not_movable" | "primary_stage_offset_adjusted" | "primary_stage_offset_no_safe_slot";

export interface SegmentSolverBlocker {
  strategy: string;
  offsetMinutes?: number;
  moveDescription?: string;
  rejectionCode: SegmentMoveRejectionCode | string;
  constraintType: "dependency" | "talent" | "resource" | "space" | "meal" | "main_stage" | "fixed" | "workday" | "hard";
  taskIds: number[];
  taskNames: string[];
  talentNames: string[];
  resourceId?: number;
  resourceName?: string;
  spaceId?: number;
  spaceName?: string;
  start?: string;
  end?: string;
  blockingTaskIds: number[];
  blockingTaskNames: string[];
  canExpandSegment: boolean;
  suggestedExpansionTaskIds: number[];
}

export interface SegmentSolverCandidateMetrics extends SegmentSolverCompactMetrics {
  movedTaskIds: number[];
  improvementMinutes: number;
  selected: boolean;
}

export interface SegmentSolverFullValidationFailure {
  strategy: string;
  movedTaskIds: number[];
  movedTalentNames: string[];
  repairChainDepth: number;
  fullValidationViolationCode: string;
  underlyingViolationCode: string;
  underlyingViolationDetails: Record<string, unknown>;
  fullValidationViolationDetails: Array<Record<string, unknown>>;
  constraintType: string;
  taskIds: number[];
  taskNames: string[];
  talentNames: string[];
  resourceName?: string;
  resourceId?: number;
  spaceName?: string;
  spaceId?: number;
  start?: string;
  end?: string;
  blockingTaskIds: number[];
  blockingTaskNames: string[];
  dependencyFromTaskId?: number;
  dependencyToTaskId?: number;
  repairStrategy: string;
  isMainStageRelated: boolean;
  isMealRelated: boolean;
  isTransportRelated: boolean;
  isFixedRelated: boolean;
}

export interface SegmentSolverCandidateIntegrityFailure {
  code: string;
  taskIds: number[];
  details?: Record<string, unknown>;
}

export const validateSegmentCandidateIntegrity = (
  baseline: EngineOutput,
  candidate: EngineOutput,
  movedTaskIds: number[],
): SegmentSolverCandidateIntegrityFailure[] => {
  const failures: SegmentSolverCandidateIntegrityFailure[] = [];
  const before = baseline.plannedTasks ?? [];
  const after = candidate.plannedTasks ?? [];
  const beforeById = new Map(before.map((task) => [Number(task.taskId), task]));
  const counts = new Map<number, number>();
  for (const task of after) counts.set(Number(task.taskId), (counts.get(Number(task.taskId)) ?? 0) + 1);
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  if (duplicates.length) failures.push({ code: "candidate_duplicate_task", taskIds: duplicates });
  const lost = before.map((task) => Number(task.taskId)).filter((id) => !counts.has(id));
  if (lost.length) failures.push({ code: "candidate_lost_task", taskIds: lost });
  const unexpected = after.map((task) => Number(task.taskId)).filter((id) => !beforeById.has(id));
  if (unexpected.length) failures.push({ code: "candidate_unknown_task", taskIds: unexpected });
  const invalid = after.filter((task) => {
    const start = toMinutes(task.startPlanned); const end = toMinutes(task.endPlanned);
    return start === null || end === null || start >= end;
  }).map((task) => Number(task.taskId));
  if (invalid.length) failures.push({ code: "candidate_invalid_time_range", taskIds: invalid });
  const durationChanged = after.filter((task) => {
    const original = beforeById.get(Number(task.taskId));
    const start = toMinutes(task.startPlanned); const end = toMinutes(task.endPlanned);
    const oldStart = toMinutes(original?.startPlanned); const oldEnd = toMinutes(original?.endPlanned);
    return original && start !== null && end !== null && oldStart !== null && oldEnd !== null && end - start !== oldEnd - oldStart;
  }).map((task) => Number(task.taskId));
  if (durationChanged.length) failures.push({ code: "candidate_duration_changed", taskIds: durationChanged });
  const resourcesLost = after.filter((task) => {
    const original = beforeById.get(Number(task.taskId));
    return original && JSON.stringify(original.assignedResources ?? []) !== JSON.stringify(task.assignedResources ?? []);
  }).map((task) => Number(task.taskId));
  if (resourcesLost.length) failures.push({ code: "candidate_resource_assignment_lost", taskIds: resourcesLost });
  const missingMoved = movedTaskIds.filter((id) => !beforeById.has(id) || !counts.has(id));
  if (missingMoved.length) failures.push({ code: "candidate_patch_integrity_error", taskIds: missingMoved });
  if (after.length !== before.length && !lost.length && !duplicates.length) {
    failures.push({ code: "candidate_planned_task_count_mismatch", taskIds: [], details: { expected: before.length, actual: after.length } });
  }
  return failures;
};

const optimizedErrorCode = (error: string): string => {
  if (error.startsWith("CONTESTANT_OVERLAP_")) return "TALENT_OVERLAP";
  if (error.startsWith("RESOURCE_OVERLAP_")) return "RESOURCE_OVERLAP";
  if (error.startsWith("SPACE_CAPACITY_EXCEEDED_")) return "SPACE_OVERLAP";
  if (error.startsWith("DEPENDENCY_BROKEN_")) return "DEPENDENCY_VIOLATION";
  if (error.startsWith("MOVED_LOCKED_TIME_")) return "LOCK_MOVED";
  if (error.startsWith("MOVED_FIXED_STATUS_")) return "FIXED_STATUS_MOVED";
  if (error.startsWith("INVALID_INTERVAL_")) return "INVALID_TIME_RANGE";
  if (error.startsWith("DURATION_CHANGED_")) return "DURATION_CHANGED";
  if (error.startsWith("UNKNOWN_TASK_")) return "MISSING_TASK";
  if (error.startsWith("OUTSIDE_WORKDAY_")) return "AVAILABILITY_VIOLATION";
  return "OPTIMIZED_CANDIDATE_INVALID";
};

export const explainOptimizedCandidateInvalid = (
  candidate: EngineOutput,
  input: EngineV3Input,
  context: { baseline: EngineOutput; movedTaskIds: number[]; repairStrategy?: string; repairChainDepth?: number },
): SegmentSolverFullValidationFailure => {
  const validation = validateHardConstraints(input, candidate);
  const optimizedErrors = validateOptimizedCandidate(input, context.baseline, candidate);
  const detail = validation.hardConstraintViolationDetails[0];
  const error = optimizedErrors[0] ?? "";
  const underlyingViolationCode = detail?.code === "CONTESTANT_OVERLAP" ? "TALENT_OVERLAP" : detail?.code ?? optimizedErrorCode(error);
  const parsedIds = error.match(/\d+/g)?.map(Number) ?? [];
  const taskIds = uniq(detail?.taskIds?.length ? detail.taskIds : parsedIds.slice(-2));
  const moved = new Set(context.movedTaskIds);
  const blockingTaskIds = taskIds.filter((id) => !moved.has(id));
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const related = taskIds.map((id) => taskById.get(id)).filter((task): task is TaskInput => Boolean(task));
  const constraintType = underlyingViolationCode.includes("DEPENDENCY") ? "dependency"
    : underlyingViolationCode.includes("TALENT") || underlyingViolationCode.includes("CONTESTANT") ? "talent"
      : underlyingViolationCode.includes("RESOURCE") ? "resource"
        : underlyingViolationCode.includes("SPACE") ? "space"
          : underlyingViolationCode.includes("MEAL") ? "meal"
            : underlyingViolationCode.includes("LOCK") || underlyingViolationCode.includes("FIXED") ? "fixed" : "hard";
  const dependencyFromTaskId = underlyingViolationCode === "DEPENDENCY_VIOLATION" ? taskIds[0] : undefined;
  const dependencyToTaskId = underlyingViolationCode === "DEPENDENCY_VIOLATION" ? taskIds[1] : undefined;
  const underlyingViolationDetails = { optimizedError: error || undefined, hardValidationDetail: detail };
  return {
    strategy: context.repairStrategy ?? "segment_move",
    repairStrategy: context.repairStrategy ?? "segment_move",
    movedTaskIds: context.movedTaskIds,
    movedTalentNames: uniq(context.movedTaskIds.map((id) => String(taskById.get(id)?.contestantName ?? "").trim()).filter(Boolean)),
    repairChainDepth: context.repairChainDepth ?? 0,
    fullValidationViolationCode: "OPTIMIZED_CANDIDATE_INVALID",
    underlyingViolationCode,
    underlyingViolationDetails,
    fullValidationViolationDetails: detail ? [{ ...detail }] : [underlyingViolationDetails],
    constraintType,
    taskIds,
    taskNames: related.map((task) => taskLabel(input, task) || `Task ${task.id}`),
    talentNames: uniq(related.map((task) => String(task.contestantName ?? "").trim()).filter(Boolean)),
    resourceId: detail?.resourceId,
    resourceName: detail?.resourceId ? resourceName(input, detail.resourceId) : undefined,
    spaceId: detail?.spaceId,
    spaceName: detail?.spaceName,
    start: detail?.start,
    end: detail?.end,
    blockingTaskIds,
    blockingTaskNames: blockingTaskIds.map((id) => blockerName(input, id)),
    dependencyFromTaskId,
    dependencyToTaskId,
    isMainStageRelated: related.some((task) => Number(task.zoneId) === Number(input.optimizerMainZoneId)),
    isMealRelated: related.some((task) => isMealTask(input, task)),
    isTransportRelated: related.some((task) => isTransportTask(input, task)),
    isFixedRelated: related.some((task) => isFixedTask(input, task)),
  };
};

type LocalMoveContext = {
  segment: CoachMicroSegment;
  starts: Map<number, number>;
  strategy: string;
  offsetMinutes?: number;
  moveDescription?: string;
};

type PlannedInterval = { taskId: number; task: TaskInput; start: number; end: number; resources: number[] };

const intervalIndex = (input: EngineV3Input, output: EngineOutput, starts = new Map<number, number>()): PlannedInterval[] => {
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  return (output.plannedTasks ?? []).flatMap((planned): PlannedInterval[] => {
    const taskId = Number(planned.taskId); const task = taskById.get(taskId);
    const oldStart = toMinutes(planned.startPlanned); const oldEnd = toMinutes(planned.endPlanned);
    if (!task || oldStart === null || oldEnd === null) return [];
    const start = starts.get(taskId) ?? oldStart;
    return [{ taskId, task, start, end: start + oldEnd - oldStart, resources: (planned.assignedResources ?? []).map(Number) }];
  });
};

const blockerName = (input: EngineV3Input, taskId: number) => String(input.tasks.find((task) => Number(task.id) === taskId)?.templateName ?? input.taskTemplateNameById?.[Number(input.tasks.find((task) => Number(task.id) === taskId)?.templateId)] ?? `Task ${taskId}`);
const resourceName = (input: EngineV3Input, id: number) => input.planResourceItems.find((item) => Number(item.id) === id)?.name ?? `Resource ${id}`;
const spaceName = (input: EngineV3Input, id: number) => input.spaceNameById?.[id] ?? `Space ${id}`;

const makeBlocker = (
  input: EngineV3Input, context: LocalMoveContext, code: SegmentMoveRejectionCode, constraintType: SegmentSolverBlocker["constraintType"],
  moved: PlannedInterval[], blocking: PlannedInterval[] = [], extra: Partial<SegmentSolverBlocker> = {},
): SegmentSolverBlocker => {
  const blockingIds = uniq(blocking.map((item) => item.taskId));
  const movableBlocking = blockingIds.filter((id) => { const task = input.tasks.find((item) => Number(item.id) === id); return Boolean(task && !isFixedTask(input, task)); });
  return {
    strategy: context.strategy, offsetMinutes: context.offsetMinutes, moveDescription: context.moveDescription,
    rejectionCode: code, constraintType, taskIds: uniq(moved.map((item) => item.taskId)),
    taskNames: uniq(moved.map((item) => blockerName(input, item.taskId))),
    talentNames: uniq([...moved, ...blocking].map((item) => String(item.task.contestantName ?? "").trim()).filter(Boolean)),
    start: moved.length ? hhmm(Math.min(...moved.map((item) => item.start))) : undefined,
    end: moved.length ? hhmm(Math.max(...moved.map((item) => item.end))) : undefined,
    blockingTaskIds: blockingIds, blockingTaskNames: blockingIds.map((id) => blockerName(input, id)),
    canExpandSegment: movableBlocking.length > 0, suggestedExpansionTaskIds: movableBlocking.slice(0, 4), ...extra,
  };
};

/** Finds concrete baseline intervals blocking a local move, before full-plan validation. */
export const findBlockingIntervals = (input: EngineV3Input, baseline: EngineOutput, context: LocalMoveContext): SegmentSolverBlocker[] => {
  const effective = intervalIndex(input, baseline, context.starts);
  const movedIds = new Set(context.starts.keys());
  const moved = effective.filter((item) => movedIds.has(item.taskId));
  const outside = effective.filter((item) => !movedIds.has(item.taskId));
  const blockers: SegmentSolverBlocker[] = [];
  const segmentIds = new Set(context.segment.taskIds);
  const byId = new Map(effective.map((item) => [item.taskId, item]));
  const successors = new Map<number, number[]>();
  for (const item of effective) for (const dependencyId of getDependencyIds(item.task)) successors.set(dependencyId, [...(successors.get(dependencyId) ?? []), item.taskId]);

  for (const item of moved) {
    for (const dependencyId of getDependencyIds(item.task)) {
      const dependency = byId.get(dependencyId);
      if (dependency && item.start < dependency.end) blockers.push(makeBlocker(input, context, "dependency_predecessor_outside_segment", "dependency", [item], [dependency], { canExpandSegment: !segmentIds.has(dependencyId) && !isFixedTask(input, dependency.task), suggestedExpansionTaskIds: !segmentIds.has(dependencyId) && !isFixedTask(input, dependency.task) ? [dependencyId] : [] }));
    }
    for (const successorId of successors.get(item.taskId) ?? []) {
      const successor = byId.get(successorId);
      if (successor && successor.start < item.end) blockers.push(makeBlocker(input, context, "dependency_successor_outside_segment", "dependency", [item], [successor], { canExpandSegment: !segmentIds.has(successorId) && !isFixedTask(input, successor.task), suggestedExpansionTaskIds: !segmentIds.has(successorId) && !isFixedTask(input, successor.task) ? [successorId] : [] }));
    }
    for (const other of [...outside, ...moved.filter((candidate) => candidate.taskId > item.taskId)]) {
      if (!intervalOverlaps(item.start, item.end, other.start, other.end)) continue;
      if (Number(item.task.contestantId ?? 0) > 0 && Number(item.task.contestantId) === Number(other.task.contestantId)) blockers.push(makeBlocker(input, context, "talent_overlap_with_outside_task", "talent", [item], [other]));
      const sharedResource = item.resources.find((id) => other.resources.includes(id));
      if (sharedResource) blockers.push(makeBlocker(input, context, isMealTask(input, item.task) || isMealTask(input, other.task) ? "meal_slot_resource_conflict" : "resource_overlap_with_outside_task", isMealTask(input, item.task) || isMealTask(input, other.task) ? "meal" : "resource", [item], [other], { resourceId: sharedResource, resourceName: resourceName(input, sharedResource) }));
      const spaceId = Number(item.task.spaceId ?? 0);
      const itemUsesSpace = !isMealTask(input, item.task) || mealOccupiesSpace(item.task);
      const otherUsesSpace = !isMealTask(input, other.task) || mealOccupiesSpace(other.task);
      if (itemUsesSpace && otherUsesSpace && spaceId > 0 && spaceId === Number(other.task.spaceId ?? 0) && getSpaceCapacity(input, spaceId) <= 1) blockers.push(makeBlocker(input, context, "space_overlap_with_outside_task", "space", [item], [other], { spaceId, spaceName: spaceName(input, spaceId) }));
    }
  }
  return blockers;
};

/** Classifies a local rejection and upgrades immovable external blockers to fixed_task_blocks_shift. */
export const classifySegmentMoveRejection = (input: EngineV3Input, blocker: SegmentSolverBlocker): SegmentSolverBlocker => {
  if (!["resource_overlap_with_outside_task", "talent_overlap_with_outside_task", "space_overlap_with_outside_task", "meal_slot_resource_conflict"].includes(blocker.rejectionCode)) return blocker;
  const blockingTasks = blocker.blockingTaskIds.map((id) => input.tasks.find((task) => Number(task.id) === id)).filter((task): task is TaskInput => Boolean(task));
  if (blockingTasks.length && blockingTasks.every((task) => isFixedTask(input, task))) return { ...blocker, rejectionCode: "fixed_task_blocks_shift", constraintType: "fixed", canExpandSegment: false, suggestedExpansionTaskIds: [] };
  return blocker;
};

/** Incremental validation in dependency, talent, resource/space, then Main Stage order. */
export const checkLocalMoveFeasibility = (input: EngineV3Input, baseline: EngineOutput, context: LocalMoveContext): { feasible: boolean; blockers: SegmentSolverBlocker[] } => {
  const dayStart = toMinutes(input.workDay.start) ?? 0; const dayEnd = toMinutes(input.workDay.end) ?? 24 * 60;
  const moved = intervalIndex(input, baseline, context.starts).filter((item) => context.starts.has(item.taskId));
  const movedPrimaryStage = moved.filter((item) => Number(item.task.zoneId) === Number(input.optimizerMainZoneId));
  if (movedPrimaryStage.length) {
    return { feasible: false, blockers: [makeBlocker(input, context, "primary_stage_task_not_movable", "main_stage", movedPrimaryStage, [], { canExpandSegment: false, suggestedExpansionTaskIds: [] })] };
  }
  const fixedIntervals = buildPrimaryStageFixedIntervals(input, baseline);
  for (const item of moved) {
    const conflicts = fixedIntervals.filter((fixed) => {
      const start = toMinutes(fixed.start); const end = toMinutes(fixed.end);
      return fixed.spaceId === Number(item.task.spaceId) && start !== null && end !== null && intervalOverlaps(item.start, item.end, start, end);
    });
    if (conflicts.length) {
      const effective = intervalIndex(input, baseline);
      const blocking = effective.filter((interval) => conflicts.some((fixed) => fixed.taskId === interval.taskId));
      return { feasible: false, blockers: [makeBlocker(input, context, "primary_stage_fixed_overlap", "main_stage", [item], blocking, {
        spaceId: conflicts[0].spaceId,
        spaceName: conflicts[0].spaceName,
        canExpandSegment: false,
        suggestedExpansionTaskIds: [],
      })] };
    }
  }
  const outsideDay = moved.filter((item) => item.start < dayStart || item.end > dayEnd);
  if (outsideDay.length) return { feasible: false, blockers: [makeBlocker(input, context, "local_move_outside_workday", "workday", outsideDay)] };
  const blockers = findBlockingIntervals(input, baseline, context).map((blocker) => classifySegmentMoveRejection(input, blocker));
  const order: SegmentSolverBlocker["constraintType"][] = ["dependency", "talent", "resource", "space", "meal", "main_stage", "fixed", "workday", "hard"];
  blockers.sort((a, b) => order.indexOf(a.constraintType) - order.indexOf(b.constraintType));
  return { feasible: blockers.length === 0, blockers: blockers.slice(0, 3) };
};

const immediateClosure = (input: EngineV3Input, taskIds: number[]): number[] => {
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const result = new Set(taskIds);
  for (const taskId of taskIds) for (const dependencyId of getDependencyIds(taskById.get(taskId)!)) if (taskById.has(dependencyId)) result.add(dependencyId);
  for (const task of input.tasks ?? []) if (getDependencyIds(task).some((id) => taskIds.includes(id))) result.add(Number(task.id));
  return [...result];
};

const expandMicroSegment = (input: EngineV3Input, segment: CoachMicroSegment, blocker: SegmentSolverBlocker): { segment?: CoachMicroSegment; reason?: string; added: number[] } => {
  const requested = immediateClosure(input, blocker.suggestedExpansionTaskIds).filter((id) => !segment.taskIds.includes(id)).slice(0, 4);
  const taskIds = uniq([...segment.taskIds, ...requested]);
  const movableTaskIds = taskIds.filter((id) => { const task = input.tasks.find((item) => Number(item.id) === id); return Boolean(task && !isFixedTask(input, task)); });
  if (!requested.length || taskIds.length > SEGMENT_SOLVER_MAX_EXPANDED_TASKS || movableTaskIds.length > SEGMENT_SOLVER_MAX_EXPANDED_MOVABLE_TASKS) return { reason: "microsegment_expansion_limit_reached", added: requested };
  const suffix = segment.strategy === "bridge" ? "bridge_with_blocker_expansion" : segment.strategy === "left_shift_right_block" ? "left_shift_with_blocker_expansion" : "right_shift_with_blocker_expansion";
  return { segment: { ...segment, strategy: suffix as MicroSegmentStrategy, taskIds, movableTaskIds, targetTaskIds: uniq([...segment.targetTaskIds, ...requested]) }, added: requested };
};

const fullRejectionReasons = (input: EngineV3Input, baseline: EngineOutput, candidate: EngineOutput): { reasons: string[]; validation: ReturnType<typeof validateHardConstraints>; optimizedErrors: string[] } => {
  const validation = validateHardConstraints(input, candidate); const optimizedErrors = validateOptimizedCandidate(input, baseline, candidate); const reasons = new Set<string>();
  if (!validation.hardValidationPassed || optimizedErrors.length) reasons.add("microsegment_candidate_hard_invalid");
  if ((scoreCandidateSolution(input, candidate).mainStageGapMinutes ?? 0) !== 0) reasons.add("main_stage_gap_would_open");
  const codes = new Set(validation.hardConstraintViolationCodes ?? []);
  if (codes.has("DEPENDENCY_VIOLATION")) reasons.add("segment_candidate_dependency_violation");
  if (codes.has("RESOURCE_OVERLAP") || codes.has("SPACE_OVERLAP") || optimizedErrors.some((error) => error.includes("RESOURCE") || error.includes("SPACE"))) reasons.add("segment_candidate_resource_conflict");
  return { reasons: [...reasons], validation, optimizedErrors };
};

const improvementReason = (before: CandidateSolutionScore, after: CandidateSolutionScore): string => {
  if (after.maxCoachGapMinutes <= before.maxCoachGapMinutes - 10 && after.makespan <= before.makespan + 10) return "segment_solver selected: reduced critical coach gap";
  if (after.coachSplitDayPenalty < before.coachSplitDayPenalty) return "segment_solver selected: lower split day";
  return "segment_solver selected: better operational quality";
};

export interface DirectRepairResult { starts?: Map<number, number>; strategy?: string; rejectedReasons: string[] }

export interface RepairChainResult {
  starts?: Map<number, number>;
  segment: CoachMicroSegment;
  depthReached: number;
  addedTaskIds: number[];
  movedTaskIds: number[];
  strategiesTried: string[];
  blockedBy: string[];
  rejectedReasons: string[];
}

/** Repairs a direct external blocker with bounded shifts, lane ordering, or a flexible meal relocation. */
export const repairDirectBlocker = (input: EngineV3Input, baseline: EngineOutput, segment: CoachMicroSegment, starts: Map<number, number>, blocker: SegmentSolverBlocker): DirectRepairResult => {
  const intervals = intervalIndex(input, baseline, starts); const byId = new Map(intervals.map((item) => [item.taskId, item]));
  const target = blocker.taskIds.map((id) => byId.get(id)).find(Boolean); const blocked = blocker.blockingTaskIds.map((id) => byId.get(id)).find(Boolean);
  if (!target || !blocked || isFixedTask(input, blocked.task)) return { rejectedReasons: ["outside_blocker_not_movable", "fixed_task_blocks_shift"] };
  const mealWindow = getMealMode(input).mode === "flexible_meal_window" ? getMealWindow(input) : null;
  const mealStart = toMinutes(mealWindow?.start); const mealEnd = toMinutes(mealWindow?.end);
  const attempts: Array<{ strategy: string; start: number }> = [];
  const duration = blocked.end - blocked.start;
  if (blocker.rejectionCode === "dependency_predecessor_outside_segment") attempts.push({ strategy: "dependency_predecessor_included", start: target.start - duration });
  if (blocker.rejectionCode === "dependency_successor_outside_segment") attempts.push({ strategy: "dependency_successor_included", start: target.end });
  for (const offset of [5, 10, 15, 30, -5, -10, -15]) attempts.push({ strategy: `shift_blocker_${offset > 0 ? "forward" : "backward"}_${Math.abs(offset)}`, start: blocked.start + offset });
  attempts.push({ strategy: "lane_sequentialization_after", start: target.end }, { strategy: "lane_sequentialization_before", start: target.start - (blocked.end - blocked.start) });
  if (isMealTask(input, blocked.task) && mealStart !== null && mealEnd !== null) {
    const useful = uniq([target.start - duration, target.end, target.start - 5 - duration, target.end + 5, mealStart, mealEnd - duration])
      .filter((start) => start >= mealStart && start + duration <= mealEnd)
      .sort((a, b) => Math.abs(a - blocked.start) - Math.abs(b - blocked.start));
    const strategy = blocked.task.breakKind ? "catering_task_moved_with_talent" : "sodexo_flexible_slot_relocated";
    useful.forEach((start) => attempts.unshift({ strategy, start }));
  }
  const rejected = new Set<string>();
  let chainedCandidate: { starts: Map<number, number>; strategy: string } | undefined;
  for (const attempt of attempts) {
    const repaired = new Map(starts); repaired.set(blocked.taskId, attempt.start);
    const local = checkLocalMoveFeasibility(input, baseline, { segment: { ...segment, taskIds: uniq([...segment.taskIds, blocked.taskId]) }, starts: repaired, strategy: attempt.strategy, moveDescription: `${blocked.taskId}@${hhmm(attempt.start)}` });
    if (local.feasible) return { starts: repaired, strategy: attempt.strategy, rejectedReasons: [] };
    if (!chainedCandidate && local.blockers.some((item) => item.canExpandSegment && item.rejectionCode !== "fixed_task_blocks_shift")) chainedCandidate = { starts: repaired, strategy: attempt.strategy };
    local.blockers.forEach((item) => rejected.add(item.rejectionCode));
  }
  if (chainedCandidate) return { ...chainedCandidate, rejectedReasons: [] };
  if (isMealTask(input, blocked.task)) rejected.add("meal_no_slot_near_conflict");
  else rejected.add("outside_blocker_shift_causes_secondary_conflict");
  return { rejectedReasons: [...rejected] };
};

/** Recursively repairs at most two concrete outside blockers while keeping the branch surgical. */
export const repairBlockerChain = (
  input: EngineV3Input,
  baseline: EngineOutput,
  initialSegment: CoachMicroSegment,
  initialStarts: Map<number, number>,
  maxDepth = SEGMENT_SOLVER_MAX_REPAIR_DEPTH,
): RepairChainResult => {
  const originalIds = new Set(initialSegment.taskIds);
  const strategies: string[] = [];
  const blockedBy: string[] = [];
  const rejected = new Set<string>();
  let maxDepthReached = 0;

  const visit = (segment: CoachMicroSegment, starts: Map<number, number>, depth: number): { starts?: Map<number, number>; segment: CoachMicroSegment } => {
    maxDepthReached = Math.max(maxDepthReached, depth);
    const local = checkLocalMoveFeasibility(input, baseline, { segment, starts, strategy: segment.strategy });
    if (local.feasible) return { starts, segment };
    const blocker = local.blockers[0];
    if (!blocker) { rejected.add("repair_chain_no_concrete_blocker"); return { segment }; }
    blockedBy.push(blocker.rejectionCode);
    if (blocker.rejectionCode === "fixed_task_blocks_shift" || !blocker.canExpandSegment) {
      rejected.add(blocker.rejectionCode === "fixed_task_blocks_shift" ? "fixed_task_blocks_shift" : "outside_blocker_not_movable");
      return { segment };
    }
    if (depth >= maxDepth) { rejected.add("repair_chain_max_depth_reached"); return { segment }; }
    const added = blocker.suggestedExpansionTaskIds.filter((id) => !segment.taskIds.includes(id));
    const totalAdded = uniq([...segment.taskIds, ...added]).filter((id) => !originalIds.has(id));
    if (totalAdded.length > SEGMENT_SOLVER_MAX_REPAIR_ADDED_TASKS) { rejected.add("repair_chain_max_added_tasks_exceeded"); return { segment }; }
    if (uniq([...starts.keys(), ...added]).length > SEGMENT_SOLVER_MAX_REPAIR_MOVED_TASKS) { rejected.add("repair_chain_max_moved_tasks_exceeded"); return { segment }; }
    const expanded = { ...segment, taskIds: uniq([...segment.taskIds, ...added]), movableTaskIds: uniq([...segment.movableTaskIds, ...added]) };
    const direct = repairDirectBlocker(input, baseline, expanded, starts, blocker);
    if (!direct.starts) { direct.rejectedReasons.forEach((reason) => rejected.add(reason)); return { segment: expanded }; }
    if (direct.strategy) strategies.push(direct.strategy);
    return visit(expanded, direct.starts, depth + 1);
  };

  const result = visit(initialSegment, new Map(initialStarts), 0);
  const movedTaskIds = [...(result.starts?.keys() ?? [])];
  return {
    starts: result.starts,
    segment: result.segment,
    depthReached: maxDepthReached,
    addedTaskIds: result.segment.taskIds.filter((id) => !originalIds.has(id)),
    movedTaskIds,
    strategiesTried: uniq(strategies),
    blockedBy: uniq(blockedBy),
    rejectedReasons: [...rejected],
  };
};

export const runSegmentSolver = (input: EngineV3Input, baseline: EngineOutput, options: SegmentSolverOptions = {}): { output: EngineOutput; candidates: EngineOutput[]; meta: SegmentSolverMeta } => {
  const startedAt = Date.now(); const timeoutMs = Math.max(0, Number(options.timeoutMs ?? SEGMENT_SOLVER_DEFAULT_TIMEOUT_MS)); const baseScore = scoreCandidateSolution(input, baseline);
  const emptyMeta: SegmentSolverMeta = {
    segmentSolverAttempted: false, segmentSolverBackend: "bounded_exact_search", segmentSolverSegmentsBuilt: 0, segmentSolverCandidatesGenerated: 0,
    segmentSolverAccepted: false, segmentSolverReason: options.disabled ? "solver_disabled" : "no_problematic_coach_segment", segmentSolverRejectedReasons: [],
    segmentSolverMicroSegmentsBuilt: 0, segmentSolverMicroSegmentStrategiesTried: [], segmentSolverMicroSegmentTaskCounts: [], segmentSolverMicroSegmentRejectedReasons: [],
    segmentSolverAssignmentsExplored: 0, segmentSolverValidCandidates: 0, segmentSolverBestCandidateMovedTaskIds: [], segmentSolverBestCandidateMovedTalentNames: [],
    segmentSolverBestBefore: compactMetrics(baseScore), segmentSolverBestAfter: compactMetrics(baseScore), segmentSolverTimeoutMs: timeoutMs, segmentSolverElapsedMs: 0,
    segmentSolverMealMovesAttempted: false, segmentSolverMealMovesAccepted: false, segmentSolverMealMoveCount: 0, segmentSolverMealRejectedReasons: [],
    segmentSolverTopBlockers: [], segmentSolverTopResourceBlockers: [], segmentSolverTopDependencyBlockers: [], segmentSolverTopMealBlockers: [], segmentSolverTopMainStageBlockers: [],
    segmentSolverLocalChecksPerformed: 0, segmentSolverLocalChecksRejected: 0, segmentSolverFullValidationsPerformed: 0, segmentSolverFullValidationsRejected: 0,
    segmentSolverFullValidationTopFailures: [], segmentSolverFullValidationFailureCodes: [], segmentSolverFullValidationFailureSummary: {},
    segmentSolverUnderlyingFailureCodes: [], segmentSolverUnderlyingFailureSummary: {},
    segmentSolverCandidateIntegrityChecksPerformed: 0, segmentSolverCandidateIntegrityFailures: 0, segmentSolverCandidateIntegrityTopFailures: [],
    segmentSolverBestRepairMovedTaskIds: [], segmentSolverBestRepairMovedTalentNames: [],
    segmentSolverExpandedMicroSegmentsBuilt: 0, segmentSolverExpansionTaskIds: [], segmentSolverExpansionReasons: [], segmentSolverExpansionRejectedReasons: [],
    segmentSolverDirectRepairsAttempted: 0, segmentSolverDirectRepairsAccepted: 0, segmentSolverDirectRepairStrategiesTried: [], segmentSolverDirectRepairRejectedReasons: [],
    segmentSolverRepairChainsAttempted: 0, segmentSolverRepairChainsAccepted: 0, segmentSolverRepairChainMaxDepthReached: 0,
    segmentSolverRepairChainDepths: [], segmentSolverRepairChainMovedTaskIds: [], segmentSolverRepairChainBlockedBy: [], segmentSolverRepairChainRejectedReasons: [],
    segmentSolverFeasibleButNotSelected: false, segmentSolverCandidateMetrics: [],
    segmentSolverPrimaryStageGuardEnabled: false, segmentSolverPrimaryStageFixedIntervals: [],
    segmentSolverPrimaryStagePrunedCandidates: 0, segmentSolverPrimaryStagePruneReasons: [],
    segmentSolverPrimaryStagePruneDetails: [],
    segmentSolverPrimaryStageGuardMisses: 0, segmentSolverPrimaryStageGuardMissDetails: [],
  };
  if (options.disabled) return { output: baseline, candidates: [], meta: emptyMeta };
  const segments = buildCriticalCoachSegments(input, baseline, options.maxSegments);
  if (!segments.length) return { output: baseline, candidates: [], meta: { ...emptyMeta, segmentSolverElapsedMs: Date.now() - startedAt } };
  const wide = segments[0]; const gap = findCriticalCoachGap(input, baseline, wide.coachId)!; const microBuild = buildCoachMicroSegments(input, baseline, gap);
  const wideTooLarge = wide.movableTaskIds.length > SEGMENT_SOLVER_MAX_TASKS; const solveSegments = microBuild.segments;
  const meta: SegmentSolverMeta = { ...emptyMeta, segmentSolverAttempted: true, segmentSolverSegmentsBuilt: segments.length, segmentSolverTargetCoachName: wide.coachName,
    segmentSolverWindowStart: hhmm(wide.windowStart), segmentSolverWindowEnd: hhmm(wide.windowEnd), segmentSolverTaskCount: wide.taskIds.length,
    segmentSolverTalentNames: wide.talentNames, segmentSolverResourceNames: wide.resourceNames, segmentSolverCriticalGapStart: hhmm(gap.gapStart), segmentSolverCriticalGapEnd: hhmm(gap.gapEnd),
    segmentSolverCriticalGapMinutes: gap.gapMinutes, segmentSolverLeftBlockTalentNames: gap.leftBlockTalentNames, segmentSolverRightBlockTalentNames: gap.rightBlockTalentNames,
    segmentSolverMicroSegmentsBuilt: solveSegments.length, segmentSolverMicroSegmentStrategiesTried: solveSegments.map((segment) => segment.strategy),
    segmentSolverMicroSegmentTaskCounts: solveSegments.map((segment) => segment.taskIds.length), segmentSolverMicroSegmentRejectedReasons: microBuild.rejectedReasons,
    segmentSolverReason: wideTooLarge ? "wide_segment_too_large_microsegments_attempted" : "microsegment_built", segmentSolverRejectedReasons: wideTooLarge ? ["wide_segment_too_large"] : [],
    segmentSolverPrimaryStageGuardEnabled: Number.isFinite(Number(input.optimizerMainZoneId)),
    segmentSolverPrimaryStageFixedIntervals: buildPrimaryStageFixedIntervals(input, baseline),
    segmentSolverPrimaryStagePrunedCandidates: 0,
    segmentSolverPrimaryStagePruneReasons: [], segmentSolverPrimaryStagePruneDetails: [] };
  if (!solveSegments.length) return { output: baseline, candidates: [], meta: { ...meta, segmentSolverReason: wideTooLarge ? "segment_too_large" : "no_movable_tasks", segmentSolverElapsedMs: Date.now() - startedAt } };

  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task])); const plannedById = new Map((baseline.plannedTasks ?? []).map((task) => [Number(task.taskId), task]));
  const mealWindow = getMealMode(input).mode === "flexible_meal_window" ? getMealWindow(input) : null; const mealStart = toMinutes(mealWindow?.start); const mealEnd = toMinutes(mealWindow?.end);
  const globalDeadline = startedAt + timeoutMs; let timedOut = false; let cancelled = false; let earlyStop = false; let best = baseline; let bestScore = baseScore; let bestChanges = 0;
  const candidates: EngineOutput[] = []; const rejected = new Set(meta.segmentSolverRejectedReasons); const mealRejected = new Set<string>(); const blockerKeys = new Set<string>(); const perSegmentBlockers = new Map<string, number>(); const expansionCounts = new Map<string, number>();
  const recordBlocker = (blocker: SegmentSolverBlocker, segment: CoachMicroSegment) => {
    const segmentKey = `${segment.strategy}:${segment.targetTaskIds.join(",")}`; const key = `${segmentKey}:${blocker.rejectionCode}:${blocker.taskIds}:${blocker.blockingTaskIds}`;
    if (blockerKeys.has(key) || meta.segmentSolverTopBlockers.length >= 10 || (perSegmentBlockers.get(segmentKey) ?? 0) >= 3) return;
    blockerKeys.add(key); perSegmentBlockers.set(segmentKey, (perSegmentBlockers.get(segmentKey) ?? 0) + 1); meta.segmentSolverTopBlockers.push(blocker);
    if (blocker.constraintType === "resource" || blocker.constraintType === "space" || blocker.constraintType === "talent" || blocker.constraintType === "fixed") meta.segmentSolverTopResourceBlockers.push(blocker);
    if (blocker.constraintType === "dependency") meta.segmentSolverTopDependencyBlockers.push(blocker);
    if (blocker.constraintType === "meal") meta.segmentSolverTopMealBlockers.push(blocker);
    if (blocker.constraintType === "main_stage") meta.segmentSolverTopMainStageBlockers.push(blocker);
  };

  const evaluate = (segment: CoachMicroSegment, starts: Map<number, number>, offsetMinutes?: number, moveDescription?: string, allowRepair = true) => {
    if (Date.now() >= globalDeadline) { timedOut = true; return; } if (options.shouldCancel?.()) { cancelled = true; return; }
    meta.segmentSolverAssignmentsExplored += 1; meta.segmentSolverLocalChecksPerformed += 1;
    const context = { segment, starts, strategy: segment.strategy, offsetMinutes, moveDescription }; const local = checkLocalMoveFeasibility(input, baseline, context);
    if (!local.feasible) {
      meta.segmentSolverLocalChecksRejected += 1;
      for (const blocker of local.blockers) {
        rejected.add(blocker.rejectionCode); recordBlocker(blocker, segment); if (blocker.constraintType === "meal") mealRejected.add(blocker.rejectionCode);
        if (blocker.rejectionCode === "primary_stage_fixed_overlap" || blocker.rejectionCode === "primary_stage_task_not_movable") {
          meta.segmentSolverPrimaryStagePrunedCandidates += 1;
          meta.segmentSolverPrimaryStagePruneReasons.push(blocker.rejectionCode);
          meta.segmentSolverPrimaryStagePruneDetails.push({ movedTaskIds: [...starts.keys()], strategy: segment.strategy, taskIds: blocker.taskIds, blockingTaskIds: blocker.blockingTaskIds, spaceId: blocker.spaceId, spaceName: blocker.spaceName, start: blocker.start, end: blocker.end });
        }
      }
      const direct = local.blockers.find((blocker) => [
        "resource_overlap_with_outside_task", "talent_overlap_with_outside_task", "space_overlap_with_outside_task",
        "meal_slot_resource_conflict", "dependency_predecessor_outside_segment", "dependency_successor_outside_segment",
      ].includes(blocker.rejectionCode));
      if (allowRepair && direct) {
        const segmentKey = `${segment.strategy}:${segment.targetTaskIds.join(",")}`; const count = expansionCounts.get(segmentKey) ?? 0;
        if (direct.canExpandSegment && count < 2) {
          const expansion = expandMicroSegment(input, segment, direct); expansionCounts.set(segmentKey, count + 1);
          if (expansion.segment) { meta.segmentSolverExpandedMicroSegmentsBuilt += 1; meta.segmentSolverExpansionTaskIds.push(...expansion.added); meta.segmentSolverExpansionReasons.push(direct.rejectionCode); meta.segmentSolverMicroSegmentStrategiesTried.push(expansion.segment.strategy); }
          else { meta.segmentSolverExpansionRejectedReasons.push(expansion.reason!); rejected.add(expansion.reason!); }
        }
        meta.segmentSolverDirectRepairsAttempted += 1;
        meta.segmentSolverRepairChainsAttempted += 1;
        const repair = repairBlockerChain(input, baseline, segment, starts);
        meta.segmentSolverRepairChainMaxDepthReached = Math.max(meta.segmentSolverRepairChainMaxDepthReached, repair.depthReached);
        meta.segmentSolverRepairChainDepths.push(repair.depthReached);
        meta.segmentSolverRepairChainMovedTaskIds.push(...repair.movedTaskIds);
        meta.segmentSolverRepairChainBlockedBy.push(...repair.blockedBy);
        meta.segmentSolverRepairChainRejectedReasons.push(...repair.rejectedReasons);
        meta.segmentSolverDirectRepairStrategiesTried.push(...repair.strategiesTried);
        if (repair.starts) {
          meta.segmentSolverDirectRepairsAccepted += 1;
          meta.segmentSolverRepairChainsAccepted += 1;
          evaluate(repair.segment, repair.starts, offsetMinutes, repair.strategiesTried.join(" -> "), false);
        } else {
          meta.segmentSolverDirectRepairRejectedReasons.push(...repair.rejectedReasons);
        }
      }
      return;
    }
    const candidate = candidateWithStarts(baseline, starts); const movedIds = changedTaskIds(baseline, candidate); if (!movedIds.length) return;
    meta.segmentSolverCandidateIntegrityChecksPerformed += 1;
    const integrityFailures = validateSegmentCandidateIntegrity(baseline, candidate, movedIds);
    if (integrityFailures.length) {
      meta.segmentSolverCandidateIntegrityFailures += 1;
      meta.segmentSolverCandidateIntegrityTopFailures.push(...integrityFailures.slice(0, Math.max(0, 10 - meta.segmentSolverCandidateIntegrityTopFailures.length)));
      integrityFailures.forEach((failure) => rejected.add(failure.code));
      return;
    }
    meta.segmentSolverFullValidationsPerformed += 1;
    const full = fullRejectionReasons(input, baseline, candidate);
    if (full.reasons.length) {
      meta.segmentSolverFullValidationsRejected += 1;
      full.reasons.forEach((reason) => rejected.add(reason));
      const movedTasks = movedIds.map((taskId) => taskById.get(taskId)).filter((task): task is TaskInput => Boolean(task));
      const details = full.validation.hardConstraintViolationDetails.slice(0, 3);
      const primary = details[0];
      const violationCode = primary?.code ?? (full.optimizedErrors[0] ? "OPTIMIZED_CANDIDATE_INVALID" : full.reasons[0]);
      const explained = explainOptimizedCandidateInvalid(candidate, input, {
        baseline,
        movedTaskIds: movedIds,
        repairStrategy: moveDescription || segment.strategy,
        repairChainDepth: Math.max(0, moveDescription ? moveDescription.split(" -> ").filter(Boolean).length : 0),
      });
      const underlyingCode = explained.underlyingViolationCode;
      const missRelatedTasks = explained.taskIds.map((taskId) => taskById.get(taskId)).filter((task): task is TaskInput => Boolean(task));
      const guardMiss = underlyingCode === "SPACE_OVERLAP"
        && missRelatedTasks.some((task) => Number(task.zoneId) === Number(input.optimizerMainZoneId))
        && missRelatedTasks.some((task) => isFixedTask(input, task));
      if (guardMiss) {
        meta.segmentSolverPrimaryStageGuardMisses += 1;
        meta.segmentSolverPrimaryStagePruneReasons.push("primary_stage_guard_missed_overlap");
        meta.segmentSolverPrimaryStageGuardMissDetails.push({
          movedTaskIds: movedIds.slice(0, 22),
          blockingTaskIds: explained.blockingTaskIds,
          taskIds: explained.taskIds,
          spaceName: explained.spaceName,
          start: explained.start,
          end: explained.end,
          strategy: moveDescription || segment.strategy,
          offsetMinutes,
        });
      }
      meta.segmentSolverFullValidationFailureCodes.push(violationCode);
      meta.segmentSolverFullValidationFailureSummary[violationCode] = (meta.segmentSolverFullValidationFailureSummary[violationCode] ?? 0) + 1;
      meta.segmentSolverUnderlyingFailureCodes.push(underlyingCode);
      meta.segmentSolverUnderlyingFailureSummary[underlyingCode] = (meta.segmentSolverUnderlyingFailureSummary[underlyingCode] ?? 0) + 1;
      if (meta.segmentSolverFullValidationTopFailures.length < 10) {
        const detailTaskIds = uniq(details.flatMap((detail) => detail.taskIds ?? []));
        const relatedTasks = detailTaskIds.map((taskId) => taskById.get(taskId)).filter((task): task is TaskInput => Boolean(task));
        const allTasks = uniq([...movedTasks, ...relatedTasks]);
        meta.segmentSolverFullValidationTopFailures.push(primary ? {
          strategy: moveDescription || segment.strategy,
          movedTaskIds: movedIds.slice(0, 22),
          movedTalentNames: uniq(movedTasks.map((task) => String(task.contestantName ?? "").trim()).filter(Boolean)),
          repairChainDepth: Math.max(0, moveDescription ? moveDescription.split(" -> ").filter(Boolean).length : 0),
          fullValidationViolationCode: violationCode,
          underlyingViolationCode: underlyingCode,
          underlyingViolationDetails: explained.underlyingViolationDetails,
          fullValidationViolationDetails: details.map((detail) => ({ ...detail, details: detail.details ? Object.fromEntries(Object.entries(detail.details).slice(0, 3)) : undefined })),
          constraintType: primary?.code?.toLowerCase() ?? "hard",
          repairStrategy: moveDescription || segment.strategy,
          taskIds: detailTaskIds.slice(0, 10),
          taskNames: uniq(allTasks.map((task) => taskLabel(input, task) || `Task ${task.id}`)).slice(0, 10),
          talentNames: uniq(allTasks.map((task) => String(task.contestantName ?? "").trim()).filter(Boolean)).slice(0, 10),
          resourceName: primary?.resourceId ? resourceName(input, primary.resourceId) : undefined,
          spaceName: primary?.spaceName,
          start: primary?.start,
          end: primary?.end,
          blockingTaskIds: detailTaskIds.filter((id) => !movedIds.includes(id)).slice(0, 10),
          blockingTaskNames: detailTaskIds.filter((id) => !movedIds.includes(id)).map((id) => blockerName(input, id)).slice(0, 10),
          resourceId: primary?.resourceId,
          spaceId: primary?.spaceId,
          isMainStageRelated: allTasks.some((task) => Number(task.zoneId) === Number(input.optimizerMainZoneId)) || full.reasons.includes("main_stage_gap_would_open"),
          isMealRelated: allTasks.some((task) => isMealTask(input, task)),
          isTransportRelated: allTasks.some((task) => isTransportTask(input, task)),
          isFixedRelated: allTasks.some((task) => isFixedTask(input, task)),
        } : explained);
      }
      if (!meta.segmentSolverBestRepairRejectedBy || movedIds.length > meta.segmentSolverBestRepairMovedTaskIds.length) {
        meta.segmentSolverBestRepairRejectedBy = underlyingCode;
        meta.segmentSolverBestUnderlyingFailure = underlyingCode;
        meta.segmentSolverBestUnderlyingFailureDetails = explained.underlyingViolationDetails;
        meta.segmentSolverBestRepairMovedTaskIds = movedIds.slice(0, 22);
        meta.segmentSolverBestRepairMovedTalentNames = uniq(movedTasks.map((task) => String(task.contestantName ?? "").trim()).filter(Boolean));
      }
      return;
    }
    const score = scoreCandidateSolution(input, candidate); const improvementMinutes = baseScore.maxCoachGapMinutes - score.maxCoachGapMinutes;
    const changes = movedIds.length;
    if (score.hardConstraintViolations !== 0 || score.mainStageGapMinutes !== 0 || score.plannedTasks !== baseScore.plannedTasks || score.makespan > baseScore.makespan + 10 || (improvementMinutes < 10 && compareSegmentScores(score, baseScore, changes, 0) <= 0)) { rejected.add("segment_candidate_valid_but_not_better"); return; }
    meta.segmentSolverValidCandidates += 1; meta.segmentSolverCandidatesGenerated += 1; if (candidates.length < 50) candidates.push(candidate);
    const metrics: SegmentSolverCandidateMetrics = { ...compactMetrics(score), movedTaskIds: movedIds.slice(0, 22), improvementMinutes, selected: false }; meta.segmentSolverCandidateMetrics.push(metrics);
    if (compareSegmentScores(score, bestScore, changes, bestChanges) > 0) { best = candidate; bestScore = score; bestChanges = changes; meta.segmentSolverBestFeasibleSeenAtMs ??= Date.now() - startedAt; }
    if (improvementMinutes >= 30) { earlyStop = true; meta.segmentSolverEarlyStopReason = "coach_gap_improved_by_at_least_30_minutes"; }
  };

  for (const segment of solveSegments) {
    if (Date.now() >= globalDeadline || earlyStop) { timedOut ||= Date.now() >= globalDeadline; break; }
    const microDeadline = Math.min(globalDeadline, Date.now() + SEGMENT_SOLVER_MICRO_TIMEOUT_MS); let assignments = 0;
    const movable = segment.movableTaskIds.map((taskId) => { const task = taskById.get(taskId)!; const planned = plannedById.get(taskId)!; const currentStart = toMinutes(planned.startPlanned)!; const currentEnd = toMinutes(planned.endPlanned)!; const duration = currentEnd - currentStart; const meal = isMealTask(input, task) && mealStart !== null && mealEnd !== null; const minStart = Math.max(segment.windowStart, meal ? mealStart! : segment.windowStart); const maxStart = Math.min(segment.windowEnd, meal ? mealEnd! : segment.windowEnd) - duration; const strategyOffsets = segment.targetTaskIds.includes(taskId) ? segment.offsetMinutes.flatMap((offset) => [offset, offset - 5, offset + 5, offset - 10, offset + 10, offset - 15, offset + 15]) : [-30, -15, 0, 15, 30]; const domain = uniq([currentStart, ...strategyOffsets.map((offset) => currentStart + offset)]).filter((start) => start >= minStart && start <= maxStart && start % 5 === 0); return { taskId, task, currentStart, isMeal: meal, domain }; }).filter((item) => item.domain.length);
    meta.segmentSolverMealMovesAttempted ||= movable.some((item) => item.isMeal);
    for (const targetOffset of segment.offsetMinutes) {
      if (Date.now() >= microDeadline || assignments >= SEGMENT_SOLVER_MAX_ASSIGNMENTS || earlyStop || cancelled) break;
      let foundSafeOffset = false;
      for (const offset of uniq([targetOffset, targetOffset - 5, targetOffset + 5, targetOffset - 10, targetOffset + 10, targetOffset - 15, targetOffset + 15])) {
        const starts = new Map<number, number>();
        for (const item of movable) if (segment.targetTaskIds.includes(item.taskId) && item.domain.includes(item.currentStart + offset)) starts.set(item.taskId, item.currentStart + offset);
        if (!starts.size) continue;
        assignments += 1;
        const local = checkLocalMoveFeasibility(input, baseline, { segment, starts, strategy: segment.strategy, offsetMinutes: offset });
        const primaryBlocked = local.blockers.some((blocker) => blocker.rejectionCode === "primary_stage_fixed_overlap");
        evaluate(segment, starts, offset, offset === targetOffset ? undefined : "primary_stage_offset_adjusted");
        if (!primaryBlocked) { foundSafeOffset = true; if (offset !== targetOffset) meta.segmentSolverPrimaryStagePruneReasons.push("primary_stage_offset_adjusted"); break; }
      }
      if (!foundSafeOffset) meta.segmentSolverPrimaryStagePruneReasons.push("primary_stage_offset_no_safe_slot");
    }
    if (!earlyStop && !cancelled && segment.strategy === "coach_block_reorder") { const items = movable.filter((item) => segment.targetTaskIds.includes(item.taskId)).slice(0, 4); const slots = items.map((item) => item.currentStart).sort((a, b) => a - b); if (items.length > 1) evaluate(segment, new Map(items.map((item, index) => [item.taskId, slots[items.length - index - 1]])), undefined, "reverse_coach_block_order"); }
    for (const item of movable) { if (earlyStop || cancelled || Date.now() >= microDeadline) break; for (const start of item.domain.slice(0, 8)) { if (start === item.currentStart) continue; assignments += 1; evaluate(segment, new Map([[item.taskId, start]]), start - item.currentStart); if (earlyStop || cancelled || Date.now() >= microDeadline) break; } }
  }

  const accepted = best !== baseline && bestScore.hardConstraintViolations === 0 && bestScore.mainStageGapMinutes === 0 && compareSegmentScores(bestScore, baseScore, bestChanges, 0) > 0;
  const movedIds = accepted ? changedTaskIds(baseline, best) : []; const movedTalentNames = uniq(movedIds.map((id) => String(taskById.get(id)?.contestantName ?? "").trim()).filter(Boolean)); const movedMealCount = accepted ? movedIds.filter((id) => isMealTask(input, taskById.get(id)!)).length : 0;
  if (timedOut) rejected.add("segment_candidate_timeout"); if (!meta.segmentSolverValidCandidates) meta.segmentSolverMicroSegmentRejectedReasons.push("microsegment_no_valid_candidate"); else if (!accepted) meta.segmentSolverMicroSegmentRejectedReasons.push("microsegment_candidate_not_better");
  meta.segmentSolverAccepted = accepted; meta.segmentSolverReason = cancelled ? "cancelled" : accepted ? "accepted" : meta.segmentSolverTopBlockers[0]?.rejectionCode ?? (timedOut ? "segment_solver_timeout" : meta.segmentSolverValidCandidates ? "segment_candidate_valid_but_not_better" : "microsegment_no_valid_candidate");
  meta.segmentSolverRejectedReasons = [...rejected].slice(0, 20); meta.segmentSolverBestAfter = compactMetrics(accepted ? bestScore : baseScore); meta.segmentSolverImprovement = accepted ? improvementReason(baseScore, bestScore) : meta.segmentSolverValidCandidates ? `segment_candidate_valid_but_not_better: baseline=${JSON.stringify(compactMetrics(baseScore))}; candidate=${JSON.stringify(compactMetrics(bestScore))}` : `microsegment_no_valid_candidate${meta.segmentSolverTopBlockers[0] ? `: ${meta.segmentSolverTopBlockers[0].rejectionCode}` : ""}`;
  meta.segmentSolverBestCandidateMovedTaskIds = movedIds; meta.segmentSolverBestCandidateMovedTalentNames = movedTalentNames; meta.segmentSolverBestCandidateReason = accepted ? improvementReason(baseScore, bestScore) : meta.segmentSolverImprovement; meta.segmentSolverElapsedMs = Math.max(0, Date.now() - startedAt); meta.segmentSolverMealMovesAccepted = movedMealCount > 0; meta.segmentSolverMealMoveCount = movedMealCount; meta.segmentSolverMealRejectedReasons = [...mealRejected].slice(0, 10); meta.segmentSolverFeasibleButNotSelected = meta.segmentSolverValidCandidates > 0 && !accepted;
  const selectedIds = new Set(movedIds); meta.segmentSolverCandidateMetrics = meta.segmentSolverCandidateMetrics.slice(0, 10).map((item) => ({ ...item, selected: accepted && item.movedTaskIds.length === selectedIds.size && item.movedTaskIds.every((id) => selectedIds.has(id)) })); meta.segmentSolverExpansionTaskIds = uniq(meta.segmentSolverExpansionTaskIds).slice(0, 16); meta.segmentSolverExpansionReasons = uniq(meta.segmentSolverExpansionReasons).slice(0, 10); meta.segmentSolverExpansionRejectedReasons = uniq(meta.segmentSolverExpansionRejectedReasons).slice(0, 10); meta.segmentSolverDirectRepairStrategiesTried = uniq(meta.segmentSolverDirectRepairStrategiesTried).slice(0, 10); meta.segmentSolverDirectRepairRejectedReasons = uniq(meta.segmentSolverDirectRepairRejectedReasons).slice(0, 10);
  meta.segmentSolverRepairChainDepths = meta.segmentSolverRepairChainDepths.slice(0, 20);
  meta.segmentSolverRepairChainMovedTaskIds = uniq(meta.segmentSolverRepairChainMovedTaskIds).slice(0, SEGMENT_SOLVER_MAX_REPAIR_MOVED_TASKS);
  meta.segmentSolverRepairChainBlockedBy = uniq(meta.segmentSolverRepairChainBlockedBy).slice(0, 10);
  meta.segmentSolverRepairChainRejectedReasons = uniq(meta.segmentSolverRepairChainRejectedReasons).slice(0, 10);
  meta.segmentSolverFullValidationFailureCodes = uniq(meta.segmentSolverFullValidationFailureCodes).slice(0, 20);
  meta.segmentSolverUnderlyingFailureCodes = uniq(meta.segmentSolverUnderlyingFailureCodes).slice(0, 20);
  meta.segmentSolverPrimaryStagePruneReasons = uniq(meta.segmentSolverPrimaryStagePruneReasons).slice(0, 10);
  meta.segmentSolverPrimaryStagePruneDetails = meta.segmentSolverPrimaryStagePruneDetails.slice(0, 10);
  meta.segmentSolverPrimaryStageGuardMissDetails = meta.segmentSolverPrimaryStageGuardMissDetails.slice(0, 10);
  if (!accepted && meta.segmentSolverPrimaryStagePrunedCandidates > 0 && meta.segmentSolverValidCandidates === 0 && meta.segmentSolverPrimaryStagePruneReasons.includes("primary_stage_offset_no_safe_slot")) {
    meta.segmentSolverReason = "primary_stage_fixed_overlap_no_safe_offset";
  }
  if (!accepted && meta.segmentSolverUnderlyingFailureCodes.length) {
    const topUnderlying = Object.entries(meta.segmentSolverUnderlyingFailureSummary).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topUnderlying) meta.segmentSolverReason = topUnderlying.toLowerCase();
  }
  if (meta.segmentSolverFeasibleButNotSelected) {
    meta.segmentSolverFeasibleComparison = {
      selectedMaxCoachGap: baseScore.maxCoachGapMinutes,
      candidateMaxCoachGap: bestScore.maxCoachGapMinutes,
      selectedMakespan: baseScore.makespan,
      candidateMakespan: bestScore.makespan,
      notSelectedReason: "segment_candidate_valid_but_not_better",
    };
  }
  return { output: accepted ? best : baseline, candidates, meta };
};

export const segmentSolverSelectionReason = improvementReason;
