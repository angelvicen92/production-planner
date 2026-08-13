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
export type PlacementRejectionReason = "DAY_BOUNDS" | "TASK_AVAILABILITY" | "ITINERANT_UNIT_AVAILABILITY"
  | "ITINERANT_UNIT_MEAL" | "DEPENDENCY_TIMING" | "PROTECTED_MEAL" | "PARTICIPANT_AVAILABILITY"
  | "COACH_AVAILABILITY" | "SPACE_AVAILABILITY" | "REQUIRED_RESOURCE_AVAILABILITY"
  | "SCHEDULED_SPACE_MEAL" | "SCHEDULED_RESOURCE_MEAL" | "OVERLAP_PARTICIPANT" | "OVERLAP_COACH"
  | "OVERLAP_SPACE" | "OVERLAP_REQUIRED_RESOURCE" | "TRANSITION_PARTICIPANT" | "TRANSITION_COACH"
  | "TRANSITION_REQUIRED_RESOURCE" | "MISSING_AUTHORITY";

export interface PlacementDiagnostic { valid: boolean; firstRejectionReason: PlacementRejectionReason | null; blockingPlacedTaskId: string | null }

/** Read-only projection of the same ordered authorities used by canPlaceTask. */
export function diagnoseTaskPlacement(problem: PlannerNextProblem, task: Task, start: number, placed: ScheduledTask[], scheduledSpaceMeals:ScheduledSpaceMeal[]=[]): PlacementDiagnostic {
  const end = start + task.duration;
  const participant = problem.participants.find((x) => x.id === task.participantId);
  const coach = task.coachId === undefined ? undefined : problem.coaches.find((x) => x.id === task.coachId);
  const space = problem.spaces.find((x) => x.id === task.spaceId);
  const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((x) => x.id === id));
  const reject=(firstRejectionReason:PlacementRejectionReason,blockingPlacedTaskId:string|null=null):PlacementDiagnostic=>({valid:false,firstRejectionReason,blockingPlacedTaskId});
  if ((task.kind !== "technical" && !participant) || !space || (task.coachId !== undefined && !coach)) return reject("MISSING_AUTHORITY");
  if (!taskFitsAvailability(task,start,end)) return reject("TASK_AVAILABILITY");
  if (!taskFitsItinerantUnitAvailability(problem,task,start,end)) return reject("ITINERANT_UNIT_AVAILABILITY");
  if (!taskAvoidsItinerantUnitMeals(problem,task,start,end)) return reject("ITINERANT_UNIT_MEAL");
  if (!taskRespectsScheduledDependencies(task,start,placed)) return reject("DEPENDENCY_TIMING",placed.find(other=>(task.dependencies.includes(other.id)&&other.end>start)||(other.dependencies.includes(task.id)&&end>other.start))?.id??null);
  if (start < problem.day.start || end > problem.day.end) return reject("DAY_BOUNDS");
  if (!occupationAvoidsProtectedMeal(problem,task.spaceId,start,end)) return reject("PROTECTED_MEAL");
  if (participant && !contains(participant.availability,start,end)) return reject("PARTICIPANT_AVAILABILITY");
  if (coach && !contains(coach.availability,start,end)) return reject("COACH_AVAILABILITY");
  if (!contains(space.availability,start,end)) return reject("SPACE_AVAILABILITY");
  if (resources.some((x)=>!x||!contains(x.availability,start,end))) return reject("REQUIRED_RESOURCE_AVAILABILITY");
  if (scheduledSpaceMeals.some(meal=>meal.spaceId===task.spaceId&&overlaps(meal,{start,end}))) return reject("SCHEDULED_SPACE_MEAL");
  if (!taskAvoidsScheduledSpaceMealResources(problem,task,start,end,scheduledSpaceMeals)) return reject("SCHEDULED_RESOURCE_MEAL");
  for (const other of placed) {
    const sharedParticipant = other.participantId !== undefined
      && task.participantId !== undefined
      && other.participantId === task.participantId;
    const sharedCoach = task.coachId !== undefined
      && other.coachId === task.coachId;
    const sharedResources = (task.requiredResourceIds ?? [])
      .filter((id) => (other.requiredResourceIds ?? []).includes(id));
    const sharedResource = sharedResources.length > 0;

    if (overlaps(other,{start,end})) {
      if (sharedParticipant) return reject("OVERLAP_PARTICIPANT",other.id);
      if (sharedCoach) return reject("OVERLAP_COACH",other.id);
      if (other.spaceId===task.spaceId) return reject("OVERLAP_SPACE",other.id);
      if (sharedResource) return reject("OVERLAP_REQUIRED_RESOURCE",other.id);
    }
    if (other.spaceId === task.spaceId) continue;

    const afterOther = other.end <= start;
    const beforeOther = end <= other.start;
    if (!afterOther && !beforeOther) continue;

    const coachMargin = !sharedCoach || task.coachId === undefined
      ? 0
      : afterOther
        ? effectiveCoachTransitionMinutes(problem, task.coachId, other.spaceId, task.spaceId)
        : effectiveCoachTransitionMinutes(problem, task.coachId, task.spaceId, other.spaceId);

    const gap = afterOther ? start - other.end : other.start - end;
    if (sharedParticipant && gap < problem.participantTransitionMinutes) return reject("TRANSITION_PARTICIPANT",other.id);
    if (sharedCoach && gap < coachMargin) return reject("TRANSITION_COACH",other.id);
    if (sharedResources.some(id=>gap<effectiveResourceTransitionMinutes(problem,id))) return reject("TRANSITION_REQUIRED_RESOURCE",other.id);
  }
  return {valid:true,firstRejectionReason:null,blockingPlacedTaskId:null};
}

export function canPlaceTask(problem: PlannerNextProblem, task: Task, start: number, placed: ScheduledTask[], scheduledSpaceMeals:ScheduledSpaceMeal[]=[]): boolean {
  return diagnoseTaskPlacement(problem,task,start,placed,scheduledSpaceMeals).valid;
}
