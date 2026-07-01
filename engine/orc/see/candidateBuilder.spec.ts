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
  assert.equal(result.summary.searchSpaceCount, 0);
  assert.equal(result.summary.candidateCount, 0);
  assert.equal(result.summary.mainFlowGapClosure.executed, false);
  assert.equal(result.summary.mainFlowGapClosure.skippedReason, "no_search_spaces");
  assert.equal(result.summary.mainFlowGapClosure.generatedCandidateCount, 0);
  assert.equal(result.summary.mainFlowGapClosure.planningInfluence, "candidate-generation-diagnostics-only");
  assert.deepEqual(result.summary.baselineSafety, { generated: false, candidateId: null, reason: null, planningCount: 0, searchSpaceCount: 0, readOnly: true, planningInfluence: "none" });
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


test("buildCandidates exposes hard prefilter summary and preserves abstract/baseline candidates", () => {
  const result = buildCandidates([space("one")]);
  assert.equal(result.summary.hardPrefilter.receivedCandidateCount, 3);
  assert.equal(result.summary.hardPrefilter.acceptedCandidateCount, 3);
  assert.equal(result.summary.hardPrefilter.discardedCandidateCount, 0);
  assert.equal(result.evidence.some((item) => item.kind === "candidate-hard-prefilter-summary"), true);

  const baseline = buildCandidates([], { operationalState: operationalState() as any });
  assert.equal(baseline.candidates[0].metadata.baselinePreservation, true);
  assert.equal(baseline.summary.hardPrefilter.acceptedCandidateCount, 1);
});

test("buildCandidates runs hard prefilter before preselection and removes invalid assignments from DecisionInput candidates", () => {
  const os = {
    ...operationalState(),
    planning: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [10], spaceId: 1 },
      { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [20], spaceId: 2 },
    ],
    tasks: [
      { id: 1, status: "pending", contestantId: 7, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [10], spaceId: 1 },
      { id: 2, status: "pending", contestantId: 7, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [20], spaceId: 2 },
    ],
  } as any;
  const result = buildCandidates([space("invalid", { taskIds: [1], metadata: { ...space("invalid").metadata, allowedTransformations: ["PENDING"] } })], { operationalState: os });
  assert.equal(result.summary.hardPrefilter.discardedCandidateCount > 0, true);
  assert.equal(result.candidates.some((item) => item.assignments.some((assignment) => assignment.taskId === 1 && assignment.startPlanned === "09:30")), false);
  assert.equal(result.summary.preselection.generatedCandidates, result.summary.hardPrefilter.acceptedCandidateCount);
});

test("buildCandidates adds baseline safety candidate with search spaces and seeded planning without consuming improvement budget", () => {
  const result = buildCandidates([space("one")], { operationalState: operationalState() as any, maxPreselectedCandidates: 1, createdAt: "2026-06-30T00:00:00.000Z" });
  const safety = result.candidates.find((candidate) => candidate.metadata.baselineSafetyCandidate === true);
  assert.ok(safety);
  assert.equal(safety.metadata.baselinePreservation, true);
  assert.equal(safety.metadata.strategy, "PRESERVE_BASELINE");
  assert.equal(safety.metadata.planningInfluence, "none");
  assert.equal(safety.metadata.readOnly, true);
  assert.equal(safety.assignments.length, 0);
  assert.equal(result.summary.preselection.acceptedCandidates, 1);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.summary.baselineSafety.generated, true);
  assert.equal(result.summary.baselineSafety.candidateId, safety.id);
  assert.equal(result.summary.baselineSafety.planningCount, 1);
  assert.equal(result.evidence.some((item) => item.kind === "baseline-safety-candidate-generated"), true);
});

test("buildCandidates does not add baseline safety candidate when search spaces exist without seeded planning", () => {
  const result = buildCandidates([space("one")], { operationalState: { ...(operationalState() as any), planning: [] } });
  assert.equal(result.candidates.some((candidate) => candidate.metadata.baselineSafetyCandidate === true), false);
  assert.equal(result.summary.baselineSafety.generated, false);
  assert.equal(result.summary.baselineSafety.candidateId, null);
});


test("buildCandidates integrates executable main-flow gap candidates before baseline safety", () => {
  const os = {
    ...operationalState(),
    workDay: { start: "09:00", end: "18:00" },
    planning: [
      { taskId: 1, startPlanned: "10:20", endPlanned: "10:35", assignedResourceIds: [10], spaceId: 7 },
      { taskId: 2, startPlanned: "13:25", endPlanned: "13:40", assignedResourceIds: [11], spaceId: 7 },
    ],
    tasks: [{ id: 1, status: "pending", spaceId: 7 }, { id: 2, status: "pending", spaceId: 7 }],
    resources: [{ id: 10 }, { id: 11 }],
    spaces: { parentById: {}, nameById: { 7: "Estudio 7" }, capacityById: { 7: 1 }, concurrencyById: { 7: 1 }, exclusiveById: { 7: true }, priorityById: {} },
    availability: { ...operationalState().availability, contestantAvailabilityById: {} },
    constraints: { optimizer: { mainZoneId: 7 } },
  } as any;
  const result = buildCandidates([space("gap")], { operationalState: os, maxPreselectedCandidates: 10 });
  assert.equal(result.summary.mainFlowGapClosure.generated, 1);
  assert.equal(result.summary.mainFlowGapClosure.acceptedBeforePrefilter, 1);
  assert.equal(result.candidates.some((candidate) => candidate.metadata.mainFlowGapClosureCandidate === true && candidate.metadata.executesTransformations === true), true);
  assert.equal(result.candidates.some((candidate) => candidate.metadata.baselinePreservation === true), true);
  assert.equal(result.evidence.some((item) => item.kind === "main-flow-gap-closure-candidate-generated"), true);
});

test("buildCandidates summarizes and prioritizes baseline overlap repair before main-flow gap closure", () => {
  const os = {
    ...(operationalState() as any),
    workDay: { start: "09:00", end: "12:00" },
    planning: [
      { taskId: 10, startPlanned: "10:20", endPlanned: "10:35", assignedResourceIds: [1], spaceId: 7, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
      { taskId: 20, startPlanned: "10:05", endPlanned: "10:50", assignedResourceIds: [2], spaceId: 7, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
    ],
    tasks: [
      { id: 10, status: "pending", assignedResourceIds: [1], spaceId: 7 },
      { id: 20, status: "pending", assignedResourceIds: [2], spaceId: 7 },
    ],
    spaces: { parentById: {}, nameById: { 7: "Studio" }, capacityById: { 7: 1 }, concurrencyById: { 7: 1 }, exclusiveById: { 7: true }, priorityById: {} },
    constraints: { optimizer: { mainZoneId: 7 } },
  };
  const result = buildCandidates([space("repair")], { operationalState: os, maxPreselectedCandidates: 10 });
  assert.equal(result.summary.baselineOverlapRepair.generatedCandidateCount, 2);
  assert.equal(result.summary.baselineOverlapRepair.assignmentCount, 2);
  assert.equal(result.summary.mainFlowGapClosure.skippedReason, "baseline_overlap_repair_priority");
  assert.equal(result.candidates.some((c) => c.metadata.baselineSafetyCandidate === true), true);
  const repair = result.candidates.find((c) => c.metadata.baselineRepairCandidate === true);
  assert.equal(repair?.metadata.executesTransformations, true);
});
