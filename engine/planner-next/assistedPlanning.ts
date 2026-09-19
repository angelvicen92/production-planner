import type {
  ParticipantMealObligation,
  PlannerNextProblem,
  PlanningScope,
  ScheduledTask,
} from "./contracts";
import { executePlannerNext } from "./executePlannerNext";
import { fingerprint } from "./fingerprint";
import { validatePlan } from "./validate";
import type { ExactCoreCausalDiagnostic } from "./exactMainAndFeederCore";
import type { ExactItinerantPlanEvidence } from "./exactItinerantPlan";
import { createViolationKey } from "../../shared/assistedStageValidation";

export type AssistedPlanningReasonCode =
  | "ASSISTED_SCOPE_COMPLETE"
  | "ASSISTED_SCOPE_INCOMPLETE"
  | "ASSISTED_EXECUTION_REJECTED"
  | "ASSISTED_HARD_VALIDATION_FAILED";

export interface AssistedProblem {
  readonly problem: PlannerNextProblem;
  readonly originalValidationProblem: PlannerNextProblem;
  /** Pending obligations outside the executable projection, for read-only future-feasibility probes. */
  readonly analyticalParticipantMeals: readonly ParticipantMealObligation[];
  readonly scope: PlanningScope;
  readonly protectedPlacements: readonly ScheduledTask[];
  readonly automaticTaskIds: readonly string[];
  readonly supportingTaskIds: readonly string[];
  readonly supportingReasonByTaskId: Readonly<Record<string, readonly string[]>>;
}

export interface AssistedPlanningEvidence {
  readonly scopeTaskCount: number;
  readonly scopeTaskIds: readonly string[];
  readonly supportingTaskIds: readonly string[];
  readonly supportingReasonByTaskId?: Readonly<Record<string, readonly string[]>>;
  readonly protectedPlacementCount: number;
  readonly protectedPlacementsPreserved: boolean;
  readonly proposalCount: 0 | 1;
  readonly completeForScope: boolean;
  readonly hardValid: boolean;
  readonly requiredValid: boolean;
  readonly fingerprint: string | null;
  readonly work: Readonly<Record<string, number>>;
  readonly causalDiagnostic: ExactCoreCausalDiagnostic | null;
  readonly prerequisiteSharedCapacityChecks?: number;
  readonly prerequisiteSharedCapacityPrunes?: number;
  readonly prerequisiteSharedCapacityAbstentions?: number;
  readonly prerequisiteSharedCapacityChecksByAuthority?: Readonly<Record<string, number>>;
  readonly prerequisiteSharedCapacityAbstentionsByAuthority?: Readonly<Record<string, number>>;
  readonly firstSharedCapacityPrune?: unknown;
  readonly firstSharedCapacityPass?: unknown;
  readonly sharedCapacityFingerprint?: string | null;
  readonly standaloneDiagnostic?: Pick<ExactItinerantPlanEvidence,
    "standaloneBranchesByDepth" | "standaloneSelectionsByTaskId" | "standaloneCandidateStartsByTaskId"
    | "standaloneMaximumDepth" | "standaloneCompleteLeafCount" | "terminalTransportMaterializationAttempts"
    | "terminalTransportMaterializationFailures" | "standaloneFirstSelectedTaskId" | "standaloneDominantPathFirst20"
    | "terminalTransportWitness"
    | "standaloneFirstDominantBlocker" | "standaloneBranchesBeforeFirstOrdinaryCompleteLeaf"
    | "standaloneBranchesAfterFirstOrdinaryCompleteLeaf" | "firstHardValidCoreLeaf"
    | "coreLeafTransportPrunes" | "transportContiguousStates" | "membershipFallbackEntered" | "coreLeafArrivalEvidence"
    | "corePrerequisiteReservationChecks" | "corePrerequisiteReservationPrunes"
    | "ordinaryPrerequisiteReservationChecks" | "ordinaryPrerequisiteReservationPrunes"
    | "firstPrerequisiteReservationPrune">;
  readonly reasonCodes: readonly string[];
  readonly violations?: readonly import("./contracts").ValidationViolationDetail[];
  readonly unstructuredReasonCodes?: readonly string[];
}

export interface AssistedPlanningResult {
  readonly proposal: readonly ScheduledTask[] | null;
  readonly evidence: AssistedPlanningEvidence;
}
export interface AssistedAcceptedBaseline {
  readonly violations: readonly import("./contracts").ValidationViolationDetail[];
}

const violationIdentity=(detail:import("./contracts").ValidationViolationDetail)=>createViolationKey({
  ruleCode:detail.ruleCode,affectedTaskIds:detail.affectedTaskIds,affectedResourceIds:detail.affectedResourceIds,
  affectedSpaceIds:detail.affectedSpaceIds,dimensions:detail.dimensions});

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
    if (placement.start >= placement.end || placement.end - placement.start !== placement.duration) throw new Error("INVALID_PROTECTED_PLACEMENT");
    const { start: _start, end: _end, ...placedTask } = placement;
    if (JSON.stringify({...placedTask,duration:task.duration}) !== JSON.stringify(task)) throw new Error("PROTECTED_PLACEMENT_TASK_MISMATCH");
  }

  const included = new Set([...scopeIds, ...protectedIds]);
  // Fixed members are not search variables, but they remain graph vertices.
  // Traversing them is essential: a protected member can be the only bridge to
  // another dependency, anchor, joint group, technical chain, or round.
  const closure = new Set([...scopeIds, ...protectedIds]);
  const supporting = new Set<string>();
  const supportingReasons = new Map<string, Set<string>>();
  const includeSupporting = (id: string, reason: string): void => {
    if (!scopeIds.includes(id) && !protectedIds.includes(id)) {
      const reasons = supportingReasons.get(id) ?? new Set<string>();
      reasons.add(reason);
      supportingReasons.set(id, reasons);
    }
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
        includeSupporting(dependencyId, `DEPENDENCY_OF:${id}`);
        changed = true;
      }
      for (const anchor of problem.anchoredAccompaniments ?? []) {
        if (anchor.anchorTaskId === id || anchor.beforeTaskIds.includes(id) || anchor.afterTaskIds.includes(id)) {
          for (const memberId of [...anchor.beforeTaskIds, anchor.anchorTaskId, ...anchor.afterTaskIds]) {
            if (!included.has(memberId)) {
              includeSupporting(memberId, `ANCHORED_WITH:${id}`);
              changed = true;
            }
          }
        }
      }
      const jointGroupId = task.jointGroupId;
      if (jointGroupId) for (const member of problem.tasks) {
        if (member.jointGroupId === jointGroupId && !included.has(member.id)) {
          includeSupporting(member.id, `JOINT_GROUP:${jointGroupId}`); changed = true;
        }
      }
      for (const chain of problem.technicalChains ?? []) if (chain.orderedTaskIds.includes(id)) {
        for (const memberId of chain.orderedTaskIds) if (!included.has(memberId)) {
          includeSupporting(memberId, `TECHNICAL_CHAIN:${chain.id}`); changed = true;
        }
      }
      for (const policy of problem.roundSynchronizations ?? []) {
        const members = policy.lanes.flatMap((lane) => lane.taskIds);
        if (members.includes(id)) for (const memberId of members) if (!included.has(memberId)) {
          includeSupporting(memberId, `ROUND_SYNCHRONIZATION:${policy.id}`); changed = true;
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
  const analyticalParticipantMeals = (problem.participantMeals ?? []).filter((meal) =>
    !included.has(meal.sourceTaskId) && (meal.status === "pending" || meal.status === "interrupted"));
  // The executable problem must remain referentially closed. Obligations whose
  // source is outside scope are analytical context, never hidden search variables.
  problem.participantMeals = problem.participantMeals?.filter((meal) => included.has(meal.sourceTaskId));
  // Structured-space policies describe the tasks that survive projection. An
  // unrelated required-continuity/setup space must not make a small scope fail
  // preflight, and absent setup families cannot remain mandatory in the scope.
  problem.spaces = problem.spaces.map((space) => {
    const ownTasks = problem.tasks.filter((task) => task.spaceId === space.id);
    if (ownTasks.length === 0) {
      const { secondaryContinuity: _secondary, setupPolicy: _setup, ...plain } = space;
      return plain;
    }
    if (!space.setupPolicy) return space;
    const presentFamilies = new Set(ownTasks.flatMap((task) => task.setupFamilyId ? [task.setupFamilyId] : []));
    return { ...space, setupPolicy: { ...space.setupPolicy,
      familyOrder: space.setupPolicy.familyOrder.filter((family) => presentFamilies.has(family)),
      preparationMinutesByFamily: space.setupPolicy.preparationMinutesByFamily === undefined ? undefined
        : Object.fromEntries(Object.entries(space.setupPolicy.preparationMinutesByFamily).filter(([family]) => presentFamilies.has(family))),
    } };
  });
  problem.tasks = problem.tasks.map((task) => {
    const fixed = fixedById.get(task.id);
    if(!fixed)return task;
    const {start: _start,end: _end,...acceptedTask}=fixed;
    return {...acceptedTask,availability:[{start:fixed.start,end:fixed.end}]};
  });
  const originalValidationProblem = structuredClone(problem);

  return {
    problem,
    originalValidationProblem,
    analyticalParticipantMeals: structuredClone(analyticalParticipantMeals),
    scope,
    protectedPlacements: structuredClone(protectedPlacements),
    automaticTaskIds: canonicalIds([...included].filter((id) => !fixedById.has(id))),
    supportingTaskIds: canonicalIds([...supporting]),
    supportingReasonByTaskId: Object.freeze(Object.fromEntries(canonicalIds([...supporting]).map((id) =>
      [id, Object.freeze([...(supportingReasons.get(id) ?? [])].sort())]))),
  };
}

export function executeAssistedPlanning(input: AssistedProblem,acceptedBaseline?:AssistedAcceptedBaseline): AssistedPlanningResult {
  const searchProblem=input.problem;
  const acceptedKeys=new Set((acceptedBaseline?.violations??[]).map(violationIdentity));
  const protectedIds=new Set(input.protectedPlacements.map(({id})=>id));
  const acceptsValidation=(summary:import("./contracts").ValidationSummary)=>{
    const violations=summary.violations??[];
    const exactAcceptedFixedBaseline=violations.length>0&&violations.every(item=>acceptedKeys.has(violationIdentity(item))
      &&item.affectedTaskIds.length>0&&item.affectedTaskIds.every(id=>protectedIds.has(id)));
    return exactAcceptedFixedBaseline&&(summary.unstructuredReasonCodes?.length??0)===0;
  };
  const execution = executePlannerNext(searchProblem, { causalDiagnostic: true, acceptsValidation,
    fixedPlacements:input.protectedPlacements, fixedPlacementsAsContext:true });
  const result = execution.result;
  const protectedById = new Map(input.protectedPlacements.map((placement) => [placement.id, placement]));
  const searchScheduled = result?.complete ? result.scheduledTasks : [];
  const scheduled = searchScheduled.map((task) => structuredClone(protectedById.get(task.id) ?? task));
  for(const fixed of input.protectedPlacements)if(!scheduled.some(task=>task.id===fixed.id))scheduled.push(structuredClone(fixed));
  const searchValidation = result?.complete ? validatePlan(searchProblem, searchScheduled,
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
  const searchHardValid = Boolean(searchValidation && protectedPreserved
    && (searchValidation.hardValid || acceptsValidation(searchValidation)));
  const hardValid = Boolean(validation?.hardValid && protectedPreserved);
  const fixedMainParticipants=new Set(input.protectedPlacements.filter(task=>task.kind==="main")
    .flatMap(task=>task.participantId?[task.participantId]:[]));
  const proposal = completeForScope && searchHardValid
    ? scheduled.filter(task=>input.automaticTaskIds.includes(task.id)&&(input.scope.resolvedTaskIds.includes(task.id)
      ||(task.kind==="vocal"&&task.participantId!==undefined&&fixedMainParticipants.has(task.participantId)))) : null;
  const resultReasonCodes = result && "evidence" in result && Array.isArray(result.evidence.reasonCodes)
    ? result.evidence.reasonCodes : result && "metrics" in result ? result.metrics.reasonCodes : [];
  const reasonCodes: string[] = [...resultReasonCodes, ...(validation?.reasonCodes ?? [])];
  reasonCodes.push(execution.kind === "POLICY_REJECTED" ? "ASSISTED_EXECUTION_REJECTED"
    : !completeForScope ? "ASSISTED_SCOPE_INCOMPLETE"
    : !searchHardValid ? "ASSISTED_HARD_VALIDATION_FAILED" : "ASSISTED_SCOPE_COMPLETE");
  const evidenceRecord = result && "evidence" in result ? result.evidence as unknown as Record<string, unknown> : {};
  const metricsRecord = result && "metrics" in result ? result.metrics as unknown as Record<string, unknown> : {};
  const standaloneKeys = ["standaloneBranchesByDepth","standaloneSelectionsByTaskId","standaloneCandidateStartsByTaskId",
    "standaloneMaximumDepth","standaloneCompleteLeafCount","terminalTransportMaterializationAttempts",
    "terminalTransportMaterializationFailures","terminalTransportWitness","standaloneFirstSelectedTaskId","standaloneDominantPathFirst20",
    "standaloneFirstDominantBlocker","standaloneBranchesBeforeFirstOrdinaryCompleteLeaf",
    "standaloneBranchesAfterFirstOrdinaryCompleteLeaf","firstHardValidCoreLeaf",
    "coreLeafTransportPrunes","transportContiguousStates","membershipFallbackEntered","coreLeafArrivalEvidence",
    "corePrerequisiteReservationChecks","corePrerequisiteReservationPrunes",
    "ordinaryPrerequisiteReservationChecks","ordinaryPrerequisiteReservationPrunes","firstPrerequisiteReservationPrune"] as const;
  const standaloneDiagnostic=Object.fromEntries(standaloneKeys.map(key=>[key,evidenceRecord[key]])) as AssistedPlanningEvidence["standaloneDiagnostic"];
  const work = Object.fromEntries(["branchesExplored", "coreBranches", "standaloneBranches", "backtracks", "patternsGenerated", "branchBudgetConsumed",
    "coreMaximumDepth", "patternCandidatesExplored", "timelineCandidatesExplored", "mainCandidatesEvaluated",
    "feederCandidatesEvaluated", "architecturesChecked", "feederOrderBranches", "feederSlotMatchingChecks",
    "feederSlotMatchingEdgeChecks", "feederSlotMatchingAugmentTraversals", "feederSlotMatchingBranchesExplored",
    "residualMatchingInvocations", "residualMatchingFullBuilds", "residualMatchingIncrementalUpdates",
    "residualMatchingEdgeCacheHits", "residualMatchingEdgeCacheMisses", "residualMatchingPositionChecks",
    "residualMatchingAugmentTraversals", "residualMatchingBranchesExplored", "mainRunWitnessAttempts",
    "mainRunWitnessRepairs", "mainRunEquivalentOrdersCollapsed", "standaloneForwardChecks",
    "standaloneForwardStartChecks", "standaloneForwardWitnessCacheHits", "standaloneForwardWitnessCacheMisses",
    "coreLeafTransportPrunes", "transportContiguousStates", "membershipFallbackEntered"]
    .flatMap((key) => {
      const value = evidenceRecord[key] ?? metricsRecord[key];
      return typeof value === "number" ? [[key, value] as const] : [];
    }));
  return { proposal, evidence: {
    scopeTaskCount: input.scope.resolvedTaskIds.length,
    scopeTaskIds: input.scope.resolvedTaskIds,
    supportingTaskIds: input.supportingTaskIds,
    supportingReasonByTaskId: input.supportingReasonByTaskId,
    protectedPlacementCount: input.protectedPlacements.length,
    protectedPlacementsPreserved: protectedPreserved,
    proposalCount: proposal ? 1 : 0,
    completeForScope,
    hardValid,
    prerequisiteSharedCapacityChecks: Number(evidenceRecord.prerequisiteSharedCapacityChecks ?? 0),
    prerequisiteSharedCapacityPrunes: Number(evidenceRecord.prerequisiteSharedCapacityPrunes ?? 0),
    prerequisiteSharedCapacityAbstentions: Number(evidenceRecord.prerequisiteSharedCapacityAbstentions ?? 0),
    prerequisiteSharedCapacityChecksByAuthority:
      (evidenceRecord.prerequisiteSharedCapacityChecksByAuthority as Record<string, number> | undefined) ?? {},
    prerequisiteSharedCapacityAbstentionsByAuthority:
      (evidenceRecord.prerequisiteSharedCapacityAbstentionsByAuthority as Record<string, number> | undefined) ?? {},
    firstSharedCapacityPrune: evidenceRecord.firstSharedCapacityPrune ?? null,
    firstSharedCapacityPass: evidenceRecord.firstSharedCapacityPass ?? null,
    sharedCapacityFingerprint: typeof evidenceRecord.sharedCapacityFingerprint === "string"
      ? evidenceRecord.sharedCapacityFingerprint : null,
    // Planner Next still reports HARD + REQUIRED through one strict search validator.
    // A returned assisted proposal therefore proves REQUIRED compliance even if
    // the combined state retains an inherited, human-accepted HARD exception.
    requiredValid: searchHardValid,
    fingerprint: proposal ? fingerprint([...input.protectedPlacements, ...proposal]) : null,
    work,
    causalDiagnostic: (evidenceRecord.causalDiagnostic as ExactCoreCausalDiagnostic | null | undefined) ?? null,
    standaloneDiagnostic,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    violations: validation?.violations??[],
    unstructuredReasonCodes: validation?.unstructuredReasonCodes??[],
  } };
}
