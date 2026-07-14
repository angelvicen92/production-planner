import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState, ReasoningBudgetProfile, ValidationResult } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { buildInitialConstructionBranches, branchToCandidate, type InitialConstructionBranch } from "../see/initialConstructionBranchBuilder";
import { evaluateInitialConstructionCombinedDependencyCompatibility, resolveInitialConstructionDependencyTemporalBounds } from "../see/initialConstructionDependencyTemporalBounds";
import { composePartialPlans } from "../see/partialPlanComposer";
import { buildCandidateStates } from "../transformation/transformationEngine";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import { validateSimulatedStates } from "../validation/validationEngine";
import type { InitialConstructionAnchorAttemptDiagnostics } from "./initialConstructionAnchorBlockerClassifier";
import { resolveInitialConstructionAnchorBranchLimit } from "./initialConstructionAnchorBranchLimit";
import { resolveInitialConstructionAnchorExplorationBudget } from "./initialConstructionAnchorExplorationBudget";

const SAMPLE_LIMIT = 10;
const minutes = (value?: string | null): number | null => /^\d{2}:\d{2}$/.test(String(value ?? "")) ? Number(String(value).slice(0, 2)) * 60 + Number(String(value).slice(3)) : null;

export function initialConstructionAssignmentFingerprint(assignments: readonly CandidateAssignment[]): string {
  const normalized = assignments.map((assignment) => ({ taskId: assignment.taskId, startPlanned: assignment.startPlanned ?? null, endPlanned: assignment.endPlanned ?? null, spaceId: assignment.spaceId ?? null, resourceIds: [...assignment.resourceIds].sort((a, b) => a - b) })).sort((a, b) => a.taskId - b.taskId || String(a.startPlanned).localeCompare(String(b.startPlanned)));
  return createHash("sha256").update(stableStringify(normalized)).digest("hex");
}

function simulatedAssignmentsFor(state: OperationalState, branch: InitialConstructionBranch): CandidateAssignment[] {
  const byTask = new Map((state.planning ?? []).map((entry: any) => [Number(entry.taskId), entry]));
  return branch.assignments.map((assignment) => {
    const planned = byTask.get(assignment.taskId) as any;
    return { taskId: assignment.taskId, startPlanned: planned?.startPlanned ?? null, endPlanned: planned?.endPlanned ?? null, spaceId: planned?.spaceId ?? null, resourceIds: [...(planned?.assignedResourceIds ?? [])] };
  });
}

function validationSummary(validation: ValidationResult | null): { result: string; violatedConstraints: readonly string[]; violationDetails: readonly unknown[] } {
  return { result: validation?.result ?? "INVALID", violatedConstraints: (validation?.violatedConstraints ?? []).slice(0, SAMPLE_LIMIT), violationDetails: ((validation as any)?.violationDetails ?? []).slice(0, SAMPLE_LIMIT) };
}

const inc = (counts: Record<string, number>, key: string, by = 1): void => { counts[key] = (counts[key] ?? 0) + by; };

function buildAttemptDiagnostics(anchorTaskId: number, stage: any, built: any, attempts: any[], hardValidBranchCount: number, anchorExplorationBudget: any): InitialConstructionAnchorAttemptDiagnostics {
  const missing: string[] = [];
  const space = (stage?.searchSpaces ?? []).find((candidate: any) => Number(candidate?.anchorTaskId) === anchorTaskId) ?? null;
  const searchSpaceFound = space != null;
  if (!Array.isArray(stage?.searchSpaces)) missing.push("stage.searchSpaces");
  const provisionalWindows = searchSpaceFound && Array.isArray(space?.provisionalWindows) ? space.provisionalWindows : searchSpaceFound && Array.isArray(space?.windows) ? space.windows : null;
  if (searchSpaceFound && provisionalWindows == null) missing.push("searchSpace.provisionalWindows");
  const branchStatusCounts: Record<string, number> = {};
  const branchRejectionReasonCounts: Record<string, number> = {};
  const deadEndReasonCounts: Record<string, number> = {};
  const placementReasonCounts: Record<string, number> = {};
  const anchorPlacementReasonCounts: Record<string, number> = {};
  const unsupportedRequirementCodes = new Set<string>();
  let taskWindowConflictCount = 0, protectedIntervalConflictCount = 0, contestantOverlapConflictCount = 0, spaceOverlapConflictCount = 0, resourceOverlapConflictCount = 0, assignmentSearchBudgetExhaustedCount = 0;
  const taskWindowConflictDetails:any[] = [];
  const contestantConflictTaskIds = new Set<number>(), spaceConflictTaskIds = new Set<number>(), resourceConflictTaskIds = new Set<number>(), dependencyLowerBoundTaskIds = new Set<number>(), dependencyUpperBoundTaskIds = new Set<number>(), causalConflictTaskIds = new Set<number>();
  const protectedIntervalConflictIds = new Set<string>();
  let causalConflictEvidenceIncompleteBranchCount = 0;
  const causalFingerprints:string[] = [];
  let anchorTemporalCandidateCount = 0, feasibleAnchorTemporalCandidateCount = 0, rejectedAnchorTemporalCandidateCount = 0, alternativeAnchorTemporalCandidateCount = 0, endAlignedCandidateRejectedCount = 0, alternativeCandidateReachedRecursiveSearchCount = 0;
  const temporalByFingerprint = new Map<string, { feasible: boolean; rank: number; sourceKinds: readonly string[]; reachedRecursive: boolean }>();
  for (const branch of built?.branches ?? []) {
    inc(branchStatusCounts, String(branch.status ?? "unknown"));
    if (branch.rejectionReason) inc(branchRejectionReasonCounts, String(branch.rejectionReason));
    if (branch.anchorPlacementEvidence) {
      const fp = branch.anchorPlacementEvidence.temporalCandidateFingerprint ?? `${branch.anchorPlacementEvidence.windowIndex}|${branch.anchorPlacementEvidence.candidateRankWithinWindow}|${branch.anchorPlacementEvidence.startPlanned}|${branch.anchorPlacementEvidence.endPlanned}|${(branch.anchorPlacementEvidence.sourceKinds ?? []).join(",")}`;
      const current = temporalByFingerprint.get(fp);
      temporalByFingerprint.set(fp, { feasible: (current?.feasible ?? false) || !!branch.anchorPlacementEvidence.feasible, rank: Math.min(current?.rank ?? Number(branch.anchorPlacementEvidence.candidateRankWithinWindow), Number(branch.anchorPlacementEvidence.candidateRankWithinWindow)), sourceKinds: branch.anchorPlacementEvidence.sourceKinds ?? [], reachedRecursive: (current?.reachedRecursive ?? false) || !!branch.searchEvidence });
      for (const code of branch.anchorPlacementEvidence.reasonCodes ?? []) { inc(anchorPlacementReasonCounts, String(code)); inc(placementReasonCounts, String(code)); }
      const cev = branch.anchorPlacementEvidence.causalConflictEvidence;
      if (cev) {
        causalFingerprints.push(cev.fingerprint);
        if (!cev.evidenceComplete) causalConflictEvidenceIncompleteBranchCount += 1;
        taskWindowConflictDetails.push(...(cev.taskWindowConflictDetails ?? []));
        for (const id of cev.contestantConflictTaskIds ?? []) contestantConflictTaskIds.add(Number(id));
        for (const id of cev.spaceConflictTaskIds ?? []) spaceConflictTaskIds.add(Number(id));
        for (const id of cev.resourceConflictTaskIds ?? []) resourceConflictTaskIds.add(Number(id));
        for (const id of cev.dependencyLowerBoundTaskIds ?? []) dependencyLowerBoundTaskIds.add(Number(id));
        for (const id of cev.dependencyUpperBoundTaskIds ?? []) dependencyUpperBoundTaskIds.add(Number(id));
        for (const id of cev.causalConflictTaskIds ?? []) if (Number(id)!==anchorTaskId) causalConflictTaskIds.add(Number(id));
        for (const id of cev.protectedIntervalConflictIds ?? []) protectedIntervalConflictIds.add(String(id));
      } else causalConflictEvidenceIncompleteBranchCount += 1;
    }
    for (const code of branch.unsupportedRequirementCodes ?? []) unsupportedRequirementCodes.add(String(code));
  }
  anchorTemporalCandidateCount = temporalByFingerprint.size;
  for (const candidate of temporalByFingerprint.values()) {
    if (candidate.feasible) feasibleAnchorTemporalCandidateCount += 1; else rejectedAnchorTemporalCandidateCount += 1;
    if (candidate.rank > 0) alternativeAnchorTemporalCandidateCount += 1;
    if (candidate.rank > 0 && candidate.reachedRecursive) alternativeCandidateReachedRecursiveSearchCount += 1;
    if ((candidate.sourceKinds ?? []).includes("historical-end-aligned") && !candidate.feasible) endAlignedCandidateRejectedCount += 1;
  }
  for (const attempt of attempts) {
    for (const [code, count] of Object.entries(attempt.deadEndReasonCounts ?? {})) inc(deadEndReasonCounts, String(code), Number(count) || 0);
    for (const [code, count] of Object.entries(attempt.deadEndReasonCounts ?? {})) inc(placementReasonCounts, String(code), Number(count) || 0);
    taskWindowConflictCount += Number(attempt.taskWindowConflictCount ?? 0);
    protectedIntervalConflictCount += Number(attempt.protectedIntervalConflictCount ?? 0);
    contestantOverlapConflictCount += Number(attempt.contestantOverlapConflictCount ?? 0);
    spaceOverlapConflictCount += Number(attempt.spaceOverlapConflictCount ?? 0);
    resourceOverlapConflictCount += Number(attempt.resourceOverlapConflictCount ?? 0);
    if (attempt.budgetExhausted === true) assignmentSearchBudgetExhaustedCount += 1;
  }
  const diagnostics = {
    anchorTaskId,
    searchSpaceFound,
    provisionalWindowCount: provisionalWindows == null ? 0 : provisionalWindows.length,
    provisionalWindowsSample: (provisionalWindows ?? []).slice(0, SAMPLE_LIMIT),
    branchCount: (built?.branches ?? []).length,
    candidateBranchCount: (built?.branches ?? []).filter((branch: any) => branch.status === "candidate").length,
    closureIncompleteBranchCount: (built?.branches ?? []).filter((branch: any) => branch.status === "closure-incomplete").length,
    unsupportedBranchCount: (built?.branches ?? []).filter((branch: any) => branch.status === "unsupported").length,
    hardValidBranchCount,
    branchStatusCounts: Object.fromEntries(Object.entries(branchStatusCounts).sort()),
    branchRejectionReasonCounts: Object.fromEntries(Object.entries(branchRejectionReasonCounts).sort()),
    deadEndReasonCounts: Object.fromEntries(Object.entries(deadEndReasonCounts).sort()),
    placementReasonCounts: Object.fromEntries(Object.entries(placementReasonCounts).sort()),
    anchorPlacementReasonCounts: Object.fromEntries(Object.entries(anchorPlacementReasonCounts).sort()),
    anchorExplorationBudget, temporalCandidateCountAvailable: built?.temporalCandidatesAvailable ?? anchorTemporalCandidateCount, temporalCandidateCountScanned: built?.temporalCandidatesScanned ?? anchorTemporalCandidateCount, temporalCandidateBatchCount: built?.temporalCandidateBatchCount ?? 1, temporalWideningObserved: Number(built?.temporalCandidateBatchCount ?? 1) > 1, initialBatchSelectableBranchCount: (built?.branches ?? []).filter((branch: any)=>branch.status === "candidate" && Number(branch.anchorPlacementEvidence?.candidateRankWithinWindow ?? 0) < Number(anchorExplorationBudget?.initialTemporalCandidateBatchSize ?? 8)).length, widenedBatchSelectableBranchCount: (built?.branches ?? []).filter((branch: any)=>branch.status === "candidate" && Number(branch.anchorPlacementEvidence?.candidateRankWithinWindow ?? 0) >= Number(anchorExplorationBudget?.initialTemporalCandidateBatchSize ?? 8)).length, branchEvaluationCount: built?.branchEvaluationCount ?? (built?.branches ?? []).length, resourceAlternativeRoundCount: built?.resourceAlternativeRoundCount ?? 0, firstSelectableTemporalCandidateIndex: (built?.branches ?? []).filter((branch:any)=>branch.status === "candidate").map((branch:any)=>Number(branch.anchorPlacementEvidence?.candidateRankWithinWindow)).filter(Number.isFinite).sort((a:number,b:number)=>a-b)[0] ?? null, unscannedTemporalCandidateCount: Math.max(0, Number(built?.temporalCandidatesAvailable ?? 0) - Number(built?.temporalCandidatesScanned ?? 0)), allConfiguredTemporalCandidatesExhausted: built?.allConfiguredTemporalCandidatesExhausted ?? true, anchorExplorationStopReason: built?.anchorExplorationStopReason ?? "NO_HARD_VALID_BRANCH", anchorExplorationFingerprint: built?.anchorExplorationFingerprint ?? null, anchorTemporalCandidateCount, feasibleAnchorTemporalCandidateCount, rejectedAnchorTemporalCandidateCount, alternativeAnchorTemporalCandidateCount, endAlignedCandidateRejectedCount, alternativeCandidateReachedRecursiveSearchCount,
    taskWindowConflictCount, protectedIntervalConflictCount, contestantOverlapConflictCount, spaceOverlapConflictCount, resourceOverlapConflictCount, assignmentSearchBudgetExhaustedCount,
    taskWindowConflictDetails,
    contestantConflictTaskIds: [...contestantConflictTaskIds].filter(Number.isFinite).sort((a,b)=>a-b),
    spaceConflictTaskIds: [...spaceConflictTaskIds].filter(Number.isFinite).sort((a,b)=>a-b),
    resourceConflictTaskIds: [...resourceConflictTaskIds].filter(Number.isFinite).sort((a,b)=>a-b),
    protectedIntervalConflictIds: [...protectedIntervalConflictIds].sort(),
    dependencyLowerBoundTaskIds: [...dependencyLowerBoundTaskIds].filter(Number.isFinite).sort((a,b)=>a-b),
    dependencyUpperBoundTaskIds: [...dependencyUpperBoundTaskIds].filter(Number.isFinite).sort((a,b)=>a-b),
    causalConflictTaskIds: [...causalConflictTaskIds].filter(Number.isFinite).sort((a,b)=>a-b),
    repairableConflictTaskIds: [...causalConflictTaskIds].filter(Number.isFinite).sort((a,b)=>a-b),
    immutableConflictTaskIds: [],
    causalConflictEvidenceComplete: causalConflictEvidenceIncompleteBranchCount === 0,
    causalConflictEvidenceIncompleteBranchCount,
    causalConflictEvidenceFingerprint: createHash("sha256").update(stableStringify(causalFingerprints.sort())).digest("hex"),
    unsupportedRequirementCodes: [...unsupportedRequirementCodes].sort(),
    diagnosticsComplete: missing.length === 0 && (built?.branches ?? []).every((branch: any) => !branch.rejectionReason || branch.anchorPlacementEvidence || branch.searchEvidence || (branch.blockers ?? []).length > 0),
    missingDiagnosticFields: missing.sort(),
    fingerprint: "",
    readOnly: true as const,
  };
  diagnostics.fingerprint = createHash("sha256").update(stableStringify({ ...diagnostics, fingerprint: undefined })).digest("hex");
  return diagnostics;
}

export function materializeInitialConstructionAnchorAttempt(args: { originInput: EngineInput; originOperationalState: OperationalState; stage: any; anchor?: any | null; baseProvisionalAssignments?: readonly CandidateAssignment[]; provisionallySatisfiedTaskIds?: readonly number[]; closureTaskIds?: readonly number[]; maxBranches?: number; reasoningBudget?: ReasoningBudgetProfile | null; createdAt?: string | null; requireFutureFeasibility?: (branch: InitialConstructionBranch) => any | null }) {
  const anchorTaskId = Number(args.anchor?.anchorTaskId ?? args.stage?.selectedAnchor?.anchorTaskId ?? args.stage?.selectedAnchorTaskId);
  const stage = { ...args.stage, selectedAnchor: args.anchor ?? args.stage?.selectedAnchor ?? { anchorTaskId }, selectedAnchorTaskId: anchorTaskId };
  const anchorExplorationBudget = resolveInitialConstructionAnchorExplorationBudget({ reasoningBudget: args.reasoningBudget, maxBranches: args.maxBranches ?? resolveInitialConstructionAnchorBranchLimit(args.reasoningBudget) });
  const built = buildInitialConstructionBranches({ input: args.originInput, originOperationalState: args.originOperationalState, stage1: stage, maxBranches: anchorExplorationBudget.maxBranchEvaluationsPerAnchor, reasoningBudget: args.reasoningBudget, baseProvisionalAssignments: args.baseProvisionalAssignments, closureTaskIds: args.closureTaskIds });
  const attempts: any[] = [];
  const selectable: any[] = [];
  let transformationsExecuted = 0, simulationsExecuted = 0, validationsExecuted = 0, hardValidBranchCount = 0;
  let combinedDependencyPrecheckCount = 0, combinedDependencyPrecheckRejectedCount = 0, combinedDependencyPrecheckViolationCount = 0;

  for (const branch of built.branches) {
    const ev = branch.searchEvidence;
    const attempt: any = { branchId: branch.branchId, status: branch.status, assignmentCount: branch.assignments.length, rejectionReason: branch.rejectionReason ?? null, validation: null, partialPlanId: null, branchAssignmentsFingerprint: null, candidateAssignmentsFingerprint: null, simulatedAssignmentsFingerprint: null, lineageCoherent: null, closureComplete: ev?.closureComplete ?? null, placementAttemptCount: ev?.placementAttemptCount ?? 0, temporalCandidateCount: ev?.temporalCandidateCount ?? 0, resourceAlternativeCount: ev?.resourceAlternativeCount ?? 0, recursiveBacktrackCount: ev?.recursiveBacktrackCount ?? 0, temporalDecisionBacktrackCount: ev?.temporalDecisionBacktrackCount ?? 0, resourceDecisionBacktrackCount: ev?.resourceDecisionBacktrackCount ?? 0, backtrackEventsSample: ev?.backtrackEventsSample ?? [], repeatedStatePruneCount: ev?.repeatedStatePruneCount ?? 0, searchDepthReached: ev?.searchDepthReached ?? 0, budgetExhausted: ev?.budgetExhausted ?? false, deadEndReasonCounts: ev?.deadEndReasonCounts ?? {}, assignmentSearchFingerprint: ev?.assignmentSearchFingerprint ?? null, placementFeasibilityVersion: ev?.placementFeasibilityVersion ?? null, taskWindowConflictCount: ev?.taskWindowConflictCount ?? 0, protectedIntervalConflictCount: ev?.protectedIntervalConflictCount ?? 0, contestantOverlapConflictCount: ev?.contestantOverlapConflictCount ?? 0, spaceOverlapConflictCount: ev?.spaceOverlapConflictCount ?? 0, resourceOverlapConflictCount: ev?.resourceOverlapConflictCount ?? 0, anchorPlacementEvidence: branch.anchorPlacementEvidence ?? null };
    if (branch.status !== "candidate") { attempts.push(attempt); continue; }
    const closureIds = new Set(built.closureTaskIds); const assignedIds = branch.assignments.map((assignment) => assignment.taskId); const uniqueAssignedIds = new Set(assignedIds);
    const closureIntegrityOk = ev?.closureComplete === true && assignedIds.length === built.closureTaskIds.length && uniqueAssignedIds.size === built.closureTaskIds.length && assignedIds.every((taskId) => closureIds.has(taskId)) && built.closureTaskIds.every((taskId) => uniqueAssignedIds.has(taskId)) && !!ev?.assignmentSearchFingerprint;
    if (!closureIntegrityOk) { attempt.rejectionReason = "CLOSURE_ASSIGNMENT_INTEGRITY_FAILED"; attempts.push(attempt); continue; }
    const baseAssignments = (args.baseProvisionalAssignments ?? []).map((entry: any) => ({ taskId: entry.taskId, startPlanned: entry.startPlanned, endPlanned: entry.endPlanned, spaceId: entry.spaceId ?? null, resourceIds: [...(entry.resourceIds ?? entry.assignedResourceIds ?? [])] }));
    const depPrecheck = evaluateInitialConstructionCombinedDependencyCompatibility({ input: args.originInput, baseAssignments, branchAssignments: branch.assignments });
    combinedDependencyPrecheckCount += 1;
    combinedDependencyPrecheckViolationCount += depPrecheck.violationCount;
    attempt.combinedDependencyPrecheck = depPrecheck;
    if (!depPrecheck.compatible) { attempt.rejectionReason = "DEPENDENCY_CONFLICT"; combinedDependencyPrecheckRejectedCount += 1; attempts.push(attempt); continue; }
    const candidate = branchToCandidate(branch);
    const partialPlanResult = composePartialPlans([candidate], { createdAt: args.createdAt ?? null, maxPartialPlans: 1 });
    const transformationResult = buildCandidateStates(args.originOperationalState, [candidate], { createdAt: args.createdAt ?? null, maxTransformations: 1 });
    const candidateState = transformationResult.candidateStates[0] ?? null;
    const simulationResult = simulateCandidateStates(args.originOperationalState, transformationResult.candidateStates, { createdAt: args.createdAt ?? null, maxSimulations: 1 });
    const simulatedState = simulationResult.simulatedStates[0] ?? null;
    const validationResult = validateSimulatedStates(simulationResult.simulatedStates, { createdAt: args.createdAt ?? null });
    const validation = validationResult.validationResults[0] ?? null;
    transformationsExecuted += transformationResult.summary.transformedCount; simulationsExecuted += simulationResult.summary.simulatedCount; validationsExecuted += validationResult.validationResults.length;
    attempt.partialPlanId = partialPlanResult.partialPlans[0]?.partialPlanId ?? null; attempt.validation = validationSummary(validation); attempt.branchAssignmentsFingerprint = initialConstructionAssignmentFingerprint(branch.assignments); attempt.candidateAssignmentsFingerprint = initialConstructionAssignmentFingerprint(candidate.assignments); attempt.simulatedAssignmentsFingerprint = simulatedState ? initialConstructionAssignmentFingerprint(simulatedAssignmentsFor(simulatedState.operationalStateSnapshot as OperationalState, branch)) : null;
    attempt.lineageCoherent = attempt.branchAssignmentsFingerprint === attempt.candidateAssignmentsFingerprint && attempt.branchAssignmentsFingerprint === attempt.simulatedAssignmentsFingerprint && partialPlanResult.partialPlans[0]?.candidateIds.length === 1 && partialPlanResult.partialPlans[0]?.candidateIds[0] === candidate.id && candidateState?.candidateId === candidate.id && simulatedState?.candidateStateId === candidateState?.id && validation?.simulatedStateId === simulatedState?.id;
    if (!attempt.lineageCoherent) { attempt.rejectionReason = "LINEAGE_INCOHERENT"; attempts.push(attempt); continue; }
    if (validation?.result === "VALID") { hardValidBranchCount += 1; const future = args.requireFutureFeasibility?.(branch) ?? null; attempt.futureFeasibility = future; if (future?.status === "INFEASIBLE") attempt.rejectionReason = "future-infeasible"; else selectable.push({ branch, partialPlanId: attempt.partialPlanId, validation, futureFeasibility: future, simulatedState }); } else attempt.rejectionReason = "hard-invalid";
    attempts.push(attempt);
  }
  selectable.sort((a, b) => (minutes(a.branch.assignments.find((assignment: any) => assignment.taskId === built.selectedAnchorTaskId)?.endPlanned) ?? 9999) - (minutes(b.branch.assignments.find((assignment: any) => assignment.taskId === built.selectedAnchorTaskId)?.endPlanned) ?? 9999) || a.branch.branchId.localeCompare(b.branch.branchId));
  const selected = selectable[0] ?? null;
  const diagnostics = buildAttemptDiagnostics(anchorTaskId, stage, built, attempts, hardValidBranchCount, anchorExplorationBudget);
  const allAssigned = [...(args.originOperationalState.planning ?? []).map((entry: any) => ({ taskId: entry.taskId, startPlanned: entry.startPlanned, endPlanned: entry.endPlanned, spaceId: entry.spaceId ?? null, resourceIds: [...(entry.assignedResourceIds ?? [])] })), ...(args.baseProvisionalAssignments ?? [])];
  const dependencyBounds = resolveInitialConstructionDependencyTemporalBounds({ input: args.originInput, taskId: anchorTaskId, assignments: allAssigned as any, provisionallySatisfiedTaskIds: args.provisionallySatisfiedTaskIds });
  const dependencyEvidence = { dependencyTemporalBoundsVersion: "initial-construction-dependency-temporal-bounds-v1", assignedPrerequisiteBoundCount: dependencyBounds.assignedPrerequisiteTaskIds.length, assignedDependentBoundCount: dependencyBounds.assignedDependentTaskIds.length, dependencyBoundedTemporalCandidateCount: (built.branches ?? []).filter((b:any)=>b.anchorPlacementEvidence?.sourceKinds?.some((s:string)=>s === "assigned-prerequisite-end" || s === "assigned-dependent-start")).length, contradictoryDependencyBoundCount: dependencyBounds.hasContradictoryBounds ? 1 : 0, combinedDependencyPrecheckCount, combinedDependencyPrecheckRejectedCount, combinedDependencyPrecheckViolationCount, provisionallySatisfiedDependencyAudit: dependencyBounds.provisionallySatisfiedDependencyAudit, firstDependencyBoundAcceptedAnchorTaskId: (selectable ?? []).some((opt:any)=>opt.branch?.anchorPlacementEvidence?.sourceKinds?.some((s:string)=>s === "assigned-prerequisite-end" || s === "assigned-dependent-start")) ? anchorTaskId : null };
  return deepFreeze({ version: "MATERIALIZE-INITIAL-CONSTRUCTION-ANCHOR-ATTEMPT-V1", anchorTaskId, built, branches: built.branches, attempts, selectable, selected, diagnostics: { ...diagnostics, ...dependencyEvidence }, ...dependencyEvidence, hardValidBranchCount, attemptedBranchCount: built.branches.length, branchCount: diagnostics.branchCount, candidateBranchCount: diagnostics.candidateBranchCount, transformationsExecuted, simulationsExecuted, validationsExecuted, readOnly: true }) as any;
}
