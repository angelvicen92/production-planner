import assert from "node:assert/strict";
import test from "node:test";

import type { Candidate, Opportunity } from "../contracts";
import { structuralEquals } from "../structuralEquality";
import { calculateOperationalReasoningScores } from "./operationalReasoningScore";

const opportunity = (id: string, expectedImpact: number, confidence = 1): Opportunity => ({ id, kind: "test", taskIds: [1], searchSpaceIds: [], evidenceIds: [], metadata: {}, opportunityImpact: { opportunityId: id, expectedImpact, confidence, explanation: "test" } });
const candidate = (id: string, sourceOpportunityId: string): Candidate => ({ id, state: { status: "draft", evidenceIds: [], metadata: {} }, assignments: [], operationalValues: [], evidenceIds: [], metadata: { sourceOpportunityId } });

test("calculateOperationalReasoningScores identifies low score", () => {
  const result = calculateOperationalReasoningScores({ opportunities: [opportunity("low", 0)], reasoningBudgetProfiles: [{ opportunityId: "low", criticalityLevel: 1, explorationBudget: 1, maxCandidates: 1, maxDepth: 1, maxSearchSpaceSize: 1, simulationBudget: 1, reason: "test" }] });
  assert.ok(result.scores[0].score < 0.4);
});

test("calculateOperationalReasoningScores identifies high score", () => {
  const result = calculateOperationalReasoningScores({ opportunities: [opportunity("high", 1)], reasoningBudgetProfiles: [{ opportunityId: "high", criticalityLevel: 3, explorationBudget: 2, maxCandidates: 2, maxDepth: 2, maxSearchSpaceSize: 2, simulationBudget: 2, reason: "test" }], opportunityPropagation: [{ opportunityId: "high", propagationScore: 1, affectedResources: [], affectedChains: [], estimatedConflictReduction: 1, estimatedFreedomGain: 1, explanation: "test" }], dependencyChainInfluences: [{ opportunityId: "high", touchedChainIds: [], influenceScore: 1, reasoningBudgetMultiplier: 1.25, explanation: "test" }] });
  assert.ok(result.scores[0].score > 0.65);
});

test("calculateOperationalReasoningScores preserves ties deterministically", () => {
  const result = calculateOperationalReasoningScores({ opportunities: [opportunity("b", 0.5), opportunity("a", 0.5)] });
  assert.deepEqual(result.scores.map((item) => item.subjectId), ["a", "b"]);
  assert.equal(result.scores[0].score, result.scores[1].score);
});

test("calculateOperationalReasoningScores is deterministic and serializable", () => {
  const input = { opportunities: [opportunity("o", 0.5)], candidates: [candidate("c", "o")], opportunityCosts: [{ candidateId: "c", estimatedCost: 0.2, factors: [], deterministic: true, readOnly: true }], recoveryPotentials: [{ candidateId: "c", estimatedPotential: 0.8, factors: [], deterministic: true, readOnly: true }], createdAt: "2026-06-28T13:27:00.000Z" };
  const first = calculateOperationalReasoningScores(input);
  const second = calculateOperationalReasoningScores(input);
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test("calculateOperationalReasoningScores does not mutate inputs", () => {
  const opportunities = [opportunity("immutable", 0.5)];
  const before = JSON.parse(JSON.stringify(opportunities));
  calculateOperationalReasoningScores({ opportunities });
  assert.deepEqual(opportunities, before);
});
