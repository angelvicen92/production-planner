import assert from "node:assert/strict";
import test from "node:test";
import type { ScheduledTask } from "./contracts";
import {
  createExactSearchLedger,
  residualMatchingOperationsMayInteract,
  runExactMainAndFeederSearch,
} from "./exactMainAndFeederCore";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";

const scheduled = (overrides: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id: "edge", kind: "auxiliary", participantId: "participant-edge", coachId: "coach-edge",
  duration: 5, start: 20, end: 25, spaceId: "space-edge", dependencies: [],
  requiredResourceIds: ["resource-edge"], ...overrides,
});

test("residual edge invalidation covers every dynamic authority in both dependency directions", () => {
  const edge = scheduled();
  assert.equal(residualMatchingOperationsMayInteract([edge], [scheduled({ id: "added", participantId: edge.participantId, spaceId: "other", coachId: "other", requiredResourceIds: [] })]), true);
  assert.equal(residualMatchingOperationsMayInteract([edge], [scheduled({ id: "added", participantId: "other", spaceId: "other", coachId: edge.coachId, requiredResourceIds: [] })]), true);
  assert.equal(residualMatchingOperationsMayInteract([edge], [scheduled({ id: "added", participantId: "other", spaceId: edge.spaceId, coachId: "other", requiredResourceIds: [] })]), true);
  assert.equal(residualMatchingOperationsMayInteract([edge], [scheduled({ id: "added", participantId: "other", spaceId: "other", coachId: "other", requiredResourceIds: edge.requiredResourceIds })]), true);
  assert.equal(residualMatchingOperationsMayInteract([edge], [scheduled({ id: "added", participantId: "other", spaceId: "other", coachId: "other", requiredResourceIds: [], dependencies: [edge.id] })]), true);
  assert.equal(residualMatchingOperationsMayInteract([{ ...edge, dependencies: ["added"] }], [scheduled({ id: "added", participantId: "other", spaceId: "other", coachId: "other", requiredResourceIds: [] })]), true);
});

test("an unrelated operation is a structurally proven cache hit", () => {
  const edge = scheduled();
  const unrelated = scheduled({ id: "unrelated", participantId: "participant-other", coachId: "coach-other",
    spaceId: "space-other", requiredResourceIds: ["resource-other"] });
  assert.equal(residualMatchingOperationsMayInteract([edge], [unrelated]), false);
});

test("incremental certificates have exact full-recompute parity without false pruning", () => {
  for (const mutate of [
    (problem: ReturnType<typeof mainFlowVocalScenario>) => problem,
    (problem: ReturnType<typeof mainFlowVocalScenario>) => {
      problem.tasks.find(({ kind }) => kind === "main")!.availability = [{ start: problem.day.start, end: problem.day.start + 1 }];
      return problem;
    },
  ]) {
    const incrementalProblem = mutate(mainFlowVocalScenario());
    const fullProblem = structuredClone(incrementalProblem);
    const incremental = runExactMainAndFeederSearch(incrementalProblem);
    const full = runExactMainAndFeederSearch(fullProblem, { residualMatchingMode: "FULL_RECOMPUTE" });
    assert.equal(incremental.status, full.status);
    assert.equal(incremental.complete, full.complete);
    assert.deepEqual(incremental.scheduledTasks, full.scheduledTasks);
    assert.notEqual(incremental.status === "INFEASIBLE" && full.status === "COMPLETE", true);
  }
});

test("every invalidation authority preserves exact FULL_RECOMPUTE parity", () => {
  const variants: Array<[string, (edge: ScheduledTask, added: ScheduledTask) => void]> = [
    ["participant", (edge, added) => { added.participantId = edge.participantId; }],
    ["coach", (edge, added) => { added.coachId = edge.coachId; }],
    ["space", (edge, added) => { added.spaceId = edge.spaceId; }],
    ["required resource", (edge, added) => { added.requiredResourceIds = [...(edge.requiredResourceIds ?? [])]; }],
    ["candidate -> added dependency", (edge, added) => { edge.dependencies = [added.id]; }],
    ["added -> candidate dependency", (edge, added) => { added.dependencies = [edge.id]; }],
  ];
  for (const [authority, mutate] of variants) {
    const edge = scheduled();
    const added = scheduled({ id: "added", participantId: "other-participant", coachId: "other-coach",
      spaceId: "other-space", requiredResourceIds: ["other-resource"] });
    mutate(edge, added);
    assert.equal(residualMatchingOperationsMayInteract([edge], [added]), true, authority);

    const problem = mainFlowVocalScenario();
    const incremental = runExactMainAndFeederSearch(structuredClone(problem));
    const full = runExactMainAndFeederSearch(structuredClone(problem), { residualMatchingMode: "FULL_RECOMPUTE" });
    assert.equal(incremental.status, full.status, authority);
    assert.deepEqual(incremental.scheduledTasks, full.scheduledTasks, authority);
  }
});

test("crossed task and position removal repairs without assuming the removed vertices were paired", () => {
  const traces: Array<{ selectedTaskId: string; consumedPosition: number; selectedTaskPreviousPosition: number | null;
    consumedPositionPreviousOwner: string | null; unmatchedBeforeRepair: number }> = [];
  const problem = mainFlowVocalScenario();
  const incremental = runExactMainAndFeederSearch(structuredClone(problem), {
    onResidualMatchingDerived: (trace) => traces.push(trace),
  });
  const full = runExactMainAndFeederSearch(structuredClone(problem), { residualMatchingMode: "FULL_RECOMPUTE" });
  const crossed = traces.find((trace) => trace.selectedTaskPreviousPosition !== trace.consumedPosition
    && trace.consumedPositionPreviousOwner !== trace.selectedTaskId);
  assert.ok(crossed);
  assert.ok(crossed.unmatchedBeforeRepair > 0);
  assert.ok(incremental.evidence.residualMatchingRepairs > 0);
  assert.equal(incremental.status, full.status);
  assert.deepEqual(incremental.scheduledTasks, full.scheduledTasks);
});

test("previously invalid edges remain monotonic and are reused without position checks", () => {
  const problem = mainFlowVocalScenario();
  problem.tasks.filter(({ kind }) => kind === "main").at(-1)!.availability = [{ start: 780, end: 840 }];
  const traces: Array<{ reusedInvalidEdges: number }> = [];
  const incremental = runExactMainAndFeederSearch(structuredClone(problem), {
    onResidualMatchingDerived: (trace) => traces.push(trace),
  });
  const full = runExactMainAndFeederSearch(structuredClone(problem), { residualMatchingMode: "FULL_RECOMPUTE" });
  assert.equal(incremental.status, full.status);
  assert.deepEqual(incremental.scheduledTasks, full.scheduledTasks);
  assert.ok(traces.some(({ reusedInvalidEdges }) => reusedInvalidEdges > 0));
  assert.ok(incremental.evidence.residualMatchingEdgeCacheMisses
    <= incremental.evidence.residualMatchingPositionChecks);
});

test("certificate derivation is sibling-isolated, deterministic, order-invariant, and fully ledger-accounted", () => {
  const parent = mainFlowVocalScenario();
  const firstSibling = runExactMainAndFeederSearch(structuredClone(parent));
  const secondSibling = runExactMainAndFeederSearch(structuredClone(parent));
  const reversed = structuredClone(parent);
  reversed.tasks.reverse(); reversed.participants.reverse(); reversed.spaces.reverse(); reversed.resources.reverse();
  const reversedResult = runExactMainAndFeederSearch(reversed);
  assert.deepEqual(secondSibling, firstSibling);
  assert.equal(reversedResult.status, firstSibling.status);
  assert.deepEqual(reversedResult.scheduledTasks, firstSibling.scheduledTasks);
  const evidence = firstSibling.evidence;
  assert.equal(evidence.residualMatchingBranchesExplored,
    evidence.residualMatchingInvocations + evidence.residualMatchingPositionChecks
      + evidence.residualMatchingAugmentTraversals);
  assert.ok(evidence.residualMatchingIncrementalUpdates > 0);
  assert.ok(evidence.residualMatchingRepairs > 0);
  assert.equal(evidence.residualMatchingFullBuilds, 1);
  assert.equal(evidence.residualMatchingRepairFailures, 0);
  assert.ok(evidence.branchesExplored < parent.budget.maxBranchExpansions);
});

test("matching budget exhaustion is atomic and every paid unit reaches the shared ledger", () => {
  const baseline = mainFlowVocalScenario();
  const complete = runExactMainAndFeederSearch(baseline);
  const bounded = mainFlowVocalScenario();
  const ledger = createExactSearchLedger(Math.max(1, complete.evidence.residualMatchingBranchesExplored - 1));
  const exhausted = runExactMainAndFeederSearch(bounded, { ledger });
  assert.equal(exhausted.status, "BRANCH_BUDGET_EXHAUSTED");
  assert.deepEqual(exhausted.scheduledTasks, []);
  assert.ok(exhausted.evidence.residualMatchingBranchesExplored <= ledger.coreBranches);
});

test("hard continuation gate preserves solutions, skips callbacks only on exact prunes, and is deterministic", () => {
  const problem = mainFlowVocalScenario();
  let enabledCallbacks = 0, disabledCallbacks = 0, missingCallbacks = 0;
  const traces: Array<{ edgesExamined: number; emptyDomains: number; pruned: boolean }> = [];
  const enabled = runExactMainAndFeederSearch(structuredClone(problem), {
    onPartialCoreCandidate: () => { enabledCallbacks += 1; return "CONTINUE"; },
    onContinuationGateChecked: (trace) => traces.push(trace),
  });
  const repeated = runExactMainAndFeederSearch(structuredClone(problem));
  const disabled = runExactMainAndFeederSearch(structuredClone(problem), {
    continuationGateMode: "OFF", onPartialCoreCandidate: () => { disabledCallbacks += 1; return "CONTINUE"; },
  });
  const missing = runExactMainAndFeederSearch(structuredClone(problem), {
    continuationGateCertificateMode: "OMIT", onPartialCoreCandidate: () => { missingCallbacks += 1; return "CONTINUE"; },
  });
  assert.ok(traces.some((trace) => trace.emptyDomains < trace.edgesExamined && !trace.pruned));
  assert.equal(missingCallbacks, disabledCallbacks);
  assert.equal(missing.evidence.continuationGateChecks, 0);
  assert.deepEqual(repeated, enabled);
  assert.equal(enabled.evidence.nextPositionEdgesExamined, traces.reduce((sum, trace) => sum + trace.edgesExamined, 0));
  assert.equal(enabled.evidence.continuationGateBranches, enabled.evidence.nextPositionEdgesExamined);
  assert.equal(enabled.status, disabled.status);
  assert.equal(enabled.complete, disabled.complete);
  assert.equal(enabled.evidence.coreFingerprint, disabled.evidence.coreFingerprint);
  assert.deepEqual(enabled.scheduledTasks, disabled.scheduledTasks);
  assert.ok(enabledCallbacks <= disabledCallbacks);
});

test("every hard-continuation edge is one atomic CORE branch", () => {
  const problem = mainFlowVocalScenario();
  const complete = runExactMainAndFeederSearch(structuredClone(problem), { causalDiagnostic: true });
  assert.ok(complete.evidence.continuationGateBranches > 0);
  assert.equal(complete.evidence.continuationGateBranches, complete.evidence.nextPositionEdgesExamined);
  assert.equal(Object.values(complete.evidence.causalDiagnostic!.waterfallByDepth)
    .reduce((sum, row) => sum + row.hardContinuation, 0), complete.evidence.continuationGateBranches);
  assert.equal(Object.values(complete.evidence.causalDiagnostic!.waterfallByDepth)
    .reduce((sum, row) => sum + row.total, 0), complete.evidence.branchesExplored);

  const exhaustedLedger = createExactSearchLedger(complete.evidence.branchesExplored - 1);
  const exhausted = runExactMainAndFeederSearch(structuredClone(problem), { ledger: exhaustedLedger });
  assert.equal(exhausted.status, "BRANCH_BUDGET_EXHAUSTED");
  assert.deepEqual(exhausted.scheduledTasks, []);
  assert.equal(exhausted.evidence.continuationGateBranches, exhausted.evidence.nextPositionEdgesExamined);
  assert.equal(exhausted.evidence.branchesExplored, exhaustedLedger.coreBranches);
});
