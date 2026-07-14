import { readFileSync, writeFileSync } from "node:fs";
import {
  cloneEngineScenarioValue,
  parseEngineScenarioSnapshot,
} from "./engine/scenarioSnapshot";
import { buildOperationalStateFromEngineInput } from "./engine/orc/adapters/fromEngineInput";
import { runInitialConstructionStage1 } from "./engine/orc/active/runInitialConstructionStage1";
import { runInitialConstructionStage2FirstPartialPlan } from "./engine/orc/active/runInitialConstructionStage2FirstPartialPlan";
import { runInitialConstructionIterativeSession } from "./engine/orc/active/runInitialConstructionIterativeSession";

const snapshot = parseEngineScenarioSnapshot(
  readFileSync(
    "local_engine_scenarios/optiplan-plan-27-engine-scenario-v1.json",
  ),
);

const originInput = cloneEngineScenarioValue(snapshot.engineInput);
const originOperationalState =
  buildOperationalStateFromEngineInput(originInput);

const stage1 = runInitialConstructionStage1({
  originInput,
  originOperationalState,
  createdAt: "id293-direct-evidence",
});

const stage2 = runInitialConstructionStage2FirstPartialPlan({
  originInput,
  originOperationalState,
  stage1,
  createdAt: "id293-direct-evidence",
});

const session = runInitialConstructionIterativeSession({
  originInput,
  originOperationalState,
  stage1,
  stage2,
  reasoningBudget: {
    maxAcceptedCycles: 48,
    maxElapsedMs: 60000,
    anchorBatchSize: 12,
    maxAnchorRanksScannedPerCycle: 128,
  } as any,
  createdAt: "id293-direct-evidence",
});

const evidence = session.evidence;
const previous = JSON.parse(
  readFileSync(
    "plan-27-orc-anchor-temporal-search-acceptance-v1.json",
    "utf8",
  ),
);

const structuralMatch =
  evidence.sessionFingerprint === previous.runs[0].sessionFingerprint &&
  evidence.finalCombinedAssignmentsFingerprint ===
    previous.runs[0].finalCombinedAssignmentsFingerprint;

const acceptanceGatePassed =
  structuralMatch &&
  evidence.finalCombinedAssignmentCount > 69 &&
  evidence.acceptedCycleCount > 30 &&
  evidence.alternativeAnchorCandidatesAccepted > 0 &&
  evidence.finalCombinedValidationResult === "VALID" &&
  evidence.commitsExecuted === 0 &&
  evidence.v4SeedUsed === false;

const output = {
  version: "PLAN-27-ORC-ID293-DIRECT-EVIDENCE-V1",
  acceptanceGatePassed,
  structuralMatch,
  finalCombinedAssignmentCount: evidence.finalCombinedAssignmentCount,
  acceptedCycleCount: evidence.acceptedCycleCount,
  stopReason: evidence.stopReason,
  budgetLimitReached: evidence.budgetLimitReached,
  finalCombinedValidationResult:
    evidence.finalCombinedValidationResult,
  anchorTemporalCandidatesGenerated:
    evidence.anchorTemporalCandidatesGenerated,
  alternativeAnchorCandidatesAttempted:
    evidence.alternativeAnchorCandidatesAttempted,
  alternativeAnchorCandidatesAccepted:
    evidence.alternativeAnchorCandidatesAccepted,
  endAlignedCandidatesRejected:
    evidence.endAlignedCandidatesRejected,
  firstAcceptedAlternativeAnchorCandidateCycle:
    evidence.firstAcceptedAlternativeAnchorCandidateCycle,
  firstAcceptedAlternativeAnchorTaskId:
    evidence.firstAcceptedAlternativeAnchorTaskId,
  terminalAnchorPlacementReasonCounts:
    evidence.terminalAnchorPlacementReasonCounts,
  finalResidualPendingTaskCount:
    evidence.finalResidualPendingTaskCount,
  finalResidualProductiveTaskCount:
    evidence.finalResidualProductiveTaskCount,
  sessionFingerprint: evidence.sessionFingerprint,
  finalCombinedAssignmentsFingerprint:
    evidence.finalCombinedAssignmentsFingerprint,
  commitsExecuted: evidence.commitsExecuted,
  v4SeedUsed: evidence.v4SeedUsed,
  publicPlanningUsesIterativeSession:
    evidence.publicPlanningUsesIterativeSession,
};

writeFileSync(
  "plan-27-orc-id293-direct-evidence-v1.json",
  JSON.stringify(output, null, 2),
);

console.log(JSON.stringify(output, null, 2));

if (!acceptanceGatePassed) {
  process.exitCode = 1;
}
