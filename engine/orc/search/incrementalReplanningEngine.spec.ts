import assert from "node:assert/strict";
import { test } from "node:test";

import { structuralEquals } from "../structuralEquality";
import { executeIncrementalReplanning, type IncrementalReplanningContext } from "./incrementalReplanningEngine";

test("executeIncrementalReplanning supports an empty context", () => {
  const result = executeIncrementalReplanning({ branchId: "branch:empty", preservedState: {} });

  assert.deepEqual(result.reusedState, {});
  assert.deepEqual(result.replannedElements, []);
  assert.match(result.explanation, /no reusable partial state/);
});

test("executeIncrementalReplanning reuses preserved state for one replanning", () => {
  const result = executeIncrementalReplanning({
    branchId: "branch:a",
    preservedState: { score: 10, solutionId: "solution:1:a" },
  });

  assert.deepEqual(result, {
    reusedState: { score: 10, solutionId: "solution:1:a" },
    replannedElements: ["score", "solutionId"],
    explanation: "Branch branch:a was discarded; reusable partial state was preserved for deterministic shadow-mode incremental replanning.",
  });
});

test("executeIncrementalReplanning handles multiple replanifications independently", () => {
  const first = executeIncrementalReplanning({ branchId: "branch:a", preservedState: { score: 1 } });
  const second = executeIncrementalReplanning({ branchId: "branch:b", preservedState: { score: 2, bestBranchId: "branch:b" } });

  assert.deepEqual(first.replannedElements, ["score"]);
  assert.deepEqual(second.replannedElements, ["bestBranchId", "score"]);
  assert.notDeepEqual(first, second);
});

test("executeIncrementalReplanning is deterministic with stable object ordering", () => {
  const firstContext: IncrementalReplanningContext = {
    branchId: "branch:stable",
    preservedState: { z: 1, a: { y: 2, b: 3 }, m: [ { d: 4, c: 5 } ] },
  };
  const secondContext: IncrementalReplanningContext = {
    branchId: "branch:stable",
    preservedState: { m: [ { c: 5, d: 4 } ], a: { b: 3, y: 2 }, z: 1 },
  };

  assert.deepEqual(executeIncrementalReplanning(firstContext), executeIncrementalReplanning(secondContext));
});

test("executeIncrementalReplanning produces structurally equal serializable results", () => {
  const result = executeIncrementalReplanning({ branchId: "branch:a", preservedState: { score: 1 } });
  const serialized = JSON.parse(JSON.stringify(result));

  assert.equal(structuralEquals(result, serialized), true);
  assert.deepEqual(serialized, result);
});

test("executeIncrementalReplanning does not mutate inputs", () => {
  const context: IncrementalReplanningContext = {
    branchId: "branch:a",
    preservedState: { nested: { b: 2, a: 1 }, list: [{ z: 3, c: 4 }] },
  };
  const before = JSON.parse(JSON.stringify(context));

  const result = executeIncrementalReplanning(context);
  result.reusedState.extra = true;

  assert.deepEqual(JSON.parse(JSON.stringify(context)), before);
});
