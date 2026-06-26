import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { generatePlanV4 } from "../../v4";
import { benchmarkScenarios } from "../../v3/benchmarks/scenarios";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { createInitialCognitiveState, recordExploredOpportunity } from "../cognitive/cognitiveState";
import { runORCShadowMode } from "./runORCShadowMode";

const minimalInput = (): EngineInput => ({
  planId: 94,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks: [
    { id: 1, planId: 94, templateId: 10, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7] },
    { id: 2, planId: 94, templateId: 11, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [7] },
    { id: 3, planId: 94, templateId: 12, status: "pending", contestantId: 2 },
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

const v4Comparable = (result: ReturnType<typeof generatePlanV4>) => ({
  feasible: result.output.feasible,
  complete: result.output.complete,
  hardFeasible: result.output.hardFeasible,
  plannedTasks: result.output.plannedTasks,
  unplanned: result.output.unplanned,
  warnings: result.output.warnings,
  reasons: result.output.reasons,
});

test("runORCShadowMode returns null when explicitly disabled", () => {
  assert.equal(runORCShadowMode(minimalInput(), { enabled: false }), null);
});

test("runORCShadowMode produces operational state, map, opportunities, evidence and summary when enabled", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(shadow, null);
  assert.equal(shadow.operationalState.schemaVersion, "ORC-SPEC-01");
  assert.equal(shadow.operationalMap.stateId, shadow.operationalState.id);
  assert.ok(shadow.opportunities.length > 0);
  assert.ok(shadow.evidence.length > 0);
  assert.ok(Array.isArray(shadow.searchSpaces));
  assert.ok(Array.isArray(shadow.candidates));
  assert.ok(Array.isArray(shadow.candidateStates));
  assert.ok(Array.isArray(shadow.simulatedStates));
  assert.ok(Array.isArray(shadow.validationResults));
  assert.ok(Array.isArray(shadow.operationalValues));
  assert.ok(Array.isArray(shadow.commitDecisions));
  assert.equal(shadow.candidateStates.length, shadow.candidates.length);
  assert.equal(shadow.simulatedStates.length, shadow.candidateStates.length);
  assert.equal(shadow.validationResults.length, shadow.simulatedStates.length);
  assert.equal(shadow.operationalValues.length, shadow.validationResults.length);
  assert.equal(shadow.commitDecisions.length, shadow.operationalValues.length);
  assert.equal(shadow.candidateSummary.candidateCount, shadow.candidates.length);
  assert.equal(shadow.summary.enabled, true);
  assert.equal(shadow.summary.opportunityCount, shadow.opportunities.length);
  assert.equal(shadow.summary.searchSpaceCount, shadow.searchSpaces.length);
  assert.equal(shadow.summary.candidateCount, shadow.candidates.length);
  assert.equal(shadow.summary.candidateStateCount, shadow.candidateStates.length);
  assert.equal(shadow.summary.simulatedStateCount, shadow.simulatedStates.length);
  assert.equal(shadow.validationResults.length, shadow.simulatedStates.length);
  assert.equal(shadow.operationalValues.length, shadow.validationResults.length);
  assert.equal(shadow.commitDecisions.length, shadow.operationalValues.length);
  assert.equal(shadow.validationResults[0]?.result, "VALID");
  assert.equal(shadow.summary.validCount, shadow.validationResults.length);
  assert.equal(shadow.summary.invalidCount, 0);
  assert.equal(shadow.summary.evaluatedCount, shadow.operationalValues.length);
  assert.equal(shadow.summary.ranking.rankedCandidates, shadow.operationalValues.length);
  assert.equal(shadow.summary.ranking.topCandidateId, shadow.operationalValues[0]?.simulatedStateId ?? null);
  assert.equal(typeof shadow.summary.evaluation.averageOverallScore, "number");
  assert.equal(shadow.summary.evaluation.bestOverallScore! >= shadow.summary.evaluation.worstOverallScore!, true);
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "operational-value-ranked"));
  assert.equal(shadow.summary.commitCount, shadow.commitDecisions.length);
  assert.equal(shadow.summary.rejectCount, 0);
  assert.equal(shadow.summary.topOpportunityId, shadow.opportunities[0]?.id ?? null);
  assert.equal(shadow.summary.topOpportunityKind, shadow.opportunities[0]?.kind ?? null);
  assert.equal(shadow.summary.generatedAt, "2026-06-25T00:00:00.000Z");
  assert.deepEqual(shadow.summary.pruning, { skippedOpportunities: 0, skippedSearchSpaces: 0, skippedCandidates: 0, estimatedBudgetSaved: 0 });
  assert.deepEqual(shadow.summary.adaptivePriority, { promoted: 0, demoted: 0, unchanged: shadow.opportunities.length });
  assert.equal(shadow.summary.adaptiveSearchSpace.generated, shadow.searchSpaces.length);
  assert.equal(shadow.summary.adaptiveSearchSpace.exhaustedRegionsSkipped, 0);
});

test("runORCShadowMode does not mutate EngineInput", () => {
  const input = minimalInput();
  const before = stableStringify(input);
  runORCShadowMode(input, { enabled: true, createdAt: null });
  assert.equal(stableStringify(input), before);
});

test("runORCShadowMode is deterministic with the same input and createdAt", () => {
  const input = minimalInput();
  const first = runORCShadowMode(input, { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  const second = runORCShadowMode(input, { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(structuralEquals(first, second), true);
  assert.equal(structuralEquals(first?.searchSpaces, second?.searchSpaces), true);
  assert.equal(structuralEquals(first?.candidates, second?.candidates), true);
  assert.equal(structuralEquals(first?.candidateStates, second?.candidateStates), true);
  assert.equal(structuralEquals(first?.simulatedStates, second?.simulatedStates), true);
  assert.equal(structuralEquals(first?.operationalValues, second?.operationalValues), true);
  assert.equal(structuralEquals(first?.commitDecisions, second?.commitDecisions), true);
});

test("runORCShadowMode tolerates minimal incomplete input", () => {
  const incomplete = {
    planId: 95,
    workDay: { start: "09:00", end: "10:00" },
    meal: { start: "12:00", end: "13:00" },
    camerasAvailable: 1,
    tasks: [],
    locks: [],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
  } as EngineInput;
  const shadow = runORCShadowMode(incomplete, { enabled: true, createdAt: null });
  assert.notEqual(shadow, null);
  assert.equal(shadow?.operationalState.planId, 95);
  assert.equal(shadow?.operationalMap.taskCount, 0);
  assert.deepEqual(shadow?.opportunities, []);
  assert.deepEqual(shadow?.searchSpaces, []);
  assert.deepEqual(shadow?.candidates, []);
  assert.deepEqual(shadow?.candidateStates, []);
  assert.deepEqual(shadow?.simulatedStates, []);
  assert.deepEqual(shadow?.validationResults, []);
  assert.deepEqual(shadow?.operationalValues, []);
  assert.deepEqual(shadow?.commitDecisions, []);
  assert.equal(shadow?.summary.searchSpaceCount, 0);
  assert.equal(shadow?.candidateSummary.candidateCount, 0);
  assert.equal(shadow?.summary.candidateStateCount, 0);
  assert.equal(shadow?.summary.simulatedStateCount, 0);
  assert.equal(shadow?.summary.validCount, 0);
  assert.equal(shadow?.summary.invalidCount, 0);
  assert.equal(shadow?.summary.evaluatedCount, 0);
  assert.deepEqual(shadow?.summary.ranking, { rankedCandidates: 0, tiesResolved: 0, topCandidateId: null });
  assert.equal(shadow?.summary.commitCount, 0);
  assert.equal(shadow?.summary.rejectCount, 0);
  assert.ok((shadow?.evidence.length ?? 0) > 0);
});

test("runORCShadowMode does not alter generatePlanV4 output", () => {
  const scenario = benchmarkScenarios[0];
  const input = scenario.input as EngineInput;
  const options = { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any;
  const before = generatePlanV4(input, options);
  const shadow = runORCShadowMode(input, { enabled: true, createdAt: null });
  const after = generatePlanV4(input, options);
  assert.equal(structuralEquals(v4Comparable(before), v4Comparable(after)), true);
  assert.notEqual(shadow, null);
});


test("runORCShadowMode integrates read-only simulated states", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(shadow, null);
  assert.equal(shadow.simulatedStates.length, shadow.candidateStates.length);
  assert.equal(shadow.summary.simulatedStateCount, shadow.simulatedStates.length);
  assert.equal(shadow.simulatedStates[0]?.simulationMode, "READ_ONLY_BASELINE");
  assert.equal(shadow.simulatedStates[0]?.readOnly, true);
  assert.equal(structuralEquals(shadow.simulatedStates[0]?.operationalStateSnapshot, shadow.operationalState), true);
  assert.notEqual(shadow.simulatedStates[0]?.operationalStateSnapshot, shadow.operationalState);
});


test("runORCShadowMode integrates read-only operational values", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(shadow, null);
  assert.equal(shadow.operationalValues.length, shadow.validationResults.filter((validationResult) => validationResult.result === "VALID").length);
  assert.equal(shadow.summary.evaluatedCount, shadow.operationalValues.length);
  assert.equal(shadow.summary.commitCount, shadow.commitDecisions.length);
  assert.equal(shadow.summary.rejectCount, 0);
  assert.equal(shadow.operationalValues[0]?.simulatedStateId, shadow.simulatedStates[0]?.id);
  assert.equal(shadow.operationalValues[0]?.evaluatedAt, "2026-06-25T00:00:00.000Z");
});


test("runORCShadowMode integrates read-only commit decisions", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(shadow, null);
  assert.equal(shadow.commitDecisions.length, shadow.operationalValues.length);
  assert.equal(shadow.summary.commitCount, shadow.commitDecisions.length);
  assert.equal(shadow.summary.rejectCount, 0);
  assert.equal(shadow.commitDecisions[0]?.decision, "COMMIT");
  assert.equal(shadow.commitDecisions[0]?.operationalValueId, shadow.operationalValues[0]?.simulatedStateId);
  assert.equal(shadow.commitDecisions[0]?.createdAt, "2026-06-25T00:00:00.000Z");
});

test("runORCShadowMode builds temporal cognitive state evidence", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(shadow, null);
  assert.deepEqual(shadow.cognitiveStateInitial.exploredOpportunityIds, []);
  assert.deepEqual(shadow.cognitiveState.exploredOpportunityIds, shadow.opportunities.map((opportunity) => opportunity.id));
  assert.deepEqual(shadow.cognitiveState.exhaustedSearchSpaceIds, shadow.searchSpaces.map((searchSpace) => searchSpace.id));
  assert.deepEqual(shadow.cognitiveState.simulatedCandidateIds, shadow.simulatedStates.map((simulatedState) => simulatedState.candidateStateId));
  assert.equal(shadow.cognitiveState.reasoningBudget.consumedOpportunities, shadow.opportunities.length);
  assert.equal(shadow.cognitiveState.reasoningBudget.consumedSearchSpaces, shadow.searchSpaces.length);
  assert.equal(shadow.cognitiveState.reasoningBudget.consumedCandidates, shadow.candidates.length);
  assert.equal(shadow.cognitiveState.reasoningBudget.consumedSimulations, shadow.simulatedStates.length);
  assert.equal(shadow.summary.reasoningBudget.consumedOpportunities, shadow.opportunities.length);
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "cognitive-state-initial"));
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "cognitive-state-final"));
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "cognitive-state-diff"));
});

test("runORCShadowMode starts with a fresh cognitive memory for each execution", () => {
  const first = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  const second = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(first, null);
  assert.notEqual(second, null);
  assert.notEqual(first.cognitiveStateInitial, second.cognitiveStateInitial);
  assert.deepEqual(first.cognitiveStateInitial, second.cognitiveStateInitial);
  assert.equal(structuralEquals(first.cognitiveState, second.cognitiveState), true);
});

test("runORCShadowMode exposes observational cognitive feedback summary", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(shadow, null);
  assert.deepEqual(shadow.summary.cognitiveFeedback, {
    repeatedOpportunities: 0,
    repeatedSearchSpaces: 0,
    repeatedCandidates: 0,
    potentialSavings: 0,
  });
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "shadow-mode-summary" && evidence.data.cognitiveFeedback != null));
});

test("runORCShadowMode integrates cognitive pruning from temporal memory", () => {
  const baseline = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(baseline, null);
  const initial = recordExploredOpportunity(createInitialCognitiveState("2026-06-25T00:00:00.000Z"), baseline.opportunities[0]?.id ?? "missing");
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z", cognitiveState: initial });
  assert.notEqual(shadow, null);
  assert.equal(shadow.summary.pruning.skippedOpportunities, 1);
  assert.equal(shadow.summary.pruning.estimatedBudgetSaved, 1);
  assert.equal(shadow.opportunities.some((opportunity) => opportunity.id === baseline.opportunities[0]?.id), false);
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "opportunity-pruned"));
});


test("runORCShadowMode exposes accumulated session learning in summary and evidence", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(shadow, null);
  assert.ok(shadow.summary.sessionLearning.learnedPatterns.length > 0);
  assert.deepEqual(shadow.summary.sessionLearning.exhaustedRegions, shadow.searchSpaces.map((searchSpace) => searchSpace.id).sort());
  assert.ok(shadow.summary.sessionLearning.usefulCandidates.length > 0);
  assert.deepEqual(shadow.summary.sessionLearning.discardedCandidates, shadow.cognitiveState.discardedCandidateIds);
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "shadow-mode-summary" && evidence.data.sessionLearning != null));
  assert.equal(shadow.cognitiveStateInitial.temporaryKnowledge.sessionLearning, undefined);
});


test("runORCShadowMode exposes adaptive priority in summary and evidence", () => {
  const baseline = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(baseline, null);
  const initial = recordExploredOpportunity(createInitialCognitiveState("2026-06-25T00:00:00.000Z"), baseline.opportunities[0]?.id ?? "missing");
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z", cognitiveState: initial });
  assert.notEqual(shadow, null);
  assert.equal(shadow.summary.adaptivePriority.promoted, 0);
  assert.ok(shadow.summary.adaptivePriority.unchanged >= 0);
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "adaptive-priority-adjustment"));
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "shadow-mode-summary" && evidence.data.adaptivePriority != null));
});


test("runORCShadowMode exposes adaptive search-space summary and evidence", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(shadow, null);
  assert.equal(shadow.summary.adaptiveSearchSpace.generated, shadow.searchSpaces.length);
  assert.equal(typeof shadow.summary.adaptiveSearchSpace.averageSize, "number");
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "adaptive-search-space-built"));
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "shadow-mode-summary" && evidence.data.adaptiveSearchSpace != null));
});

test("runORCShadowMode exposes strategy candidate summary and evidence", () => {
  const shadow = runORCShadowMode(minimalInput(), { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(shadow, null);
  assert.equal(shadow.summary.strategyCandidates.generated, shadow.candidates.length);
  assert.equal(typeof shadow.summary.strategyCandidates.averageCandidatesPerSearchSpace, "number");
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "strategy-candidate-generated"));
  assert.ok(shadow.evidence.some((evidence) => evidence.kind === "shadow-mode-summary" && evidence.data.strategyCandidates != null));
});
