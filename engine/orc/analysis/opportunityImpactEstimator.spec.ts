import assert from "node:assert/strict";
import test from "node:test";
import type { Opportunity } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { estimateOpportunityImpact } from "./opportunityImpactEstimator";

const opportunity = (id: string, overrides: Partial<Opportunity> = {}): Opportunity => ({
  id,
  kind: "RESOURCE_PRESSURE",
  description: `opportunity ${id}`,
  taskIds: [1, 2],
  searchSpaceIds: [],
  evidenceIds: [],
  metadata: {
    priority: 80,
    bottleneckIds: ["resource:10:overlap"],
    derivedFromCriticalBottleneck: true,
  },
  ...overrides,
});

test("estimateOpportunityImpact supports an empty collection", () => {
  assert.deepEqual(estimateOpportunityImpact([]), { impacts: [] });
});

test("estimateOpportunityImpact estimates one Opportunity", () => {
  const result = estimateOpportunityImpact([opportunity("op:a")]);
  assert.equal(result.impacts.length, 1);
  assert.equal(result.impacts[0].opportunityId, "op:a");
  assert.equal(typeof result.impacts[0].expectedImpact, "number");
  assert.equal(typeof result.impacts[0].confidence, "number");
  assert.match(result.impacts[0].explanation, /priority=80/);
});

test("estimateOpportunityImpact estimates multiple Opportunities in stable input order", () => {
  const result = estimateOpportunityImpact([
    opportunity("op:a", { kind: "FRAGMENTATION", taskIds: [1], metadata: { priority: 50, bottleneckIds: [], derivedFromCriticalBottleneck: false } }),
    opportunity("op:b", { kind: "MAIN_FLOW_GAP", taskIds: [1, 2, 3], metadata: { priority: 100, bottleneckIds: ["gap:1"], derivedFromCriticalBottleneck: true } }),
  ]);
  assert.deepEqual(result.impacts.map((impact) => impact.opportunityId), ["op:a", "op:b"]);
  assert.ok(result.impacts[1].expectedImpact > result.impacts[0].expectedImpact);
});

test("estimateOpportunityImpact preserves ties without reordering", () => {
  const result = estimateOpportunityImpact([opportunity("op:b"), opportunity("op:a")]);
  assert.deepEqual(result.impacts.map((impact) => impact.opportunityId), ["op:b", "op:a"]);
  assert.equal(result.impacts[0].expectedImpact, result.impacts[1].expectedImpact);
  assert.equal(result.impacts[0].confidence, result.impacts[1].confidence);
});

test("estimateOpportunityImpact is deterministic", () => {
  const input = [opportunity("op:a"), opportunity("op:b", { taskIds: [3] })];
  const first = estimateOpportunityImpact(input);
  const second = estimateOpportunityImpact(input);
  assert.equal(structuralEquals(first, second), true);
});

test("estimateOpportunityImpact returns structurally serializable analysis", () => {
  const result = estimateOpportunityImpact([opportunity("op:a")]);
  assert.equal(structuralEquals(result, JSON.parse(JSON.stringify(result))), true);
});

test("estimateOpportunityImpact does not mutate Opportunities", () => {
  const input = [opportunity("op:a")];
  const before = stableStringify(input);
  estimateOpportunityImpact(input);
  assert.equal(stableStringify(input), before);
});
