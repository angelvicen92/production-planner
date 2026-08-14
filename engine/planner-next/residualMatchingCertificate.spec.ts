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

test("same-space separated intervals are cacheable while real authority overlap invalidates", () => {
  const problem = mainFlowVocalScenario();
  const edge = scheduled();
  const separated = scheduled({ id: "added", start: 30, end: 35 });
  assert.equal(residualMatchingOperationsMayInteract(problem, [edge], [separated]), false);
  assert.equal(residualMatchingOperationsMayInteract(problem, [edge], [{ ...separated, start: 23, end: 28 }]), true);
});

test("participant, coach, and resource transitions invalidate only when the effective margin is insufficient", () => {
  const problem = mainFlowVocalScenario();
  problem.participantTransitionMinutes = 10;
  problem.resourceTransitionMinutes = 10;
  const edge = scheduled({ coachId: "coach-edge", requiredResourceIds: ["resource-edge"] });
  const authorities: Array<[string, Partial<ScheduledTask>]> = [
    ["participant", { participantId: edge.participantId }],
    ["coach", { coachId: edge.coachId }],
    ["resource", { requiredResourceIds: edge.requiredResourceIds }],
  ];
  for (const [authority, shared] of authorities) {
    const base = { id: `added-${authority}`, participantId: "other", coachId: "other",
      spaceId: "other", requiredResourceIds: [], ...shared };
    assert.equal(residualMatchingOperationsMayInteract(problem, [edge], [scheduled({ ...base, start: 30, end: 35 })]), true, authority);
    assert.equal(residualMatchingOperationsMayInteract(problem, [edge], [scheduled({ ...base, start: 35, end: 40 })]), false, authority);
  }
});

test("dependencies invalidate only when their direction-specific timing can be violated", () => {
  const problem = mainFlowVocalScenario();
  const unrelated = { participantId: "other", coachId: "other", spaceId: "other", requiredResourceIds: [] };
  const candidateAfter = scheduled({ dependencies: ["added"] });
  assert.equal(residualMatchingOperationsMayInteract(problem, [candidateAfter],
    [scheduled({ ...unrelated, id: "added", start: 10, end: 15 })]), false);
  assert.equal(residualMatchingOperationsMayInteract(problem, [candidateAfter],
    [scheduled({ ...unrelated, id: "added", start: 18, end: 23 })]), true);
  const addedAfter = scheduled({ ...unrelated, id: "added", start: 30, end: 35, dependencies: ["edge"] });
  assert.equal(residualMatchingOperationsMayInteract(problem, [scheduled()], [addedAfter]), false);
  assert.equal(residualMatchingOperationsMayInteract(problem, [scheduled({ end: 32 })], [addedAfter]), true);
});

test("an unrelated operation is a structurally proven cache hit", () => {
  const edge = scheduled();
  const unrelated = scheduled({ id: "unrelated", participantId: "participant-other", coachId: "coach-other",
    spaceId: "space-other", requiredResourceIds: ["resource-other"] });
  assert.equal(residualMatchingOperationsMayInteract(mainFlowVocalScenario(), [edge], [unrelated]), false);
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
    assert.equal(residualMatchingOperationsMayInteract(mainFlowVocalScenario(), [edge], [added]), true, authority);

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
