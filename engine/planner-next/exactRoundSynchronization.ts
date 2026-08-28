import type {
  PlannerNextProblem,
  RoundSynchronizationPolicy,
  ScheduledRoundPreparation,
  ScheduledSetupPreparation,
  ScheduledSpaceMeal,
  ScheduledTask,
  Task,
} from "./contracts";
import type { ExactSearchLedger } from "./exactMainAndFeederCore";
import { canPlaceTask } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import {
  protectedMealBlocksSpace,
} from "./spaceMeals";
import { overlaps } from "./time";
import { roundPreparationId } from "./roundSynchronization";
import { findCanonicalPerfectMatching } from "./macroScheduling";

export type ExactRoundSynchronizationOutcome =
  | "FOUND"
  | "DEAD_END"
  | "BUDGET_EXHAUSTED";

export interface ExactRoundSynchronizationEvidence {
  startCandidates: number;
  assignmentBranches: number;
  assignmentChecks: number;
  completeAssignments: number;
  backtracks: number;
  zeroAlternativePrunes: number;
  matchingAttempts: number;
  matchingSuccesses: number;
  assignmentBranchesAvoided: number;
}

export interface ExactRoundSynchronizationCandidate {
  tasks: ScheduledTask[];
  preparations: ScheduledRoundPreparation[];
  selectionOrder: string[];
}

export interface ExactRoundSynchronizationSearchResult {
  outcome: ExactRoundSynchronizationOutcome;
  evidence: ExactRoundSynchronizationEvidence;
}

export interface ExactRoundSynchronizationMacroDomain {
  domainSize: number;
  structuralCandidateCount: number;
  matchingFeasibleCandidateCount: number;
}

interface Slot {
  laneIndex: number;
  roundIndex: number;
  spaceId: string;
  start: number;
  end: number;
}

const byId = <T extends { id: string }>(left: T, right: T): number =>
  left.id.localeCompare(right.id, "en");

function bridgeEnd(
  problem: PlannerNextProblem,
  spaceId: string,
  previousEnd: number,
  meals: ScheduledSpaceMeal[],
): number {
  const protectedMeal = problem.protectedMeal;
  if (protectedMeal && protectedMealBlocksSpace(problem, spaceId)
    && previousEnd === protectedMeal.start) {
    return protectedMeal.end;
  }
  const meal = meals.find((candidate) =>
    candidate.spaceId === spaceId && candidate.start === previousEnd);
  return meal?.end ?? previousEnd;
}

function intervalFitsSpace(
  problem: PlannerNextProblem,
  spaceId: string,
  start: number,
  end: number,
): boolean {
  const space = problem.spaces.find(({ id }) => id === spaceId);
  return Boolean(space?.availability.some((window) =>
    window.start <= start && end <= window.end));
}

function preparationAvoidsExistingOccupations(
  problem: PlannerNextProblem,
  preparation: ScheduledRoundPreparation,
  baseTasks: ScheduledTask[],
  setupPreparations: ScheduledSetupPreparation[],
  roundPreparations: ScheduledRoundPreparation[],
  meals: ScheduledSpaceMeal[],
): boolean {
  if (preparation.start < problem.day.start || preparation.end > problem.day.end) return false;
  if (!intervalFitsSpace(problem, preparation.spaceId, preparation.start, preparation.end)) return false;
  if (problem.protectedMeal && protectedMealBlocksSpace(problem, preparation.spaceId)
    && overlaps(preparation, problem.protectedMeal)) return false;
  if (meals.some((meal) => meal.spaceId === preparation.spaceId && overlaps(meal, preparation))) return false;
  if (baseTasks.some((task) => task.spaceId === preparation.spaceId && overlaps(task, preparation))) return false;
  if (setupPreparations.some((item) => item.spaceId === preparation.spaceId && overlaps(item, preparation))) return false;
  if (roundPreparations.some((item) => item.spaceId === preparation.spaceId && overlaps(item, preparation))) return false;
  return true;
}

function buildSlots(
  problem: PlannerNextProblem,
  policy: RoundSynchronizationPolicy,
  firstStart: number,
  baseTasks: ScheduledTask[],
  setupPreparations: ScheduledSetupPreparation[],
  existingRoundPreparations: ScheduledRoundPreparation[],
  meals: ScheduledSpaceMeal[],
): { slots: Slot[]; preparations: ScheduledRoundPreparation[] } | null {
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const laneSlots: Slot[][] = [];
  const preparations: ScheduledRoundPreparation[] = [];

  for (const [laneIndex, lane] of policy.lanes.entries()) {
    const laneTasks = lane.taskIds.map((id) => taskById.get(id)).filter((task): task is Task => Boolean(task));
    if (laneTasks.length !== lane.taskIds.length || laneTasks.length === 0) return null;
    const duration = laneTasks[0]!.duration;
    const slots: Slot[] = [];
    let start = firstStart;

    for (let index = 0; index < laneTasks.length; index += 1) {
      if (index > 0) {
        const previous = slots[index - 1]!;
        const preparationStart = bridgeEnd(problem, lane.spaceId, previous.end, meals);
        if (lane.preparationMinutesBetweenRounds > 0) {
          const preparation: ScheduledRoundPreparation = {
            id: roundPreparationId(policy.id, lane.spaceId, index + 1),
            kind: "round-preparation",
            synchronizationId: policy.id,
            spaceId: lane.spaceId,
            roundIndex: index + 1,
            duration: lane.preparationMinutesBetweenRounds,
            start: preparationStart,
            end: preparationStart + lane.preparationMinutesBetweenRounds,
          };
          if (!preparationAvoidsExistingOccupations(
            problem,
            preparation,
            baseTasks,
            setupPreparations,
            [...existingRoundPreparations, ...preparations],
            meals,
          )) return null;
          preparations.push(preparation);
          start = preparation.end;
        } else {
          start = preparationStart;
        }
      }
      const end = start + duration;
      if (start < problem.day.start || end > problem.day.end) return null;
      if (!intervalFitsSpace(problem, lane.spaceId, start, end)) return null;
      slots.push({ laneIndex, roundIndex: index + 1, spaceId: lane.spaceId, start, end });
    }
    laneSlots.push(slots);
  }

  const synchronizedCount = Math.min(...laneSlots.map((slots) => slots.length));
  for (let index = 0; index < synchronizedCount; index += 1) {
    const reference = laneSlots[0]![index]!;
    if (laneSlots.slice(1).some((slots) => {
      const candidate = slots[index]!;
      return candidate.start !== reference.start || candidate.end !== reference.end;
    })) return null;
  }

  return {
    slots: laneSlots.flat().sort((left, right) =>
      left.start - right.start || left.laneIndex - right.laneIndex || left.roundIndex - right.roundIndex),
    preparations: preparations.sort(byId),
  };
}

function materializeMatchingCandidate(problem: PlannerNextProblem, policy: RoundSynchronizationPolicy,
  firstStart: number, baseTasks: ScheduledTask[], setupPreparations: ScheduledSetupPreparation[],
  existingRoundPreparations: ScheduledRoundPreparation[], meals: ScheduledSpaceMeal[]): ExactRoundSynchronizationCandidate | null {
  const shape = buildSlots(problem, policy, firstStart, baseTasks, setupPreparations, existingRoundPreparations, meals);
  if (!shape) return null;
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const laneTasks = policy.lanes.map((lane) => lane.taskIds.map((id) => taskById.get(id))
    .filter((task): task is Task => Boolean(task)).sort(byId));
  if (laneTasks.some((tasks, index) => tasks.length !== policy.lanes[index]!.taskIds.length)) return null;
  const slotKey = (slot: Slot): string => `${slot.laneIndex}:${slot.roundIndex}`;
  const slotById = new Map(shape.slots.map((slot) => [slotKey(slot), slot]));
  const allTasks = laneTasks.flat(), taskByMatchingId = new Map(allTasks.map((task) => [task.id, task]));
  const matching = findCanonicalPerfectMatching([...slotById.keys()], allTasks.map(({ id }) => id), (taskId, key) => {
    const task = taskByMatchingId.get(taskId)!, slot = slotById.get(key)!;
    return laneTasks[slot.laneIndex]!.some(({ id }) => id === taskId) && canPlaceTask(problem, task, slot.start, baseTasks, meals);
  });
  if (!matching) return null;
  const scheduled = [...matching].map(([key, taskId]) => {
    const slot = slotById.get(key)!;
    return scoreAuxiliaryTask(problem, taskByMatchingId.get(taskId)!, slot.start, baseTasks).scheduled;
  });
  if (scheduled.some((task) => !canPlaceTask(problem, task, task.start,
    [...baseTasks, ...scheduled.filter(({ id }) => id !== task.id)], meals))) return null;
  scheduled.sort((left, right) => left.start - right.start || byId(left, right));
  return { tasks: scheduled, preparations: [...shape.preparations], selectionOrder: scheduled.map(({ id }) => id) };
}

/** Counts hard-valid synchronized temporal shapes without consuming the shared search ledger. */
export function probeExactRoundSynchronizationMacroDomain(problem: PlannerNextProblem, policy: RoundSynchronizationPolicy,
  baseTasks: ScheduledTask[], setupPreparations: ScheduledSetupPreparation[], existingRoundPreparations: ScheduledRoundPreparation[],
  meals: ScheduledSpaceMeal[]): ExactRoundSynchronizationMacroDomain {
  let structuralCandidateCount = 0, matchingFeasibleCandidateCount = 0;
  for (let start = problem.day.start; start < problem.day.end; start += 5) {
    if (buildSlots(problem, policy, start, baseTasks, setupPreparations, existingRoundPreparations, meals)) structuralCandidateCount += 1;
    if (materializeMatchingCandidate(problem, policy, start, baseTasks, setupPreparations, existingRoundPreparations, meals)) matchingFeasibleCandidateCount += 1;
  }
  return { domainSize: matchingFeasibleCandidateCount, structuralCandidateCount, matchingFeasibleCandidateCount };
}

/**
 * Explores one generic two-lane synchronized round policy under the shared exact ledger.
 * The policy task arrays are treated as eligible sets, never as an authoritative order.
 */
export function exploreExactRoundSynchronizationPolicy(
  problem: PlannerNextProblem,
  policy: RoundSynchronizationPolicy,
  baseTasks: ScheduledTask[],
  setupPreparations: ScheduledSetupPreparation[],
  existingRoundPreparations: ScheduledRoundPreparation[],
  meals: ScheduledSpaceMeal[],
  ledger: ExactSearchLedger,
  continuation: (candidate: ExactRoundSynchronizationCandidate) => ExactRoundSynchronizationOutcome,
): ExactRoundSynchronizationSearchResult {
  const evidence: ExactRoundSynchronizationEvidence = {
    startCandidates: 0,
    assignmentBranches: 0,
    assignmentChecks: 0,
    completeAssignments: 0,
    backtracks: 0,
    zeroAlternativePrunes: 0,
    matchingAttempts: 0,
    matchingSuccesses: 0,
    assignmentBranchesAvoided: 0,
  };
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const laneTasks = policy.lanes.map((lane) =>
    lane.taskIds.map((id) => taskById.get(id)).filter((task): task is Task => Boolean(task)).sort(byId));
  if (laneTasks.some((tasks, index) => tasks.length !== policy.lanes[index]!.taskIds.length)) {
    return { outcome: "DEAD_END", evidence };
  }

  for (let firstStart = problem.day.start; firstStart < problem.day.end; firstStart += 5) {
    evidence.startCandidates += 1;
    const shape = buildSlots(
      problem,
      policy,
      firstStart,
      baseTasks,
      setupPreparations,
      existingRoundPreparations,
      meals,
    );
    if (!shape) continue;

    const slotKey = (slot: Slot): string => `${slot.laneIndex}:${slot.roundIndex}`;
    if (!ledger.consume("STANDALONE")) return { outcome: "BUDGET_EXHAUSTED", evidence };
    evidence.assignmentBranches += 1;
    evidence.matchingAttempts += 1;
    const slotById = new Map(shape.slots.map((slot) => [slotKey(slot), slot]));
    const allTasks = laneTasks.flat();
    const taskByMatchingId = new Map(allTasks.map((task) => [task.id, task]));
    const matching = findCanonicalPerfectMatching(
      [...slotById.keys()],
      allTasks.map(({ id }) => id),
      (taskId, key) => {
        evidence.assignmentChecks += 1;
        const task = taskByMatchingId.get(taskId)!;
        const slot = slotById.get(key)!;
        return laneTasks[slot.laneIndex]!.some(({ id }) => id === taskId)
          && canPlaceTask(problem, task, slot.start, baseTasks, meals);
      },
    );
    if (!matching) {
      evidence.zeroAlternativePrunes += 1;
      continue;
    }
    const scheduled = [...matching].map(([key, taskId]) => {
      const slot = slotById.get(key)!;
      return scoreAuxiliaryTask(problem, taskByMatchingId.get(taskId)!, slot.start, baseTasks).scheduled;
    });
    if (scheduled.some((task) => !canPlaceTask(problem, task, task.start,
      [...baseTasks, ...scheduled.filter(({ id }) => id !== task.id)], meals))) {
      evidence.zeroAlternativePrunes += 1;
      continue;
    }
    evidence.matchingSuccesses += 1;
    evidence.assignmentBranchesAvoided += Math.max(0, allTasks.length - 1);
    evidence.completeAssignments += 1;
    const outcome = continuation({
      tasks: scheduled.sort((left, right) => left.start - right.start || byId(left, right)),
      preparations: [...shape.preparations],
      selectionOrder: scheduled.map(({ id }) => id),
    });
    if (outcome !== "DEAD_END") return { outcome, evidence };
    evidence.backtracks += 1;
  }

  return { outcome: "DEAD_END", evidence };
}
