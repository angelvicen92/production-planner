import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, CandidateState, CommitDecision, OperationalValue, SearchSpace, SimulatedState } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { createInitialCognitiveState } from "./cognitiveState";
import { getSessionKnowledge, learnFromCommit, learnFromEvaluation, learnFromRanking, mergeSessionKnowledge } from "./sessionLearning";

const candidate: Candidate = { id: "candidate:1", state: { status: "valid", evidenceIds: [], metadata: {} }, assignments: [], operationalValues: [], evidenceIds: [], metadata: {} };
const discarded: Candidate = { ...candidate, id: "candidate:discarded" };
const candidateState: CandidateState = { id: "candidate-state:1", candidateId: "candidate:1", strategy: "compact", originOpportunity: "opportunity:1", plannedTransformations: [{ kind: "COMPACT_REGION", reason: "test" }], estimatedImpact: {}, estimatedCost: {}, confidence: 1 };
const simulatedState: SimulatedState = { id: "simulated:1", candidateStateId: "candidate-state:1", baseStateId: "base", operationalStateSnapshot: {} as never, appliedTransformations: candidateState.plannedTransformations, simulationMode: "READ_ONLY_BASELINE", readOnly: true, createdAt: null };
const operationalValue: OperationalValue = { simulatedStateId: "simulated:1", continuity: 1, makespan: 1, permanence: 1, compaction: 1, resourcePressure: 1, robustness: 1, stability: 1, futureFreedom: 1, overallScore: 1, breakdown: {}, evaluatedAt: null, evidenceIds: [], metadata: {} };
const searchSpace: SearchSpace = { id: "search-space:1", taskIds: [], candidates: [candidate, discarded], evidenceIds: [], metadata: { opportunityId: "opportunity:1" } };
const commitDecision: CommitDecision = { decision: "COMMIT", operationalValueId: "simulated:1", reason: "test", differences: [], evidenceId: "evidence:1", createdAt: null };

test("mergeSessionKnowledge keeps an empty session structurally stable", () => {
  const initial = createInitialCognitiveState(null);
  const learned = mergeSessionKnowledge(initial, {});
  assert.deepEqual(getSessionKnowledge(learned).learnedPatterns, []);
  assert.deepEqual(initial.temporaryKnowledge, {});
  assert.notEqual(learned, initial);
});

test("learnFromEvaluation records useful and discarded candidates, exhausted regions and patterns", () => {
  const initial = createInitialCognitiveState(null);
  const learned = learnFromEvaluation(initial, { operationalValues: [operationalValue], candidateStates: [candidateState], simulatedStates: [simulatedState], candidates: [candidate, discarded], searchSpaces: [searchSpace] });
  const knowledge = getSessionKnowledge(learned);
  assert.deepEqual(knowledge.usefulCandidates, ["candidate:1"]);
  assert.deepEqual(knowledge.discardedCandidates, ["candidate:discarded"]);
  assert.deepEqual(knowledge.exhaustedRegions, ["search-space:1"]);
  assert.deepEqual(knowledge.learnedPatterns, ["COMPACT_REGION"]);
  assert.deepEqual(learned.discardedCandidateIds, ["candidate:discarded"]);
});

test("learnFromRanking records ranked candidates and observed patterns", () => {
  const learned = learnFromRanking(createInitialCognitiveState(null), { rankedOperationalValues: [operationalValue], candidateStates: [candidateState], simulatedStates: [simulatedState] });
  const knowledge = getSessionKnowledge(learned);
  assert.deepEqual(knowledge.usefulCandidates, ["candidate:1"]);
  assert.deepEqual(knowledge.learnedPatterns, ["COMPACT_REGION"]);
});

test("learnFromCommit records committed candidates and resolved opportunities", () => {
  const learned = learnFromCommit(createInitialCognitiveState(null), { commitDecisions: [commitDecision], candidateStates: [candidateState], simulatedStates: [simulatedState], searchSpaces: [searchSpace] });
  const knowledge = getSessionKnowledge(learned);
  assert.deepEqual(knowledge.usefulCandidates, ["candidate:1"]);
  assert.deepEqual(knowledge.resolvedOpportunities, ["opportunity:1"]);
  assert.deepEqual(knowledge.unproductiveOpportunities, []);
  assert.deepEqual(learned.committedCandidateIds, ["candidate:1"]);
});

test("session learning is deterministic, structurally equal and does not mutate inputs", () => {
  const initial = createInitialCognitiveState("t");
  const before = stableStringify(initial);
  const build = () => learnFromEvaluation(initial, { operationalValues: [operationalValue], candidateStates: [candidateState], simulatedStates: [simulatedState], candidates: [candidate, discarded], searchSpaces: [searchSpace] });
  assert.equal(stableStringify(initial), before);
  assert.equal(structuralEquals(build(), build()), true);
  assert.notEqual(build(), initial);
});

test("session learning restarts between sessions", () => {
  const first = learnFromRanking(createInitialCognitiveState(null), { rankedOperationalValues: [operationalValue], candidateStates: [candidateState], simulatedStates: [simulatedState] });
  const second = createInitialCognitiveState(null);
  assert.deepEqual(getSessionKnowledge(first).usefulCandidates, ["candidate:1"]);
  assert.deepEqual(second.temporaryKnowledge, {});
});
