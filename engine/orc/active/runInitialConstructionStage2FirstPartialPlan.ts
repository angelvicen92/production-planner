import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState, ReasoningBudgetProfile, ValidationResult } from "../contracts";
import { composePartialPlans } from "../see/partialPlanComposer";
import { buildCandidateStates } from "../transformation/transformationEngine";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import { validateSimulatedStates } from "../validation/validationEngine";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { createHash } from "node:crypto";
import { branchToCandidate, buildInitialConstructionBranches, type InitialConstructionBranch } from "../see/initialConstructionBranchBuilder";
import { initialConstructionSemanticIntegrityAudit } from "./runInitialConstructionStage1";

const SAMPLE_LIMIT = 10;
const CHECKED_FUTURE_DIMENSIONS = ["contestant_remaining_load", "fixed_resource_inventory"] as const;
const UNCOVERED_FUTURE_DIMENSIONS = ["future_space_capacity", "future_itinerant_team_capacity", "future_camera_capacity", "future_zone_changes", "future_setups", "pending_dependency_chains"] as const;

type FutureFeasibilityStatus = "FEASIBLE" | "INFEASIBLE" | "UNKNOWN";

interface FutureFeasibilityAudit {
  status: FutureFeasibilityStatus;
  checkedDimensions: string[];
  uncoveredDimensions: string[];
  reasons: string[];
  confidence: "low" | "medium";
  preliminary: true;
  readOnly: true;
}

interface CapabilityAudit {
  originalInputOnly: boolean;
  v4PlanningRead: false;
  canonicalDependencyClosureUsed: boolean;
  concreteAssignmentsGenerated: boolean;
  partialPlansComposed: boolean;
  transformationsExecuted: boolean;
  simulationsExecuted: boolean;
  validationsExecuted: boolean;
  contestantOverlapChecked: boolean;
  spaceOverlapChecked: boolean;
  resourceOverlapChecked: boolean;
  contestantAvailabilityChecked: boolean;
  taskWindowChecked: boolean;
  taskScopedProtectedIntervalsChecked: boolean;
  byItemQuantityOneSupported: boolean;
  anyOfQuantityOneSupported: boolean;
  byTypeSupported: boolean;
  multiQuantitySupported: boolean;
  itinerantTeamConstructiveCheckSupported: boolean;
  cameraCapacityConstructiveCheckSupported: boolean;
  zoneChangeConstructiveCheckSupported: boolean;
  setupConstructiveCheckSupported: boolean;
  branchRetryImplemented: boolean;
  recursiveAssignmentBacktrackingImplemented: boolean;
  recursiveAssignmentBacktrackingSupported: boolean;
  recursiveAssignmentBacktrackingObserved: boolean;
  temporalAssignmentBacktrackingSupported: boolean;
  resourceAssignmentBacktrackingSupported: boolean;
  temporalAssignmentBacktrackingObserved: boolean;
  resourceAssignmentBacktrackingObserved: boolean;
  branchAlternativeEvaluationSupported: boolean;
  branchRetryObserved: boolean;
  anchorBacktrackingImplemented: boolean;
  fullFutureFeasibilityImplemented: boolean;
  completeInitialPlanningImplemented: boolean;
  publicPlanningUsesStage2: boolean;
  coherent: boolean;
  capabilityName: "bounded_recursive_assignment_backtracking";
  warnings: string[];
}

interface BranchAttempt {
  branchId: string;
  status: string;
  assignmentCount: number;
  rejectionReason: string | null;
  validation: { result: string; violatedConstraints: readonly string[] } | null;
  futureFeasibility: FutureFeasibilityAudit | null;
  partialPlanId: string | null;
  branchAssignmentsFingerprint: string | null;
  candidateAssignmentsFingerprint: string | null;
  simulatedAssignmentsFingerprint: string | null;
  lineageCoherent: boolean | null;
  closureComplete: boolean | null;
  placementAttemptCount: number;
  temporalCandidateCount: number;
  resourceAlternativeCount: number;
  recursiveBacktrackCount: number;
  temporalDecisionBacktrackCount: number;
  resourceDecisionBacktrackCount: number;
  backtrackEventsSample: unknown[];
  repeatedStatePruneCount: number;
  searchDepthReached: number;
  budgetExhausted: boolean;
  deadEndReasonCounts: Record<string, number>;
  assignmentSearchFingerprint: string | null;
}

const minutes = (value?: string | null): number | null => /^\d{2}:\d{2}$/.test(String(value ?? "")) ? Number(String(value).slice(0, 2)) * 60 + Number(String(value).slice(3)) : null;
const durationOf = (task: any): number => Number(task?.durationOverrideMin ?? task?.durationMin ?? task?.durationMinutes ?? task?.duration ?? 0) || 0;

function assignmentFingerprint(assignments: readonly CandidateAssignment[]): string {
  const normalized = assignments.map((assignment) => ({
    taskId: assignment.taskId,
    startPlanned: assignment.startPlanned ?? null,
    endPlanned: assignment.endPlanned ?? null,
    spaceId: assignment.spaceId ?? null,
    resourceIds: [...assignment.resourceIds].sort((a, b) => a - b),
  })).sort((a, b) => a.taskId - b.taskId || String(a.startPlanned).localeCompare(String(b.startPlanned)));
  return createHash("sha256").update(stableStringify(normalized)).digest("hex");
}

function simulatedAssignmentsFor(state: OperationalState, branch: InitialConstructionBranch): CandidateAssignment[] {
  const byTask = new Map((state.planning ?? []).map((entry: any) => [Number(entry.taskId), entry]));
  return branch.assignments.map((assignment) => {
    const planned = byTask.get(assignment.taskId) as any;
    return {
      taskId: assignment.taskId,
      startPlanned: planned?.startPlanned ?? null,
      endPlanned: planned?.endPlanned ?? null,
      spaceId: planned?.spaceId ?? null,
      resourceIds: [...(planned?.assignedResourceIds ?? [])],
    };
  });
}

function preliminaryFutureFeasibility(input: EngineInput, branch: InitialConstructionBranch): FutureFeasibilityAudit {
  const assigned = new Set(branch.assignments.map((assignment) => assignment.taskId));
  const pending = (input.tasks ?? []).filter((task: any) => (task.status === "pending" || task.status === "interrupted") && !assigned.has(task.id));
  const reasons: string[] = [];

  for (const task of pending as any[]) {
    for (const resourceItemId of Object.keys(task.resourceRequirements?.byItem ?? {})) {
      if (!(input.planResourceItems ?? []).some((item) => item.isAvailable !== false && item.resourceItemId === Number(resourceItemId))) {
        reasons.push("RESOURCE_WITHOUT_INVENTORY");
      }
    }
  }

  const loadByContestant = new Map<number, number>();
  for (const task of pending as any[]) {
    if (task.contestantId != null) loadByContestant.set(Number(task.contestantId), (loadByContestant.get(Number(task.contestantId)) ?? 0) + durationOf(task));
  }

  for (const [contestantId, load] of loadByContestant) {
    const availability = (input.contestantAvailabilityById ?? {})[contestantId];
    const latestAssignedEnd = Math.max(...branch.assignments.filter((assignment) => (input.tasks ?? []).find((task) => task.id === assignment.taskId)?.contestantId === contestantId).map((assignment) => minutes(assignment.endPlanned) ?? minutes(input.workDay.start) ?? 0), minutes(input.workDay.start) ?? 0);
    const capacity = (minutes(availability?.end ?? input.workDay.end) ?? minutes(input.workDay.end) ?? 0) - latestAssignedEnd;
    if (load > capacity) reasons.push("CONTESTANT_REMAINING_LOAD_EXCEEDS_AVAILABILITY");
  }

  const status: FutureFeasibilityStatus = reasons.length > 0 ? "INFEASIBLE" : UNCOVERED_FUTURE_DIMENSIONS.length > 0 ? "UNKNOWN" : "FEASIBLE";
  return { status, checkedDimensions: [...CHECKED_FUTURE_DIMENSIONS], uncoveredDimensions: [...UNCOVERED_FUTURE_DIMENSIONS], reasons: [...new Set(reasons)].sort().slice(0, SAMPLE_LIMIT), confidence: status === "INFEASIBLE" ? "medium" : "low", preliminary: true, readOnly: true };
}

function buildCapabilityAudit(flags: { assignments: boolean; partialPlans: boolean; transformations: boolean; simulations: boolean; validations: boolean; branchAlternativeEvaluationSupported: boolean; branchRetryObserved: boolean; recursiveAssignmentBacktrackingObserved: boolean; temporalAssignmentBacktrackingObserved: boolean; resourceAssignmentBacktrackingObserved: boolean; coherent: boolean }): CapabilityAudit {
  return {
    originalInputOnly: true,
    v4PlanningRead: false,
    canonicalDependencyClosureUsed: true,
    concreteAssignmentsGenerated: flags.assignments,
    partialPlansComposed: flags.partialPlans,
    transformationsExecuted: flags.transformations,
    simulationsExecuted: flags.simulations,
    validationsExecuted: flags.validations,
    contestantOverlapChecked: true,
    spaceOverlapChecked: true,
    resourceOverlapChecked: true,
    contestantAvailabilityChecked: true,
    taskWindowChecked: true,
    taskScopedProtectedIntervalsChecked: true,
    byItemQuantityOneSupported: true,
    anyOfQuantityOneSupported: true,
    byTypeSupported: false,
    multiQuantitySupported: false,
    itinerantTeamConstructiveCheckSupported: false,
    cameraCapacityConstructiveCheckSupported: false,
    zoneChangeConstructiveCheckSupported: false,
    setupConstructiveCheckSupported: false,
    branchRetryImplemented: flags.branchRetryObserved,
    recursiveAssignmentBacktrackingImplemented: true,
    recursiveAssignmentBacktrackingSupported: true,
    recursiveAssignmentBacktrackingObserved: flags.recursiveAssignmentBacktrackingObserved,
    temporalAssignmentBacktrackingSupported: true,
    resourceAssignmentBacktrackingSupported: true,
    temporalAssignmentBacktrackingObserved: flags.temporalAssignmentBacktrackingObserved,
    resourceAssignmentBacktrackingObserved: flags.resourceAssignmentBacktrackingObserved,
    branchAlternativeEvaluationSupported: flags.branchAlternativeEvaluationSupported,
    branchRetryObserved: flags.branchRetryObserved,
    anchorBacktrackingImplemented: false,
    fullFutureFeasibilityImplemented: false,
    completeInitialPlanningImplemented: false,
    publicPlanningUsesStage2: false,
    coherent: flags.coherent,
    capabilityName: "bounded_recursive_assignment_backtracking",
    warnings: ["Stage 2 is an experimental read-only first PartialPlan gate.", "Future Feasibility is preliminary and normally UNKNOWN when uncovered dimensions remain."],
  };
}

function validationSummary(validation: ValidationResult | null): { result: string; violatedConstraints: readonly string[] } {
  return { result: validation?.result ?? "INVALID", violatedConstraints: (validation?.violatedConstraints ?? []).slice(0, SAMPLE_LIMIT) };
}

export function runInitialConstructionStage2FirstPartialPlan(args: { originInput: EngineInput; originOperationalState: OperationalState; stage1: any; reasoningBudget?: ReasoningBudgetProfile | null; createdAt?: string | null }) {
  const audit = initialConstructionSemanticIntegrityAudit(args.stage1);
  const anchor = args.stage1.selectedAnchor;
  const hasSpace = (args.stage1.searchSpaces ?? []).some((space: any) => space.anchorTaskId === anchor?.anchorTaskId);
  if (args.stage1.planningMode !== "INITIAL_CONSTRUCTION" || !audit.coherent || !anchor || !hasSpace) {
    return deepFreeze({ version: "INITIAL-CONSTRUCTION-STAGE2-FIRST-PARTIAL-PLAN-V3", executed: false, reason: "stage2_preconditions_not_met", selectedAnchorTaskId: anchor?.anchorTaskId ?? null, readOnly: true }) as any;
  }

  const maxBranches = Math.max(2, Math.min(8, args.reasoningBudget?.maxCandidates ?? 6));
  const built = buildInitialConstructionBranches({ input: args.originInput, originOperationalState: args.originOperationalState, stage1: args.stage1, maxBranches, reasoningBudget: args.reasoningBudget });
  const attempts: BranchAttempt[] = [];
  const selectable: Array<{ branch: InitialConstructionBranch; partialPlanId: string | null; validation: ValidationResult; futureFeasibility: FutureFeasibilityAudit }> = [];
  let hardValidBranchCount = 0;
  let futureInfeasibleBranchCount = 0;
  let futureUnknownBranchCount = 0;
  let transformationsExecuted = 0;
  let simulationsExecuted = 0;
  let validationsExecuted = 0;

  for (const branch of built.branches) {
    const ev = branch.searchEvidence;
    const attempt: BranchAttempt = { branchId: branch.branchId, status: branch.status, assignmentCount: branch.assignments.length, rejectionReason: branch.rejectionReason ?? null, validation: null, futureFeasibility: null, partialPlanId: null, branchAssignmentsFingerprint: null, candidateAssignmentsFingerprint: null, simulatedAssignmentsFingerprint: null, lineageCoherent: null, closureComplete: ev?.closureComplete ?? null, placementAttemptCount: ev?.placementAttemptCount ?? 0, temporalCandidateCount: ev?.temporalCandidateCount ?? 0, resourceAlternativeCount: ev?.resourceAlternativeCount ?? 0, recursiveBacktrackCount: ev?.recursiveBacktrackCount ?? 0, temporalDecisionBacktrackCount: ev?.temporalDecisionBacktrackCount ?? 0, resourceDecisionBacktrackCount: ev?.resourceDecisionBacktrackCount ?? 0, backtrackEventsSample: ev?.backtrackEventsSample ?? [], repeatedStatePruneCount: ev?.repeatedStatePruneCount ?? 0, searchDepthReached: ev?.searchDepthReached ?? 0, budgetExhausted: ev?.budgetExhausted ?? false, deadEndReasonCounts: ev?.deadEndReasonCounts ?? {}, assignmentSearchFingerprint: ev?.assignmentSearchFingerprint ?? null };

    if (branch.status !== "candidate") {
      attempts.push(attempt);
      continue;
    }


    const closureIds = new Set(built.closureTaskIds);
    const assignedIds = branch.assignments.map((assignment) => assignment.taskId);
    const uniqueAssignedIds = new Set(assignedIds);
    const closureIntegrityOk = branch.searchEvidence?.closureComplete === true
      && assignedIds.length === built.closureTaskIds.length
      && uniqueAssignedIds.size === built.closureTaskIds.length
      && assignedIds.every((taskId) => closureIds.has(taskId))
      && built.closureTaskIds.every((taskId) => uniqueAssignedIds.has(taskId))
      && !!branch.searchEvidence?.assignmentSearchFingerprint;
    if (!closureIntegrityOk) {
      attempt.rejectionReason = "CLOSURE_ASSIGNMENT_INTEGRITY_FAILED";
      attempts.push(attempt);
      continue;
    }

    const candidate = branchToCandidate(branch);
    const partialPlanResult = composePartialPlans([candidate], { createdAt: args.createdAt ?? null, maxPartialPlans: 1 });
    const transformationResult = buildCandidateStates(args.originOperationalState, [candidate], { createdAt: args.createdAt ?? null, maxTransformations: 1 });
    const candidateState = transformationResult.candidateStates[0] ?? null;
    const simulationResult = simulateCandidateStates(args.originOperationalState, transformationResult.candidateStates, { createdAt: args.createdAt ?? null, maxSimulations: 1 });
    const simulatedState = simulationResult.simulatedStates[0] ?? null;
    const validationResult = validateSimulatedStates(simulationResult.simulatedStates, { createdAt: args.createdAt ?? null });
    const validation = validationResult.validationResults[0] ?? null;

    transformationsExecuted += transformationResult.summary.transformedCount;
    simulationsExecuted += simulationResult.summary.simulatedCount;
    validationsExecuted += validationResult.validationResults.length;
    attempt.partialPlanId = partialPlanResult.partialPlans[0]?.partialPlanId ?? null;
    attempt.validation = validationSummary(validation);
    attempt.branchAssignmentsFingerprint = assignmentFingerprint(branch.assignments);
    attempt.candidateAssignmentsFingerprint = assignmentFingerprint(candidate.assignments);
    attempt.simulatedAssignmentsFingerprint = simulatedState ? assignmentFingerprint(simulatedAssignmentsFor(simulatedState.operationalStateSnapshot as OperationalState, branch)) : null;
    attempt.lineageCoherent = attempt.branchAssignmentsFingerprint === attempt.candidateAssignmentsFingerprint
      && attempt.branchAssignmentsFingerprint === attempt.simulatedAssignmentsFingerprint
      && partialPlanResult.partialPlans[0]?.candidateIds.length === 1
      && partialPlanResult.partialPlans[0]?.candidateIds[0] === candidate.id
      && candidateState?.candidateId === candidate.id
      && simulatedState?.candidateStateId === candidateState?.id
      && validation?.simulatedStateId === simulatedState?.id;

    if (!attempt.lineageCoherent) {
      attempt.rejectionReason = "LINEAGE_INCOHERENT";
      attempts.push(attempt);
      continue;
    }

    if (validation?.result === "VALID") {
      hardValidBranchCount += 1;
      const futureFeasibility = preliminaryFutureFeasibility(args.originInput, branch);
      attempt.futureFeasibility = futureFeasibility;
      if (futureFeasibility.status === "INFEASIBLE") {
        futureInfeasibleBranchCount += 1;
        attempt.rejectionReason = "future-infeasible";
      } else {
        if (futureFeasibility.status === "UNKNOWN") futureUnknownBranchCount += 1;
        selectable.push({ branch, partialPlanId: attempt.partialPlanId, validation, futureFeasibility });
      }
    } else {
      attempt.rejectionReason = "hard-invalid";
    }

    attempts.push(attempt);
  }

  selectable.sort((a, b) => futureRank(a.futureFeasibility.status) - futureRank(b.futureFeasibility.status)
    || (minutes(a.branch.assignments.find((assignment) => assignment.taskId === built.selectedAnchorTaskId)?.endPlanned) ?? 9999) - (minutes(b.branch.assignments.find((assignment) => assignment.taskId === built.selectedAnchorTaskId)?.endPlanned) ?? 9999)
    || a.branch.branchId.localeCompare(b.branch.branchId));

  const selected = selectable[0] ?? null;
  const selectedIndex = attempts.findIndex((attempt) => attempt.branchId === selected?.branch.branchId);
  const branchesRejectedBeforeSelection = selectedIndex >= 0 ? attempts.slice(0, selectedIndex).filter((attempt) => attempt.rejectionReason != null || attempt.status !== "candidate").length : attempts.filter((attempt) => attempt.rejectionReason != null || attempt.status !== "candidate").length;
  const branchRetryCount = branchesRejectedBeforeSelection;
  const closureIncompleteBranchCount = built.branches.filter((branch) => branch.status === "closure-incomplete").length;
  const completeClosureBranchCount = built.branches.filter((branch) => branch.searchEvidence?.closureComplete === true).length;
  const recursiveAssignmentBacktrackCount = built.branches.reduce((sum, branch) => sum + (branch.searchEvidence?.recursiveBacktrackCount ?? 0), 0);
  const totalTemporalDecisionBacktrackCount = built.branches.reduce((sum, branch) => sum + (branch.searchEvidence?.temporalDecisionBacktrackCount ?? 0), 0);
  const totalResourceDecisionBacktrackCount = built.branches.reduce((sum, branch) => sum + (branch.searchEvidence?.resourceDecisionBacktrackCount ?? 0), 0);
  const totalPlacementAttemptCount = built.branches.reduce((sum, branch) => sum + (branch.searchEvidence?.placementAttemptCount ?? 0), 0);
  const totalRepeatedStatePruneCount = built.branches.reduce((sum, branch) => sum + (branch.searchEvidence?.repeatedStatePruneCount ?? 0), 0);
  const unsupportedBranchCount = built.branches.filter((branch) => branch.status === "unsupported").length;
  const hardInvalidBranchCount = attempts.filter((attempt) => attempt.rejectionReason === "hard-invalid").length;
  const capabilityAudit = buildCapabilityAudit({ assignments: built.branches.some((branch) => branch.assignments.length > 0), partialPlans: attempts.some((attempt) => attempt.partialPlanId != null), transformations: transformationsExecuted > 0, simulations: simulationsExecuted > 0, validations: validationsExecuted > 0, branchAlternativeEvaluationSupported: maxBranches > 1, branchRetryObserved: branchRetryCount > 0, recursiveAssignmentBacktrackingObserved: recursiveAssignmentBacktrackCount > 0, temporalAssignmentBacktrackingObserved: totalTemporalDecisionBacktrackCount > 0, resourceAssignmentBacktrackingObserved: totalResourceDecisionBacktrackCount > 0, coherent: attempts.every((attempt) => attempt.lineageCoherent !== false) });
  const fingerprintPayload = { version: "INITIAL-CONSTRUCTION-STAGE2-FIRST-PARTIAL-PLAN-FINGERPRINT-V2", anchor: built.selectedAnchorTaskId, closure: built.closureTaskIds, attempts: attempts.map((attempt) => ({ branchId: attempt.branchId, status: attempt.status, rejectionReason: attempt.rejectionReason, assignmentCount: attempt.assignmentCount, validation: attempt.validation?.result, future: attempt.futureFeasibility?.status, lineage: attempt.lineageCoherent })) };
  const structuralFingerprint = createHash("sha256").update(stableStringify(fingerprintPayload)).digest("hex");

  return deepFreeze({
    version: "INITIAL-CONSTRUCTION-STAGE2-FIRST-PARTIAL-PLAN-V3",
    executed: true,
    executedBeforeV4: true,
    inputSource: "original-engine-input-and-origin-operational-state",
    v4SeedUsed: false,
    selectedAnchorTaskId: built.selectedAnchorTaskId,
    stage1SelectedAnchorTaskId: anchor.anchorTaskId ?? null,
    anchorMatchesStage1: built.selectedAnchorTaskId === anchor.anchorTaskId,
    closureTaskIds: built.closureTaskIds,
    closureTaskCount: built.closureTaskIds.length,
    topologicalTaskOrder: built.topologicalTaskOrder,
    branchCandidateCount: built.branches.length,
    attemptedBranchCount: attempts.length,
    closureIncompleteBranchCount,
    completeClosureBranchCount,
    recursiveAssignmentBacktrackCount,
    recursiveBacktrackCount: recursiveAssignmentBacktrackCount,
    totalTemporalDecisionBacktrackCount,
    totalResourceDecisionBacktrackCount,
    totalPlacementAttemptCount,
    totalRepeatedStatePruneCount,
    unsupportedBranchCount,
    hardInvalidBranchCount,
    futureInfeasibleBranchCount,
    futureUnknownBranchCount,
    hardValidBranchCount,
    selectedBranchId: selected?.branch.branchId ?? null,
    selectedPartialPlanId: selected?.partialPlanId ?? null,
    selectedAssignmentCount: selected?.branch.assignments.length ?? 0,
    selectedAssignments: selected?.branch.assignments ?? [],
    selectedAssignmentsSample: (selected?.branch.assignments ?? []).slice(0, SAMPLE_LIMIT),
    selectedValidation: selected?.validation ?? null,
    selectedValidationResult: selected?.validation.result ?? null,
    selectedFutureFeasibility: selected?.futureFeasibility ?? null,
    selectedFutureFeasibilityStatus: selected?.futureFeasibility.status ?? null,
    checkedFutureFeasibilityDimensions: selected?.futureFeasibility.checkedDimensions ?? [...CHECKED_FUTURE_DIMENSIONS],
    uncoveredFutureFeasibilityDimensions: selected?.futureFeasibility.uncoveredDimensions ?? [...UNCOVERED_FUTURE_DIMENSIONS],
    branchRetryCount,
    branchesRejectedBeforeSelection,
    backtrackCount: branchRetryCount,
    transformationsExecuted,
    simulationsExecuted,
    validationsExecuted,
    commitsExecuted: 0,
    branchAttempts: attempts.slice(0, SAMPLE_LIMIT),
    structuralFingerprint,
    branchBuilderFingerprint: built.structuralFingerprint,
    capabilityAudit,
    warnings: capabilityAudit.warnings,
    readOnly: true,
  }) as any;
}

function futureRank(status: FutureFeasibilityStatus): number {
  if (status === "FEASIBLE") return 0;
  if (status === "UNKNOWN") return 1;
  return 2;
}
