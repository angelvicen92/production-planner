import assert from "node:assert/strict";
import { test } from "node:test";

import { structuralEquals } from "../structuralEquality";
import type { BacktrackingExecutionResult } from "./backtrackingSearchExecutor";
import { executeIterativeSearch } from "./iterativeSearchSolver";

const execution = (explorationOrder: string[], branchScores: Record<string, number> = {}): BacktrackingExecutionResult => ({
  explorationOrder,
  exploredBranches: [...explorationOrder],
  skippedBranches: [],
  exhaustedBranches: [...explorationOrder],
  branchScores: { ...branchScores },
  evidence: [],
});

test("executeIterativeSearch supports an empty tree", () => {
  const result = executeIterativeSearch(execution([]));

  assert.deepEqual(result.exploredBranches, []);
  assert.equal(result.bestBranchId, null);
  assert.equal(result.completed, true);
});

test("executeIterativeSearch explores one branch and keeps it as best when scored", () => {
  const result = executeIterativeSearch(execution(["a"], { a: 10 }));

  assert.deepEqual(result.exploredBranches, [{ branchId: "a", explored: true, score: 10, productionObjectiveScore: null, solutionId: "solution:1:a" }]);
  assert.equal(result.bestBranchId, "a");
});

test("executeIterativeSearch explores multiple branches in executor order", () => {
  const result = executeIterativeSearch(execution(["high", "mid", "low"], { high: 3, mid: 2, low: 1 }));

  assert.deepEqual(result.exploredBranches.map((item) => item.branchId), ["high", "mid", "low"]);
});

test("executeIterativeSearch represents retroceso by continuing after exhausted branches", () => {
  const result = executeIterativeSearch(execution(["a", "b"], { a: 1, b: 2 }));

  assert.deepEqual(result.exploredBranches, [
    { branchId: "a", explored: true, score: 1, productionObjectiveScore: null, solutionId: "solution:1:a" },
    { branchId: "b", explored: true, score: 2, productionObjectiveScore: null, solutionId: "solution:2:b" },
  ]);
  assert.equal(result.completed, true);
});

test("executeIterativeSearch conserves the best solution with stable tie handling", () => {
  const result = executeIterativeSearch(execution(["a", "b", "c"], { a: 5, b: 7, c: 7 }));

  assert.equal(result.bestBranchId, "b");
  assert.equal(result.evidence.filter((item) => item.kind === "iterative-search-iteration").at(-1)?.data.reason, "Best branch unchanged because equal scores keep the earlier deterministic branch.");
});

test("executeIterativeSearch is deterministic", () => {
  const input = execution(["b", "a", "c"], { b: 2, a: 4, c: 3 });

  assert.deepEqual(executeIterativeSearch(input), executeIterativeSearch(input));
});

test("executeIterativeSearch produces structurally equal serializable results", () => {
  const first = executeIterativeSearch(execution(["a", "b"], { a: 1, b: 2 }));
  const second = JSON.parse(JSON.stringify(first));

  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(second, first);
});

test("executeIterativeSearch does not mutate inputs", () => {
  const input = execution(["a", "b"], { a: 1, b: 2 });
  const before = JSON.parse(JSON.stringify(input));

  executeIterativeSearch(input);

  assert.deepEqual(JSON.parse(JSON.stringify(input)), before);
});

test("executeIterativeSearch records every explored branch in the solution pool", () => {
  const result = executeIterativeSearch(execution(["a", "b", "c"], { a: 1, b: 3, c: 2 }));

  assert.deepEqual(result.solutionPool.solutions.map((item) => ({
    solutionId: item.solutionId,
    originatingBranchId: item.originatingBranchId,
    score: item.score,
  })), [
    { solutionId: "solution:1:a", originatingBranchId: "a", score: 1 },
    { solutionId: "solution:2:b", originatingBranchId: "b", score: 3 },
    { solutionId: "solution:3:c", originatingBranchId: "c", score: 2 },
  ]);
  assert.equal(result.solutionPool.bestSolutionId, "solution:2:b");
});

test("executeIterativeSearch emits reconstructible solution pool evidence", () => {
  const result = executeIterativeSearch(execution(["a", "b"], { a: 1, b: 2 }));
  const solutionEvidence = result.evidence.filter((item) => item.kind === "iterative-search-solution-comparison");

  assert.deepEqual(solutionEvidence.map((item) => item.data), [
    {
      candidateSolutionId: "solution:1:a",
      previousBestSolutionId: null,
      winnerSolutionId: "solution:1:a",
      candidateScore: 1,
      previousBestScore: null,
      bestChanged: true,
      reason: "First complete solution becomes the current best solution.",
      readOnly: true,
      shadowModeOnly: true,
    },
    {
      candidateSolutionId: "solution:2:b",
      previousBestSolutionId: "solution:1:a",
      winnerSolutionId: "solution:2:b",
      candidateScore: 2,
      previousBestScore: 1,
      bestChanged: true,
      reason: "Candidate solution score is greater than the previous best solution score.",
      readOnly: true,
      shadowModeOnly: true,
    },
  ]);
  assert.equal(result.evidence.at(-1)?.data.bestSolutionId, "solution:2:b");
  assert.equal(result.evidence.at(-1)?.data.solutionCount, 2);
});

test("executeIterativeSearch prepares incremental replanning for every discarded branch", () => {
  const result = executeIterativeSearch(execution(["a", "b"], { a: 1, b: 2 }));

  assert.deepEqual(result.incrementalReplanningResults.map((item) => item.reusedState.branchId), ["a", "b"]);
  assert.deepEqual(result.incrementalReplanningResults[0]?.reusedState, {
    bestBranchId: "a",
    branchId: "a",
    explored: true,
    previousBestBranchId: null,
    score: 1,
    productionObjectiveScore: null,
    solutionId: "solution:1:a",
  });
});

test("executeIterativeSearch records reconstructible incremental replanning evidence", () => {
  const result = executeIterativeSearch(execution(["a"], { a: 1 }));
  const replanningEvidence = result.evidence.filter((item) => item.kind === "iterative-search-incremental-replanning");

  assert.deepEqual(replanningEvidence.map((item) => item.data), [
    {
      discardedBranchId: "a",
      reusedState: {
        bestBranchId: "a",
        branchId: "a",
        explored: true,
        previousBestBranchId: null,
        score: 1,
        productionObjectiveScore: null,
        solutionId: "solution:1:a",
      },
      replannedElements: ["bestBranchId", "branchId", "explored", "previousBestBranchId", "productionObjectiveScore", "score", "solutionId"],
      reason: "Branch a was discarded; reusable partial state was preserved for deterministic shadow-mode incremental replanning.",
      readOnly: true,
      shadowModeOnly: true,
    },
  ]);
});


const objectiveScore = (overallScore: number) => ({
  overallScore,
  continuityScore: overallScore,
  availabilityScore: overallScore,
  criticalResourceScore: overallScore,
  waitingTimeScore: overallScore,
  replanningImpactScore: overallScore,
  operationalFeasibilityScore: overallScore,
});

test("executeIterativeSearch reorders pending branches by evaluated ProductionObjectiveScore", () => {
  const input = execution(["seed", "low", "high", "mid"], { seed: 1, low: 1, high: 9, mid: 5 });
  input.branchProductionObjectiveScores = {
    seed: objectiveScore(1),
    low: objectiveScore(1),
    high: objectiveScore(9),
    mid: objectiveScore(5),
  };

  const result = executeIterativeSearch(input);

  assert.deepEqual(result.exploredBranches.map((item) => item.branchId), ["seed", "high", "mid", "low"]);
  assert.equal(result.bestBranchId, "high");
  assert.deepEqual(result.exploredBranches[1]?.productionObjectiveScore, objectiveScore(9));
  assert.equal(result.evidence.some((item) => item.kind === "iterative-search-evaluation-guided-reorder" && item.data.branchId === "high" && item.data.scoreUsedForDecision === 9), true);
});

test("executeIterativeSearch keeps branch ordering stable when evaluation scores tie", () => {
  const input = execution(["seed", "a", "b", "c"], { seed: 1, a: 5, b: 5, c: 4 });

  const result = executeIterativeSearch(input);

  assert.deepEqual(result.exploredBranches.map((item) => item.branchId), ["seed", "a", "b", "c"]);
});


test("executeIterativeSearch records temporary online search learning memory", () => {
  const result = executeIterativeSearch(execution(["a", "b"], { a: 1, b: 3 }));

  assert.deepEqual(result.onlineSearchMemory, {
    patterns: [
      {
        patternId: "a",
        observations: 1,
        averageScore: 1,
        lastScore: 1,
        explanation: "Branch a produced score 1 during shadow-mode search.",
      },
      {
        patternId: "b",
        observations: 1,
        averageScore: 3,
        lastScore: 3,
        explanation: "Branch b produced score 3 during shadow-mode search.",
      },
    ],
  });
  assert.equal(result.evidence.filter((item) => item.kind === "iterative-search-online-learning-observation").length, 2);
  assert.equal(result.evidence.at(-1)?.data.onlineSearchPatternCount, 2);
});

test("executeIterativeSearch consults learned patterns without changing deterministic order", () => {
  const result = executeIterativeSearch(execution(["a", "a"], { a: 2 }));

  assert.deepEqual(result.exploredBranches.map((item) => item.branchId), ["a", "a"]);
  assert.deepEqual(result.onlineSearchMemory.patterns, [{
    patternId: "a",
    observations: 2,
    averageScore: 2,
    lastScore: 2,
    explanation: "Branch a produced score 2 during shadow-mode search.",
  }]);
  assert.equal(result.evidence.some((item) => item.kind === "iterative-search-online-learning-consulted" && item.data.usedForScoring === false && item.data.usedForPruning === false), true);
});

test("executeIterativeSearch records transposition evidence without changing exploration", () => {
  const simulatedState = {
    id: "sim:1",
    candidateStateId: "candidate:1",
    baseStateId: "base",
    operationalStateSnapshot: {
      id: "state",
      planId: 1,
      workDay: null,
      planning: [{ taskId: 1, startPlanned: "08:00", endPlanned: "09:00", assignedResourceIds: [1], spaceId: 1 }],
      tasks: [],
      resources: [],
      spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
      availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
      dependencies: [],
      locks: [],
      constraints: {},
      operationalMetrics: {},
      cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
      source: "EngineInput",
      schemaVersion: "ORC-SPEC-01",
    },
    appliedTransformations: [],
    simulationMode: "READ_ONLY_BASELINE",
    readOnly: true,
    createdAt: null,
  } as never;
  const result = executeIterativeSearch({
    ...execution(["a", "b"], { a: 1, b: 2 }),
    branchSimulatedStates: { a: simulatedState, b: { ...simulatedState, id: "sim:2", candidateStateId: "candidate:2", createdAt: "2026-06-27T00:00:00.000Z" } },
  });
  const transpositionEvidence = result.evidence.filter((item) => item.kind === "iterative-search-transposition");

  assert.deepEqual(result.exploredBranches.map((item) => item.branchId), ["a", "b"]);
  assert.deepEqual(result.exploredBranches.map((item) => item.explored), [true, true]);
  assert.equal(result.transpositionEntries.length, 1);
  assert.deepEqual(transpositionEvidence.map((item) => ({ branchId: item.data.branchId, equivalenceDetected: item.data.equivalenceDetected, originalBranchId: item.data.originalBranchId, knownScore: item.data.knownScore, visits: item.data.visits })), [
    { branchId: "a", equivalenceDetected: false, originalBranchId: "a", knownScore: null, visits: 1 },
    { branchId: "b", equivalenceDetected: true, originalBranchId: "a", knownScore: 1, visits: 2 },
  ]);
});


test("executeIterativeSearch prunes dominated equivalent branches", () => {
  const simulatedState = {
    id: "sim:1",
    candidateStateId: "candidate:1",
    baseStateId: "base",
    operationalStateSnapshot: {
      id: "state", planId: 1, workDay: null,
      planning: [{ taskId: 1, startPlanned: "08:00", endPlanned: "09:00", assignedResourceIds: [1], spaceId: 1 }],
      tasks: [], resources: [],
      spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
      availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
      dependencies: [], locks: [], constraints: {}, operationalMetrics: {},
      cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
      source: "EngineInput", schemaVersion: "ORC-SPEC-01",
    },
    appliedTransformations: [], simulationMode: "READ_ONLY_BASELINE", readOnly: true, createdAt: null,
  } as never;
  const result = executeIterativeSearch({
    ...execution(["a", "b", "c"], { a: 3, b: 2, c: 1 }),
    branchSimulatedStates: { a: simulatedState, b: { ...simulatedState, id: "sim:2" }, c: { ...simulatedState, id: "sim:3" } },
  });

  assert.deepEqual(result.exploredBranches.map((item) => ({ branchId: item.branchId, explored: item.explored })), [
    { branchId: "a", explored: true },
    { branchId: "b", explored: false },
    { branchId: "c", explored: false },
  ]);
  assert.equal(result.bestBranchId, "a");
  assert.equal(result.evidence.filter((item) => item.kind === "iterative-search-dominance-pruning" && item.data.pruned === true).length, 2);
});
