import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { contains, overlaps } from "./time";
import { occupationAvoidsProtectedMeal, protectedMealBlocksSpace } from "./spaceMeals";
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

export interface ExactTaskStartDomain {
  readonly intervals: ReadonlyArray<Readonly<{ start: number; end: number }>>;
  readonly eligibleStartCount: number;
  starts(): Generator<number, void, undefined>;
}

export type ExactStartInterval = { start: number; end: number };
export const intersectExactStartIntervals=(left:ExactStartInterval[],right:ExactStartInterval[]):ExactStartInterval[]=>left.flatMap(a=>right.flatMap(b=>{
  const start=Math.max(a.start,b.start),end=Math.min(a.end,b.end);return start<=end?[{start,end}]:[];
})).sort((a,b)=>a.start-b.start||a.end-b.end);
const windowExactStartIntervals=(windows:ReadonlyArray<Readonly<ExactStartInterval>>,duration:number):ExactStartInterval[]=>windows
  .filter(({start,end})=>start+duration<=end).map(({start,end})=>({start,end:end-duration}));
const subtractOccupation=(domain:ExactStartInterval[],blocked:ExactStartInterval,duration:number):ExactStartInterval[]=>domain.flatMap(interval=>{
  const result:ExactStartInterval[]=[];const beforeEnd=blocked.start-duration,afterStart=blocked.end;
  if(interval.start<=Math.min(interval.end,beforeEnd))result.push({start:interval.start,end:Math.min(interval.end,beforeEnd)});
  if(Math.max(interval.start,afterStart)<=interval.end)result.push({start:Math.max(interval.start,afterStart),end:interval.end});
  return result;
});
export const exactStartDomainFromIntervals=(problem:PlannerNextProblem,intervals:ExactStartInterval[]):ExactTaskStartDomain=>{
  const merged:ExactStartInterval[]=[];
  for(const interval of [...intervals].sort((a,b)=>a.start-b.start||a.end-b.end)){const previous=merged.at(-1);if(previous&&interval.start<=previous.end)previous.end=Math.max(previous.end,interval.end);else merged.push({...interval});}
  const first=(start:number)=>problem.day.start+Math.max(0,Math.ceil((start-problem.day.start)/5))*5;
  const eligibleStartCount=merged.reduce((sum,interval)=>{const value=first(interval.start);return sum+(value<=interval.end?Math.floor((interval.end-value)/5)+1:0)},0);
  return {intervals:merged,eligibleStartCount,*starts(){for(const interval of merged)for(let start=first(interval.start);start<=interval.end;start+=5)yield start;}};
};

/** Exact placed-independent projection of every static hard authority used by canPlaceTask. */
export function exactTaskStaticStartDomain(problem:PlannerNextProblem,task:Task,scheduledSpaceMeals:ScheduledSpaceMeal[]=[]):ExactTaskStartDomain {
  const participant=task.kind==="technical"?undefined:problem.participants.find(({id})=>id===task.participantId);
  const coach=task.coachId===undefined?undefined:problem.coaches.find(({id})=>id===task.coachId);
  const space=problem.spaces.find(({id})=>id===task.spaceId);
  const resources=(task.requiredResourceIds??[]).map(id=>problem.resources.find(resource=>resource.id===id));
  const unit=task.itinerantUnitId===undefined?undefined:problem.itinerantUnits?.find(({id})=>id===task.itinerantUnitId);
  if((task.kind!=="technical"&&!participant)||!space||(task.coachId!==undefined&&!coach)||resources.some(resource=>!resource)||(task.itinerantUnitId!==undefined&&!unit))return exactStartDomainFromIntervals(problem,[]);
  let domain:ExactStartInterval[]=[{start:problem.day.start,end:problem.day.end-task.duration}];
  const authorities=[task.availability,participant?.availability,coach?.availability,space.availability,...resources.map(resource=>resource!.availability),unit?.availability]
    .filter((windows):windows is Array<{start:number;end:number}>=>windows!==undefined);
  for(const windows of authorities)domain=intersectExactStartIntervals(domain,windowExactStartIntervals(windows,task.duration));
  const blocked=[...(problem.protectedMeal&&protectedMealBlocksSpace(problem,task.spaceId)?[problem.protectedMeal]:[]),
    ...(problem.itinerantUnitMeals??[]).filter(meal=>meal.itinerantUnitId===task.itinerantUnitId).map(({interval})=>interval),
    ...scheduledSpaceMeals.filter(meal=>meal.spaceId===task.spaceId||resources.some(resource=>resource!.assignedSpaceId===meal.spaceId))];
  for(const interval of blocked)domain=subtractOccupation(domain,interval,task.duration);
  return exactStartDomainFromIntervals(problem,domain);
}

/** Exact projection of materialized dependencies, occupations and transitions. */
export function exactTaskDynamicStartDomain(problem:PlannerNextProblem,task:Task,placed:ScheduledTask[],staticDomain:ExactTaskStartDomain):ExactTaskStartDomain {
  let domain=staticDomain.intervals.map(interval=>({...interval}));
  for(const other of placed){
    if(task.dependencies.includes(other.id))domain=intersectExactStartIntervals(domain,[{start:other.end,end:Number.POSITIVE_INFINITY}]);
    if(other.dependencies.includes(task.id))domain=intersectExactStartIntervals(domain,[{start:Number.NEGATIVE_INFINITY,end:other.start-task.duration}]);
    const sharedParticipant=task.participantId!==undefined&&other.participantId===task.participantId;
    const sharedCoach=task.coachId!==undefined&&other.coachId===task.coachId;
    const sharedResources=(task.requiredResourceIds??[]).filter(id=>(other.requiredResourceIds??[]).includes(id));
    const sharedSpace=task.spaceId===other.spaceId;
    if(!sharedParticipant&&!sharedCoach&&!sharedSpace&&sharedResources.length===0)continue;
    let before=0,after=0;
    if(!sharedSpace){
      if(sharedParticipant)before=after=problem.participantTransitionMinutes;
      if(sharedCoach&&task.coachId!==undefined){before=Math.max(before,effectiveCoachTransitionMinutes(problem,task.coachId,task.spaceId,other.spaceId));after=Math.max(after,effectiveCoachTransitionMinutes(problem,task.coachId,other.spaceId,task.spaceId));}
      for(const id of sharedResources)before=after=Math.max(before,after,effectiveResourceTransitionMinutes(problem,id));
    }
    domain=subtractOccupation(domain,{start:other.start-before,end:other.end+after},task.duration);
  }
  return exactStartDomainFromIntervals(problem,domain);
}

/** Exact interval projection of every hard authority used by canPlaceTask. It never scans the time grid. */
export function exactTaskStartDomain(problem:PlannerNextProblem,task:Task,placed:ScheduledTask[],scheduledSpaceMeals:ScheduledSpaceMeal[]=[]):ExactTaskStartDomain {
  return exactTaskDynamicStartDomain(problem,task,placed,exactTaskStaticStartDomain(problem,task,scheduledSpaceMeals));
}

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
