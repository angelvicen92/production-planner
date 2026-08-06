import type { PlannerNextProblem, Task } from "./contracts";
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES } from "./integration/plannerNextCapabilities";

export const INVALID_COACH_ROUTE_TRANSITION =
  "INVALID_COACH_ROUTE_TRANSITION";

export function coachRouteTransitionPreflightReasons(
  problem: PlannerNextProblem,
): string[] {
  const value = (problem as unknown as Record<string, unknown>)
    .coachRouteTransitions;
  const present = Object.prototype.hasOwnProperty.call(
    problem as unknown as Record<string, unknown>,
    "coachRouteTransitions",
  );

  if (present && value !== undefined && !Array.isArray(value)) {
    return [INVALID_COACH_ROUTE_TRANSITION];
  }

  const coachIds = new Set(problem.coaches.map(({ id }) => id));
  const spaceIds = new Set(problem.spaces.map(({ id }) => id));
  const keys = new Set<string>();

  for (const raw of Array.isArray(value) ? value : []) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return [INVALID_COACH_ROUTE_TRANSITION];
    }

    const route = raw as Record<string, unknown>;
    const coachId = route.coachId;
    const fromSpaceId = route.fromSpaceId;
    const toSpaceId = route.toSpaceId;
    const minutes = route.minutes;
    const key =
      `${String(coachId)}\0${String(fromSpaceId)}\0${String(toSpaceId)}`;

    const valid =
      typeof coachId === "string"
      && coachIds.has(coachId)
      && typeof fromSpaceId === "string"
      && spaceIds.has(fromSpaceId)
      && typeof toSpaceId === "string"
      && spaceIds.has(toSpaceId)
      && fromSpaceId !== toSpaceId
      && typeof minutes === "number"
      && Number.isInteger(minutes)
      && minutes > 0
      && minutes % PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES === 0
      && !keys.has(key);

    if (!valid) return [INVALID_COACH_ROUTE_TRANSITION];
    keys.add(key);
  }

  return [];
}

export function effectiveCoachTransitionMinutes(
  problem: PlannerNextProblem,
  coachId: string,
  fromSpaceId: string,
  toSpaceId: string,
): number {
  if (fromSpaceId === toSpaceId) return 0;

  return problem.coachRouteTransitions?.find(
    (route) =>
      route.coachId === coachId
      && route.fromSpaceId === fromSpaceId
      && route.toSpaceId === toSpaceId,
  )?.minutes ?? problem.resourceTransitionMinutes;
}

export function latestFeederEndBeforeMain(
  problem: PlannerNextProblem,
  feeder: Task,
  mainSpaceId: string,
  mainStart: number,
  firstParticipantObligation: number,
): number {
  const participantDeadline =
    firstParticipantObligation
    - problem.participantTransitionMinutes;

  const coachDeadline = feeder.coachId === undefined
    ? Number.POSITIVE_INFINITY
    : mainStart - effectiveCoachTransitionMinutes(
      problem,
      feeder.coachId,
      feeder.spaceId,
      mainSpaceId,
    );

  return Math.min(participantDeadline, coachDeadline);
}
