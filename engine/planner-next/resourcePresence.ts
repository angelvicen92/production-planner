import type { PlannerNextProblem, PreferenceLevel, Resource, ScheduledSpaceMeal, ScheduledTask } from "./contracts";
import { effectiveResourceTransitionMinutes } from "./placement";

/** Small fixed weights keep NEXT-003 explicit; callers cannot supply arbitrary numeric weights. */
const PRESENCE_WEIGHTS: Record<PreferenceLevel, number> = {
  OFF: 0, LOW: 1, MEDIUM: 2, HIGH: 4, MAXIMUM: 8,
};

export function presencePreferenceWeight(level: PreferenceLevel): number {
  return PRESENCE_WEIGHTS[level];
}

export function resourceRouteMetrics(problem: PlannerNextProblem, tasks: ScheduledTask[]): {
  moveCountById: Record<string, number>;
  transitionSlackMinutesById: Record<string, number>;
} {
  const moveCountById: Record<string, number> = {};
  const transitionSlackMinutesById: Record<string, number> = {};
  for (const resource of [...problem.resources].sort((a, b) => a.id.localeCompare(b.id))) {
    const own = tasks.filter((task) => (task.requiredResourceIds ?? []).includes(resource.id))
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
    let moves = 0, slack = 0;
    for (let index = 1; index < own.length; index += 1) {
      const previous = own[index - 1], current = own[index];
      if (!previous || !current || previous.spaceId === current.spaceId) continue;
      moves += 1;
      slack += Math.max(0, current.start - previous.end - effectiveResourceTransitionMinutes(problem, resource.id));
    }
    moveCountById[resource.id] = moves;
    transitionSlackMinutesById[resource.id] = slack;
  }
  return { moveCountById, transitionSlackMinutesById };
}

export interface ContinuousResourcePresence {
  presenceStart: number | null;
  presenceEnd: number | null;
  presenceSpanMinutes: number;
  productiveTaskMinutes: number;
  authorizedMealMinutes: number;
  internalGapMinutes: number;
  operationalBlockCount: number;
  preferredLexicographicTuple: [number, number, number];
}

interface Interval { id: string; start: number; end: number }

function union(intervals: Interval[]): Interval[] {
  const ordered = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  const merged: Interval[] = [];
  for (const interval of ordered) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) merged.push({ ...interval });
    else previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

export function evaluateResourcePresence(
  resource: Resource,
  tasks: ScheduledTask[],
  scheduledSpaceMeals: ScheduledSpaceMeal[] = [],
): ContinuousResourcePresence {
  const own = tasks
    .filter((task) => (task.requiredResourceIds ?? []).includes(resource.id))
    .map(({ id, start, end }) => ({ id, start, end }));
  const taskUnion = union(own);
  if (taskUnion.length === 0) return {
    presenceStart: null, presenceEnd: null, presenceSpanMinutes: 0, productiveTaskMinutes: 0,
    authorizedMealMinutes: 0, internalGapMinutes: 0, operationalBlockCount: 0,
    preferredLexicographicTuple: [0, 0, 0],
  };
  const presenceStart = taskUnion[0]!.start;
  const presenceEnd = taskUnion.at(-1)!.end;
  const authorizedMeals = resource.assignedSpaceId === undefined ? [] : scheduledSpaceMeals
    .filter((meal) => meal.spaceId === resource.assignedSpaceId
      && own.some((task) => task.end <= meal.start)
      && own.some((task) => task.start >= meal.end))
    .map((meal) => ({ id: meal.id, start: Math.max(meal.start, presenceStart), end: Math.min(meal.end, presenceEnd) }))
    .filter((meal) => meal.start < meal.end);
  const mealUnion = union(authorizedMeals);
  const occupations = union([...taskUnion, ...mealUnion]);
  const productiveTaskMinutes = taskUnion.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  const authorizedMealMinutes = mealUnion.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  const presenceSpanMinutes = presenceEnd - presenceStart;
  const internalGapMinutes = presenceSpanMinutes - union([...taskUnion, ...mealUnion])
    .reduce((sum, interval) => sum + interval.end - interval.start, 0);
  const operationalBlockCount = occupations.length;
  return {
    presenceStart, presenceEnd, presenceSpanMinutes, productiveTaskMinutes, authorizedMealMinutes,
    internalGapMinutes, operationalBlockCount,
    preferredLexicographicTuple: [operationalBlockCount, presenceSpanMinutes, internalGapMinutes],
  };
}

export function resourcePresenceMetrics(resources: Resource[], tasks: ScheduledTask[], scheduledSpaceMeals: ScheduledSpaceMeal[] = []): {
  presenceMinutesById: Record<string, number>;
  internalGapMinutesById: Record<string, number>;
  operationalBlockCountById: Record<string, number>;
  authorizedMealMinutesById: Record<string, number>;
} {
  const presenceMinutesById: Record<string, number> = {};
  const internalGapMinutesById: Record<string, number> = {};
  const operationalBlockCountById: Record<string, number> = {};
  const authorizedMealMinutesById: Record<string, number> = {};
  for (const resource of [...resources].sort((a, b) => a.id.localeCompare(b.id))) {
    const result = evaluateResourcePresence(resource, tasks, scheduledSpaceMeals);
    presenceMinutesById[resource.id] = result.presenceSpanMinutes;
    internalGapMinutesById[resource.id] = result.internalGapMinutes;
    operationalBlockCountById[resource.id] = result.operationalBlockCount;
    authorizedMealMinutesById[resource.id] = result.authorizedMealMinutes;
  }
  return { presenceMinutesById, internalGapMinutesById, operationalBlockCountById, authorizedMealMinutesById };
}

export function resourcePresenceIncrement(resourceId: string, before: ScheduledTask[], added: ScheduledTask): number {
  const relevant = before.filter((task) => (task.requiredResourceIds ?? []).includes(resourceId));
  const span = (items: ScheduledTask[]) => items.length === 0 ? 0
    : Math.max(...items.map(({ end }) => end)) - Math.min(...items.map(({ start }) => start));
  return span([...relevant, added]) - span(relevant);
}
