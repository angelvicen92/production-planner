import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, OperationalState } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildCandidateStates } from "./transformationEngine";

const state = (): OperationalState => ({
  id: "state:test", planId: 1, workDay: null, planning: [], tasks: [], resources: [],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {},
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput", schemaVersion: "ORC-SPEC-01",
});

const candidate = (id: string, strategy = "COMPACT_REGION"): Candidate => ({
  id,
  state: { status: "draft", evidenceIds: [], metadata: {} },
  assignments: [], operationalValues: [], evidenceIds: [],
  metadata: { strategy, sourceOpportunityId: "opp:1", expectedImpact: "compact-affected-region", estimatedCost: "low", confidence: 0.66 },
});

test("buildCandidateStates handles empty candidates", () => {
  const result = buildCandidateStates(state(), [], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.deepEqual(result.candidateStates, []);
  assert.equal(result.summary.candidateCount, 0);
  assert.equal(result.summary.transformedCount, 0);
  assert.equal(result.summary.truncatedByBudget, false);
});

test("buildCandidateStates converts multiple candidates into immutable abstract states", () => {
  const result = buildCandidateStates(state(), [candidate("candidate:1", "COMPACT_REGION"), candidate("candidate:2", "SCHEDULE_PENDING_TASKS")], { createdAt: null });
  assert.equal(result.candidateStates.length, 2);
  assert.equal(result.candidateStates[0].candidateId, "candidate:1");
  assert.equal(result.candidateStates[0].plannedTransformations[0].kind, "COMPACT_REGION");
  assert.equal(result.candidateStates[1].plannedTransformations[0].kind, "SCHEDULE_PENDING");
  assert.equal(Object.isFrozen(result.candidateStates[0]), true);
  assert.equal(Object.isFrozen(result.candidateStates[0].plannedTransformations), true);
  assert.equal(Object.isFrozen(result.candidateStates[0].plannedTransformations[0]), true);
});

test("buildCandidateStates applies budget deterministically and records evidence", () => {
  const result = buildCandidateStates(state(), [candidate("candidate:1"), candidate("candidate:2")], { maxTransformations: 1, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(result.candidateStates.length, 1);
  assert.equal(result.summary.truncatedByBudget, true);
  assert.equal(result.evidence.some((item) => item.kind === "candidate-state-budget-truncated"), true);
  assert.equal(result.evidence[0].data.candidateId, "candidate:1");
  assert.equal(result.evidence[0].data.createdAt, undefined);
  assert.equal(result.evidence[0].createdAt, "2026-06-25T00:00:00.000Z");
});

test("buildCandidateStates is deterministic and structurally equal for identical input", () => {
  const input = [candidate("candidate:1", "REORDER_LOCAL_SEQUENCE")];
  const first = buildCandidateStates(state(), input, { createdAt: "fixed" });
  const second = buildCandidateStates(state(), input, { createdAt: "fixed" });
  assert.equal(structuralEquals(first, second), true);
});

test("buildCandidateStates does not mutate OperationalState or candidates", () => {
  const operationalState = state();
  const candidates = [candidate("candidate:1")];
  const beforeState = stableStringify(operationalState);
  const beforeCandidates = stableStringify(candidates);
  buildCandidateStates(operationalState, candidates, { createdAt: null });
  assert.equal(stableStringify(operationalState), beforeState);
  assert.equal(stableStringify(candidates), beforeCandidates);
});
