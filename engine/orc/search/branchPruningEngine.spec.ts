import assert from "node:assert/strict";
import { test } from "node:test";

import type { SearchSpace } from "../contracts";
import { structuralEquals } from "../structuralEquality";
import type { BranchOrderingResult } from "../analysis/branchOrderingEngine";
import { buildBranchPruningEvidence, pruneBranches } from "./branchPruningEngine";

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

test("pruneBranches supports an empty tree", () => {
  assert.deepEqual(pruneBranches(ordering()), { branches: [] });
});

test("pruneBranches keeps one branch", () => {
  assert.deepEqual(pruneBranches(ordering("a")).branches, [
    { branchId: "a", pruned: false, pruningReason: "Branch kept for backtracking because it is the first occurrence in the deterministic branch ordering." },
  ]);
});

test("pruneBranches keeps multiple unique branches in stable order", () => {
  const result = pruneBranches(ordering("high", "mid", "low"));

  assert.deepEqual(result.branches.map((branch) => branch.branchId), ["high", "mid", "low"]);
  assert.deepEqual(result.branches.map((branch) => branch.pruned), [false, false, false]);
});

test("pruneBranches prunes duplicate branches after their first deterministic occurrence", () => {
  const result = pruneBranches(ordering("a", "b", "a", "c", "b"));

  assert.deepEqual(result.branches.map((branch) => branch.pruned), [false, false, true, false, true]);
  assert.match(result.branches[2]?.pruningReason ?? "", /same id already represents/);
});

test("pruneBranches records kept branches", () => {
  const result = pruneBranches(ordering("a", "b"));

  assert.equal(result.branches.every((branch) => branch.pruned === false), true);
  assert.equal(result.branches.every((branch) => branch.pruningReason.length > 0), true);
});

test("pruneBranches is deterministic", () => {
  const input = ordering("b", "a", "b", "c");

  assert.deepEqual(pruneBranches(input), pruneBranches(input));
});

test("BranchPruningResult is structurally equal and serializable", () => {
  const result = pruneBranches(ordering("a", "a"));
  const parsed = JSON.parse(JSON.stringify(result));

  assert.equal(structuralEquals(result, parsed), true);
  assert.deepEqual(parsed, result);
});

test("pruneBranches does not mutate inputs", () => {
  const input = ordering("a", "a", "b");
  const before = JSON.parse(JSON.stringify(input));

  pruneBranches(input);

  assert.deepEqual(JSON.parse(JSON.stringify(input)), before);
});

test("buildBranchPruningEvidence records branch, decision, reason, and information used", () => {
  const input = ordering("a", "a");
  const result = pruneBranches(input);
  const evidence = buildBranchPruningEvidence(input, result, "2026-06-27T00:00:00.000Z");

  assert.equal(evidence.length, 2);
  assert.equal(evidence[1]?.kind, "branch-pruning");
  assert.equal(evidence[1]?.data.branchId, "a");
  assert.equal(evidence[1]?.data.pruned, true);
  assert.equal(typeof evidence[1]?.data.pruningReason, "string");
  assert.equal(typeof evidence[1]?.data.informationUsed, "object");
});
