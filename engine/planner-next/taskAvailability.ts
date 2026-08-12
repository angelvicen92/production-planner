import type { PlannerNextProblem, Task, Window } from "./contracts";
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES } from "./integration/plannerNextCapabilities";

export function validateTaskAvailability(task: Task, day: Window): boolean {
  if (task.availability === undefined) return true;
  if (!Array.isArray(task.availability)) return false;
  return task.availability.every((window) => window !== null
    && Number.isInteger(window?.start) && Number.isInteger(window?.end)
    && window.start < window.end && window.start >= day.start && window.end <= day.end);
}

export function canonicalTaskAvailability(task: Task, day: Window): Window[] | undefined {
  if (task.availability === undefined) return undefined;
  if (!validateTaskAvailability(task, day)) return [];
  return task.availability.map(({ start, end }) => ({ start, end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

export function taskFitsAvailability(task: Task, start: number, end: number): boolean {
  return task.availability === undefined
    || task.availability.some((window) => window.start <= start && end <= window.end);
}

/**
 * Returns the day-grid starts that satisfy every static availability authority.
 * Dynamic conflicts and other placement rules deliberately remain in canPlaceTask.
 */
export function staticTaskStartDomain(problem: PlannerNextProblem, task: Task): number[] {
  const participant = task.kind === "technical"
    ? undefined
    : problem.participants.find(({ id }) => id === task.participantId);
  const coach = task.coachId === undefined ? undefined : problem.coaches.find(({ id }) => id === task.coachId);
  const space = problem.spaces.find(({ id }) => id === task.spaceId);
  const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((resource) => resource.id === id));
  const unit = task.itinerantUnitId === undefined
    ? undefined
    : problem.itinerantUnits?.find(({ id }) => id === task.itinerantUnitId);
  if ((task.kind !== "technical" && !participant) || !space || (task.coachId !== undefined && !coach)
    || resources.some((resource) => !resource) || (task.itinerantUnitId !== undefined && !unit)) return [];

  const authorities: readonly (readonly Window[])[] = [
    [problem.day],
    ...(task.availability === undefined ? [] : [canonicalTaskAvailability(task, problem.day) ?? []]),
    ...(participant ? [participant.availability] : []),
    ...(coach ? [coach.availability] : []),
    space.availability,
    ...resources.map((resource) => resource!.availability),
    ...(unit ? [unit.availability] : []),
  ];
  const starts: number[] = [];
  for (let start = problem.day.start; start + task.duration <= problem.day.end;
    start += PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES) {
    const end = start + task.duration;
    if (authorities.every((windows) => windows.some((window) => window.start <= start && end <= window.end))) starts.push(start);
  }
  return starts;
}
