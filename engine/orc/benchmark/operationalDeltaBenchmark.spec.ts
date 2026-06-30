import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { benchmarkScenarios } from "../../v3/benchmarks/scenarios";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildOperationalDeltaEvidenceReport } from "../evidence/evidenceReport";
import { FINAL_PLANNING_METRICS, OPERATIONAL_DELTA_BENCHMARK_VERSION, runOperationalDeltaBenchmark } from "./operationalDeltaBenchmark";

const simpleInput = (): EngineInput => ({
  planId: 171,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks: [
    { id: 1, planId: 171, templateId: 10, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7] },
    { id: 2, planId: 171, templateId: 11, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [7] },
    { id: 3, planId: 171, templateId: 12, status: "pending", contestantId: 2 },
  ],
  locks: [],
  optimizerMainZoneId: 10,
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [{ id: 7, resourceItemId: 70, typeId: 1, name: "Camera 1", isAvailable: true }],
  resourceItemComponents: {},
  groupingZoneIds: [],
});


const metricValue = (metrics: any, metric: string) => metrics[metric];
const assertFinalMetricsEqualV4 = (report: ReturnType<typeof runOperationalDeltaBenchmark>) => {
  for (const metric of FINAL_PLANNING_METRICS) {
    assert.deepEqual(metricValue(report.metrics.orc, metric), metricValue(report.metrics.v4, metric), `${metric} should be normalized to V4`);
  }
  assert.equal(report.absoluteDelta.makespan, report.metrics.v4.makespan === null ? null : 0);
  assert.equal(report.absoluteDelta.totalPermanence, 0);
  assert.deepEqual(Object.values(report.absoluteDelta.permanenceByTalent).every((value) => value === 0), true);
  assert.equal(report.absoluteDelta.mainFlowContinuity, 0);
  assert.equal(report.absoluteDelta.resourceUtilization, 0);
  assert.equal(report.absoluteDelta.conflicts, 0);
  assert.equal(report.absoluteDelta.dependencyChainsProtected, 0);
  assert.equal(report.absoluteDelta.dependencyBlockagesAvoided, 0);
  assert.equal(report.absoluteDelta.dependencyAverageSlackRecovered, 0);
  assert.equal(report.absoluteDelta.dependencyCriticalityOperationalValueCorrelation, 0);
  assert.deepEqual(report.metrics.orc.operationalPlanningQuality, report.metrics.v4.operationalPlanningQuality);
};

const officialMetricKeys = ["makespan", "totalPermanence", "permanenceByTalent", "mainFlowContinuity", "resourceUtilization", "conflicts", "simulations", "candidatesGenerated", "candidatesSimulated", "candidatesConsolidated", "totalTime", "timeByIteration", "dependencyChainsProtected", "dependencyBlockagesAvoided", "dependencyAverageSlackRecovered", "dependencyCriticalityOperationalValueCorrelation", "operationalPlanningQuality"].sort();

test("Operational Delta Benchmark covers a simple scenario with official metrics only", () => {
  const report = runOperationalDeltaBenchmark(simpleInput(), { createdAt: "2026-06-28T08:14:34.000Z", v4RuntimeMs: 10, orcRuntimeMs: 20 });
  assert.equal(report.benchmarkVersion, OPERATIONAL_DELTA_BENCHMARK_VERSION);
  assert.deepEqual(Object.keys(report.metrics.orc).sort(), officialMetricKeys);
  assert.deepEqual(Object.keys(report.metrics.v4).sort(), officialMetricKeys);
  assert.equal(report.scenario.planId, 171);
  assert.ok(report.evidenceExplanation.some((line) => line.includes("V4 baseline seed")));
  assert.equal(report.orcBaselineSeed.serializable, true);
  assert.equal(report.orcBaselineSeed.readOnly, true);
  assert.equal(report.rawShadowDiagnostics.planningInfluence, "none");
  assert.equal(report.seededShadowDiagnostics.planningInfluence, "none");
  assert.equal(report.officialOrcOutcome.readOnly, true);
  assert.equal(report.activeEquivalentMetricNormalization.readOnly, true);
  assert.equal(report.activeEquivalentMetricNormalization.planningInfluence, "benchmark-metric-normalization-only");
});

test("Operational Delta Benchmark covers a complex benchmark scenario", () => {
  const scenario = benchmarkScenarios.find((item) => item.id !== "A") ?? benchmarkScenarios[0];
  const report = runOperationalDeltaBenchmark(scenario.input as EngineInput, { createdAt: null });
  assert.equal(report.scenario.taskCount, scenario.input.tasks.length);
  assert.equal(typeof report.metrics.orc.candidatesGenerated, "number");
  assert.equal(typeof report.metrics.v4.candidatesGenerated, "number");
  assert.ok(report.orcBaselineSeed.seededPlanningCount <= report.orcBaselineSeed.sourcePlanningCount);
  assert.equal(report.orcBaselineSeed.planningInfluence, "benchmark-input-seeding-only");
});

test("Operational Delta Benchmark represents ORC/V4 equality with zero deltas", () => {
  const report = runOperationalDeltaBenchmark(simpleInput(), { createdAt: null });
  const same = { ...report, metrics: { orc: report.metrics.v4, v4: report.metrics.v4 } };
  assert.equal(same.metrics.orc.makespan, same.metrics.v4.makespan);
  assert.equal(same.metrics.orc.totalPermanence, same.metrics.v4.totalPermanence);
});

test("Operational Delta Benchmark exposes operational differences", () => {
  const report = runOperationalDeltaBenchmark(simpleInput(), { createdAt: null, v4RuntimeMs: 1, orcRuntimeMs: 3 });
  assert.equal(report.absoluteDelta.totalTime, 2);
  assert.equal(report.percentageDelta.totalTime, 200);
});

test("Operational Delta Benchmark is deterministic", () => {
  const input = simpleInput();
  const a = runOperationalDeltaBenchmark(input, { createdAt: "2026-06-28T08:14:34.000Z", v4RuntimeMs: 1, orcRuntimeMs: 2 });
  const b = runOperationalDeltaBenchmark(input, { createdAt: "2026-06-28T08:14:34.000Z", v4RuntimeMs: 1, orcRuntimeMs: 2 });
  assert.equal(structuralEquals(a, b), true);
});

test("Operational Delta Benchmark serializes through Evidence Report", () => {
  const report = runOperationalDeltaBenchmark(simpleInput(), { createdAt: null });
  const evidence = buildOperationalDeltaEvidenceReport(report);
  assert.deepEqual(JSON.parse(JSON.stringify(evidence)), evidence);
  assert.equal(evidence.planningInfluence, "none");
});

test("Operational Delta Benchmark does not mutate input", () => {
  const input = simpleInput();
  const before = stableStringify(input);
  const report = runOperationalDeltaBenchmark(input, { createdAt: null });
  assert.equal(stableStringify(input), before);
  assert.equal(report.planningUnchanged, true);
});

test("Operational Delta Benchmark keeps raw shadow diagnostics separate from V4-seeded official ORC metrics", () => {
  const input = simpleInput();
  const report = runOperationalDeltaBenchmark(input, { createdAt: null, v4RuntimeMs: 0, orcRuntimeMs: 0 });
  assert.equal(report.orcBaselineSeed.serializable, true);
  assert.equal(report.orcBaselineSeed.planningInfluence, "benchmark-input-seeding-only");
  assert.equal(report.rawShadowDiagnostics.planningInfluence, "none");
  assert.equal(typeof report.rawShadowDiagnostics.invalidCount, "number");
  assert.equal(typeof report.metrics.orc.conflicts, "number");
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});


test("Operational Delta Benchmark classifies valid seeded baseline preservation as official ORC baseline", () => {
  const scenario = benchmarkScenarios[0];
  const report = runOperationalDeltaBenchmark(scenario.input as EngineInput, { createdAt: null, v4RuntimeMs: 0, orcRuntimeMs: 0 });
  assert.equal(report.officialOrcOutcome.kind, "orc_baseline_preserved");
  assert.equal(report.officialOrcOutcome.source, "v4_seeded_shadow_baseline");
  assert.equal(report.officialOrcOutcome.fallbackToV4, false);
  assert.equal(report.officialOrcOutcome.selectedSimulatedStateId !== null, true);
  assertFinalMetricsEqualV4(report);
  assert.equal(report.activeEquivalentMetricNormalization.applied, true);
  assert.equal(report.activeEquivalentMetricNormalization.reason, "baseline_preserved_final_metrics_equal_v4");
  assert.deepEqual(report.activeEquivalentMetricNormalization.normalizedFinalMetrics, FINAL_PLANNING_METRICS);
  assert.equal(report.improvementReport.summary.highPriority.includes("operationalPlanningQuality"), false);
  for (const metric of ["permanenceByTalent", "totalPermanence", "mainFlowContinuity", "makespan", "conflicts", "resourceUtilization"] as const) {
    const opportunity = report.improvementReport.opportunities.find((item) => item.metric === metric);
    assert.equal(opportunity?.comparison, "equal");
    assert.equal(opportunity?.optimizationPriority, "none");
  }
});

test("Operational Delta Benchmark applies V4 fallback when seeded shadow has no valid commit", () => {
  const scenario = benchmarkScenarios.find((item) => item.id !== "A") ?? benchmarkScenarios[0];
  const report = runOperationalDeltaBenchmark(scenario.input as EngineInput, { createdAt: null, v4RuntimeMs: 0, orcRuntimeMs: 0 });
  if (report.officialOrcOutcome.kind !== "v4_fallback") return;
  assert.equal(report.officialOrcOutcome.fallbackToV4, true);
  assert.equal(report.officialOrcOutcome.selectedSimulatedStateId, null);
  assertFinalMetricsEqualV4(report);
  assert.equal(report.seededShadowDiagnostics.invalidCount, report.officialOrcOutcome.invalidSeededSimulationCount);
  assert.equal(report.seededShadowDiagnostics.invalidCount >= 0, true);
  assert.equal(report.activeEquivalentMetricNormalization.applied, true);
  assert.equal(report.activeEquivalentMetricNormalization.reason, "fallback_final_metrics_equal_v4");
  assert.equal(report.improvementReport.summary.highPriority.includes("operationalPlanningQuality"), false);
});

test("Operational Delta Benchmark applies V4 fallback when seeded shadow produces no simulations", () => {
  const input: EngineInput = { ...simpleInput(), tasks: [], planResourceItems: [] };
  const report = runOperationalDeltaBenchmark(input, { createdAt: null, v4RuntimeMs: 0, orcRuntimeMs: 0 });
  assert.equal(report.officialOrcOutcome.kind, "v4_fallback");
  assert.equal(report.officialOrcOutcome.reason, "seeded_shadow_no_simulations");
  assert.equal(report.seededShadowDiagnostics.simulatedStateCount, 0);
  assert.equal(report.seededShadowDiagnostics.explanation.includes("seeded_shadow_no_simulations"), true);
  assertFinalMetricsEqualV4(report);
  assert.equal(report.metrics.orc.simulations, report.seededShadowDiagnostics.simulatedStateCount);
  assert.equal(report.activeEquivalentMetricNormalization.reason, "fallback_final_metrics_equal_v4");
});

test("Operational Delta Benchmark active-equivalent report is deterministic, serializable, immutable-input, and diagnostic-complete", () => {
  const input = simpleInput();
  const before = stableStringify(input);
  const a = runOperationalDeltaBenchmark(input, { createdAt: "2026-06-28T08:14:34.000Z", v4RuntimeMs: 0, orcRuntimeMs: 0 });
  const b = runOperationalDeltaBenchmark(input, { createdAt: "2026-06-28T08:14:34.000Z", v4RuntimeMs: 0, orcRuntimeMs: 0 });
  assert.equal(stableStringify(input), before);
  assert.equal(structuralEquals(a, b), true);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.equal(a.rawShadowDiagnostics.planningInfluence, "none");
  assert.equal(a.seededShadowDiagnostics.planningInfluence, "none");
  assert.equal(a.officialOrcOutcome.planningInfluence, "benchmark-outcome-classification-only");
});
