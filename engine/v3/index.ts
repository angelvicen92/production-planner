import type { EngineOutput, EngineOutputUnplanned } from "../types";
import { solve_v3_phaseA_attempt } from "./phaseAHeuristic";
import type { EngineV3Input, EngineV3Options } from "./types";
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
  generateOperationalNeighborhoodCandidates,
  shouldAttemptOperationalNeighborhoods,
  type OperationalNeighborhoodReason,
} from "./operationalNeighborhoods";

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



type BacktrackingMeta = {
  backtrackingAttempted: boolean;
  backtrackingAccepted: boolean;
  backtrackingAttempts: number;
  backtrackingBranchesExplored: number;
  backtrackingTimeMs: number;
  backtrackingFallbackReason?: string;
  greedyFailedBeforeBacktracking: boolean;
  solutionSource?: "phaseA_greedy" | "phaseA_backtracking" | "operational_neighborhood" | "cp_sat" | "fallback" | "infeasible";
  candidateSolutionsEvaluated?: number;
  bestCandidateSource?: "phaseA_greedy" | "phaseA_backtracking" | "operational_neighborhood" | "cp_sat" | "fallback" | "infeasible";
  bestCandidateScore?: string;
  greedyCandidateScore?: string;
  backtrackingBestScore?: string;
  candidateSelectionReason?: string;
  candidateComparisonSummary?: string;
  selectedCandidateMetrics?: NonNullable<EngineOutput["v3Meta"]>["selectedCandidateMetrics"];
  neighborhoodSearchAttempted?: boolean;
  neighborhoodCandidatesGenerated?: number;
  neighborhoodCandidateAccepted?: boolean;
  neighborhoodAcceptedReason?: string;
  neighborhoodSearchTimeMs?: number;
  neighborhoodTypesAttempted?: string[];
  neighborhoodTypesGenerated?: string[];
  neighborhoodRejectedReasons?: Record<string, number>;
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


const runOperationalNeighborhoodSelection = (
  input: EngineV3Input,
  baseOutput: EngineOutput,
  baseSource: "phaseA_greedy" | "phaseA_backtracking",
): { output: EngineOutput; meta: Partial<BacktrackingMeta> } => {
  const started = Date.now();
  const attempted = shouldAttemptOperationalNeighborhoods(input, baseOutput);
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
      },
    };
  }

  const neighborhoodDiagnostics = { attemptedTypes: [] as OperationalNeighborhoodReason[], generatedTypes: [] as OperationalNeighborhoodReason[], rejectedReasons: {} as Record<string, number> };
  const candidates = generateOperationalNeighborhoodCandidates(input, baseOutput, { diagnostics: neighborhoodDiagnostics });
  let bestOutput = baseOutput;
  let bestReason: OperationalNeighborhoodReason | null = null;
  let bestScore = baseScore;
  for (const candidate of candidates) {
    const candidateScore = scoreCandidateSolution(input, candidate.output);
    if (compareCandidateSolutions(input, candidate.output, bestOutput) > 0) {
      bestOutput = candidate.output;
      bestReason = candidate.reason;
      bestScore = candidateScore;
    }
  }

  const accepted = bestOutput !== baseOutput;
  const comparison = accepted
    ? explainCandidateComparison("operational_neighborhood", baseSource, bestScore, baseScore)
    : (candidates.length
      ? explainCandidateComparison(baseSource, "operational_neighborhood", baseScore, candidates.map((candidate) => scoreCandidateSolution(input, candidate.output)).sort((a, b) => compareCandidateScores(b, a))[0])
      : "no operational neighborhood candidate generated");

  return {
    output: bestOutput,
    meta: {
      neighborhoodSearchAttempted: true,
      neighborhoodCandidatesGenerated: candidates.length,
      neighborhoodCandidateAccepted: accepted,
      neighborhoodAcceptedReason: accepted ? bestReason ?? comparison : undefined,
      neighborhoodSearchTimeMs: Math.max(0, Date.now() - started),
      neighborhoodTypesAttempted: neighborhoodDiagnostics.attemptedTypes,
      neighborhoodTypesGenerated: neighborhoodDiagnostics.generatedTypes,
      neighborhoodRejectedReasons: neighborhoodDiagnostics.rejectedReasons,
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
        restrictiveTalentAverageStartOffset: bestScore.restrictiveTalentAverageStartOffset,
        mainStageGapMinutes: bestScore.mainStageGapMinutes,
        mainStageGapCount: bestScore.mainStageGapCount,
        makespan: bestScore.makespan === Number.MAX_SAFE_INTEGER ? null : bestScore.makespan,
        hardConstraintViolations: bestScore.hardConstraintViolations,
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

const withV3Meta = (output: EngineOutput, meta: NonNullable<EngineOutput["v3Meta"]>): EngineOutput => {
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
      ...meta,
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

export function generatePlanV3(input: EngineV3Input, options?: EngineV3Options): EngineOutput {
  options?.onProgress?.({ phase: "prevalidation", progressPct: 5, message: "V3 Fase A: prevalidación de hard constraints" });

  const hardValidation = prevalidateHard(input);
  if (hardValidation) {
    return withV3Meta(hardValidation, {
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
    options?.onProgress?.({
      phase: "solving_feasible",
      progressPct: 10 + Math.round(((9 - level) / 9) * 70),
      message: `V3 Fase A: intento factible (soft level=${level}`,
    });

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
        const neighborhoodSelection = runOperationalNeighborhoodSelection(input, output, "phaseA_backtracking");
        output = neighborhoodSelection.output;
        const backtrackingNeighborhoodMeta = { ...backtrackingAcceptedMeta, ...neighborhoodSelection.meta };

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
          output = withV3Meta(output, {
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
          output = withV3Meta(output, {
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

        options?.onProgress?.({ phase: "optimizing", progressPct: 92, message: "V3: plan completo encontrado (Fase A/backtracking/B)" });
        return withV3Meta(output, output.v3Meta ?? {
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
      const neighborhoodSelection = runOperationalNeighborhoodSelection(input, output, "phaseA_greedy");
      output = neighborhoodSelection.output;
      const greedyNeighborhoodMeta = neighborhoodSelection.meta;

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
        output = withV3Meta(output, {
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
        output = withV3Meta(output, {
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

      options?.onProgress?.({ phase: "optimizing", progressPct: 92, message: "V3: plan completo encontrado (Fase A/B)" });
      return withV3Meta(output, output.v3Meta ?? {
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
    options?.onProgress?.({ phase: "optimizing", progressPct: 90, message: `V3 Fase B (CP-SAT): intentando completar plan parcial hasta ${timeLimitSeconds}s` });
    const optimized = optimizeWithCpSat(input, fallback, timeLimitSeconds);
    const candidateErrors = optimized.noOptimized ? [] : validateOptimizedCandidate(input, fallback, optimized.output);
    const accepted = !optimized.noOptimized && candidateErrors.length === 0;
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
      return withV3Meta({
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

  options?.onProgress?.({ phase: "optimizing", progressPct: 92, message: "V3 Fase A: sin plan completo, devolviendo diagnóstico" });

  return withV3Meta({
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
