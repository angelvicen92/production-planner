import assert from "node:assert/strict";
import test from "node:test";
import type { SearchSpace } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { estimateExplorationValue } from "./explorationValueEstimator";

const searchSpace = (id: string, overrides: Partial<SearchSpace> = {}): SearchSpace => ({
  id,
  description: `space ${id}`,
  taskIds: [1, 2],
  candidates: [],
  evidenceIds: [],
  metadata: {
    readOnly: true,
    sourceOpportunityPriority: 50,
    allowedTransformations: ["MOVE_CHAIN_POSSIBLE", "REORDER_REGION_POSSIBLE"],
  },
  ...overrides,
});

test("estimateExplorationValue supports an empty collection", () => {
  assert.deepEqual(estimateExplorationValue([]), { values: [] });
});

test("estimateExplorationValue estimates one SearchSpace", () => {
  const result = estimateExplorationValue([searchSpace("space:a")]);
  assert.equal(result.values.length, 1);
  assert.equal(result.values[0].searchSpaceId, "space:a");
  assert.equal(typeof result.values[0].expectedValue, "number");
  assert.equal(typeof result.values[0].confidence, "number");
  assert.match(result.values[0].explanation, /priority=50/);
});

test("estimateExplorationValue estimates multiple SearchSpaces in stable input order", () => {
  const result = estimateExplorationValue([
    searchSpace("space:a", { metadata: { sourceOpportunityPriority: 10, allowedTransformations: [] } }),
    searchSpace("space:b", { metadata: { sourceOpportunityPriority: 90, allowedTransformations: ["A", "B", "C"] } }),
  ]);
  assert.deepEqual(result.values.map((value) => value.searchSpaceId), ["space:a", "space:b"]);
  assert.ok(result.values[1].expectedValue > result.values[0].expectedValue);
});

test("estimateExplorationValue preserves ties without reordering", () => {
  const result = estimateExplorationValue([searchSpace("space:b"), searchSpace("space:a")]);
  assert.deepEqual(result.values.map((value) => value.searchSpaceId), ["space:b", "space:a"]);
  assert.equal(result.values[0].expectedValue, result.values[1].expectedValue);
  assert.equal(result.values[0].confidence, result.values[1].confidence);
});

test("estimateExplorationValue is deterministic", () => {
  const input = [searchSpace("space:a"), searchSpace("space:b", { taskIds: [3] })];
  const first = estimateExplorationValue(input);
  const second = estimateExplorationValue(input);
  assert.equal(structuralEquals(first, second), true);
});

test("estimateExplorationValue returns structurally serializable analysis", () => {
  const result = estimateExplorationValue([searchSpace("space:a")]);
  assert.equal(structuralEquals(result, JSON.parse(JSON.stringify(result))), true);
});

test("estimateExplorationValue does not mutate SearchSpaces", () => {
  const input = [searchSpace("space:a")];
  const before = stableStringify(input);
  estimateExplorationValue(input);
  assert.equal(stableStringify(input), before);
});
