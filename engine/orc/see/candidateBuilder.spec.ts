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
  assert.deepEqual(result.summary, { searchSpaceCount: 0, candidateCount: 0, duplicateCandidatesDiscarded: 0, truncatedByBudget: false, candidateBudget: { globalBudget: 20, allocatedBudget: 0, unusedBudget: 20, allocations: [] }, pruning: { generatedCount: 0, keptCount: 0, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] }, preselection: { generatedCandidates: 0, acceptedCandidates: 0, discardedCandidates: 0, limit: 0, partialPlans: { partialPlanCount: 0, discardedCompositionCount: 0, averageCompatibilityScore: 0 } } });
});

const operationalState = () => ({
  id: "state:baseline", planId: 1, workDay: { start: "09:00", end: "10:00" },
  planning: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [10], spaceId: 1 }],
  tasks: [], resources: [], spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [] },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {},
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput", schemaVersion: "ORC-SPEC-01",
} as const);

test("buildCandidates creates baseline preservation candidate when no search spaces but seeded planning exists", () => {
  const result = buildCandidates([], { operationalState: operationalState() as any, createdAt: "2026-06-30T00:00:00.000Z" });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].metadata.baselinePreservation, true);
  assert.equal(result.candidates[0].metadata.strategy, "PRESERVE_BASELINE");
  assert.equal(result.candidates[0].metadata.planningInfluence, "none");
  assert.equal(result.candidates[0].assignments.length, 0);
  assert.equal(result.evidence[0].kind, "baseline-preservation-candidate-generated");
  assert.equal(result.evidence[0].data.plannedTaskCount, 1);
  assert.equal(result.summary.candidateCount, 1);
});

test("buildCandidates creates abstract candidates for one SearchSpace", () => {
  const result = buildCandidates([space("one")]);
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(result.candidates.map((candidate) => candidate.metadata.strategy), ["CLOSE_MAIN_FLOW_GAP", "REORDER_LOCAL_SEQUENCE", "COMPACT_REGION"]);
  assert.equal(result.candidates.every((candidate) => candidate.assignments.length === 0), true);
  assert.equal(result.candidates.every((candidate) => Array.isArray(candidate.metadata.transformations) && (candidate.metadata.transformations as unknown[]).length > 1), true);
  assert.equal(result.candidates.every((candidate) => candidate.metadata.readOnly === true && candidate.metadata.executesTransformations === false), true);
  assert.equal(result.evidence.filter((item) => item.kind === "candidate-generated").length, 3);
  const generatedEvidence = result.evidence.find((item) => item.kind === "candidate-generated");
  assert.equal(generatedEvidence?.createdAt, null);
  assert.equal(typeof generatedEvidence?.data.originSearchSpace, "object");
  assert.equal(typeof result.evidence[0].data.allocatedBudget, "number");
  assert.equal(typeof generatedEvidence?.data.generatedCandidate, "object");
});

test("buildCandidates creates candidates for multiple SearchSpaces in stable order", () => {
  const result = buildCandidates([space("one"), space("two", { metadata: { ...space("two").metadata, sourceOpportunityKind: "RESOURCE_PRESSURE", affectedRegion: "resource-pressure", allowedTransformations: ["RESOURCE_REASSIGNMENT_POSSIBLE"] } })]);
  assert.deepEqual(result.candidates.map((candidate) => candidate.metadata.sourceOpportunityId), ["op:one", "op:one", "op:one", "op:two", "op:two"]);
  assert.equal(result.summary.candidateCount, 5);
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


test("buildCandidates allocates candidate budget by SearchSpace priority", () => {
  const result = buildCandidates([
    space("low", { metadata: { ...space("low").metadata, sourceOpportunityPriority: 1 } }),
    space("high", { metadata: { ...space("high").metadata, sourceOpportunityPriority: 100 } }),
  ]);
  const low = result.summary.candidateBudget.allocations.find((item) => item.searchSpaceId === "low");
  const high = result.summary.candidateBudget.allocations.find((item) => item.searchSpaceId === "high");
  assert.ok(low != null && high != null);
  assert.equal(result.summary.candidateBudget.globalBudget, 20);
  assert.equal(result.summary.candidateBudget.allocatedBudget, 20);
  assert.ok(high.allocatedBudget > low.allocatedBudget);
  assert.equal(result.evidence.filter((item) => item.kind === "candidate-budget-allocated").length, 2);
});

test("buildCandidates preserves stable tie allocation order", () => {
  const result = buildCandidates([space("a", { metadata: { ...space("a").metadata, sourceOpportunityPriority: 10 } }), space("b", { metadata: { ...space("b").metadata, sourceOpportunityPriority: 10 } }), space("c", { metadata: { ...space("c").metadata, sourceOpportunityPriority: 10 } })]);
  assert.deepEqual(result.summary.candidateBudget.allocations.map((item) => [item.searchSpaceId, item.allocatedBudget]), [["a", 7], ["b", 7], ["c", 6]]);
});

test("buildCandidates uses sourceOperationalPriority before opportunity priority", () => {
  const result = buildCandidates([
    space("operational", { metadata: { ...space("operational").metadata, sourceOpportunityPriority: 1, sourceOperationalPriority: { id: "resource:1", priorityScore: 200, explanation: "critical" } } }),
    space("opportunity", { metadata: { ...space("opportunity").metadata, sourceOpportunityPriority: 100 } }),
  ]);
  const [operational, opportunity] = result.summary.candidateBudget.allocations;
  assert.equal(operational.priority, 200);
  assert.ok(operational.allocatedBudget > opportunity.allocatedBudget);
});
