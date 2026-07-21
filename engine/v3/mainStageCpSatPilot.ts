import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { optimizeWithCpSat, type CpSatOptimizationResult } from "./cpSatOptimizer";
import { calculateMainStageGaps, toMinutes } from "./metrics";
import { getDependencyIds } from "./operationalPriority";
import { compareCandidateSolutions, explainCandidateComparison, scoreCandidateSolution, summarizeCandidateScore } from "./solutionScoring";
import { validateOptimizedCandidate } from "./validateCandidate";

export const MAIN_STAGE_CP_SAT_PILOT_MAX_TASKS = 30;
export const MAIN_STAGE_CP_SAT_SEGMENT_MAX_TASKS = 18;
export const MAIN_STAGE_CP_SAT_MAX_SEGMENTS = 3;
export const MAIN_STAGE_CP_SAT_PILOT_TIME_LIMIT_SECONDS = 0.5;

export type MainStageCpSatSegmentKind = "gap" | "restrictive_talent" | "coach_block";

export type MainStageCpSatPilotReason =
  | "eligible"
  | "missing_main_stage"
  | "no_main_stage_gap"
  | "no_direct_feeders"
  | "no_restrictive_talent"
  | "no_modelable_tasks"
  | "task_limit_exceeded"
  | "no_valid_segments"
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

export interface MainStageCpSatSegment {
  kind: MainStageCpSatSegmentKind;
  reason: string;
  taskIds: number[];
  mainStageTaskIds: number[];
  feederTaskIds: number[];
  restrictiveTalentIds: number[];
}

export interface MainStageCpSatSegmentSelection {
  segments: MainStageCpSatSegment[];
  reason: string;
  excludedTaskIds: number[];
}

export interface MainStageCpSatPilotMeta {
  cpSatPilotAttempted: boolean;
  cpSatPilotAccepted: boolean;
  cpSatPilotTaskCount: number;
  cpSatPilotRuntimeMs: number;
  cpSatPilotReason: MainStageCpSatPilotReason | string;
  cpSatPilotImprovementSummary?: string;
  cpSatSegmentsAttempted?: number;
  cpSatSegmentsAccepted?: number;
  cpSatSegmentReasons?: string[];
  cpSatSegmentTaskCounts?: number[];
  cpSatBestSegmentKind?: MainStageCpSatSegmentKind;
  cpSatSegmentImprovementSummary?: string;
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

const getRestrictiveTalentIds = (input: EngineV3Input): Set<number> => {
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

const plannedInterval = (plannedById: Map<number, any>, taskId: number) => {
  const row = plannedById.get(taskId);
  const start = toMinutes(row?.startPlanned);
  const end = toMinutes(row?.endPlanned);
  return start === null || end === null || end <= start ? null : { start, end };
};

const assignedResources = (plannedById: Map<number, any>, task: any): number[] => {
  const values = plannedById.get(Number(task?.id))?.assignedResources ?? task?.assignedResourceIds ?? [];
  return Array.isArray(values) ? values.map(Number).filter((id) => Number.isFinite(id) && id > 0) : [];
};

const segmentKindOrder: Record<MainStageCpSatSegmentKind, number> = { gap: 0, restrictive_talent: 1, coach_block: 2 };

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

  const restrictive = getRestrictiveTalentIds(input);
  const linkedTalentIds = new Set(mainTasks.map((task: any) => Number(task.contestantId)).filter((id) => restrictive.has(id)));
  if (!linkedTalentIds.size) return empty("no_restrictive_talent");

  const relatedIds = new Set<number>([...mainTasks.map((task: any) => Number(task.id)), ...feederIds]);
  const excludedTaskIds: number[] = [];
  const taskIds = [...relatedIds].filter((id) => {
    const task = byId.get(id);
    const include = task && !isProtected(input, task) && plannedById.has(id) && hasModelableData(task, plannedById);
    if (!include) excludedTaskIds.push(id);
    return include;
  }).sort((a, b) => a - b);
  const mainStageTaskIds = mainTasks.map((task: any) => Number(task.id)).filter((id) => taskIds.includes(id));
  const feederTaskIds = [...feederIds].filter((id) => taskIds.includes(id));
  if (!taskIds.length) return { ...empty("no_modelable_tasks"), excludedTaskIds };
  if (taskIds.length > maxTasks) return { eligible: false, reason: "task_limit_exceeded", taskIds, mainStageTaskIds, feederTaskIds, excludedTaskIds, restrictiveTalentIds: [...linkedTalentIds].sort((a, b) => a - b) };
  return { eligible: true, reason: "eligible", taskIds, mainStageTaskIds, feederTaskIds, excludedTaskIds, restrictiveTalentIds: [...linkedTalentIds].sort((a, b) => a - b) };
};

export const selectMainStageCpSatSegments = (
  input: EngineV3Input,
  warmStart: EngineOutput,
  maxTasks = MAIN_STAGE_CP_SAT_SEGMENT_MAX_TASKS,
  maxSegments = MAIN_STAGE_CP_SAT_MAX_SEGMENTS,
): MainStageCpSatSegmentSelection => {
  const mainZoneId = Number(input.optimizerMainZoneId);
  if (!Number.isFinite(mainZoneId) || mainZoneId <= 0) return { segments: [], reason: "missing_main_stage", excludedTaskIds: [] };
  const tasks = input.tasks ?? [];
  const byId = new Map(tasks.map((task: any) => [Number(task.id), task]));
  const plannedById = new Map((warmStart.plannedTasks ?? []).map((row: any) => [Number(row.taskId), row]));
  const excludedTaskIds: number[] = [];
  const modelable = new Set<number>();
  for (const task of tasks as any[]) {
    const id = Number(task.id);
    if (!isProtected(input, task) && plannedById.has(id) && hasModelableData(task, plannedById)) modelable.add(id);
    else if (Number.isFinite(id) && id > 0) excludedTaskIds.push(id);
  }
  const mainTasks = (tasks as any[]).filter((task) => Number(task.zoneId) === mainZoneId && plannedById.has(Number(task.id)));
  if (!mainTasks.length) return { segments: [], reason: "missing_main_stage", excludedTaskIds };
  const restrictive = getRestrictiveTalentIds(input);
  const feederIdsByMain = new Map<number, number[]>();
  const dependentMainIdsByFeeder = new Map<number, number[]>();
  for (const main of mainTasks) {
    const mainId = Number(main.id);
    const feeders = getDependencyIds(main).filter((id) => byId.has(id));
    feederIdsByMain.set(mainId, feeders);
    for (const feederId of feeders) dependentMainIdsByFeeder.set(feederId, [...(dependentMainIdsByFeeder.get(feederId) ?? []), mainId]);
  }

  const candidates: MainStageCpSatSegment[] = [];
  const addSegment = (kind: MainStageCpSatSegmentKind, reason: string, orderedIds: number[], mainIds: number[], feederIds: number[], talentIds: number[]) => {
    const taskIds = [...new Set(orderedIds)].filter((id) => modelable.has(id)).slice(0, Math.max(1, maxTasks));
    const selectedMain = mainIds.filter((id) => taskIds.includes(id));
    if (!taskIds.length || !selectedMain.length) return;
    candidates.push({
      kind, reason, taskIds,
      mainStageTaskIds: [...new Set(selectedMain)].sort((a, b) => a - b),
      feederTaskIds: [...new Set(feederIds.filter((id) => taskIds.includes(id)))].sort((a, b) => a - b),
      restrictiveTalentIds: [...new Set(talentIds)].sort((a, b) => a - b),
    });
  };

  const timedMain = mainTasks.map((task) => ({ task, interval: plannedInterval(plannedById, Number(task.id)) }))
    .filter((item): item is { task: any; interval: { start: number; end: number } } => item.interval !== null)
    .sort((a, b) => a.interval.start - b.interval.start || Number(a.task.id) - Number(b.task.id));
  for (let index = 1; index < timedMain.length; index++) {
    const before = timedMain[index - 1];
    const after = timedMain[index];
    if (after.interval.start <= before.interval.end) continue;
    const windowStart = before.interval.end - 60;
    const windowEnd = after.interval.start + 60;
    const nearbyMainIds = timedMain.filter((item) => item.interval.end >= windowStart && item.interval.start <= windowEnd).map((item) => Number(item.task.id));
    const feederIds = nearbyMainIds.flatMap((id) => feederIdsByMain.get(id) ?? []);
    const blockerIds = (tasks as any[]).filter((task) => {
      const id = Number(task.id);
      const interval = plannedInterval(plannedById, id);
      if (!interval || nearbyMainIds.includes(id) || feederIds.includes(id)) return false;
      return interval.end >= before.interval.end && interval.start <= after.interval.start
        && (Number(task.spaceId) === Number(before.task.spaceId)
          || assignedResources(plannedById, task).some((resourceId) => nearbyMainIds.some((mainId) => assignedResources(plannedById, byId.get(mainId)).includes(resourceId))));
    }).map((task) => Number(task.id)).sort((a, b) => a - b);
    const talentIds = nearbyMainIds.map((id) => Number((byId.get(id) as any)?.contestantId)).filter((id) => restrictive.has(id));
    addSegment("gap", `main_stage_gap_${before.interval.end}_${after.interval.start}`, [Number(before.task.id), Number(after.task.id), ...feederIds, ...nearbyMainIds, ...blockerIds], nearbyMainIds, feederIds, talentIds);
  }

  const restrictiveMain = mainTasks.filter((task) => restrictive.has(Number(task.contestantId))).sort((a, b) => {
    const aEnd = toMinutes(input.contestantAvailabilityById?.[Number(a.contestantId)]?.end) ?? Number.MAX_SAFE_INTEGER;
    const bEnd = toMinutes(input.contestantAvailabilityById?.[Number(b.contestantId)]?.end) ?? Number.MAX_SAFE_INTEGER;
    return aEnd - bEnd || Number(a.contestantId) - Number(b.contestantId) || Number(a.id) - Number(b.id);
  });
  for (const main of restrictiveMain) {
    const mainId = Number(main.id);
    const talentId = Number(main.contestantId);
    const feeders = feederIdsByMain.get(mainId) ?? [];
    const interval = plannedInterval(plannedById, mainId);
    const mainResources = assignedResources(plannedById, main);
    const competitors = interval ? (tasks as any[]).filter((task) => {
      const id = Number(task.id);
      const other = plannedInterval(plannedById, id);
      if (!other || id === mainId || feeders.includes(id)) return false;
      const local = other.end >= interval.start - 60 && other.start <= interval.end + 60;
      return local && (Number(task.spaceId) === Number(main.spaceId) || assignedResources(plannedById, task).some((id) => mainResources.includes(id)));
    }).map((task) => Number(task.id)).sort((a, b) => a - b) : [];
    const competitorMainIds = competitors.filter((id) => Number((byId.get(id) as any)?.zoneId) === mainZoneId);
    addSegment("restrictive_talent", `restrictive_talent_${talentId}`, [mainId, ...feeders, ...competitorMainIds, ...competitors], [mainId, ...competitorMainIds], feeders, [talentId]);
  }

  const coachIds = new Set((input.planResourceItems ?? []).filter((item: any) => Number(item?.typeId) === 10 || String(item?.name ?? "").toLowerCase().includes("coach")).map((item: any) => Number(item.id)));
  const coachFeeders = [...dependentMainIdsByFeeder.keys()].filter((id) => assignedResources(plannedById, byId.get(id)).some((resourceId) => coachIds.has(resourceId)));
  for (const coachId of [...coachIds].sort((a, b) => a - b)) {
    const feeders = coachFeeders.filter((id) => assignedResources(plannedById, byId.get(id)).includes(coachId)).sort((a, b) => {
      const ai = plannedInterval(plannedById, a);
      const bi = plannedInterval(plannedById, b);
      return (ai?.start ?? 0) - (bi?.start ?? 0) || a - b;
    });
    const windows: number[][] = [];
    for (const feederId of feeders) {
      const current = windows[windows.length - 1];
      const previousInterval = current?.length ? plannedInterval(plannedById, current[current.length - 1]) : null;
      const interval = plannedInterval(plannedById, feederId);
      if (!current || !previousInterval || !interval || interval.start - previousInterval.end > 90) windows.push([feederId]);
      else current.push(feederId);
    }
    for (const window of windows) {
      const localFeeders = window.slice(0, maxTasks);
      const mains = localFeeders.flatMap((id) => dependentMainIdsByFeeder.get(id) ?? []);
      const talentIds = mains.map((id) => Number((byId.get(id) as any)?.contestantId)).filter((id) => restrictive.has(id));
      const start = plannedInterval(plannedById, localFeeders[0])?.start ?? 0;
      addSegment("coach_block", `coach_block_${coachId}_${start}`, [...localFeeders, ...mains], mains, localFeeders, talentIds);
    }
  }

  const seen = new Set<string>();
  const segments = candidates.sort((a, b) => segmentKindOrder[a.kind] - segmentKindOrder[b.kind])
    .filter((segment) => {
      const signature = [...segment.taskIds].sort((a, b) => a - b).join(",");
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    }).slice(0, Math.max(0, maxSegments));
  return { segments, reason: segments.length ? "eligible" : "no_valid_segments", excludedTaskIds: excludedTaskIds.sort((a, b) => a - b) };
};

const toHHMM = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const CP_SAT_RUNTIME_UNAVAILABLE_DETAILS = ["ortools_import_failed", "python3_unavailable", "cp_sat_script_missing"] as const;

export const getCpSatRuntimeUnavailableDetails = (technicalDetails: readonly string[]): string[] => {
  const details = new Set(technicalDetails);
  return CP_SAT_RUNTIME_UNAVAILABLE_DETAILS.filter((detail) => details.has(detail));
};

export const isCpSatRuntimeUnavailable = (technicalDetails: readonly string[]): boolean => getCpSatRuntimeUnavailableDetails(technicalDetails).length > 0;

const deterministicPilotFallback = (input: EngineV3Input, warmStart: EngineOutput, movableTaskIds: number[], runtimeUnavailableDetails: readonly string[] = []): CpSatOptimizationResult => {
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
      const trial: EngineOutput = { ...candidate, plannedTasks: candidate.plannedTasks.map((row) => row.taskId === taskId ? { ...row, startPlanned: toHHMM(start), endPlanned: toHHMM(start + duration) } : row) };
      if (validateOptimizedCandidate(input, warmStart, trial).length === 0) { candidate = trial; break; }
    }
  }
  const baseScore = scoreCandidateSolution(input, warmStart);
  const candidateScore = scoreCandidateSolution(input, candidate);
  return {
    output: candidate,
    quality: { improved: compareCandidateSolutions(input, candidate, warmStart) > 0, baselineScore: baseScore.mainStageGapMinutes, optimizedScore: candidateScore.mainStageGapMinutes, objectiveDelta: candidateScore.mainStageGapMinutes - baseScore.mainStageGapMinutes, mainZoneGapMinutesDelta: candidateScore.mainStageGapMinutes - baseScore.mainStageGapMinutes, spaceSwitchesDelta: candidateScore.coachSwitchPenalty - baseScore.coachSwitchPenalty },
    degradations: [], message: "Fallback determinista acotado usado porque el runtime opcional de CP-SAT no está disponible.", technicalDetails: [...new Set([...runtimeUnavailableDetails, "deterministic_pilot_fallback"])],
  };
};

export type MainStageCpSatSolver = (input: EngineV3Input, warmStart: EngineOutput, timeLimitSeconds: number, movableTaskIds: number[]) => CpSatOptimizationResult;

const defaultSolver: MainStageCpSatSolver = (input, warmStart, timeLimitSeconds, movableTaskIds) => optimizeWithCpSat(input, warmStart, timeLimitSeconds, { movableTaskIds, pilotMode: true });

export const runMainStageCpSatPilot = (
  input: EngineV3Input,
  baseOutput: EngineOutput,
  solver: MainStageCpSatSolver = defaultSolver,
): { output: EngineOutput; meta: MainStageCpSatPilotMeta } => {
  const started = Date.now();
  const fullSelection = selectMainStageCpSatSubproblem(input, baseOutput);
  const selection = selectMainStageCpSatSegments(input, baseOutput);
  const baseMeta: MainStageCpSatPilotMeta = {
    cpSatPilotAttempted: false,
    cpSatPilotAccepted: false,
    cpSatPilotTaskCount: fullSelection.taskIds.length,
    cpSatPilotRuntimeMs: 0,
    cpSatPilotReason: selection.reason,
    cpSatSegmentsAttempted: 0,
    cpSatSegmentsAccepted: 0,
    cpSatSegmentReasons: selection.segments.map((segment) => segment.reason),
    cpSatSegmentTaskCounts: selection.segments.map((segment) => segment.taskIds.length),
  };
  if (!selection.segments.length) return { output: baseOutput, meta: { ...baseMeta, cpSatPilotReason: selection.reason, cpSatPilotRuntimeMs: Date.now() - started } };

  let selectedOutput = baseOutput;
  let accepted = 0;
  let attempted = 0;
  let bestKind: MainStageCpSatSegmentKind | undefined;
  const outcomes: string[] = [];
  for (const segment of selection.segments) {
    attempted += 1;
    const rawOptimized = solver(input, baseOutput, MAIN_STAGE_CP_SAT_PILOT_TIME_LIMIT_SECONDS, segment.taskIds);
    const unavailableDetails = getCpSatRuntimeUnavailableDetails(rawOptimized.technicalDetails);
    const usedDeterministicFallback = unavailableDetails.length > 0;
    const optimized = usedDeterministicFallback
      ? deterministicPilotFallback(input, baseOutput, segment.taskIds, unavailableDetails)
      : rawOptimized;
    if (optimized.noOptimized) { outcomes.push(`${segment.kind}:${segment.reason}:solver_unavailable`); continue; }
    const errors = validateOptimizedCandidate(input, baseOutput, optimized.output);
    const candidateHardViolations = scoreCandidateSolution(input, optimized.output).hardConstraintViolations;
    if (candidateHardViolations > 0) errors.push(`HARD_CONSTRAINT_VIOLATIONS_${candidateHardViolations}`);
    const evidenceSuffix = usedDeterministicFallback ? `:${optimized.technicalDetails.join("|")}` : "";
    if (errors.length > 0) { outcomes.push(`${segment.kind}:${segment.reason}:candidate_validation_failed(${errors.join("|")})${evidenceSuffix}`); continue; }
    if (compareCandidateSolutions(input, optimized.output, selectedOutput) <= 0) { outcomes.push(`${segment.kind}:${segment.reason}:candidate_not_better${evidenceSuffix}`); continue; }
    selectedOutput = optimized.output;
    accepted += 1;
    bestKind = segment.kind;
    outcomes.push(`${segment.kind}:${segment.reason}:accepted${evidenceSuffix}`);
  }
  const runtime = Math.max(0, Date.now() - started);
  const baseScore = scoreCandidateSolution(input, baseOutput);
  const selectedScore = scoreCandidateSolution(input, selectedOutput);
  const improvement = accepted > 0
    ? `${explainCandidateComparison("cp_sat_pilot", "fallback", selectedScore, baseScore)}; ${summarizeCandidateScore(selectedScore)}`
    : outcomes.join("; ");
  const reason: MainStageCpSatPilotReason = accepted > 0 ? "accepted"
    : outcomes.some((outcome) => outcome.includes("candidate_validation_failed")) ? "candidate_validation_failed"
      : outcomes.every((outcome) => outcome.includes("solver_unavailable")) ? "solver_unavailable" : "candidate_not_better";
  return {
    output: selectedOutput,
    meta: {
      ...baseMeta,
      cpSatPilotAttempted: attempted > 0,
      cpSatPilotAccepted: accepted > 0,
      cpSatPilotRuntimeMs: runtime,
      cpSatPilotReason: reason,
      cpSatPilotImprovementSummary: improvement,
      cpSatSegmentsAttempted: attempted,
      cpSatSegmentsAccepted: accepted,
      cpSatBestSegmentKind: bestKind,
      cpSatSegmentImprovementSummary: outcomes.join("; "),
    },
  };
};
