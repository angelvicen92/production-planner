import assert from "node:assert/strict";
import test from "node:test";
import { stableStringify } from "../structuralEquality";
import { OPERATIONAL_DELTA_BENCHMARK_VERSION, type OperationalDeltaMetrics, type OperationalDeltaReport } from "./operationalDeltaBenchmark";
import { analyzeImprovementOpportunities } from "./improvementOpportunityAnalyzer";
import { buildOptimizationAuthorizationReport, EVIDENCE_GATE_VERSION, type EvidenceGatePriorityInput } from "./evidenceGate";

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

function report(orc: OperationalDeltaMetrics, v4: OperationalDeltaMetrics, planId = 175): OperationalDeltaReport {
  const absoluteDelta = delta(orc, v4);
  return {
    benchmarkVersion: OPERATIONAL_DELTA_BENCHMARK_VERSION,
    generatedAt: "2026-06-28T10:20:00.000Z",
    scenario: { planId, taskCount: 1 },
    metrics: { orc, v4 },
    absoluteDelta,
    percentageDelta: pct(absoluteDelta, v4),
    evidenceExplanation: ["test evidence"],
    planningUnchanged: true,
  } as OperationalDeltaReport;
}

function priorityFrom(report: OperationalDeltaReport, metric: "makespan" | "totalTime"): EvidenceGatePriorityInput {
  const analyzed = analyzeImprovementOpportunities(report);
  const opportunity = analyzed.opportunities.find((item) => item.metric === metric);
  assert.ok(opportunity);
  assert.notEqual(opportunity.optimizationPriority, "none");
  return {
    id: `optimization:${opportunity.optimizationPriority}:${metric}`,
    metric,
    priority: opportunity.optimizationPriority,
    benchmarkEvidence: [{
      benchmarkVersion: opportunity.benchmarkVersion,
      scenario: opportunity.scenario,
      comparison: opportunity.comparison,
      absoluteDelta: opportunity.absoluteDelta,
      percentageDelta: opportunity.percentageDelta,
      priorityExplanation: opportunity.priorityExplanation,
      objectiveJustification: opportunity.objectiveJustification,
    }],
  } as EvidenceGatePriorityInput;
}

test("evidence gate authorizes a valid benchmark-backed priority", () => {
  const benchmark = report(metrics({ makespan: 900 }), metrics());
  const authorization = buildOptimizationAuthorizationReport({
    priorities: [priorityFrom(benchmark, "makespan")],
    improvementReports: [analyzeImprovementOpportunities(benchmark)],
    generatedAt: "2026-06-28T10:20:00.000Z",
  });
  assert.equal(authorization.gateVersion, EVIDENCE_GATE_VERSION);
  assert.equal(authorization.authorizedPriorities.length, 1);
  assert.equal(authorization.authorizedPriorities[0].status, "authorized");
  assert.equal(authorization.pendingEvidencePriorities.length, 0);
  assert.equal(authorization.planningInfluence, "none");
});

test("evidence gate marks a priority without benchmark evidence as pending_evidence", () => {
  const benchmark = report(metrics({ makespan: 900 }), metrics());
  const authorization = buildOptimizationAuthorizationReport({
    priorities: [{ id: "optimization:high:makespan", metric: "makespan", priority: "high" }],
    improvementReports: [analyzeImprovementOpportunities(benchmark)],
  });
  assert.equal(authorization.authorizedPriorities.length, 0);
  assert.equal(authorization.pendingEvidencePriorities.length, 1);
  assert.equal(authorization.pendingEvidencePriorities[0].status, "pending_evidence");
});

test("evidence gate separates multiple authorized and pending priorities", () => {
  const benchmark = report(metrics({ makespan: 900, totalTime: 11 }), metrics());
  const authorization = buildOptimizationAuthorizationReport({
    priorities: [priorityFrom(benchmark, "makespan"), priorityFrom(benchmark, "totalTime"), { id: "optimization:medium:conflicts", metric: "conflicts", priority: "medium" }],
    improvementReports: [analyzeImprovementOpportunities(benchmark)],
  });
  assert.deepEqual(authorization.authorizedPriorities.map((item) => item.metric).sort(), ["makespan", "totalTime"]);
  assert.deepEqual(authorization.pendingEvidencePriorities.map((item) => item.metric), ["conflicts"]);
});

test("evidence gate is deterministic", () => {
  const benchmark = report(metrics({ makespan: 900 }), metrics());
  const params = { priorities: [priorityFrom(benchmark, "makespan")], improvementReports: [analyzeImprovementOpportunities(benchmark)] };
  assert.equal(stableStringify(buildOptimizationAuthorizationReport(params)), stableStringify(buildOptimizationAuthorizationReport(params)));
});

test("evidence gate report serializes as JSON", () => {
  const benchmark = report(metrics({ makespan: 900 }), metrics());
  const authorization = buildOptimizationAuthorizationReport({ priorities: [priorityFrom(benchmark, "makespan")], improvementReports: [analyzeImprovementOpportunities(benchmark)] });
  assert.deepEqual(JSON.parse(JSON.stringify(authorization)), authorization);
});

test("evidence gate does not mutate inputs", () => {
  const benchmark = report(metrics({ makespan: 900 }), metrics());
  const priorities = [priorityFrom(benchmark, "makespan")];
  const improvementReports = [analyzeImprovementOpportunities(benchmark)];
  const before = stableStringify({ priorities, improvementReports });
  buildOptimizationAuthorizationReport({ priorities, improvementReports });
  assert.equal(stableStringify({ priorities, improvementReports }), before);
});
