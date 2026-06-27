import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, Evidence, OperationalValue } from "../contracts";
import type { CandidateBuilderResult } from "../see/candidateBuilder";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildDecisionInput } from "./decisionInput";
import { rankDecisionInput } from "./rankingEngine";

const value = (id: string, overallScore = 0): OperationalValue => ({
  simulatedStateId: id,
  continuity: 0,
  makespan: 0,
  permanence: 0,
  compaction: 0,
  resourcePressure: 0,
  robustness: 0,
  stability: 0,
  futureFreedom: 0,
  overallScore,
  breakdown: {},
  evaluatedAt: null,
  evidenceIds: [`evidence:${id}`],
  metadata: {},
});

const candidate = (id: string, sourceOpportunityId = "opportunity:1", operationalValues: OperationalValue[] = []): Candidate => ({
  id,
  state: { status: "draft", evidenceIds: [], metadata: {} },
  assignments: [],
  operationalValues,
  evidenceIds: [`evidence:${id}`],
  metadata: { sourceOpportunityId, sourceSearchSpaceId: `search-space:${id}`, strategy: "test" },
});

const evidence = (id: string): Evidence => ({
  id,
  source: "candidate-builder",
  kind: "candidate-generated",
  subjectId: id,
  createdAt: null,
  data: { id },
});

const result = (candidates: Candidate[]): CandidateBuilderResult => ({
  candidates,
  evidence: candidates.map((item) => evidence(`evidence:${item.id}`)),
  summary: {
    searchSpaceCount: new Set(candidates.map((item) => item.metadata.sourceSearchSpaceId)).size,
    candidateCount: candidates.length,
    duplicateCandidatesDiscarded: 0,
    truncatedByBudget: false,
    pruning: { generatedCount: candidates.length, keptCount: candidates.length, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] },
  },
});

test("buildDecisionInput handles empty input", () => {
  const input = buildDecisionInput(result([]));
  assert.deepEqual(input.candidates, []);
  assert.equal(input.metadata.searchSpaces, 0);
  assert.equal(input.metadata.opportunities, 0);
  assert.equal(input.evidence.at(-1)?.data.candidateCount, 0);
});

test("buildDecisionInput handles one candidate and records origin metadata", () => {
  const input = buildDecisionInput(result([candidate("candidate:1")]));
  assert.equal(input.candidates.length, 1);
  assert.deepEqual(input.metadata, { searchSpaces: 1, opportunities: 1 });
  assert.equal(input.evidence.at(-1)?.kind, "decision-input-built");
  assert.deepEqual(input.evidence.at(-1)?.data.candidateIds, ["candidate:1"]);
});

test("buildDecisionInput handles multiple candidates", () => {
  const input = buildDecisionInput(result([candidate("candidate:1", "opportunity:1"), candidate("candidate:2", "opportunity:2")]));
  assert.equal(input.candidates.length, 2);
  assert.equal(input.metadata.searchSpaces, 2);
  assert.equal(input.metadata.opportunities, 2);
});

test("rankDecisionInput is deterministic for the same DecisionInput", () => {
  const input = buildDecisionInput(result([candidate("candidate:low", "opportunity:1", [value("sim-low", 1)]), candidate("candidate:high", "opportunity:2", [value("sim-high", 2)])]));
  const first = rankDecisionInput(input, { createdAt: "2026-06-27T00:00:00.000Z" });
  const second = rankDecisionInput(input, { createdAt: "2026-06-27T00:00:00.000Z" });
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(first.rankedOperationalValues.map((item) => item.simulatedStateId), ["sim-high", "sim-low"]);
});

test("buildDecisionInput preserves structural equality after JSON serialization", () => {
  const input = buildDecisionInput(result([candidate("candidate:1", "opportunity:1", [value("sim-1", 1)])]));
  assert.deepEqual(JSON.parse(JSON.stringify(input)), input);
});

test("buildDecisionInput does not mutate CandidateBuilderResult input", () => {
  const source = result([candidate("candidate:1", "opportunity:1", [value("sim-1", 1)])]);
  const before = stableStringify(source);
  const input = buildDecisionInput(source);
  assert.equal(stableStringify(source), before);
  assert.notEqual(input.candidates, source.candidates);
  assert.notEqual(input.evidence, source.evidence);
});
