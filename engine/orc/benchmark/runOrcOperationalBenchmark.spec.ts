import test from "node:test";
import assert from "node:assert/strict";
import { stableStringify } from "../structuralEquality";
import { buildOptimizationAuthorizationReport } from "./evidenceGate";
import { runEvidenceOptimizationCycle } from "./evidenceOptimizationCycle";
import { runProductionScenarioBenchmarkSuite } from "./scenarioSuite";
import { buildOrcOperationalBenchmarkReport, runOrcOperationalBenchmark, serializeOrcOperationalBenchmarkReport } from "./runOrcOperationalBenchmark";

const options = { scenarioIds: ["initial-planning" as const], createdAt: null, v4RuntimeMs: 0, orcRuntimeMs: 0 };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("ORC Operational Benchmark executes scenarios and summarizes evidence", () => {
  const { report, suiteReport, optimizationReport, authorizationReport } = runOrcOperationalBenchmark(options);

  assert.equal(report.benchmarkVersion, "ORC-OPERATIONAL-BENCHMARK-CLI-V1");
  assert.equal(report.generatedAt, null);
  assert.equal(report.scenarioSummary.scenarioCount, suiteReport.scenarioCount);
  assert.equal(report.scenarioSummary.passedCount, suiteReport.passedCount);
  assert.equal(report.scenarioSummary.failedCount, suiteReport.failedCount);
  assert.equal(report.optimizationSummary.priorityCount, optimizationReport.optimizationPriorities.length);
  assert.equal(report.optimizationSummary.authorizedPriorityCount, authorizationReport.authorizedPriorities.length);
  assert.equal(report.optimizationSummary.pendingEvidencePriorityCount, authorizationReport.pendingEvidencePriorities.length);
});

test("ORC Operational Benchmark reports no authorized recommendation when Evidence Gate authorizes nothing", () => {
  const suiteReport = runProductionScenarioBenchmarkSuite(options);
  const optimizationReport = runEvidenceOptimizationCycle({ suiteReport });
  const authorizationReport = buildOptimizationAuthorizationReport({
    priorities: optimizationReport.optimizationPriorities.map((priority) => ({ ...priority, benchmarkEvidence: [] })),
    improvementReports: optimizationReport.improvementReports,
    generatedAt: null,
  });

  const report = buildOrcOperationalBenchmarkReport({ suiteReport, optimizationReport, authorizationReport });

  assert.equal(report.nextActionRecommendation.allowed, false);
  assert.equal(report.nextActionRecommendation.priorityId, null);
  assert.equal(report.nextActionRecommendation.metric, null);
  assert.match(report.nextActionRecommendation.reason, /Evidence Gate/);
});

test("ORC Operational Benchmark reports authorized recommendations only from Evidence Gate", () => {
  const suiteReport = runProductionScenarioBenchmarkSuite(options);
  const optimizationReport = runEvidenceOptimizationCycle({ suiteReport });
  const authorizationReport = buildOptimizationAuthorizationReport({
    priorities: optimizationReport.optimizationPriorities,
    improvementReports: optimizationReport.improvementReports,
    generatedAt: null,
  });
  const report = buildOrcOperationalBenchmarkReport({ suiteReport, optimizationReport, authorizationReport });

  assert.equal(report.nextActionRecommendation.allowed, authorizationReport.authorizedPriorities.length > 0);
  if (authorizationReport.authorizedPriorities.length > 0) {
    assert.equal(report.nextActionRecommendation.priorityId, authorizationReport.authorizedPriorities[0].priorityId);
    assert.equal(report.nextActionRecommendation.metric, authorizationReport.authorizedPriorities[0].metric);
  }
});

test("ORC Operational Benchmark is deterministic when generatedAt is null", () => {
  const a = runOrcOperationalBenchmark(options).report;
  const b = runOrcOperationalBenchmark(options).report;
  assert.equal(stableStringify(a), stableStringify(b));
});

test("ORC Operational Benchmark serializes as stable JSON", () => {
  const report = runOrcOperationalBenchmark(options).report;
  const serialized = serializeOrcOperationalBenchmarkReport(report);
  assert.deepEqual(JSON.parse(serialized), report);
  assert.equal(serialized, `${stableStringify(report)}\n`);
});

test("ORC Operational Benchmark does not mutate supplied suite reports", () => {
  const suiteReport = runProductionScenarioBenchmarkSuite(options);
  const before = clone(suiteReport);
  runOrcOperationalBenchmark({ suiteReport });
  assert.deepEqual(suiteReport, before);
});

test("ORC Operational Benchmark never influences official planning", () => {
  const { report } = runOrcOperationalBenchmark(options);
  assert.equal(report.planningInfluence, "none");
});


test("ORC Operational Benchmark recommendations come from active-equivalent official metrics, not invalid shadow diagnostics", () => {
  const suiteReport = runProductionScenarioBenchmarkSuite({ scenarioIds: ["real-voice-audition-day"], createdAt: null, v4RuntimeMs: 0, orcRuntimeMs: 0 });
  const optimizationReport = runEvidenceOptimizationCycle({ suiteReport });
  const authorizationReport = buildOptimizationAuthorizationReport({
    priorities: optimizationReport.optimizationPriorities,
    improvementReports: optimizationReport.improvementReports,
    generatedAt: null,
  });
  const scenarioReport = suiteReport.results[0].report;
  assert.ok(scenarioReport);
  assert.equal(scenarioReport.officialOrcOutcome.kind, "v4_fallback");
  assert.equal(scenarioReport.metrics.orc.conflicts, scenarioReport.metrics.v4.conflicts);
  assert.equal(scenarioReport.metrics.orc.candidatesConsolidated, scenarioReport.metrics.v4.candidatesConsolidated);
  assert.equal(scenarioReport.absoluteDelta.conflicts, 0);
  assert.equal(scenarioReport.absoluteDelta.candidatesConsolidated, 0);
  assert.equal(authorizationReport.authorizedPriorities.some((priority) => priority.metric === "conflicts" || priority.metric === "candidatesConsolidated"), false);
  assert.equal(suiteReport.results.every((result) => result.report == null || result.report.rawShadowDiagnostics.planningInfluence === "none"), true);
  assert.equal(suiteReport.results.every((result) => result.report == null || result.report.seededShadowDiagnostics.planningInfluence === "none"), true);
});
