import assert from "node:assert/strict";
import test from "node:test";
import { stableStringify, structuralEquals } from "../structuralEquality";
import {
  createInitialCognitiveState,
  recordDiscardedCandidate,
  recordExhaustedSearchSpace,
  recordExploredOpportunity,
  recordObservedCommit,
  recordSimulatedCandidate,
  updateReasoningBudget,
  createInitialSessionMemory,
} from "./cognitiveState";
import { consumeCandidate, consumeSimulation, createReasoningBudget } from "./reasoningBudget";

test("createInitialCognitiveState creates an empty temporal session memory", () => {
  const state = createInitialCognitiveState("2026-06-25T00:00:00.000Z");
  assert.deepEqual(state, {
    exploredOpportunityIds: [],
    exhaustedSearchSpaceIds: [],
    discardedCandidateIds: [],
    simulatedCandidateIds: [],
    committedCandidateIds: [],
    reasoningBudget: createReasoningBudget(),
    temporaryKnowledge: {},
    confidence: 0,
    createdAt: "2026-06-25T00:00:00.000Z",
  });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.reasoningBudget), true);
  assert.equal(Object.isFrozen(state.exploredOpportunityIds), true);
});

test("createInitialSessionMemory wraps a fresh cognitive state", () => {
  const memory = createInitialSessionMemory("2026-06-25T00:00:00.000Z");
  assert.equal(Object.isFrozen(memory), true);
  assert.deepEqual(memory.cognitiveState, createInitialCognitiveState("2026-06-25T00:00:00.000Z"));
});

test("cognitive updates record opportunities, search spaces and candidates", () => {
  const initial = createInitialCognitiveState(null);
  const updated = recordObservedCommit(
    recordSimulatedCandidate(
      recordDiscardedCandidate(
        recordExhaustedSearchSpace(recordExploredOpportunity(initial, "opp:1"), "space:1"),
        "candidate:discarded",
      ),
      "candidate:simulated",
    ),
    "candidate:committed",
  );

  assert.deepEqual(updated.exploredOpportunityIds, ["opp:1"]);
  assert.deepEqual(updated.exhaustedSearchSpaceIds, ["space:1"]);
  assert.deepEqual(updated.discardedCandidateIds, ["candidate:discarded"]);
  assert.deepEqual(updated.simulatedCandidateIds, ["candidate:simulated"]);
  assert.deepEqual(updated.committedCandidateIds, ["candidate:committed"]);
  assert.deepEqual(initial, createInitialCognitiveState(null));
});

test("updateReasoningBudget is pure and preserves unrelated state", () => {
  const initial = recordExploredOpportunity(createInitialCognitiveState(null), "opp:1");
  const before = stableStringify(initial);
  const updated = updateReasoningBudget(initial, consumeSimulation(consumeCandidate(initial.reasoningBudget)));

  assert.equal(stableStringify(initial), before);
  assert.equal(updated.reasoningBudget.consumedCandidates, 1);
  assert.equal(updated.reasoningBudget.consumedSimulations, 1);
  assert.deepEqual(updated.exploredOpportunityIds, ["opp:1"]);
  assert.notEqual(updated, initial);
  assert.notEqual(updated.reasoningBudget, initial.reasoningBudget);
});

test("cognitive updates are deterministic and structurally equal for the same inputs", () => {
  const build = () => updateReasoningBudget(recordSimulatedCandidate(recordExploredOpportunity(createInitialCognitiveState("t"), "opp:1"), "candidate:1"), consumeCandidate(createReasoningBudget()));
  assert.equal(structuralEquals(build(), build()), true);
});

test("duplicate registrations are deterministic idempotent values with new state objects", () => {
  const first = recordExploredOpportunity(createInitialCognitiveState(null), "opp:1");
  const second = recordExploredOpportunity(first, "opp:1");
  assert.deepEqual(second.exploredOpportunityIds, ["opp:1"]);
  assert.notEqual(second, first);
});
