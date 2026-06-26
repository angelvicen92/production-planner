import assert from "node:assert/strict";
import test from "node:test";
import type { AdvisoryDecision } from "./advisoryDecision";
import { evaluateAdvisoryDecision } from "./advisoryEvaluation";
import type { RealScenarioValidationReport } from "../validation/realScenarioValidation";
import { stableStringify, structuralEquals } from "../structuralEquality";

const advisoryDecision = (overrides: Partial<AdvisoryDecision> = {}): AdvisoryDecision => ({
  decisionId: "advisory:orc-decision:simulated:1",
  candidateId: "candidate:1",
  confidence: 0.7,
  reasoningSummary: "Recommend candidate candidate:1 from ranked operational value simulated:1.",
  evidenceIds: ["evidence:evaluation:1", "evidence:validation:1", "evidence:orc-ranking-engine:operational-value:simulated:1:rank:1"],
  recommendedAction: "HUMAN_REVIEW_RECOMMENDED_CANDIDATE_ONLY",
  constraintsConsidered: ["validation:VALID:no-violated-constraints"],
  generatedAt: "2026-06-26T20:00:00.000Z",
  ...overrides,
});

const validationReport = (overrides: Partial<RealScenarioValidationReport> = {}): RealScenarioValidationReport => ({
  scenarioId: "1",
  comparedAt: "2026-06-26T20:00:00.000Z",
  metrics: {
    detectedOpportunities: 1,
    evaluatedCandidates: 1,
    topRankAgreement: 1,
    reasoningCoverage: 1,
    planningDifferences: 2,
  },
  differences: {
    onlyORC: ["candidates:1"],
    onlyV4: ["planned-count:1"],
    common: ["scenario:1"],
  },
  advisoryDecision: null,
  advisoryEvaluation: null as never,
  summary: "fixture",
  ...overrides,
});

test("evaluateAdvisoryDecision handles null recommendation", () => {
  const report = evaluateAdvisoryDecision(null, validationReport());

  assert.equal(report.advisoryDecisionId, "advisory:none");
  assert.equal(report.evaluatedAt, "2026-06-26T20:00:00.000Z");
  assert.deepEqual(report.metrics, {
    recommendationAvailable: false,
    topRankAgreement: 0,
    reasoningCoverage: 0,
    evidenceCompleteness: 0,
    traceabilityScore: 0,
    recommendationConfidence: 0,
  });
  assert.equal(report.observations.length, 2);
});

test("evaluateAdvisoryDecision scores a valid recommendation", () => {
  const report = evaluateAdvisoryDecision(advisoryDecision(), validationReport());

  assert.equal(report.advisoryDecisionId, "advisory:orc-decision:simulated:1");
  assert.deepEqual(report.metrics, {
    recommendationAvailable: true,
    topRankAgreement: 1,
    reasoningCoverage: 1,
    evidenceCompleteness: 1,
    traceabilityScore: 1,
    recommendationConfidence: 0.7,
  });
  assert.match(report.summary, /ORC-ADVISORY-EVALUATION-V1/);
});

test("evaluateAdvisoryDecision is deterministic", () => {
  const decision = advisoryDecision();
  const validation = validationReport();

  assert.equal(structuralEquals(evaluateAdvisoryDecision(decision, validation), evaluateAdvisoryDecision(decision, validation)), true);
});

test("evaluateAdvisoryDecision preserves structural equality after JSON serialization", () => {
  const report = evaluateAdvisoryDecision(advisoryDecision(), validationReport());

  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test("evaluateAdvisoryDecision does not mutate inputs", () => {
  const decision = advisoryDecision();
  const validation = validationReport({ advisoryDecision: decision });
  const beforeDecision = stableStringify(decision);
  const beforeValidation = stableStringify(validation);

  evaluateAdvisoryDecision(decision, validation);

  assert.equal(stableStringify(decision), beforeDecision);
  assert.equal(stableStringify(validation), beforeValidation);
});

test("evaluateAdvisoryDecision report can be serialized to JSON", () => {
  const report = evaluateAdvisoryDecision(advisoryDecision(), validationReport());

  assert.doesNotThrow(() => JSON.stringify(report));
});
