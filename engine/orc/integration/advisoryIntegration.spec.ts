import assert from "node:assert/strict";
import test from "node:test";
import { generatePlanV4 } from "../../v4";
import type { EngineInput } from "../../types";
import { benchmarkScenarios } from "../../v3/benchmarks/scenarios";
import { buildAdvisoryDecision } from "../advisory/advisoryDecision";
import { runORCShadowMode, type ORCShadowModeResult } from "../shadow/runORCShadowMode";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { consultORCAdvisory } from "./advisoryIntegration";

const baseShadow = (overrides: Partial<ORCShadowModeResult> = {}): ORCShadowModeResult => {
  const shadow = {
    operationalState: { id: "operational-state:test" } as never,
    operationalMap: {} as never,
    opportunities: [], diagnoses: [], searchSpaces: [], candidates: [],
    candidateStates: [{ id: "candidate-state:1", candidateId: "candidate:1", strategy: "compact", originOpportunity: null, plannedTransformations: [], estimatedImpact: {}, estimatedCost: {}, confidence: 0.8 }],
    simulatedStates: [{ id: "simulated:1", candidateStateId: "candidate-state:1", baseStateId: "base", operationalStateSnapshot: {} as never, appliedTransformations: [], simulationMode: "READ_ONLY_BASELINE", readOnly: true, createdAt: null }],
    validationResults: [{ id: "validation:1", simulatedStateId: "simulated:1", result: "VALID", violatedConstraints: [], explanation: "valid", validatedAt: null, evidenceIds: ["evidence:validation:1"] }],
    operationalValues: [{ simulatedStateId: "simulated:1", continuity: 0.7, makespan: 0.7, permanence: 0.7, compaction: 0.7, resourcePressure: 0.7, robustness: 0.7, stability: 0.7, futureFreedom: 0.7, overallScore: 0.7, breakdown: {}, evaluatedAt: null, evidenceIds: ["evidence:evaluation:1"], metadata: {} }],
    commitDecisions: [],
    evidence: [
      { id: "evidence:evaluation:1", source: "orc-operational-evaluator", kind: "simulated-state-operational-value-evaluated", subjectId: "simulated:1", createdAt: null, data: {} },
      { id: "evidence:validation:1", source: "orc-validation-engine", kind: "simulated-state-validated", subjectId: "simulated:1", createdAt: null, data: {} },
      { id: "evidence:orc-ranking-engine:operational-value:simulated:1:rank:1", source: "orc-ranking-engine", kind: "operational-value-ranked", subjectId: "simulated:1", createdAt: null, data: {} },
    ],
    advisoryDecision: null,
    cognitiveState: {} as never,
    cognitiveStateInitial: {} as never,
    cognitiveStateDiff: {},
    candidateSummary: { searchSpaceCount: 0, candidateCount: 1, duplicateCandidatesDiscarded: 0, truncatedByBudget: false },
    summary: {
      enabled: true, opportunityCount: 0, searchSpaceCount: 0, candidateCount: 1, candidateStateCount: 1, simulatedStateCount: 1, validCount: 1, invalidCount: 0, evaluatedCount: 1,
      ranking: { rankedCandidates: 1, tiesResolved: 0, topCandidateId: "simulated:1" }, evaluation: { averageOverallScore: 0.7, bestOverallScore: 0.7, worstOverallScore: 0.7 },
      commitCount: 0, rejectCount: 0, topOpportunityId: null, topOpportunityKind: null, generatedAt: null,
      reasoningBudget: {} as never, pruning: { skippedOpportunities: 0, skippedSearchSpaces: 0, skippedCandidates: 0, estimatedBudgetSaved: 0 }, cognitiveFeedback: { repeatedOpportunities: 0, repeatedSearchSpaces: 0, repeatedCandidates: 0, potentialSavings: 0 },
      advisory: { available: false, confidence: 0, evidenceCount: 0 }, advisoryIntegration: { consulted: false, recommendationAvailable: false, evidenceReferences: [] },
      sessionLearning: { learnedPatterns: [], exhaustedRegions: [], usefulCandidates: [], discardedCandidates: [] }, adaptivePriority: { promoted: 0, demoted: 0, unchanged: 0 }, diagnosis: { diagnosed: 0, averageConfidence: 0, primaryCauseDistribution: {} }, adaptiveSearchSpace: { generated: 0, discarded: 0, averageSize: 0, exhaustedRegionsSkipped: 0 }, strategyCandidates: { generated: 0, discardedEquivalent: 0, strategyFamilies: 0, averageCandidatesPerSearchSpace: 0 },
    },
  } as ORCShadowModeResult;
  const withOverrides = { ...shadow, ...overrides } as ORCShadowModeResult;
  return { ...withOverrides, advisoryDecision: overrides.advisoryDecision === undefined ? buildAdvisoryDecision(withOverrides) : overrides.advisoryDecision };
};

const comparableV4 = (result: ReturnType<typeof generatePlanV4>) => ({
  feasible: result.output.feasible,
  complete: result.output.complete,
  hardFeasible: result.output.hardFeasible,
  plannedTasks: result.output.plannedTasks,
  unplanned: result.output.unplanned,
  warnings: result.output.warnings,
  reasons: result.output.reasons,
});

test("consultORCAdvisory is disabled when no shadow result is supplied", () => {
  assert.deepEqual(consultORCAdvisory(null), { consulted: false, advisoryDecision: null, evidence: [] });
});

test("consultORCAdvisory records an available recommendation with referenced evidence", () => {
  const result = consultORCAdvisory(baseShadow());
  assert.equal(result.consulted, true);
  assert.notEqual(result.advisoryDecision, null);
  assert.equal(result.evidence[0].data.recommendationAvailable, true);
  assert.ok((result.evidence[0].data.evidenceReferences as string[]).includes("evidence:validation:1"));
});

test("consultORCAdvisory records an absent recommendation", () => {
  const result = consultORCAdvisory(baseShadow({ advisoryDecision: null }));
  assert.equal(result.consulted, true);
  assert.equal(result.advisoryDecision, null);
  assert.equal(result.evidence[0].kind, "orc-advisory-consulted-recommendation-absent");
});

test("consultORCAdvisory is deterministic, structurally stable, and does not mutate input", () => {
  const shadow = baseShadow();
  const before = stableStringify(shadow);
  assert.equal(structuralEquals(consultORCAdvisory(shadow), consultORCAdvisory(shadow)), true);
  assert.deepEqual(JSON.parse(JSON.stringify(consultORCAdvisory(shadow))), consultORCAdvisory(shadow));
  assert.equal(stableStringify(shadow), before);
});

test("runORCShadowMode summary exposes advisory integration trace", () => {
  const shadow = runORCShadowMode(benchmarkScenarios[0].input as EngineInput, { enabled: true, createdAt: null });
  assert.notEqual(shadow, null);
  assert.equal(shadow?.summary.advisoryIntegration.consulted, true);
  assert.equal(shadow?.summary.advisoryIntegration.recommendationAvailable, shadow?.advisoryDecision !== null);
});

test("generatePlanV4 output is identical with advisory integration disabled and enabled", () => {
  const input = benchmarkScenarios[0].input as EngineInput;
  const options = { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as never;
  const shadow = runORCShadowMode(input, { enabled: true, createdAt: null });
  const disabled = generatePlanV4(input, options);
  const enabled = generatePlanV4(input, { ...options, orcAdvisoryIntegration: { enabled: true, shadowResult: shadow } } as never);
  assert.equal(structuralEquals(comparableV4(disabled), comparableV4(enabled)), true);
  assert.equal(enabled.diagnostics.orcAdvisoryIntegration?.consulted, true);
});
