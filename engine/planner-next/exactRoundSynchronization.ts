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
  if (protectedMealBlocksSpace(problem, spaceId)
    && previousEnd === problem.protectedMeal.start) {
    return problem.protectedMeal.end;
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
  if (protectedMealBlocksSpace(problem, preparation.spaceId)
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

    const assignedBySlot = new Map<string, ScheduledTask>();
    const usedTaskIds = new Set<string>();
    const selectionOrder: string[] = [];
    const slotKey = (slot: Slot): string => `${slot.laneIndex}:${slot.roundIndex}`;

    const assign = (): ExactRoundSynchronizationOutcome => {
      if (assignedBySlot.size === shape.slots.length) {
        evidence.completeAssignments += 1;
        return continuation({
          tasks: [...assignedBySlot.values()].sort((left, right) =>
            left.start - right.start || byId(left, right)),
          preparations: [...shape.preparations],
          selectionOrder: [...selectionOrder],
        });
      }

      const openSlots = shape.slots.filter((slot) => !assignedBySlot.has(slotKey(slot)));
      const ranked = openSlots.map((slot) => {
        const placed = [...baseTasks, ...assignedBySlot.values()];
        const choices = laneTasks[slot.laneIndex]!
          .filter((task) => !usedTaskIds.has(task.id))
          .map((task) => {
            evidence.assignmentChecks += 1;
            if (!canPlaceTask(problem, task, slot.start, placed, meals)) return null;
            const scored = scoreAuxiliaryTask(problem, task, slot.start, placed);
            return { task, scheduled: scored.scheduled, cost: scored.cost };
          })
          .filter((choice): choice is NonNullable<typeof choice> => choice !== null)
          .sort((left, right) =>
            left.cost - right.cost || left.task.id.localeCompare(right.task.id, "en"));
        return { slot, choices };
      }).sort((left, right) =>
        left.choices.length - right.choices.length
        || left.slot.start - right.slot.start
        || left.slot.laneIndex - right.slot.laneIndex
        || left.slot.roundIndex - right.slot.roundIndex);

      const selected = ranked[0]!;
      if (selected.choices.length === 0) {
        evidence.zeroAlternativePrunes += 1;
        return "DEAD_END";
      }

      for (const choice of selected.choices) {
        if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
        evidence.assignmentBranches += 1;
        const key = slotKey(selected.slot);
        assignedBySlot.set(key, choice.scheduled);
        usedTaskIds.add(choice.task.id);
        selectionOrder.push(choice.task.id);
        const outcome = assign();
        if (outcome !== "DEAD_END") return outcome;
        selectionOrder.pop();
        usedTaskIds.delete(choice.task.id);
        assignedBySlot.delete(key);
        evidence.backtracks += 1;
      }
      return "DEAD_END";
    };

    const outcome = assign();
    if (outcome !== "DEAD_END") return { outcome, evidence };
  }

  return { outcome: "DEAD_END", evidence };
}
