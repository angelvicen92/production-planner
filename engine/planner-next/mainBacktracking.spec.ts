import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, Task } from "./contracts";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";

function auxiliaryLeafBacktrackingProblem(): PlannerNextProblem {
  const tasks: Task[] = ["a", "b"].flatMap(participantId => [
    { id: `v-${participantId}`, kind: "vocal", participantId, coachId: "coach", duration: 15, spaceId: "vocal", dependencies: [] },
    { id: `m-${participantId}`, kind: "main", participantId, coachId: "coach", duration: 15, spaceId: "main", dependencies: [`v-${participantId}`], blockKey: "coach" },
  ]);
  tasks.push({ id: "aux-a", kind: "auxiliary", participantId: "a", duration: 15, spaceId: "aux", dependencies: [] });
  return {
    day: { start: 540, end: 720 },
    protectedMeal: { start: 690, end: 720 },
    resources: [],
    spaces: [
      { id: "main", availability: [{ start: 540, end: 720 }] },
      { id: "vocal", availability: [{ start: 540, end: 720 }] },
      { id: "aux", availability: [{ start: 600, end: 615 }] },
    ],
    participants: ["a", "b"].map(id => ({ id, availability: [{ start: 540, end: 720 }] })),
    coaches: [{ id: "coach", availability: [{ start: 540, end: 720 }] }],
    tasks,
    mainFlow: { spaceId: "main", preferredEnd: 660, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0,
    resourceTransitionMinutes: 0,
    auxiliaryPolicy: { participantPresencePreference: "OFF" },
    budget: { bestK: 1, maxBacktracks: 10, maxPatterns: 10, maxBranchExpansions: 10_000 },
  };
}

function canonicalMetrics(problem: PlannerNextProblem) {
  const result = planMainFlowAndFeeders(problem);
  const { runtimeMs: _runtimeMs, ...metrics } = result.metrics;
  return { result, metrics };
}

test("a locally preferred main leaf can fail auxiliary placement and backtrack to a complete second leaf", () => {
  const problem = auxiliaryLeafBacktrackingProblem();
  const before = JSON.stringify(problem);
  const { result } = canonicalMetrics(problem);
  assert.equal(result.complete, true);
  assert.equal(result.metrics.hardValid, true);
  assert.equal(result.scheduledTasks.length, problem.tasks.length);
  assert.deepEqual(result.scheduledTasks.filter(task => task.kind === "main").map(task => task.id), ["m-b", "m-a"]);
  assert.equal(result.metrics.mainCompleteLeafAttemptCount, 2);
  assert.equal(result.metrics.mainFailedLeafCount, 1);
  assert.equal(result.metrics.mainBacktrackCount, 1);
  assert.deepEqual(result.metrics.mainFailureCountByReason, { AUXILIARY_PLACEMENT_FAILED: 1 });
  assert.equal(JSON.stringify(problem), before);
});

test("bestK prioritizes without deleting the deferred solution and solution propagation stops enumeration", () => {
  const { result } = canonicalMetrics(auxiliaryLeafBacktrackingProblem());
  assert.equal(result.metrics.mainDeferredCandidateExploredCount, 1);
  assert.equal(result.metrics.mainFirstSolutionRankByDepth["0"], 1);
  assert.equal(result.metrics.mainFirstSolutionRankByDepth["1"], 0);
  assert.equal(result.metrics.mainCompleteLeafAttemptCount, 2);
  assert.equal(result.metrics.alternativesRetained, 0);
});

test("branch exhaustion is atomic and never publishes a partial plan", () => {
  const problem = auxiliaryLeafBacktrackingProblem();
  problem.budget.maxBranchExpansions = 1;
  const result = planMainFlowAndFeeders(problem);
  assert.equal(result.complete, false);
  assert.deepEqual(result.scheduledTasks, []);
  assert.deepEqual(result.scheduledSetupPreparations, []);
  assert.deepEqual(result.scheduledSpaceMeals, []);
  assert.equal(result.metrics.searchStopReason, "BRANCH_BUDGET_EXHAUSTED");
  assert.equal(result.metrics.branchesExplored <= problem.budget.maxBranchExpansions, true);
});

test("leaf-first backtracking is deterministic, input-order invariant, and independent of bestK retention", () => {
  const firstProblem = auxiliaryLeafBacktrackingProblem();
  const first = canonicalMetrics(firstProblem);
  const second = canonicalMetrics(auxiliaryLeafBacktrackingProblem());
  const reversedProblem = auxiliaryLeafBacktrackingProblem();
  reversedProblem.tasks.reverse();
  const reversed = canonicalMetrics(reversedProblem);
  const widerProblem = auxiliaryLeafBacktrackingProblem();
  widerProblem.budget.bestK = 2;
  const wider = canonicalMetrics(widerProblem);
  assert.deepEqual(first.metrics, second.metrics);
  assert.deepEqual(first.metrics, reversed.metrics);
  assert.equal(first.result.metrics.planFingerprint, wider.result.metrics.planFingerprint);
  assert.equal(firstProblem.anchoredAccompaniments, undefined);
});
