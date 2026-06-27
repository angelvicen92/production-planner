import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifiedOpportunity } from "./opportunityClassificationEngine";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { prioritizeOpportunities } from "./opportunityPrioritizationEngine";

const opportunity = (id: string, family = "continuity", priority?: number): ClassifiedOpportunity => ({
  id,
  kind: family.toUpperCase(),
  description: null,
  taskIds: [2, 1],
  searchSpaceIds: ["space:1"],
  evidenceIds: ["evidence:1"],
  metadata: priority === undefined ? {} : { priority },
  classification: {
    family,
    affectedRegion: `${family}-region`,
    expectedImpact: "known-impact",
    operationalSignal: `${family}-signal`,
    constraints: ["locks"],
  },
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("Opportunity Prioritization Engine supports an empty collection", () => {
  assert.deepEqual(prioritizeOpportunities([]), { opportunities: [] });
});

test("Opportunity Prioritization Engine prioritizes one opportunity", () => {
  const result = prioritizeOpportunities([opportunity("op:1", "resource", 88)]);
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].priority, 88);
  assert.deepEqual(result.opportunities[0].rationale, [
    "priority=88",
    "criterion=metadata.priority",
    "family=resource",
    "operationalSignal=resource-signal",
    "affectedRegion=resource-region",
    "expectedImpact=known-impact",
    "constraints=locks",
    "finalOrder=0",
  ]);
});

test("Opportunity Prioritization Engine orders multiple opportunities by priority", () => {
  const result = prioritizeOpportunities([
    opportunity("op:low", "fragmentation", 50),
    opportunity("op:high", "continuity", 100),
    opportunity("op:mid", "resource", 80),
  ]);
  assert.deepEqual(result.opportunities.map((item) => item.id), ["op:high", "op:mid", "op:low"]);
  assert.deepEqual(result.opportunities.map((item) => item.priority), [100, 80, 50]);
});

test("Opportunity Prioritization Engine keeps stable order for ties", () => {
  const result = prioritizeOpportunities([
    opportunity("op:a", "resource", 80),
    opportunity("op:b", "continuity", 80),
    opportunity("op:c", "fragmentation", 80),
  ]);
  assert.deepEqual(result.opportunities.map((item) => item.id), ["op:a", "op:b", "op:c"]);
});

test("Opportunity Prioritization Engine falls back to classification family priority", () => {
  const result = prioritizeOpportunities([opportunity("op:fragmentation", "fragmentation"), opportunity("op:completion", "completion")]);
  assert.deepEqual(result.opportunities.map((item) => item.id), ["op:completion", "op:fragmentation"]);
  assert.deepEqual(result.opportunities.map((item) => item.priority), [90, 50]);
});

test("Opportunity Prioritization Engine is deterministic, structurally equal and serializable", () => {
  const opportunities = [opportunity("op:1", "resource", 80), opportunity("op:2", "continuity", 100)];
  const first = prioritizeOpportunities(opportunities);
  const second = prioritizeOpportunities(opportunities);
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test("Opportunity Prioritization Engine preserves structural classified opportunity data", () => {
  const input = [opportunity("op:1", "completion", 90)];
  const prioritized = prioritizeOpportunities(input).opportunities[0];
  const { priority: _priority, rationale: _rationale, ...withoutPrioritization } = prioritized;
  assert.deepEqual(withoutPrioritization, input[0]);
});

test("Opportunity Prioritization Engine does not mutate its input", () => {
  const input = [opportunity("op:1", "constraints", 60)];
  const before = clone(input);
  const result = prioritizeOpportunities(input);
  result.opportunities[0].taskIds.push(99);
  result.opportunities[0].rationale.push("mutated-output-only");
  (result.opportunities[0].metadata as Record<string, unknown>).priority = 1;
  assert.deepEqual(input, before);
  assert.equal(stableStringify(input), stableStringify(before));
});
