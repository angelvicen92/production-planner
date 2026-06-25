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
  updateRemainingBudget,
  createInitialSessionMemory,
} from "./cognitiveState";

test("createInitialCognitiveState creates an empty temporal session memory", () => {
  const state = createInitialCognitiveState("2026-06-25T00:00:00.000Z");
  assert.deepEqual(state, {
    exploredOpportunityIds: [],
    exhaustedSearchSpaceIds: [],
    discardedCandidateIds: [],
    simulatedCandidateIds: [],
    committedCandidateIds: [],
    remainingBudget: { opportunities: 0, searchSpaces: 0, candidates: 0, simulations: 0 },
    temporaryKnowledge: {},
    confidence: 0,
    createdAt: "2026-06-25T00:00:00.000Z",
  });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.remainingBudget), true);
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

test("updateRemainingBudget is pure and preserves unrelated state", () => {
  const initial = recordExploredOpportunity(createInitialCognitiveState(null), "opp:1");
  const before = stableStringify(initial);
  const updated = updateRemainingBudget(initial, { candidates: 3, simulations: 2 });

  assert.equal(stableStringify(initial), before);
  assert.deepEqual(updated.remainingBudget, { opportunities: 0, searchSpaces: 0, candidates: 3, simulations: 2 });
  assert.deepEqual(updated.exploredOpportunityIds, ["opp:1"]);
  assert.notEqual(updated, initial);
  assert.notEqual(updated.remainingBudget, initial.remainingBudget);
});

test("cognitive updates are deterministic and structurally equal for the same inputs", () => {
  const build = () => updateRemainingBudget(recordSimulatedCandidate(recordExploredOpportunity(createInitialCognitiveState("t"), "opp:1"), "candidate:1"), { opportunities: 1 });
  assert.equal(structuralEquals(build(), build()), true);
});

test("duplicate registrations are deterministic idempotent values with new state objects", () => {
  const first = recordExploredOpportunity(createInitialCognitiveState(null), "opp:1");
  const second = recordExploredOpportunity(first, "opp:1");
  assert.deepEqual(second.exploredOpportunityIds, ["opp:1"]);
  assert.notEqual(second, first);
});
