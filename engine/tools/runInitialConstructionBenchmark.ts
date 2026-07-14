import { readFileSync } from "node:fs";
import { parseEngineScenarioSnapshot, cloneEngineScenarioValue } from "../scenarioSnapshot";
import { buildOperationalStateFromEngineInput } from "../orc/adapters/fromEngineInput";
import { runInitialConstructionStage1 } from "../orc/active/runInitialConstructionStage1";
import { runInitialConstructionStage2FirstPartialPlan } from "../orc/active/runInitialConstructionStage2FirstPartialPlan";
import { runInitialConstructionIterativeSession } from "../orc/active/runInitialConstructionIterativeSession";

export interface InitialConstructionBenchmarkResult {
  exclusiveConstructiveRuntimeMs: number;
  assignmentsReached: number;
  cycles: number;
  stopReason: string | null;
  budgetLimitReached: string | null;
  sessionFingerprint: string | null;
  finalCombinedAssignmentsFingerprint: string | null;
  finalValidationResult: string | null;
  exactEligibleAnchorCountAtStop: number | null;
  terminalAnchorsScanned: number | null;
  allEligibleAnchorsExhausted: boolean | null;
  terminalBlockerCodeCounts: Record<string, number>;
  terminalBlockerEvidenceComplete: boolean | null;
  terminalBlockerEvidenceIncompleteAnchorCount: number | null;
  terminalBlockerEvidenceFingerprint: string | null;
  terminalPrimaryBlockerCodeCounts: Record<string, number>;
  terminalDeadEndReasonCounts: Record<string, number>;
  terminalBlockedAnchorSample: unknown[];
  runtimeTelemetry: unknown;
  widenedAnchorAttemptCount: number;
  widenedAnchorAcceptedCount: number;
  maxTemporalCandidatesScannedForAnyAnchor: number;
  temporalCandidateBatchesExecuted: number;
  branchEvaluationsAfterInitialBatch: number;
  firstWidenedAcceptedAnchorTaskId: number | null;
  dependencyBoundedTemporalCandidateCount: number;
  combinedDependencyPrecheckCount: number;
  combinedDependencyPrecheckRejectedCount: number;
  combinedDependencyPrecheckViolationCount: number;
  contradictoryDependencyBoundCount: number;
  firstDependencyBoundAcceptedAnchorTaskId: number | null;

  productiveAssignmentsReached: number;
  productiveTasksRemaining: number;
  repairExecuted: boolean;
  repairRoundCount: number;
  repairAttemptCount: number;
  repairAcceptedCount: number;
  acceptedPartialPlanBacktrackCount: number;
  candidateEjectionSetCount: number;
  acceptedBlockedAnchorTaskIds: number[];
  acceptedEjectionTaskIds: number[];
  acceptedRepairDependencyClosureTaskIds: number[];
  productiveAssignmentDelta: number;
  protectedAssignmentsModified: boolean;
  outsideNeighborhoodAssignmentsModified: number;
  repairStopReason: string | null;
  repairFingerprint: string | null;
  commitsExecuted: number;
  v4SeedUsed: boolean;
  /** @deprecated use sessionFingerprint */
  fingerprint: string | null;
}

export function runInitialConstructionBenchmarkFromInput(input: any, reasoningBudget: Record<string, unknown> = {}): InitialConstructionBenchmarkResult {
  const originInput = cloneEngineScenarioValue(input);
  const originOperationalState = buildOperationalStateFromEngineInput(originInput as any);
  const started = performance.now();
  const stage1 = runInitialConstructionStage1({ originInput, originOperationalState, createdAt: "benchmark" });
  const stage2 = runInitialConstructionStage2FirstPartialPlan({ originInput, originOperationalState, stage1, createdAt: "benchmark" });
  const session = runInitialConstructionIterativeSession({ originInput, originOperationalState, stage1, stage2, reasoningBudget: reasoningBudget as any, createdAt: "benchmark" });
  const ended = performance.now();
  const repair = session.evidence?.initialConstructionConflictDirectedRepair ?? {};
  return {
    exclusiveConstructiveRuntimeMs: Math.round(ended - started),
    assignmentsReached: session.evidence?.finalCombinedAssignmentCount ?? stage2.selectedAssignmentCount ?? 0,
    cycles: session.evidence?.acceptedCycleCount ?? 0,
    stopReason: session.evidence?.stopReason ?? null,
    budgetLimitReached: session.evidence?.budgetLimitReached ?? null,
    sessionFingerprint: session.evidence?.sessionFingerprint ?? null,
    finalCombinedAssignmentsFingerprint: session.evidence?.finalCombinedAssignmentsFingerprint ?? null,
    finalValidationResult: session.evidence?.finalCombinedValidationResult ?? null,
    exactEligibleAnchorCountAtStop: session.evidence?.terminalCycle?.eligibleAnchorCount ?? null,
    terminalAnchorsScanned: session.evidence?.terminalCycle?.anchorRanksScanned ?? null,
    allEligibleAnchorsExhausted: session.evidence?.terminalCycle?.allEligibleAnchorsExhausted ?? null,
    terminalBlockerCodeCounts: session.evidence?.terminalCycle?.terminalBlockerCodeCounts ?? {},
    terminalBlockerEvidenceComplete: session.evidence?.terminalBlockerEvidenceComplete ?? null,
    terminalBlockerEvidenceIncompleteAnchorCount: session.evidence?.terminalBlockerEvidenceIncompleteAnchorCount ?? null,
    terminalBlockerEvidenceFingerprint: session.evidence?.terminalBlockerEvidenceFingerprint ?? null,
    terminalPrimaryBlockerCodeCounts: session.evidence?.terminalPrimaryBlockerCodeCounts ?? {},
    terminalDeadEndReasonCounts: session.evidence?.terminalDeadEndReasonCounts ?? {},
    terminalBlockedAnchorSample: session.evidence?.terminalBlockedAnchorSample ?? [],
    runtimeTelemetry: { ...(session.evidence?.runtimeTelemetry ?? {}), exclusiveConstructiveRuntimeMs: Math.round(ended - started) },
    widenedAnchorAttemptCount: session.evidence?.widenedAnchorAttemptCount ?? 0,
    widenedAnchorAcceptedCount: session.evidence?.widenedAnchorAcceptedCount ?? 0,
    maxTemporalCandidatesScannedForAnyAnchor: session.evidence?.maxTemporalCandidatesScannedForAnyAnchor ?? 0,
    temporalCandidateBatchesExecuted: session.evidence?.temporalCandidateBatchesExecuted ?? 0,
    branchEvaluationsAfterInitialBatch: session.evidence?.branchEvaluationsAfterInitialBatch ?? 0,
    firstWidenedAcceptedAnchorTaskId: session.evidence?.firstWidenedAcceptedAnchorTaskId ?? null,
    dependencyBoundedTemporalCandidateCount: session.evidence?.dependencyBoundedTemporalCandidateCount ?? 0,
    combinedDependencyPrecheckCount: session.evidence?.combinedDependencyPrecheckCount ?? 0,
    combinedDependencyPrecheckRejectedCount: session.evidence?.combinedDependencyPrecheckRejectedCount ?? 0,
    combinedDependencyPrecheckViolationCount: session.evidence?.combinedDependencyPrecheckViolationCount ?? 0,
    contradictoryDependencyBoundCount: session.evidence?.contradictoryDependencyBoundCount ?? 0,
    firstDependencyBoundAcceptedAnchorTaskId: session.evidence?.firstDependencyBoundAcceptedAnchorTaskId ?? null,
    productiveAssignmentsReached: session.evidence?.finalCombinedAssignmentCount ?? stage2.selectedAssignmentCount ?? 0,
    productiveTasksRemaining: session.evidence?.productiveTasksRemaining ?? 0,
    repairExecuted: repair.repairExecuted ?? repair.executed ?? false,
    repairRoundCount: repair.repairRoundCount ?? 0,
    repairAttemptCount: repair.repairAttemptCount ?? 0,
    repairAcceptedCount: repair.repairAcceptedCount ?? 0,
    acceptedPartialPlanBacktrackCount: repair.acceptedPartialPlanBacktrackCount ?? 0,
    candidateEjectionSetCount: repair.candidateEjectionSetCount ?? 0,
    acceptedBlockedAnchorTaskIds: repair.acceptedBlockedAnchorTaskIds ?? [],
    acceptedEjectionTaskIds: repair.acceptedEjectionTaskIds ?? [],
    acceptedRepairDependencyClosureTaskIds: repair.acceptedRepairDependencyClosureTaskIds ?? [],
    productiveAssignmentDelta: repair.productiveAssignmentDelta ?? 0,
    protectedAssignmentsModified: repair.protectedAssignmentsModified ?? false,
    outsideNeighborhoodAssignmentsModified: repair.outsideNeighborhoodAssignmentsModified ?? 0,
    repairStopReason: repair.repairLogicalStopReason ?? repair.stopReason ?? null,
    repairFingerprint: repair.repairFingerprint ?? null,
    commitsExecuted: repair.commitsExecuted ?? session.evidence?.commitsExecuted ?? 0,
    v4SeedUsed: repair.v4SeedUsed ?? session.evidence?.v4SeedUsed ?? false,
    fingerprint: session.evidence?.sessionFingerprint ?? null,
  };
}

export function runInitialConstructionBenchmarkSnapshot(snapshotPath: string, reasoningBudget: Record<string, unknown> = {}) {
  const snapshot = parseEngineScenarioSnapshot(readFileSync(snapshotPath));
  return runInitialConstructionBenchmarkFromInput(snapshot.engineInput, reasoningBudget);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const snapshotPath = process.argv[2];
  if (!snapshotPath) {
    console.error("Usage: tsx engine/tools/runInitialConstructionBenchmark.ts <snapshot.json> [budgetJson]");
    process.exit(1);
  }
  const budget = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  console.log(JSON.stringify(runInitialConstructionBenchmarkSnapshot(snapshotPath, budget), null, 2));
}
