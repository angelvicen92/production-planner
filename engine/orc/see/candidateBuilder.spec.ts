import assert from "node:assert/strict";
import test from "node:test";
import type { SearchSpace } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildCandidates } from "./candidateBuilder";

const space = (id: string, overrides: Partial<SearchSpace> = {}): SearchSpace => ({
  id,
  description: `space ${id}`,
  taskIds: [1, 2],
  candidates: [],
  evidenceIds: [],
  metadata: {
    readOnly: true,
    sourceOpportunityId: `op:${id}`,
    sourceOpportunityKind: "MAIN_FLOW_GAP",
    affectedRegion: "configured-main-flow",
    allowedTransformations: ["MOVE_CHAIN_POSSIBLE", "REORDER_REGION_POSSIBLE", "COMPACT_REGION_POSSIBLE"],
    executesTransformations: false,
  },
  ...overrides,
});

test("buildCandidates handles empty SearchSpace input", () => {
  const result = buildCandidates([]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.summary, { searchSpaceCount: 0, candidateCount: 0, duplicateCandidatesDiscarded: 0, truncatedByBudget: false, pruning: { generatedCount: 0, keptCount: 0, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] } });
});

test("buildCandidates creates abstract candidates for one SearchSpace", () => {
  const result = buildCandidates([space("one")]);
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(result.candidates.map((candidate) => candidate.metadata.strategy), ["CLOSE_MAIN_FLOW_GAP", "REORDER_LOCAL_SEQUENCE", "COMPACT_REGION"]);
  assert.equal(result.candidates.every((candidate) => candidate.assignments.length === 0), true);
  assert.equal(result.candidates.every((candidate) => candidate.metadata.readOnly === true && candidate.metadata.executesTransformations === false), true);
  assert.equal(result.evidence.filter((item) => item.kind === "candidate-generated").length, 3);
  assert.equal(result.evidence[0].kind, "candidate-generated");
  assert.equal(result.evidence[0].createdAt, null);
  assert.equal(typeof result.evidence[0].data.originSearchSpace, "object");
  assert.equal(typeof result.evidence[0].data.generatedCandidate, "object");
});

test("buildCandidates creates candidates for multiple SearchSpaces in stable order", () => {
  const result = buildCandidates([space("one"), space("two", { metadata: { ...space("two").metadata, sourceOpportunityKind: "RESOURCE_PRESSURE", affectedRegion: "resource-pressure", allowedTransformations: ["RESOURCE_REASSIGNMENT_POSSIBLE"] } })]);
  assert.deepEqual(result.candidates.map((candidate) => candidate.metadata.sourceOpportunityId), ["op:one", "op:one", "op:one", "op:two"]);
  assert.equal(result.summary.candidateCount, 4);
});

test("buildCandidates discards duplicate equivalent candidates", () => {
  const duplicate = space("duplicate", { metadata: { ...space("duplicate").metadata, sourceOpportunityId: "op:one" } });
  const result = buildCandidates([space("one"), duplicate]);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.summary.duplicateCandidatesDiscarded, 3);
  assert.equal(result.evidence.filter((item) => item.kind === "candidate-duplicate-discarded").length, 3);
});

test("buildCandidates returns a serializable result", () => {
  const result = buildCandidates([space("one")]);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.equal(result.summary.pruning.prunedCount, 0);
  assert.equal(result.summary.truncatedByBudget, false);
});

test("buildCandidates is deterministic, structurally equal, and does not mutate inputs", () => {
  const searchSpaces = [space("one"), space("two")];
  const beforeSpaces = stableStringify(searchSpaces);
  const first = buildCandidates(searchSpaces);
  const second = buildCandidates(searchSpaces);
  assert.equal(structuralEquals(first, second), true);
  assert.deepEqual(first, second);
  assert.equal(stableStringify(searchSpaces), beforeSpaces);
});
