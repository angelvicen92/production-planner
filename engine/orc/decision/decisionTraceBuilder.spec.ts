import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, OperationalState } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import type { DecisionPipelineInput } from "./decisionPipelineOrchestrator";
import { executeDecisionPipeline } from "./decisionPipelineOrchestrator";
import { buildDecisionTrace } from "./decisionTraceBuilder";

const state = (): OperationalState => ({
  id: "state:trace", planId: 1, workDay: null, planning: [], tasks: [], resources: [],
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {},
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput", schemaVersion: "ORC-SPEC-01",
});

const candidate = (id: string): Candidate => ({
  id,
  state: { status: "draft", evidenceIds: [], metadata: {} },
  assignments: [], operationalValues: [], evidenceIds: [],
  metadata: { strategy: "COMPACT_REGION", sourceOpportunityId: "opp:trace", expectedImpact: "compact-affected-region", estimatedCost: "low", confidence: 0.66 },
});

const input = (candidates: Candidate[]): DecisionPipelineInput => ({
  operationalState: state(),
  candidates,
  evidence: [],
  metadata: { searchSpaces: candidates.length === 0 ? 0 : 1, opportunities: candidates.length === 0 ? 0 : 1 },
  createdAt: "2026-06-27T00:00:00.000Z",
});

test("buildDecisionTrace consolidates an empty pipeline into stage evidence arrays", () => {
  const pipeline = executeDecisionPipeline(input([]));
  const trace = buildDecisionTrace(pipeline);

  assert.equal(trace.decisionId, "decision:state:trace");
  assert.equal(trace.generatedAt, "2026-06-27T00:00:00.000Z");
  assert.equal(trace.summary.length, 12);
  assert.deepEqual(Object.values(trace.stages).map((evidence) => evidence.length), [0, 0, 0, 0, 0, 0]);
});

test("buildDecisionTrace consolidates all stage evidence from a complete pipeline", () => {
  const pipeline = executeDecisionPipeline(input([candidate("candidate:trace")]));
  const trace = buildDecisionTrace(pipeline);

  assert.deepEqual(trace.stages.transformation, pipeline.transformation.evidence);
  assert.deepEqual(trace.stages.simulation, pipeline.simulation.evidence);
  assert.deepEqual(trace.stages.validation, pipeline.validation.evidence);
  assert.deepEqual(trace.stages.evaluation, pipeline.evaluation.evidence);
  assert.deepEqual(trace.stages.ranking, pipeline.ranking.evidence);
  assert.deepEqual(trace.stages.commit, pipeline.commit.evidence);
  assert.deepEqual(trace.summary, pipeline.evidence);
});

test("buildDecisionTrace is deterministic and structurally equal for equivalent pipelines", () => {
  const first = executeDecisionPipeline(input([candidate("candidate:trace")]));
  const second = executeDecisionPipeline(input([candidate("candidate:trace")]));

  assert.equal(structuralEquals(first.decisionTrace, second.decisionTrace), true);
  assert.equal(stableStringify(first.decisionTrace), stableStringify(second.decisionTrace));
});

test("buildDecisionTrace does not mutate the pipeline result", () => {
  const pipeline = executeDecisionPipeline(input([candidate("candidate:trace")]));
  const before = stableStringify(pipeline);

  buildDecisionTrace(pipeline);

  assert.equal(stableStringify(pipeline), before);
});

test("DecisionTrace is JSON serializable", () => {
  const { decisionTrace } = executeDecisionPipeline(input([candidate("candidate:trace")]));

  assert.deepEqual(JSON.parse(JSON.stringify(decisionTrace)), decisionTrace);
});

test("executeDecisionPipeline returns the same trace as buildDecisionTrace", () => {
  const pipeline = executeDecisionPipeline(input([candidate("candidate:trace")]));

  assert.deepEqual(pipeline.decisionTrace, buildDecisionTrace(pipeline));
});
