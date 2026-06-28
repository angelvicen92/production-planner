import assert from "node:assert/strict";
import test from "node:test";
import { stableStringify } from "../structuralEquality";
import { buildOperationalDeltaEvidenceReport } from "../evidence/evidenceReport";
import { OPERATIONAL_DELTA_BENCHMARK_VERSION, type OperationalDeltaMetrics, type OperationalDeltaReport } from "./operationalDeltaBenchmark";
import { analyzeImprovementOpportunities, IMPROVEMENT_OPPORTUNITY_ANALYZER_VERSION } from "./improvementOpportunityAnalyzer";

const metrics = (overrides: Partial<OperationalDeltaMetrics> = {}): OperationalDeltaMetrics => ({
  makespan: 600,
  totalPermanence: 120,
  permanenceByTalent: { "1": 120 },
  mainFlowContinuity: 30,
  resourceUtilization: 0.5,
  conflicts: 0,
  simulations: 2,
  candidatesGenerated: 3,
  candidatesSimulated: 2,
  candidatesConsolidated: 1,
  totalTime: 10,
  timeByIteration: [10],
  ...overrides,
});

const delta = (orc: OperationalDeltaMetrics, v4: OperationalDeltaMetrics): OperationalDeltaMetrics => ({
  makespan: orc.makespan === null || v4.makespan === null ? null : orc.makespan - v4.makespan,
  totalPermanence: orc.totalPermanence - v4.totalPermanence,
  permanenceByTalent: { "1": (orc.permanenceByTalent["1"] ?? 0) - (v4.permanenceByTalent["1"] ?? 0) },
  mainFlowContinuity: orc.mainFlowContinuity - v4.mainFlowContinuity,
  resourceUtilization: orc.resourceUtilization - v4.resourceUtilization,
  conflicts: orc.conflicts - v4.conflicts,
  simulations: orc.simulations - v4.simulations,
  candidatesGenerated: orc.candidatesGenerated - v4.candidatesGenerated,
  candidatesSimulated: orc.candidatesSimulated - v4.candidatesSimulated,
  candidatesConsolidated: orc.candidatesConsolidated - v4.candidatesConsolidated,
  totalTime: orc.totalTime - v4.totalTime,
  timeByIteration: orc.timeByIteration.map((value, index) => value - (v4.timeByIteration[index] ?? 0)),
});

const pct = (absolute: OperationalDeltaMetrics, v4: OperationalDeltaMetrics): OperationalDeltaMetrics => ({
  makespan: absolute.makespan === null || v4.makespan === null ? null : (absolute.makespan / v4.makespan) * 100,
  totalPermanence: (absolute.totalPermanence / v4.totalPermanence) * 100,
  permanenceByTalent: { "1": ((absolute.permanenceByTalent["1"] ?? 0) / (v4.permanenceByTalent["1"] ?? 1)) * 100 },
  mainFlowContinuity: (absolute.mainFlowContinuity / v4.mainFlowContinuity) * 100,
  resourceUtilization: (absolute.resourceUtilization / v4.resourceUtilization) * 100,
  conflicts: v4.conflicts === 0 ? 0 : (absolute.conflicts / v4.conflicts) * 100,
  simulations: (absolute.simulations / v4.simulations) * 100,
  candidatesGenerated: (absolute.candidatesGenerated / v4.candidatesGenerated) * 100,
  candidatesSimulated: (absolute.candidatesSimulated / v4.candidatesSimulated) * 100,
  candidatesConsolidated: (absolute.candidatesConsolidated / v4.candidatesConsolidated) * 100,
  totalTime: (absolute.totalTime / v4.totalTime) * 100,
  timeByIteration: absolute.timeByIteration.map((value, index) => value / (v4.timeByIteration[index] ?? 1) * 100),
});

function report(orc: OperationalDeltaMetrics, v4: OperationalDeltaMetrics): OperationalDeltaReport {
  const absoluteDelta = delta(orc, v4);
  const base = {
    benchmarkVersion: OPERATIONAL_DELTA_BENCHMARK_VERSION,
    generatedAt: "2026-06-28T08:43:00.000Z",
    scenario: { planId: 172, taskCount: 1 },
    metrics: { orc, v4 },
    absoluteDelta,
    percentageDelta: pct(absoluteDelta, v4),
    evidenceExplanation: ["test evidence"],
    planningUnchanged: true,
  } as OperationalDeltaReport;
  return { ...base, improvementReport: analyzeImprovementOpportunities(base) };
}

test("analyzer classifies equality with no improvement priorities", () => {
  const analyzed = analyzeImprovementOpportunities(report(metrics(), metrics()));
  assert.equal(analyzed.analyzerVersion, IMPROVEMENT_OPPORTUNITY_ANALYZER_VERSION);
  assert.equal(analyzed.summary.equal.length, 12);
  assert.deepEqual(analyzed.summary.highPriority, []);
  assert.equal(analyzed.planningInfluence, "none");
});

test("analyzer detects ORC improvements from official lower-is-better metrics", () => {
  const analyzed = analyzeImprovementOpportunities(report(metrics({ makespan: 540, conflicts: 0 }), metrics({ makespan: 600, conflicts: 2 })));
  assert.ok(analyzed.summary.orcBetter.includes("makespan"));
  assert.ok(analyzed.summary.orcBetter.includes("conflicts"));
  assert.equal(analyzed.opportunities.find((item) => item.metric === "makespan")?.priority, "none");
});

test("analyzer prioritizes ORC regressions objectively", () => {
  const analyzed = analyzeImprovementOpportunities(report(metrics({ makespan: 900, totalTime: 11 }), metrics({ makespan: 600, totalTime: 10 })));
  assert.ok(analyzed.summary.orcWorse.includes("makespan"));
  assert.ok(analyzed.summary.highPriority.includes("makespan"));
  assert.ok(analyzed.summary.mediumPriority.includes("totalTime"));
});

test("analyzer groups multiple opportunities by neutral categories", () => {
  const analyzed = analyzeImprovementOpportunities(report(metrics({ mainFlowContinuity: 32, resourceUtilization: 0.25 }), metrics({ mainFlowContinuity: 30, resourceUtilization: 0.5 })));
  assert.equal(analyzed.opportunities.find((item) => item.metric === "mainFlowContinuity")?.category, "continuity");
  assert.equal(analyzed.opportunities.find((item) => item.metric === "resourceUtilization")?.category, "resourceUtilization");
  assert.ok(analyzed.summary.lowPriority.includes("mainFlowContinuity"));
  assert.ok(analyzed.summary.highPriority.includes("resourceUtilization"));
});

test("analyzer is deterministic", () => {
  const input = report(metrics({ totalPermanence: 150 }), metrics());
  assert.equal(stableStringify(analyzeImprovementOpportunities(input)), stableStringify(analyzeImprovementOpportunities(input)));
});

test("analyzer serializes through evidence report", () => {
  const benchmark = report(metrics({ candidatesGenerated: 6 }), metrics());
  const evidence = buildOperationalDeltaEvidenceReport(benchmark);
  assert.deepEqual(JSON.parse(JSON.stringify(evidence.improvementReport)), evidence.improvementReport);
  assert.deepEqual(evidence.improvementEvidence.metricsAnalyzed, benchmark.improvementReport.evidence.metricsAnalyzed);
});

test("analyzer does not mutate benchmark report", () => {
  const benchmark = report(metrics({ simulations: 5 }), metrics());
  const before = stableStringify(benchmark);
  analyzeImprovementOpportunities(benchmark);
  assert.equal(stableStringify(benchmark), before);
});
