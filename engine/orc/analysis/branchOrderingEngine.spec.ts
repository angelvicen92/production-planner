import test from "node:test";
import assert from "node:assert/strict";
import type { SearchSpace } from "../contracts";
import type { FutureConstraintPropagationAnalysis } from "./futureConstraintPropagationEngine";
import type { SearchSpaceSelectionResult } from "./searchSpaceSelectionEngine";
import { buildBranchOrderingEvidence, orderSearchSpaces } from "./branchOrderingEngine";

const space = (id: string, priority: number, expectedValue = 0.5, confidence = 0.8): SearchSpace => ({
  id,
  description: `space ${id}`,
  taskIds: [1, 2],
  candidates: [],
  evidenceIds: [`evidence:${id}`],
  explorationValue: { searchSpaceId: id, expectedValue, confidence, explanation: `value ${id}` },
  metadata: { sourceOpportunityId: id, sourceOpportunityPriority: priority, readOnly: true },
});

const selection = (spaces: SearchSpace[]): SearchSpaceSelectionResult => ({
  selected: spaces.map((searchSpace) => ({ searchSpace, selected: true, selectionReason: `selected ${searchSpace.id}` })),
});

const propagation = (...entries: Array<[string, number]>): FutureConstraintPropagationAnalysis => ({
  effects: entries.map(([searchSpaceId, propagationScore]) => ({
    searchSpaceId,
    propagationScore,
    propagatedConstraints: [`search-space:${searchSpaceId}`],
    explanation: `score ${propagationScore}`,
  })),
});

test("orderSearchSpaces supports an empty collection", () => {
  assert.deepEqual(orderSearchSpaces({ selected: [] }, { effects: [] }), { orderedSearchSpaces: [] });
});

test("orderSearchSpaces orders one SearchSpace", () => {
  const result = orderSearchSpaces(selection([space("space:a", 10)]), propagation(["space:a", 0.3]));
  assert.equal(result.orderedSearchSpaces.length, 1);
  assert.equal(result.orderedSearchSpaces[0]?.explorationOrder, 1);
  assert.match(result.orderedSearchSpaces[0]?.explanation ?? "", /operationalPriority=10/);
});

test("orderSearchSpaces orders multiple SearchSpaces by deterministic ordering score", () => {
  const result = orderSearchSpaces(selection([space("low", 10), space("high", 90), space("mid", 50)]), propagation(["low", 0.1], ["high", 0.1], ["mid", 0.1]));
  assert.deepEqual(result.orderedSearchSpaces.map((item) => item.searchSpace.id), ["high", "mid", "low"]);
  assert.deepEqual(result.orderedSearchSpaces.map((item) => item.explorationOrder), [1, 2, 3]);
});

test("orderSearchSpaces resolves ties stably with selection order", () => {
  const input = [space("b", 50), space("a", 50), space("c", 50)];
  const result = orderSearchSpaces(selection(input), propagation(["b", 0.2], ["a", 0.2], ["c", 0.2]));
  assert.deepEqual(result.orderedSearchSpaces.map((item) => item.searchSpace.id), ["b", "a", "c"]);
});

test("orderSearchSpaces is deterministic", () => {
  const input = selection([space("b", 50), space("a", 50), space("c", 70)]);
  const effects = propagation(["b", 0.2], ["a", 0.2], ["c", 0.3]);
  assert.deepEqual(orderSearchSpaces(input, effects), orderSearchSpaces(input, effects));
});

test("BranchOrderingResult is structurally serializable", () => {
  const result = orderSearchSpaces(selection([space("space:a", 10)]), propagation(["space:a", 0.3]));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("orderSearchSpaces does not mutate inputs", () => {
  const input = selection([space("space:a", 10)]);
  const effects = propagation(["space:a", 0.3]);
  const before = JSON.parse(JSON.stringify({ input, effects }));
  orderSearchSpaces(input, effects);
  assert.deepEqual(JSON.parse(JSON.stringify({ input, effects })), before);
});

test("buildBranchOrderingEvidence records order, score, criteria, and explanation", () => {
  const result = orderSearchSpaces(selection([space("space:a", 10)]), propagation(["space:a", 0.3]));
  const evidence = buildBranchOrderingEvidence(result, "2026-06-27T00:00:00.000Z");
  assert.equal(evidence[0]?.kind, "branch-ordering");
  assert.equal(evidence[0]?.data.explorationOrder, 1);
  assert.equal(Array.isArray(evidence[0]?.data.criteria), true);
  assert.match(String(evidence[0]?.data.explanation), /Branch ordering score/);
});
