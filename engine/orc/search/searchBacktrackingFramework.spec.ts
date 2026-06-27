import assert from "node:assert/strict";
import { test } from "node:test";

import { structuralEquals } from "../structuralEquality";
import {
  buildSearchBacktrackingEvidence,
  initializeBacktrackingState,
  markBranchExplored,
  registerBranch,
  selectNextBranch,
  type SearchBacktrackingState,
  type SearchBranchState,
} from "./searchBacktrackingFramework";

const branch = (branchId: string, parentBranchId: string | null = null, depth = 0): SearchBranchState => ({
  branchId,
  parentBranchId,
  depth,
  explored: false,
  exhausted: false,
});

const sampleState = (): SearchBacktrackingState => registerBranch(registerBranch(initializeBacktrackingState(), branch("root")), branch("alternative", "root", 1));

test("initializeBacktrackingState returns an empty serializable state", () => {
  const state = initializeBacktrackingState();

  assert.deepEqual(state, { activeBranchId: null, branches: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test("registerBranch creates branches deterministically and activates the first branch", () => {
  const state = sampleState();

  assert.equal(state.activeBranchId, "root");
  assert.deepEqual(state.branches, [branch("root"), branch("alternative", "root", 1)]);
});

test("registerBranch replaces an existing branch without changing branch order", () => {
  const state = registerBranch(sampleState(), { ...branch("root"), explored: true, exhausted: true });

  assert.deepEqual(state.branches.map((item) => item.branchId), ["root", "alternative"]);
  assert.equal(state.branches[0].explored, true);
  assert.equal(state.branches[0].exhausted, true);
});

test("markBranchExplored marks a branch explored and exhausted", () => {
  const state = markBranchExplored(sampleState(), "root");

  assert.equal(state.activeBranchId, null);
  assert.deepEqual(state.branches[0], { ...branch("root"), explored: true, exhausted: true });
});

test("markBranchExplored leaves unknown branches unchanged", () => {
  const state = sampleState();
  const next = markBranchExplored(state, "missing");

  assert.deepEqual(next, state);
  assert.notEqual(next, state);
  assert.notEqual(next.branches, state.branches);
});

test("selectNextBranch returns the first non-explored and non-exhausted branch", () => {
  const state = markBranchExplored(sampleState(), "root");
  const selected = selectNextBranch(state);

  assert.deepEqual(selected, branch("alternative", "root", 1));
});

test("selectNextBranch returns null when every branch is exhausted", () => {
  const state = markBranchExplored(markBranchExplored(sampleState(), "root"), "alternative");

  assert.equal(selectNextBranch(state), null);
});

test("the same branch sequence produces structurally equal backtracking states", () => {
  const first = markBranchExplored(sampleState(), "root");
  const second = markBranchExplored(sampleState(), "root");

  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(first, second);
});

test("operations do not mutate the previous state or input branch", () => {
  const initial = sampleState();
  const initialSnapshot = JSON.parse(JSON.stringify(initial));
  const inputBranch = branch("child", "root", 1);
  const inputBranchSnapshot = { ...inputBranch };

  const registered = registerBranch(initial, inputBranch);
  const explored = markBranchExplored(registered, "root");
  const selected = selectNextBranch(explored);
  if (selected != null) selected.explored = true;

  assert.deepEqual(initial, initialSnapshot);
  assert.deepEqual(inputBranch, inputBranchSnapshot);
  assert.equal(explored.branches.find((item) => item.branchId === "alternative")?.explored, false);
});

test("backtracking evidence reconstructs created, explored, exhausted and next branch events", () => {
  const createdState = sampleState();
  const exploredState = markBranchExplored(createdState, "root");
  const next = selectNextBranch(exploredState);
  const created = buildSearchBacktrackingEvidence("branch-created", createdState.branches[0], createdState, "2026-06-27T14:58:00.000Z");
  const explored = buildSearchBacktrackingEvidence("branch-explored", exploredState.branches[0], exploredState, "2026-06-27T14:58:00.000Z");
  const exhausted = buildSearchBacktrackingEvidence("branch-exhausted", exploredState.branches[0], exploredState, "2026-06-27T14:58:00.000Z");
  const nextEvidence = buildSearchBacktrackingEvidence("next-branch", next, exploredState, "2026-06-27T14:58:00.000Z");

  assert.equal(created.kind, "search-backtracking-branch-created");
  assert.equal(explored.data.event, "branch-explored");
  assert.equal(exhausted.data.event, "branch-exhausted");
  assert.equal(nextEvidence.subjectId, "alternative");
  assert.deepEqual(JSON.parse(JSON.stringify([created, explored, exhausted, nextEvidence])), [created, explored, exhausted, nextEvidence]);
});
