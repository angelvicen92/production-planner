import type {
  PlannerNextProblem,
  PlanningScope,
  ScheduledTask,
} from "./contracts";
import { executePlannerNext } from "./executePlannerNext";
import { fingerprint } from "./fingerprint";
import { validatePlan } from "./validate";
import type { ExactCoreCausalDiagnostic } from "./exactMainAndFeederCore";

export type AssistedPlanningReasonCode =
  | "ASSISTED_SCOPE_COMPLETE"
  | "ASSISTED_SCOPE_INCOMPLETE"
  | "ASSISTED_EXECUTION_REJECTED"
  | "ASSISTED_HARD_VALIDATION_FAILED";

export interface AssistedProblem {
  readonly problem: PlannerNextProblem;
  readonly originalValidationProblem: PlannerNextProblem;
  readonly scope: PlanningScope;
  readonly protectedPlacements: readonly ScheduledTask[];
  readonly automaticTaskIds: readonly string[];
  readonly supportingTaskIds: readonly string[];
}

export interface AssistedPlanningEvidence {
  readonly scopeTaskCount: number;
  readonly scopeTaskIds: readonly string[];
  readonly supportingTaskIds: readonly string[];
  readonly protectedPlacementCount: number;
  readonly protectedPlacementsPreserved: boolean;
  readonly proposalCount: 0 | 1;
  readonly completeForScope: boolean;
  readonly hardValid: boolean;
  readonly requiredValid: boolean;
  readonly fingerprint: string | null;
  readonly work: Readonly<Record<string, number>>;
  readonly causalDiagnostic: ExactCoreCausalDiagnostic | null;
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
 * extra search variables are the explicit dependency/anchor closure. Accepted placements are represented
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
  const closure = new Set(scopeIds);
  const supporting = new Set<string>();
  const includeSupporting = (id: string): void => {
    if (included.has(id)) return;
    if (!tasksById.has(id)) throw new Error("UNKNOWN_SUPPORTING_TASK_ID");
    included.add(id);
    supporting.add(id);
    closure.add(id);
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...closure]) {
      const task = tasksById.get(id)!;
      for (const dependencyId of task.dependencies) if (!included.has(dependencyId)) {
        includeSupporting(dependencyId);
        changed = true;
      }
      for (const anchor of problem.anchoredAccompaniments ?? []) {
        if (anchor.anchorTaskId === id || anchor.beforeTaskIds.includes(id) || anchor.afterTaskIds.includes(id)) {
          for (const memberId of [...anchor.beforeTaskIds, anchor.anchorTaskId, ...anchor.afterTaskIds]) {
            if (!included.has(memberId)) {
              includeSupporting(memberId);
              changed = true;
            }
          }
        }
      }
    }
  }

  const fixedById = new Map(protectedPlacements.map((placement) => [placement.id, placement]));
  problem.tasks = problem.tasks.filter(({ id }) => included.has(id));
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
  const originalValidationProblem = structuredClone(problem);
  problem.tasks = problem.tasks.map((task) => {
    const fixed = fixedById.get(task.id);
    return fixed ? { ...task, availability: [{ start: fixed.start, end: fixed.end }] } : task;
  });

  return {
    problem,
    originalValidationProblem,
    scope,
    protectedPlacements: structuredClone(protectedPlacements),
    automaticTaskIds: canonicalIds([...included].filter((id) => !fixedById.has(id))),
    supportingTaskIds: canonicalIds([...supporting]),
  };
}

export function executeAssistedPlanning(input: AssistedProblem): AssistedPlanningResult {
  const execution = executePlannerNext(input.problem, { causalDiagnostic: true });
  const result = execution.result;
  const protectedById = new Map(input.protectedPlacements.map((placement) => [placement.id, placement]));
  const searchScheduled = result?.complete ? result.scheduledTasks : [];
  const scheduled = searchScheduled.map((task) =>
    structuredClone(protectedById.get(task.id) ?? task));
  const searchValidation = result?.complete ? validatePlan(input.problem, searchScheduled,
    result.scheduledSetupPreparations, result.scheduledSpaceMeals, result.scheduledParticipantMeals,
    result.scheduledResourceMeals, result.scheduledItinerantUnitMeals,
    "scheduledRoundPreparations" in result ? result.scheduledRoundPreparations : [],
    "scheduledOperationalMeals" in result ? result.scheduledOperationalMeals : []) : null;
  const validation = result?.complete ? validatePlan(input.originalValidationProblem, scheduled,
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
  const searchHardValid = Boolean(searchValidation?.hardValid && protectedPreserved);
  const hardValid = Boolean(validation?.hardValid && protectedPreserved);
  const proposal = completeForScope && searchHardValid
    ? scheduled.filter(({ id }) => input.scope.resolvedTaskIds.includes(id)) : null;
  const resultReasonCodes = result && "evidence" in result && Array.isArray(result.evidence.reasonCodes)
    ? result.evidence.reasonCodes : result && "metrics" in result ? result.metrics.reasonCodes : [];
  const reasonCodes: string[] = [...resultReasonCodes, ...(validation?.reasonCodes ?? [])];
  reasonCodes.push(execution.kind === "POLICY_REJECTED" ? "ASSISTED_EXECUTION_REJECTED"
    : !completeForScope ? "ASSISTED_SCOPE_INCOMPLETE"
    : !searchHardValid ? "ASSISTED_HARD_VALIDATION_FAILED" : "ASSISTED_SCOPE_COMPLETE");
  const evidenceRecord = result && "evidence" in result ? result.evidence as unknown as Record<string, unknown> : {};
  const metricsRecord = result && "metrics" in result ? result.metrics as unknown as Record<string, unknown> : {};
  const work = Object.fromEntries(["branchesExplored", "backtracks", "patternsGenerated", "branchBudgetConsumed",
    "coreMaximumDepth", "patternCandidatesExplored", "timelineCandidatesExplored", "mainCandidatesEvaluated",
    "feederCandidatesEvaluated", "architecturesChecked", "feederOrderBranches", "feederSlotMatchingChecks",
    "feederSlotMatchingEdgeChecks", "feederSlotMatchingAugmentTraversals", "feederSlotMatchingBranchesExplored",
    "residualMatchingInvocations", "residualMatchingFullBuilds", "residualMatchingIncrementalUpdates",
    "residualMatchingEdgeCacheHits", "residualMatchingEdgeCacheMisses", "residualMatchingPositionChecks",
    "residualMatchingAugmentTraversals", "residualMatchingBranchesExplored", "mainRunWitnessAttempts",
    "mainRunWitnessRepairs", "mainRunEquivalentOrdersCollapsed", "standaloneForwardChecks",
    "standaloneForwardStartChecks", "standaloneForwardWitnessCacheHits", "standaloneForwardWitnessCacheMisses"]
    .flatMap((key) => {
      const value = evidenceRecord[key] ?? metricsRecord[key];
      return typeof value === "number" ? [[key, value] as const] : [];
    }));
  return { proposal, evidence: {
    scopeTaskCount: input.scope.resolvedTaskIds.length,
    scopeTaskIds: input.scope.resolvedTaskIds,
    supportingTaskIds: input.supportingTaskIds,
    protectedPlacementCount: input.protectedPlacements.length,
    protectedPlacementsPreserved: protectedPreserved,
    proposalCount: proposal ? 1 : 0,
    completeForScope,
    hardValid,
    // Planner Next still reports HARD + REQUIRED through one strict search validator.
    // A returned assisted proposal therefore proves REQUIRED compliance even if
    // the combined state retains an inherited, human-accepted HARD exception.
    requiredValid: searchHardValid,
    fingerprint: proposal ? fingerprint([...input.protectedPlacements, ...proposal]) : null,
    work,
    causalDiagnostic: (evidenceRecord.causalDiagnostic as ExactCoreCausalDiagnostic | null | undefined) ?? null,
    reasonCodes: [...new Set(reasonCodes)].sort(),
  } };
}
