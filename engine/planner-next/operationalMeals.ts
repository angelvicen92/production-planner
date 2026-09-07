import { createHash } from "node:crypto";
import type {
  OperationalMealPolicy,
  PlannerNextProblem,
  ScheduledOperationalMeal,
  ScheduledTask,
  Window,
} from "./contracts";
import { contains, overlaps } from "./time";
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES } from "./integration/plannerNextCapabilities";

export interface OperationalMealReservation {
  readonly policyId: string;
  readonly feasibleIntervals: readonly Window[];
  readonly witnessInterval: Window;
}

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

export interface OperationalMealFuturePruneProof {
  readonly policyId: string;
  readonly requiredDuration: number;
  readonly window: Window;
  readonly cause: "NO_VALID_OPERATIONAL_MEAL_INTERVAL";
  readonly longestRemainingFreeIntervalBefore?: number;
  readonly longestRemainingFreeIntervalAfter: number;
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

export function taskConflictsWithOperationalMealPolicy(task: ScheduledTask, policy: OperationalMealPolicy): boolean {
  return policy.spaceIds.includes(task.spaceId)
    || scopedResourceIds(task).some((id) => policy.resourceIds.includes(id));
}

function sourceTaskConflictsWithPolicy(task: PlannerNextProblem["tasks"][number], policy: OperationalMealPolicy): boolean {
  return policy.spaceIds.includes(task.spaceId)
    || [...(task.requiredResourceIds ?? []), ...(task.coachId === undefined ? [] : [task.coachId])]
      .some((id) => policy.resourceIds.includes(id));
}

/**
 * Returns boundary-based policies whose complete productive scope is owned by a
 * macro.  A partially owned scope must remain inconclusive until its other tasks
 * have been fixed by the exact search.
 */
export function operationalMealPoliciesClosedByTaskIds(
  problem: PlannerNextProblem,
  taskIds: readonly string[],
): OperationalMealPolicy[] {
  const owned = new Set(taskIds);
  return [...(problem.operationalMealPolicies ?? [])].filter((policy) => {
    if (isIndividualCoachMeal(problem, policy)) return false;
    const scoped = problem.tasks.filter((task) => sourceTaskConflictsWithPolicy(task, policy));
    return scoped.length >= 2 && scoped.every((task) => owned.has(task.id));
  }).sort(byIdentity);
}

function isIndividualCoachMeal(problem: PlannerNextProblem, policy: OperationalMealPolicy): boolean {
  return policy.spaceIds.length === 0 && policy.resourceIds.length > 0
    && policy.resourceIds.every((id) => problem.coaches.some((coach) => coach.id === id));
}

const canonicalWindows = (windows: readonly Window[]): Window[] => [...windows]
  .filter(({ start, end }) => start < end).sort((a, b) => a.start - b.start || a.end - b.end)
  .reduce<Window[]>((result, interval) => {
    const last = result.at(-1);
    if (!last || interval.start > last.end) result.push({ ...interval });
    else last.end = Math.max(last.end, interval.end);
    return result;
  }, []);

const intersectWindows = (left: readonly Window[], right: readonly Window[]): Window[] => {
  const result: Window[] = [];
  for (const a of left) for (const b of right) {
    const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
    if (start < end) result.push({ start, end });
  }
  return canonicalWindows(result);
};

const subtractWindows = (source: readonly Window[], occupied: readonly Window[]): Window[] => {
  let free = canonicalWindows(source);
  for (const blocker of canonicalWindows(occupied)) free = free.flatMap((interval) => {
    if (!overlaps(interval, blocker)) return [interval];
    return [{ start: interval.start, end: Math.min(interval.end, blocker.start) },
      { start: Math.max(interval.start, blocker.end), end: interval.end }].filter(({ start, end }) => start < end);
  });
  return free;
};

/** Complete branch-free interval authority for an operational meal reservation. */
function operationalMealRemainingIntervals(problem: PlannerNextProblem, policy: OperationalMealPolicy,
  tasks: readonly ScheduledTask[]): Window[] {
  let available: Window[] = [{ ...policy.window }];
  for (const id of policy.resourceIds) {
    const owner = problem.resources.find((candidate) => candidate.id === id)
      ?? problem.coaches.find((candidate) => candidate.id === id);
    available = intersectWindows(available, owner?.availability ?? []);
  }
  for (const id of policy.spaceIds) {
    const owner = problem.spaces.find((candidate) => candidate.id === id);
    available = intersectWindows(available, owner?.availability ?? []);
  }
  return subtractWindows(available, tasks.filter((task) => taskConflictsWithOperationalMealPolicy(task, policy))
    .map(({ start, end }) => ({ start, end })));
}

export function operationalMealFreeIntervals(problem: PlannerNextProblem, policy: OperationalMealPolicy,
  tasks: readonly ScheduledTask[]): Window[] {
  return operationalMealRemainingIntervals(problem, policy, tasks)
    .filter(({ start, end }) => end - start >= policy.duration);
}

export function probeOperationalMealFutureFeasibility(problem: PlannerNextProblem, tasks: readonly ScheduledTask[],
  newlyFixed?: readonly ScheduledTask[], previous: readonly OperationalMealReservation[] = []): {
  feasible: boolean; checkedPolicyIds: readonly string[]; blockingPolicyIds: readonly string[];
  pruneProofs: readonly OperationalMealFuturePruneProof[]; branchesExplored: 0; readOnly: true;
  reservations: readonly OperationalMealReservation[]; repairs: number;
} {
  const checked = [...(problem.operationalMealPolicies ?? [])].filter((policy) => {
    if (newlyFixed && !newlyFixed.some((task) => taskConflictsWithOperationalMealPolicy(task, policy))) return false;
    if (isIndividualCoachMeal(problem, policy)) return false;
    return true;
  }).sort(byIdentity);
  const prior = new Map(previous.map((reservation) => [reservation.policyId, reservation]));
  const reservations = checked.map((policy): OperationalMealReservation | null => {
    const feasibleIntervals = operationalMealFreeIntervals(problem, policy, tasks);
    const first = feasibleIntervals[0];
    return first ? { policyId: policy.id, feasibleIntervals, witnessInterval: { start: first.start, end: first.start + policy.duration } } : null;
  });
  const blockingPolicies = checked.filter((_, index) => reservations[index] === null);
  const blocking = blockingPolicies.map(({ id }) => id);
  const validReservations = reservations.filter((value): value is OperationalMealReservation => value !== null);
  const repairs = validReservations.filter((reservation) => {
    const old = prior.get(reservation.policyId)?.witnessInterval;
    return old !== undefined && !reservation.feasibleIntervals.some((interval) => contains([interval], old.start, old.end));
  }).length;
  return freeze({ feasible: blocking.length === 0, checkedPolicyIds: checked.map(({ id }) => id).sort(),
    blockingPolicyIds: blocking, pruneProofs: blockingPolicies.map((policy) => ({ policyId: policy.id,
      requiredDuration: policy.duration, window: { ...policy.window },
      cause: "NO_VALID_OPERATIONAL_MEAL_INTERVAL",
      ...(prior.get(policy.id) ? { longestRemainingFreeIntervalBefore: Math.max(0,
        ...prior.get(policy.id)!.feasibleIntervals.map(({ start, end }) => end - start)) } : {}),
      longestRemainingFreeIntervalAfter: Math.max(0,
        ...operationalMealRemainingIntervals(problem, policy, tasks).map(({ start, end }) => end - start)) })),
    reservations: validReservations, repairs, branchesExplored: 0, readOnly: true });
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

function productiveTasks(policy: OperationalMealPolicy, tasks: readonly ScheduledTask[]): ScheduledTask[] {
  return tasks.filter((task) => taskConflictsWithOperationalMealPolicy(task, policy))
    .sort((left, right) => left.start - right.start || left.end - right.end || left.id.localeCompare(right.id, "en"));
}

/** Canonical hard authority for a prospective between-task meal interval. */
export function operationalMealBoundaryIntervalAvailable(
  problem: PlannerNextProblem,
  policy: OperationalMealPolicy,
  tasks: readonly ScheduledTask[],
  start: number,
): boolean {
  const end = start + policy.duration;
  return start >= policy.window.start && end <= policy.window.end
    && scopeAvailable(problem, policy, start, end)
    && !tasks.some((task) => taskConflictsWithOperationalMealPolicy(task, policy) && overlaps(task, { start, end }));
}

function hardBoundaryAvailable(problem: PlannerNextProblem, policy: OperationalMealPolicy,
  tasks: readonly ScheduledTask[], left: ScheduledTask, right: ScheduledTask): boolean {
  const start = left.end, end = start + policy.duration;
  return end <= right.start && operationalMealBoundaryIntervalAvailable(problem, policy, tasks, start);
}

export function operationalMealCandidates(
  problem: PlannerNextProblem,
  policy: OperationalMealPolicy,
  tasks: readonly ScheduledTask[],
  placed: readonly ScheduledOperationalMeal[],
): ScheduledOperationalMeal[] {
  const candidates: ScheduledOperationalMeal[] = [];
  const productive = productiveTasks(policy, tasks);
  const grid = PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES;
  const free = operationalMealFreeIntervals(problem, policy, tasks);
  const taskBoundaries = new Map(productive.slice(0, -1).flatMap((left, index) => {
    const right = productive[index + 1]!, start = left.end;
    return hardBoundaryAvailable(problem, policy, tasks, left, right) ? [[start, left.blockKey !== undefined
      && right.blockKey !== undefined && left.blockKey !== right.blockKey] as const] : [];
  }));
  const starts = new Map<number, { start: number; preferred: boolean; taskBoundary: boolean }>();
  for (const interval of free) {
    const first = problem.day.start + Math.ceil((interval.start - problem.day.start) / grid) * grid;
    for (let start = first; start + policy.duration <= interval.end; start += grid)
      starts.set(start, { start, preferred: taskBoundaries.get(start) === true, taskBoundary: taskBoundaries.has(start) });
  }
  const boundaries = [...starts.values()].sort((a, b) => Number(b.preferred) - Number(a.preferred)
    || Number(b.taskBoundary) - Number(a.taskBoundary) || a.start - b.start);
  for (const { start, preferred } of boundaries) {
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
    if (tasks.some((task) => taskConflictsWithOperationalMealPolicy(task, policy) && overlaps(task, candidate))) continue;
    if (placed.some((meal) => mealScopesOverlap(meal, candidate) && overlaps(meal, candidate))) continue;
    candidates.push(Object.assign(candidate, { preferredBoundary: preferred }));
  }
  return candidates;
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
