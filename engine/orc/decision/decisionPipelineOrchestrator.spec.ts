import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, OperationalState } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import type { DecisionPipelineInput } from "./decisionPipelineOrchestrator";
import { executeDecisionPipeline } from "./decisionPipelineOrchestrator";

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

const input = (candidates: Candidate[]): DecisionPipelineInput => ({
  operationalState: state(),
  candidates,
  evidence: [],
  metadata: { searchSpaces: candidates.length === 0 ? 0 : 1, opportunities: candidates.length === 0 ? 0 : 1 },
  createdAt: "2026-06-27T00:00:00.000Z",
});

test("executeDecisionPipeline handles empty DecisionInput", () => {
  const result = executeDecisionPipeline(input([]));
  assert.equal(result.transformation.summary.transformedCount, 0);
  assert.equal(result.simulation.summary.simulatedCount, 0);
  assert.equal(result.validation.summary.validCount, 0);
  assert.equal(result.evaluation.summary.evaluatedCount, 0);
  assert.equal(result.ranking.summary.rankedCount, 0);
  assert.equal(result.commit.summary.commitCount, 0);
});

test("executeDecisionPipeline processes one candidate through every stage", () => {
  const result = executeDecisionPipeline(input([candidate("candidate:1")]));
  assert.equal(result.transformation.candidateStates.length, 1);
  assert.equal(result.simulation.simulatedStates.length, 1);
  assert.equal(result.validation.validationResults.length, 1);
  assert.equal(result.evaluation.operationalValues.length, 1);
  assert.equal(result.ranking.rankedOperationalValues.length, 1);
  assert.equal(result.commit.commitDecisions.length, 1);
  assert.equal(result.commit.commitDecisions[0].decision, "COMMIT");
});

test("executeDecisionPipeline processes multiple candidates deterministically", () => {
  const result = executeDecisionPipeline(input([candidate("candidate:2", "SCHEDULE_PENDING_TASKS"), candidate("candidate:1", "COMPACT_REGION")]));
  assert.equal(result.transformation.candidateStates.length, 2);
  assert.equal(result.simulation.simulatedStates.length, 2);
  assert.equal(result.validation.summary.validCount, 2);
  assert.equal(result.ranking.summary.rankedCount, 2);
  assert.equal(result.commit.summary.commitCount, 2);
});

test("executeDecisionPipeline is deterministic and structurally equal", () => {
  const source = input([candidate("candidate:1"), candidate("candidate:2", "SCHEDULE_PENDING_TASKS")]);
  const first = executeDecisionPipeline(source);
  const second = executeDecisionPipeline(source);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(first), stableStringify(second));
});

test("executeDecisionPipeline result is JSON serializable", () => {
  const result = executeDecisionPipeline(input([candidate("candidate:1")]));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("executeDecisionPipeline does not mutate input", () => {
  const source = input([candidate("candidate:1")]);
  const before = stableStringify(source);
  executeDecisionPipeline(source);
  assert.equal(stableStringify(source), before);
});

test("executeDecisionPipeline records stage start and end evidence with contracts and counts", () => {
  const result = executeDecisionPipeline(input([candidate("candidate:1")]));
  assert.equal(result.evidence.length, 12);
  assert.deepEqual(result.evidence.map((item) => item.data.boundary), ["start", "end", "start", "end", "start", "end", "start", "end", "start", "end", "start", "end"]);
  assert.equal(result.evidence.every((item) => item.source === "orc-decision-pipeline-orchestrator"), true);
  assert.equal(result.evidence.every((item) => typeof item.data.contracts === "object" && typeof item.data.counts === "object"), true);
});

