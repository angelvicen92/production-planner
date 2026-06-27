import assert from "node:assert/strict";
import test from "node:test";
import type { SearchSpace } from "../contracts";
import { createInitialCognitiveState, recordExhaustedSearchSpace, updateReasoningBudget } from "../cognitive/cognitiveState";
import { createReasoningBudget } from "../cognitive/reasoningBudget";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildStrategyCandidates } from "./strategyCandidateBuilder";

const cognitive = (maxCandidates = 20) => updateReasoningBudget(createInitialCognitiveState(null), createReasoningBudget({ maxCandidates }));

const space = (id: string, overrides: Partial<SearchSpace> = {}): SearchSpace => ({
  id,
  description: `space ${id}`,
  taskIds: [1, 2, 3],
  candidates: [],
  evidenceIds: [],
  metadata: {
    readOnly: true,
    sourceOpportunityId: `op:${id}`,
    sourceOpportunityKind: "GENERIC",
    affectedRegion: "region-a",
    allowedTransformations: ["MOVE_CHAIN_POSSIBLE", "REORDER_REGION_POSSIBLE", "COMPACT_REGION_POSSIBLE"],
  },
  ...overrides,
});

test("buildStrategyCandidates handles empty SearchSpace input", () => {
  const result = buildStrategyCandidates([], cognitive());
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.summary, { generatedCandidates: 0, discardedEquivalentCandidates: 0, strategyTypes: 0 });
  assert.equal(result.evidence.at(-1)?.kind, "strategy-candidate-diversity");
});

test("buildStrategyCandidates creates strategy-oriented candidates for one SearchSpace", () => {
  const result = buildStrategyCandidates([space("one")], cognitive());
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(result.candidates.map((candidate) => candidate.metadata.strategyFamily), ["continuity", "chain-advance", "compaction"]);
  assert.equal(result.candidates.every((candidate) => Array.isArray(candidate.metadata.transformations) && (candidate.metadata.transformations as unknown[]).length > 1), true);
  assert.equal(result.candidates.every((candidate) => candidate.metadata.strategyCandidate === true && candidate.metadata.executesTransformations === false), true);
  assert.equal(result.summary.strategyTypes, 3);
});

test("buildStrategyCandidates handles multiple SearchSpaces deterministically", () => {
  const spaces = [space("one"), space("two", { metadata: { ...space("two").metadata, affectedRegion: "region-b", allowedTransformations: ["RESOURCE_REASSIGNMENT_POSSIBLE"] } })];
  const first = buildStrategyCandidates(spaces, cognitive());
  const second = buildStrategyCandidates(spaces, cognitive());
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(first.candidates.map((candidate) => candidate.metadata.sourceOpportunityId), ["op:one", "op:one", "op:one", "op:two", "op:two"]);
});

test("buildStrategyCandidates discards equivalent candidates", () => {
  const duplicate = space("duplicate", { metadata: { ...space("duplicate").metadata, sourceOpportunityId: "op:one" } });
  const result = buildStrategyCandidates([space("one"), duplicate], cognitive());
  assert.equal(result.candidates.length, 3);
  assert.equal(result.summary.discardedEquivalentCandidates, 3);
  assert.equal(result.evidence.filter((item) => item.kind === "strategy-candidate-discarded" && item.data.reason === "equivalent-candidate").length, 3);
});

test("buildStrategyCandidates preserves diversity and respects candidate budget", () => {
  const result = buildStrategyCandidates([space("one"), space("two", { metadata: { ...space("two").metadata, affectedRegion: "region-b", allowedTransformations: ["RESOURCE_REASSIGNMENT_POSSIBLE", "LOCK_CONSTRAINED_EXPLORATION"] } })], cognitive(4));
  assert.equal(result.candidates.length, 4);
  assert.ok(result.summary.strategyTypes >= 3);
  assert.ok(result.evidence.some((item) => item.kind === "strategy-candidate-discarded" && item.data.reason === "insufficient-candidate-budget"));
});

test("buildStrategyCandidates uses structural equality and does not mutate inputs", () => {
  const spaces = [space("one")];
  const state = cognitive();
  const beforeSpaces = stableStringify(spaces);
  const beforeState = stableStringify(state);
  const first = buildStrategyCandidates(spaces, state);
  const second = buildStrategyCandidates(spaces, state);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(spaces), beforeSpaces);
  assert.equal(stableStringify(state), beforeState);
});

test("buildStrategyCandidates skips exhausted SearchSpaces", () => {
  const exhausted = recordExhaustedSearchSpace(cognitive(), "space:done");
  const result = buildStrategyCandidates([space("space:done")], exhausted);
  assert.equal(result.candidates.length, 0);
  assert.ok(result.evidence.some((item) => item.kind === "strategy-candidate-discarded" && item.data.reason === "exhausted-region"));
});
