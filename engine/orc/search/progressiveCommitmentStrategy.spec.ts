import assert from "node:assert/strict";
import test from "node:test";

import { structuralEquals } from "../structuralEquality";
import type { OperationalGoal } from "./operationalGoalBuilder";
import type { OperationalReasoningScore } from "./operationalReasoningScore";
import { buildProgressiveCommitmentStrategy } from "./progressiveCommitmentStrategy";

const score = (subjectId: string, value: number): OperationalReasoningScore => ({
  subjectId,
  subjectType: "opportunity",
  score: value,
  components: [
    { name: "operational-criticality", value, weight: 0.24, contribution: value * 0.24, explanation: "test" },
    { name: "future-impact", value, weight: 0.14, contribution: value * 0.14, explanation: "test" },
    { name: "dependency-chain-flow", value, weight: 0.12, contribution: value * 0.12, explanation: "test" },
  ],
  explanation: "test",
  deterministic: true,
  readOnly: true,
});

const goal = (id: string, opportunityId: string, value: number): OperationalGoal => ({
  id,
  signature: ["future-impact", "dependency-chain-flow"],
  opportunityIds: [opportunityId],
  aggregateOperationalReasoningScore: value,
  associations: [{ opportunityId, operationalReasoningScore: value, signals: [{ name: "future-impact", value }], explanation: "test" }],
  prioritizationExplanation: "test",
  deterministic: true,
  readOnly: true,
});

test("buildProgressiveCommitmentStrategy identifies low commitment", () => {
  const result = buildProgressiveCommitmentStrategy({ operationalReasoningScores: [score("low", 0.1)] });
  assert.equal(result.decisions[0].stableDuringSearch, false);
  assert.ok(result.decisions[0].commitmentScore < 0.68);
});

test("buildProgressiveCommitmentStrategy identifies high commitment", () => {
  const result = buildProgressiveCommitmentStrategy({
    operationalReasoningScores: [score("high", 0.95)],
    operationalGoals: [goal("goal:high", "high", 0.95)],
    dependencyChainInfluences: [{ opportunityId: "high", touchedChainIds: ["chain"], influenceScore: 0.95, reasoningBudgetMultiplier: 1.2, explanation: "test" }],
  });
  const high = result.decisionsBySubjectId.get("high");
  assert.ok(high);
  assert.equal(high.stableDuringSearch, true);
  assert.equal(high.reversibleUntilCommitEngine, true);
});

test("buildProgressiveCommitmentStrategy preserves ties deterministically", () => {
  const result = buildProgressiveCommitmentStrategy({ operationalReasoningScores: [score("b", 0.5), score("a", 0.5)] });
  assert.deepEqual(result.decisions.map((item) => item.subjectId), ["a", "b"]);
  assert.equal(result.decisions[0].commitmentScore, result.decisions[1].commitmentScore);
});

test("buildProgressiveCommitmentStrategy is deterministic and serializable", () => {
  const input = { operationalReasoningScores: [score("o", 0.8)], operationalGoals: [goal("goal:o", "o", 0.8)], createdAt: "2026-06-28T14:19:00.000Z" };
  const first = buildProgressiveCommitmentStrategy(input);
  const second = buildProgressiveCommitmentStrategy(input);
  assert.equal(structuralEquals(first, second), true);
  const serialized = JSON.parse(JSON.stringify(first));
  assert.deepEqual(serialized.decisions, first.decisions);
  assert.deepEqual(serialized.evidence, first.evidence);
});

test("buildProgressiveCommitmentStrategy does not mutate inputs", () => {
  const scores = [score("immutable", 0.5)];
  const before = JSON.parse(JSON.stringify(scores));
  buildProgressiveCommitmentStrategy({ operationalReasoningScores: scores });
  assert.deepEqual(scores, before);
});
