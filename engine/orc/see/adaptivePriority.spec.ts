import assert from "node:assert/strict";
import test from "node:test";
import type { Opportunity } from "../contracts";
import { createInitialCognitiveState, recordExploredOpportunity, recordExhaustedSearchSpace } from "../cognitive/cognitiveState";
import { mergeSessionKnowledge } from "../cognitive/sessionLearning";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { reprioritizeOpportunities } from "./adaptivePriority";

const opportunity = (id: string, kind: string, priority: number): Opportunity => ({
  id,
  kind,
  description: id,
  taskIds: [1],
  searchSpaceIds: [],
  evidenceIds: [`evidence:${id}`],
  metadata: { priority },
});

const base = [
  opportunity("op:a", "MAIN_FLOW_GAP", 100),
  opportunity("op:b", "RESOURCE_PRESSURE", 80),
  opportunity("op:c", "FRAGMENTATION", 80),
];

test("reprioritizeOpportunities leaves empty CognitiveState without adjustments", () => {
  const before = stableStringify(base);
  const result = reprioritizeOpportunities(base, createInitialCognitiveState());
  assert.deepEqual(result.opportunities, base);
  assert.equal(result.summary.reprioritizedCount, 0);
  assert.equal(result.summary.promotedCount, 0);
  assert.equal(result.summary.demotedCount, 0);
  assert.equal(stableStringify(base), before);
  assert.ok(result.evidence.every((evidence) => evidence.data.reason === "no-cognitive-priority-signal"));
});

test("reprioritizeOpportunities demotes previously explored opportunities", () => {
  const state = recordExploredOpportunity(createInitialCognitiveState(), "op:a");
  const result = reprioritizeOpportunities(base, state);
  assert.equal(result.summary.demotedCount, 1);
  assert.equal(result.opportunities.at(-1)?.id, "op:a");
  assert.equal(result.opportunities.find((item) => item.id === "op:a")?.metadata.priority, 70);
});

test("reprioritizeOpportunities demotes exhausted regions linked to opportunities", () => {
  const state = recordExhaustedSearchSpace(createInitialCognitiveState(), "orc-see:search-space:op:b");
  const result = reprioritizeOpportunities(base, state);
  assert.equal(result.summary.demotedCount, 1);
  assert.equal(result.opportunities.find((item) => item.id === "op:b")?.metadata.priority, 55);
  assert.ok(result.evidence.some((evidence) => evidence.subjectId === "op:b" && evidence.data.reason === "linked-search-space-exhausted"));
});

test("reprioritizeOpportunities promotes opportunities matching useful learned patterns", () => {
  const state = mergeSessionKnowledge(createInitialCognitiveState(), { learnedPatterns: ["REASSIGN_RESOURCE"] });
  const result = reprioritizeOpportunities(base, state);
  assert.equal(result.summary.promotedCount, 1);
  assert.equal(result.opportunities[1]?.id, "op:b");
  assert.equal(result.opportunities[1]?.metadata.priority, 90);
});

test("reprioritizeOpportunities keeps stable order for ties", () => {
  const tied = [opportunity("op:x", "RESOURCE_PRESSURE", 50), opportunity("op:y", "FRAGMENTATION", 50)];
  const result = reprioritizeOpportunities(tied, createInitialCognitiveState());
  assert.deepEqual(result.opportunities.map((item) => item.id), ["op:x", "op:y"]);
});

test("reprioritizeOpportunities is deterministic and structurally equal for repeated calls", () => {
  const state = mergeSessionKnowledge(recordExploredOpportunity(createInitialCognitiveState(), "op:a"), { learnedPatterns: ["REASSIGN_RESOURCE"], unproductiveOpportunities: ["op:c"] });
  const first = reprioritizeOpportunities(base, state);
  const second = reprioritizeOpportunities(base, state);
  assert.equal(structuralEquals(first, second), true);
});

test("reprioritizeOpportunities never mutates, creates, removes, or renames opportunities", () => {
  const before = stableStringify(base);
  const result = reprioritizeOpportunities(base, recordExploredOpportunity(createInitialCognitiveState(), "op:a"));
  assert.equal(stableStringify(base), before);
  assert.deepEqual([...result.opportunities.map((item) => item.id)].sort(), [...base.map((item) => item.id)].sort());
  assert.equal(result.opportunities.length, base.length);
});
