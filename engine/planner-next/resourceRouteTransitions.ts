import type { PlannerNextProblem, Task } from "./contracts";
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES } from "./integration/plannerNextCapabilities";

export const INVALID_RESOURCE_ROUTE_TRANSITION = "INVALID_RESOURCE_ROUTE_TRANSITION";

/** Both public contracts address the same physical identity. Never choose between declarations. */
export function resourceRouteTransitionPreflightReasons(problem: PlannerNextProblem): string[] {
  const value: unknown = problem.resourceRouteTransitions;
  if (value !== undefined && !Array.isArray(value)) return [INVALID_RESOURCE_ROUTE_TRANSITION];
  if (value === undefined || value.length === 0) return [];
  const resources = new Set([...problem.resources, ...problem.coaches].map(r => r.id));
  const spaces = new Set(problem.spaces.map(s => s.id));
  const keys = new Set((Array.isArray(problem.coachRouteTransitions) ? problem.coachRouteTransitions : [])
    .filter(r => r && typeof r === "object")
    .map(r => `${r.coachId}\0${r.fromSpaceId}\0${r.toSpaceId}`));
  for (const route of value ?? []) {
    if (!route || typeof route !== "object" || Array.isArray(route)) return [INVALID_RESOURCE_ROUTE_TRANSITION];
    const {resourceId, fromSpaceId, toSpaceId, minutes} = route;
    const key = `${resourceId}\0${fromSpaceId}\0${toSpaceId}`;
    if (!resources.has(resourceId) || !spaces.has(fromSpaceId) || !spaces.has(toSpaceId)
      || fromSpaceId === toSpaceId || !Number.isInteger(minutes) || minutes <= 0
      || minutes % PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES !== 0 || keys.has(key)
      || Object.keys(route).some(k => !["resourceId", "fromSpaceId", "toSpaceId", "minutes"].includes(k)))
      return [INVALID_RESOURCE_ROUTE_TRANSITION];
    keys.add(key);
  }
  return [];
}

/** One resolver for coach, ordinary resources, domains, matching, validation and Evidence. */
export function effectiveResourceTransitionMinutes(problem: PlannerNextProblem, resourceId: string,
  fromSpaceId?: string, toSpaceId?: string): number {
  if (fromSpaceId !== undefined && fromSpaceId === toSpaceId) return 0;
  const route = problem.resourceRouteTransitions?.find(r => r.resourceId === resourceId
    && r.fromSpaceId === fromSpaceId && r.toSpaceId === toSpaceId);
  const historical = problem.coachRouteTransitions?.find(r => r.coachId === resourceId
    && r.fromSpaceId === fromSpaceId && r.toSpaceId === toSpaceId);
  if (route && historical) throw new Error(INVALID_RESOURCE_ROUTE_TRANSITION);
  return route?.minutes ?? historical?.minutes
    ?? problem.resources.find(r => r.id === resourceId)?.transitionMinutes ?? problem.resourceTransitionMinutes;
}

/** The dedicated coach channel already checks a shared coach once. Include cross-channel identities. */
export function sharedPhysicalResources(left: Task, right: Task): string[] {
  const rightIds = new Set([...(right.requiredResourceIds ?? []), ...(right.coachId ? [right.coachId] : [])]);
  return [...new Set([...(left.requiredResourceIds ?? []), ...(left.coachId ? [left.coachId] : [])])]
    .filter(id => rightIds.has(id) && !(id === left.coachId && id === right.coachId));
}
