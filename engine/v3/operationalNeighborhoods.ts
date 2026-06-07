import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import {
  calculateMainStageGaps,
  calculateOperationalMetrics,
  countExecutedTaskMoved,
  countHardConstraintViolations,
  countLockedTaskMoved,
  getPlannedViews,
  toMinutes,
} from "./metrics";
import { getCoachResourceIds, getDependencyIds } from "./operationalPriority";
import { compareCandidateSolutions } from "./solutionScoring";
import { calculateEngineOperationalCompactionMetrics } from "./operationalQuality";

export type OperationalNeighborhoodReason =
  | "main_stage_gap_fill"
  | "feeder_advance"
  | "coach_block_compaction"
  | "restrictive_talent_bundle"
  | "advance_restrictive_talent"
  | "coach_gap_compaction"
  | "talent_day_compaction"
  | "late_block_pull_forward"
  | "early_block_push_later";

export interface OperationalNeighborhoodCandidate {
  output: EngineOutput;
  reason: OperationalNeighborhoodReason;
  depth?: 1 | 2;
  chain?: OperationalNeighborhoodReason[];
}

export interface OperationalNeighborhoodDiagnostics {
  attemptedTypes: OperationalNeighborhoodReason[];
  generatedTypes: OperationalNeighborhoodReason[];
  rejectedReasons: Record<string, number>;
}

export interface OperationalNeighborhoodOptions {
  maxCandidates?: number;
  maxAttemptsPerNeighborhood?: number;
  allowedReasons?: OperationalNeighborhoodReason[];
  diagnostics?: OperationalNeighborhoodDiagnostics;
}

export interface OperationalNeighborhoodSearchResult {
  candidates: OperationalNeighborhoodCandidate[];
  depth1Candidates: number;
  depth2Candidates: number;
  chainsEvaluated: number;
  diagnostics: OperationalNeighborhoodDiagnostics;
}

const DEFAULT_MAX_CANDIDATES = 30;
const DEFAULT_MAX_ATTEMPTS_PER_NEIGHBORHOOD = 10;
const MAX_SMALL_GAP_MINUTES = 30;
const MAX_DEPTH_1_CANDIDATES = 10;
const MAX_DEPTH_2_PER_CANDIDATE = 5;
const MAX_TOTAL_EVALUATED = 30;
const MAX_TOTAL_SEARCH_CANDIDATES = MAX_TOTAL_EVALUATED - 1; // reserva una evaluación para el greedy base

const ALLOWED_DEPTH_2_CHAINS = new Map<OperationalNeighborhoodReason, OperationalNeighborhoodReason[]>([
  ["feeder_advance", ["main_stage_gap_fill", "coach_block_compaction"]],
  ["restrictive_talent_bundle", ["feeder_advance"]],
  ["coach_block_compaction", ["main_stage_gap_fill"]],
  ["coach_gap_compaction", ["late_block_pull_forward"]],
  ["talent_day_compaction", ["late_block_pull_forward", "early_block_push_later"]],
]);

const toHHMM = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const durationOf = (planned: { startPlanned: string; endPlanned: string }): number | null => {
  const start = toMinutes(planned.startPlanned);
  const end = toMinutes(planned.endPlanned);
  if (start === null || end === null || end <= start) return null;
  return end - start;
};

const fixedTaskIds = (input: EngineV3Input): Set<number> => {
  const ids = new Set<number>();
  for (const task of input.tasks ?? []) {
    const id = Number((task as any).id ?? NaN);
    const status = String((task as any).status ?? "pending");
    if (Number.isFinite(id) && (status === "done" || status === "in_progress" || Boolean((task as any).isManualBlock))) ids.add(id);
  }
  for (const lock of input.locks ?? []) {
    const lockType = String((lock as any).lockType ?? "").toLowerCase();
    const id = Number((lock as any).taskId ?? NaN);
    if (Number.isFinite(id) && (lockType === "time" || lockType === "full")) ids.add(id);
  }
  return ids;
};

const cloneWithMoves = (output: EngineOutput, moves: Map<number, number>): EngineOutput | null => {
  if (!moves.size || moves.size > 3) return null;
  let moved = 0;
  const plannedTasks = (output.plannedTasks ?? []).map((planned) => {
    const start = moves.get(Number(planned.taskId));
    if (start === undefined) return { ...planned };
    const duration = durationOf(planned);
    if (duration === null) return { ...planned };
    moved += 1;
    return { ...planned, startPlanned: toHHMM(start), endPlanned: toHHMM(start + duration) };
  });
  return moved === moves.size ? { ...output, plannedTasks } : null;
};

const cloneWithSwappedTimes = (output: EngineOutput, leftTaskId: number, rightTaskId: number): EngineOutput | null => {
  const left = (output.plannedTasks ?? []).find((planned) => Number(planned.taskId) === leftTaskId);
  const right = (output.plannedTasks ?? []).find((planned) => Number(planned.taskId) === rightTaskId);
  if (!left || !right) return null;
  const leftDuration = durationOf(left);
  const rightDuration = durationOf(right);
  const leftStart = toMinutes(left.startPlanned);
  const rightStart = toMinutes(right.startPlanned);
  if (leftDuration === null || rightDuration === null || leftStart === null || rightStart === null || leftDuration !== rightDuration) return null;
  return cloneWithMoves(output, new Map([[leftTaskId, rightStart], [rightTaskId, leftStart]]));
};

const mainGapMinutes = (input: EngineV3Input, output: EngineOutput): number => calculateMainStageGaps(input, output)?.minutes ?? 0;

const candidateSafetyReason = (input: EngineV3Input, baseOutput: EngineOutput, candidate: EngineOutput): string | null => {
  const selectedMetrics = candidate.v3Meta?.selectedCandidateMetrics;
  if (selectedMetrics) {
    const actual = calculateOperationalMetrics(input, candidate);
    const consistent = selectedMetrics.coachSwitchCount === actual.coachSwitchCount
      && selectedMetrics.coachSwitchPenalty === actual.coachSwitchPenalty
      && selectedMetrics.restrictiveTalentAverageStartOffset === actual.restrictiveTalentAverageStartOffset
      && selectedMetrics.mainStageGapMinutes === actual.mainStageGapMinutes
      && selectedMetrics.mainStageGapCount === actual.mainStageGapCount
      && selectedMetrics.makespan === actual.makespan
      && selectedMetrics.hardConstraintViolations === actual.hardConstraintViolations;
    if (!consistent) return "selected_candidate_metrics_inconsistent";
  }
  if (countHardConstraintViolations(input, candidate) > countHardConstraintViolations(input, baseOutput)) return "hard_constraint_violation";
  if (countLockedTaskMoved(input, candidate) > countLockedTaskMoved(input, baseOutput)) return "locked_task_moved";
  if (countExecutedTaskMoved(input, candidate) > countExecutedTaskMoved(input, baseOutput)) return "executed_task_moved";
  if (mainGapMinutes(input, candidate) > mainGapMinutes(input, baseOutput)) return "main_stage_gap_increased";
  return null;
};

const candidateSignature = (output: EngineOutput): string => (output.plannedTasks ?? [])
  .map((planned) => `${Number(planned.taskId)}@${planned.startPlanned}-${planned.endPlanned}`)
  .sort()
  .join("|");

const isRestrictiveTask = (input: EngineV3Input, task: any): boolean => {
  const dayStart = toMinutes(input.workDay?.start);
  const dayEnd = toMinutes(input.workDay?.end);
  const contestantId = Number(task?.contestantId ?? NaN);
  const window = Number.isFinite(contestantId) ? input.contestantAvailabilityById?.[contestantId] : null;
  const windowStart = toMinutes(window?.start);
  const windowEnd = toMinutes(window?.end);
  if (dayStart === null || dayEnd === null || windowStart === null || windowEnd === null) return false;
  return windowStart > dayStart || windowEnd < dayEnd;
};

const incrementRejected = (diagnostics: OperationalNeighborhoodDiagnostics, reason: string): void => {
  diagnostics.rejectedReasons[reason] = (diagnostics.rejectedReasons[reason] ?? 0) + 1;
};

const appendIfSafe = (
  input: EngineV3Input,
  baseOutput: EngineOutput,
  candidate: EngineOutput | null,
  reason: OperationalNeighborhoodReason,
  results: OperationalNeighborhoodCandidate[],
  seen: Set<string>,
  maxCandidates: number,
  diagnostics: OperationalNeighborhoodDiagnostics,
): boolean => {
  if (!candidate || results.length >= maxCandidates) {
    if (!candidate) incrementRejected(diagnostics, "invalid_move");
    return false;
  }
  const unsafeReason = candidateSafetyReason(input, baseOutput, candidate);
  if (unsafeReason) {
    incrementRejected(diagnostics, unsafeReason);
    return false;
  }
  const signature = candidateSignature(candidate);
  if (seen.has(signature)) {
    incrementRejected(diagnostics, "duplicate_candidate");
    return false;
  }
  seen.add(signature);
  results.push({ output: candidate, reason, depth: 1, chain: [reason] });
  if (!diagnostics.generatedTypes.includes(reason)) diagnostics.generatedTypes.push(reason);
  return true;
};

const candidateAnchors = (input: EngineV3Input, output: EngineOutput, before: number): number[] => {
  const dayStart = toMinutes(input.workDay?.start);
  const anchors = new Set<number>();
  if (dayStart !== null && dayStart < before) anchors.add(dayStart);
  for (const planned of output.plannedTasks ?? []) {
    const end = toMinutes(planned.endPlanned);
    if (end !== null && end < before) anchors.add(end);
  }
  return [...anchors].sort((a, b) => a - b);
};

const mainTaskIds = (input: EngineV3Input): Set<number> => {
  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  return new Set((input.tasks ?? [])
    .filter((task: any) => Number(task.zoneId ?? NaN) === mainZoneId)
    .map((task: any) => Number(task.id)));
};

const feederTaskIds = (input: EngineV3Input): Set<number> => {
  const mainIds = mainTaskIds(input);
  const feeders = new Set<number>();
  for (const task of input.tasks ?? []) {
    if (!mainIds.has(Number((task as any).id))) continue;
    for (const dependencyId of getDependencyIds(task)) feeders.add(dependencyId);
  }
  return feeders;
};

const generateMainStageGapFillCandidates = (
  input: EngineV3Input, output: EngineOutput, maxAttempts: number, maxCandidates: number,
  results: OperationalNeighborhoodCandidate[], seen: Set<string>, diagnostics: OperationalNeighborhoodDiagnostics,
): void => {
  const reason: OperationalNeighborhoodReason = "main_stage_gap_fill";
  diagnostics.attemptedTypes.push(reason);
  const fixed = fixedTaskIds(input);
  const mainIds = mainTaskIds(input);
  const rows = (output.plannedTasks ?? [])
    .filter((planned) => mainIds.has(Number(planned.taskId)))
    .map((planned) => ({ planned, taskId: Number(planned.taskId), start: toMinutes(planned.startPlanned) ?? 0, end: toMinutes(planned.endPlanned) ?? 0 }))
    .sort((a, b) => a.start - b.start || a.taskId - b.taskId);
  let attempts = 0;
  for (let i = 1; i < rows.length && attempts < maxAttempts && results.length < maxCandidates; i++) {
    const gapStart = rows[i - 1].end;
    const gapEnd = rows[i].start;
    const gap = gapEnd - gapStart;
    if (gap <= 0 || gap > MAX_SMALL_GAP_MINUTES) continue;
    for (let j = i; j < rows.length && attempts < maxAttempts && results.length < maxCandidates; j++) {
      const row = rows[j];
      const duration = durationOf(row.planned);
      if (fixed.has(row.taskId) || duration === null) continue;
      attempts += 1;
      appendIfSafe(input, output, cloneWithMoves(output, new Map([[row.taskId, gapStart]])), reason, results, seen, maxCandidates, diagnostics);
    }
  }
};

const generateFeederAdvanceCandidates = (
  input: EngineV3Input, output: EngineOutput, maxAttempts: number, maxCandidates: number,
  results: OperationalNeighborhoodCandidate[], seen: Set<string>, diagnostics: OperationalNeighborhoodDiagnostics,
): void => {
  const reason: OperationalNeighborhoodReason = "feeder_advance";
  diagnostics.attemptedTypes.push(reason);
  const fixed = fixedTaskIds(input);
  const feeders = feederTaskIds(input);
  const views = getPlannedViews(input, output)
    .filter((view) => feeders.has(view.taskId) && !fixed.has(view.taskId))
    .map((view) => ({ ...view, start: toMinutes(view.startPlanned) ?? 0 }))
    .sort((a, b) => Number(isRestrictiveTask(input, b.task)) - Number(isRestrictiveTask(input, a.task)) || b.start - a.start || a.taskId - b.taskId);
  let attempts = 0;
  const chronological = [...views].sort((a, b) => a.start - b.start || a.taskId - b.taskId);
  for (let laterIndex = chronological.length - 1; laterIndex > 0 && attempts < maxAttempts; laterIndex--) {
    const later = chronological[laterIndex];
    for (let earlierIndex = 0; earlierIndex < laterIndex && attempts < maxAttempts; earlierIndex++) {
      const earlier = chronological[earlierIndex];
      if (Number(earlier.task.spaceId ?? NaN) !== Number(later.task.spaceId ?? NaN)) continue;
      const earlierPlanned = (output.plannedTasks ?? []).find((planned) => Number(planned.taskId) === earlier.taskId);
      const laterPlanned = (output.plannedTasks ?? []).find((planned) => Number(planned.taskId) === later.taskId);
      if (!earlierPlanned || !laterPlanned || durationOf(earlierPlanned) !== durationOf(laterPlanned)) continue;
      attempts += 1;
      appendIfSafe(input, output, cloneWithSwappedTimes(output, earlier.taskId, later.taskId), reason, results, seen, maxCandidates, diagnostics);
      if (results.length >= maxCandidates) return;
    }
  }
  for (const view of views) {
    for (const anchor of candidateAnchors(input, output, view.start)) {
      if (attempts >= maxAttempts || results.length >= maxCandidates) return;
      attempts += 1;
      appendIfSafe(input, output, cloneWithMoves(output, new Map([[view.taskId, anchor]])), reason, results, seen, maxCandidates, diagnostics);
    }
  }
};

const generateAdvanceRestrictiveTalentCandidates = (
  input: EngineV3Input, output: EngineOutput, maxAttempts: number, maxCandidates: number,
  results: OperationalNeighborhoodCandidate[], seen: Set<string>, diagnostics: OperationalNeighborhoodDiagnostics,
): void => {
  const reason: OperationalNeighborhoodReason = "advance_restrictive_talent";
  diagnostics.attemptedTypes.push(reason);
  const fixed = fixedTaskIds(input);
  const mainIds = mainTaskIds(input);
  const views = getPlannedViews(input, output)
    .filter((view) => isRestrictiveTask(input, view.task) && !fixed.has(view.taskId))
    .map((view) => ({ ...view, start: toMinutes(view.startPlanned) ?? 0 }))
    .sort((a, b) => b.start - a.start || a.taskId - b.taskId);
  let attempts = 0;
  for (const view of views) {
    for (const anchor of candidateAnchors(input, output, view.start)) {
      if (attempts >= maxAttempts || results.length >= maxCandidates) return;
      attempts += 1;
      const candidate = cloneWithMoves(output, new Map([[view.taskId, anchor]]));
      const effectiveReason = candidate && mainIds.has(view.taskId) && mainGapMinutes(input, candidate) < mainGapMinutes(input, output)
        ? "main_stage_gap_fill"
        : reason;
      appendIfSafe(input, output, candidate, effectiveReason, results, seen, maxCandidates, diagnostics);
    }
  }
};

const generateCoachBlockCompactionCandidates = (
  input: EngineV3Input, output: EngineOutput, maxAttempts: number, maxCandidates: number,
  results: OperationalNeighborhoodCandidate[], seen: Set<string>, diagnostics: OperationalNeighborhoodDiagnostics,
): void => {
  const reason: OperationalNeighborhoodReason = "coach_block_compaction";
  diagnostics.attemptedTypes.push(reason);
  const fixed = fixedTaskIds(input);
  const coachIds = getCoachResourceIds(input);
  if (!coachIds.size) return;
  const rows = getPlannedViews(input, output)
    .map((view) => ({ ...view, start: toMinutes(view.startPlanned) ?? 0, coachKey: view.assignedResources.filter((id) => coachIds.has(Number(id))).sort((a, b) => a - b).join(",") }))
    .filter((row) => row.coachKey)
    .sort((a, b) => a.start - b.start || a.taskId - b.taskId);
  let attempts = 0;
  for (let i = 0; i + 2 < rows.length && attempts < maxAttempts && results.length < maxCandidates; i++) {
    const [a, b, c] = [rows[i], rows[i + 1], rows[i + 2]];
    if (a.coachKey !== c.coachKey || a.coachKey === b.coachKey || fixed.has(b.taskId) || fixed.has(c.taskId)) continue;
    attempts += 1;
    appendIfSafe(input, output, cloneWithSwappedTimes(output, b.taskId, c.taskId), reason, results, seen, maxCandidates, diagnostics);
  }
};

const generateRestrictiveTalentBundleCandidates = (
  input: EngineV3Input, output: EngineOutput, maxAttempts: number, maxCandidates: number,
  results: OperationalNeighborhoodCandidate[], seen: Set<string>, diagnostics: OperationalNeighborhoodDiagnostics,
): void => {
  const reason: OperationalNeighborhoodReason = "restrictive_talent_bundle";
  diagnostics.attemptedTypes.push(reason);
  const fixed = fixedTaskIds(input);
  const feeders = feederTaskIds(input);
  const grouped = new Map<number, ReturnType<typeof getPlannedViews>>();
  for (const view of getPlannedViews(input, output)) {
    const contestantId = Number(view.task.contestantId ?? NaN);
    if (!Number.isFinite(contestantId) || fixed.has(view.taskId) || !feeders.has(view.taskId) || !isRestrictiveTask(input, view.task)) continue;
    grouped.set(contestantId, [...(grouped.get(contestantId) ?? []), view]);
  }
  let attempts = 0;
  for (const contestantId of [...grouped.keys()].sort((a, b) => a - b)) {
    const chain = (grouped.get(contestantId) ?? [])
      .sort((a, b) => (toMinutes(a.startPlanned) ?? 0) - (toMinutes(b.startPlanned) ?? 0) || a.taskId - b.taskId)
      .slice(0, 3);
    if (chain.length < 2) continue;
    const firstStart = toMinutes(chain[0].startPlanned);
    if (firstStart === null) continue;
    for (const anchor of candidateAnchors(input, output, firstStart)) {
      if (attempts >= maxAttempts || results.length >= maxCandidates) return;
      const delta = firstStart - anchor;
      const moves = new Map<number, number>();
      for (const view of chain) {
        const start = toMinutes(view.startPlanned);
        if (start !== null) moves.set(view.taskId, start - delta);
      }
      attempts += 1;
      appendIfSafe(input, output, cloneWithMoves(output, moves), reason, results, seen, maxCandidates, diagnostics);
    }
  }
};


const improvesOperationalCompaction = (input: EngineV3Input, base: EngineOutput, candidate: EngineOutput): boolean => {
  const before = calculateEngineOperationalCompactionMetrics(input, base);
  const after = calculateEngineOperationalCompactionMetrics(input, candidate);
  return after.coachIdlePenalty < before.coachIdlePenalty
    || after.coachSpanPenalty < before.coachSpanPenalty
    || after.coachSplitDayPenalty < before.coachSplitDayPenalty
    || after.talentIdlePenalty < before.talentIdlePenalty
    || after.talentSpanPenalty < before.talentSpanPenalty
    || after.maxGapPenalty < before.maxGapPenalty;
};

type CompactionRow = { taskId: number; start: number; end: number };

const compactionGroups = (input: EngineV3Input, output: EngineOutput, kind: "coach" | "talent"): CompactionRow[][] => {
  const coachIds = getCoachResourceIds(input);
  const grouped = new Map<number, CompactionRow[]>();
  for (const view of getPlannedViews(input, output)) {
    const start = toMinutes(view.startPlanned);
    const end = toMinutes(view.endPlanned);
    if (start === null || end === null || end <= start) continue;
    const ids = kind === "coach"
      ? view.assignedResources.filter((id) => coachIds.has(Number(id))).map(Number)
      : [Number(view.task.contestantId ?? NaN)].filter((id) => Number.isFinite(id) && id > 0);
    for (const id of ids) {
      const bucket = grouped.get(id) ?? [];
      bucket.push({ taskId: view.taskId, start, end });
      grouped.set(id, bucket);
    }
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, rows]) => rows.sort((a, b) => a.start - b.start || a.taskId - b.taskId));
};

const generatePersonCompactionCandidates = (
  input: EngineV3Input, output: EngineOutput, maxAttempts: number, maxCandidates: number,
  results: OperationalNeighborhoodCandidate[], seen: Set<string>, diagnostics: OperationalNeighborhoodDiagnostics,
  kind: "coach" | "talent", move: "pull" | "push", reason: OperationalNeighborhoodReason, minimumGap: number,
): void => {
  if (!diagnostics.attemptedTypes.includes(reason)) diagnostics.attemptedTypes.push(reason);
  const fixed = fixedTaskIds(input);
  let attempts = 0;
  for (const rows of compactionGroups(input, output, kind)) {
    for (let index = 1; index < rows.length && attempts < maxAttempts && results.length < maxCandidates; index++) {
      const previous = rows[index - 1];
      const next = rows[index];
      if (next.start - previous.end < minimumGap) continue;
      const moving = move === "pull" ? next : previous;
      if (fixed.has(moving.taskId)) continue;
      const target = move === "pull" ? previous.end : next.start - (moving.end - moving.start);
      if (target === moving.start || target < 0) continue;
      attempts += 1;
      const moves = new Map<number, number>([[moving.taskId, target]]);
      if (move === "pull") {
        const shift = target - moving.start;
        let blockEnd = moving.end;
        for (let followerIndex = index + 1; followerIndex < rows.length && moves.size < 3; followerIndex++) {
          const follower = rows[followerIndex];
          if (follower.start - blockEnd >= 45 || fixed.has(follower.taskId)) break;
          moves.set(follower.taskId, follower.start + shift);
          blockEnd = Math.max(blockEnd, follower.end);
        }
      }
      const candidate = cloneWithMoves(output, moves);
      if (!candidate || !improvesOperationalCompaction(input, output, candidate)) {
        incrementRejected(diagnostics, "no_operational_compaction_improvement");
        continue;
      }
      appendIfSafe(input, output, candidate, reason, results, seen, maxCandidates, diagnostics);
    }
  }
};

export const shouldAttemptOperationalNeighborhoods = (input: EngineV3Input, output: EngineOutput): boolean => {
  if ((input as any)?.enableOperationalNeighborhoods === false || !output.complete || countHardConstraintViolations(input, output) > 0) return false;
  const views = getPlannedViews(input, output);
  if (views.some((view) => isRestrictiveTask(input, view.task))) return true;
  if ((calculateMainStageGaps(input, output)?.count ?? 0) > 0) return true;
  const compaction = calculateEngineOperationalCompactionMetrics(input, output);
  if (compaction.needsCompaction) return true;
  const coachIds = getCoachResourceIds(input);
  if (views.filter((view) => view.assignedResources.some((id) => coachIds.has(Number(id)))).length >= 3) return true;
  return feederTaskIds(input).size > 0;
};

export const generateOperationalNeighborhoodCandidates = (
  input: EngineV3Input,
  output: EngineOutput,
  options: OperationalNeighborhoodOptions = {},
): OperationalNeighborhoodCandidate[] => {
  const diagnostics = options.diagnostics ?? { attemptedTypes: [], generatedTypes: [], rejectedReasons: {} };
  if (!output.complete || countHardConstraintViolations(input, output) > 0) return [];
  const maxCandidates = Math.max(0, Math.min(DEFAULT_MAX_CANDIDATES, Math.floor(Number(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES))));
  const maxAttempts = Math.max(0, Math.min(DEFAULT_MAX_ATTEMPTS_PER_NEIGHBORHOOD, Math.floor(Number(options.maxAttemptsPerNeighborhood ?? DEFAULT_MAX_ATTEMPTS_PER_NEIGHBORHOOD))));
  if (maxCandidates <= 0 || maxAttempts <= 0) return [];

  const results: OperationalNeighborhoodCandidate[] = [];
  const seen = new Set<string>([candidateSignature(output)]);
  const allowed = new Set(options.allowedReasons ?? [
    "main_stage_gap_fill",
    "feeder_advance",
    "advance_restrictive_talent",
    "coach_block_compaction",
    "restrictive_talent_bundle",
    "coach_gap_compaction",
    "talent_day_compaction",
    "late_block_pull_forward",
    "early_block_push_later",
  ]);
  if (allowed.has("main_stage_gap_fill")) generateMainStageGapFillCandidates(input, output, maxAttempts, maxCandidates, results, seen, diagnostics);
  if (allowed.has("feeder_advance")) generateFeederAdvanceCandidates(input, output, maxAttempts, maxCandidates, results, seen, diagnostics);
  if (allowed.has("advance_restrictive_talent")) generateAdvanceRestrictiveTalentCandidates(input, output, maxAttempts, maxCandidates, results, seen, diagnostics);
  if (allowed.has("coach_block_compaction")) generateCoachBlockCompactionCandidates(input, output, maxAttempts, maxCandidates, results, seen, diagnostics);
  if (allowed.has("restrictive_talent_bundle")) generateRestrictiveTalentBundleCandidates(input, output, maxAttempts, maxCandidates, results, seen, diagnostics);
  if (allowed.has("coach_gap_compaction")) generatePersonCompactionCandidates(input, output, maxAttempts, maxCandidates, results, seen, diagnostics, "coach", "pull", "coach_gap_compaction", 90);
  if (allowed.has("talent_day_compaction")) generatePersonCompactionCandidates(input, output, maxAttempts, maxCandidates, results, seen, diagnostics, "talent", "pull", "talent_day_compaction", 120);
  if (allowed.has("late_block_pull_forward")) {
    generatePersonCompactionCandidates(input, output, maxAttempts, maxCandidates, results, seen, diagnostics, "coach", "pull", "late_block_pull_forward", 45);
    generatePersonCompactionCandidates(input, output, maxAttempts, maxCandidates, results, seen, diagnostics, "talent", "pull", "late_block_pull_forward", 45);
  }
  if (allowed.has("early_block_push_later")) {
    generatePersonCompactionCandidates(input, output, maxAttempts, maxCandidates, results, seen, diagnostics, "coach", "push", "early_block_push_later", 45);
    generatePersonCompactionCandidates(input, output, maxAttempts, maxCandidates, results, seen, diagnostics, "talent", "push", "early_block_push_later", 45);
  }
  return results.slice(0, maxCandidates);
};

const mergeDiagnostics = (
  target: OperationalNeighborhoodDiagnostics,
  source: OperationalNeighborhoodDiagnostics,
): void => {
  for (const reason of source.attemptedTypes) if (!target.attemptedTypes.includes(reason)) target.attemptedTypes.push(reason);
  for (const reason of source.generatedTypes) if (!target.generatedTypes.includes(reason)) target.generatedTypes.push(reason);
  for (const [reason, count] of Object.entries(source.rejectedReasons)) {
    target.rejectedReasons[reason] = (target.rejectedReasons[reason] ?? 0) + count;
  }
};

export const generateOperationalNeighborhoodSearchCandidates = (
  input: EngineV3Input,
  output: EngineOutput,
): OperationalNeighborhoodSearchResult => {
  const diagnostics: OperationalNeighborhoodDiagnostics = { attemptedTypes: [], generatedTypes: [], rejectedReasons: {} };
  const depth1Diagnostics: OperationalNeighborhoodDiagnostics = { attemptedTypes: [], generatedTypes: [], rejectedReasons: {} };
  const depth1 = generateOperationalNeighborhoodCandidates(input, output, {
    maxCandidates: MAX_DEPTH_1_CANDIDATES,
    diagnostics: depth1Diagnostics,
  }).map((candidate) => ({ ...candidate, depth: 1 as const, chain: [candidate.reason] }));
  mergeDiagnostics(diagnostics, depth1Diagnostics);

  const rankedDepth1 = [...depth1].sort((left, right) => (
    compareCandidateSolutions(input, right.output, left.output)
    || left.reason.localeCompare(right.reason)
    || candidateSignature(left.output).localeCompare(candidateSignature(right.output))
  ));
  const depth2: OperationalNeighborhoodCandidate[] = [];
  const seen = new Set<string>([candidateSignature(output), ...depth1.map((candidate) => candidateSignature(candidate.output))]);
  let chainsEvaluated = 0;

  for (const parent of rankedDepth1) {
    if (depth1.length + depth2.length >= MAX_TOTAL_SEARCH_CANDIDATES) break;
    const secondReasons = ALLOWED_DEPTH_2_CHAINS.get(parent.reason) ?? [];
    if (!secondReasons.length) continue;
    const childDiagnostics: OperationalNeighborhoodDiagnostics = { attemptedTypes: [], generatedTypes: [], rejectedReasons: {} };
    const remaining = MAX_TOTAL_SEARCH_CANDIDATES - depth1.length - depth2.length;
    const children = generateOperationalNeighborhoodCandidates(input, parent.output, {
      maxCandidates: Math.min(MAX_DEPTH_2_PER_CANDIDATE, remaining),
      allowedReasons: secondReasons,
      diagnostics: childDiagnostics,
    });
    mergeDiagnostics(diagnostics, childDiagnostics);
    for (const child of children) {
      chainsEvaluated += 1;
      const signature = candidateSignature(child.output);
      if (seen.has(signature)) {
        incrementRejected(diagnostics, "duplicate_depth_2_candidate");
        continue;
      }
      const baseUnsafeReason = candidateSafetyReason(input, output, child.output);
      if (baseUnsafeReason) {
        incrementRejected(diagnostics, baseUnsafeReason);
        continue;
      }
      seen.add(signature);
      depth2.push({
        ...child,
        depth: 2,
        chain: [parent.reason, child.reason],
      });
      if (depth1.length + depth2.length >= MAX_TOTAL_SEARCH_CANDIDATES) break;
    }
  }

  return {
    candidates: [...depth1, ...depth2],
    depth1Candidates: depth1.length,
    depth2Candidates: depth2.length,
    chainsEvaluated,
    diagnostics,
  };
};
