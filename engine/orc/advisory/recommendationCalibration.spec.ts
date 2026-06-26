import assert from "node:assert/strict";
import test from "node:test";
import type { AdvisoryEvaluationReport } from "./advisoryEvaluation";
import { buildRecommendationCalibrationReport } from "./recommendationCalibration";
import { stableStringify, structuralEquals } from "../structuralEquality";

const evaluation = (overrides: Partial<AdvisoryEvaluationReport> = {}): AdvisoryEvaluationReport => ({
  advisoryDecisionId: "advisory:orc-decision:simulated:1",
  evaluatedAt: "2026-06-26T20:00:00.000Z",
  metrics: {
    recommendationAvailable: true,
    topRankAgreement: 1,
    reasoningCoverage: 1,
    evidenceCompleteness: 1,
    traceabilityScore: 1,
    recommendationConfidence: 0.8,
  },
  observations: ["Evaluated advisory recommendation advisory:orc-decision:simulated:1."],
  summary: "ORC-ADVISORY-EVALUATION-V1 fixture",
  ...overrides,
});

test("buildRecommendationCalibrationReport handles an empty collection", () => {
  const report = buildRecommendationCalibrationReport([]);

  assert.equal(report.generatedAt, null);
  assert.equal(report.evaluatedScenarios, 0);
  assert.deepEqual(report.metrics, {
    recommendationCoverage: 0,
    topRecommendationAgreement: 0,
    averageConfidence: 0,
    averageTraceability: 0,
    recommendationAvailability: 0,
  });
  assert.deepEqual(report.scenarioBreakdown, {});
});

test("buildRecommendationCalibrationReport aggregates one report", () => {
  const report = buildRecommendationCalibrationReport([evaluation()]);

  assert.equal(report.generatedAt, "2026-06-26T20:00:00.000Z");
  assert.equal(report.evaluatedScenarios, 1);
  assert.deepEqual(report.metrics, {
    recommendationCoverage: 1,
    topRecommendationAgreement: 1,
    averageConfidence: 0.8,
    averageTraceability: 1,
    recommendationAvailability: 1,
  });
  assert.deepEqual(Object.keys(report.scenarioBreakdown), ["scenario:001:advisory:orc-decision:simulated:1"]);
});

test("buildRecommendationCalibrationReport aggregates multiple reports", () => {
  const unavailable = evaluation({
    advisoryDecisionId: "advisory:none",
    metrics: {
      recommendationAvailable: false,
      topRankAgreement: 0,
      reasoningCoverage: 0,
      evidenceCompleteness: 0,
      traceabilityScore: 0,
      recommendationConfidence: 0,
    },
  });
  const report = buildRecommendationCalibrationReport([evaluation(), unavailable]);

  assert.equal(report.evaluatedScenarios, 2);
  assert.deepEqual(report.metrics, {
    recommendationCoverage: 0.5,
    topRecommendationAgreement: 0.5,
    averageConfidence: 0.8,
    averageTraceability: 0.5,
    recommendationAvailability: 0.5,
  });
});

test("buildRecommendationCalibrationReport is deterministic", () => {
  const evaluations = [evaluation(), evaluation({ advisoryDecisionId: "advisory:orc-decision:simulated:2" })];

  assert.equal(structuralEquals(buildRecommendationCalibrationReport(evaluations), buildRecommendationCalibrationReport(evaluations)), true);
});

test("buildRecommendationCalibrationReport preserves structural equality after JSON serialization", () => {
  const report = buildRecommendationCalibrationReport([evaluation()]);

  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test("buildRecommendationCalibrationReport does not mutate inputs", () => {
  const evaluations = [evaluation()];
  const before = stableStringify(evaluations);

  buildRecommendationCalibrationReport(evaluations);

  assert.equal(stableStringify(evaluations), before);
});

test("buildRecommendationCalibrationReport report can be serialized to JSON", () => {
  const report = buildRecommendationCalibrationReport([evaluation()]);

  assert.doesNotThrow(() => JSON.stringify(report));
});
