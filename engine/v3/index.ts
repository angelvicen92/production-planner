import type { EngineOutput, EngineOutputUnplanned } from "../types";
import { solve_v3_phaseA_attempt } from "./phaseAHeuristic";
import type { EngineV3Input, EngineV3Options, EngineV3ProgressPhase } from "./types";
import { applyFinalHardValidationGate, validateHardConstraints } from "./hardValidation";
import { optimizeWithCpSat } from "./cpSatOptimizer";
import { validateOptimizedCandidate } from "./validateCandidate";
import { getStructuredBlockers, summarizeStructuredBlockers } from "./blockers";
import {
  compareCandidateScores,
  compareCandidateSolutions,
  explainCandidateComparison,
  scoreCandidateSolution,
  summarizeCandidateScore,
} from "./solutionScoring";
import {
  generateOperationalNeighborhoodSearchCandidates,
  shouldAttemptOperationalNeighborhoods,
  type OperationalNeighborhoodReason,
} from "./operationalNeighborhoods";
import { runMainStageCpSatPilot, type MainStageCpSatPilotMeta } from "./mainStageCpSatPilot";
import { calculateEngineOperationalCompactionMetrics, compactOperationalMetrics } from "./operationalQuality";
import { detectCoachAssignments } from "./coachDetection";
import { generatePipelineBuilderCandidates, type PipelineBuilderDiagnostics, type PipelineConflictDetail } from "./pipelineBuilder";
import { normalizePipelineDiagnosticsMetadata } from "./pipelineDiagnostics";
import { runMealSchedulerSafely } from "./mealScheduler";
import { normalizeMealDiagnosticsMetadata } from "./mealDiagnostics";
import { runSegmentSolver, segmentSolverSelectionReason, type SegmentSolverMeta } from "./segmentSolver";


const PROGRESS_LABELS: Record<EngineV3ProgressPhase, string> = {
  queued: "En cola",
  loading_input: "Cargando datos",
  phase_a_base_solution: "Construyendo solución base",
  hard_validation: "Validando restricciones",
  backtracking: "Explorando alternativas",
  operational_neighborhoods: "Mejorando calidad operativa",
  segment_solver: "Optimizando segmento crítico",
  coach_compaction: "Compactando jornadas de coaches",
  coach_wave_ordering: "Ordenando olas de coaches",
  pipeline_builder: "Construyendo pipelines",
  pipeline_repair: "Reparando pipelines",
  lane_only_repair: "Reparando carriles exclusivos",
  meal_scheduling: "Programando comidas",
  scoring_candidates: "Comparando candidatos",
  persisting_result: "Guardando resultado",
  success: "Completado",
  failed: "Fallido",
  cancelled: "Cancelado",
};

const emitProgress = (
  options: EngineV3Options | undefined,
  phase: EngineV3ProgressPhase,
  progressPercent: number,
  message: string,
  details: { candidatesEvaluated?: number; candidatesGenerated?: number; currentBestReason?: string } = {},
): void => {
  const now = new Date().toISOString();
  options?.onProgress?.({
    phase,
    label: PROGRESS_LABELS[phase],
    progressPercent: Math.max(0, Math.min(100, Math.round(progressPercent))),
    startedAt: now,
    updatedAt: now,
    message,
    ...details,
  });
};

type AttemptSummary = {
  level: number;
  ok: boolean;
  ms: number;
  topReasons: string[];
  reason?: string;
};

const GRID_MIN = 5;

const compactCoachWaveMetrics = (score: ReturnType<typeof scoreCandidateSolution>): Record<string, number> => ({
  coachIdlePenalty: score.coachIdlePenalty,
  coachSpanPenalty: score.coachSpanPenalty,
  maxCoachGapMinutes: score.maxCoachGapMinutes,
  coachSplitDayPenalty: score.coachSplitDayPenalty,
  coachSwitchPenalty: score.coachSwitchPenalty,
  talentIdlePenalty: score.talentIdlePenalty,
  mainStageGapMinutes: score.mainStageGapMinutes,
});

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



type BacktrackingMeta = {
  backtrackingAttempted: boolean;
  backtrackingAccepted: boolean;
  backtrackingAttempts: number;
  backtrackingBranchesExplored: number;
  backtrackingTimeMs: number;
  backtrackingFallbackReason?: string;
  greedyFailedBeforeBacktracking: boolean;
  solutionSource?: "phaseA_greedy" | "phaseA_backtracking" | "operational_neighborhood" | "pipeline_builder" | "segment_solver" | "cp_sat_pilot" | "cp_sat" | "fallback" | "infeasible";
  candidateSolutionsEvaluated?: number;
  bestCandidateSource?: "phaseA_greedy" | "phaseA_backtracking" | "operational_neighborhood" | "pipeline_builder" | "segment_solver" | "cp_sat_pilot" | "cp_sat" | "fallback" | "infeasible";
  bestCandidateScore?: string;
  greedyCandidateScore?: string;
  backtrackingBestScore?: string;
  candidateSelectionReason?: string;
  candidateComparisonSummary?: string;
  selectedCandidateMetrics?: NonNullable<EngineOutput["v3Meta"]>["selectedCandidateMetrics"];
  neighborhoodSearchAttempted?: boolean;
  neighborhoodCandidatesGenerated?: number;
  neighborhoodSearchDepth?: number;
  neighborhoodDepth1Candidates?: number;
  neighborhoodDepth2Candidates?: number;
  neighborhoodChainsEvaluated?: number;
  neighborhoodAcceptedChain?: string;
  neighborhoodCandidateAccepted?: boolean;
  neighborhoodAcceptedReason?: string;
  neighborhoodSearchTimeMs?: number;
  neighborhoodTypesAttempted?: string[];
  neighborhoodTypesGenerated?: string[];
  neighborhoodRejectedReasons?: Record<string, number>;
  operationalCompactionAttempted?: boolean;
  operationalCompactionCandidatesGenerated?: number;
  operationalCompactionAccepted?: boolean;
  operationalCompactionReason?: string;
  operationalCompactionMetricsBefore?: Record<string, number>;
  operationalCompactionMetricsAfter?: Record<string, number>;
  coachCompactionAttempted?: boolean;
  coachCompactionCandidatesGenerated?: number;
  coachCompactionRejectedReasons?: string[];
  coachCompactionTargetedCoaches?: Array<{ coachId: number | null; coachName: string; maxGapMinutes: number; spanMinutes: number; idleMinutes: number }>;
  coachCompactionBestBefore?: Record<string, number>;
  coachCompactionBestAfter?: Record<string, number>;
  coachWaveOrderingAttempted?: boolean;
  coachWaveCandidatesGenerated?: number;
  coachWaveAccepted?: boolean;
  coachWaveReason?: string;
  coachWaveBefore?: Record<string, number>;
  coachWaveAfter?: Record<string, number>;
  pipelineBuilderAttempted?: boolean;
  pipelineCandidatesGenerated?: number;
  pipelineAccepted?: boolean;
  pipelineReason?: string;
  pipelineRejectedReasons?: string[];
  pipelineBefore?: Record<string, number>;
  pipelineAfter?: Record<string, number>;
  pipelineMappedTalents?: string[];
  pipelineUnmappedTalents?: string[];
  pipelineMovedTasks?: number[];
  pipelineStableTasks?: number[];
  pipelineFeederOutcomes?: string[];
  mealPrePipelineAttempted?: boolean;
  mealPrePipelineCandidatesGenerated?: number;
  mealPrePipelineAccepted?: boolean;
  mealPrePipelineReason?: string;
  mealPrePipelineRejectedReasons?: string[];
  mealSchedulerPhase?: "pre_pipeline" | "during_pipeline_repair" | "post_pipeline";
  pipelineRepairAttempted?: boolean;
  pipelineRepairCandidatesGenerated?: number;
  pipelineRepairAccepted?: boolean;
  pipelineConflictDetails?: PipelineConflictDetail[];
  pipelineSegmentRepairAttempted?: boolean;
  pipelineSegmentRepairCandidatesGenerated?: number;
  pipelineSegmentRepairAccepted?: boolean;
  pipelineSegmentRepairReason?: string;
  pipelineSegmentRepairStrategiesTried?: string[];
  pipelineSegmentRepairMovedTalentNames?: string[];
  pipelineSegmentRepairRejectedReasons?: string[];
  pipelineLaneOnlyRepairAttempted?: boolean;
  pipelineLaneOnlyRepairCandidatesGenerated?: number;
  pipelineLaneOnlyRepairAccepted?: boolean;
  pipelineLaneOnlyRepairReason?: string;
  pipelineLaneOnlyRepairRejectedReasons?: string[];
  pipelineLaneOnlyRepairMovedTaskIds?: number[];
  pipelineLaneOnlyRepairMovedTalentNames?: string[];
  cpSatPilotAttempted?: boolean;
  cpSatPilotAccepted?: boolean;
  cpSatPilotTaskCount?: number;
  cpSatPilotRuntimeMs?: number;
  cpSatPilotReason?: string;
  cpSatPilotImprovementSummary?: string;
  cpSatSegmentsAttempted?: number;
  cpSatSegmentsAccepted?: number;
  cpSatSegmentReasons?: string[];
  cpSatSegmentTaskCounts?: number[];
  cpSatBestSegmentKind?: "gap" | "restrictive_talent" | "coach_block";
  cpSatSegmentImprovementSummary?: string;
};

type BacktrackingBranch = {
  reason: string;
  forcedTaskStarts: Record<number, number>;
};

const isReplannableTask = (task: any, locks: any[]): boolean => {
  const status = String(task?.status ?? "pending");
  if (status === "done" || status === "in_progress") return false;
  if (Boolean(task?.isManualBlock)) return false;
  const taskId = Number(task?.id ?? NaN);
  return !locks.some((lock: any) => {
    const lockTaskId = Number(lock?.taskId ?? NaN);
    if (lockTaskId !== taskId) return false;
    const lockType = String(lock?.lockType ?? "").toLowerCase();
    return lockType === "time" || lockType === "full";
  });
};

const hasRestrictiveAvailability = (input: EngineV3Input): boolean => {
  const dayStart = toMinutes(input.workDay?.start ?? "");
  const dayEnd = toMinutes(input.workDay?.end ?? "");
  const availability = ((input as any)?.contestantAvailabilityById ?? {}) as Record<number, { start?: string; end?: string }>;
  return Object.values(availability).some((window) => {
    const start = toMinutes(String(window?.start ?? ""));
    const end = toMinutes(String(window?.end ?? ""));
    if (start === null || end === null || dayStart === null || dayEnd === null) return false;
    return start > dayStart || end < dayEnd;
  });
};

const deriveLimitedBacktrackingBranches = (input: EngineV3Input, output: EngineOutput, maxBranches: number): BacktrackingBranch[] => {
  const taskById = new Map((input.tasks ?? []).map((task: any) => [Number(task?.id ?? NaN), task]));
  const branches: BacktrackingBranch[] = [];
  const seen = new Set<string>();
  const pushBranch = (taskId: number, start: number, reason: string) => {
    const task = taskById.get(taskId) as any;
    if (!task || !isReplannableTask(task, input.locks ?? [])) return;
    const duration = Number(task?.durationOverrideMin ?? task?.durationMin ?? NaN);
    const endDay = toMinutes(input.workDay?.end ?? "");
    if (!Number.isFinite(duration) || duration <= 0 || endDay === null || start + duration > endDay) return;
    const key = `${taskId}:${start}`;
    if (seen.has(key)) return;
    seen.add(key);
    branches.push({ reason, forcedTaskStarts: { [taskId]: start } });
  };

  for (const item of output.unplanned ?? []) {
    if (branches.length >= maxBranches) break;
    const blockedTaskId = Number((item as any)?.taskId ?? (item as any)?.reason?.taskId ?? NaN);
    const details = (item as any)?.reason?.details ?? {};
    const availabilityStart = toMinutes(String(details.availabilityStart ?? ""));
    const availabilityEnd = toMinutes(String(details.availabilityEnd ?? ""));
    const suggested = toMinutes(String(details.suggested ?? ""));
    const structuredBlockers = getStructuredBlockers(details);

    for (const blocker of structuredBlockers) {
      if (branches.length >= maxBranches) break;
      const blockerId = Number(blocker.blockingTaskId ?? NaN);
      const blockerEnd = toMinutes(String(blocker.end ?? ""));
      const alternativeStart = toMinutes(String(blocker.suggestedAlternativeStart ?? ""));

      if (blocker.blockerType === "availability" && availabilityStart !== null && Number.isFinite(blockedTaskId) && blockedTaskId > 0) {
        pushBranch(blockedTaskId, snapToGrid(availabilityStart), "reserve_restrictive_availability_start");
      }

      if (!blocker.movable || !Number.isFinite(blockerId) || blockerId <= 0) continue;
      if (availabilityEnd !== null) pushBranch(blockerId, snapToGrid(availabilityEnd), `${blocker.blockerType}_after_restrictive_availability_end`);
      if (blockerEnd !== null) pushBranch(blockerId, snapToGrid(blockerEnd), `${blocker.blockerType}_after_blocker_end`);
      if (alternativeStart !== null && alternativeStart !== suggested) pushBranch(blockerId, snapToGrid(alternativeStart), `${blocker.blockerType}_structured_alternative_start`);
    }

    const blockingTasks = Array.isArray(details.blockingTasks) ? details.blockingTasks : [];
    for (const blocker of blockingTasks) {
      if (branches.length >= maxBranches) break;
      const blockerId = Number(blocker?.taskId ?? NaN);
      if (!Number.isFinite(blockerId) || blockerId <= 0) continue;
      if (availabilityEnd !== null) pushBranch(blockerId, snapToGrid(availabilityEnd), "legacy_after_restrictive_availability_end");
      if (suggested !== null) pushBranch(blockerId, snapToGrid(suggested), "legacy_engine_suggested_start");
    }
  }
  return branches.slice(0, maxBranches);
};

const snapToGrid = (minutes: number): number => Math.ceil(minutes / GRID_MIN) * GRID_MIN;

const buildCandidateMeta = (
  input: EngineV3Input,
  selectedSource: "phaseA_greedy" | "phaseA_backtracking",
  selectedOutput: EngineOutput,
  greedyOutput: EngineOutput,
  backtrackingOutput: EngineOutput | null,
  evaluated: number,
  fallbackReason?: string,
): Partial<BacktrackingMeta> => {
  const selectedScore = scoreCandidateSolution(input, selectedOutput);
  const greedyScore = scoreCandidateSolution(input, greedyOutput);
  const backtrackingScore = backtrackingOutput ? scoreCandidateSolution(input, backtrackingOutput) : null;
  const rejectedSource = selectedSource === "phaseA_backtracking" ? "phaseA_greedy" : "phaseA_backtracking";
  const rejectedScore = selectedSource === "phaseA_backtracking" ? greedyScore : backtrackingScore;
  const summary = rejectedScore
    ? explainCandidateComparison(selectedSource, rejectedSource, selectedScore, rejectedScore)
    : "no alternative candidate improved greedy";

  return {
    backtrackingAccepted: selectedSource === "phaseA_backtracking",
    solutionSource: selectedSource,
    backtrackingFallbackReason: selectedSource === "phaseA_backtracking" ? undefined : fallbackReason,
    candidateSolutionsEvaluated: evaluated,
    bestCandidateSource: selectedSource,
    bestCandidateScore: summarizeCandidateScore(selectedScore),
    greedyCandidateScore: summarizeCandidateScore(greedyScore),
    backtrackingBestScore: backtrackingScore ? summarizeCandidateScore(backtrackingScore) : undefined,
    candidateSelectionReason: summary,
    candidateComparisonSummary: summary,
    selectedCandidateMetrics: {
      coachSwitchCount: selectedScore.coachSwitchCount,
      coachSwitchPenalty: selectedScore.coachSwitchPenalty,
      maxCoachGapMinutes: selectedScore.maxCoachGapMinutes,
      coachIdlePenalty: selectedScore.coachIdlePenalty,
      coachSpanPenalty: selectedScore.coachSpanPenalty,
      coachSplitDayPenalty: selectedScore.coachSplitDayPenalty,
      talentIdlePenalty: selectedScore.talentIdlePenalty,
      talentSpanPenalty: selectedScore.talentSpanPenalty,
      maxGapPenalty: selectedScore.maxGapPenalty,
      bundleCoherencePenalty: selectedScore.bundleCoherencePenalty,
      bundleSwitchPenalty: selectedScore.bundleSwitchPenalty,
      partialBundleUsageWarnings: selectedScore.partialBundleUsageWarnings,
      bundleSpaceAffinityMatches: selectedScore.bundleSpaceAffinityMatches,
      bundleSpaceAffinityMismatches: selectedScore.bundleSpaceAffinityMismatches,
      restrictiveTalentAverageStartOffset: selectedScore.restrictiveTalentAverageStartOffset,
      mainStageGapMinutes: selectedScore.mainStageGapMinutes,
      mainStageGapCount: selectedScore.mainStageGapCount,
      makespan: selectedScore.makespan === Number.MAX_SAFE_INTEGER ? null : selectedScore.makespan,
      hardConstraintViolations: selectedScore.hardConstraintViolations,
    },
  };
};

const deriveComparativeBacktrackingBranches = (input: EngineV3Input, output: EngineOutput, maxBranches: number): BacktrackingBranch[] => {
  const taskById = new Map((input.tasks ?? []).map((task: any) => [Number(task?.id ?? NaN), task]));
  const branches: BacktrackingBranch[] = [];
  const seen = new Set<string>();
  const pushBranch = (taskId: number, start: number, reason: string) => {
    if (branches.length >= maxBranches) return;
    const task = taskById.get(taskId) as any;
    if (!task || !isReplannableTask(task, input.locks ?? [])) return;
    const duration = Number(task?.durationOverrideMin ?? task?.durationMin ?? NaN);
    const endDay = toMinutes(input.workDay?.end ?? "");
    if (!Number.isFinite(duration) || duration <= 0 || endDay === null || start + duration > endDay) return;
    const key = `${taskId}:${start}`;
    if (seen.has(key)) return;
    seen.add(key);
    branches.push({ reason, forcedTaskStarts: { [taskId]: start } });
  };

  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  if (Number.isFinite(mainZoneId) && mainZoneId > 0) {
    const plannedById = new Map((output.plannedTasks ?? []).map((planned: any) => [Number(planned.taskId), planned]));
    const rows = (input.tasks ?? [])
      .filter((task: any) => Number(task?.zoneId ?? NaN) === mainZoneId)
      .map((task: any) => ({ task, planned: plannedById.get(Number(task?.id ?? NaN)) as any }))
      .filter((row) => row.planned?.startPlanned && row.planned?.endPlanned)
      .sort((a, b) => (toMinutes(String(a.planned.startPlanned)) ?? 0) - (toMinutes(String(b.planned.startPlanned)) ?? 0));
    for (let i = 1; i < rows.length; i++) {
      const prevEnd = toMinutes(String(rows[i - 1].planned.endPlanned));
      const currentStart = toMinutes(String(rows[i].planned.startPlanned));
      const taskId = Number(rows[i].task?.id ?? NaN);
      if (prevEnd !== null && currentStart !== null && currentStart > prevEnd) {
        pushBranch(taskId, snapToGrid(prevEnd), "compact_main_stage_gap");
      }
    }
  }

  const dayStart = toMinutes(input.workDay?.start ?? "");
  const availability = ((input as any)?.contestantAvailabilityById ?? {}) as Record<number, { start?: string; end?: string }>;
  const plannedById = new Map((output.plannedTasks ?? []).map((planned: any) => [Number(planned.taskId), planned]));
  for (const task of input.tasks ?? []) {
    const contestantId = Number((task as any)?.contestantId ?? NaN);
    const window = Number.isFinite(contestantId) ? availability[contestantId] : null;
    const windowStart = toMinutes(window?.start ?? "");
    const currentStart = toMinutes(String((plannedById.get(Number((task as any)?.id)) as any)?.startPlanned ?? ""));
    if (dayStart !== null && windowStart !== null && windowStart > dayStart && currentStart !== null && currentStart > windowStart) {
      pushBranch(Number((task as any).id), snapToGrid(windowStart), "prioritize_restrictive_availability_start");
    }
  }

  return branches.slice(0, maxBranches);
};

const hasComparativeSelectionRisk = (input: EngineV3Input, output: EngineOutput): boolean => {
  if (!output.complete) return false;
  if ((input.locks ?? []).some((lock: any) => String(lock?.lockType ?? "").toLowerCase() === "time" || String(lock?.lockType ?? "").toLowerCase() === "full")) return false;
  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  if (Number.isFinite(mainZoneId) && mainZoneId > 0 && (input.optimizerMainZoneOptKeepBusy || input.optimizerPrioritizeMainZone)) {
    const branches = deriveComparativeBacktrackingBranches(input, output, 1);
    if (branches.length > 0) return true;
  }
  if (hasRestrictiveAvailability(input)) return true;
  return false;
};

const runLimitedBacktracking = (
  input: EngineV3Input,
  baseOutput: EngineOutput,
  level: number,
  options?: EngineV3Options,
): { output: EngineOutput; meta: BacktrackingMeta } => {
  const started = Date.now();
  const maxAttemptsRaw = Number(options?.maxBacktrackAttempts ?? (input as any)?.maxBacktrackAttempts ?? 50);
  const maxDepthRaw = Number(options?.maxBacktrackDepth ?? (input as any)?.maxBacktrackDepth ?? 2);
  const maxSearchMsRaw = Number(options?.maxSearchMs ?? (input as any)?.maxSearchMs ?? 150);
  const maxAttempts = Math.max(0, Math.min(50, Number.isFinite(maxAttemptsRaw) ? Math.floor(maxAttemptsRaw) : 50));
  const maxDepth = Math.max(1, Math.min(2, Number.isFinite(maxDepthRaw) ? Math.floor(maxDepthRaw) : 2));
  const maxSearchMs = Math.max(0, Math.min(1000, Number.isFinite(maxSearchMsRaw) ? Math.floor(maxSearchMsRaw) : 150));
  const meta: BacktrackingMeta = {
    backtrackingAttempted: true,
    backtrackingAccepted: false,
    backtrackingAttempts: 0,
    backtrackingBranchesExplored: 0,
    backtrackingTimeMs: 0,
    greedyFailedBeforeBacktracking: !Boolean(baseOutput.complete),
  };

  const finish = (selected: EngineOutput, selectedSource: "phaseA_greedy" | "phaseA_backtracking", backtrackingBest: EngineOutput | null, fallbackReason?: string) => {
    Object.assign(meta, buildCandidateMeta(input, selectedSource, selected, baseOutput, backtrackingBest, Math.max(1, meta.candidateSolutionsEvaluated ?? 1), fallbackReason));
    meta.backtrackingTimeMs = Math.max(0, Date.now() - started);
    return { output: selected, meta };
  };

  if (maxAttempts <= 0 || maxSearchMs <= 0) {
    meta.backtrackingFallbackReason = "budget_exhausted";
    meta.candidateSolutionsEvaluated = 1;
    meta.backtrackingTimeMs = Math.max(0, Date.now() - started);
    return { output: baseOutput, meta };
  }

  const initialBranches = baseOutput.complete
    ? deriveComparativeBacktrackingBranches(input, baseOutput, maxAttempts)
    : deriveLimitedBacktrackingBranches(input, baseOutput, maxAttempts);
  const queue = initialBranches.map((branch) => ({ ...branch, depth: 1 }));
  if (!queue.length) {
    meta.backtrackingFallbackReason = "no_relevant_alternatives";
    meta.candidateSolutionsEvaluated = 1;
    meta.backtrackingTimeMs = Math.max(0, Date.now() - started);
    return { output: baseOutput, meta };
  }

  let bestBacktracking: EngineOutput | null = null;
  meta.candidateSolutionsEvaluated = 1;
  const seen = new Set<string>();
  while (queue.length && meta.backtrackingAttempts < maxAttempts) {
    if (Date.now() - started >= maxSearchMs) {
      meta.backtrackingFallbackReason = "budget_exhausted";
      break;
    }
    const branch = queue.shift()!;
    const signature = Object.entries(branch.forcedTaskStarts).sort(([a], [b]) => Number(a) - Number(b)).map(([k, v]) => `${k}:${v}`).join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);
    meta.backtrackingAttempts += 1;
    meta.backtrackingBranchesExplored += 1;
    const out = solve_v3_phaseA_attempt(cloneWithSoftLevel(input, level), {
      maxIterations: 8000,
      forcedTaskStarts: branch.forcedTaskStarts,
    } as any);
    meta.candidateSolutionsEvaluated += 1;
    if (!bestBacktracking || compareCandidateSolutions(input, out, bestBacktracking) > 0) {
      bestBacktracking = out;
    }
    if (!out.complete && branch.depth < maxDepth) {
      for (const next of deriveLimitedBacktrackingBranches(input, out, Math.max(0, maxAttempts - meta.backtrackingAttempts))) {
        const merged = { ...branch.forcedTaskStarts, ...next.forcedTaskStarts };
        const mergedSignature = Object.entries(merged).sort(([a], [b]) => Number(a) - Number(b)).map(([k, v]) => `${k}:${v}`).join("|");
        if (!seen.has(mergedSignature) && !queue.some((queued) => Object.entries(queued.forcedTaskStarts).sort(([a], [b]) => Number(a) - Number(b)).map(([k, v]) => `${k}:${v}`).join("|") === mergedSignature)) {
          queue.push({ ...next, forcedTaskStarts: merged, depth: branch.depth + 1 });
        }
      }
    }
  }

  if (bestBacktracking && compareCandidateSolutions(input, bestBacktracking, baseOutput) > 0) {
    meta.backtrackingFallbackReason = undefined;
    return finish(bestBacktracking, "phaseA_backtracking", bestBacktracking);
  }

  const reason = bestBacktracking ? "no_alternative_improved_greedy" : (meta.backtrackingFallbackReason ?? "no_solution_found");
  return finish(baseOutput, "phaseA_greedy", bestBacktracking, reason);
};


export const runOperationalNeighborhoodSelection = (
  input: EngineV3Input,
  baseOutput: EngineOutput,
  baseSource: "phaseA_greedy" | "phaseA_backtracking",
): { output: EngineOutput; meta: Partial<BacktrackingMeta> } => {
  const started = Date.now();
  const attempted = shouldAttemptOperationalNeighborhoods(input, baseOutput);
  const compactionBefore = calculateEngineOperationalCompactionMetrics(input, baseOutput);
  const detectedCoaches = detectCoachAssignments(input, baseOutput);
  const coachNameById = new Map(detectedCoaches.map((coach) => [coach.coachId, coach.coachName]));
  const targetedCoaches = compactionBefore.coaches
    .filter((coach) => coach.maxGapMinutes >= 90)
    .sort((a, b) => b.maxGapMinutes - a.maxGapMinutes || b.idleMinutes - a.idleMinutes || a.id - b.id)
    .map((coach) => ({
      coachId: coach.id,
      coachName: coachNameById.get(coach.id) ?? `Coach ${coach.id}`,
      maxGapMinutes: coach.maxGapMinutes,
      spanMinutes: coach.spanMinutes,
      idleMinutes: coach.idleMinutes,
    }));
  const coachCompactionAttempted = detectedCoaches.length > 0 && targetedCoaches.length > 0;
  const initialCoachRejectedReasons = detectedCoaches.length === 0
    ? ["no_coaches_detected"]
    : targetedCoaches.length === 0 ? ["no_large_coach_gap"] : [];
  const compactionAttempted = attempted && compactionBefore.needsCompaction;
  const baseScore = scoreCandidateSolution(input, baseOutput);
  if (!attempted) {
    return {
      output: baseOutput,
      meta: {
        neighborhoodSearchAttempted: false,
        neighborhoodCandidatesGenerated: 0,
        neighborhoodCandidateAccepted: false,
        neighborhoodSearchTimeMs: Math.max(0, Date.now() - started),
        solutionSource: baseSource,
        operationalCompactionAttempted: false,
        operationalCompactionCandidatesGenerated: 0,
        operationalCompactionAccepted: false,
        operationalCompactionReason: "plan already compact or operational neighborhoods not applicable",
        operationalCompactionMetricsBefore: compactOperationalMetrics(compactionBefore),
        operationalCompactionMetricsAfter: compactOperationalMetrics(compactionBefore),
        coachCompactionAttempted,
        coachCompactionCandidatesGenerated: 0,
        coachCompactionRejectedReasons: initialCoachRejectedReasons.length ? initialCoachRejectedReasons : ["no_valid_bundle_slot_found"],
        coachCompactionTargetedCoaches: targetedCoaches,
        coachCompactionBestBefore: compactOperationalMetrics(compactionBefore),
        coachCompactionBestAfter: compactOperationalMetrics(compactionBefore),
        coachWaveOrderingAttempted: false,
        coachWaveCandidatesGenerated: 0,
        coachWaveAccepted: false,
        coachWaveReason: "generator_not_invoked",
        coachWaveBefore: compactCoachWaveMetrics(baseScore),
        coachWaveAfter: compactCoachWaveMetrics(baseScore),
      },
    };
  }

  const search = generateOperationalNeighborhoodSearchCandidates(input, baseOutput);
  const neighborhoodDiagnostics = search.diagnostics;
  const candidates = search.candidates;
  const compactionReasons = new Set<OperationalNeighborhoodReason>(["coach_wave_order", "coach_gap_compaction", "talent_day_compaction", "late_block_pull_forward", "early_block_push_later"]);
  const compactionCandidateCount = candidates.filter((candidate) => compactionReasons.has(candidate.reason)).length;
  let bestOutput = baseOutput;
  let bestReason: OperationalNeighborhoodReason | null = null;
  let bestChain: OperationalNeighborhoodReason[] | null = null;
  let bestScore = baseScore;
  for (const candidate of candidates) {
    const candidateValidation = validateHardConstraints(input, candidate.output);
    if (!candidateValidation.hardValidationPassed) {
      neighborhoodDiagnostics.rejectedReasons.HARD_VALIDATION_FAILED = (neighborhoodDiagnostics.rejectedReasons.HARD_VALIDATION_FAILED ?? 0) + 1;
      continue;
    }
    const candidateScore = scoreCandidateSolution(input, candidate.output);
    if (compareCandidateSolutions(input, candidate.output, bestOutput) > 0) {
      bestOutput = candidate.output;
      bestReason = candidate.reason;
      bestChain = candidate.chain ?? [candidate.reason];
      bestScore = candidateScore;
    }
  }

  const accepted = bestOutput !== baseOutput;
  const comparison = accepted
    ? bestChain?.includes("coach_wave_order")
      ? "operational_neighborhood selected: coach wave ordering"
      : explainCandidateComparison("operational_neighborhood", baseSource, bestScore, baseScore)
    : (coachCompactionAttempted && candidates.some((candidate) => candidate.reason === "coach_gap_compaction")
      ? "kept current: coach compaction candidates did not improve"
      : candidates.length
        ? explainCandidateComparison(baseSource, "operational_neighborhood", baseScore, candidates.map((candidate) => scoreCandidateSolution(input, candidate.output)).sort((a, b) => compareCandidateScores(b, a))[0])
        : "no operational neighborhood candidate generated");

  const coachWaveCandidates = candidates.filter((candidate) => candidate.reason === "coach_wave_order");
  const coachWaveSelected = accepted && bestChain?.includes("coach_wave_order") === true;
  const bestCoachWaveOutput = coachWaveCandidates.reduce<EngineOutput>((best, candidate) => (
    compareCandidateSolutions(input, candidate.output, best) > 0 ? candidate.output : best
  ), baseOutput);
  const bestCoachWaveScore = scoreCandidateSolution(input, bestCoachWaveOutput);
  const coachWaveAccepted = compareCandidateSolutions(input, bestCoachWaveOutput, baseOutput) > 0;
  const waveRejections = Object.keys(neighborhoodDiagnostics.rejectedReasons)
    .filter((reason) => reason.startsWith("coach_wave_order:"))
    .map((reason) => reason.slice("coach_wave_order:".length));
  const compactWaveRejection = waveRejections.includes("blocked_by_dependencies")
    ? "blocked_by_dependencies"
    : waveRejections.includes("blocked_by_main_stage_continuity")
      ? "blocked_by_main_stage_continuity"
      : waveRejections.some((reason) => reason === "blocked_by_space_capacity" || reason === "blocked_by_resource_conflict")
        ? "blocked_by_resource_or_space"
        : waveRejections.some((reason) => reason === "hard_constraint_violation" || reason === "blocked_by_availability")
          ? "would_increase_hard_violations"
          : neighborhoodDiagnostics.coachWaveReason === "coach_wave_candidates_generated"
            ? "no_valid_wave_candidate"
            : neighborhoodDiagnostics.coachWaveReason ?? "no_valid_wave_candidate";
  const coachWaveReason = coachWaveSelected
    ? "operational_neighborhood selected: coach wave ordering"
    : coachWaveAccepted
      ? bestCoachWaveScore.coachSplitDayPenalty < baseScore.coachSplitDayPenalty
        ? "operational_neighborhood selected: lower coach split"
        : "operational_neighborhood selected: lower coach max gap"
      : coachWaveCandidates.length > 0
        ? "no_valid_wave_candidate"
        : compactWaveRejection;
  const coachCandidates = candidates.filter((candidate) => candidate.reason === "coach_gap_compaction");
  const bestCoachOutput = coachCandidates.reduce<EngineOutput>((best, candidate) => {
    const bestMetrics = calculateEngineOperationalCompactionMetrics(input, best);
    const candidateMetrics = calculateEngineOperationalCompactionMetrics(input, candidate.output);
    const candidateImprovesCoach = candidateMetrics.maxCoachGapMinutes < bestMetrics.maxCoachGapMinutes
      || (candidateMetrics.maxCoachGapMinutes === bestMetrics.maxCoachGapMinutes
        && candidateMetrics.coachIdlePenalty < bestMetrics.coachIdlePenalty)
      || (candidateMetrics.maxCoachGapMinutes === bestMetrics.maxCoachGapMinutes
        && candidateMetrics.coachIdlePenalty === bestMetrics.coachIdlePenalty
        && candidateMetrics.coachSpanPenalty < bestMetrics.coachSpanPenalty);
    return candidateImprovesCoach ? candidate.output : best;
  }, baseOutput);
  const coachCompactionAfter = calculateEngineOperationalCompactionMetrics(input, bestCoachOutput);
  const coachRejectedReasons = [...new Set([
    ...initialCoachRejectedReasons,
    ...Object.keys(neighborhoodDiagnostics.rejectedReasons)
      .filter((reason) => reason.startsWith("coach_gap_compaction:"))
      .map((reason) => reason.slice("coach_gap_compaction:".length))
      .filter((reason) => [
        "blocked_by_dependency_chain",
        "blocked_by_resource_conflict",
        "blocked_by_space_conflict",
        "blocked_by_main_stage_continuity",
        "blocked_by_availability",
        "bundle_too_large",
        "would_move_locked_or_executed",
        "no_movable_tasks",
        "no_valid_bundle_slot_found",
      ].includes(reason)),
  ])];
  if (coachCompactionAttempted && bestCoachOutput === baseOutput && coachRejectedReasons.length === 0) {
    coachRejectedReasons.push("no_valid_bundle_slot_found");
  }
  const compactionAfter = calculateEngineOperationalCompactionMetrics(input, bestOutput);
  const compactionAccepted = accepted && (bestScore.maxCoachGapMinutes < baseScore.maxCoachGapMinutes
    || bestScore.coachIdlePenalty < baseScore.coachIdlePenalty
    || bestScore.coachSpanPenalty < baseScore.coachSpanPenalty
    || bestScore.coachSplitDayPenalty < baseScore.coachSplitDayPenalty
    || bestScore.talentIdlePenalty < baseScore.talentIdlePenalty
    || bestScore.talentSpanPenalty < baseScore.talentSpanPenalty
    || bestScore.maxGapPenalty < baseScore.maxGapPenalty);

  return {
    output: bestOutput,
    meta: {
      neighborhoodSearchAttempted: true,
      neighborhoodCandidatesGenerated: candidates.length,
      neighborhoodSearchDepth: search.depth2Candidates > 0 || search.chainsEvaluated > 0 ? 2 : 1,
      neighborhoodDepth1Candidates: search.depth1Candidates,
      neighborhoodDepth2Candidates: search.depth2Candidates,
      neighborhoodChainsEvaluated: search.chainsEvaluated,
      neighborhoodAcceptedChain: accepted ? bestChain?.join(" -> ") : undefined,
      neighborhoodCandidateAccepted: accepted,
      neighborhoodAcceptedReason: accepted ? bestReason ?? comparison : undefined,
      neighborhoodSearchTimeMs: Math.max(0, Date.now() - started),
      neighborhoodTypesAttempted: neighborhoodDiagnostics.attemptedTypes,
      neighborhoodTypesGenerated: neighborhoodDiagnostics.generatedTypes,
      neighborhoodRejectedReasons: neighborhoodDiagnostics.rejectedReasons,
      operationalCompactionAttempted: compactionAttempted,
      operationalCompactionCandidatesGenerated: compactionCandidateCount,
      operationalCompactionAccepted: compactionAccepted,
      operationalCompactionReason: compactionAccepted
        ? comparison
        : compactionAttempted ? "kept greedy: no candidate improved operational span" : "plan already compact",
      operationalCompactionMetricsBefore: compactOperationalMetrics(compactionBefore),
      operationalCompactionMetricsAfter: compactOperationalMetrics(compactionAfter),
      coachCompactionAttempted,
      coachCompactionCandidatesGenerated: coachCandidates.length,
      coachCompactionRejectedReasons: coachRejectedReasons,
      coachCompactionTargetedCoaches: targetedCoaches,
      coachCompactionBestBefore: compactOperationalMetrics(compactionBefore),
      coachCompactionBestAfter: compactOperationalMetrics(coachCompactionAfter),
      coachWaveOrderingAttempted: neighborhoodDiagnostics.coachWaveOrderingAttempted ?? false,
      coachWaveCandidatesGenerated: coachWaveCandidates.length,
      coachWaveAccepted,
      coachWaveReason,
      coachWaveBefore: compactCoachWaveMetrics(baseScore),
      coachWaveAfter: compactCoachWaveMetrics(bestCoachWaveScore),
      solutionSource: accepted ? "operational_neighborhood" : baseSource,
      candidateSolutionsEvaluated: 1 + candidates.length,
      bestCandidateSource: accepted ? "operational_neighborhood" : baseSource,
      bestCandidateScore: summarizeCandidateScore(bestScore),
      greedyCandidateScore: baseSource === "phaseA_greedy" ? summarizeCandidateScore(baseScore) : undefined,
      backtrackingBestScore: baseSource === "phaseA_backtracking" ? summarizeCandidateScore(baseScore) : undefined,
      candidateSelectionReason: comparison,
      candidateComparisonSummary: comparison,
      selectedCandidateMetrics: {
        coachSwitchCount: bestScore.coachSwitchCount,
        coachSwitchPenalty: bestScore.coachSwitchPenalty,
        maxCoachGapMinutes: bestScore.maxCoachGapMinutes,
        coachIdlePenalty: bestScore.coachIdlePenalty,
        coachSpanPenalty: bestScore.coachSpanPenalty,
        coachSplitDayPenalty: bestScore.coachSplitDayPenalty,
        talentIdlePenalty: bestScore.talentIdlePenalty,
        talentSpanPenalty: bestScore.talentSpanPenalty,
        maxGapPenalty: bestScore.maxGapPenalty,
        bundleCoherencePenalty: bestScore.bundleCoherencePenalty,
        bundleSwitchPenalty: bestScore.bundleSwitchPenalty,
        partialBundleUsageWarnings: bestScore.partialBundleUsageWarnings,
        bundleSpaceAffinityMatches: bestScore.bundleSpaceAffinityMatches,
        bundleSpaceAffinityMismatches: bestScore.bundleSpaceAffinityMismatches,
        restrictiveTalentAverageStartOffset: bestScore.restrictiveTalentAverageStartOffset,
        mainStageGapMinutes: bestScore.mainStageGapMinutes,
        mainStageGapCount: bestScore.mainStageGapCount,
        makespan: bestScore.makespan === Number.MAX_SAFE_INTEGER ? null : bestScore.makespan,
        hardConstraintViolations: bestScore.hardConstraintViolations,
      },
    },
  };
};

export const runSegmentSolverSelection = (
  input: EngineV3Input,
  baseOutput: EngineOutput,
  baseSource: NonNullable<BacktrackingMeta["solutionSource"]>,
  baseMeta: Partial<BacktrackingMeta> = {},
  options?: EngineV3Options,
): { output: EngineOutput; meta: Partial<BacktrackingMeta> & SegmentSolverMeta } => {
  const result = runSegmentSolver(input, baseOutput, {
    timeoutMs: options?.segmentSolverTimeoutMs,
    disabled: options?.enableSegmentSolver === false || (input as any)?.enableSegmentSolver === false,
    shouldCancel: options?.shouldCancel,
  });
  const accepted = result.meta.segmentSolverAccepted;
  const output = result.output;
  const score = scoreCandidateSolution(input, output);
  const source = accepted ? "segment_solver" : baseSource;
  const selectionReason = accepted
    ? segmentSolverSelectionReason(scoreCandidateSolution(input, baseOutput), score)
    : baseMeta.candidateSelectionReason ?? result.meta.segmentSolverImprovement ?? "segment_solver kept base candidate";
  return {
    output,
    meta: {
      ...baseMeta,
      ...result.meta,
      solutionSource: source,
      bestCandidateSource: source,
      candidateSolutionsEvaluated: Number(baseMeta.candidateSolutionsEvaluated ?? 1) + result.meta.segmentSolverCandidatesGenerated,
      bestCandidateScore: summarizeCandidateScore(score),
      candidateSelectionReason: selectionReason,
      candidateComparisonSummary: selectionReason,
      selectedCandidateMetrics: {
        coachSwitchCount: score.coachSwitchCount,
        coachSwitchPenalty: score.coachSwitchPenalty,
        maxCoachGapMinutes: score.maxCoachGapMinutes,
        coachIdlePenalty: score.coachIdlePenalty,
        coachSpanPenalty: score.coachSpanPenalty,
        coachSplitDayPenalty: score.coachSplitDayPenalty,
        talentIdlePenalty: score.talentIdlePenalty,
        talentSpanPenalty: score.talentSpanPenalty,
        maxGapPenalty: score.maxGapPenalty,
        bundleCoherencePenalty: score.bundleCoherencePenalty,
        bundleSwitchPenalty: score.bundleSwitchPenalty,
        partialBundleUsageWarnings: score.partialBundleUsageWarnings,
        bundleSpaceAffinityMatches: score.bundleSpaceAffinityMatches,
        bundleSpaceAffinityMismatches: score.bundleSpaceAffinityMismatches,
        restrictiveTalentAverageStartOffset: score.restrictiveTalentAverageStartOffset,
        mainStageGapMinutes: score.mainStageGapMinutes,
        mainStageGapCount: score.mainStageGapCount,
        makespan: score.makespan === Number.MAX_SAFE_INTEGER ? null : score.makespan,
        hardConstraintViolations: score.hardConstraintViolations,
      },
    },
  };
};

export const runPipelineBuilderSelection = (
  input: EngineV3Input,
  baseOutput: EngineOutput,
  baseSource: NonNullable<BacktrackingMeta["solutionSource"]>,
  baseMeta: Partial<BacktrackingMeta> = {},
): { output: EngineOutput; meta: Partial<BacktrackingMeta> } => {
  const baseScore = scoreCandidateSolution(input, baseOutput);
  const diagnostics: PipelineBuilderDiagnostics = {
    attempted: false,
    candidatesGenerated: 0,
    reason: "generator_not_invoked",
    rejectedReasons: [],
    before: compactCoachWaveMetrics(baseScore),
    after: compactCoachWaveMetrics(baseScore),
    mappedTalents: [],
    unmappedTalents: [],
    movedTaskIds: [],
    stableTaskIds: [],
    feederOutcomes: [],
    repairAttempted: false,
    repairCandidatesGenerated: 0,
    repairAccepted: false,
    conflictDetails: [],
    segmentRepairAttempted: false,
    segmentRepairCandidatesGenerated: 0,
    segmentRepairAccepted: false,
    segmentRepairReason: "generator_not_invoked",
    segmentRepairStrategiesTried: [],
    segmentRepairMovedTalentNames: [],
    segmentRepairRejectedReasons: [],
    laneRepairAttempted: false,
    laneRepairCandidatesGenerated: 0,
    laneRepairAccepted: false,
    laneRepairReason: "not_attempted",
    laneRepairRejectedReasons: [],
    laneOnlyRepairAttempted: false,
    laneOnlyRepairCandidatesGenerated: 0,
    laneOnlyRepairAccepted: false,
    laneOnlyRepairReason: "not_attempted",
    laneOnlyRepairRejectedReasons: [],
    laneOnlyRepairMovedTaskIds: [],
    laneOnlyRepairMovedTalentNames: [],
    alternativeLaneAttempted: false,
    alternativeLaneCandidatesGenerated: 0,
    alternativeLaneAccepted: false,
    alternativeLaneRejectedReasons: [],
  };
  const prePipelineMeal = runMealSchedulerSafely(input, baseOutput);
  const prePipelineMealDiagnostics = {
    ...prePipelineMeal.diagnostics,
    mealSchedulerPhase: "pre_pipeline" as const,
    mealPrePipelineAttempted: prePipelineMeal.diagnostics.mealSchedulerAttempted,
    mealPrePipelineCandidatesGenerated: prePipelineMeal.diagnostics.mealAssignmentsGenerated,
    mealPrePipelineAccepted: prePipelineMeal.diagnostics.mealSchedulerAccepted,
    mealPrePipelineReason: prePipelineMeal.diagnostics.mealSchedulerReason,
    mealPrePipelineRejectedReasons: prePipelineMeal.diagnostics.mealSchedulerRejectedReasons,
    mealSchedulerPipelineIntegrationReason: prePipelineMeal.diagnostics.mealSchedulerAttempted
      ? "flexible_meals_normalized_before_pipeline_candidates"
      : prePipelineMeal.diagnostics.mealSchedulerPipelineIntegrationReason,
  };
  const candidates = generatePipelineBuilderCandidates(input, baseOutput, diagnostics);
  if (prePipelineMealDiagnostics.mealPrePipelineAccepted && prePipelineMeal.output !== baseOutput) {
    const normalizedCandidates = generatePipelineBuilderCandidates(input, prePipelineMeal.output, diagnostics)
      .map((candidate) => ({ ...candidate, mealAware: true as const, prePipelineMealNormalized: true as const }));
    candidates.push(...normalizedCandidates);
    diagnostics.candidatesGenerated = candidates.length;
  }
  let bestOutput = baseOutput;
  let bestCandidate: (typeof candidates)[number] | null = null;
  for (const candidate of candidates) {
    if (compareCandidateSolutions(input, candidate.output, bestOutput) > 0) {
      bestOutput = candidate.output;
      bestCandidate = candidate;
    }
  }
  const accepted = bestOutput !== baseOutput;
  const bestScore = scoreCandidateSolution(input, bestOutput);
  if (!accepted && candidates.length > 0 && !diagnostics.rejectedReasons.includes("candidate_not_better_than_baseline")) {
    diagnostics.rejectedReasons.push("candidate_not_better_than_baseline");
    diagnostics.rejectedReasons.push("pipeline_candidate_generated_but_lost_scoring");
    if (diagnostics.repairCandidatesGenerated > 0) diagnostics.rejectedReasons.push("repair_valid_but_not_better_than_baseline");
  }
  const selectionReason = accepted
    ? bestCandidate?.mealAware && bestCandidate.laneOnlyRepaired
      ? "pipeline_builder selected: meal-aware lane repair"
      : bestCandidate?.mealAware
        ? bestScore.maxCoachGapMinutes < baseScore.maxCoachGapMinutes
          ? "pipeline_builder selected: meal-aware repair lower coach gap"
          : "pipeline_builder selected: pre-pipeline meal normalization"
        : bestScore.coachSplitDayPenalty < baseScore.coachSplitDayPenalty
          ? bestCandidate?.laneOnlyRepaired ? "pipeline_builder selected: slack-aware lane repair better operational quality" : bestCandidate?.segmentRepaired ? "pipeline_builder selected: segment repair lower coach split" : "pipeline_builder selected: lower coach split"
          : bestScore.maxCoachGapMinutes < baseScore.maxCoachGapMinutes
            ? bestCandidate?.laneOnlyRepaired ? "pipeline_builder selected: slack-aware lane repair lower coach gap" : bestCandidate?.segmentRepaired ? "pipeline_builder selected: segment repair lower coach gap" : "pipeline_builder selected: lower coach max gap"
            : bestCandidate?.laneOnlyRepaired ? "pipeline_builder selected: slack-aware lane repair better operational quality" : bestCandidate?.segmentRepaired ? "pipeline_builder selected: segment repair better operational quality" : "pipeline_builder selected: better operational quality"
    : null;
  const reason = accepted
    ? diagnostics.reason === "partial_mapping_used" ? "partial_mapping_used" : selectionReason!
    : candidates.length > 0
      ? diagnostics.repairCandidatesGenerated > 0 ? "repair_valid_but_not_better_than_baseline" : "pipeline_candidate_generated_but_lost_scoring"
      : diagnostics.repairAttempted
        ? diagnostics.rejectedReasons.includes("repair_blocked_by_locked_or_executed")
          ? "repair_blocked_by_locked_or_executed"
          : "repair_attempted_but_no_valid_candidate"
        : diagnostics.reason;
  const segmentRepairReason = accepted && bestCandidate?.segmentRepaired
    ? selectionReason!
    : diagnostics.segmentRepairAttempted && diagnostics.segmentRepairCandidatesGenerated > 0
      ? "repair_valid_but_not_better_than_baseline"
      : diagnostics.segmentRepairReason;
  const segmentRepairRejectedReasons = [...new Set([
    ...diagnostics.segmentRepairRejectedReasons,
    ...(!accepted && diagnostics.segmentRepairCandidatesGenerated > 0 ? ["repair_valid_but_not_better_than_baseline"] : []),
  ])].slice(0, 10);
  const selectedMetrics: NonNullable<EngineOutput["v3Meta"]>["selectedCandidateMetrics"] = {
    coachSwitchCount: bestScore.coachSwitchCount,
    coachSwitchPenalty: bestScore.coachSwitchPenalty,
    maxCoachGapMinutes: bestScore.maxCoachGapMinutes,
    coachIdlePenalty: bestScore.coachIdlePenalty,
    coachSpanPenalty: bestScore.coachSpanPenalty,
    coachSplitDayPenalty: bestScore.coachSplitDayPenalty,
    talentIdlePenalty: bestScore.talentIdlePenalty,
    talentSpanPenalty: bestScore.talentSpanPenalty,
    maxGapPenalty: bestScore.maxGapPenalty,
    bundleCoherencePenalty: bestScore.bundleCoherencePenalty,
    bundleSwitchPenalty: bestScore.bundleSwitchPenalty,
    partialBundleUsageWarnings: bestScore.partialBundleUsageWarnings,
    bundleSpaceAffinityMatches: bestScore.bundleSpaceAffinityMatches,
    bundleSpaceAffinityMismatches: bestScore.bundleSpaceAffinityMismatches,
    restrictiveTalentAverageStartOffset: bestScore.restrictiveTalentAverageStartOffset,
    mainStageGapMinutes: bestScore.mainStageGapMinutes,
    mainStageGapCount: bestScore.mainStageGapCount,
    makespan: bestScore.makespan === Number.MAX_SAFE_INTEGER ? null : bestScore.makespan,
    hardConstraintViolations: bestScore.hardConstraintViolations,
  };
  return {
    output: bestOutput,
    meta: {
      ...baseMeta,
      ...prePipelineMealDiagnostics,
      pipelineBuilderAttempted: diagnostics.attempted,
      pipelineCandidatesGenerated: candidates.length,
      pipelineAccepted: accepted,
      pipelineReason: reason,
      pipelineRejectedReasons: diagnostics.rejectedReasons,
      pipelineBefore: diagnostics.before,
      pipelineAfter: accepted ? compactCoachWaveMetrics(bestScore) : diagnostics.after,
      pipelineMappedTalents: diagnostics.mappedTalents.slice(0, 20),
      pipelineUnmappedTalents: diagnostics.unmappedTalents.slice(0, 20),
      pipelineMovedTasks: (bestCandidate?.movedTaskIds ?? diagnostics.movedTaskIds).slice(0, 50),
      pipelineStableTasks: (bestCandidate?.stableTaskIds ?? diagnostics.stableTaskIds).slice(0, 50),
      pipelineFeederOutcomes: bestCandidate?.feederOutcomes ?? diagnostics.feederOutcomes,
      ...normalizePipelineDiagnosticsMetadata({
        ...baseMeta,
        pipelineRejectedReasons: diagnostics.rejectedReasons,
        pipelineRepairAttempted: diagnostics.repairAttempted,
        pipelineRepairCandidatesGenerated: diagnostics.repairCandidatesGenerated,
        pipelineRepairAccepted: accepted && Boolean(bestCandidate?.repaired),
        pipelineConflictDetails: diagnostics.conflictDetails,
        pipelineSegmentRepairAttempted: diagnostics.segmentRepairAttempted,
        pipelineSegmentRepairCandidatesGenerated: diagnostics.segmentRepairCandidatesGenerated,
        pipelineSegmentRepairAccepted: accepted && Boolean(bestCandidate?.segmentRepaired),
        pipelineSegmentRepairReason: segmentRepairReason,
        pipelineSegmentRepairStrategiesTried: diagnostics.segmentRepairStrategiesTried,
        pipelineSegmentRepairMovedTalentNames: bestCandidate?.movedTalentNames ?? diagnostics.segmentRepairMovedTalentNames,
        pipelineSegmentRepairRejectedReasons: segmentRepairRejectedReasons,
        pipelineLaneRepairAttempted: diagnostics.laneRepairAttempted,
        pipelineLaneRepairCandidatesGenerated: diagnostics.laneRepairCandidatesGenerated,
        pipelineLaneRepairAccepted: accepted && diagnostics.laneRepairAccepted,
        pipelineLaneRepairReason: diagnostics.laneRepairReason,
        pipelineLaneRepairRejectedReasons: diagnostics.laneRepairRejectedReasons,
        pipelineLaneOnlyRepairAttempted: diagnostics.laneOnlyRepairAttempted,
        pipelineLaneOnlyRepairCandidatesGenerated: diagnostics.laneOnlyRepairCandidatesGenerated,
        pipelineLaneOnlyRepairAccepted: accepted && Boolean(bestCandidate?.laneOnlyRepaired),
        pipelineLaneOnlyRepairReason: diagnostics.laneOnlyRepairReason,
        pipelineLaneOnlyRepairRejectedReasons: diagnostics.laneOnlyRepairRejectedReasons,
        pipelineLaneOnlyRepairMovedTaskIds: (bestCandidate?.laneRepairMovedTaskIds ?? diagnostics.laneOnlyRepairMovedTaskIds).slice(0, 20),
        pipelineLaneOnlyRepairMovedTalentNames: (bestCandidate?.laneRepairMovedTalentNames ?? diagnostics.laneOnlyRepairMovedTalentNames).slice(0, 10),
        pipelineAlternativeLaneAttempted: diagnostics.alternativeLaneAttempted,
        pipelineAlternativeLaneCandidatesGenerated: diagnostics.alternativeLaneCandidatesGenerated,
        pipelineAlternativeLaneAccepted: accepted && diagnostics.alternativeLaneAccepted,
        pipelineAlternativeLaneRejectedReasons: diagnostics.alternativeLaneRejectedReasons,
      }),
      candidateSolutionsEvaluated: Number(baseMeta.candidateSolutionsEvaluated ?? 1) + candidates.length,
      solutionSource: accepted ? "pipeline_builder" : baseSource,
      bestCandidateSource: accepted ? "pipeline_builder" : baseMeta.bestCandidateSource ?? baseSource,
      bestCandidateScore: accepted ? summarizeCandidateScore(bestScore) : baseMeta.bestCandidateScore ?? summarizeCandidateScore(baseScore),
      candidateSelectionReason: accepted ? selectionReason! : baseMeta.candidateSelectionReason,
      candidateComparisonSummary: accepted ? `${selectionReason} (${bestCandidate?.kind})` : baseMeta.candidateComparisonSummary ?? reason,
      selectedCandidateMetrics: accepted ? selectedMetrics : baseMeta.selectedCandidateMetrics,
    },
  };
};

const runCpSatPilotSelection = (
  input: EngineV3Input,
  baseOutput: EngineOutput,
  baseMeta: Partial<BacktrackingMeta>,
): { output: EngineOutput; meta: Partial<BacktrackingMeta> & MainStageCpSatPilotMeta } => {
  const rawPilot = runMainStageCpSatPilot(input, baseOutput);
  const pilot = rawPilot.meta.cpSatPilotReason === "solver_unavailable"
    ? { ...rawPilot, meta: { ...rawPilot.meta, cpSatPilotAttempted: false, cpSatPilotReason: "missing_solver_runtime", cpSatSegmentsAttempted: 0 } }
    : rawPilot;
  const selectedScore = scoreCandidateSolution(input, pilot.output);
  const evaluated = Number(baseMeta.candidateSolutionsEvaluated ?? 1) + Number(pilot.meta.cpSatSegmentsAttempted ?? (pilot.meta.cpSatPilotAttempted ? 1 : 0));
  return {
    output: pilot.output,
    meta: {
      ...baseMeta,
      ...pilot.meta,
      candidateSolutionsEvaluated: evaluated,
      bestCandidateSource: pilot.meta.cpSatPilotAccepted ? "cp_sat_pilot" : baseMeta.bestCandidateSource,
      bestCandidateScore: summarizeCandidateScore(selectedScore),
      candidateSelectionReason: pilot.meta.cpSatPilotAccepted
        ? pilot.meta.cpSatPilotImprovementSummary
        : baseMeta.candidateSelectionReason,
      candidateComparisonSummary: pilot.meta.cpSatPilotImprovementSummary ?? baseMeta.candidateComparisonSummary,
      solutionSource: pilot.meta.cpSatPilotAccepted ? "cp_sat_pilot" : baseMeta.solutionSource,
      selectedCandidateMetrics: {
        coachSwitchCount: selectedScore.coachSwitchCount,
        coachSwitchPenalty: selectedScore.coachSwitchPenalty,
        maxCoachGapMinutes: selectedScore.maxCoachGapMinutes,
        coachIdlePenalty: selectedScore.coachIdlePenalty,
        coachSpanPenalty: selectedScore.coachSpanPenalty,
        coachSplitDayPenalty: selectedScore.coachSplitDayPenalty,
        talentIdlePenalty: selectedScore.talentIdlePenalty,
        talentSpanPenalty: selectedScore.talentSpanPenalty,
        maxGapPenalty: selectedScore.maxGapPenalty,
        bundleCoherencePenalty: selectedScore.bundleCoherencePenalty,
        bundleSwitchPenalty: selectedScore.bundleSwitchPenalty,
        partialBundleUsageWarnings: selectedScore.partialBundleUsageWarnings,
        bundleSpaceAffinityMatches: selectedScore.bundleSpaceAffinityMatches,
        bundleSpaceAffinityMismatches: selectedScore.bundleSpaceAffinityMismatches,
        restrictiveTalentAverageStartOffset: selectedScore.restrictiveTalentAverageStartOffset,
        mainStageGapMinutes: selectedScore.mainStageGapMinutes,
        mainStageGapCount: selectedScore.mainStageGapCount,
        makespan: selectedScore.makespan === Number.MAX_SAFE_INTEGER ? null : selectedScore.makespan,
        hardConstraintViolations: selectedScore.hardConstraintViolations,
      },
    },
  };
};

const computeMakespanMinutes = (output: EngineOutput): number | null => {
  const startsEnds = (output.plannedTasks ?? [])
    .map((p: any) => ({ start: toMinutes(String(p?.startPlanned ?? "")), end: toMinutes(String(p?.endPlanned ?? "")) }))
    .filter((p) => p.start !== null && p.end !== null && Number(p.end) > Number(p.start)) as Array<{ start: number; end: number }>;
  if (!startsEnds.length) return null;
  const minStart = Math.min(...startsEnds.map((p) => p.start));
  const maxEnd = Math.max(...startsEnds.map((p) => p.end));
  return Math.max(0, maxEnd - minStart);
};

export const withV3Meta = (output: EngineOutput, meta: NonNullable<EngineOutput["v3Meta"]>): EngineOutput => {
  const warningsTop = (output.warnings ?? []).slice(0, 5).map((warning: any) => String(warning?.code ?? "WARNING"));
  const blockerSummary = summarizeStructuredBlockers(output);
  return {
    ...output,
    v3Meta: {
      backtrackingAttempted: false,
      backtrackingAccepted: false,
      backtrackingAttempts: 0,
      backtrackingBranchesExplored: 0,
      backtrackingTimeMs: 0,
      neighborhoodSearchAttempted: false,
      neighborhoodCandidatesGenerated: 0,
      neighborhoodCandidateAccepted: false,
      neighborhoodSearchTimeMs: 0,
      pipelineBuilderAttempted: false,
      pipelineCandidatesGenerated: 0,
      pipelineAccepted: false,
      pipelineReason: "generator_not_invoked",
      pipelineRejectedReasons: [],
      pipelineBefore: {},
      pipelineAfter: {},
      pipelineMappedTalents: [],
      pipelineUnmappedTalents: [],
      pipelineMovedTasks: [],
      pipelineStableTasks: [],
      pipelineFeederOutcomes: [],
      ...meta,
      ...normalizeMealDiagnosticsMetadata(meta),
      ...normalizePipelineDiagnosticsMetadata(meta),
      plannedCount: Array.isArray(output.plannedTasks) ? output.plannedTasks.length : 0,
      unplannedCount: Array.isArray(output.unplanned) ? output.unplanned.length : 0,
      makespanMinutes: computeMakespanMinutes(output),
      warningsTop,
      ...blockerSummary,
    },
  };
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

    const breakKind = String((task as any)?.breakKind ?? "");
    const itinerantTeamId = Number((task as any)?.itinerantTeamId ?? NaN);

    // ✅ Los breaks no deben bloquear la planificación por falta de espacio/zona
    if (breakKind === "itinerant_meal" && Number.isFinite(itinerantTeamId) && itinerantTeamId > 0) {
      continue;
    }
    if (breakKind === "space_meal") {
      continue;
    }

    // ✅ Excepción: comida del concursante (template configurado en el plan)
    // (En EngineInput viene como mealTaskTemplateId/mealTaskTemplateName)
    const tplId = Number((task as any)?.templateId ?? NaN);
    const tplName = String((task as any)?.templateName ?? "");

    // mealTaskTemplateId puede ser null si no está resuelto
    const mealTplId = Number((input as any)?.mealTaskTemplateId ?? NaN);
    const mealTplName = String((input as any)?.mealTaskTemplateName ?? "").trim().toLowerCase();

    const isContestantMeal =
      (Number.isFinite(mealTplId) && mealTplId > 0 && Number.isFinite(tplId) && tplId === mealTplId) ||
      (mealTplName && tplName.trim().toLowerCase() === mealTplName);

    if (isContestantMeal) {
      continue; // no exigir space/zone para comida del concursante
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
    const trial = solve_v3_phaseA_attempt({
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

function generatePlanV3Unchecked(input: EngineV3Input, options?: EngineV3Options): EngineOutput {
  const initialMealDiagnostics = normalizeMealDiagnosticsMetadata({}, input);
  const finalize = (output: EngineOutput, meta: NonNullable<EngineOutput["v3Meta"]>) => withV3Meta(output, {
    ...initialMealDiagnostics,
    ...meta,
  });
  emitProgress(options, "hard_validation", 12, "Validando restricciones hard de entrada");

  const hardValidation = prevalidateHard(input);
  if (hardValidation) {
    return finalize(hardValidation, {
      prevalidationRun: true,
      prevalidationOk: false,
      phaseAUsed: false,
      phaseAFoundSolution: false,
      cpSatAttempted: false,
      cpSatFoundSolution: false,
      cpSatAccepted: false,
      cpSatReason: "prevalidation_failed",
      fallbackReason: "prevalidation_failed",
      solutionSource: "infeasible",
    });
  }

  const attemptsSummary: AttemptSummary[] = [];
  let best: EngineOutput | null = null;
  let bestPlanned = -1;
  let lastBacktrackingMeta: BacktrackingMeta | null = null;

  for (let level = 9; level >= 0; level--) {
    emitProgress(
      options,
      level === 9 ? "phase_a_base_solution" : "backtracking",
      18 + Math.round(((9 - level) / 9) * 24),
      `Buscando solución factible (nivel soft ${level})`,
      { candidatesEvaluated: 10 - level },
    );

    const t0 = Date.now();
    const greedyProbeForcedTaskStarts = (input as any)?.v3GreedyProbeForcedTaskStarts;
    const out = solve_v3_phaseA_attempt(
      cloneWithSoftLevel(input, level),
      greedyProbeForcedTaskStarts && typeof greedyProbeForcedTaskStarts === "object"
        ? { forcedTaskStarts: greedyProbeForcedTaskStarts, maxIterations: 8000 } as any
        : undefined,
    );
    const ms = Math.max(0, Date.now() - t0);
    const ok = Boolean(out.complete);
    attemptsSummary.push({ level, ok, ms, topReasons: summarizeTopReasons(out), reason: `soft_level_${level}` });

    const plannedCount = Array.isArray(out.plannedTasks) ? out.plannedTasks.length : 0;
    if (plannedCount > bestPlanned) {
      best = out;
      bestPlanned = plannedCount;
    }

    const backtrackingEnabled = options?.enableLimitedBacktracking !== false && (input as any)?.enableLimitedBacktracking !== false;
    const shouldTryBacktracking = backtrackingEnabled && ((!ok && ((out.unplanned?.length ?? 0) > 0 || out.hardFeasible === false || hasRestrictiveAvailability(input))) || (ok && hasComparativeSelectionRisk(input, out)));
    if (shouldTryBacktracking) {
      const backtracking = runLimitedBacktracking(input, out, level, options);
      lastBacktrackingMeta = backtracking.meta;
      attemptsSummary.push({
        level,
        ok: Boolean(backtracking.output.complete),
        ms: backtracking.meta.backtrackingTimeMs,
        topReasons: summarizeTopReasons(backtracking.output),
        reason: `limited_backtracking_${level}`,
      });
      const backtrackingPlanned = Array.isArray(backtracking.output.plannedTasks) ? backtracking.output.plannedTasks.length : 0;
      if (backtrackingPlanned > bestPlanned) {
        best = backtracking.output;
        bestPlanned = backtrackingPlanned;
      }
      if (backtracking.output.complete && backtracking.meta.backtrackingAccepted) {
        const out = backtracking.output;
        const backtrackingAcceptedMeta = backtracking.meta;

        let output: EngineOutput = {
          ...out,
          report: {
            repairsTried: attemptsSummary.length - 1,
            degradations: attemptsSummary.filter((a) => !a.ok).map((a) => `soft_${a.level}`),
            attemptsSummary: attemptsSummary.map((a) => ({ level: a.level, ok: a.ok, ms: a.ms, topReasons: a.topReasons, reason: a.reason })),
          },
        };
        emitProgress(options, "operational_neighborhoods", 48, "Evaluando vecindarios operativos");
        const neighborhoodSelection = runOperationalNeighborhoodSelection(input, output, "phaseA_backtracking");
        output = neighborhoodSelection.output;
        emitProgress(options, "segment_solver", 54, "Optimizando el segmento del coach con peor hueco");
        const segmentSelection = runSegmentSolverSelection(
          input,
          output,
          neighborhoodSelection.meta.solutionSource ?? "phaseA_backtracking",
          {
            ...backtrackingAcceptedMeta,
            ...neighborhoodSelection.meta,
            candidateSolutionsEvaluated: Math.max(
              Number(backtrackingAcceptedMeta.candidateSolutionsEvaluated ?? 1),
              Number(neighborhoodSelection.meta.candidateSolutionsEvaluated ?? 1),
            ),
          },
          options,
        );
        output = segmentSelection.output;
        emitProgress(options, "coach_compaction", 58, "Compactando jornadas y huecos de coaches");
        emitProgress(options, "coach_wave_ordering", 66, "Ordenando olas locales de coaches");
        emitProgress(options, "pipeline_builder", 72, "Generando candidatos de pipeline");
        const pipelineSelection = runPipelineBuilderSelection(
          input,
          output,
          segmentSelection.meta.solutionSource ?? "phaseA_backtracking",
          { ...backtrackingAcceptedMeta, ...segmentSelection.meta },
        );
        output = pipelineSelection.output;
        emitProgress(options, "pipeline_repair", 78, "Reparando conflictos de pipeline");
        emitProgress(options, "lane_only_repair", 84, "Buscando slack en carriles exclusivos", {
          candidatesGenerated: Number(pipelineSelection.meta.pipelineCandidatesGenerated ?? 0),
          currentBestReason: pipelineSelection.meta.pipelineReason,
        });
        emitProgress(options, "meal_scheduling", 87, "Programando comidas escalonadas dentro de su ventana");
        const mealSelection = runMealSchedulerSafely(input, output);
        output = mealSelection.output;
        const mealDiagnostics = {
          ...mealSelection.diagnostics,
          mealSchedulerPhase: pipelineSelection.meta.mealPrePipelineAttempted
            ? (pipelineSelection.meta.pipelineRepairAttempted ? "during_pipeline_repair" as const : "pre_pipeline" as const)
            : "post_pipeline" as const,
          mealPrePipelineAttempted: pipelineSelection.meta.mealPrePipelineAttempted ?? false,
          mealPrePipelineCandidatesGenerated: pipelineSelection.meta.mealPrePipelineCandidatesGenerated ?? 0,
          mealPrePipelineAccepted: pipelineSelection.meta.mealPrePipelineAccepted ?? false,
          mealPrePipelineReason: pipelineSelection.meta.mealPrePipelineReason ?? "not_attempted",
          mealPrePipelineRejectedReasons: pipelineSelection.meta.mealPrePipelineRejectedReasons ?? [],
        };
        const pilotSelection = runCpSatPilotSelection(input, output, { ...pipelineSelection.meta, ...mealDiagnostics });
        output = pilotSelection.output;
        const backtrackingNeighborhoodMeta = pilotSelection.meta;

        const timeLimitSeconds = Math.floor(Math.max(0, Number(options?.timeLimitMs ?? 0)) / 1000);
        if (timeLimitSeconds <= 0) {
          const insights = Array.isArray((output as any).insights) ? (output as any).insights : [];
          output = {
            ...output,
            insights: [
              ...insights,
              {
                code: "V3_PHASE_B_QUALITY",
                message: "CP-SAT omitido por presupuesto 0",
                details: { executed: false, accepted: false, budgetSeconds: 0 },
              },
            ],
          };
          output = finalize(output, {
            prevalidationRun: true,
            prevalidationOk: true,
            phaseAUsed: true,
            phaseAFoundSolution: true,
            cpSatAttempted: false,
            cpSatFoundSolution: false,
            cpSatAccepted: false,
            cpSatReason: "budget_0",
            ...backtrackingNeighborhoodMeta,
          });
        }
        if (timeLimitSeconds > 0) {
          emitProgress(options, "scoring_candidates", 88, `Comparando optimización final (hasta ${timeLimitSeconds}s)`);
          const optimized = optimizeWithCpSat(input, output, timeLimitSeconds);
          const candidateErrors = optimized.noOptimized ? [] : validateOptimizedCandidate(input, output, optimized.output);
          const accepted = !optimized.noOptimized && candidateErrors.length === 0 && validateHardConstraints(input, optimized.output).hardValidationPassed && compareCandidateSolutions(input, optimized.output, output) > 0;
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
          output = finalize(output, {
            prevalidationRun: true,
            prevalidationOk: true,
            phaseAUsed: true,
            phaseAFoundSolution: true,
            cpSatAttempted: true,
            cpSatFoundSolution: !optimized.noOptimized,
            cpSatAccepted: accepted,
            cpSatReason: optimized.noOptimized ? optimized.message : accepted ? "accepted" : "candidate_validation_failed",
            fallbackReason: accepted ? undefined : optimized.message,
            ...backtrackingNeighborhoodMeta,
            solutionSource: accepted ? "cp_sat" : backtrackingNeighborhoodMeta.solutionSource,
          });
        }

        emitProgress(options, "scoring_candidates", 94, "Plan completo encontrado; validando el candidato final");
        return finalize(output, output.v3Meta ?? {
          prevalidationRun: true,
          prevalidationOk: true,
          phaseAUsed: true,
          phaseAFoundSolution: true,
          cpSatAttempted: false,
          cpSatFoundSolution: false,
          cpSatAccepted: false,
          cpSatReason: "not_attempted",
          ...backtrackingNeighborhoodMeta,
        });
      }
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
      emitProgress(options, "operational_neighborhoods", 48, "Evaluando vecindarios operativos");
      const neighborhoodSelection = runOperationalNeighborhoodSelection(input, output, "phaseA_greedy");
      output = neighborhoodSelection.output;
      emitProgress(options, "segment_solver", 54, "Optimizando el segmento del coach con peor hueco");
      const segmentSelection = runSegmentSolverSelection(input, output, neighborhoodSelection.meta.solutionSource ?? "phaseA_greedy", neighborhoodSelection.meta, options);
      output = segmentSelection.output;
      emitProgress(options, "coach_compaction", 58, "Compactando jornadas y huecos de coaches");
      emitProgress(options, "coach_wave_ordering", 66, "Ordenando olas locales de coaches");
      emitProgress(options, "pipeline_builder", 72, "Generando candidatos de pipeline");
      const pipelineSelection = runPipelineBuilderSelection(
        input,
        output,
        segmentSelection.meta.solutionSource ?? "phaseA_greedy",
        segmentSelection.meta,
      );
      output = pipelineSelection.output;
      emitProgress(options, "pipeline_repair", 78, "Reparando conflictos de pipeline");
      emitProgress(options, "lane_only_repair", 84, "Buscando slack en carriles exclusivos", {
        candidatesGenerated: Number(pipelineSelection.meta.pipelineCandidatesGenerated ?? 0),
        currentBestReason: pipelineSelection.meta.pipelineReason,
      });
      emitProgress(options, "meal_scheduling", 87, "Programando comidas escalonadas dentro de su ventana");
      const mealSelection = runMealSchedulerSafely(input, output);
      output = mealSelection.output;
      const mealDiagnostics = {
        ...mealSelection.diagnostics,
        mealSchedulerPhase: pipelineSelection.meta.mealPrePipelineAttempted
          ? (pipelineSelection.meta.pipelineRepairAttempted ? "during_pipeline_repair" as const : "pre_pipeline" as const)
          : "post_pipeline" as const,
        mealPrePipelineAttempted: pipelineSelection.meta.mealPrePipelineAttempted ?? false,
        mealPrePipelineCandidatesGenerated: pipelineSelection.meta.mealPrePipelineCandidatesGenerated ?? 0,
        mealPrePipelineAccepted: pipelineSelection.meta.mealPrePipelineAccepted ?? false,
        mealPrePipelineReason: pipelineSelection.meta.mealPrePipelineReason ?? "not_attempted",
        mealPrePipelineRejectedReasons: pipelineSelection.meta.mealPrePipelineRejectedReasons ?? [],
      };
      const pilotSelection = runCpSatPilotSelection(input, output, { ...pipelineSelection.meta, ...mealDiagnostics });
      output = pilotSelection.output;
      const greedyNeighborhoodMeta = pilotSelection.meta;

      const timeLimitSeconds = Math.floor(Math.max(0, Number(options?.timeLimitMs ?? 0)) / 1000);
      if (timeLimitSeconds <= 0) {
        const insights = Array.isArray((output as any).insights) ? (output as any).insights : [];
        output = {
          ...output,
          insights: [
            ...insights,
            {
              code: "V3_PHASE_B_QUALITY",
              message: "CP-SAT omitido por presupuesto 0",
              details: { executed: false, accepted: false, budgetSeconds: 0 },
            },
          ],
        };
        output = finalize(output, {
          prevalidationRun: true,
          prevalidationOk: true,
          phaseAUsed: true,
          phaseAFoundSolution: true,
          cpSatAttempted: false,
          cpSatFoundSolution: false,
          cpSatAccepted: false,
          cpSatReason: "budget_0",
          ...greedyNeighborhoodMeta,
          solutionSource: greedyNeighborhoodMeta.solutionSource ?? "phaseA_greedy",
        });
      }
      if (timeLimitSeconds > 0) {
        emitProgress(options, "scoring_candidates", 88, `Comparando optimización final (hasta ${timeLimitSeconds}s)`);
        const optimized = optimizeWithCpSat(input, output, timeLimitSeconds);
        const candidateErrors = optimized.noOptimized ? [] : validateOptimizedCandidate(input, output, optimized.output);
        const accepted = !optimized.noOptimized && candidateErrors.length === 0 && validateHardConstraints(input, optimized.output).hardValidationPassed && compareCandidateSolutions(input, optimized.output, output) > 0;
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
        output = finalize(output, {
          prevalidationRun: true,
          prevalidationOk: true,
          phaseAUsed: true,
          phaseAFoundSolution: true,
          cpSatAttempted: true,
          cpSatFoundSolution: !optimized.noOptimized,
          cpSatAccepted: accepted,
          cpSatReason: optimized.noOptimized ? optimized.message : accepted ? "accepted" : "candidate_validation_failed",
          fallbackReason: accepted ? undefined : optimized.message,
          ...(lastBacktrackingMeta && !lastBacktrackingMeta.backtrackingAccepted && !lastBacktrackingMeta.greedyFailedBeforeBacktracking ? lastBacktrackingMeta : {}),
          ...greedyNeighborhoodMeta,
          solutionSource: accepted ? "cp_sat" : greedyNeighborhoodMeta.solutionSource ?? "phaseA_greedy",
        });
      }

      emitProgress(options, "scoring_candidates", 94, "Plan completo encontrado; validando el candidato final");
      return finalize(output, output.v3Meta ?? {
        prevalidationRun: true,
        prevalidationOk: true,
        phaseAUsed: true,
        phaseAFoundSolution: true,
        cpSatAttempted: false,
        cpSatFoundSolution: false,
        cpSatAccepted: false,
        cpSatReason: "not_attempted",
        ...greedyNeighborhoodMeta,
        solutionSource: greedyNeighborhoodMeta.solutionSource ?? "phaseA_greedy",
      });
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

  const timeLimitSeconds = Math.floor(Math.max(0, Number(options?.timeLimitMs ?? 0)) / 1000);
  if (timeLimitSeconds <= 0) {
    const insights = Array.isArray((fallback as any).insights) ? (fallback as any).insights : [];
    (fallback as any).insights = [
      ...insights,
      {
        code: "V3_PHASE_B_QUALITY",
        message: "CP-SAT omitido por presupuesto 0",
        details: { executed: false, accepted: false, budgetSeconds: 0 },
      },
    ];
    (fallback as any).v3Meta = {
      prevalidationRun: true,
      prevalidationOk: true,
      phaseAUsed: true,
      phaseAFoundSolution: false,
      cpSatAttempted: false,
      cpSatFoundSolution: false,
      cpSatAccepted: false,
      cpSatReason: "budget_0",
      fallbackReason: "phase_a_incomplete",
      ...(lastBacktrackingMeta ?? {
        backtrackingAttempted: false,
        backtrackingAccepted: false,
        backtrackingAttempts: 0,
        backtrackingBranchesExplored: 0,
        backtrackingTimeMs: 0,
        greedyFailedBeforeBacktracking: true,
      }),
      solutionSource: "fallback",
    };
  }
  if (timeLimitSeconds > 0) {
    emitProgress(options, "scoring_candidates", 88, `Intentando completar y comparar el plan (hasta ${timeLimitSeconds}s)`);
    const optimized = optimizeWithCpSat(input, fallback, timeLimitSeconds);
    const candidateErrors = optimized.noOptimized ? [] : validateOptimizedCandidate(input, fallback, optimized.output);
    const accepted = !optimized.noOptimized && candidateErrors.length === 0 && validateHardConstraints(input, optimized.output).hardValidationPassed && compareCandidateSolutions(input, optimized.output, fallback) > 0;
    const optimizedOutput = accepted ? optimized.output : fallback;
    const insights = Array.isArray((optimizedOutput as any).insights) ? (optimizedOutput as any).insights : [];
    const qualityInsight = {
      code: "V3_PHASE_B_QUALITY",
      message: optimized.noOptimized
        ? optimized.message
        : accepted
          ? optimized.message
          : "CP-SAT produjo candidato inválido para plan parcial; se conserva Fase A.",
      details: {
        ...optimized.quality,
        accepted,
        noOptimized: Boolean(optimized.noOptimized),
        candidateErrors,
        degradations: optimized.degradations,
        technical: optimized.technicalDetails,
      },
    };

    (fallback as any).v3Meta = {
      prevalidationRun: true,
      prevalidationOk: true,
      phaseAUsed: true,
      phaseAFoundSolution: false,
      cpSatAttempted: true,
      cpSatFoundSolution: !optimized.noOptimized,
      cpSatAccepted: accepted && Boolean(optimized.output.complete),
      cpSatReason: optimized.noOptimized ? optimized.message : accepted ? "accepted_but_incomplete" : "candidate_validation_failed",
      fallbackReason: optimized.noOptimized ? optimized.message : accepted ? "cp_sat_incomplete" : "candidate_validation_failed",
      ...(lastBacktrackingMeta ?? {
        backtrackingAttempted: false,
        backtrackingAccepted: false,
        backtrackingAttempts: 0,
        backtrackingBranchesExplored: 0,
        backtrackingTimeMs: 0,
        greedyFailedBeforeBacktracking: true,
      }),
      solutionSource: accepted && optimized.output.complete ? "cp_sat" : "fallback",
    };

    if (accepted && optimized.output.complete) {
      return finalize({
        ...optimized.output,
        insights: [...insights, qualityInsight],
        report: {
          repairsTried: attemptsSummary.length,
          degradations: [
            ...attemptsSummary.map((a) => `soft_${a.level}`),
            ...optimized.degradations.map((d: any) => `near_hard:${d.rule}:${d.taskId}`),
          ],
          attemptsSummary: attemptsSummary.map((a) => ({ level: a.level, ok: a.ok, ms: a.ms, topReasons: a.topReasons, reason: a.reason })),
        },
      }, {
        prevalidationRun: true,
        prevalidationOk: true,
        phaseAUsed: true,
        phaseAFoundSolution: false,
        cpSatAttempted: true,
        cpSatFoundSolution: true,
        cpSatAccepted: true,
        cpSatReason: "accepted_partial_completion",
        ...(lastBacktrackingMeta ?? {}),
        solutionSource: "cp_sat",
      });
    }
  }

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

  emitProgress(options, "scoring_candidates", 94, "No se encontró un plan completo; preparando diagnóstico");

  return finalize({
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
  }, {
    ...((fallback as any).v3Meta ?? {}),
    prevalidationRun: true,
    prevalidationOk: true,
    phaseAUsed: true,
    phaseAFoundSolution: false,
    fallbackReason: rescue.canOvertime ? "needs_user_approval_overtime" : "phase_a_incomplete",
    ...(lastBacktrackingMeta ?? {
      backtrackingAttempted: false,
      backtrackingAccepted: false,
      backtrackingAttempts: 0,
      backtrackingBranchesExplored: 0,
      backtrackingTimeMs: 0,
      greedyFailedBeforeBacktracking: true,
    }),
    solutionSource: rescue.canOvertime ? "fallback" : "infeasible",
  });
}


/** Public V3 entry point: every orchestration path passes through the same final hard gate. */
export function generatePlanV3(input: EngineV3Input, options?: EngineV3Options): EngineOutput {
  return applyFinalHardValidationGate(input, generatePlanV3Unchecked(input, options));
}
