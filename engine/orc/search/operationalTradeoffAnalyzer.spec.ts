import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate } from "../contracts";
import type { OpportunityCostEstimate } from "./opportunityCostEstimator";
import type { OperationalReasoningScore } from "./operationalReasoningScore";
import type { RecoveryPotentialEstimate } from "./recoveryPotentialEstimator";
import { analyzeOperationalTradeoffs } from "./operationalTradeoffAnalyzer";

const candidate = (id: string): Candidate => ({ id, state: { status: "draft", evidenceIds: [], metadata: {} }, assignments: [], operationalValues: [], evidenceIds: [], metadata: {} });
const score = (id: string, high = 0.8, low = 0.2): OperationalReasoningScore => ({ candidateId: id, subjectId: id, subjectType: "candidate", score: 0.5, components: [
  { name: "recovery-potential", value: high, weight: 0.12, contribution: high * 0.12, explanation: "test" },
  { name: "opportunity-cost", value: low, weight: 0.1, contribution: low * 0.1, explanation: "test" },
], explanation: "test", deterministic: true, readOnly: true } as unknown as OperationalReasoningScore);
const cost = (id: string, value: number): OpportunityCostEstimate => ({ candidateId: id, estimatedCost: value, factors: [], deterministic: true, readOnly: true });
const recovery = (id: string, value: number): RecoveryPotentialEstimate => ({ candidateId: id, estimatedPotential: value, factors: [], deterministic: true, readOnly: true });

test("analyzeOperationalTradeoffs returns no trade-offs when dimensions are balanced", () => {
  const result = analyzeOperationalTradeoffs({ candidates: [candidate("c")], operationalReasoningScores: [score("c", 0.5, 0.5)], opportunityCosts: [cost("c", 0.5)], recoveryPotentials: [recovery("c", 0.5)] });
  assert.deepEqual(result.tradeoffs, []);
  assert.deepEqual(result.evidence, []);
});

test("analyzeOperationalTradeoffs detects a simple trade-off", () => {
  const result = analyzeOperationalTradeoffs({ candidates: [candidate("c")], operationalReasoningScores: [score("c", 0.9, 0.2)], opportunityCosts: [cost("c", 0.8)], recoveryPotentials: [recovery("c", 0.9)], createdAt: "t" });
  assert.equal(result.tradeoffs.length, 1);
  assert.deepEqual(result.tradeoffs[0].favoredDimensions, ["recovery-potential"]);
  assert.ok(result.tradeoffs[0].penalizedDimensions.includes("opportunity-cost"));
  assert.equal(result.evidence[0].kind, "operational-tradeoff-detected");
  assert.equal(result.evidence[0].data.planningInfluence, "none");
});

test("analyzeOperationalTradeoffs orders multiple trade-offs deterministically and preserves ties", () => {
  const result = analyzeOperationalTradeoffs({ candidates: [candidate("b"), candidate("a")], operationalReasoningScores: [score("b", 0.8, 0.2), score("a", 0.8, 0.2)], opportunityCosts: [cost("b", 0.8), cost("a", 0.8)] });
  assert.deepEqual(result.tradeoffs.map((item) => item.candidateId), ["a", "b"]);
  assert.equal(result.tradeoffs[0].intensity, result.tradeoffs[1].intensity);
});

test("analyzeOperationalTradeoffs is deterministic and serializable", () => {
  const input = { candidates: [candidate("c")], operationalReasoningScores: [score("c")], opportunityCosts: [cost("c", 0.8)], createdAt: "2026-06-28T13:40:00.000Z" };
  const first = analyzeOperationalTradeoffs(input);
  const second = analyzeOperationalTradeoffs(input);
  assert.equal(JSON.stringify(first.tradeoffs), JSON.stringify(second.tradeoffs));
  assert.equal(JSON.stringify(first.evidence), JSON.stringify(second.evidence));
});

test("analyzeOperationalTradeoffs does not mutate inputs", () => {
  const candidates = [candidate("c")];
  const before = JSON.stringify(candidates);
  analyzeOperationalTradeoffs({ candidates, operationalReasoningScores: [score("c")], opportunityCosts: [cost("c", 0.8)] });
  assert.equal(JSON.stringify(candidates), before);
});
