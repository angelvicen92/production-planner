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

  assert.deepEqual(result.exploredBranches, [{ branchId: "a", explored: true, score: 10, solutionId: "solution:1:a" }]);
  assert.equal(result.bestBranchId, "a");
});

test("executeIterativeSearch explores multiple branches in executor order", () => {
  const result = executeIterativeSearch(execution(["high", "mid", "low"], { high: 3, mid: 2, low: 1 }));

  assert.deepEqual(result.exploredBranches.map((item) => item.branchId), ["high", "mid", "low"]);
});

test("executeIterativeSearch represents retroceso by continuing after exhausted branches", () => {
  const result = executeIterativeSearch(execution(["a", "b"], { a: 1, b: 2 }));

  assert.deepEqual(result.exploredBranches, [
    { branchId: "a", explored: true, score: 1, solutionId: "solution:1:a" },
    { branchId: "b", explored: true, score: 2, solutionId: "solution:2:b" },
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
        solutionId: "solution:1:a",
      },
      replannedElements: ["bestBranchId", "branchId", "explored", "previousBestBranchId", "score", "solutionId"],
      reason: "Branch a was discarded; reusable partial state was preserved for deterministic shadow-mode incremental replanning.",
      readOnly: true,
      shadowModeOnly: true,
    },
  ]);
});
