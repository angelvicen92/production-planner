import assert from "node:assert/strict";
import test from "node:test";
import type { RecommendationCalibrationReport } from "../advisory/recommendationCalibration";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildReadinessIndex } from "./readinessIndex";

const calibration = (overrides: Partial<RecommendationCalibrationReport> = {}): RecommendationCalibrationReport => ({
  generatedAt: "2026-06-26T20:00:00.000Z",
  evaluatedScenarios: 2,
  metrics: {
    recommendationCoverage: 1,
    topRecommendationAgreement: 1,
    averageConfidence: 0.8,
    averageTraceability: 1,
    averageEvidenceCompleteness: 1,
    recommendationAvailability: 1,
  },
  scenarioBreakdown: {
    "scenario:001:advisory:a": { evidenceCompleteness: 1 },
    "scenario:002:advisory:b": { evidenceCompleteness: 1 },
  },
  summary: "ORC-RECOMMENDATION-CALIBRATION-V1 fixture",
  ...overrides,
});

test("buildReadinessIndex handles a minimum report", () => {
  const report = buildReadinessIndex(calibration({
    generatedAt: null,
    evaluatedScenarios: 0,
    metrics: {
      recommendationCoverage: 0,
      topRecommendationAgreement: 0,
      averageConfidence: 0,
      averageTraceability: 0,
      averageEvidenceCompleteness: 0,
      recommendationAvailability: 0,
    },
    scenarioBreakdown: {},
  }));

  assert.equal(report.generatedAt, null);
  assert.equal(report.readinessIndex, 0);
  assert.deepEqual(report.dimensions, {
    benchmarkCoverage: 0,
    recommendationCoverage: 0,
    recommendationAgreement: 0,
    traceability: 0,
    evidenceCompleteness: 0,
  });
  assert.ok(report.summary.includes("shadowModeOnly=true"));
  assert.ok(report.recommendations.length > 0);
});

test("buildReadinessIndex aggregates a complete report", () => {
  const report = buildReadinessIndex(calibration());

  assert.equal(report.generatedAt, "2026-06-26T20:00:00.000Z");
  assert.equal(report.readinessIndex, 1);
  assert.deepEqual(report.dimensions, {
    benchmarkCoverage: 1,
    recommendationCoverage: 1,
    recommendationAgreement: 1,
    traceability: 1,
    evidenceCompleteness: 1,
  });
});

test("buildReadinessIndex derives partial evidence completeness from scenario breakdown", () => {
  const report = buildReadinessIndex(calibration({
    metrics: {
      recommendationCoverage: 0.5,
      topRecommendationAgreement: 0.25,
      averageConfidence: 0.8,
      averageTraceability: 0.75,
      averageEvidenceCompleteness: 0.5,
      recommendationAvailability: 0.5,
    },
    scenarioBreakdown: {
      "scenario:001:advisory:a": { evidenceCompleteness: 1 },
      "scenario:002:advisory:b": { evidenceCompleteness: 0 },
    },
  }));

  assert.deepEqual(report.dimensions, {
    benchmarkCoverage: 0.5,
    recommendationCoverage: 0.5,
    recommendationAgreement: 0.25,
    traceability: 0.75,
    evidenceCompleteness: 0.5,
  });
  assert.equal(report.readinessIndex, 0.5);
});

test("buildReadinessIndex is deterministic", () => {
  const input = calibration();

  assert.equal(structuralEquals(buildReadinessIndex(input), buildReadinessIndex(input)), true);
});

test("buildReadinessIndex preserves structural equality after JSON serialization", () => {
  const report = buildReadinessIndex(calibration());

  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test("buildReadinessIndex does not mutate inputs", () => {
  const input = calibration();
  const before = stableStringify(input);

  buildReadinessIndex(input);

  assert.equal(stableStringify(input), before);
});

test("buildReadinessIndex report can be serialized to JSON", () => {
  const report = buildReadinessIndex(calibration());

  assert.doesNotThrow(() => JSON.stringify(report));
});
