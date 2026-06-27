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

  assert.deepEqual(result.exploredBranches, [{ branchId: "a", explored: true, score: 10 }]);
  assert.equal(result.bestBranchId, "a");
});

test("executeIterativeSearch explores multiple branches in executor order", () => {
  const result = executeIterativeSearch(execution(["high", "mid", "low"], { high: 3, mid: 2, low: 1 }));

  assert.deepEqual(result.exploredBranches.map((item) => item.branchId), ["high", "mid", "low"]);
});

test("executeIterativeSearch represents retroceso by continuing after exhausted branches", () => {
  const result = executeIterativeSearch(execution(["a", "b"], { a: 1, b: 2 }));

  assert.deepEqual(result.exploredBranches, [
    { branchId: "a", explored: true, score: 1 },
    { branchId: "b", explored: true, score: 2 },
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
