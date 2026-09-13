import type {
  PlannerNextProblem,
  PlanningScope,
  ScheduledTask,
  ValidationSummary,
} from "./contracts";
import { executePlannerNext } from "./executePlannerNext";
import { fingerprint } from "./fingerprint";
import { validatePlan } from "./validate";

export type AssistedPlanningReasonCode =
  | "ASSISTED_SCOPE_COMPLETE"
  | "ASSISTED_SCOPE_INCOMPLETE"
  | "ASSISTED_EXECUTION_REJECTED"
  | "ASSISTED_HARD_VALIDATION_FAILED";

export interface AssistedProblem {
  readonly problem: PlannerNextProblem;
  readonly scope: PlanningScope;
  readonly protectedPlacements: readonly ScheduledTask[];
  readonly automaticTaskIds: readonly string[];
  readonly supportingTaskIds: readonly string[];
}

export interface AssistedPlanningEvidence {
  readonly scopeTaskCount: number;
  readonly scopeTaskIds: readonly string[];
  readonly protectedPlacementCount: number;
  readonly protectedPlacementsPreserved: boolean;
  readonly proposalCount: 0 | 1;
  readonly completeForScope: boolean;
  readonly hardValid: boolean;
  readonly requiredValid: boolean;
  readonly fingerprint: string | null;
  readonly work: Readonly<Record<string, number>>;
  readonly reasonCodes: readonly string[];
}

export interface AssistedPlanningResult {
  readonly proposal: readonly ScheduledTask[] | null;
  readonly evidence: AssistedPlanningEvidence;
}

const canonicalIds = (ids: readonly string[]): string[] => [...ids].sort((a, b) => a.localeCompare(b));

export function createPlanningScope(
  selector: PlanningScope["selector"],
  metadata: PlanningScope["metadata"],
  resolvedTaskIds: readonly string[],
): PlanningScope {
  if (!selector || typeof selector.kind !== "string" || selector.kind.trim() === ""
    || typeof selector.value !== "string" || selector.value.trim() === "") throw new Error("INVALID_PLANNING_SCOPE_SELECTOR");
  if (!Array.isArray(resolvedTaskIds) || resolvedTaskIds.some((id) => typeof id !== "string" || id.trim() === "")) {
    throw new Error("INVALID_PLANNING_SCOPE_TASK_ID");
  }
  if (new Set(resolvedTaskIds).size !== resolvedTaskIds.length) throw new Error("DUPLICATE_PLANNING_SCOPE_TASK_ID");
  const stableMetadata = Object.fromEntries(Object.entries(metadata ?? {}).sort(([left], [right]) => left.localeCompare(right)));
  return Object.freeze({
    selector: Object.freeze({ kind: selector.kind, value: selector.value }),
    metadata: Object.freeze(stableMetadata),
    resolvedTaskIds: Object.freeze(canonicalIds(resolvedTaskIds)),
  });
}

/**
 * Projects an immutable Planner Next problem onto one assisted scope. The only
 * extra search variables are dependency/anchor closure and the vocal feeders
 * required by the existing main-flow core. Accepted placements are represented
 * as singleton task-availability domains, so the engine can use them as hard
 * context but cannot move them.
 */
export function buildAssistedProblem(
  source: PlannerNextProblem,
  scope: PlanningScope,
  protectedPlacements: readonly ScheduledTask[],
): AssistedProblem {
  const problem = structuredClone(source);
  const tasksById = new Map(problem.tasks.map((task) => [task.id, task]));
  const scopeIds = canonicalIds(scope.resolvedTaskIds);
  if (scopeIds.some((id) => !tasksById.has(id))) throw new Error("UNKNOWN_PLANNING_SCOPE_TASK_ID");
  if (new Set(scopeIds).size !== scopeIds.length) throw new Error("DUPLICATE_PLANNING_SCOPE_TASK_ID");

  const protectedIds = protectedPlacements.map(({ id }) => id);
  if (new Set(protectedIds).size !== protectedIds.length) throw new Error("DUPLICATE_PROTECTED_PLACEMENT_TASK_ID");
  for (const placement of protectedPlacements) {
    const task = tasksById.get(placement.id);
    if (!task) throw new Error("UNKNOWN_PROTECTED_PLACEMENT_TASK_ID");
    if (placement.start >= placement.end || placement.end - placement.start !== task.duration) throw new Error("INVALID_PROTECTED_PLACEMENT");
    const { start: _start, end: _end, ...placedTask } = placement;
    if (JSON.stringify(placedTask) !== JSON.stringify(task)) throw new Error("PROTECTED_PLACEMENT_TASK_MISMATCH");
  }

  const included = new Set([...scopeIds, ...protectedIds]);
  const supporting = new Set<string>();
  const includeSupporting = (id: string): void => {
    if (included.has(id)) return;
    if (!tasksById.has(id)) throw new Error("UNKNOWN_SUPPORTING_TASK_ID");
    included.add(id);
    supporting.add(id);
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...included]) {
      const task = tasksById.get(id)!;
      for (const dependencyId of task.dependencies) if (!included.has(dependencyId)) {
        includeSupporting(dependencyId);
        changed = true;
      }
      if (task.kind === "main") {
        const feeders = problem.tasks.filter((candidate) => candidate.kind === "vocal" && candidate.participantId === task.participantId);
        if (feeders.length !== 1) throw new Error("ASSISTED_MAIN_REQUIRES_EXACTLY_ONE_FEEDER");
        if (!included.has(feeders[0]!.id)) {
          includeSupporting(feeders[0]!.id);
          changed = true;
        }
      }
      const anchor = problem.anchoredAccompaniments?.find((candidate) => candidate.anchorTaskId === id
        || candidate.beforeTaskIds.includes(id) || candidate.afterTaskIds.includes(id));
      for (const memberId of anchor ? [...anchor.beforeTaskIds, anchor.anchorTaskId, ...anchor.afterTaskIds] : []) {
        if (!included.has(memberId)) {
          includeSupporting(memberId);
          changed = true;
        }
      }
    }
  }

  const fixedById = new Map(protectedPlacements.map((placement) => [placement.id, placement]));
  problem.tasks = problem.tasks.filter(({ id }) => included.has(id)).map((task) => {
    const fixed = fixedById.get(task.id);
    return fixed ? { ...task, availability: [{ start: fixed.start, end: fixed.end }] } : task;
  });
  problem.anchoredAccompaniments = problem.anchoredAccompaniments?.filter((anchor) =>
    [anchor.anchorTaskId, ...anchor.beforeTaskIds, ...anchor.afterTaskIds].every((id) => included.has(id)));
  problem.roundSynchronizations = problem.roundSynchronizations?.map((policy) => ({
    ...policy,
    lanes: policy.lanes.map((lane) => ({ ...lane, taskIds: lane.taskIds.filter((id) => included.has(id)) }))
      .filter((lane) => lane.taskIds.length > 0),
  })).filter((policy) => policy.lanes.length > 0);
  problem.technicalChains = problem.technicalChains?.filter((chain) => chain.orderedTaskIds.every((id) => included.has(id)));
  if (problem.transportPolicy) {
    problem.transportPolicy.arrival.taskIds = problem.transportPolicy.arrival.taskIds.filter((id) => included.has(id));
    problem.transportPolicy.departure.taskIds = problem.transportPolicy.departure.taskIds.filter((id) => included.has(id));
  }
  problem.participantMeals = problem.participantMeals?.filter((meal) => included.has(meal.sourceTaskId));

  return {
    problem,
    scope,
    protectedPlacements: structuredClone(protectedPlacements),
    automaticTaskIds: canonicalIds([...included].filter((id) => !fixedById.has(id))),
    supportingTaskIds: canonicalIds([...supporting]),
  };
}

const requiredValid = (validation: ValidationSummary): boolean => validation.hardValid;

export function executeAssistedPlanning(input: AssistedProblem): AssistedPlanningResult {
  const execution = executePlannerNext(input.problem, { causalDiagnostic: true });
  const result = execution.result;
  const protectedById = new Map(input.protectedPlacements.map((placement) => [placement.id, placement]));
  const scheduled = result?.complete ? result.scheduledTasks.map((task) =>
    structuredClone(protectedById.get(task.id) ?? task)) : [];
  const validation = result?.complete ? validatePlan(input.problem, scheduled,
    result.scheduledSetupPreparations, result.scheduledSpaceMeals, result.scheduledParticipantMeals,
    result.scheduledResourceMeals, result.scheduledItinerantUnitMeals,
    "scheduledRoundPreparations" in result ? result.scheduledRoundPreparations : [],
    "scheduledOperationalMeals" in result ? result.scheduledOperationalMeals : []) : null;
  const byId = new Map(scheduled.map((task) => [task.id, task]));
  const protectedPreserved = input.protectedPlacements.every((fixed) => {
    const actual = byId.get(fixed.id);
    return actual !== undefined && JSON.stringify(actual) === JSON.stringify(fixed);
  });
  const completeForScope = input.scope.resolvedTaskIds.every((id) => byId.has(id));
  const hardValid = Boolean(validation?.hardValid && protectedPreserved);
  const proposal = completeForScope && hardValid ? scheduled.filter(({ id }) => input.automaticTaskIds.includes(id)) : null;
  const resultReasonCodes = result && "evidence" in result && Array.isArray(result.evidence.reasonCodes)
    ? result.evidence.reasonCodes : result && "metrics" in result ? result.metrics.reasonCodes : [];
  const reasonCodes: string[] = [...resultReasonCodes, ...(validation?.reasonCodes ?? [])];
  reasonCodes.push(execution.kind === "POLICY_REJECTED" ? "ASSISTED_EXECUTION_REJECTED"
    : !completeForScope ? "ASSISTED_SCOPE_INCOMPLETE"
    : !hardValid ? "ASSISTED_HARD_VALIDATION_FAILED" : "ASSISTED_SCOPE_COMPLETE");
  const evidenceRecord = result && "evidence" in result ? result.evidence as unknown as Record<string, unknown> : {};
  const metricsRecord = result && "metrics" in result ? result.metrics as unknown as Record<string, unknown> : {};
  const work = Object.fromEntries(["branchesExplored", "backtracks", "patternsGenerated", "branchBudgetConsumed"]
    .flatMap((key) => {
      const value = evidenceRecord[key] ?? metricsRecord[key];
      return typeof value === "number" ? [[key, value] as const] : [];
    }));
  return { proposal, evidence: {
    scopeTaskCount: input.scope.resolvedTaskIds.length,
    scopeTaskIds: input.scope.resolvedTaskIds,
    protectedPlacementCount: input.protectedPlacements.length,
    protectedPlacementsPreserved: protectedPreserved,
    proposalCount: proposal ? 1 : 0,
    completeForScope,
    hardValid,
    requiredValid: Boolean(validation && requiredValid(validation)),
    fingerprint: proposal ? fingerprint([...input.protectedPlacements, ...proposal]) : null,
    work,
    reasonCodes: [...new Set(reasonCodes)].sort(),
  } };
}
