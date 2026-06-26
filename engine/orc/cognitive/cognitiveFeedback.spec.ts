import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, Opportunity, SearchSpace } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { createInitialCognitiveState, recordDiscardedCandidate, recordExhaustedSearchSpace, recordExploredOpportunity } from "./cognitiveState";
import { registerDiscard, registerExhaustedSearchSpace, registerExploration, shouldSkipCandidate, shouldSkipOpportunity, shouldSkipSearchSpace } from "./cognitiveFeedback";

const opportunity = (id: string): Opportunity => ({ id, kind: "MAIN_FLOW_GAP", taskIds: [1], searchSpaceIds: [], evidenceIds: [], metadata: {} });
const searchSpace = (id: string): SearchSpace => ({ id, taskIds: [1], candidates: [], evidenceIds: [], metadata: {} });
const candidate = (id: string): Candidate => ({ id, state: { status: "draft", evidenceIds: [], metadata: {} }, assignments: [], operationalValues: [], evidenceIds: [], metadata: {} });

test("cognitive feedback does not skip anything for an empty session", () => {
  const state = createInitialCognitiveState(null);
  assert.equal(shouldSkipOpportunity(state, opportunity("opp:1")), false);
  assert.equal(shouldSkipSearchSpace(state, searchSpace("space:1")), false);
  assert.equal(shouldSkipCandidate(state, candidate("candidate:1")), false);
});

test("cognitive feedback detects repeated opportunities, search spaces and candidates", () => {
  const state = recordDiscardedCandidate(recordExhaustedSearchSpace(recordExploredOpportunity(createInitialCognitiveState(null), "opp:1"), "space:1"), "candidate:1");
  assert.equal(shouldSkipOpportunity(state, "opp:1"), true);
  assert.equal(shouldSkipSearchSpace(state, "space:1"), true);
  assert.equal(shouldSkipCandidate(state, "candidate:1"), true);
});

test("cognitive feedback registrations are pure and do not mutate previous state", () => {
  const initial = createInitialCognitiveState(null);
  const before = stableStringify(initial);
  const updated = registerDiscard(registerExhaustedSearchSpace(registerExploration(initial, opportunity("opp:1")), searchSpace("space:1")), candidate("candidate:1"));
  assert.equal(stableStringify(initial), before);
  assert.deepEqual(updated.exploredOpportunityIds, ["opp:1"]);
  assert.deepEqual(updated.exhaustedSearchSpaceIds, ["space:1"]);
  assert.deepEqual(updated.discardedCandidateIds, ["candidate:1"]);
  assert.notEqual(updated, initial);
});

test("cognitive feedback is deterministic and structurally equal for the same inputs", () => {
  const build = () => registerDiscard(registerExhaustedSearchSpace(registerExploration(createInitialCognitiveState("t"), "opp:1"), "space:1"), "candidate:1");
  assert.equal(structuralEquals(build(), build()), true);
});
