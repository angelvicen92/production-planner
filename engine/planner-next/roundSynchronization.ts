import type {
  PlannerNextProblem,
  RoundSynchronizationPolicy,
  ScheduledRoundPreparation,
  ScheduledSpaceMeal,
  ScheduledTask,
} from "./contracts";
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES } from "./integration/plannerNextCapabilities";

const compare = (left: string, right: string): number => left.localeCompare(right, "en");
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean =>
  aStart < bEnd && bStart < aEnd;

export const roundPreparationId = (
  synchronizationId: string,
  spaceId: string,
  roundIndex: number,
): string => `round-preparation:${synchronizationId}:${spaceId}:${roundIndex}`;

export function roundSynchronizationTaskIds(
  problem: PlannerNextProblem,
): ReadonlySet<string> {
  return new Set(
    (problem.roundSynchronizations ?? [])
      .flatMap((policy) => policy.lanes)
      .flatMap((lane) => lane.taskIds),
  );
}

export function roundSynchronizationPreflightReasons(
  problem: PlannerNextProblem,
): string[] {
  const reasons = new Set<string>();
  const raw = (problem as unknown as Record<string, unknown>).roundSynchronizations;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return ["INVALID_ROUND_SYNCHRONIZATION_POLICY"];

  const policies = raw as RoundSynchronizationPolicy[];
  if (policies.length > 0 && problem.searchPolicy !== "EXACT_CONSTRUCTIVE") {
    reasons.add("ROUND_SYNCHRONIZATION_REQUIRES_EXACT_POLICY");
  }
  const policyIds = new Set<string>();
  const globallyUsedTaskIds = new Set<string>();
  const globallyUsedSpaceIds = new Set<string>();
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const knownSpaceIds = new Set(problem.spaces.map((space) => space.id));

  for (const policy of policies) {
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
      reasons.add("INVALID_ROUND_SYNCHRONIZATION_POLICY");
      continue;
    }
    if (typeof policy.id !== "string" || policy.id.trim() !== policy.id || policy.id === "") {
      reasons.add("INVALID_ROUND_SYNCHRONIZATION_POLICY");
    } else if (policyIds.has(policy.id)) {
      reasons.add("DUPLICATE_ROUND_SYNCHRONIZATION_ID");
    } else {
      policyIds.add(policy.id);
    }
    if (policy.synchronization !== "START_TOGETHER_WHILE_ALL_LANES_ACTIVE") {
      reasons.add("INVALID_ROUND_SYNCHRONIZATION_POLICY");
    }
    if (!Array.isArray(policy.lanes) || policy.lanes.length !== 2) {
      reasons.add("UNSUPPORTED_ROUND_SYNCHRONIZATION_LANE_COUNT");
      continue;
    }

    const localSpaces = new Set<string>();
    const localTasks = new Set<string>();
    const durations = new Set<number>();
    for (const lane of policy.lanes) {
      if (!lane || typeof lane !== "object" || Array.isArray(lane)) {
        reasons.add("INVALID_ROUND_SYNCHRONIZATION_POLICY");
        continue;
      }
      if (typeof lane.spaceId !== "string" || !knownSpaceIds.has(lane.spaceId)) {
        reasons.add("MISSING_ROUND_SYNCHRONIZATION_SPACE");
      } else {
        if (localSpaces.has(lane.spaceId) || globallyUsedSpaceIds.has(lane.spaceId)) {
          reasons.add("DUPLICATE_ROUND_SYNCHRONIZATION_SPACE");
        }
        localSpaces.add(lane.spaceId);
        globallyUsedSpaceIds.add(lane.spaceId);
      }
      const prep = lane.preparationMinutesBetweenRounds;
      if (!Number.isInteger(prep) || prep < 0
        || prep % PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES !== 0) {
        reasons.add("INVALID_ROUND_PREPARATION_DURATION");
      }
      if (!Array.isArray(lane.taskIds) || lane.taskIds.length === 0) {
        reasons.add("INVALID_ROUND_SYNCHRONIZATION_POLICY");
        continue;
      }
      for (const taskId of lane.taskIds) {
        if (typeof taskId !== "string" || taskId === "") {
          reasons.add("MISSING_ROUND_SYNCHRONIZATION_TASK");
          continue;
        }
        if (localTasks.has(taskId) || globallyUsedTaskIds.has(taskId)) {
          reasons.add("DUPLICATE_ROUND_SYNCHRONIZATION_TASK");
        }
        localTasks.add(taskId);
        globallyUsedTaskIds.add(taskId);
        const task = taskById.get(taskId);
        if (!task) {
          reasons.add("MISSING_ROUND_SYNCHRONIZATION_TASK");
          continue;
        }
        if (task.kind !== "auxiliary"
          || task.spaceId !== lane.spaceId
          || task.jointGroupId !== undefined
          || task.setupFamilyId !== undefined) {
          reasons.add("UNSUPPORTED_ROUND_SYNCHRONIZATION_TASK");
        }
        if (!Number.isInteger(task.duration) || task.duration <= 0
          || task.duration % PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES !== 0) {
          reasons.add("INVALID_ROUND_SYNCHRONIZATION_DURATION");
        } else {
          durations.add(task.duration);
        }
      }
    }
    if (durations.size > 1) reasons.add("UNSUPPORTED_ROUND_SYNCHRONIZATION_DURATION_MIX");
  }

  return [...reasons].sort(compare);
}

function gapIsAuthorized(
  problem: PlannerNextProblem,
  spaceId: string,
  previousEnd: number,
  nextOccupationStart: number,
  meals: ScheduledSpaceMeal[],
): boolean {
  if (previousEnd === nextOccupationStart) return true;
  if (previousEnd === problem.protectedMeal.start
    && nextOccupationStart === problem.protectedMeal.end) return true;
  return meals.some((meal) =>
    meal.spaceId === spaceId
    && meal.start === previousEnd
    && meal.end === nextOccupationStart);
}

function preparationWithinSpaceAvailability(
  problem: PlannerNextProblem,
  preparation: ScheduledRoundPreparation,
): boolean {
  const space = problem.spaces.find(({ id }) => id === preparation.spaceId);
  return Boolean(space?.availability.some(({ start, end }) =>
    start <= preparation.start && preparation.end <= end));
}

export interface RoundSynchronizationValidation {
  synchronizationViolationCount: number;
  preparationViolationCount: number;
}

export function validateRoundSynchronizations(
  problem: PlannerNextProblem,
  scheduled: ScheduledTask[],
  preparations: ScheduledRoundPreparation[],
  meals: ScheduledSpaceMeal[] = [],
): RoundSynchronizationValidation {
  let synchronizationViolationCount = 0;
  let preparationViolationCount = 0;
  const scheduledById = new Map<string, ScheduledTask[]>();
  for (const task of scheduled) {
    scheduledById.set(task.id, [...(scheduledById.get(task.id) ?? []), task]);
  }
  const expectedPreparationIds = new Set<string>();

  for (const policy of [...(problem.roundSynchronizations ?? [])]
    .sort((left, right) => compare(left.id, right.id))) {
    const laneSchedules = policy.lanes.map((lane) => {
      const tasks: ScheduledTask[] = [];
      for (const taskId of lane.taskIds) {
        const matches = scheduledById.get(taskId) ?? [];
        if (matches.length !== 1) {
          synchronizationViolationCount += 1;
          continue;
        }
        tasks.push(matches[0]!);
      }
      return {
        lane,
        tasks: tasks.sort((left, right) =>
          left.start - right.start || compare(left.id, right.id)),
      };
    });

    const synchronizedRoundCount = Math.min(
      ...laneSchedules.map(({ tasks }) => tasks.length),
    );
    for (let index = 0; index < synchronizedRoundCount; index += 1) {
      const reference = laneSchedules[0]!.tasks[index]!;
      for (const { tasks } of laneSchedules.slice(1)) {
        const candidate = tasks[index]!;
        if (candidate.start !== reference.start || candidate.end !== reference.end) {
          synchronizationViolationCount += 1;
        }
      }
    }

    for (const { lane, tasks } of laneSchedules) {
      for (let index = 1; index < tasks.length; index += 1) {
        const previous = tasks[index - 1]!;
        const current = tasks[index]!;
        const roundIndex = index + 1;
        const expectedId = roundPreparationId(policy.id, lane.spaceId, roundIndex);
        const prepMinutes = lane.preparationMinutesBetweenRounds;
        if (prepMinutes === 0) {
          if (!gapIsAuthorized(problem, lane.spaceId, previous.end, current.start, meals)) {
            preparationViolationCount += 1;
          }
          continue;
        }

        expectedPreparationIds.add(expectedId);
        const matches = preparations.filter(({ id }) => id === expectedId);
        const preparation = matches[0];
        const sameSpaceTasks = scheduled.filter(({ spaceId }) => spaceId === lane.spaceId);
        const overlapsTask = preparation
          ? sameSpaceTasks.some((task) =>
            task.id !== previous.id
            && task.id !== current.id
            && overlaps(preparation.start, preparation.end, task.start, task.end))
          : true;
        const overlapsMeal = preparation
          ? meals.some((meal) =>
            meal.spaceId === lane.spaceId
            && overlaps(preparation.start, preparation.end, meal.start, meal.end))
          : true;
        const overlapsProtectedMeal = preparation
          ? overlaps(
            preparation.start,
            preparation.end,
            problem.protectedMeal.start,
            problem.protectedMeal.end,
          )
          : true;
        const invalid = matches.length !== 1
          || !preparation
          || preparation.kind !== "round-preparation"
          || preparation.synchronizationId !== policy.id
          || preparation.spaceId !== lane.spaceId
          || preparation.roundIndex !== roundIndex
          || preparation.duration !== prepMinutes
          || preparation.end - preparation.start !== prepMinutes
          || preparation.end !== current.start
          || !gapIsAuthorized(problem, lane.spaceId, previous.end, preparation.start, meals)
          || preparation.start < problem.day.start
          || preparation.end > problem.day.end
          || !preparationWithinSpaceAvailability(problem, preparation)
          || overlapsTask
          || overlapsMeal
          || overlapsProtectedMeal;
        if (invalid) preparationViolationCount += 1;
      }
    }
  }

  for (const preparation of preparations) {
    if (!expectedPreparationIds.has(preparation.id)) preparationViolationCount += 1;
  }

  return { synchronizationViolationCount, preparationViolationCount };
}
