import type {
  PlannerNextProblem,
  ScheduledSetupPreparation,
  ScheduledSpaceMeal,
  ScheduledTask,
  Task,
} from "./contracts";
import type { ExactSearchLedger } from "./exactMainAndFeederCore";
import { canPlaceTask } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { eligibleSetupTasksForPolicy, setupFamilySequence } from "./setupGrouping";
import {
  createSetupPreparation,
  preparationAvoidsOccupations,
  preparationWithinAvailability,
  preparationWithinDay,
  setupPreparationDuration,
  spaceOccupations,
} from "./setupPreparation";
import { occupationAvoidsProtectedMeal } from "./spaceMeals";
import { findCanonicalPerfectMatching } from "./macroScheduling";

export interface ExactSetupBlockCandidate {
  tasks: ScheduledTask[];
  preparations: ScheduledSetupPreparation[];
  cost: number;
}

export interface ExactSetupBlockGenerationEvidence {
  branchesExplored: number;
  startsExplored: number;
  maximumDepth: number;
  completeCandidateCount: number;
  familyOrderCandidateCounts: Record<string, number>;
  matchingAttempts: number;
  matchingSuccesses: number;
  permutationBranchesAvoided: number;
}

export interface ExactSetupBlockGenerationResult {
  outcome: "COMPLETE" | "BUDGET_EXHAUSTED";
  candidates: ExactSetupBlockCandidate[];
  evidence: ExactSetupBlockGenerationEvidence;
}

const byId = <T extends { id: string }>(left: T, right: T): number =>
  left.id.localeCompare(right.id);

const candidateSignature = (candidate: ExactSetupBlockCandidate): string => [
  ...candidate.tasks
    .slice()
    .sort(byId)
    .map((task) => `${task.id}@${task.start}-${task.end}`),
  ...candidate.preparations
    .slice()
    .sort(byId)
    .map((item) => `${item.id}@${item.start}-${item.end}`),
].join("|");

/**
 * Exhaustively enumerates one structured setup space under the shared exact
 * ledger. No beam, bestK truncation, fallback, or implicit order selection is
 * allowed here.
 */
export function generateExactSetupBlockCandidates(
  problem: PlannerNextProblem,
  tasks: Task[],
  placed: ScheduledTask[],
  preparations: ScheduledSetupPreparation[],
  meals: ScheduledSpaceMeal[],
  ledger: ExactSearchLedger,
): ExactSetupBlockGenerationResult {
  const ordered = [...tasks].sort(byId);
  const spaceId = ordered[0]?.spaceId;
  const space = spaceId === undefined
    ? undefined
    : problem.spaces.find((candidate) => candidate.id === spaceId);
  const policy = space?.setupPolicy;
  const complete: ExactSetupBlockCandidate[] = [];
  const familyOrderCandidateCounts: Record<string, number> = {};
  let branchesExplored = 0;
  let startsExplored = 0;
  let maximumDepth = 0;
  let matchingAttempts = 0;
  let matchingSuccesses = 0;
  let permutationBranchesAvoided = 0;

  const finish = (
    outcome: ExactSetupBlockGenerationResult["outcome"],
  ): ExactSetupBlockGenerationResult => {
    complete.sort((left, right) =>
      left.cost - right.cost
      || (right.tasks[0]?.start ?? 0) - (left.tasks[0]?.start ?? 0)
      || candidateSignature(left).localeCompare(candidateSignature(right)));
    return {
      outcome,
      candidates: complete,
      evidence: {
        branchesExplored,
        startsExplored,
        maximumDepth,
        completeCandidateCount: complete.length,
        familyOrderCandidateCounts: { ...familyOrderCandidateCounts },
        matchingAttempts,
        matchingSuccesses,
        permutationBranchesAvoided,
      },
    };
  };

  if (!spaceId || !space || !policy || ordered.length === 0
    || ordered.some((task) => task.spaceId !== spaceId
      || task.setupFamilyId === undefined)) {
    return finish("COMPLETE");
  }

  let exhausted = false;
  const visit = (
    canonicalStart: number,
    remaining: Task[],
    partialTasks: ScheduledTask[],
    partialPreparations: ScheduledSetupPreparation[],
    cost: number,
    depth: number,
  ): void => {
    if (exhausted) return;
    maximumDepth = Math.max(maximumDepth, depth);
    if (remaining.length === 0) {
      const candidate = {
        tasks: partialTasks,
        preparations: partialPreparations,
        cost,
      };
      complete.push(candidate);
      const key = setupFamilySequence(partialTasks).join(">");
      familyOrderCandidateCounts[key] =
        (familyOrderCandidateCounts[key] ?? 0) + 1;
      return;
    }

    const eligible = eligibleSetupTasksForPolicy(
      remaining,
      partialTasks,
      policy,
    );
    const eligibleFamilies = [...new Set(eligible.map(({ setupFamilyId }) => setupFamilyId!))].sort();
    for (const familyId of eligibleFamilies) {
      if (!ledger.consume("STANDALONE")) {
        exhausted = true;
        return;
      }
      branchesExplored += 1;
      const familyTasks = remaining.filter((task) => task.setupFamilyId === familyId).sort(byId);
      const firstOfFamily = !partialTasks.some((placedTask) => placedTask.setupFamilyId === familyId);
      const hasPriorFamily = partialTasks.some(
        (placedTask) => placedTask.setupFamilyId !== undefined,
      );
      const duration = firstOfFamily
        ? setupPreparationDuration(
          policy,
          familyId,
          hasPriorFamily,
        )
        : undefined;
      const cursor = partialTasks.at(-1)?.end ?? canonicalStart;
      const preparation = duration === undefined
        ? undefined
        : createSetupPreparation(
          spaceId,
          familyId,
          1,
          duration,
          cursor,
        );
      const start = preparation?.end ?? cursor;
      const priorTasks = [...placed, ...partialTasks];
      const priorPreparations = [
        ...preparations,
        ...partialPreparations,
      ];

      if (preparation && (
        !preparationWithinDay(problem, preparation)
        || !preparationWithinAvailability(space.availability, preparation)
        || !occupationAvoidsProtectedMeal(
          problem,
          preparation.spaceId,
          preparation.start,
          preparation.end,
        )
        || !preparationAvoidsOccupations(
          preparation,
          spaceOccupations(
            priorTasks,
            priorPreparations,
            spaceId,
            meals,
          ),
        )
      )) continue;

      const durations = [...new Set(familyTasks.map((task) => task.duration))];
      if (durations.length !== 1) continue;
      const slotIds = familyTasks.map((_task, index) => `${familyId}:${index}`);
      matchingAttempts += 1;
      const matching = findCanonicalPerfectMatching(slotIds, familyTasks.map(({ id }) => id), (taskId, slotId) => {
        const index = Number(slotId.slice(slotId.lastIndexOf(":") + 1));
        const task = familyTasks.find(({ id }) => id === taskId)!;
        return canPlaceTask(problem, task, start + index * task.duration, priorTasks, meals);
      });
      if (!matching) continue;
      const scheduledFamily = [...matching].map(([slotId, taskId]) => {
        const index = Number(slotId.slice(slotId.lastIndexOf(":") + 1));
        const task = familyTasks.find(({ id }) => id === taskId)!;
        return scoreAuxiliaryTask(problem, task, start + index * task.duration, priorTasks).scheduled;
      }).sort((a, b) => a.start - b.start || byId(a, b));
      if (scheduledFamily.some((task) => !canPlaceTask(problem, task, task.start,
        [...priorTasks, ...scheduledFamily.filter(({ id }) => id !== task.id)], meals))) continue;
      matchingSuccesses += 1;
      permutationBranchesAvoided += Math.max(0, familyTasks.length - 1);
      visit(
        canonicalStart,
        remaining.filter((task) => task.setupFamilyId !== familyId),
        [...partialTasks, ...scheduledFamily],
        preparation
          ? [...partialPreparations, preparation]
          : partialPreparations,
        cost + scheduledFamily.reduce((sum, task) => sum + scoreAuxiliaryTask(problem,
          familyTasks.find(({ id }) => id === task.id)!, task.start, priorTasks).cost, 0),
        depth + scheduledFamily.length,
      );
      if (exhausted) return;
    }
  };

  for (
    let canonicalStart = problem.day.start;
    canonicalStart < problem.day.end;
    canonicalStart += 5
  ) {
    startsExplored += 1;
    visit(canonicalStart, ordered, [], [], 0, 0);
    if (exhausted) return finish("BUDGET_EXHAUSTED");
  }
  return finish("COMPLETE");
}
