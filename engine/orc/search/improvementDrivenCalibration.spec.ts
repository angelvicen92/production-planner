import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createReasoningBudget } from "../cognitive/reasoningBudget";
import type { ReasoningBudgetProfile } from "../contracts";
import type { ImprovementOpportunityReport } from "../benchmark/improvementOpportunityAnalyzer";
import { calibrateReasoningBudgetProfilesFromImprovementReport } from "./improvementDrivenCalibration";

const profiles: readonly ReasoningBudgetProfile[] = Object.freeze([
  Object.freeze({ opportunityId: "opp-a", criticalityLevel: 1, explorationBudget: 2, maxCandidates: 3, maxDepth: 1, maxSearchSpaceSize: 2, simulationBudget: 3, reason: "base-a" }),
  Object.freeze({ opportunityId: "opp-b", criticalityLevel: 3, explorationBudget: 4, maxCandidates: 5, maxDepth: 3, maxSearchSpaceSize: 4, simulationBudget: 5, reason: "base-b" }),
]);

function report(priorities: Array<["makespan" | "conflicts" | "totalTime", "high" | "medium" | "low" | "none", number]>): ImprovementOpportunityReport {
  return {
    analyzerVersion: "ORC-IMPROVEMENT-OPPORTUNITY-ANALYZER-V1",
    benchmarkVersion: "ORC-OPERATIONAL-DELTA-BENCHMARK-V1",
    generatedAt: "2026-06-28T09:14:00.000Z",
    scenario: { id: "s", name: "Scenario" },
    summary: { orcBetter: [], equal: [], orcWorse: priorities.map(([metric]) => metric), highPriority: priorities.filter(([, priority]) => priority === "high").map(([metric]) => metric), mediumPriority: priorities.filter(([, priority]) => priority === "medium").map(([metric]) => metric), lowPriority: priorities.filter(([, priority]) => priority === "low").map(([metric]) => metric) },
    opportunities: priorities.map(([metric, priority, estimatedImpact]) => ({
      metric,
      category: metric === "makespan" ? "makespan" : metric === "conflicts" ? "conflicts" : "computationalCost",
      comparison: priority === "none" ? "equal" : "orcWorse",
      orcValue: estimatedImpact,
      v4Value: 0,
      absoluteDelta: estimatedImpact,
      percentageDelta: estimatedImpact,
      estimatedImpact,
      priority,
      priorityExplanation: `${metric}:${priority}`,
      objectiveJustification: `${metric}: objective delta only`,
    })),
    evidence: { metricsAnalyzed: priorities.map(([metric]) => metric), differencesDetected: [], priorityExplanations: [], objectiveJustification: [] },
    planningInfluence: "none",
  };
}

const budget = createReasoningBudget({ maxSearchSpaces: 6, maxCandidates: 10, maxSimulations: 10 });

describe("Improvement-driven search calibration", () => {
  it("preserves profiles for an empty report", () => {
    const result = calibrateReasoningBudgetProfilesFromImprovementReport(profiles, report([]), budget, null);
    assert.deepEqual(result.calibratedProfiles, profiles);
    assert.equal(result.planningInfluence, "none");
  });

  it("calibrates from a single priority within budget limits", () => {
    const result = calibrateReasoningBudgetProfilesFromImprovementReport(profiles, report([["makespan", "medium", 12]]), budget, null);
    assert.equal(result.calibratedProfiles[0].explorationBudget, 3);
    assert.equal(result.calibratedProfiles[0].maxDepth, 2);
    assert.equal(result.calibratedProfiles[0].maxSearchSpaceSize, 4);
    assert.equal(result.evidence[0].kind, "improvement-driven-search-calibration");
  });

  it("uses the highest priority when multiple priorities exist", () => {
    const result = calibrateReasoningBudgetProfilesFromImprovementReport(profiles, report([["conflicts", "low", 4], ["totalTime", "high", 30]]), budget, null);
    assert.equal(result.calibratedProfiles[0].explorationBudget, 4);
    assert.equal(result.calibratedProfiles[0].maxDepth, 3);
    assert.equal(result.calibratedProfiles[0].maxSearchSpaceSize, 5);
  });

  it("is deterministic", () => {
    const inputReport = report([["totalTime", "high", 30], ["conflicts", "low", 4]]);
    const first = calibrateReasoningBudgetProfilesFromImprovementReport(profiles, inputReport, budget, "t");
    const second = calibrateReasoningBudgetProfilesFromImprovementReport(profiles, inputReport, budget, "t");
    assert.deepEqual(first, second);
  });

  it("serializes without losing reconstruction evidence", () => {
    const result = calibrateReasoningBudgetProfilesFromImprovementReport(profiles, report([["makespan", "high", 50]]), budget, null);
    const parsed = JSON.parse(JSON.stringify(result));
    assert.deepEqual(parsed.originalProfiles, result.originalProfiles);
    assert.deepEqual(parsed.calibratedProfiles, result.calibratedProfiles);
    assert.deepEqual(parsed.evidence[0].data.originalProfiles, result.originalProfiles);
  });

  it("does not mutate input profiles", () => {
    const before = JSON.stringify(profiles);
    calibrateReasoningBudgetProfilesFromImprovementReport(profiles, report([["makespan", "high", 50]]), budget, null);
    assert.equal(JSON.stringify(profiles), before);
  });
});
