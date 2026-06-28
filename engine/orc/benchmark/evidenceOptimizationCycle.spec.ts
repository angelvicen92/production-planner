import assert from "node:assert/strict";
import test from "node:test";
import { stableStringify } from "../structuralEquality";
import { EVIDENCE_OPTIMIZATION_CYCLE_VERSION, buildEvidenceOptimizationReport, runEvidenceOptimizationCycle } from "./evidenceOptimizationCycle";
import { analyzeImprovementOpportunities } from "./improvementOpportunityAnalyzer";
import { OPERATIONAL_DELTA_BENCHMARK_VERSION, type OperationalDeltaMetrics, type OperationalDeltaReport } from "./operationalDeltaBenchmark";
import { PRODUCTION_SCENARIO_BENCHMARK_CREATED_AT, PRODUCTION_SCENARIO_BENCHMARK_SUITE_VERSION, type ProductionScenarioBenchmarkSuiteReport } from "./scenarioSuite";

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
  dependencyChainsProtected: 0,
  dependencyBlockagesAvoided: 0,
  dependencyAverageSlackRecovered: 0,
  dependencyCriticalityOperationalValueCorrelation: 0,
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
  dependencyChainsProtected: orc.dependencyChainsProtected - v4.dependencyChainsProtected,
  dependencyBlockagesAvoided: orc.dependencyBlockagesAvoided - v4.dependencyBlockagesAvoided,
  dependencyAverageSlackRecovered: orc.dependencyAverageSlackRecovered - v4.dependencyAverageSlackRecovered,
  dependencyCriticalityOperationalValueCorrelation: orc.dependencyCriticalityOperationalValueCorrelation - v4.dependencyCriticalityOperationalValueCorrelation,
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
  dependencyChainsProtected: v4.dependencyChainsProtected === 0 ? 0 : (absolute.dependencyChainsProtected / v4.dependencyChainsProtected) * 100,
  dependencyBlockagesAvoided: v4.dependencyBlockagesAvoided === 0 ? 0 : (absolute.dependencyBlockagesAvoided / v4.dependencyBlockagesAvoided) * 100,
  dependencyAverageSlackRecovered: v4.dependencyAverageSlackRecovered === 0 ? 0 : (absolute.dependencyAverageSlackRecovered / v4.dependencyAverageSlackRecovered) * 100,
  dependencyCriticalityOperationalValueCorrelation: v4.dependencyCriticalityOperationalValueCorrelation === 0 ? 0 : (absolute.dependencyCriticalityOperationalValueCorrelation / v4.dependencyCriticalityOperationalValueCorrelation) * 100,
});

function report(planId: number, orc: OperationalDeltaMetrics, v4: OperationalDeltaMetrics): OperationalDeltaReport {
  const absoluteDelta = delta(orc, v4);
  const base = {
    benchmarkVersion: OPERATIONAL_DELTA_BENCHMARK_VERSION,
    generatedAt: PRODUCTION_SCENARIO_BENCHMARK_CREATED_AT,
    scenario: { planId, taskCount: 1 },
    metrics: { orc, v4 },
    absoluteDelta,
    percentageDelta: pct(absoluteDelta, v4),
    evidenceExplanation: ["test evidence"],
    planningUnchanged: true,
  } as OperationalDeltaReport;
  return { ...base, improvementReport: analyzeImprovementOpportunities(base) };
}

function suite(reports: OperationalDeltaReport[]): ProductionScenarioBenchmarkSuiteReport {
  return {
    suiteVersion: PRODUCTION_SCENARIO_BENCHMARK_SUITE_VERSION,
    generatedAt: PRODUCTION_SCENARIO_BENCHMARK_CREATED_AT,
    scenarioCount: reports.length,
    passedCount: reports.length,
    failedCount: 0,
    results: reports.map((item) => ({
      scenario: { id: `scenario-${item.scenario.planId}` as any, name: "Scenario", category: "test" as any, description: "Test", expectation: "Stable", taskCount: item.scenario.taskCount },
      status: "passed",
      report: item,
      error: null,
      inputUnchanged: true,
    })),
    globalSummary: { totalTasks: reports.length, officialMetricsOnly: true, planningInfluence: "none", orcBetterOpportunityCount: 0, orcWorseOpportunityCount: 0, equalOpportunityCount: 0, evidenceExplanation: ["suite evidence"] },
  };
}

test("cycle preserves equality between ORC and V4 with empty priorities", () => {
  const optimization = buildEvidenceOptimizationReport(suite([report(174, metrics(), metrics())]));
  assert.equal(optimization.cycleVersion, EVIDENCE_OPTIMIZATION_CYCLE_VERSION);
  assert.deepEqual(optimization.optimizationPriorities, []);
  assert.equal(optimization.evidence.planningUnchanged, true);
  assert.equal(optimization.planningInfluence, "none");
});

test("cycle records multiple evidence-backed priorities", () => {
  const optimization = buildEvidenceOptimizationReport(suite([
    report(17401, metrics({ makespan: 900, totalTime: 12 }), metrics()),
    report(17402, metrics({ resourceUtilization: 0.25, candidatesGenerated: 6 }), metrics()),
  ]));
  assert.ok(optimization.optimizationPriorities.length >= 3);
  assert.ok(optimization.optimizationPriorities.some((item) => item.metric === "makespan" && item.priority === "high"));
  assert.ok(optimization.optimizationPriorities.every((item) => item.benchmarkEvidence.length > 0));
});

test("cycle is deterministic", () => {
  const input = suite([report(17403, metrics({ simulations: 5 }), metrics())]);
  assert.equal(stableStringify(buildEvidenceOptimizationReport(input)), stableStringify(buildEvidenceOptimizationReport(input)));
});

test("cycle serializes active priorities and complete report", () => {
  const optimization = buildEvidenceOptimizationReport(suite([report(17404, metrics({ totalPermanence: 160 }), metrics())]));
  assert.deepEqual(JSON.parse(JSON.stringify(optimization)), optimization);
});

test("cycle does not mutate benchmark suite reports", () => {
  const input = suite([report(17405, metrics({ conflicts: 2 }), metrics({ conflicts: 1 }))]);
  const before = stableStringify(input);
  buildEvidenceOptimizationReport(input);
  assert.equal(stableStringify(input), before);
});

test("cycle runner accepts an injected benchmark suite report", () => {
  const input = suite([report(17406, metrics(), metrics())]);
  const optimization = runEvidenceOptimizationCycle({ suiteReport: input });
  assert.equal(optimization.benchmarkUsed.scenarioCount, 1);
  assert.deepEqual(optimization.optimizationPriorities, []);
});
