import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { contains, overlaps } from "./time";
import { occupationAvoidsProtectedMeal } from "./spaceMeals";
import { taskFitsAvailability } from "./taskAvailability";
import { effectiveCoachTransitionMinutes } from "./coachRouteTransitions";

/** Resolves the resource-specific margin without mutation or throwing for an unknown id. */
export function effectiveResourceTransitionMinutes(problem: PlannerNextProblem, resourceId: string): number {
  return problem.resources.find(({ id }) => id === resourceId)?.transitionMinutes
    ?? problem.resourceTransitionMinutes;
}

export function taskAvoidsItinerantUnitMeals(problem:PlannerNextProblem,task:Task,start:number,end:number):boolean {
  return !task.itinerantUnitId||(problem.itinerantUnitMeals??[]).every(meal=>meal.itinerantUnitId!==task.itinerantUnitId||!overlaps(meal.interval,{start,end}));
}

export function taskFitsItinerantUnitAvailability(problem: PlannerNextProblem, task: Task, start: number, end: number): boolean {
  if (!task.itinerantUnitId) return true;
  const unit = problem.itinerantUnits?.find(({ id }) => id === task.itinerantUnitId);
  return Boolean(unit && contains(unit.availability, start, end));
}

export function taskAvoidsScheduledSpaceMealResources(problem: PlannerNextProblem, task: Task, start: number, end: number, meals: ScheduledSpaceMeal[]): boolean {
  const required = new Set(task.requiredResourceIds ?? []);
  if (required.size === 0) return true;
  return meals.every((meal) => {
    if (!overlaps(meal, { start, end })) return true;
    return !problem.resources.some((resource) => resource.assignedSpaceId === meal.spaceId && required.has(resource.id));
  });
}

/** Enforces every precedence relation whose opposite endpoint is already scheduled.
 * Search order is not temporal order, so predecessor and dependent checks are both required. */
export function taskRespectsScheduledDependencies(task: Task, start: number, placed: ScheduledTask[]): boolean {
  const end = start + task.duration;
  const placedById = new Map(placed.map((item) => [item.id, item]));
  for (const dependencyId of task.dependencies) {
    const dependency = placedById.get(dependencyId);
    if (dependency && dependency.end > start) return false;
  }
  for (const dependent of placed) {
    if (dependent.dependencies.includes(task.id) && end > dependent.start) return false;
  }
  return true;
}

/** The single hard-placement predicate used by every Planner Next phase. */
export function canPlaceTask(problem: PlannerNextProblem, task: Task, start: number, placed: ScheduledTask[], scheduledSpaceMeals:ScheduledSpaceMeal[]=[]): boolean {
  const end = start + task.duration;
  const participant = problem.participants.find((x) => x.id === task.participantId);
  const coach = task.coachId === undefined ? undefined : problem.coaches.find((x) => x.id === task.coachId);
  const space = problem.spaces.find((x) => x.id === task.spaceId);
  const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((x) => x.id === id));
  if ((task.kind !== "technical" && !participant) || !space || (task.coachId !== undefined && !coach) || !taskFitsAvailability(task,start,end)||!taskFitsItinerantUnitAvailability(problem,task,start,end)||!taskAvoidsItinerantUnitMeals(problem,task,start,end)||!taskRespectsScheduledDependencies(task,start,placed)) return false;
  if (start < problem.day.start || end > problem.day.end || !occupationAvoidsProtectedMeal(problem,task.spaceId,start,end)
    || (participant && !contains(participant.availability, start, end)) || (coach && !contains(coach.availability, start, end))
    || !contains(space.availability, start, end) || resources.some((x) => !x || !contains(x.availability, start, end))) return false;
  if(scheduledSpaceMeals.some(meal=>meal.spaceId===task.spaceId&&overlaps(meal,{start,end}))
    || !taskAvoidsScheduledSpaceMealResources(problem, task, start, end, scheduledSpaceMeals)) return false;
  return !placed.some((other) => {
    const sharedParticipant = other.participantId !== undefined
      && task.participantId !== undefined
      && other.participantId === task.participantId;
    const sharedCoach = task.coachId !== undefined
      && other.coachId === task.coachId;
    const sharedResources = (task.requiredResourceIds ?? [])
      .filter((id) => (other.requiredResourceIds ?? []).includes(id));
    const sharedResource = sharedResources.length > 0;

    if (overlaps(other, { start, end })
      && (sharedParticipant || sharedCoach || sharedResource || other.spaceId === task.spaceId)) return true;
    if (other.spaceId === task.spaceId) return false;

    const afterOther = other.end <= start;
    const beforeOther = end <= other.start;
    if (!afterOther && !beforeOther) return false;

    const coachMargin = !sharedCoach || task.coachId === undefined
      ? 0
      : afterOther
        ? effectiveCoachTransitionMinutes(problem, task.coachId, other.spaceId, task.spaceId)
        : effectiveCoachTransitionMinutes(problem, task.coachId, task.spaceId, other.spaceId);

    const margin = Math.max(
      sharedParticipant ? problem.participantTransitionMinutes : 0,
      coachMargin,
      ...sharedResources.map((id) => effectiveResourceTransitionMinutes(problem, id)),
    );
    const gap = afterOther ? start - other.end : other.start - end;
    return margin > 0 && gap < margin;
  });
}
