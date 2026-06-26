import assert from "node:assert/strict";
import test from "node:test";
import { generatePlanV4 } from "../../v4";
import type { EngineInput } from "../../types";
import { benchmarkScenarios } from "../../v3/benchmarks/scenarios";
import { validateRealScenario } from "../validation/realScenarioValidation";
import type { ORCBenchmarkResult } from "../benchmarks/orcBenchmarkHarness";
import type { CalibrationReport } from "../benchmarks/calibrationFramework";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { runORCShadowMode, type ORCShadowModeResult } from "../shadow/runORCShadowMode";
import { buildAdvisoryDecision } from "./advisoryDecision";


const v4Comparable = (result: ReturnType<typeof generatePlanV4>) => ({
  feasible: result.output.feasible,
  complete: result.output.complete,
  hardFeasible: result.output.hardFeasible,
  plannedTasks: result.output.plannedTasks,
  unplanned: result.output.unplanned,
  warnings: result.output.warnings,
  reasons: result.output.reasons,
});

const baseShadow = (overrides: Partial<ORCShadowModeResult> = {}): ORCShadowModeResult => ({
  operationalState: {} as never,
  operationalMap: {} as never,
  opportunities: [],
  diagnoses: [],
  searchSpaces: [],
  candidates: [],
  candidateStates: [{ id: "candidate-state:1", candidateId: "candidate:1", strategy: "compact", originOpportunity: null, plannedTransformations: [], estimatedImpact: {}, estimatedCost: {}, confidence: 0.8 }],
  simulatedStates: [{ id: "simulated:1", candidateStateId: "candidate-state:1", baseStateId: "base", operationalStateSnapshot: {} as never, appliedTransformations: [], simulationMode: "READ_ONLY_BASELINE", readOnly: true, createdAt: "2026-06-26T20:00:00.000Z" }],
  validationResults: [{ id: "validation:1", simulatedStateId: "simulated:1", result: "VALID", violatedConstraints: [], explanation: "valid", validatedAt: "2026-06-26T20:00:00.000Z", evidenceIds: ["evidence:validation:1"] }],
  operationalValues: [{ simulatedStateId: "simulated:1", continuity: 0.7, makespan: 0.7, permanence: 0.7, compaction: 0.7, resourcePressure: 0.7, robustness: 0.7, stability: 0.7, futureFreedom: 0.7, overallScore: 0.7, breakdown: {}, evaluatedAt: "2026-06-26T20:00:00.000Z", evidenceIds: ["evidence:evaluation:1"], metadata: {} }],
  commitDecisions: [],
  evidence: [
    { id: "evidence:evaluation:1", source: "orc-operational-evaluator", kind: "simulated-state-operational-value-evaluated", data: {} },
    { id: "evidence:validation:1", source: "orc-validation-engine", kind: "simulated-state-validated", data: {} },
    { id: "evidence:orc-ranking-engine:operational-value:simulated:1:rank:1", source: "orc-ranking-engine", kind: "operational-value-ranked", data: {} },
  ],
  advisoryDecision: null,
  cognitiveState: {} as never,
  cognitiveStateInitial: {} as never,
  cognitiveStateDiff: {},
  candidateSummary: { searchSpaceCount: 0, candidateCount: 1, duplicateCandidatesDiscarded: 0, truncatedByBudget: false },
  summary: {
    enabled: true, opportunityCount: 0, searchSpaceCount: 0, candidateCount: 1, candidateStateCount: 1, simulatedStateCount: 1, validCount: 1, invalidCount: 0, evaluatedCount: 1,
    ranking: { rankedCandidates: 1, tiesResolved: 0, topCandidateId: "simulated:1" }, evaluation: { averageOverallScore: 0.7, bestOverallScore: 0.7, worstOverallScore: 0.7 },
    commitCount: 0, rejectCount: 0, topOpportunityId: null, topOpportunityKind: null, generatedAt: "2026-06-26T20:00:00.000Z",
    reasoningBudget: {} as never, pruning: { skippedOpportunities: 0, skippedSearchSpaces: 0, skippedCandidates: 0, estimatedBudgetSaved: 0 }, cognitiveFeedback: { repeatedOpportunities: 0, repeatedSearchSpaces: 0, repeatedCandidates: 0, potentialSavings: 0 },
    sessionLearning: { learnedPatterns: [], exhaustedRegions: [], usefulCandidates: [], discardedCandidates: [] }, adaptivePriority: { promoted: 0, demoted: 0, unchanged: 0 }, diagnosis: { diagnosed: 0, averageConfidence: 0, primaryCauseDistribution: {} }, adaptiveSearchSpace: { generated: 0, discarded: 0, averageSize: 0, exhaustedRegionsSkipped: 0 }, strategyCandidates: { generated: 0, discardedEquivalent: 0, strategyFamilies: 0, averageCandidatesPerSearchSpace: 0 }, advisory: { available: false, confidence: 0, evidenceCount: 0 },
  },
  ...overrides,
});

test("buildAdvisoryDecision returns null for an empty pipeline", () => {
  assert.equal(buildAdvisoryDecision(baseShadow({ operationalValues: [] })), null);
});

test("buildAdvisoryDecision returns null without a valid recommended candidate", () => {
  assert.equal(buildAdvisoryDecision(baseShadow({ validationResults: [{ ...baseShadow().validationResults[0], result: "INVALID" }] })), null);
});

test("buildAdvisoryDecision builds a traceable recommended candidate", () => {
  const decision = buildAdvisoryDecision(baseShadow());
  assert.equal(decision?.candidateId, "candidate:1");
  assert.equal(decision?.confidence, 0.7);
  assert.deepEqual(decision?.constraintsConsidered, ["validation:VALID:no-violated-constraints"]);
  assert.deepEqual(decision?.evidenceIds, ["evidence:evaluation:1", "evidence:orc-ranking-engine:operational-value:simulated:1:rank:1", "evidence:validation:1"]);
});

test("buildAdvisoryDecision is deterministic, structurally stable and does not mutate input", () => {
  const shadow = baseShadow();
  const before = stableStringify(shadow);
  assert.equal(structuralEquals(buildAdvisoryDecision(shadow), buildAdvisoryDecision(shadow)), true);
  assert.deepEqual(JSON.parse(JSON.stringify(buildAdvisoryDecision(shadow))), buildAdvisoryDecision(shadow));
  assert.equal(stableStringify(shadow), before);
});

test("runORCShadowMode exposes advisory decision summary", () => {
  const shadow = runORCShadowMode((benchmarkScenarios[0].input as EngineInput), { enabled: true, createdAt: "2026-06-26T20:00:00.000Z" });
  assert.notEqual(shadow, null);
  assert.equal(shadow?.summary.advisory.available, shadow?.advisoryDecision !== null);
  assert.equal(shadow?.summary.advisory.evidenceCount, shadow?.advisoryDecision?.evidenceIds.length ?? 0);
});

test("validateRealScenario includes advisory decision without changing metrics", () => {
  const advisoryDecision = buildAdvisoryDecision(baseShadow());
  const benchmark = { opportunitiesDetected: 0, candidatesGenerated: 0, commitDecisionsGenerated: 0, operationalValuesGenerated: 0, summary: { evidence: { timestamp: null, configuration: { inputPlanId: 1 } }, advisoryDecision } } as ORCBenchmarkResult;
  const calibration = { benchmarkVersion: "baseline", quality: { reasoningBudgetEfficiency: 0 } } as CalibrationReport;
  const report = validateRealScenario(benchmark, calibration, { feasible: true, complete: true, hardFeasible: true, plannedTasks: [], warnings: [], unplanned: [] });
  assert.deepEqual(report.advisoryDecision, advisoryDecision);
  assert.equal(report.metrics.detectedOpportunities, 0);
});

test("runORCShadowMode advisory integration does not alter generatePlanV4 output", () => {
  const input = benchmarkScenarios[0].input as EngineInput;
  const options = { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as never;
  const before = generatePlanV4(input, options);
  runORCShadowMode(input, { enabled: true, createdAt: null });
  const after = generatePlanV4(input, options);
  assert.equal(structuralEquals(v4Comparable(before), v4Comparable(after)), true);
});
