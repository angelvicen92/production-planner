import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import {
  calculateOperationalMetrics,
  countContestantWindowViolations,
  toMinutes,
} from "./metrics";
import { calculateRestrictiveTalentLatenessPenalty, getDependencyIds } from "./operationalPriority";

export type CandidateSource = "phaseA_greedy" | "phaseA_backtracking" | "operational_neighborhood" | "cp_sat_pilot" | "cp_sat" | "fallback" | "infeasible";

export interface CandidateSolutionScore {
  hardConstraintViolations: number;
  plannedTasks: number;
  unplannedTasks: number;
  contestantWindowViolations: number;
  mainStageGapMinutes: number;
  mainStageGapCount: number;
  restrictiveTalentLatenessPenalty: number;
  dependencyFeederPenalty: number;
  coachSwitchCount: number | null;
  coachSwitchPenalty: number;
  restrictiveTalentAverageStartOffset: number | null;
  makespan: number;
  score: string;
  tieBreakKey: string;
  reasons: string[];
}

const finiteOrZero = (value: number | null | undefined): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const finiteOrLarge = (value: number | null | undefined): number => Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER;

const calculateDependencyFeederPenalty = (input: EngineV3Input, output: EngineOutput): number => {
  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  if (!Number.isFinite(mainZoneId) || mainZoneId <= 0) return 0;
  const plannedById = new Map((output.plannedTasks ?? []).map((planned) => [Number(planned.taskId), planned]));
  const taskById = new Map((input.tasks ?? []).map((task) => [Number((task as any).id), task]));
  let penalty = 0;
  for (const task of input.tasks ?? []) {
    if (Number((task as any).zoneId ?? NaN) !== mainZoneId) continue;
    const deps = getDependencyIds(task);
    if (!deps.length) continue;
    const planned = plannedById.get(Number((task as any).id));
    const mainStart = toMinutes(planned?.startPlanned);
    if (!planned || mainStart === null) {
      penalty += 1440 * deps.length;
      continue;
    }
    for (const depId of deps) {
      const depTask = taskById.get(depId) as any;
      const depPlanned = plannedById.get(depId);
      const depEnd = toMinutes(depPlanned?.endPlanned);
      if (!depTask || !depPlanned || depEnd === null) {
        penalty += 1440;
        continue;
      }
      penalty += Math.max(0, mainStart - depEnd);
    }
  }
  return penalty;
};

export const scoreCandidateSolution = (input: EngineV3Input, output: EngineOutput): CandidateSolutionScore => {
  const operationalMetrics = calculateOperationalMetrics(input, output);
  const hardConstraintViolations = operationalMetrics.hardConstraintViolations;
  const plannedTasks = output.plannedTasks?.length ?? 0;
  const unplannedTasks = output.unplanned?.length ?? Math.max(0, (input.tasks?.length ?? 0) - plannedTasks);
  const contestantWindowViolations = countContestantWindowViolations(input, output);
  const mainStageGapCount = finiteOrZero(operationalMetrics.mainStageGapCount);
  const mainStageGapMinutes = finiteOrZero(operationalMetrics.mainStageGapMinutes);
  const restrictiveTalentLatenessPenalty = calculateRestrictiveTalentLatenessPenalty(input, output);
  const dependencyFeederPenalty = calculateDependencyFeederPenalty(input, output);
  const coachSwitchCount = operationalMetrics.coachSwitchCount;
  const coachSwitchPenalty = finiteOrZero(operationalMetrics.coachSwitchPenalty);
  const restrictiveTalentAverageStartOffset = operationalMetrics.restrictiveTalentAverageStartOffset;
  const makespan = finiteOrLarge(operationalMetrics.makespan);
  const tieBreakKey = (output.plannedTasks ?? [])
    .map((task) => `${String(task.taskId).padStart(12, "0")}@${task.startPlanned}-${task.endPlanned}`)
    .sort()
    .join("|");

  const reasons = [
    `hard=${hardConstraintViolations}`,
    `planned=${plannedTasks}`,
    `window=${contestantWindowViolations}`,
    `mainGaps=${mainStageGapCount}/${mainStageGapMinutes}`,
    `restrictiveLate=${restrictiveTalentLatenessPenalty}`,
    `feeders=${dependencyFeederPenalty}`,
    `coachSwitchCount=${coachSwitchCount ?? "n/a"}`,
    `coachSwitchPenalty=${coachSwitchPenalty}`,
    `makespan=${makespan === Number.MAX_SAFE_INTEGER ? "n/a" : makespan}`,
  ];

  return {
    hardConstraintViolations,
    plannedTasks,
    unplannedTasks,
    contestantWindowViolations,
    mainStageGapMinutes,
    mainStageGapCount,
    restrictiveTalentLatenessPenalty,
    dependencyFeederPenalty,
    coachSwitchCount,
    coachSwitchPenalty,
    restrictiveTalentAverageStartOffset,
    makespan,
    score: reasons.join("; "),
    tieBreakKey,
    reasons,
  };
};

const compareNumber = (a: number, b: number, lowerIsBetter: boolean): number => {
  if (a === b) return 0;
  return lowerIsBetter ? (a < b ? 1 : -1) : (a > b ? 1 : -1);
};

export const compareCandidateScores = (a: CandidateSolutionScore, b: CandidateSolutionScore): number => {
  const checks: Array<[number, number, boolean]> = [
    [a.hardConstraintViolations, b.hardConstraintViolations, true],
    [a.plannedTasks, b.plannedTasks, false],
    [a.contestantWindowViolations, b.contestantWindowViolations, true],
    [a.mainStageGapCount, b.mainStageGapCount, true],
    [a.mainStageGapMinutes, b.mainStageGapMinutes, true],
    [a.restrictiveTalentLatenessPenalty, b.restrictiveTalentLatenessPenalty, true],
    [a.dependencyFeederPenalty, b.dependencyFeederPenalty, true],
    [a.coachSwitchPenalty, b.coachSwitchPenalty, true],
    [a.makespan, b.makespan, true],
  ];
  for (const [left, right, lowerIsBetter] of checks) {
    const result = compareNumber(left, right, lowerIsBetter);
    if (result !== 0) return result;
  }
  return 0;
};

export const compareCandidateSolutions = (input: EngineV3Input, a: EngineOutput, b: EngineOutput): number => (
  compareCandidateScores(scoreCandidateSolution(input, a), scoreCandidateSolution(input, b))
);

export const summarizeCandidateScore = (score: CandidateSolutionScore): string => score.score;

export const explainCandidateComparison = (
  selectedSource: CandidateSource,
  rejectedSource: CandidateSource,
  selected: CandidateSolutionScore,
  rejected: CandidateSolutionScore,
): string => {
  if (selected.hardConstraintViolations !== rejected.hardConstraintViolations) return `${selectedSource} selected: fewer hard constraint violations`;
  if (selected.plannedTasks !== rejected.plannedTasks) return `${selectedSource} selected: rescued ${selected.plannedTasks - rejected.plannedTasks} planned task(s)`;
  if (selected.contestantWindowViolations !== rejected.contestantWindowViolations) return `${selectedSource} selected: fewer availability window violations`;
  if (selected.mainStageGapCount !== rejected.mainStageGapCount) return `${selectedSource} selected: fewer main-stage gaps`;
  if (selected.mainStageGapMinutes !== rejected.mainStageGapMinutes) return `${selectedSource} selected: fewer main-stage gap minutes`;
  if (selected.restrictiveTalentLatenessPenalty !== rejected.restrictiveTalentLatenessPenalty) return `${selectedSource} selected: earlier restrictive talents`;
  if (selected.dependencyFeederPenalty !== rejected.dependencyFeederPenalty) return `${selectedSource} selected: better feeder/dependency timing`;
  if (selected.coachSwitchPenalty !== rejected.coachSwitchPenalty) {
    if (selected.coachSwitchCount !== null && rejected.coachSwitchCount !== null && selected.coachSwitchCount < rejected.coachSwitchCount) {
      return `${selectedSource} selected: fewer coach switches`;
    }
    const rawComparison = selected.coachSwitchCount === rejected.coachSwitchCount
      ? "raw coach-switch count unchanged"
      : `raw coach-switch count ${selected.coachSwitchCount ?? "n/a"} vs ${rejected.coachSwitchCount ?? "n/a"}`;
    return `${selectedSource} selected: lower weighted coach-switch penalty (${rawComparison})`;
  }
  if (selected.makespan !== rejected.makespan) return `${selectedSource} selected: lower makespan`;
  return `${selectedSource} selected: deterministic stable tie-break`;
};
