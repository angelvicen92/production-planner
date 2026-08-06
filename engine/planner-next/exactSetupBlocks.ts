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
    for (const task of eligible) {
      if (!ledger.consume("STANDALONE")) {
        exhausted = true;
        return;
      }
      branchesExplored += 1;

      const firstOfFamily = !partialTasks.some(
        (placedTask) => placedTask.setupFamilyId === task.setupFamilyId,
      );
      const hasPriorFamily = partialTasks.some(
        (placedTask) => placedTask.setupFamilyId !== undefined,
      );
      const duration = task.setupFamilyId !== undefined && firstOfFamily
        ? setupPreparationDuration(
          policy,
          task.setupFamilyId,
          hasPriorFamily,
        )
        : undefined;
      const cursor = partialTasks.at(-1)?.end ?? canonicalStart;
      const preparation = duration === undefined
        ? undefined
        : createSetupPreparation(
          spaceId,
          task.setupFamilyId!,
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

      if (!canPlaceTask(problem, task, start, priorTasks, meals)) continue;
      const scored = scoreAuxiliaryTask(
        problem,
        task,
        start,
        priorTasks,
      );
      visit(
        canonicalStart,
        remaining.filter(({ id }) => id !== task.id),
        [...partialTasks, scored.scheduled],
        preparation
          ? [...partialPreparations, preparation]
          : partialPreparations,
        cost + scored.cost,
        depth + 1,
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
