import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import {
  calculateMainStageGaps,
  countHardConstraintViolations,
  getPlannedViews,
  toMinutes,
} from "./metrics";
import { getCoachResourceIds, getDependencyIds } from "./operationalPriority";

export type OperationalNeighborhoodReason = "advance_restrictive_talent" | "coach_block_compaction";

export interface OperationalNeighborhoodCandidate {
  output: EngineOutput;
  reason: OperationalNeighborhoodReason;
}

export interface OperationalNeighborhoodOptions {
  maxCandidates?: number;
  maxAttemptsPerNeighborhood?: number;
}

const DEFAULT_MAX_CANDIDATES = 20;
const DEFAULT_MAX_ATTEMPTS_PER_NEIGHBORHOOD = 5;

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

const cloneWithSwappedTimes = (output: EngineOutput, leftTaskId: number, rightTaskId: number): EngineOutput | null => {
  const left = (output.plannedTasks ?? []).find((planned) => Number(planned.taskId) === leftTaskId);
  const right = (output.plannedTasks ?? []).find((planned) => Number(planned.taskId) === rightTaskId);
  if (!left || !right) return null;
  const leftDuration = durationOf(left);
  const rightDuration = durationOf(right);
  const leftStart = toMinutes(left.startPlanned);
  const rightStart = toMinutes(right.startPlanned);
  if (leftDuration === null || rightDuration === null || leftStart === null || rightStart === null) return null;
  if (leftDuration !== rightDuration) return null;

  return {
    ...output,
    plannedTasks: (output.plannedTasks ?? []).map((planned) => {
      if (Number(planned.taskId) === leftTaskId) {
        return { ...planned, startPlanned: toHHMM(rightStart), endPlanned: toHHMM(rightStart + leftDuration) };
      }
      if (Number(planned.taskId) === rightTaskId) {
        return { ...planned, startPlanned: toHHMM(leftStart), endPlanned: toHHMM(leftStart + rightDuration) };
      }
      return { ...planned };
    }),
  };
};

const mainGapMinutes = (input: EngineV3Input, output: EngineOutput): number => calculateMainStageGaps(input, output)?.minutes ?? 0;

const candidateIsSafe = (input: EngineV3Input, baseOutput: EngineOutput, candidate: EngineOutput): boolean => {
  if (countHardConstraintViolations(input, candidate) > 0) return false;
  return mainGapMinutes(input, candidate) <= mainGapMinutes(input, baseOutput);
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

const appendIfSafe = (
  input: EngineV3Input,
  baseOutput: EngineOutput,
  candidate: EngineOutput | null,
  reason: OperationalNeighborhoodReason,
  results: OperationalNeighborhoodCandidate[],
  seen: Set<string>,
  maxCandidates: number,
): boolean => {
  if (!candidate || results.length >= maxCandidates) return false;
  if (!candidateIsSafe(input, baseOutput, candidate)) return false;
  const signature = candidateSignature(candidate);
  if (seen.has(signature)) return false;
  seen.add(signature);
  results.push({ output: candidate, reason });
  return true;
};

const generateAdvanceRestrictiveTalentCandidates = (
  input: EngineV3Input,
  output: EngineOutput,
  maxAttempts: number,
  maxCandidates: number,
  results: OperationalNeighborhoodCandidate[],
  seen: Set<string>,
): void => {
  const fixed = fixedTaskIds(input);
  const taskById = new Map((input.tasks ?? []).map((task: any) => [Number(task.id), task]));
  const plannedById = new Map((output.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  const rows = getPlannedViews(input, output)
    .filter((view) => !fixed.has(view.taskId) && isRestrictiveTask(input, view.task))
    .map((view) => ({ ...view, start: toMinutes(view.startPlanned) ?? 0 }))
    .sort((a, b) => b.start - a.start || a.taskId - b.taskId);

  let attempts = 0;
  for (const restrictive of rows) {
    if (attempts >= maxAttempts || results.length >= maxCandidates) break;
    const restrictivePlanned = plannedById.get(restrictive.taskId);
    const restrictiveDuration = restrictivePlanned ? durationOf(restrictivePlanned) : null;
    if (restrictiveDuration === null) continue;
    const dependencyIds = getDependencyIds(restrictive.task);
    const earlierRows = getPlannedViews(input, output)
      .filter((view) => view.taskId !== restrictive.taskId && !fixed.has(view.taskId))
      .map((view) => ({ ...view, start: toMinutes(view.startPlanned) ?? 0, planned: plannedById.get(view.taskId) }))
      .filter((view) => view.start < restrictive.start && durationOf(view.planned as any) === restrictiveDuration)
      .sort((a, b) => a.start - b.start || a.taskId - b.taskId);
    for (const earlier of earlierRows) {
      if (attempts >= maxAttempts || results.length >= maxCandidates) break;
      const earlierTask = taskById.get(earlier.taskId) as any;
      if (getDependencyIds(earlierTask).includes(restrictive.taskId)) continue;
      if (dependencyIds.includes(earlier.taskId)) continue;
      attempts += 1;
      appendIfSafe(input, output, cloneWithSwappedTimes(output, restrictive.taskId, earlier.taskId), "advance_restrictive_talent", results, seen, maxCandidates);
    }
  }
};

const generateCoachBlockCompactionCandidates = (
  input: EngineV3Input,
  output: EngineOutput,
  maxAttempts: number,
  maxCandidates: number,
  results: OperationalNeighborhoodCandidate[],
  seen: Set<string>,
): void => {
  const fixed = fixedTaskIds(input);
  const coachIds = getCoachResourceIds(input);
  if (!coachIds.size) return;
  const rows = getPlannedViews(input, output)
    .map((view) => ({
      ...view,
      start: toMinutes(view.startPlanned) ?? 0,
      coachKey: view.assignedResources.filter((id) => coachIds.has(Number(id))).sort((a, b) => a - b).join(","),
    }))
    .filter((row) => row.coachKey && !fixed.has(row.taskId))
    .sort((a, b) => a.start - b.start || a.taskId - b.taskId);

  let attempts = 0;
  for (let i = 0; i + 2 < rows.length && attempts < maxAttempts && results.length < maxCandidates; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    const c = rows[i + 2];
    if (a.coachKey !== c.coachKey || a.coachKey === b.coachKey) continue;
    attempts += 1;
    appendIfSafe(input, output, cloneWithSwappedTimes(output, b.taskId, c.taskId), "coach_block_compaction", results, seen, maxCandidates);
  }
};

export const shouldAttemptOperationalNeighborhoods = (input: EngineV3Input, output: EngineOutput): boolean => {
  if ((input as any)?.enableOperationalNeighborhoods === false) return false;
  if (!output.complete) return false;
  if (countHardConstraintViolations(input, output) > 0) return false;
  const views = getPlannedViews(input, output);
  if (views.some((view) => isRestrictiveTask(input, view.task))) return true;
  const coachIds = getCoachResourceIds(input);
  const coachRows = views.filter((view) => view.assignedResources.some((id) => coachIds.has(Number(id))));
  if (coachRows.length >= 3) return true;
  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  return Number.isFinite(mainZoneId) && mainZoneId > 0 && views.some((view) => Number(view.task.zoneId ?? NaN) === mainZoneId && getDependencyIds(view.task).length > 0);
};

export const generateOperationalNeighborhoodCandidates = (
  input: EngineV3Input,
  output: EngineOutput,
  options: OperationalNeighborhoodOptions = {},
): OperationalNeighborhoodCandidate[] => {
  if (!output.complete) return [];
  if (countHardConstraintViolations(input, output) > 0) return [];
  const maxCandidates = Math.max(0, Math.min(DEFAULT_MAX_CANDIDATES, Math.floor(Number(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES))));
  const maxAttempts = Math.max(0, Math.min(DEFAULT_MAX_ATTEMPTS_PER_NEIGHBORHOOD, Math.floor(Number(options.maxAttemptsPerNeighborhood ?? DEFAULT_MAX_ATTEMPTS_PER_NEIGHBORHOOD))));
  if (maxCandidates <= 0 || maxAttempts <= 0) return [];

  const results: OperationalNeighborhoodCandidate[] = [];
  const seen = new Set<string>([candidateSignature(output)]);
  generateAdvanceRestrictiveTalentCandidates(input, output, maxAttempts, maxCandidates, results, seen);
  generateCoachBlockCompactionCandidates(input, output, maxAttempts, maxCandidates, results, seen);
  return results.slice(0, maxCandidates);
};
