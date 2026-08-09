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

function transportDirection(problem: PlannerNextProblem, taskId: string): "arrival" | "departure" | undefined {
  if (problem.transportPolicy?.arrival.taskIds.includes(taskId)) return "arrival";
  if (problem.transportPolicy?.departure.taskIds.includes(taskId)) return "departure";
  return undefined;
}

/** IN is the first participant obligation and OUT is the last, independently of explicit dependency edges. */
function respectsTransportBoundary(problem: PlannerNextProblem, task: Task, start: number, end: number, placed: ScheduledTask[]): boolean {
  if (task.participantId === undefined || problem.transportPolicy === undefined) return true;
  const direction = transportDirection(problem, task.id);
  return placed.every((other) => {
    if (other.participantId !== task.participantId || other.id === task.id) return true;
    const otherDirection = transportDirection(problem, other.id);
    if (direction === "arrival") return end <= other.start;
    if (direction === "departure") return other.end <= start;
    if (otherDirection === "arrival") return other.end <= start;
    if (otherDirection === "departure") return end <= other.start;
    return true;
  });
}

/** The single hard-placement predicate used by every Planner Next phase. */
export function canPlaceTask(problem: PlannerNextProblem, task: Task, start: number, placed: ScheduledTask[], scheduledSpaceMeals:ScheduledSpaceMeal[]=[]): boolean {
  const end = start + task.duration;
  const participant = problem.participants.find((x) => x.id === task.participantId);
  const coach = task.coachId === undefined ? undefined : problem.coaches.find((x) => x.id === task.coachId);
  const space = problem.spaces.find((x) => x.id === task.spaceId);
  const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((x) => x.id === id));
  if ((task.kind !== "technical" && !participant) || !space || (task.coachId !== undefined && !coach) || !taskFitsAvailability(task,start,end)||!taskAvoidsItinerantUnitMeals(problem,task,start,end)||!respectsTransportBoundary(problem,task,start,end,placed)) return false;
  if (start < problem.day.start || end > problem.day.end || !occupationAvoidsProtectedMeal(problem,task.spaceId,start,end)
    || (participant && !contains(participant.availability, start, end)) || (coach && !contains(coach.availability, start, end))
    || !contains(space.availability, start, end) || resources.some((x) => !x || !contains(x.availability, start, end))) return false;
  if(scheduledSpaceMeals.some(meal=>meal.spaceId===task.spaceId&&overlaps(meal,{start,end})))return false;
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
