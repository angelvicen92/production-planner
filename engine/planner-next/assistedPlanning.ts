import type {
  ParticipantMealObligation,
  PlannerNextProblem,
  PlanningScope,
  ScheduledTask,
  ScheduledOperationalMeal,
  ScheduledSetupPreparation,
  ScheduledParticipantMeal,
} from "./contracts";
import { executePlannerNext } from "./executePlannerNext";
import { fingerprint } from "./fingerprint";
import { validatePlan } from "./validate";
import type { ExactCoreCausalDiagnostic } from "./exactMainAndFeederCore";
import type { ExactItinerantPlanEvidence } from "./exactItinerantPlan";
import { participantMealWitnessFingerprint } from "./participantMeals";
import { operationalMealWitnessFingerprint } from "./operationalMeals";
import { createViolationKey } from "../../shared/assistedStageValidation";
import { mainFlowMealPolicy } from "./mainFlowMeal";
import { setupPreparationId } from "./setupPreparation";

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
  readonly protectedOperationalMeals: readonly ScheduledOperationalMeal[];
  readonly protectedSetupPreparations: readonly ScheduledSetupPreparation[];
  readonly protectedParticipantMeals: readonly ScheduledParticipantMeal[];
  readonly retainedParticipantMealSourceIds: readonly string[];
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
  readonly protectedOperationalMeals: readonly import("./contracts").ScheduledOperationalMeal[];
  readonly protectedSetupPreparations?: readonly import("./contracts").ScheduledSetupPreparation[];
  readonly protectedParticipantMeals?: readonly import("./contracts").ScheduledParticipantMeal[];
  readonly retainedParticipantMealSourceIds?: readonly string[];
  readonly protectedPlacementsPreserved: boolean;
  readonly proposalCount: 0 | 1;
  readonly completeForScope: boolean;
  readonly hardValid: boolean;
  readonly requiredValid: boolean;
  readonly fingerprint: string | null;
  /** Solver-selected analytical witnesses. They are Evidence only, never proposal placements. */
  readonly selectedMealWitnesses: {
    readonly participant: { readonly scheduled: readonly import("./contracts").ScheduledParticipantMeal[];
      readonly fingerprint: string; readonly finalSelectionOrder: readonly string[] } | null;
    readonly operational: { readonly scheduled: readonly import("./contracts").ScheduledOperationalMeal[];
      readonly fingerprint: string } | null;
    readonly resource: readonly import("./contracts").ScheduledResourceMeal[];
    readonly itinerantUnit: readonly import("./contracts").ScheduledItinerantUnitMeal[];
  } | null;
  /** Read-only structural artifacts selected with the proposal; snapshots currently persist tasks and meals only. */
  readonly selectedSetupPreparations?: readonly import("./contracts").ScheduledSetupPreparation[];
  readonly participantMealFutureFeasibility: {
    readonly futureFeasibilityChecks:number; readonly futureInfeasibleBranches:number;
    readonly affectedObligationsChecked:number; readonly zeroDomainPrunes:number;
    readonly analyticCollectivePrunes:number; readonly blockingMealTaskIds:readonly string[];
    readonly firstPrune: ExactItinerantPlanEvidence["firstParticipantMealFuturePrune"];
  };
  readonly participantFutureReservation: {
    readonly checks:number; readonly passes:number; readonly prunes:number; readonly abstentions:number;
    readonly affectedParticipants:number; readonly affectedFutureTasksChecked:number; readonly affectedMealsChecked:number;
    readonly individualDomainChecks:number; readonly individualZeroDomainPrunes:number;
    readonly jointTaskMealChecks:number; readonly jointTaskMealPrunes:number;
    readonly collectiveChecks:number; readonly collectivePrunes:number; readonly compatiblePairChecks:number;
    readonly analyticChecks:number; readonly branchesConsumed:number;
    readonly firstPrune:ExactItinerantPlanEvidence["firstParticipantFutureReservationPrune"];
  };
  readonly operationalMealFutureReservation: ExactItinerantPlanEvidence["operationalMealFutureReservation"];
  readonly fixedMainFeederMealChecks:number;readonly fixedMainFeederMealPasses:number;readonly fixedMainFeederMealPrunes:number;
  readonly firstFixedMainFeederMealPrune:ExactItinerantPlanEvidence["firstFixedMainFeederMealPrune"];
  readonly standaloneEntryMealWitness:string|null;
  readonly technicalChainFutureReservation: {
    readonly checks:number; readonly passes:number; readonly prunes:number; readonly abstentions:number;
    readonly branchesConsumed:number;
    readonly firstPrune:ExactItinerantPlanEvidence["firstTechnicalChainFutureReservationPrune"];
    readonly preparedAuthority:ExactItinerantPlanEvidence["preparedFutureTechnicalChainEvidence"]|null;
    readonly firstMultiDecisionConflict:ExactItinerantPlanEvidence["firstMultiDecisionConflict"];
    readonly conflictBackjumps:number; readonly suffixDepthsSkipped:number;
    readonly constructive?:Pick<ExactItinerantPlanEvidence,"futureReservationStructures"|"futureReservationWitnessesEvaluated"|
      "futureReservationRootOrdersEvaluated"|"futureReservationCandidatesRejectedByOtherReservations"|
      "futureReservationCandidatesRejectedByNoBundleMatching"|"futureReservationBundleMatchingAttempts"|
      "futureReservationPerfectMatchings"|"futureReservationSelectedFingerprint"|"architecturesTriedWithFutureReservation"|
      "bundleEdgesBeforeReservation"|"bundleEdgesRejectedByReservation"|"bundleEdgesAfterReservation"|
      "residualDfsEntered"|"residualDfsBranchesBeforeFirstSolution"|"architecturesEnumerated"|"architecturesPrepared"|
      "futureWitnessesTriedByArchitecture"|"preparedBundleEdges"|"reservationFilteredEdges"|"perfectMatchingsByArchitecture"|
      "hardGateRejectsByArchitecture"|"structuralSearchExhausted"|"branchesBeforeResidualDfs"|
      "structuralSearchBudgetExhausted"|"structuralArchitecturesFullyVisited"|"structuralFutureDomainsFullyVisited"|
      "structuralCandidatesProducedBeforeBudgetExhaustion"|"conditionedLeafFutureRevalidations"|
      "conditionedLeafFutureRevalidationPasses"|"conditionedLeafFutureRevalidationRejects"|
      "genericFutureAssessSkippedForConditionedLeaf"|"structuralCandidateFingerprintAtHardGate"|
      "structuralCandidateFingerprintAtContinuation"|"structuralCandidateFingerprintBeforeStandalone"|
      "selectedArchitectureFingerprint"|"selectedFutureReservationFingerprint"|"mainPatternCountGenerated"|
      "participantBundleEdgesChecked"|"participantBundleEdgesPruned"|"participantBundleEdgesAbstained"|"firstParticipantBundleEdgePrune"|
      "mainPatternGenerationExhausted"|"mainPatternsVisited"|"timelinesGenerated"|"architectureStructuralProofChecks"|
      "architectureStructuralProofRejects"|"architectureStructuralRejectsByReason"|"nominalPipelineWitnessChecks"|
      "nominalPipelineWitnessFeasible"|"nominalPipelineWitnessInfeasible"|"nominalPipelineWitnessInconclusive"|
      "nominalPipelineWitnessRejectsByReason"|"continuityRejects"|"authorizedArchitecturesYielded">;
  };
  readonly work: Readonly<Record<string, number>>;
  readonly bundleMatching?: Pick<ExactItinerantPlanEvidence,"bundleForbiddenEdges"|"bundleRepairSequence"|"bundleTerminalCause"|
    "bundleNogoodsCreated"|"bundleNogoodBranches"|"bundleNogoodDeduplications"|"bundleNogoodRepairsSucceeded"|"conflictEdges">;
  readonly fixedMainBundle?:Pick<ExactItinerantPlanEvidence,"fixedMainBundlePathEntered"|"protectedMainCount"|
    "protectedMainArchitectureFingerprint"|"protectedMainSlots"|"fixedMainBundleGraphPrepared"|
    "fixedMainBundlePreparedEdges"|"fixedMainBundleCandidatePositions"|"fixedMainBundleZeroDomainTaskIds"|
    "fixedMainBundleParticipantEdgeChecks"|"fixedMainBundleParticipantEdgePrunes"|"fixedMainBundleFirstParticipantEdgePrune"|
    "fixedMainBundleMatchingAttempts"|"fixedMainBundlePerfectMatchingFound"|
    "fixedMainBundleHardGatePasses"|"fixedMainBundleHardGateRejects"|"fixedMainBundleTaskCount"|
    "fixedMainBundleTasksByKind"|"protectedMainSlotChecks"|"protectedMainSlotMismatches"|
    "pipelineTasksRemovedFromStandalone"|"pendingBeforeFixedMainBundle"|"pendingAfterFixedMainBundle"|
    "legacyFixedFeederFallbackEntered"|"legacyFixedFeederFallbackReason"|"firstFixedMainBundleRejection"|
    "firstFixedMainBundleHardGateDiagnostic">;
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
    | "terminalCompletionRejectionsByCause" | "firstTerminalCompletionRejection"
    | "standaloneFirstDominantBlocker" | "standaloneBranchesBeforeFirstOrdinaryCompleteLeaf"
    | "standaloneBranchesAfterFirstOrdinaryCompleteLeaf" | "firstHardValidCoreLeaf"
    | "coreLeafTransportPrunes" | "transportContiguousStates" | "membershipFallbackEntered" | "coreLeafArrivalEvidence"
    | "corePrerequisiteReservationChecks" | "corePrerequisiteReservationPrunes"
    | "ordinaryPrerequisiteReservationChecks" | "ordinaryPrerequisiteReservationPrunes"
    | "firstPrerequisiteReservationPrune" | "firstStandaloneDeadEndCause"
    | "macroUnitsSelected" | "macroSelectionOrder" | "macroSelectionSteps" | "macroDomainSizes"
    | "setupBlockSearchInvocations" | "setupBlockStartsExplored" | "setupBlockCompleteCandidateCount">;
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
  analyticalFutureEligibleTaskIds: ReadonlySet<string> = new Set(),
  protectedOperationalMeals: readonly ScheduledOperationalMeal[] = [],
  protectedSetupPreparations: readonly ScheduledSetupPreparation[] = [],
  protectedParticipantMeals: readonly ScheduledParticipantMeal[] = [],
): AssistedProblem {
  const problem = structuredClone(source);
  const originalOperationalPolicies=structuredClone(problem.operationalMealPolicies??[]);
  const policyById=new Map(originalOperationalPolicies.map(policy=>[policy.id,policy]));
  for(const meal of protectedOperationalMeals){
    const policy=policyById.get(meal.id);
    if(!policy||meal.start>=meal.end||meal.end-meal.start!==policy.duration
      ||meal.start<policy.window.start||meal.end>policy.window.end)
      throw new Error(`UNREPRESENTABLE_PROTECTED_OPERATIONAL_MEAL:${meal.id}`);
  }
  const preparationIds=new Set<string>();
  for(const preparation of protectedSetupPreparations){
    const space=problem.spaces.find(item=>item.id===preparation.spaceId);
    const expected=space?.setupPolicy?.preparationMinutesByFamily?.[preparation.setupFamilyId]
      ??space?.setupPolicy?.preparationMinutesBetweenFamilies;
    if(preparationIds.has(preparation.id)||!space?.setupPolicy
      ||!space.setupPolicy.familyOrder.includes(preparation.setupFamilyId)
      ||preparation.id!==setupPreparationId(preparation.spaceId,preparation.setupFamilyId,preparation.entryIndex)
      ||expected!==preparation.duration
      ||preparation.entryIndex!==1||preparation.start>=preparation.end
      ||preparation.end-preparation.start!==preparation.duration
      ||!space.availability.some(window=>window.start<=preparation.start&&preparation.end<=window.end))
      throw new Error(`UNREPRESENTABLE_PROTECTED_SETUP_PREPARATION:${preparation.id}`);
    preparationIds.add(preparation.id);
  }
  const tasksById = new Map(problem.tasks.map((task) => [task.id, task]));
  const mealsBySourceId = new Map((problem.participantMeals??[]).map(meal=>[meal.sourceTaskId,meal]));
  const scopeIds = canonicalIds(scope.resolvedTaskIds);
  if (scopeIds.some((id) => !tasksById.has(id)&&!mealsBySourceId.has(id))) throw new Error("UNKNOWN_PLANNING_SCOPE_TASK_ID");
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
  const protectedMealBySourceId=new Map<string,ScheduledParticipantMeal>();
  for(const fixed of protectedParticipantMeals){
    const obligation=mealsBySourceId.get(fixed.sourceTaskId);
    if(protectedMealBySourceId.has(fixed.sourceTaskId)||!obligation||fixed.id!==obligation.id
      ||fixed.participantId!==obligation.participantId||fixed.duration!==obligation.duration
      ||fixed.start>=fixed.end||fixed.end-fixed.start!==fixed.duration
      ||fixed.start<obligation.window.start||fixed.end>obligation.window.end)
      throw new Error(`UNREPRESENTABLE_PROTECTED_PARTICIPANT_MEAL:${fixed.sourceTaskId}`);
    protectedMealBySourceId.set(fixed.sourceTaskId,fixed);
  }

  const included = new Set([...scopeIds.filter(id=>tasksById.has(id)), ...protectedIds]);
  const includedMeals = new Set([...scopeIds.filter(id=>mealsBySourceId.has(id)),...protectedMealBySourceId.keys()]);
  // Fixed members are not search variables, but they remain graph vertices.
  // Traversing them is essential: a protected member can be the only bridge to
  // another dependency, anchor, joint group, technical chain, or round.
  const closure = new Set([...scopeIds, ...protectedIds,...protectedMealBySourceId.keys()]);
  const supporting = new Set<string>();
  const supportingReasons = new Map<string, Set<string>>();
  const includeSupporting = (id: string, reason: string): void => {
    if (!scopeIds.includes(id) && !protectedIds.includes(id)) {
      const reasons = supportingReasons.get(id) ?? new Set<string>();
      reasons.add(reason);
      supportingReasons.set(id, reasons);
    }
    if (included.has(id)) return;
    if (!tasksById.has(id)) throw new Error(`UNKNOWN_SUPPORTING_TASK_ID:${id}`);
    included.add(id);
    supporting.add(id);
    closure.add(id);
  };
  const includeDependency=(id:string,reason:string):void=>{
    if(tasksById.has(id)){includeSupporting(id,reason);return;}
    if(mealsBySourceId.has(id)){if(!includedMeals.has(id)){includedMeals.add(id);closure.add(id);}return;}
    throw new Error(`UNKNOWN_SUPPORTING_DEPENDENCY_ID:${id}`);
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...closure]) {
      const meal=mealsBySourceId.get(id);
      if(meal){for(const dependencyId of meal.dependencies??[])if(!included.has(dependencyId)&&!includedMeals.has(dependencyId)){
        includeDependency(dependencyId,`DEPENDENCY_OF_MEAL:${id}`);changed=true;
      }continue;}
      const task = tasksById.get(id)!;
      for (const dependencyId of task.dependencies) if (!included.has(dependencyId)&&!includedMeals.has(dependencyId)) {
        includeDependency(dependencyId, `DEPENDENCY_OF:${id}`);
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
  // Capture the full-problem authorities before projecting executable tasks.
  // The search never iterates this collection: participant-causal probes alone
  // consult it after a provisional placement.
  problem.analyticalFutureParticipantTasks = problem.tasks.filter((task) =>
    analyticalFutureEligibleTaskIds.has(task.id) && !included.has(task.id) && task.participantId !== undefined)
    .map((task) => structuredClone(task));
  problem.analyticalFutureTechnicalChains = (problem.technicalChains ?? [])
    .filter((policy) => policy.adjacency === "REQUIRED" && policy.resourceContinuity === "REQUIRED"
      && policy.orderedTaskIds.every((id) => analyticalFutureEligibleTaskIds.has(id) && !included.has(id)))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((policy) => {
      const memberIds=new Set(policy.orderedTaskIds);
      // Preserve joint peers needed by placement authority while keeping them
      // inside read-only analytical context rather than executable search.
      for(const id of policy.orderedTaskIds){
        const group=tasksById.get(id)?.jointGroupId;
        if(group)for(const task of problem.tasks)if(task.jointGroupId===group)memberIds.add(task.id);
      }
      return {policy:structuredClone(policy),tasks:[...memberIds].sort().map(id=>structuredClone(tasksById.get(id)!))};
    });
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
  const analyticalMealSourceIds = new Set((problem.participantMeals ?? [])
    .filter((meal) => !includedMeals.has(meal.sourceTaskId) && (meal.status === "pending" || meal.status === "interrupted"))
    .map((meal) => meal.sourceTaskId));
  const analyticalParticipantMeals = (problem.participantMeals ?? []).filter((meal) =>
    analyticalMealSourceIds.has(meal.sourceTaskId)).map((meal) => ({ ...meal,
      // An analytical obligation is context rather than a hidden search variable.
      // Keep only prerequisite vertices represented in this projection.
      dependencies: meal.dependencies?.filter((id) => included.has(id) || includedMeals.has(id) || analyticalMealSourceIds.has(id)),
    }));
  // The executable problem must remain referentially closed. Obligations whose
  // source is outside scope are analytical context, never hidden search variables.
  const retainedMealSourceIds = includedMeals;
  problem.participantMeals = problem.participantMeals?.filter((meal) => retainedMealSourceIds.has(meal.sourceTaskId))
    .map((meal) => ({ ...meal,
      dependencies: meal.dependencies?.filter((id) => included.has(id) || retainedMealSourceIds.has(id)),
      ...(protectedMealBySourceId.has(meal.sourceTaskId)?{fixedInterval:{start:protectedMealBySourceId.get(meal.sourceTaskId)!.start,end:protectedMealBySourceId.get(meal.sourceTaskId)!.end}}:{}),
    }));
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
      ...(space.setupPolicy.preparationMinutesByFamily === undefined ? {} : {
        preparationMinutesByFamily: Object.fromEntries(Object.entries(space.setupPolicy.preparationMinutesByFamily)
          .filter(([family]) => presentFamilies.has(family))),
      }),
    } };
  });
  problem.tasks = problem.tasks.map((task) => {
    const fixed = fixedById.get(task.id);
    if(!fixed)return task;
    const {start: _start,end: _end,...acceptedTask}=fixed;
    return {...acceptedTask,availability:[{start:fixed.start,end:fixed.end}]};
  });
  const originalValidationProblem = structuredClone(problem);
  originalValidationProblem.operationalMealPolicies=originalOperationalPolicies;
  const protectedByPolicy=new Map(protectedOperationalMeals.map(meal=>[meal.id,meal]));
  problem.operationalMealPolicies=problem.operationalMealPolicies?.map(policy=>{
    const fixed=protectedByPolicy.get(policy.id);
    return fixed?{...policy,window:{start:fixed.start,end:fixed.end}}:policy;
  });

  return {
    problem,
    originalValidationProblem,
    analyticalParticipantMeals: structuredClone(analyticalParticipantMeals),
    scope,
    protectedPlacements: structuredClone(protectedPlacements),
    protectedOperationalMeals: structuredClone(protectedOperationalMeals),
    protectedSetupPreparations: structuredClone(protectedSetupPreparations),
    protectedParticipantMeals: structuredClone(protectedParticipantMeals),
    retainedParticipantMealSourceIds: canonicalIds([...retainedMealSourceIds]),
    automaticTaskIds: canonicalIds([...included].filter((id) => !fixedById.has(id))),
    supportingTaskIds: canonicalIds([...supporting]),
    supportingReasonByTaskId: Object.freeze(Object.fromEntries(canonicalIds([...supporting]).map((id) =>
      [id, Object.freeze([...(supportingReasons.get(id) ?? [])].sort())]))),
  };
}

export function executeAssistedPlanning(input: AssistedProblem,acceptedBaseline?:AssistedAcceptedBaseline): AssistedPlanningResult {
  // Future participant meals remain invisible obligations, but they must constrain
  // every constructive/future-feasibility check performed for an Assisted scope.
  const searchProblem:PlannerNextProblem={...input.problem,participantMeals:[
    ...(input.problem.participantMeals??[]),...input.analyticalParticipantMeals,
  ]};
  const acceptedKeys=new Set((acceptedBaseline?.violations??[]).map(violationIdentity));
  const protectedIds=new Set(input.protectedPlacements.map(({id})=>id));
  const acceptsValidation=(summary:import("./contracts").ValidationSummary)=>{
    const violations=summary.violations??[];
    const exactAcceptedFixedBaseline=violations.length>0&&violations.every(item=>acceptedKeys.has(violationIdentity(item))
      &&item.affectedTaskIds.length>0&&item.affectedTaskIds.every(id=>protectedIds.has(id)));
    return exactAcceptedFixedBaseline&&(summary.unstructuredReasonCodes?.length??0)===0;
  };
  const execution = executePlannerNext(searchProblem, { causalDiagnostic: true, acceptsValidation,
    fixedPlacements:input.protectedPlacements, fixedPlacementsAsContext:true,
    fixedSetupPreparations:input.protectedSetupPreparations });
  const result = execution.result;
  const protectedById = new Map(input.protectedPlacements.map((placement) => [placement.id, placement]));
  const searchScheduled = result?.complete ? result.scheduledTasks : [];
  const projectedParticipantMealSources=new Set((input.originalValidationProblem.participantMeals??[]).map(meal=>meal.sourceTaskId));
  const projectedParticipantMeals=result?.complete
    ? result.scheduledParticipantMeals.filter(meal=>projectedParticipantMealSources.has(meal.sourceTaskId)) : [];
  const scheduled = searchScheduled.map((task) => structuredClone(protectedById.get(task.id) ?? task));
  for(const fixed of input.protectedPlacements)if(!scheduled.some(task=>task.id===fixed.id))scheduled.push(structuredClone(fixed));
  // Analytical meals constrain construction but are deliberately not proposal
  // obligations. Validate the materialized scope against the executable projected
  // contract so invisible future context cannot make a complete local scope fail.
  const searchValidation = result?.complete ? validatePlan(input.originalValidationProblem, searchScheduled,
    result.scheduledSetupPreparations, result.scheduledSpaceMeals, projectedParticipantMeals,
    result.scheduledResourceMeals, result.scheduledItinerantUnitMeals,
    "scheduledRoundPreparations" in result ? result.scheduledRoundPreparations : [],
    "scheduledOperationalMeals" in result ? result.scheduledOperationalMeals : []) : null;
  const validation = result?.complete ? validatePlan(input.originalValidationProblem, scheduled,
    result.scheduledSetupPreparations, result.scheduledSpaceMeals, projectedParticipantMeals,
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
  const proposal = completeForScope && searchHardValid
    ? scheduled.filter(task=>input.automaticTaskIds.includes(task.id)&&input.scope.resolvedTaskIds.includes(task.id)) : null;
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
    "terminalTransportMaterializationFailures","terminalTransportWitness","terminalCompletionRejectionsByCause","firstTerminalCompletionRejection","standaloneFirstSelectedTaskId","standaloneDominantPathFirst20",
    "standaloneFirstDominantBlocker","standaloneBranchesBeforeFirstOrdinaryCompleteLeaf",
    "standaloneBranchesAfterFirstOrdinaryCompleteLeaf","firstHardValidCoreLeaf",
    "coreLeafTransportPrunes","transportContiguousStates","membershipFallbackEntered","coreLeafArrivalEvidence",
    "corePrerequisiteReservationChecks","corePrerequisiteReservationPrunes",
    "ordinaryPrerequisiteReservationChecks","ordinaryPrerequisiteReservationPrunes","firstPrerequisiteReservationPrune",
    "firstStandaloneDeadEndCause","macroUnitsSelected","macroSelectionOrder","macroSelectionSteps","macroDomainSizes",
    "setupBlockSearchInvocations","setupBlockStartsExplored","setupBlockCompleteCandidateCount"] as const;
  const standaloneDiagnostic=Object.fromEntries(standaloneKeys.map(key=>[key,evidenceRecord[key]])) as AssistedPlanningEvidence["standaloneDiagnostic"];
  const work = Object.fromEntries(["branchesExplored", "coreBranches", "standaloneBranches", "backtracks", "patternsGenerated", "branchBudgetConsumed",
    "coreMaximumDepth", "patternCandidatesExplored", "timelineCandidatesExplored", "mainCandidatesEvaluated",
    "feederCandidatesEvaluated", "architecturesChecked", "feederOrderBranches", "feederSlotMatchingChecks",
    "feederSlotMatchingEdgeChecks", "feederSlotMatchingAugmentTraversals", "feederSlotMatchingBranchesExplored",
    "residualMatchingInvocations", "residualMatchingFullBuilds", "residualMatchingIncrementalUpdates",
    "residualMatchingEdgeCacheHits", "residualMatchingEdgeCacheMisses", "residualMatchingPositionChecks",
    "residualMatchingAugmentTraversals", "residualMatchingBranchesExplored", "mainRunWitnessAttempts",
    "mainRunWitnessRepairs", "mainRunEquivalentOrdersCollapsed", "bundleMatchingAttempts",
    "bundleMatchingRepairs", "bundleMatchingMaterializations", "bundleHardValidationRejects",
    "bundleCertifiedRepairs","bundleNogoodsCreated","bundleNogoodBranches","bundleNogoodDeduplications","bundleNogoodRepairsSucceeded",
    "conflictBackjumps","suffixDepthsSkipped","deepestCoreDepthReached", "standaloneForwardChecks",
    "standaloneForwardStartChecks", "standaloneForwardWitnessCacheHits", "standaloneForwardWitnessCacheMisses",
    "coreLeafTransportPrunes", "transportContiguousStates", "membershipFallbackEntered",
    "participantMealFutureFeasibilityChecks","participantMealFutureInfeasibleBranches","participantMealAffectedObligationsChecked",
    "participantMealZeroDomainPrunes","participantMealAnalyticCollectivePrunes","participantMealExactMaterializations"]
    .flatMap((key) => {
      const value = evidenceRecord[key] ?? metricsRecord[key];
      return typeof value === "number" ? [[key, value] as const] : [];
    }));
  const selectedMealWitnesses=result?.complete?{
    participant:{scheduled:structuredClone(result.scheduledParticipantMeals),fingerprint:participantMealWitnessFingerprint(result.scheduledParticipantMeals),
      finalSelectionOrder:[...(evidenceRecord.participantMealFinalSelectionOrder as string[]|undefined)??[]]},
    operational:{scheduled:structuredClone(result.scheduledOperationalMeals??[]),fingerprint:operationalMealWitnessFingerprint(result.scheduledOperationalMeals??[])},
    resource:structuredClone(result.scheduledResourceMeals),itinerantUnit:structuredClone(result.scheduledItinerantUnitMeals),
  }:null;
  const fixedMainBundleKeys=["fixedMainBundlePathEntered","protectedMainCount","protectedMainArchitectureFingerprint",
    "protectedMainSlots","fixedMainBundleGraphPrepared","fixedMainBundlePreparedEdges","fixedMainBundleCandidatePositions",
    "fixedMainBundleZeroDomainTaskIds","fixedMainBundleParticipantEdgeChecks","fixedMainBundleParticipantEdgePrunes",
    "fixedMainBundleFirstParticipantEdgePrune","fixedMainBundleMatchingAttempts",
    "fixedMainBundlePerfectMatchingFound","fixedMainBundleHardGatePasses","fixedMainBundleHardGateRejects",
    "fixedMainBundleTaskCount","fixedMainBundleTasksByKind","protectedMainSlotChecks","protectedMainSlotMismatches",
    "pipelineTasksRemovedFromStandalone","pendingBeforeFixedMainBundle","pendingAfterFixedMainBundle",
    "legacyFixedFeederFallbackEntered","legacyFixedFeederFallbackReason","firstFixedMainBundleRejection",
    "firstFixedMainBundleHardGateDiagnostic"] as const;
  const fixedMainBundle=Object.fromEntries(fixedMainBundleKeys.map(key=>[key,evidenceRecord[key]])) as AssistedPlanningEvidence["fixedMainBundle"];
  return { proposal, evidence: {
    scopeTaskCount: input.scope.resolvedTaskIds.length,
    scopeTaskIds: input.scope.resolvedTaskIds,
    supportingTaskIds: input.supportingTaskIds,
    supportingReasonByTaskId: input.supportingReasonByTaskId,
    protectedPlacementCount: input.protectedPlacements.length,
    protectedOperationalMeals: structuredClone(input.protectedOperationalMeals),
    protectedSetupPreparations: structuredClone(input.protectedSetupPreparations),
    protectedParticipantMeals: structuredClone(input.protectedParticipantMeals),
    retainedParticipantMealSourceIds:[...input.retainedParticipantMealSourceIds],
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
    selectedMealWitnesses,
    fixedMainBundle,
    selectedSetupPreparations:structuredClone(result?.scheduledSetupPreparations??[]),
    participantMealFutureFeasibility:{
      futureFeasibilityChecks:Number(evidenceRecord.participantMealFutureFeasibilityChecks??metricsRecord.participantMealFutureFeasibilityChecks??0),
      futureInfeasibleBranches:Number(evidenceRecord.participantMealFutureInfeasibleBranches??0),
      affectedObligationsChecked:Number(evidenceRecord.participantMealAffectedObligationsChecked??0),
      zeroDomainPrunes:Number(evidenceRecord.participantMealZeroDomainPrunes??0),
      analyticCollectivePrunes:Number(evidenceRecord.participantMealAnalyticCollectivePrunes??0),
      blockingMealTaskIds:[...((evidenceRecord.participantMealBlockingTaskIds as string[]|undefined)??[])],
      firstPrune:(evidenceRecord.firstParticipantMealFuturePrune as ExactItinerantPlanEvidence["firstParticipantMealFuturePrune"]|undefined)??null,
    },
    operationalMealFutureReservation:structuredClone((evidenceRecord.operationalMealFutureReservation as ExactItinerantPlanEvidence["operationalMealFutureReservation"]|undefined)??{
      checks:0,passes:0,prunes:0,abstentions:0,irrelevantFastPasses:0,affectedPoliciesChecked:0,individualDomainChecks:0,
      individualZeroDomainPrunes:0,witnessValidationChecks:0,witnessReuseHits:0,witnessInvalidations:0,witnessRepairs:0,
      exactCollectiveChecks:0,branchesConsumed:0,terminalSearchesAvoided:0,firstPrune:null,fixedContextInitializationChecks:0,
      fixedContextWitnessFound:false,fixedContextWitnessFingerprint:null,preexistingZeroDomainPrunes:0}),
    fixedMainFeederMealChecks:Number(evidenceRecord.fixedMainFeederMealChecks??0),
    fixedMainFeederMealPasses:Number(evidenceRecord.fixedMainFeederMealPasses??0),
    fixedMainFeederMealPrunes:Number(evidenceRecord.fixedMainFeederMealPrunes??0),
    firstFixedMainFeederMealPrune:(evidenceRecord.firstFixedMainFeederMealPrune as ExactItinerantPlanEvidence["firstFixedMainFeederMealPrune"]|undefined)??null,
    standaloneEntryMealWitness:typeof evidenceRecord.standaloneEntryMealWitness==="string"?evidenceRecord.standaloneEntryMealWitness:null,
    participantFutureReservation:{
      checks:Number(evidenceRecord.participantFutureReservationChecks??0),passes:Number(evidenceRecord.participantFutureReservationPasses??0),
      prunes:Number(evidenceRecord.participantFutureReservationPrunes??0),abstentions:Number(evidenceRecord.participantFutureReservationAbstentions??0),
      affectedParticipants:Number(evidenceRecord.participantFutureAffectedParticipants??0),affectedFutureTasksChecked:Number(evidenceRecord.participantFutureTasksChecked??0),
      affectedMealsChecked:Number(evidenceRecord.participantFutureMealsChecked??0),individualDomainChecks:Number(evidenceRecord.participantFutureIndividualDomainChecks??0),
      individualZeroDomainPrunes:Number(evidenceRecord.participantFutureIndividualZeroDomainPrunes??0),jointTaskMealChecks:Number(evidenceRecord.participantFutureJointTaskMealChecks??0),
      jointTaskMealPrunes:Number(evidenceRecord.participantFutureJointTaskMealPrunes??0),collectiveChecks:Number(evidenceRecord.participantFutureCollectiveChecks??0),
      collectivePrunes:Number(evidenceRecord.participantFutureCollectivePrunes??0),compatiblePairChecks:Number(evidenceRecord.participantFutureCompatiblePairChecks??0),
      analyticChecks:Number(evidenceRecord.participantFutureAnalyticChecks??0),branchesConsumed:Number(evidenceRecord.participantFutureBranchesConsumed??0),
      firstPrune:(evidenceRecord.firstParticipantFutureReservationPrune as ExactItinerantPlanEvidence["firstParticipantFutureReservationPrune"]|undefined)??null,
    },
    technicalChainFutureReservation:{
      checks:Number(evidenceRecord.technicalChainFutureReservationChecks??0),passes:Number(evidenceRecord.technicalChainFutureReservationPasses??0),
      prunes:Number(evidenceRecord.technicalChainFutureReservationPrunes??0),abstentions:Number(evidenceRecord.technicalChainFutureReservationAbstentions??0),
      branchesConsumed:Number(evidenceRecord.technicalChainFutureBranchesConsumed??0),
      firstPrune:(evidenceRecord.firstTechnicalChainFutureReservationPrune as ExactItinerantPlanEvidence["firstTechnicalChainFutureReservationPrune"]|undefined)??null,
      preparedAuthority:(evidenceRecord.preparedFutureTechnicalChainEvidence as ExactItinerantPlanEvidence["preparedFutureTechnicalChainEvidence"]|undefined)??null,
      firstMultiDecisionConflict:(evidenceRecord.firstMultiDecisionConflict as ExactItinerantPlanEvidence["firstMultiDecisionConflict"]|undefined)??null,
      conflictBackjumps:Number(evidenceRecord.conflictBackjumps??0),suffixDepthsSkipped:Number(evidenceRecord.suffixDepthsSkipped??0),
      constructive:{
        futureReservationStructures:Number(evidenceRecord.futureReservationStructures??0),futureReservationWitnessesEvaluated:Number(evidenceRecord.futureReservationWitnessesEvaluated??0),
        futureReservationRootOrdersEvaluated:Number(evidenceRecord.futureReservationRootOrdersEvaluated??0),futureReservationCandidatesRejectedByOtherReservations:Number(evidenceRecord.futureReservationCandidatesRejectedByOtherReservations??0),
        futureReservationCandidatesRejectedByNoBundleMatching:Number(evidenceRecord.futureReservationCandidatesRejectedByNoBundleMatching??0),futureReservationBundleMatchingAttempts:Number(evidenceRecord.futureReservationBundleMatchingAttempts??0),
        futureReservationPerfectMatchings:Number(evidenceRecord.futureReservationPerfectMatchings??0),futureReservationSelectedFingerprint:(evidenceRecord.futureReservationSelectedFingerprint as string|null|undefined)??null,
        architecturesTriedWithFutureReservation:Number(evidenceRecord.architecturesTriedWithFutureReservation??0),bundleEdgesBeforeReservation:Number(evidenceRecord.bundleEdgesBeforeReservation??0),
        bundleEdgesRejectedByReservation:Number(evidenceRecord.bundleEdgesRejectedByReservation??0),bundleEdgesAfterReservation:Number(evidenceRecord.bundleEdgesAfterReservation??0),
        residualDfsEntered:Boolean(evidenceRecord.residualDfsEntered),residualDfsBranchesBeforeFirstSolution:(evidenceRecord.residualDfsBranchesBeforeFirstSolution as number|null|undefined)??null,
        architecturesEnumerated:Number(evidenceRecord.architecturesEnumerated??0),architecturesPrepared:Number(evidenceRecord.architecturesPrepared??0),
        participantBundleEdgesChecked:Number(evidenceRecord.participantBundleEdgesChecked??0),participantBundleEdgesPruned:Number(evidenceRecord.participantBundleEdgesPruned??0),
        participantBundleEdgesAbstained:Number(evidenceRecord.participantBundleEdgesAbstained??0),
        firstParticipantBundleEdgePrune:(evidenceRecord.firstParticipantBundleEdgePrune as ExactItinerantPlanEvidence["firstParticipantBundleEdgePrune"]|undefined)??null,
        futureWitnessesTriedByArchitecture:{...((evidenceRecord.futureWitnessesTriedByArchitecture as Record<string,number>|undefined)??{})},
        preparedBundleEdges:Number(evidenceRecord.preparedBundleEdges??0),reservationFilteredEdges:Number(evidenceRecord.reservationFilteredEdges??0),
        perfectMatchingsByArchitecture:{...((evidenceRecord.perfectMatchingsByArchitecture as Record<string,number>|undefined)??{})},
        hardGateRejectsByArchitecture:{...((evidenceRecord.hardGateRejectsByArchitecture as Record<string,number>|undefined)??{})},
        structuralSearchExhausted:Boolean(evidenceRecord.structuralSearchExhausted),structuralSearchBudgetExhausted:Boolean(evidenceRecord.structuralSearchBudgetExhausted),
        structuralArchitecturesFullyVisited:Number(evidenceRecord.structuralArchitecturesFullyVisited??0),structuralFutureDomainsFullyVisited:Number(evidenceRecord.structuralFutureDomainsFullyVisited??0),
        structuralCandidatesProducedBeforeBudgetExhaustion:Number(evidenceRecord.structuralCandidatesProducedBeforeBudgetExhaustion??0),
        conditionedLeafFutureRevalidations:Number(evidenceRecord.conditionedLeafFutureRevalidations??0),conditionedLeafFutureRevalidationPasses:Number(evidenceRecord.conditionedLeafFutureRevalidationPasses??0),
        conditionedLeafFutureRevalidationRejects:Number(evidenceRecord.conditionedLeafFutureRevalidationRejects??0),genericFutureAssessSkippedForConditionedLeaf:Number(evidenceRecord.genericFutureAssessSkippedForConditionedLeaf??0),
        structuralCandidateFingerprintAtHardGate:(evidenceRecord.structuralCandidateFingerprintAtHardGate as string|null|undefined)??null,
        structuralCandidateFingerprintAtContinuation:(evidenceRecord.structuralCandidateFingerprintAtContinuation as string|null|undefined)??null,
        structuralCandidateFingerprintBeforeStandalone:(evidenceRecord.structuralCandidateFingerprintBeforeStandalone as string|null|undefined)??null,
        branchesBeforeResidualDfs:(evidenceRecord.branchesBeforeResidualDfs as number|null|undefined)??null,
        selectedArchitectureFingerprint:(evidenceRecord.selectedArchitectureFingerprint as string|null|undefined)??null,
        selectedFutureReservationFingerprint:(evidenceRecord.selectedFutureReservationFingerprint as string|null|undefined)??null,
        mainPatternCountGenerated:Number(evidenceRecord.mainPatternCountGenerated??0),mainPatternGenerationExhausted:Boolean(evidenceRecord.mainPatternGenerationExhausted),
        mainPatternsVisited:Number(evidenceRecord.mainPatternsVisited??0),timelinesGenerated:Number(evidenceRecord.timelinesGenerated??0),
        architectureStructuralProofChecks:Number(evidenceRecord.architectureStructuralProofChecks??0),architectureStructuralProofRejects:Number(evidenceRecord.architectureStructuralProofRejects??0),
        architectureStructuralRejectsByReason:{...((evidenceRecord.architectureStructuralRejectsByReason as Record<string,number>|undefined)??{})},
        nominalPipelineWitnessChecks:Number(evidenceRecord.nominalPipelineWitnessChecks??0),nominalPipelineWitnessFeasible:Number(evidenceRecord.nominalPipelineWitnessFeasible??0),
        nominalPipelineWitnessInfeasible:Number(evidenceRecord.nominalPipelineWitnessInfeasible??0),nominalPipelineWitnessInconclusive:Number(evidenceRecord.nominalPipelineWitnessInconclusive??0),
        nominalPipelineWitnessRejectsByReason:{...((evidenceRecord.nominalPipelineWitnessRejectsByReason as Record<string,number>|undefined)??{})},
        continuityRejects:Number(evidenceRecord.continuityRejects??0),authorizedArchitecturesYielded:Number(evidenceRecord.authorizedArchitecturesYielded??0),
      },
    },
    work,
    bundleMatching:{bundleForbiddenEdges:[...(evidenceRecord.bundleForbiddenEdges as string[]|undefined)??[]],
      bundleRepairSequence:[...(evidenceRecord.bundleRepairSequence as ExactItinerantPlanEvidence["bundleRepairSequence"]|undefined)??[]],
      bundleTerminalCause:(evidenceRecord.bundleTerminalCause as string|null|undefined)??null,
      bundleNogoodsCreated:Number(evidenceRecord.bundleNogoodsCreated??0),bundleNogoodBranches:Number(evidenceRecord.bundleNogoodBranches??0),
      bundleNogoodDeduplications:Number(evidenceRecord.bundleNogoodDeduplications??0),bundleNogoodRepairsSucceeded:Number(evidenceRecord.bundleNogoodRepairsSucceeded??0),
      conflictEdges:[...(evidenceRecord.conflictEdges as string[]|undefined)??[]]},
    causalDiagnostic: (evidenceRecord.causalDiagnostic as ExactCoreCausalDiagnostic | null | undefined) ?? null,
    standaloneDiagnostic,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    violations: validation?.violations??[],
    unstructuredReasonCodes: validation?.unstructuredReasonCodes??[],
  } };
}
