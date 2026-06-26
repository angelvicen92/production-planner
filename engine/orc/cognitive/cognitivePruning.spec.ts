import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, Opportunity, SearchSpace } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { createInitialCognitiveState, recordDiscardedCandidate, recordExhaustedSearchSpace, recordExploredOpportunity } from "./cognitiveState";
import { pruneDiscardedCandidates, pruneExhaustedSearchSpaces, pruneRepeatedOpportunities } from "./cognitivePruning";

const opportunity = (id: string): Opportunity => ({ id, kind: "MAIN_FLOW_GAP", taskIds: [1], searchSpaceIds: [], evidenceIds: [], metadata: {} });
const searchSpace = (id: string): SearchSpace => ({ id, taskIds: [1], candidates: [], evidenceIds: [], metadata: {} });
const candidate = (id: string): Candidate => ({ id, state: { status: "draft", evidenceIds: [], metadata: {} }, assignments: [], operationalValues: [], evidenceIds: [], metadata: {} });

test("cognitive pruning keeps everything for an empty cognitive state", () => {
  const state = createInitialCognitiveState(null);
  assert.deepEqual(pruneRepeatedOpportunities(state, [opportunity("opp:1")]).items.map((item) => item.id), ["opp:1"]);
  assert.deepEqual(pruneExhaustedSearchSpaces(state, [searchSpace("space:1")]).items.map((item) => item.id), ["space:1"]);
  assert.deepEqual(pruneDiscardedCandidates(state, [candidate("candidate:1")]).items.map((item) => item.id), ["candidate:1"]);
});

test("cognitive pruning removes repeated opportunities, exhausted search spaces and discarded candidates", () => {
  const state = recordDiscardedCandidate(recordExhaustedSearchSpace(recordExploredOpportunity(createInitialCognitiveState(null), "opp:1"), "space:1"), "candidate:1");
  const opportunities = pruneRepeatedOpportunities(state, [opportunity("opp:1"), opportunity("opp:2")]);
  const searchSpaces = pruneExhaustedSearchSpaces(state, [searchSpace("space:1"), searchSpace("space:2")]);
  const candidates = pruneDiscardedCandidates(state, [candidate("candidate:1"), candidate("candidate:2")]);
  assert.deepEqual(opportunities.items.map((item) => item.id), ["opp:2"]);
  assert.deepEqual(searchSpaces.items.map((item) => item.id), ["space:2"]);
  assert.deepEqual(candidates.items.map((item) => item.id), ["candidate:2"]);
  assert.equal(opportunities.stats.prunedItems[0]?.reason, "repeated-opportunity");
  assert.equal(searchSpaces.stats.prunedItems[0]?.reason, "exhausted-search-space");
  assert.equal(candidates.stats.prunedItems[0]?.reason, "discarded-candidate");
});

test("cognitive pruning is deterministic, structurally equal and does not mutate inputs", () => {
  const state = recordExploredOpportunity(createInitialCognitiveState("t"), "opp:1");
  const items = [opportunity("opp:1"), opportunity("opp:2")];
  const beforeItems = stableStringify(items);
  const beforeState = stableStringify(state);
  const first = pruneRepeatedOpportunities(state, items);
  const second = pruneRepeatedOpportunities(state, items);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(items), beforeItems);
  assert.equal(stableStringify(state), beforeState);
  assert.notEqual(first.items, items);
});

