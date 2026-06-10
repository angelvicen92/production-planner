import type { EngineOutput, TaskInput } from "../types";
import type { EngineV3Input } from "./types";
import { detectCoachAssignments } from "./coachDetection";
import { validateHardConstraints } from "./hardValidation";
import { getMealMode, getMealWindow, isMealTask } from "./mealSemantics";
import { toMinutes } from "./metrics";
import { calculateEngineOperationalCompactionMetrics } from "./operationalQuality";
import { getDependencyIds } from "./operationalPriority";
import { scoreCandidateSolution, type CandidateSolutionScore } from "./solutionScoring";
import { validateOptimizedCandidate } from "./validateCandidate";

export const SEGMENT_SOLVER_MAX_TASKS = 25;
export const SEGMENT_SOLVER_MAX_SEGMENTS = 3;
export const SEGMENT_SOLVER_GRID_MINUTES = 5;
export const SEGMENT_SOLVER_DEFAULT_TIMEOUT_MS = 2_000;
export const SEGMENT_SOLVER_MAX_WINDOW_MINUTES = 5 * 60;

export type SegmentSolverReason =
  | "accepted"
  | "candidate_not_better"
  | "no_problematic_coach_segment"
  | "segment_too_large"
  | "solver_disabled"
  | "missing_solver_runtime"
  | "no_movable_tasks"
  | "segment_solver_timeout"
  | "cancelled";

export type SegmentSolverCompactMetrics = Pick<CandidateSolutionScore,
  | "maxCoachGapMinutes"
  | "coachSplitDayPenalty"
  | "coachIdlePenalty"
  | "coachSpanPenalty"
  | "talentIdlePenalty"
  | "makespan"
  | "hardConstraintViolations"
  | "mainStageGapMinutes"
  | "plannedTasks"
>;

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
  segmentSolverBestBefore?: SegmentSolverCompactMetrics;
  segmentSolverBestAfter?: SegmentSolverCompactMetrics;
  segmentSolverImprovement?: string;
  segmentSolverTimeoutMs: number;
  segmentSolverElapsedMs: number;
  segmentSolverMealMovesAttempted: boolean;
  segmentSolverMealMovesAccepted: boolean;
  segmentSolverMealMoveCount: number;
  segmentSolverMealRejectedReasons: string[];
}

export interface SegmentSolverOptions {
  timeoutMs?: number;
  maxSegments?: number;
  disabled?: boolean;
  shouldCancel?: () => boolean;
}

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

const hhmm = (value: number): string => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const roundUpGrid = (value: number): number => Math.ceil(value / SEGMENT_SOLVER_GRID_MINUTES) * SEGMENT_SOLVER_GRID_MINUTES;
const normalize = (value: unknown): string => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const intervalOverlaps = (start: number, end: number, windowStart: number, windowEnd: number) => start < windowEnd && windowStart < end;

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

const taskLabel = (input: EngineV3Input, task: TaskInput): string => normalize(
  task.templateName ?? input.taskTemplateNameById?.[Number(task.templateId)] ?? "",
);

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

const largestGap = (intervals: Array<{ start: number; end: number }>) => {
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  let best: { leftEnd: number; rightStart: number; minutes: number } | null = null;
  let end = sorted[0]?.end ?? 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const gap = current.start - end;
    if (gap > (best?.minutes ?? 0)) best = { leftEnd: end, rightStart: current.start, minutes: gap };
    end = Math.max(end, current.end);
  }
  return best;
};

export const buildCriticalCoachSegments = (
  input: EngineV3Input,
  output: EngineOutput,
  maxSegments = SEGMENT_SOLVER_MAX_SEGMENTS,
): CriticalCoachSegment[] => {
  const plannedById = new Map((output.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const compaction = calculateEngineOperationalCompactionMetrics(input, output);
  const coachGroups = new Map(detectCoachAssignments(input, output).map((group) => [Number(group.coachId), group]));
  const dayStart = toMinutes(input.workDay.start) ?? 0;
  const dayEnd = toMinutes(input.workDay.end) ?? 24 * 60;
  const problematic = compaction.coaches
    .filter((metric) => metric.maxGapMinutes > 0 && metric.idleMinutes > 0)
    .sort((a, b) => b.maxGapMinutes - a.maxGapMinutes || b.idleMinutes - a.idleMinutes || a.id - b.id)
    .slice(0, Math.max(0, maxSegments));

  return problematic.flatMap((metric): CriticalCoachSegment[] => {
    const group = coachGroups.get(metric.id);
    if (!group || group.coachId === null || group.intervals.length < 2) return [];
    const gap = largestGap(group.intervals);
    if (!gap) return [];
    let windowStart = Math.max(dayStart, gap.leftEnd - 60);
    let windowEnd = Math.min(dayEnd, gap.rightStart + 60);
    if (windowEnd - windowStart > SEGMENT_SOLVER_MAX_WINDOW_MINUTES) {
      const center = Math.floor((gap.leftEnd + gap.rightStart) / 2);
      windowStart = Math.max(dayStart, center - Math.floor(SEGMENT_SOLVER_MAX_WINDOW_MINUTES / 2));
      windowEnd = Math.min(dayEnd, windowStart + SEGMENT_SOLVER_MAX_WINDOW_MINUTES);
      windowStart = Math.max(dayStart, windowEnd - SEGMENT_SOLVER_MAX_WINDOW_MINUTES);
    }

    const coachTaskIds = new Set(group.taskIds);
    const talentIds = new Set<number>();
    for (const taskId of coachTaskIds) {
      const contestantId = Number(taskById.get(taskId)?.contestantId ?? NaN);
      if (Number.isFinite(contestantId) && contestantId > 0) talentIds.add(contestantId);
    }

    const selected = new Set<number>();
    for (const task of input.tasks ?? []) {
      const planned = plannedById.get(Number(task.id));
      const start = toMinutes(planned?.startPlanned);
      const end = toMinutes(planned?.endPlanned);
      if (!planned || start === null || end === null || !intervalOverlaps(start, end, windowStart, windowEnd)) continue;
      if (coachTaskIds.has(Number(task.id)) || talentIds.has(Number(task.contestantId)) || (isMealTask(input, task) && talentIds.has(Number(task.contestantId)))) {
        selected.add(Number(task.id));
      }
    }

    // Include direct feeder/predecessor and successor tasks for the affected talents.
    let changed = true;
    while (changed && selected.size <= SEGMENT_SOLVER_MAX_TASKS * 2) {
      changed = false;
      for (const task of input.tasks ?? []) {
        const taskId = Number(task.id);
        const deps = getDependencyIds(task);
        if (selected.has(taskId)) {
          for (const dependencyId of deps) {
            if (taskById.has(dependencyId) && !selected.has(dependencyId)) {
              selected.add(dependencyId);
              changed = true;
            }
          }
        } else if (deps.some((dependencyId) => selected.has(dependencyId)) && talentIds.has(Number(task.contestantId))) {
          selected.add(taskId);
          changed = true;
        }
      }
    }

    const taskIds = [...selected].filter((taskId) => plannedById.has(taskId)).sort((a, b) => a - b);
    const movableTaskIds = taskIds.filter((taskId) => {
      const task = taskById.get(taskId);
      return Boolean(task && !isFixedTask(input, task));
    });
    const resourceIds = new Set<number>();
    for (const taskId of taskIds) {
      for (const resourceId of plannedById.get(taskId)?.assignedResources ?? []) resourceIds.add(Number(resourceId));
    }
    const talentNames = [...talentIds].map((talentId) => input.tasks
      .find((task) => Number(task.contestantId) === talentId && String(task.contestantName ?? "").trim())?.contestantName?.trim() || `Talent ${talentId}`);
    const resourceById = new Map((input.planResourceItems ?? []).map((resource) => [Number(resource.id), resource.name]));
    return [{
      coachId: group.coachId,
      coachName: group.coachName,
      windowStart,
      windowEnd,
      taskIds,
      movableTaskIds,
      talentIds: [...talentIds],
      talentNames,
      resourceIds: [...resourceIds].sort((a, b) => a - b),
      resourceNames: [...resourceIds].map((id) => resourceById.get(id) ?? `Resource ${id}`),
    }];
  });
};

const compareSegmentScores = (candidate: CandidateSolutionScore, baseline: CandidateSolutionScore, changedTasks: number, baselineChanges: number): number => {
  const checks: Array<[number, number]> = [
    [candidate.hardConstraintViolations, baseline.hardConstraintViolations],
    [candidate.mainStageGapMinutes, baseline.mainStageGapMinutes],
    [baseline.plannedTasks, candidate.plannedTasks],
    [candidate.maxCoachGapMinutes, baseline.maxCoachGapMinutes],
    [candidate.coachSplitDayPenalty, baseline.coachSplitDayPenalty],
    [candidate.coachIdlePenalty, baseline.coachIdlePenalty],
    [candidate.coachSpanPenalty, baseline.coachSpanPenalty],
    [candidate.talentIdlePenalty, baseline.talentIdlePenalty],
    [candidate.makespan, baseline.makespan],
    [changedTasks, baselineChanges],
  ];
  for (const [left, right] of checks) {
    if (left !== right) return left < right ? 1 : -1;
  }
  return 0;
};

const changedTaskCount = (baseline: EngineOutput, candidate: EngineOutput): number => {
  const before = new Map((baseline.plannedTasks ?? []).map((task) => [Number(task.taskId), `${task.startPlanned}-${task.endPlanned}-${(task.assignedResources ?? []).join(",")}`]));
  return (candidate.plannedTasks ?? []).filter((task) => before.get(Number(task.taskId)) !== `${task.startPlanned}-${task.endPlanned}-${(task.assignedResources ?? []).join(",")}`).length;
};

const candidateWithStarts = (baseline: EngineOutput, starts: Map<number, number>): EngineOutput => ({
  ...baseline,
  plannedTasks: (baseline.plannedTasks ?? []).map((planned) => {
    const start = starts.get(Number(planned.taskId));
    if (start === undefined) return planned;
    const oldStart = toMinutes(planned.startPlanned);
    const oldEnd = toMinutes(planned.endPlanned);
    if (oldStart === null || oldEnd === null) return planned;
    return { ...planned, startPlanned: hhmm(start), endPlanned: hhmm(start + oldEnd - oldStart) };
  }),
});

const rejectionReasons = (input: EngineV3Input, baseline: EngineOutput, candidate: EngineOutput): string[] => {
  const validation = validateHardConstraints(input, candidate);
  const optimizedErrors = validateOptimizedCandidate(input, baseline, candidate);
  const reasons = new Set<string>();
  if (!validation.hardValidationPassed || optimizedErrors.length) reasons.add("segment_candidate_hard_invalid");
  if ((scoreCandidateSolution(input, candidate).mainStageGapMinutes ?? 0) !== 0) reasons.add("segment_candidate_main_stage_gap");
  const codes = new Set(validation.hardConstraintViolationCodes ?? []);
  if (codes.has("DEPENDENCY_VIOLATION")) reasons.add("segment_candidate_dependency_violation");
  if (codes.has("RESOURCE_OVERLAP") || codes.has("SPACE_OVERLAP") || optimizedErrors.some((error) => error.includes("RESOURCE") || error.includes("SPACE"))) {
    reasons.add("segment_candidate_resource_conflict");
  }
  return [...reasons];
};

const improvementReason = (before: CandidateSolutionScore, after: CandidateSolutionScore): string => {
  if (after.maxCoachGapMinutes < before.maxCoachGapMinutes) return "segment_solver selected: lower coach gap";
  if (after.coachSplitDayPenalty < before.coachSplitDayPenalty) return "segment_solver selected: lower split day";
  return "segment_solver selected: better operational quality";
};

export const runSegmentSolver = (
  input: EngineV3Input,
  baseline: EngineOutput,
  options: SegmentSolverOptions = {},
): { output: EngineOutput; candidates: EngineOutput[]; meta: SegmentSolverMeta } => {
  const startedAt = Date.now();
  const timeoutMs = Math.max(0, Number(options.timeoutMs ?? SEGMENT_SOLVER_DEFAULT_TIMEOUT_MS));
  const baseScore = scoreCandidateSolution(input, baseline);
  const emptyMeta: SegmentSolverMeta = {
    segmentSolverAttempted: false,
    segmentSolverBackend: "bounded_exact_search",
    segmentSolverSegmentsBuilt: 0,
    segmentSolverCandidatesGenerated: 0,
    segmentSolverAccepted: false,
    segmentSolverReason: options.disabled ? "solver_disabled" : "no_problematic_coach_segment",
    segmentSolverRejectedReasons: [],
    segmentSolverBestBefore: compactMetrics(baseScore),
    segmentSolverBestAfter: compactMetrics(baseScore),
    segmentSolverTimeoutMs: timeoutMs,
    segmentSolverElapsedMs: 0,
    segmentSolverMealMovesAttempted: false,
    segmentSolverMealMovesAccepted: false,
    segmentSolverMealMoveCount: 0,
    segmentSolverMealRejectedReasons: [],
  };
  if (options.disabled) return { output: baseline, candidates: [], meta: emptyMeta };

  const segments = buildCriticalCoachSegments(input, baseline, options.maxSegments);
  if (!segments.length) return { output: baseline, candidates: [], meta: { ...emptyMeta, segmentSolverElapsedMs: Date.now() - startedAt } };
  const segment = segments[0];
  const meta: SegmentSolverMeta = {
    ...emptyMeta,
    segmentSolverAttempted: true,
    segmentSolverSegmentsBuilt: segments.length,
    segmentSolverTargetCoachName: segment.coachName,
    segmentSolverWindowStart: hhmm(segment.windowStart),
    segmentSolverWindowEnd: hhmm(segment.windowEnd),
    segmentSolverTaskCount: segment.taskIds.length,
    segmentSolverTalentNames: segment.talentNames,
    segmentSolverResourceNames: segment.resourceNames,
  };
  if (segment.movableTaskIds.length > SEGMENT_SOLVER_MAX_TASKS) {
    return { output: baseline, candidates: [], meta: { ...meta, segmentSolverReason: "segment_too_large", segmentSolverElapsedMs: Date.now() - startedAt } };
  }
  if (!segment.movableTaskIds.length) {
    return { output: baseline, candidates: [], meta: { ...meta, segmentSolverReason: "no_movable_tasks", segmentSolverElapsedMs: Date.now() - startedAt } };
  }

  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const plannedById = new Map((baseline.plannedTasks ?? []).map((task) => [Number(task.taskId), task]));
  const targetCoachTaskIds = new Set(detectCoachAssignments(input, baseline).find((group) => group.coachName === segment.coachName)?.taskIds ?? []);
  const mealWindow = getMealMode(input).mode === "flexible_meal_window" ? getMealWindow(input) : null;
  const mealStart = toMinutes(mealWindow?.start);
  const mealEnd = toMinutes(mealWindow?.end);
  const deadline = startedAt + timeoutMs;
  let timedOut = false;
  let cancelled = false;
  let best = baseline;
  let bestScore = baseScore;
  let bestChanges = 0;
  let primaryOptimumFound = false;
  const candidates: EngineOutput[] = [];
  let candidatesGenerated = 0;
  const rejected = new Set<string>();
  const mealRejected = new Set<string>();

  const movable = segment.movableTaskIds.map((taskId) => {
    const task = taskById.get(taskId)!;
    const planned = plannedById.get(taskId)!;
    const currentStart = toMinutes(planned.startPlanned)!;
    const currentEnd = toMinutes(planned.endPlanned)!;
    const duration = currentEnd - currentStart;
    const isMeal = isMealTask(input, task) && mealStart !== null && mealEnd !== null;
    const domainStart = Math.max(segment.windowStart, isMeal ? mealStart! : segment.windowStart);
    const domainEnd = Math.min(segment.windowEnd, isMeal ? mealEnd! : segment.windowEnd) - duration;
    const fullDomain: number[] = [];
    for (let start = roundUpGrid(domainStart); start <= domainEnd; start += SEGMENT_SOLVER_GRID_MINUTES) fullDomain.push(start);
    const anchors = [currentStart, segment.windowStart, segment.windowEnd - duration];
    const ordered = [...new Set([...anchors, ...fullDomain]
      .filter((start) => start >= domainStart && start <= domainEnd && start % SEGMENT_SOLVER_GRID_MINUTES === 0))]
      .sort((a, b) => {
        const ideal = targetCoachTaskIds.has(taskId) ? Math.min(Math.abs(a - segment.windowStart), Math.abs(a - (segment.windowEnd - duration))) : Math.abs(a - currentStart);
        const otherIdeal = targetCoachTaskIds.has(taskId) ? Math.min(Math.abs(b - segment.windowStart), Math.abs(b - (segment.windowEnd - duration))) : Math.abs(b - currentStart);
        return ideal - otherIdeal || Math.abs(a - currentStart) - Math.abs(b - currentStart) || a - b;
      });
    return { taskId, task, currentStart, duration, isMeal, domain: ordered };
  }).sort((a, b) => Number(a.isMeal) - Number(b.isMeal) || Number(targetCoachTaskIds.has(a.taskId)) - Number(targetCoachTaskIds.has(b.taskId)) || a.taskId - b.taskId);

  meta.segmentSolverMealMovesAttempted = movable.some((item) => item.isMeal);

  const evaluate = (starts: Map<number, number>) => {
    if (Date.now() >= deadline) { timedOut = true; return; }
    if (options.shouldCancel?.()) { cancelled = true; return; }
    const candidate = candidateWithStarts(baseline, starts);
    const reasons = rejectionReasons(input, baseline, candidate);
    if (reasons.length) {
      reasons.forEach((reason) => rejected.add(reason));
      if ([...starts.keys()].some((taskId) => movable.find((item) => item.taskId === taskId)?.isMeal)) reasons.forEach((reason) => mealRejected.add(reason));
      return;
    }
    const changes = changedTaskCount(baseline, candidate);
    if (!changes) return;
    candidatesGenerated += 1;
    if (candidates.length < 50) candidates.push(candidate);
    const score = scoreCandidateSolution(input, candidate);
    if (compareSegmentScores(score, bestScore, changes, bestChanges) > 0 && score.makespan <= baseScore.makespan) {
      best = candidate;
      bestScore = score;
      bestChanges = changes;
      primaryOptimumFound = score.maxCoachGapMinutes === 0 && score.coachSplitDayPenalty === 0;
    }
  };

  // Exhaust every single-task placement first. This gives deterministic useful candidates before deeper search.
  for (const item of movable) {
    for (const start of item.domain) {
      if (start === item.currentStart) continue;
      evaluate(new Map([[item.taskId, start]]));
      if (timedOut || cancelled || primaryOptimumFound) break;
    }
    if (timedOut || cancelled || primaryOptimumFound) break;
  }

  // Exact DFS over a bounded high-impact subdomain; complete assignments are fully hard-validated.
  const searchItems = movable.filter((item) => targetCoachTaskIds.has(item.taskId) || item.isMeal).slice(-6);
  const dfs = (index: number, starts: Map<number, number>) => {
    if (timedOut || cancelled || Date.now() >= deadline) { timedOut = timedOut || Date.now() >= deadline; return; }
    if (options.shouldCancel?.()) { cancelled = true; return; }
    if (index >= searchItems.length) { evaluate(starts); return; }
    const item = searchItems[index];
    const domain = item.domain.slice(0, 12);
    for (const start of domain) {
      starts.set(item.taskId, start);
      dfs(index + 1, starts);
      starts.delete(item.taskId);
      if (timedOut || cancelled) return;
    }
  };
  if (!timedOut && !cancelled && !primaryOptimumFound && searchItems.length > 1) dfs(0, new Map());

  const accepted = best !== baseline && compareSegmentScores(bestScore, baseScore, bestChanges, 0) > 0;
  const movedMealCount = accepted ? movable.filter((item) => item.isMeal && (() => {
    const selected = best.plannedTasks?.find((task) => Number(task.taskId) === item.taskId);
    return toMinutes(selected?.startPlanned) !== item.currentStart;
  })()).length : 0;
  const reason = cancelled ? "cancelled" : timedOut ? "segment_solver_timeout" : accepted ? "accepted" : "candidate_not_better";
  if (timedOut) rejected.add("segment_candidate_timeout");
  meta.segmentSolverCandidatesGenerated = candidatesGenerated;
  meta.segmentSolverAccepted = accepted;
  meta.segmentSolverReason = reason;
  meta.segmentSolverRejectedReasons = [...rejected].slice(0, 10);
  meta.segmentSolverBestAfter = compactMetrics(accepted ? bestScore : baseScore);
  meta.segmentSolverImprovement = accepted ? improvementReason(baseScore, bestScore) : timedOut ? "segment_solver_timeout: best valid candidate retained" : "no lexicographic improvement";
  meta.segmentSolverElapsedMs = Math.max(0, Date.now() - startedAt);
  meta.segmentSolverMealMovesAccepted = movedMealCount > 0;
  meta.segmentSolverMealMoveCount = movedMealCount;
  meta.segmentSolverMealRejectedReasons = [...mealRejected].slice(0, 10);
  return { output: accepted ? best : baseline, candidates, meta };
};

export const segmentSolverSelectionReason = improvementReason;
