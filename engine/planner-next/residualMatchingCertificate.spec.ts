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
