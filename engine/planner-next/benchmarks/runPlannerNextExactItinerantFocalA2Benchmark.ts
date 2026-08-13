import assert from "node:assert/strict";
import { constructExactMainAndFeederCore } from "../exactMainAndFeederCore";
import { executePlannerNext } from "../executePlannerNext";
import { evaluateParticipantItineraryQuality } from "../participantItineraryQuality";
import { validatePlan } from "../validate";
import { evaluateFocalA2RealityUnits } from "./focal-a2/evaluateFocalA2RealityUnits";
import {
  createAcceptedExactConstructiveFocalA2Problem,
  focalA2ExactConstructiveEvidence,
} from "./focal-a2/focalA2ExactConstructiveConfiguration";
import {
  itinerantOperationProfiles,
  realityReferenceValidation,
} from "./focal-a2/focalA2RealityReference";

function reversedProblem() {
  const problem = createAcceptedExactConstructiveFocalA2Problem(
    [...itinerantOperationProfiles].reverse(),
  );
  problem.tasks.reverse();
  problem.participants.reverse();
  problem.spaces.reverse();
  problem.resources.reverse();
  problem.anchoredAccompaniments?.reverse();
  return problem;
}

const problem = createAcceptedExactConstructiveFocalA2Problem();
const before = JSON.stringify(problem);
const started = performance.now();
const firstExecution = executePlannerNext(problem);
const runtimeMs = performance.now() - started;
const secondProblem = createAcceptedExactConstructiveFocalA2Problem();
const secondExecution = executePlannerNext(secondProblem);
const reversedExecution = executePlannerNext(reversedProblem());
for (const execution of [firstExecution, secondExecution, reversedExecution]) {
  assert.equal(execution.kind, "EXACT_CONSTRUCTIVE");
  assert.equal(execution.policyResolution.requestedPolicy, "EXACT_CONSTRUCTIVE");
  assert.equal(execution.policyResolution.effectivePolicy, "EXACT_CONSTRUCTIVE");
  assert.equal(execution.policyResolution.selectionSource, "EXPLICIT");
  assert.equal(execution.policyResolution.compatible, true);
  assert.deepEqual(execution.policyResolution.requiredCapabilities, ["ANCHORED_ACCOMPANIMENT"]);
  assert.deepEqual(execution.policyResolution.supportedCapabilities, ["ANCHORED_ACCOMPANIMENT"]);
  assert.deepEqual(execution.policyResolution.unsupportedCapabilities, []);
  assert.deepEqual(execution.policyResolution.reasonCodes, []);
  assert.deepEqual(execution.policyResolution.warnings, []);
}
assert.equal(firstExecution.kind, "EXACT_CONSTRUCTIVE");
assert.equal(secondExecution.kind, "EXACT_CONSTRUCTIVE");
assert.equal(reversedExecution.kind, "EXACT_CONSTRUCTIVE");
const first = firstExecution.result;
const second = secondExecution.result;
const reversed = reversedExecution.result;
const core = constructExactMainAndFeederCore(problem);
const coreIds = new Set(core.scheduledTasks.map(({ id }) => id));
const resultCore = first.scheduledTasks.filter(({ id }) => coreIds.has(id));
const standaloneIds = new Set(
  itinerantOperationProfiles
    .filter(({ type }) => type === "STANDALONE")
    .map(({ id }) => id),
);
const standalone = first.scheduledTasks.filter(({ id }) =>
  standaloneIds.has(id),
);
const evaluation = evaluateFocalA2RealityUnits(
  first.scheduledTasks,
  JSON.stringify(problem) === before,
);
const validation = validatePlan(
  problem,
  first.scheduledTasks,
  [],
  first.scheduledSpaceMeals,
);
const quality = evaluateParticipantItineraryQuality(problem, first.scheduledTasks).summary;
const artifact = {
  status: first.status,
  runtimeMs,
  policyResolution: firstExecution.policyResolution,
  complete: first.complete,
  configuration: {
    requestedPolicy: focalA2ExactConstructiveEvidence.representativePolicy,
    effectivePolicy: problem.auxiliaryPolicy?.participantPresencePreference,
    fallbackUsed: focalA2ExactConstructiveEvidence.fallbackUsed,
  },
  taskCounts: {
    total: first.scheduledTasks.length,
    main: first.scheduledTasks.filter(({ kind }) => kind === "main").length,
    vocal: first.scheduledTasks.filter(({ kind }) => kind === "vocal").length,
    standalone: standalone.length,
    anchoredSegments: first.scheduledTasks.filter(
      ({ kind, id }) => kind === "auxiliary" && !standaloneIds.has(id),
    ).length,
    remaining: first.remainingTaskIds.length,
  },
  anchoredOperationCount: problem.anchoredAccompaniments?.length ?? 0,
  itinerantOperationCount:
    standalone.length + (problem.anchoredAccompaniments?.length ?? 0),
  productiveMinutes:
    standalone.reduce((sum, task) => sum + task.duration, 0) +
    (problem.anchoredAccompaniments?.length ?? 0) * 45,
  hardValid: validation.hardValid,
  partialOperationCount:
    first.scheduledTasks.length === 0 || evaluation.exactMembershipSatisfied
      ? 0
      : 1,
  inputUnchanged: JSON.stringify(problem) === before,
  deterministic: JSON.stringify(first) === JSON.stringify(second),
  orderInvariant: JSON.stringify(first) === JSON.stringify(reversed),
  isolatedCoreFingerprint: core.evidence.coreFingerprint,
  selectedCoreFingerprint: first.evidence.selectedCoreFingerprint,
  selectedCoreDistributionDiffers: first.complete
    ? JSON.stringify(resultCore) !== JSON.stringify(core.scheduledTasks)
    : null,
  coreCompleteLeavesEvaluated: first.evidence.coreCompleteLeavesEvaluated,
  coreLeavesRejectedByStandalone: first.evidence.coreLeavesRejectedByStandalone,
  standaloneSearchInvocations: first.evidence.standaloneSearchInvocations,
  standaloneBlockingTaskCounts: first.evidence.standaloneBlockingTaskCounts,
  branches: {
    core: first.evidence.coreBranches,
    standalone: first.evidence.standaloneBranches,
    total: first.evidence.branchesExplored,
  },
  backtracks: {
    core: first.evidence.coreBacktracks,
    standalone: first.evidence.standaloneBacktracks,
  },
  maximumDepth: {
    core: first.evidence.coreMaximumDepth,
    standalone: first.evidence.standaloneMaximumDepth,
  },
  completeLeaves: {
    core: first.evidence.coreCompleteLeafCount,
    standalone: first.evidence.standaloneCompleteLeafCount,
  },
  evidence: first.evidence,
  quality,
};
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);

assert.equal(artifact.configuration.requestedPolicy, "LOW");
assert.equal(artifact.configuration.effectivePolicy, "LOW");
assert.equal(artifact.configuration.fallbackUsed, false);
assert.equal(first.status, "COMPLETE");
assert.equal(
  first.scheduledTasks.length,
  realityReferenceValidation.projectedTaskCountWhenSupported,
);
assert.equal(artifact.taskCounts.main, 19);
assert.equal(artifact.taskCounts.vocal, 19);
assert.equal(artifact.taskCounts.standalone, 9);
assert.equal(artifact.taskCounts.anchoredSegments, 6);
assert.equal(artifact.anchoredOperationCount, 3);
assert.equal(artifact.itinerantOperationCount, 12);
assert.equal(artifact.productiveMinutes, 375);
assert.equal(first.remainingTaskIds.length, 0);
assert.equal(validation.hardValid, true);
assert.equal(artifact.partialOperationCount, 0);
assert.equal(
  core.evidence.coreFingerprint,
  "c85b9b2cfbbf9434135f08e2b293b0ab6c23e5ff070e880cbb5406022dd52785",
);
assert.equal(artifact.inputUnchanged, true);
assert.equal(artifact.deterministic, true);
assert.equal(artifact.orderInvariant, true);
assert.ok(first.evidence.fullFingerprint);
assert.equal(first.evidence.fullFingerprint, second.evidence.fullFingerprint);
assert.equal(first.evidence.fullFingerprint, reversed.evidence.fullFingerprint);
assert.ok(first.evidence.selectedCoreFingerprint);
assert.equal(
  first.evidence.selectedCoreFingerprint,
  second.evidence.selectedCoreFingerprint,
);
assert.equal(
  first.evidence.selectedCoreFingerprint,
  reversed.evidence.selectedCoreFingerprint,
);
assert.equal(
  first.evidence.selectedCoreFingerprint,
  "44f10279aa01fa7628c01962e9fbdd819d69486ae11df4fe4851de946600f07f",
);
assert.equal(
  first.evidence.fullFingerprint,
  "b5b1fc1fe3b1813e425b26b22cbf7932604718f1b194eb00a8e909f0937f7357",
);
assert.equal(first.evidence.branchesExplored, 300_000);
assert.equal(first.evidence.coreBranches, 48_071);
assert.equal(first.evidence.standaloneBranches, 251_929);
assert.equal(first.evidence.completePlansObserved, 78);
assert.equal(first.evidence.completeIncumbentReplacements, 2);
assert.equal(first.evidence.completeSelectionMode, "BEST_DOMINATING_WITHIN_BUDGET");
assert.equal(first.evidence.completeSelectionStoppedByBudget, true);
assert.equal(first.evidence.firstCompleteFingerprint, "38309867fb51dcb14515d152035b7076a4738cac04d3d8cea721ec7be0749fa8");
assert.equal(first.evidence.selectedCompleteFingerprint, "b5b1fc1fe3b1813e425b26b22cbf7932604718f1b194eb00a8e909f0937f7357");
assert.equal(quality.qualityFingerprint, "256244c1ccad494ca319d921dfcdc8c696b54a4b16506d42567f2e29abb5657b");
assert.deepEqual({ totalPresence: quality.totalPresenceSpanMinutes, productive: quality.totalProductiveMinutes,
  idle: quality.totalIdleMinutes, maximumPresence: quality.maximumParticipantPresenceSpanMinutes,
  maximumIdle: quality.maximumParticipantIdleMinutes, maximumGap: quality.maximumSingleGapMinutes,
  gaps: quality.totalGapCount, spaceChanges: quality.totalSpaceChangeCount },
{ totalPresence: 3_290, productive: 900, idle: 2_390, maximumPresence: 425,
  maximumIdle: 365, maximumGap: 225, gaps: 28, spaceChanges: 34 });
