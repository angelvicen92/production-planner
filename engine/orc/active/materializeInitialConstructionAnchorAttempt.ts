import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState, ReasoningBudgetProfile, ValidationResult } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { buildInitialConstructionBranches, branchToCandidate, type InitialConstructionBranch } from "../see/initialConstructionBranchBuilder";
import { composePartialPlans } from "../see/partialPlanComposer";
import { buildCandidateStates } from "../transformation/transformationEngine";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import { validateSimulatedStates } from "../validation/validationEngine";
import type { InitialConstructionAnchorAttemptDiagnostics } from "./initialConstructionAnchorBlockerClassifier";

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

function buildAttemptDiagnostics(anchorTaskId: number, stage: any, built: any, attempts: any[], hardValidBranchCount: number): InitialConstructionAnchorAttemptDiagnostics {
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
  const unsupportedRequirementCodes = new Set<string>();
  let taskWindowConflictCount = 0, protectedIntervalConflictCount = 0, contestantOverlapConflictCount = 0, spaceOverlapConflictCount = 0, resourceOverlapConflictCount = 0, assignmentSearchBudgetExhaustedCount = 0;
  for (const branch of built?.branches ?? []) {
    inc(branchStatusCounts, String(branch.status ?? "unknown"));
    if (branch.rejectionReason) inc(branchRejectionReasonCounts, String(branch.rejectionReason));
    for (const code of branch.unsupportedRequirementCodes ?? []) unsupportedRequirementCodes.add(String(code));
  }
  for (const attempt of attempts) {
    if (attempt.rejectionReason) inc(branchRejectionReasonCounts, String(attempt.rejectionReason));
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
    taskWindowConflictCount, protectedIntervalConflictCount, contestantOverlapConflictCount, spaceOverlapConflictCount, resourceOverlapConflictCount, assignmentSearchBudgetExhaustedCount,
    unsupportedRequirementCodes: [...unsupportedRequirementCodes].sort(),
    diagnosticsComplete: missing.length === 0,
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
  const built = buildInitialConstructionBranches({ input: args.originInput, originOperationalState: args.originOperationalState, stage1: stage, maxBranches: args.maxBranches ?? 8, reasoningBudget: args.reasoningBudget, baseProvisionalAssignments: args.baseProvisionalAssignments, closureTaskIds: args.closureTaskIds });
  const attempts: any[] = [];
  const selectable: any[] = [];
  let transformationsExecuted = 0, simulationsExecuted = 0, validationsExecuted = 0, hardValidBranchCount = 0;

  for (const branch of built.branches) {
    const ev = branch.searchEvidence;
    const attempt: any = { branchId: branch.branchId, status: branch.status, assignmentCount: branch.assignments.length, rejectionReason: branch.rejectionReason ?? null, validation: null, partialPlanId: null, branchAssignmentsFingerprint: null, candidateAssignmentsFingerprint: null, simulatedAssignmentsFingerprint: null, lineageCoherent: null, closureComplete: ev?.closureComplete ?? null, placementAttemptCount: ev?.placementAttemptCount ?? 0, temporalCandidateCount: ev?.temporalCandidateCount ?? 0, resourceAlternativeCount: ev?.resourceAlternativeCount ?? 0, recursiveBacktrackCount: ev?.recursiveBacktrackCount ?? 0, temporalDecisionBacktrackCount: ev?.temporalDecisionBacktrackCount ?? 0, resourceDecisionBacktrackCount: ev?.resourceDecisionBacktrackCount ?? 0, backtrackEventsSample: ev?.backtrackEventsSample ?? [], repeatedStatePruneCount: ev?.repeatedStatePruneCount ?? 0, searchDepthReached: ev?.searchDepthReached ?? 0, budgetExhausted: ev?.budgetExhausted ?? false, deadEndReasonCounts: ev?.deadEndReasonCounts ?? {}, assignmentSearchFingerprint: ev?.assignmentSearchFingerprint ?? null, placementFeasibilityVersion: ev?.placementFeasibilityVersion ?? null, taskWindowConflictCount: ev?.taskWindowConflictCount ?? 0, protectedIntervalConflictCount: ev?.protectedIntervalConflictCount ?? 0, contestantOverlapConflictCount: ev?.contestantOverlapConflictCount ?? 0, spaceOverlapConflictCount: ev?.spaceOverlapConflictCount ?? 0, resourceOverlapConflictCount: ev?.resourceOverlapConflictCount ?? 0 };
    if (branch.status !== "candidate") { attempts.push(attempt); continue; }
    const closureIds = new Set(built.closureTaskIds); const assignedIds = branch.assignments.map((assignment) => assignment.taskId); const uniqueAssignedIds = new Set(assignedIds);
    const closureIntegrityOk = ev?.closureComplete === true && assignedIds.length === built.closureTaskIds.length && uniqueAssignedIds.size === built.closureTaskIds.length && assignedIds.every((taskId) => closureIds.has(taskId)) && built.closureTaskIds.every((taskId) => uniqueAssignedIds.has(taskId)) && !!ev?.assignmentSearchFingerprint;
    if (!closureIntegrityOk) { attempt.rejectionReason = "CLOSURE_ASSIGNMENT_INTEGRITY_FAILED"; attempts.push(attempt); continue; }
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
  const diagnostics = buildAttemptDiagnostics(anchorTaskId, stage, built, attempts, hardValidBranchCount);
  return deepFreeze({ version: "MATERIALIZE-INITIAL-CONSTRUCTION-ANCHOR-ATTEMPT-V1", anchorTaskId, built, branches: built.branches, attempts, selectable, selected, diagnostics, hardValidBranchCount, attemptedBranchCount: built.branches.length, branchCount: diagnostics.branchCount, candidateBranchCount: diagnostics.candidateBranchCount, transformationsExecuted, simulationsExecuted, validationsExecuted, readOnly: true }) as any;
}
