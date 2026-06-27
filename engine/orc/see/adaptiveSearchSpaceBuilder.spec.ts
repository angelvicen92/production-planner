import assert from "node:assert/strict";
import test from "node:test";
import type { Opportunity } from "../contracts";
import { createInitialCognitiveState, recordExhaustedSearchSpace } from "../cognitive/cognitiveState";
import { createReasoningBudget } from "../cognitive/reasoningBudget";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildAdaptiveSearchSpaces } from "./adaptiveSearchSpaceBuilder";

const opportunity = (id: string, kind = "MAIN_FLOW_GAP", taskIds = [3, 1, 2]): Opportunity => ({
  id,
  kind,
  description: kind,
  taskIds,
  searchSpaceIds: [],
  evidenceIds: [],
  metadata: { priority: 100 },
});

const cognitive = () => createInitialCognitiveState("2026-06-26T00:00:00.000Z");
const budget = (maxSearchSpaces = 10, maxCandidates = 20) => createReasoningBudget({ maxSearchSpaces, maxCandidates });

test("buildAdaptiveSearchSpaces returns empty result without opportunities", () => {
  const result = buildAdaptiveSearchSpaces([], cognitive(), budget());
  assert.deepEqual(result.searchSpaces, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.summary, { generatedSearchSpaces: 0, discardedSearchSpaces: 0, averageSearchSpaceSize: 0, exhaustedRegionsSkipped: 0 });
});

test("buildAdaptiveSearchSpaces creates a local read-only space for one opportunity", () => {
  const result = buildAdaptiveSearchSpaces([opportunity("op:1")], cognitive(), budget());
  assert.equal(result.searchSpaces.length, 2);
  assert.equal(result.searchSpaces[0].metadata.sourceOpportunityId, "op:1");
  assert.equal(result.searchSpaces[0].metadata.affectedRegion, "configured-main-flow");
  assert.equal(result.searchSpaces[0].metadata.readOnly, true);
  assert.deepEqual(result.searchSpaces[0].candidates, []);
  assert.ok(result.evidence.every((item) => item.kind === "adaptive-search-space-built"));
});

test("buildAdaptiveSearchSpaces handles multiple opportunities deterministically", () => {
  const opportunities = [opportunity("op:1", "MAIN_FLOW_GAP"), opportunity("op:2", "RESOURCE_PRESSURE", [9])];
  const first = buildAdaptiveSearchSpaces(opportunities, cognitive(), budget());
  const second = buildAdaptiveSearchSpaces(opportunities, cognitive(), budget());
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(first.searchSpaces.map((space) => space.metadata.sourceOpportunityId), ["op:1", "op:1", "op:2"]);
});

test("buildAdaptiveSearchSpaces skips exhausted regions from CognitiveState", () => {
  const state = recordExhaustedSearchSpace(cognitive(), "orc-see:adaptive-search-space:op:1:region-focus");
  const result = buildAdaptiveSearchSpaces([opportunity("op:1")], state, budget());
  assert.equal(result.summary.exhaustedRegionsSkipped, 1);
  assert.equal(result.searchSpaces.some((space) => space.id.endsWith(":region-focus")), false);
  assert.ok(result.evidence.some((item) => item.kind === "adaptive-search-space-discarded" && item.data.reason === "exhausted-region"));
});

test("buildAdaptiveSearchSpaces respects insufficient search-space budget", () => {
  const result = buildAdaptiveSearchSpaces([opportunity("op:1")], cognitive(), budget(1));
  assert.equal(result.searchSpaces.length, 1);
  assert.equal(result.summary.discardedSearchSpaces, 1);
  assert.ok(result.evidence.some((item) => item.data.reason === "insufficient-search-space-budget"));
});

test("buildAdaptiveSearchSpaces produces deterministic diversity and non-equivalent spaces", () => {
  const result = buildAdaptiveSearchSpaces([opportunity("op:1", "FRAGMENTATION", [1, 2, 3, 4])], cognitive(), budget());
  const keys = result.searchSpaces.map((space) => (space.metadata.diversity as { key: string }).key);
  assert.equal(new Set(keys).size, result.searchSpaces.length);
  assert.notDeepEqual(result.searchSpaces[0].metadata.allowedTransformations, result.searchSpaces[1].metadata.allowedTransformations);
});

test("buildAdaptiveSearchSpaces preserves structural equality and does not mutate inputs", () => {
  const opportunities = [opportunity("op:1")];
  const state = cognitive();
  const reasoningBudget = budget();
  const before = stableStringify({ opportunities, state, reasoningBudget });
  const first = buildAdaptiveSearchSpaces(opportunities, state, reasoningBudget);
  const second = buildAdaptiveSearchSpaces(opportunities, state, reasoningBudget);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify({ opportunities, state, reasoningBudget }), before);
});


test("buildAdaptiveSearchSpaces uses adaptive profiles for depth, breadth and evidence", () => {
  const opportunities = [opportunity("op:low", "MAIN_FLOW_GAP", [1, 2, 3, 4]), opportunity("op:high", "MAIN_FLOW_GAP", [1, 2, 3, 4])];
  const profiles = [
    { opportunityId: "op:low", criticalityLevel: 1, propagationScore: 0, reasoningBudget: 1, maxDepth: 1, maxBreadth: 1, expectedExplorationValue: 1 },
    { opportunityId: "op:high", criticalityLevel: 3, propagationScore: 1, reasoningBudget: 4, maxDepth: 3, maxBreadth: 4, expectedExplorationValue: 13 },
  ];
  const result = buildAdaptiveSearchSpaces(opportunities, cognitive(), budget(), { profiles, createdAt: "t" });
  const low = result.searchSpaces.find((space) => space.metadata.sourceOpportunityId === "op:low" && space.metadata.diversity && (space.metadata.diversity as { strategy: string }).strategy === "region-focus");
  const high = result.searchSpaces.find((space) => space.metadata.sourceOpportunityId === "op:high" && space.metadata.diversity && (space.metadata.diversity as { strategy: string }).strategy === "region-focus");
  assert.equal(low?.taskIds.length, 1);
  assert.equal(high?.taskIds.length, 4);
  assert.equal((low?.metadata.allowedTransformations as string[]).length, 1);
  assert.equal((high?.metadata.allowedTransformations as string[]).length, 2);
  assert.equal(result.evidence.some((item) => item.kind === "adaptive-search-space-built" && item.data.adaptiveProfile === profiles[1] && item.data.generatedBreadth === 4 && item.data.generatedDepth === 2 && item.createdAt === "t"), true);
});
