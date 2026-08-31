import { createHash } from "node:crypto";
import type {
  OperationalMealPolicy,
  PlannerNextProblem,
  ScheduledOperationalMeal,
  ScheduledTask,
  Window,
} from "./contracts";
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES } from "./integration/plannerNextCapabilities";
import { contains, overlaps } from "./time";

export interface OperationalMealWitness {
  readonly complete: boolean;
  readonly scheduled: readonly ScheduledOperationalMeal[];
  readonly candidateCountByPolicyId: Readonly<Record<string, number>>;
  readonly finalSelectionOrder: readonly string[];
  readonly blockingPolicyIds: readonly string[];
  readonly branchesExplored: number;
  readonly backtracks: number;
  readonly reasonCodes: readonly string[];
  readonly readOnly: true;
}

export interface OperationalMealSearchBudget {
  remaining: number;
  consume?: (count?: number) => boolean;
}

export type OperationalMealAssessmentMode = "PROBE" | "MATERIALIZE";

export interface OperationalMealProbe {
  readonly feasible: boolean;
  readonly affectedPoliciesChecked: number;
  readonly analyticDomainBuilds: number;
  readonly logicalGridStarts: number;
  readonly analyticallyEliminatedStarts: number;
  readonly actuallyEvaluatedStarts: 0;
  readonly zeroDomainPrunes: number;
  readonly blockingPolicyIds: readonly string[];
  readonly candidateCountByPolicyId: Readonly<Record<string, number>>;
  readonly logicalStartCountByPolicyId: Readonly<Record<string, number>>;
  readonly reasonCodes: readonly string[];
  readonly readOnly: true;
}

/** An occupation which is present in every completion of a relaxed search branch. */
export interface InevitableOperationalMealOccupation extends Window {
  readonly resourceIds: readonly string[];
  readonly spaceIds: readonly string[];
}

const byIdentity = (left: OperationalMealPolicy, right: OperationalMealPolicy): number =>
  left.id.localeCompare(right.id, "en");

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(freeze);
  }
  return value;
};

function scopedResourceIds(task: ScheduledTask): readonly string[] {
  return task.coachId === undefined
    ? task.requiredResourceIds ?? []
    : [...(task.requiredResourceIds ?? []), task.coachId];
}

function taskConflictsWithPolicy(task: ScheduledTask, policy: OperationalMealPolicy): boolean {
  return policy.spaceIds.includes(task.spaceId)
    || scopedResourceIds(task).some((id) => policy.resourceIds.includes(id));
}

function occupationConflictsWithPolicy(
  occupation: InevitableOperationalMealOccupation,
  policy: OperationalMealPolicy,
): boolean {
  return occupation.spaceIds.some((id) => policy.spaceIds.includes(id))
    || occupation.resourceIds.some((id) => policy.resourceIds.includes(id));
}

function mealScopesOverlap(left: ScheduledOperationalMeal, right: ScheduledOperationalMeal): boolean {
  return left.resourceIds.some((id) => right.resourceIds.includes(id))
    || left.spaceIds.some((id) => right.spaceIds.includes(id));
}

function scopeAvailable(problem: PlannerNextProblem, policy: OperationalMealPolicy, start: number, end: number): boolean {
  const resourcesAvailable = policy.resourceIds.every((id) => {
    const resource = problem.resources.find((candidate) => candidate.id === id);
    if (resource) return contains(resource.availability, start, end);
    const coach = problem.coaches.find((candidate) => candidate.id === id);
    return coach !== undefined && contains(coach.availability, start, end);
  });
  const spacesAvailable = policy.spaceIds.every((id) => {
    const space = problem.spaces.find((candidate) => candidate.id === id);
    return space !== undefined && contains(space.availability, start, end);
  });
  return resourcesAvailable && spacesAvailable;
}

const GRID = PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES;
type Interval = { start: number; end: number };
const firstGridAtOrAfter = (base: number, minute: number): number => base + Math.ceil((minute - base) / GRID) * GRID;
const lastGridAtOrBefore = (base: number, minute: number): number => base + Math.floor((minute - base) / GRID) * GRID;
const gridCount = (first: number, last: number): number => last < first ? 0 : Math.floor((last - first) / GRID) + 1;
const canonicalIntervals = (intervals: readonly Window[]): Interval[] => {
  const result: Interval[] = [];
  for (const interval of [...intervals].filter(({ start, end }) => start < end).sort((a, b) => a.start - b.start || a.end - b.end)) {
    const previous = result.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else result.push({ start: interval.start, end: interval.end });
  }
  return result;
};
const intersectIntervals = (left: readonly Interval[], right: readonly Window[]): Interval[] => {
  const intersections: Interval[] = [];
  for (const a of left) for (const b of canonicalIntervals(right)) {
    const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
    if (start < end) intersections.push({ start, end });
  }
  return canonicalIntervals(intersections);
};
const subtractInterval = (free: readonly Interval[], occupied: Window): Interval[] => free.flatMap((interval) => {
  if (occupied.end <= interval.start || interval.end <= occupied.start) return [interval];
  const result: Interval[] = [];
  if (interval.start < occupied.start) result.push({ start: interval.start, end: occupied.start });
  if (occupied.end < interval.end) result.push({ start: occupied.end, end: interval.end });
  return result;
});

/** Sound interval-only zero-domain probe. It deliberately ignores competition between policies. */
export function probeOperationalMealFutureFeasibility(
  problem: PlannerNextProblem,
  tasks: readonly ScheduledTask[],
  addedTasks?: readonly ScheduledTask[],
): OperationalMealProbe {
  return probeOperationalMealFeasibilityWithInevitableOccupations(problem, tasks, [], addedTasks);
}

/**
 * The same interval authority as the exact-task probe, extended with occupations that a
 * caller has proved invariant across all alternatives represented by its relaxed branch.
 */
export function probeOperationalMealFeasibilityWithInevitableOccupations(
  problem: PlannerNextProblem,
  tasks: readonly ScheduledTask[],
  inevitableOccupations: readonly InevitableOperationalMealOccupation[],
  addedTasks?: readonly ScheduledTask[],
): OperationalMealProbe {
  const policies = [...(problem.operationalMealPolicies ?? [])].sort(byIdentity);
  const affected = addedTasks === undefined && inevitableOccupations.length === 0 ? policies : policies.filter((policy) =>
    (addedTasks?.some((task) => taskConflictsWithPolicy(task, policy)) ?? false)
      || inevitableOccupations.some((occupation) => occupationConflictsWithPolicy(occupation, policy)));
  let logicalGridStarts = 0, validStarts = 0;
  const counts: Record<string, number> = {};
  const logicalCounts: Record<string, number> = {};
  const blockers: string[] = [];
  for (const policy of affected) {
    const logical = gridCount(policy.window.start, lastGridAtOrBefore(policy.window.start, policy.window.end - policy.duration));
    logicalCounts[policy.id] = logical;
    logicalGridStarts += logical;
    let free: Interval[] = canonicalIntervals([policy.window]);
    for (const id of [...policy.resourceIds].sort()) {
      const availability = problem.resources.find((resource) => resource.id === id)?.availability
        ?? problem.coaches.find((coach) => coach.id === id)?.availability ?? [];
      free = intersectIntervals(free, availability);
    }
    for (const id of [...policy.spaceIds].sort()) {
      free = intersectIntervals(free, problem.spaces.find((space) => space.id === id)?.availability ?? []);
    }
    for (const task of [...tasks].filter((candidate) => taskConflictsWithPolicy(candidate, policy))
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))) {
      free = subtractInterval(free, task);
    }
    for (const occupation of inevitableOccupations.filter((candidate) => occupationConflictsWithPolicy(candidate, policy))
      .sort((a, b) => a.start - b.start || a.end - b.end)) {
      free = subtractInterval(free, occupation);
    }
    const count = free.reduce((sum, interval) => {
      const first = firstGridAtOrAfter(policy.window.start, interval.start);
      const last = lastGridAtOrBefore(policy.window.start, interval.end - policy.duration);
      return sum + gridCount(first, last);
    }, 0);
    counts[policy.id] = count;
    validStarts += count;
    if (count === 0) blockers.push(policy.id);
  }
  return freeze({
    feasible: blockers.length === 0,
    affectedPoliciesChecked: affected.length,
    analyticDomainBuilds: affected.length,
    logicalGridStarts,
    analyticallyEliminatedStarts: logicalGridStarts - validStarts,
    actuallyEvaluatedStarts: 0,
    zeroDomainPrunes: blockers.length > 0 ? 1 : 0,
    blockingPolicyIds: blockers,
    candidateCountByPolicyId: counts,
    logicalStartCountByPolicyId: logicalCounts,
    reasonCodes: blockers.length > 0 ? ["OPERATIONAL_MEAL_ZERO_DOMAIN"] : [],
    readOnly: true,
  });
}

export function operationalMealCandidates(
  problem: PlannerNextProblem,
  policy: OperationalMealPolicy,
  tasks: readonly ScheduledTask[],
  placed: readonly ScheduledOperationalMeal[],
): ScheduledOperationalMeal[] {
  const candidates: ScheduledOperationalMeal[] = [];
  for (
    let start = policy.window.start;
    start + policy.duration <= policy.window.end;
    start += PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES
  ) {
    const end = start + policy.duration;
    if (!scopeAvailable(problem, policy, start, end)) continue;
    const candidate: ScheduledOperationalMeal = {
      id: policy.id,
      resourceIds: [...policy.resourceIds],
      spaceIds: [...policy.spaceIds],
      duration: policy.duration,
      start,
      end,
    };
    if (tasks.some((task) => taskConflictsWithPolicy(task, policy) && overlaps(task, candidate))) continue;
    if (placed.some((meal) => mealScopesOverlap(meal, candidate) && overlaps(meal, candidate))) continue;
    candidates.push(candidate);
  }
  return candidates.sort((left, right) => left.start - right.start || left.id.localeCompare(right.id, "en"));
}

export function operationalMealWitnessFingerprint(meals: readonly ScheduledOperationalMeal[]): string {
  const stable = [...meals]
    .sort((left, right) => left.id.localeCompare(right.id, "en"))
    .map(({ id, resourceIds, spaceIds, duration, start, end }) => ({
      id,
      resourceIds: [...resourceIds].sort(),
      spaceIds: [...spaceIds].sort(),
      duration,
      start,
      end,
    }));
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function assessOperationalMealFutureFeasibility(
  problem: PlannerNextProblem,
  tasks: readonly ScheduledTask[],
  budget: OperationalMealSearchBudget,
  mode: OperationalMealAssessmentMode,
): OperationalMealWitness {
  const policies = [...(problem.operationalMealPolicies ?? [])].sort(byIdentity);
  if (policies.length === 0) {
    return freeze({
      complete: true,
      scheduled: [],
      candidateCountByPolicyId: {},
      finalSelectionOrder: [],
      blockingPolicyIds: [],
      branchesExplored: 0,
      backtracks: 0,
      reasonCodes: [],
      readOnly: true,
    });
  }

  let branches = 0;
  let backtracks = 0;
  let exhausted = false;
  const counts: Record<string, number> = {};
  const blockers = new Set<string>();
  let acceptedOrder: string[] = [];

  const consume = (): boolean => {
    if (budget.remaining <= 0) {
      exhausted = true;
      return false;
    }
    if (budget.consume && !budget.consume(1)) {
      exhausted = true;
      return false;
    }
    budget.remaining -= 1;
    branches += 1;
    return true;
  };

  const search = (
    pending: OperationalMealPolicy[],
    placed: ScheduledOperationalMeal[],
    path: string[],
  ): ScheduledOperationalMeal[] | null => {
    if (pending.length === 0) {
      acceptedOrder = path;
      return placed;
    }
    const domains = pending
      .map((policy) => ({ policy, candidates: operationalMealCandidates(problem, policy, tasks, placed) }))
      .sort((left, right) => left.candidates.length - right.candidates.length || byIdentity(left.policy, right.policy));
    const selected = domains[0]!;
    counts[selected.policy.id] = selected.candidates.length;
    if (selected.candidates.length === 0) {
      blockers.add(selected.policy.id);
      backtracks += 1;
      return null;
    }
    const remaining = pending.filter((policy) => policy !== selected.policy);
    for (const candidate of selected.candidates) {
      if (!consume()) return null;
      const result = search(remaining, [...placed, candidate], [...path, selected.policy.id]);
      if (result) return result;
      backtracks += 1;
    }
    return null;
  };

  const scheduled = search(policies, [], []);
  if (!scheduled && !exhausted && blockers.size === 0) policies.forEach(({ id }) => blockers.add(id));
  return freeze({
    complete: scheduled !== null,
    scheduled: mode === "MATERIALIZE"
      ? [...(scheduled ?? [])].sort((left, right) => left.start - right.start || left.id.localeCompare(right.id, "en"))
      : [],
    candidateCountByPolicyId: counts,
    finalSelectionOrder: acceptedOrder,
    blockingPolicyIds: [...blockers].sort(),
    branchesExplored: branches,
    backtracks,
    reasonCodes: scheduled
      ? []
      : [exhausted ? "OPERATIONAL_MEAL_BRANCH_BUDGET_EXHAUSTED" : "OPERATIONAL_MEALS_JOINTLY_INFEASIBLE"],
    readOnly: true,
  });
}
