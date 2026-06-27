import assert from "node:assert/strict";
import { test } from "node:test";

import type { SearchSpace } from "../contracts";
import { structuralEquals } from "../structuralEquality";
import type { BranchOrderingResult } from "../analysis/branchOrderingEngine";
import { executeBacktrackingSearch } from "./backtrackingSearchExecutor";
import { initializeBacktrackingState, registerBranch, type SearchBacktrackingState, type SearchBranchState } from "./searchBacktrackingFramework";

const space = (id: string): SearchSpace => ({
  id,
  description: `space ${id}`,
  taskIds: [],
  candidates: [],
  evidenceIds: [],
  metadata: { readOnly: true },
});

const ordering = (...ids: string[]): BranchOrderingResult => ({
  orderedSearchSpaces: ids.map((id, index) => ({
    searchSpace: space(id),
    explorationOrder: index + 1,
    orderingScore: ids.length - index,
    explanation: `ordered ${id}`,
  })),
});

const branch = (branchId: string, explored = false, exhausted = false): SearchBranchState => ({
  branchId,
  parentBranchId: null,
  depth: 0,
  explored,
  exhausted,
});

const withBranches = (...branches: SearchBranchState[]): SearchBacktrackingState =>
  branches.reduce((state, item) => registerBranch(state, item), initializeBacktrackingState());

test("executeBacktrackingSearch supports an empty tree", () => {
  const result = executeBacktrackingSearch(ordering(), initializeBacktrackingState());

  assert.deepEqual(result.explorationOrder, []);
  assert.deepEqual(result.exploredBranches, []);
  assert.deepEqual(result.skippedBranches, []);
  assert.deepEqual(result.exhaustedBranches, []);
  assert.equal(result.evidence.at(-1)?.kind, "search-backtracking-next-branch");
});

test("executeBacktrackingSearch explores one branch", () => {
  const result = executeBacktrackingSearch(ordering("a"), initializeBacktrackingState());

  assert.deepEqual(result.explorationOrder, ["a"]);
  assert.deepEqual(result.exploredBranches, ["a"]);
  assert.deepEqual(result.exhaustedBranches, ["a"]);
});

test("executeBacktrackingSearch explores multiple branches in branch ordering order", () => {
  const result = executeBacktrackingSearch(ordering("high", "mid", "low"), initializeBacktrackingState());

  assert.deepEqual(result.explorationOrder, ["high", "mid", "low"]);
});

test("executeBacktrackingSearch skips branches exhausted before selection", () => {
  const state = withBranches(branch("a", true, true), branch("b"));
  const result = executeBacktrackingSearch(ordering("a", "b"), state);

  assert.deepEqual(result.explorationOrder, ["b"]);
  assert.deepEqual(result.skippedBranches, ["a"]);
  assert.deepEqual(result.exhaustedBranches, ["b", "a"]);
  assert.equal(result.evidence.some((item) => item.kind === "search-backtracking-branch-skipped"), true);
});

test("executeBacktrackingSearch backtracks to the next available branch after exhaustion", () => {
  const result = executeBacktrackingSearch(ordering("a", "b"), initializeBacktrackingState());
  const nextEvidenceSubjects = result.evidence
    .filter((item) => item.kind === "search-backtracking-next-branch")
    .map((item) => item.subjectId);

  assert.deepEqual(nextEvidenceSubjects, ["a", "b", null]);
});

test("executeBacktrackingSearch is deterministic", () => {
  const first = executeBacktrackingSearch(ordering("b", "a", "c"), initializeBacktrackingState());
  const second = executeBacktrackingSearch(ordering("b", "a", "c"), initializeBacktrackingState());

  assert.deepEqual(first, second);
});

test("executeBacktrackingSearch produces structurally equal serializable results", () => {
  const first = executeBacktrackingSearch(ordering("a", "b"), initializeBacktrackingState());
  const second = JSON.parse(JSON.stringify(first));

  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(second, first);
});

test("executeBacktrackingSearch does not mutate inputs", () => {
  const inputOrdering = ordering("a", "b");
  const inputState = withBranches(branch("a"));
  const before = JSON.parse(JSON.stringify({ inputOrdering, inputState }));

  executeBacktrackingSearch(inputOrdering, inputState);

  assert.deepEqual(JSON.parse(JSON.stringify({ inputOrdering, inputState })), before);
});
