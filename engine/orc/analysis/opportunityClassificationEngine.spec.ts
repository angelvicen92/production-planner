import assert from "node:assert/strict";
import test from "node:test";
import type { Opportunity } from "../contracts";
import { classifyOpportunities } from "./opportunityClassificationEngine";

const opportunity = (id: string, kind = "MAIN_FLOW_GAP", metadata = {}): Opportunity => ({
  id,
  kind,
  description: null,
  taskIds: [2, 1],
  searchSpaceIds: ["space:1"],
  evidenceIds: ["evidence:1"],
  metadata,
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("Opportunity Classification Engine supports an empty collection", () => {
  assert.deepEqual(classifyOpportunities([]), { opportunities: [] });
});

test("Opportunity Classification Engine classifies one opportunity", () => {
  const result = classifyOpportunities([opportunity("op:1", "RESOURCE_PRESSURE", { impactExpected: "reduce_resource_conflicts", overloadedResourceIds: [10] })]);
  assert.equal(result.opportunities.length, 1);
  assert.deepEqual(result.opportunities[0].classification, {
    family: "resource",
    affectedRegion: "resource",
    expectedImpact: "reduce_resource_conflicts",
    operationalSignal: "resource-pressure",
    constraints: ["resource-overlap"],
  });
});

test("Opportunity Classification Engine classifies multiple opportunities without reordering", () => {
  const result = classifyOpportunities([
    opportunity("op:1", "FRAGMENTATION", { impactExpected: "reduce_space_switches" }),
    opportunity("op:2", "LOCK_PRESSURE", { lockCount: 1, dependencyCount: 2, cause: "CRITICAL_DEPENDENCIES" }),
  ]);
  assert.deepEqual(result.opportunities.map((item) => item.id), ["op:1", "op:2"]);
  assert.deepEqual(result.opportunities.map((item) => item.classification.family), ["fragmentation", "constraints"]);
  assert.deepEqual(result.opportunities[1].classification.constraints, ["critical-dependencies", "dependencies", "locks"]);
});

test("Opportunity Classification Engine is deterministic, structurally equal and serializable", () => {
  const opportunities = [opportunity("op:1", "MAIN_FLOW_GAP", { affectedRegion: "main-flow", impactExpected: "reduce_idle_time" })];
  const first = classifyOpportunities(opportunities);
  const second = classifyOpportunities(opportunities);
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test("Opportunity Classification Engine preserves structural opportunity data", () => {
  const input = [opportunity("op:1", "UNPLANNED_PENDING_TASKS", { priority: 90 })];
  const classified = classifyOpportunities(input).opportunities[0];
  const { classification: _classification, ...withoutClassification } = classified;
  assert.deepEqual(withoutClassification, input[0]);
});

test("Opportunity Classification Engine does not mutate its input", () => {
  const input = [opportunity("op:1", "LOCK_PRESSURE", { lockCount: 1 })];
  const before = clone(input);
  const result = classifyOpportunities(input);
  result.opportunities[0].taskIds.push(99);
  (result.opportunities[0].metadata as Record<string, unknown>).lockCount = 2;
  assert.deepEqual(input, before);
});
