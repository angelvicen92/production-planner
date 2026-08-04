import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { contains, overlaps } from "./time";
import { occupationAvoidsProtectedMeal } from "./spaceMeals";
import { taskFitsAvailability } from "./taskAvailability";

/** Resolves the resource-specific margin without mutation or throwing for an unknown id. */
export function effectiveResourceTransitionMinutes(problem: PlannerNextProblem, resourceId: string): number {
  return problem.resources.find(({ id }) => id === resourceId)?.transitionMinutes
    ?? problem.resourceTransitionMinutes;
}

export function taskAvoidsItinerantUnitMeals(problem:PlannerNextProblem,task:Task,start:number,end:number):boolean {
  return !task.itinerantUnitId||(problem.itinerantUnitMeals??[]).every(meal=>meal.itinerantUnitId!==task.itinerantUnitId||!overlaps(meal.interval,{start,end}));
}

/** The single hard-placement predicate used by every Planner Next phase. */
export function canPlaceTask(problem: PlannerNextProblem, task: Task, start: number, placed: ScheduledTask[], scheduledSpaceMeals:ScheduledSpaceMeal[]=[]): boolean {
  const end = start + task.duration;
  const participant = problem.participants.find((x) => x.id === task.participantId);
  const coach = task.coachId === undefined ? undefined : problem.coaches.find((x) => x.id === task.coachId);
  const space = problem.spaces.find((x) => x.id === task.spaceId);
  const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((x) => x.id === id));
  if ((task.kind !== "technical" && !participant) || !space || (task.coachId !== undefined && !coach) || !taskFitsAvailability(task,start,end)||!taskAvoidsItinerantUnitMeals(problem,task,start,end)) return false;
  if (start < problem.day.start || end > problem.day.end || !occupationAvoidsProtectedMeal(problem,task.spaceId,start,end)
    || (participant && !contains(participant.availability, start, end)) || (coach && !contains(coach.availability, start, end))
    || !contains(space.availability, start, end) || resources.some((x) => !x || !contains(x.availability, start, end))) return false;
  if(scheduledSpaceMeals.some(meal=>meal.spaceId===task.spaceId&&overlaps(meal,{start,end})))return false;
  return !placed.some((other) => {
    const sharedParticipant = other.participantId !== undefined && task.participantId !== undefined && other.participantId === task.participantId;
    const sharedCoach = task.coachId !== undefined && other.coachId === task.coachId;
    const sharedResources = (task.requiredResourceIds ?? []).filter((id) => (other.requiredResourceIds ?? []).includes(id));
    const sharedResource = sharedResources.length > 0;
    if (overlaps(other, { start, end }) && (sharedParticipant || sharedCoach || sharedResource || other.spaceId === task.spaceId)) return true;
    if (other.spaceId === task.spaceId) return false;
    const margin = Math.max(sharedParticipant ? problem.participantTransitionMinutes : 0,
      sharedCoach ? problem.resourceTransitionMinutes : 0,
      ...sharedResources.map((id) => effectiveResourceTransitionMinutes(problem, id)));
    return margin > 0 && ((other.end <= start && start - other.end < margin) || (end <= other.start && other.start - end < margin));
  });
}
