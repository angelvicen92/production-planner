import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import type { SearchSpace } from "../contracts";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildCandidatesFromSearchSpaces } from "./candidateBuilder";

const input = (): EngineInput => ({
  planId: 96,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks: [
    { id: 1, planId: 96, templateId: 1, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7] },
    { id: 2, planId: 96, templateId: 2, status: "pending", contestantId: 1, zoneId: 10, spaceId: 11, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [7] },
  ],
  locks: [],
  optimizerMainZoneId: 10,
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [{ id: 7, resourceItemId: 70, typeId: 1, name: "R7", isAvailable: true }],
  resourceItemComponents: {},
  groupingZoneIds: [],
});

const state = () => buildOperationalStateFromEngineInput(input());

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

test("buildCandidatesFromSearchSpaces handles empty state and empty SearchSpace input", () => {
  const result = buildCandidatesFromSearchSpaces(state(), []);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.summary, { searchSpaceCount: 0, candidateCount: 0, duplicateCandidatesDiscarded: 0, truncatedByBudget: false });
});

test("buildCandidatesFromSearchSpaces creates abstract candidates for one SearchSpace", () => {
  const result = buildCandidatesFromSearchSpaces(state(), [space("one")], { createdAt: "2026-06-25T00:00:00.000Z" });
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(result.candidates.map((candidate) => candidate.metadata.strategy), ["CLOSE_MAIN_FLOW_GAP", "REORDER_LOCAL_SEQUENCE", "COMPACT_REGION"]);
  assert.equal(result.candidates.every((candidate) => candidate.assignments.length === 0), true);
  assert.equal(result.candidates.every((candidate) => candidate.metadata.readOnly === true && candidate.metadata.executesTransformations === false), true);
  assert.equal(result.evidence.length, 3);
  assert.equal(result.evidence[0].kind, "candidate-generated");
  assert.equal(result.evidence[0].createdAt, "2026-06-25T00:00:00.000Z");
});

test("buildCandidatesFromSearchSpaces creates candidates for multiple SearchSpaces in stable order", () => {
  const result = buildCandidatesFromSearchSpaces(state(), [space("one"), space("two", { metadata: { ...space("two").metadata, sourceOpportunityKind: "RESOURCE_PRESSURE", affectedRegion: "resource-pressure", allowedTransformations: ["RESOURCE_REASSIGNMENT_POSSIBLE"] } })]);
  assert.deepEqual(result.candidates.map((candidate) => candidate.metadata.sourceOpportunityId), ["op:one", "op:one", "op:one", "op:two"]);
  assert.equal(result.summary.candidateCount, 4);
});

test("buildCandidatesFromSearchSpaces discards duplicate equivalent candidates", () => {
  const duplicate = space("duplicate", { metadata: { ...space("duplicate").metadata, sourceOpportunityId: "op:one" } });
  const result = buildCandidatesFromSearchSpaces(state(), [space("one"), duplicate]);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.summary.duplicateCandidatesDiscarded, 3);
  assert.equal(result.evidence.filter((item) => item.kind === "candidate-duplicate-discarded").length, 3);
});

test("buildCandidatesFromSearchSpaces applies per-SearchSpace and global budgets", () => {
  const perSpace = buildCandidatesFromSearchSpaces(state(), [space("one")], { maxCandidatesPerSearchSpace: 2 });
  assert.equal(perSpace.candidates.length, 2);
  assert.equal(perSpace.summary.truncatedByBudget, true);
  assert.equal(perSpace.evidence.at(-1)?.kind, "candidate-budget-truncated");

  const global = buildCandidatesFromSearchSpaces(state(), [space("one"), space("two")], { maxCandidatesTotal: 4 });
  assert.equal(global.candidates.length, 4);
  assert.equal(global.summary.truncatedByBudget, true);
});

test("buildCandidatesFromSearchSpaces is deterministic, structurally equal, and does not mutate inputs", () => {
  const operationalState = state();
  const searchSpaces = [space("one"), space("two")];
  const beforeState = stableStringify(operationalState);
  const beforeSpaces = stableStringify(searchSpaces);
  const first = buildCandidatesFromSearchSpaces(operationalState, searchSpaces, { createdAt: null });
  const second = buildCandidatesFromSearchSpaces(operationalState, searchSpaces, { createdAt: null });
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(operationalState), beforeState);
  assert.equal(stableStringify(searchSpaces), beforeSpaces);
});
