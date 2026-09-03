import { createHash } from "node:crypto";
import type {
  OperationalMealPolicy,
  PlannerNextProblem,
  ScheduledOperationalMeal,
  ScheduledTask,
  Window,
} from "./contracts";
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

function sourceTaskConflictsWithPolicy(task: PlannerNextProblem["tasks"][number], policy: OperationalMealPolicy): boolean {
  return policy.spaceIds.includes(task.spaceId)
    || [...(task.requiredResourceIds ?? []), ...(task.coachId === undefined ? [] : [task.coachId])]
      .some((id) => policy.resourceIds.includes(id));
}

/** Sound interval probe: a policy is rejected only after every task in its scope is fixed. */
export function probeOperationalMealFutureFeasibility(problem: PlannerNextProblem, tasks: readonly ScheduledTask[]): {
  feasible: boolean; checkedPolicyIds: readonly string[]; blockingPolicyIds: readonly string[]; readOnly: true;
} {
  const scheduledIds = new Set(tasks.map(({ id }) => id));
  const checked = [...(problem.operationalMealPolicies ?? [])].filter((policy) => {
    const scoped = problem.tasks.filter((task) => sourceTaskConflictsWithPolicy(task, policy));
    return scoped.length > 1 && scoped.every(({ id }) => scheduledIds.has(id));
  });
  const blocking = checked.filter((policy) => operationalMealCandidates(problem, policy, tasks, []).length === 0)
    .map(({ id }) => id).sort();
  return freeze({ feasible: blocking.length === 0, checkedPolicyIds: checked.map(({ id }) => id).sort(),
    blockingPolicyIds: blocking, readOnly: true });
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

export function operationalMealCandidates(
  problem: PlannerNextProblem,
  policy: OperationalMealPolicy,
  tasks: readonly ScheduledTask[],
  placed: readonly ScheduledOperationalMeal[],
): ScheduledOperationalMeal[] {
  const candidates: ScheduledOperationalMeal[] = [];
  const productive = tasks.filter((task) => taskConflictsWithPolicy(task, policy))
    .sort((left, right) => left.start - right.start || left.end - right.end || left.id.localeCompare(right.id, "en"));
  const individualCoachMeal = policy.spaceIds.length === 0 && policy.resourceIds.length > 0
    && policy.resourceIds.every((id) => problem.coaches.some((coach) => coach.id === id));
  const boundaries = individualCoachMeal
    ? Array.from({ length: Math.max(0, Math.floor((policy.window.end - policy.duration - policy.window.start) / 5) + 1) },
      (_, index) => ({ start: policy.window.start + index * 5, preferred: false }))
    : productive.slice(0, -1).flatMap((left, index) => {
    const right = productive[index + 1]!;
    const start = left.end;
    return start >= policy.window.start && start + policy.duration <= policy.window.end
      && start + policy.duration <= right.start ? [{ start, preferred: left.blockKey !== undefined
        && right.blockKey !== undefined && left.blockKey !== right.blockKey }] : [];
    });
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
    if (tasks.some((task) => taskConflictsWithPolicy(task, policy) && overlaps(task, candidate))) continue;
    if (placed.some((meal) => mealScopesOverlap(meal, candidate) && overlaps(meal, candidate))) continue;
    candidates.push(Object.assign(candidate, { preferredBoundary: preferred }));
  }
  return candidates.sort((left, right) => Number(Boolean(right.preferredBoundary))
    - Number(Boolean(left.preferredBoundary))
    || left.start - right.start || left.id.localeCompare(right.id, "en"));
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
