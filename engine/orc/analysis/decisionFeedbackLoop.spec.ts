import assert from "node:assert/strict";
import test from "node:test";
import { createReasoningBudget } from "../cognitive/reasoningBudget";
import { createInitialCognitiveState, updateDecisionFeedbackLoop } from "../cognitive/cognitiveState";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildDecisionFeedbackEvidence, createDecisionFeedbackLoop, recordDecisionFeedback, reuseDecisionFeedback } from "./decisionFeedbackLoop";

const opportunities = [
  { id: "opportunity:a", kind: "gap", taskIds: [1], evidenceIds: [], metadata: {} },
  { id: "opportunity:b", kind: "pressure", taskIds: [2], evidenceIds: [], metadata: {} },
];

test("Decision Feedback Loop handles empty feedback", () => {
  const loop = createDecisionFeedbackLoop();
  const result = reuseDecisionFeedback(loop, opportunities, createReasoningBudget(), "2026-06-28T08:00:00.000Z");
  assert.equal(loop.entries.length, 0);
  assert.equal(result.influences.every((influence) => influence.influence === "unchanged"), true);
  assert.equal(result.reasoningBudget.maxCandidates, 20);
});

test("Decision Feedback Loop records multiple deterministic iterations", () => {
  let loop = createDecisionFeedbackLoop();
  loop = recordDecisionFeedback(loop, { iteration: 2, opportunityId: "opportunity:b", strategyId: "strategy:b", previousScore: 0.4, newScore: 0.39, computationalCost: 3, estimatedFutureImpact: 0.1, outcome: "rejected" });
  loop = recordDecisionFeedback(loop, { iteration: 1, opportunityId: "opportunity:a", strategyId: "strategy:a", previousScore: 0.4, newScore: 0.7, computationalCost: 1, estimatedFutureImpact: 0.3, outcome: "accepted" });
  assert.deepEqual(loop.entries.map((entry) => entry.iteration), [1, 2]);
  assert.ok(loop.entries[0].profitability > loop.entries[1].profitability);
});

test("Decision Feedback Loop reuses feedback to influence ordering and budget", () => {
  let loop = createDecisionFeedbackLoop();
  loop = recordDecisionFeedback(loop, { iteration: 1, opportunityId: "opportunity:b", strategyId: "strategy:b", previousScore: 0.5, newScore: 0.9, computationalCost: 1, estimatedFutureImpact: 0.4, outcome: true });
  loop = recordDecisionFeedback(loop, { iteration: 2, opportunityId: "opportunity:a", strategyId: "strategy:a", previousScore: 0.5, newScore: 0.2, computationalCost: 1, estimatedFutureImpact: 0, outcome: false });
  const result = reuseDecisionFeedback(loop, opportunities, createReasoningBudget({ maxCandidates: 5, maxSimulations: 5 }), null);
  assert.equal(result.opportunities[0].id, "opportunity:b");
  assert.equal(result.reasoningBudget.maxCandidates, 5);
  assert.equal(result.influences.filter((influence) => influence.influence !== "unchanged").length, 2);
});

test("Decision Feedback Loop is deterministic and structurally equal", () => {
  const build = () => recordDecisionFeedback(createDecisionFeedbackLoop(), { iteration: 1, opportunityId: "opportunity:a", strategyId: "strategy:a", previousScore: 0.1, newScore: 0.2, computationalCost: 1, estimatedFutureImpact: 0.1, outcome: "accepted" });
  assert.equal(structuralEquals(build(), build()), true);
  assert.equal(stableStringify(build()), stableStringify(build()));
});

test("Decision Feedback Loop serializes and integrates with CognitiveState", () => {
  const loop = recordDecisionFeedback(createDecisionFeedbackLoop(), { iteration: 1, opportunityId: "opportunity:a", strategyId: "strategy:a", previousScore: 0, newScore: 1, computationalCost: 1, estimatedFutureImpact: 0.5, outcome: "accepted" });
  const state = updateDecisionFeedbackLoop(createInitialCognitiveState(), loop);
  const evidence = buildDecisionFeedbackEvidence(loop, [], "2026-06-28T08:00:00.000Z");
  assert.deepEqual(JSON.parse(JSON.stringify(state.decisionFeedbackLoop)), state.decisionFeedbackLoop);
  assert.equal(evidence[0].kind, "decision-feedback-generated");
  assert.equal(evidence[0].data.persistentLearning, false);
});

test("Decision Feedback Loop does not mutate input", () => {
  const loop = recordDecisionFeedback(createDecisionFeedbackLoop(), { iteration: 1, opportunityId: "opportunity:a", strategyId: "strategy:a", previousScore: 0, newScore: 1, computationalCost: 1, estimatedFutureImpact: 0.5, outcome: "accepted" });
  const budget = createReasoningBudget({ maxCandidates: 5 });
  const before = stableStringify({ opportunities, budget, loop });
  reuseDecisionFeedback(loop, opportunities, budget, null);
  assert.equal(stableStringify({ opportunities, budget, loop }), before);
});
