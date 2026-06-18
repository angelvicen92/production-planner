import type { EngineInput, EngineOutput, TaskInput, TimeWindow } from "../../types";
import type { EngineV3Options } from "../../v3/types";
import { validateHardConstraints } from "../../v3/hardValidation";
import type { V4StrategicAnalysis } from "../analysis";
import { evaluateV4PlanQuality, type V4PlanQualityEvaluation } from "../quality";

type Planned = EngineOutput["plannedTasks"][number];
type Interval = { start: number; end: number };

type PassName = "makespanReduction" | "talentStayCompaction" | "criticalResourceCompaction";

export interface V4PostOptimizerPassDiagnostics {
  name: PassName;
  accepted: number;
  rejected: number;
}

export interface V4PostOptimizerDiagnostics {
  applied: boolean;
  movesAccepted: number;
  movesRejected: number;
  makespanBefore: string | null;
  makespanAfter: string | null;
  mainFlowGapMinutesBefore: number;
  mainFlowGapMinutesAfter: number;
  totalTalentStayBefore: number;
  totalTalentStayAfter: number;
  passes: V4PostOptimizerPassDiagnostics[];
  warnings: string[];
}

export interface V4PostOptimizerResult {
  output: EngineOutput;
  quality: V4PlanQualityEvaluation;
  diagnostics: V4PostOptimizerDiagnostics;
}

interface V4PostOptimizerOptions extends EngineV3Options {
  postOptimizer?: Partial<{ maxMoves: number; maxCandidatesPerPass: number; maxRuntimeMs: number }>;
}

const DEFAULT_LIMITS = { maxMoves: 30, maxCandidatesPerPass: 100, maxRuntimeMs: 3000 };
const INF = Number.POSITIVE_INFINITY;
const STEP_MINUTES = 5;

const toMinutes = (value?: string | null): number | null => {
  const [h, m] = String(value ?? "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const toHHMM = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const duration = (planned: Planned, task?: TaskInput): number => {
  const start = toMinutes(planned.startPlanned);
  const end = toMinutes(planned.endPlanned);
  return start !== null && end !== null && end > start ? end - start : Math.max(0, Number(task?.durationOverrideMin ?? 30) || 30);
};
const metric = (quality: V4PlanQualityEvaluation) => ({
  unplanned: quality.risk.unplannedTasks,
  mainFlowGap: quality.mainFlowQuality?.internalGapMinutes ?? 0,
  makespan: toMinutes(quality.makespan.lastTaskEnd) ?? INF,
  score: quality.qualityScore,
  talentStay: quality.talentStayTime.totalStayMinutes,
  resourceGap: quality.criticalResourceUsage.reduce((sum, item) => sum + item.internalGapMinutes, 0),
});

export function isV4QualityBetter(candidateQuality: V4PlanQualityEvaluation, currentQuality: V4PlanQualityEvaluation): boolean {
  const candidate = metric(candidateQuality);
  const current = metric(currentQuality);
  return candidate.unplanned < current.unplanned
    || (candidate.unplanned === current.unplanned && candidate.mainFlowGap < current.mainFlowGap)
    || (candidate.unplanned === current.unplanned && candidate.mainFlowGap === current.mainFlowGap && candidate.makespan < current.makespan)
    || (candidate.unplanned === current.unplanned && candidate.mainFlowGap === current.mainFlowGap && candidate.makespan === current.makespan && candidate.score > current.score)
    || (candidate.unplanned === current.unplanned && candidate.mainFlowGap === current.mainFlowGap && candidate.makespan === current.makespan && candidate.score === current.score && candidate.talentStay < current.talentStay)
    || (candidate.unplanned === current.unplanned && candidate.mainFlowGap === current.mainFlowGap && candidate.makespan === current.makespan && candidate.score === current.score && candidate.talentStay === current.talentStay && candidate.resourceGap < current.resourceGap);
}

function qualityNotStrategicallyWorse(candidate: V4PlanQualityEvaluation, current: V4PlanQualityEvaluation): boolean {
  const a = metric(candidate);
  const b = metric(current);
  return a.unplanned <= b.unplanned && a.mainFlowGap <= b.mainFlowGap;
}

function taskById(input: EngineInput): Map<number, TaskInput> { return new Map((input.tasks ?? []).map((task) => [Number(task.id), task])); }
function realLockedIds(input: EngineInput): Set<number> { return new Set((input.locks ?? []).map((lock) => Number(lock.taskId)).filter(Number.isFinite)); }
function isMovable(task: TaskInput | undefined, locked: Set<number>): boolean {
  const status = String(task?.status ?? "").toLowerCase();
  return Boolean(task) && status === "pending" && !locked.has(Number(task?.id));
}
function plannedStart(planned: Planned): number { return toMinutes(planned.startPlanned) ?? INF; }
function plannedEnd(planned: Planned): number { return toMinutes(planned.endPlanned) ?? -INF; }
function windows(input: EngineInput): Interval {
  return { start: toMinutes(input.workDay?.start) ?? 0, end: toMinutes(input.workDay?.end) ?? 24 * 60 };
}
function windowToInterval(window?: TimeWindow | null): Interval | null {
  const start = toMinutes(window?.start);
  const end = toMinutes(window?.end);
  return start === null || end === null || end <= start ? null : { start, end };
}
function excludedIntervals(input: EngineInput): Interval[] {
  return [input.actualMeal, input.mealMode === "global_hard_break" ? input.meal : null, ...(input.globalHardBreaks ?? []), ...(input.protectedBreaks ?? [])]
    .map(windowToInterval).filter((item): item is Interval => item !== null);
}
function crossesExcluded(input: EngineInput, start: number, end: number): boolean {
  return excludedIntervals(input).some((breakWindow) => start < breakWindow.end && breakWindow.start < end);
}
function moveTask(output: EngineOutput, taskId: number, start: number, end: number): EngineOutput {
  return { ...output, plannedTasks: (output.plannedTasks ?? []).map((planned) => Number(planned.taskId) === taskId ? { ...planned, startPlanned: toHHMM(start), endPlanned: toHHMM(end) } : planned) };
}
function validateCandidate(input: EngineInput, candidate: EngineOutput): boolean {
  if (candidate.hardFeasible === false) return false;
  return validateHardConstraints(input as any, candidate).hardValidationPassed;
}

function tryMove(input: EngineInput, strategicAnalysis: V4StrategicAnalysis, currentOutput: EngineOutput, taskId: number, start: number, end: number, accept: (q: V4PlanQualityEvaluation) => boolean) {
  if (crossesExcluded(input, start, end)) return null;
  const candidateOutput = moveTask(currentOutput, taskId, start, end);
  if (!validateCandidate(input, candidateOutput)) return null;
  const candidateQuality = evaluateV4PlanQuality(input, candidateOutput, strategicAnalysis);
  return accept(candidateQuality) ? { output: candidateOutput, quality: candidateQuality } : null;
}

function criticalResourceIdsForTask(task: TaskInput | undefined, planned: Planned, criticalIds: Set<number>): number[] {
  const ids = [...(planned.assignedResources ?? []), ...Object.keys(task?.resourceRequirements?.byItem ?? {}).map(Number), ...(task?.assignedResourceIds ?? [])].map(Number).filter(Number.isFinite);
  return [...new Set(ids.filter((id) => criticalIds.has(id)))];
}

export function optimizeV4PlanPostSelection(input: EngineInput, output: EngineOutput, strategicAnalysis: V4StrategicAnalysis, quality: V4PlanQualityEvaluation, options?: V4PostOptimizerOptions): V4PostOptimizerResult {
  const limits = { ...DEFAULT_LIMITS, ...(options?.postOptimizer ?? {}) };
  const started = Date.now();
  const warnings: string[] = [];
  const passes: V4PostOptimizerPassDiagnostics[] = [];
  const before = quality;
  let currentOutput = output;
  let currentQuality = quality;
  let acceptedTotal = 0;
  let rejectedTotal = 0;
  const tasks = taskById(input);
  const locked = realLockedIds(input);
  const day = windows(input);

  const limitReached = () => {
    if (acceptedTotal >= limits.maxMoves) { warnings.push(`Post-optimizer stopped after maxMoves=${limits.maxMoves}.`); return true; }
    if (Date.now() - started >= limits.maxRuntimeMs) { warnings.push(`Post-optimizer stopped after maxRuntimeMs=${limits.maxRuntimeMs}.`); return true; }
    return false;
  };

  const runPass = (name: PassName, candidates: Planned[], startsFor: (planned: Planned, task: TaskInput, dur: number) => number[], accept: (q: V4PlanQualityEvaluation) => boolean) => {
    let accepted = 0, rejected = 0, seen = 0;
    for (const planned of candidates) {
      if (limitReached() || seen >= limits.maxCandidatesPerPass) break;
      const task = tasks.get(Number(planned.taskId));
      if (!isMovable(task, locked)) continue;
      const dur = duration(planned, task);
      for (const start of startsFor(planned, task!, dur)) {
        if (limitReached() || seen >= limits.maxCandidatesPerPass) break;
        seen += 1;
        const end = start + dur;
        if (start < day.start || end > day.end || start === plannedStart(planned)) continue;
        const result = tryMove(input, strategicAnalysis, currentOutput, Number(planned.taskId), start, end, accept);
        if (result) { currentOutput = result.output; currentQuality = result.quality; accepted += 1; acceptedTotal += 1; break; }
        rejected += 1; rejectedTotal += 1;
      }
    }
    passes.push({ name, accepted, rejected });
  };

  runPass("makespanReduction",
    [...(currentOutput.plannedTasks ?? [])].sort((a, b) => plannedEnd(b) - plannedEnd(a)).slice(0, 20),
    (planned, task, dur) => {
      const original = plannedStart(planned);
      const starts: number[] = [];
      for (let t = day.start; t + dur <= original; t += STEP_MINUTES) starts.push(t);
      return starts.reverse();
    },
    (q) => isV4QualityBetter(q, currentQuality) && (q.mainFlowQuality?.internalGapMinutes ?? 0) <= (currentQuality.mainFlowQuality?.internalGapMinutes ?? 0),
  );

  const topTalentIds = new Set(currentQuality.talentStayTime.topWaitingTalents.slice(0, 5).map((talent) => Number(talent.talentId)));
  runPass("talentStayCompaction",
    [...(currentOutput.plannedTasks ?? [])].filter((p) => topTalentIds.has(Number(tasks.get(Number(p.taskId))?.contestantId))).sort((a, b) => plannedEnd(b) - plannedEnd(a)),
    (planned, _task, dur) => {
      const original = plannedStart(planned);
      const starts: number[] = [];
      for (let t = Math.max(day.start, original - 180); t <= Math.min(day.end - dur, original + 180); t += STEP_MINUTES) starts.push(t);
      return starts.sort((a, b) => Math.abs(a - original) - Math.abs(b - original));
    },
    (q) => isV4QualityBetter(q, currentQuality) && qualityNotStrategicallyWorse(q, currentQuality) && metric(q).makespan <= metric(currentQuality).makespan,
  );

  const criticalIds = new Set((strategicAnalysis.criticalResources ?? []).map((resource) => Number(resource.id)));
  runPass("criticalResourceCompaction",
    [...(currentOutput.plannedTasks ?? [])].filter((p) => criticalResourceIdsForTask(tasks.get(Number(p.taskId)), p, criticalIds).length > 0).sort((a, b) => plannedStart(a) - plannedStart(b)),
    (planned, _task, dur) => {
      const original = plannedStart(planned);
      const starts: number[] = [];
      for (let t = Math.max(day.start, original - 120); t <= Math.min(day.end - dur, original + 120); t += STEP_MINUTES) starts.push(t);
      return starts.sort((a, b) => Math.abs(a - original) - Math.abs(b - original));
    },
    (q) => isV4QualityBetter(q, currentQuality) && qualityNotStrategicallyWorse(q, currentQuality) && metric(q).makespan <= metric(currentQuality).makespan,
  );

  return {
    output: currentOutput,
    quality: currentQuality,
    diagnostics: {
      applied: true,
      movesAccepted: acceptedTotal,
      movesRejected: rejectedTotal,
      makespanBefore: before.makespan.lastTaskEnd,
      makespanAfter: currentQuality.makespan.lastTaskEnd,
      mainFlowGapMinutesBefore: before.mainFlowQuality?.internalGapMinutes ?? 0,
      mainFlowGapMinutesAfter: currentQuality.mainFlowQuality?.internalGapMinutes ?? 0,
      totalTalentStayBefore: before.talentStayTime.totalStayMinutes,
      totalTalentStayAfter: currentQuality.talentStayTime.totalStayMinutes,
      passes,
      warnings,
    },
  };
}
