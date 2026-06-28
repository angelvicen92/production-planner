import assert from "node:assert/strict";
import test from "node:test";
import type { Opportunity } from "../contracts";
import { buildOperationalGoals } from "./operationalGoalBuilder";
import type { OperationalReasoningScore } from "./operationalReasoningScore";

const opportunity = (id: string): Opportunity => ({ id, kind: "test", taskIds: [1], searchSpaceIds: [`space:${id}`], evidenceIds: [], metadata: {} });
const score = (id: string, criticality: number, propagation: number): OperationalReasoningScore => ({
  subjectId: id,
  subjectType: "opportunity",
  score: (criticality + propagation) / 2,
  deterministic: true,
  readOnly: true,
  explanation: "test",
  components: [
    { name: "operational-criticality", value: criticality, weight: 1, contribution: criticality, explanation: "test" },
    { name: "opportunity-propagation", value: propagation, weight: 1, contribution: propagation, explanation: "test" },
  ],
});

test("buildOperationalGoals builds one goal from shared dominant signals", () => {
  const result = buildOperationalGoals({ opportunities: [opportunity("a"), opportunity("b")], operationalReasoningScores: [score("a", 0.9, 0.6), score("b", 0.8, 0.4)] });
  assert.equal(result.goals.length, 1);
  assert.deepEqual(result.goals[0].opportunityIds, ["a", "b"]);
  assert.equal(result.opportunityGoalIdByOpportunityId.get("a"), result.goals[0].id);
});

test("buildOperationalGoals builds multiple goals from different signal order", () => {
  const result = buildOperationalGoals({ opportunities: [opportunity("a"), opportunity("b")], operationalReasoningScores: [score("a", 0.9, 0.2), score("b", 0.2, 0.9)] });
  assert.equal(result.goals.length, 2);
});

test("buildOperationalGoals supports shared opportunities via one deterministic association", () => {
  const result = buildOperationalGoals({ opportunities: [opportunity("shared")], operationalReasoningScores: [score("shared", 0.7, 0.7)], dependencyChainInfluences: [{ opportunityId: "shared", influenceScore: 0.9, touchedChainIds: ["c1"], reasoningBudgetMultiplier: 1, explanation: "test" }] });
  assert.equal(result.goals.length, 1);
  assert.deepEqual(result.goals[0].opportunityIds, ["shared"]);
  assert.ok(result.goals[0].signature.includes("dependency-chain-flow"));
});

test("buildOperationalGoals is deterministic and serializable", () => {
  const input = { opportunities: [opportunity("b"), opportunity("a")], operationalReasoningScores: [score("b", 0.2, 0.9), score("a", 0.9, 0.2)], createdAt: "now" };
  const first = buildOperationalGoals(input);
  const second = buildOperationalGoals(input);
  assert.equal(JSON.stringify(first.goals), JSON.stringify(second.goals));
  assert.doesNotThrow(() => JSON.stringify(first.evidence));
});

test("buildOperationalGoals does not mutate inputs", () => {
  const opportunities = [opportunity("a")];
  const scores = [score("a", 0.9, 0.2)];
  const before = JSON.stringify({ opportunities, scores });
  buildOperationalGoals({ opportunities, operationalReasoningScores: scores });
  assert.equal(JSON.stringify({ opportunities, scores }), before);
});
