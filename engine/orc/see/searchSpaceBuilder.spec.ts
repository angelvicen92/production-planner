import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import type { Opportunity } from "../contracts";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { buildOperationalMap } from "./operationalMap";
import { buildSearchSpacesForOpportunities } from "./searchSpaceBuilder";

const input = (): EngineInput => ({
  planId: 95,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks: [
    { id: 1, planId: 95, templateId: 1, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7] },
    { id: 2, planId: 95, templateId: 2, status: "pending", contestantId: 1, zoneId: 10, spaceId: 11, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [7] },
    { id: 3, planId: 95, templateId: 3, status: "pending", contestantId: 1, zoneId: 10, spaceId: 12, startPlanned: "11:00", endPlanned: "11:30", assignedResourceIds: [8] },
    { id: 4, planId: 95, templateId: 4, status: "pending", contestantId: 2 },
    { id: 5, planId: 95, templateId: 5, status: "in_progress", contestantId: 2, startPlanned: "09:00", endPlanned: "10:00" },
  ],
  locks: [{ id: 1, planId: 95, taskId: 5, lockType: "time", lockedStart: "09:00", lockedEnd: "10:00" }],
  optimizerMainZoneId: 10,
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [
    { id: 7, resourceItemId: 70, typeId: 1, name: "R7", isAvailable: true },
    { id: 8, resourceItemId: 80, typeId: 1, name: "R8", isAvailable: true },
  ],
  resourceItemComponents: {},
  groupingZoneIds: [],
});

const opportunity = (kind: string, taskIds = [1, 2, 3], priority = 50): Opportunity => ({
  id: `op:${kind}`,
  kind,
  description: kind,
  taskIds,
  searchSpaceIds: [],
  evidenceIds: [],
  metadata: { priority },
});

const fixture = () => {
  const state = buildOperationalStateFromEngineInput(input());
  const map = buildOperationalMap(state);
  return { state, map };
};

const one = (kind: string, taskIds?: number[]) => {
  const { state, map } = fixture();
  return buildSearchSpacesForOpportunities(state, map, [opportunity(kind, taskIds)], { createdAt: "2026-06-25T00:00:00.000Z" });
};

test("buildSearchSpacesForOpportunities returns empty arrays and valid summary without opportunities", () => {
  const { state, map } = fixture();
  const result = buildSearchSpacesForOpportunities(state, map, []);
  assert.deepEqual(result.searchSpaces, []);
  assert.deepEqual(result.evidence, []);
  assert.equal(result.summary.opportunityCount, 0);
  assert.equal(result.summary.searchSpaceCount, 0);
});

for (const [kind, region, transformations] of [
  ["MAIN_FLOW_GAP", "configured-main-flow", ["MOVE_CHAIN_POSSIBLE", "REORDER_REGION_POSSIBLE", "COMPACT_REGION_POSSIBLE"]],
  ["UNPLANNED_PENDING_TASKS", "unplanned-pending-tasks", ["SCHEDULE_PENDING_TASKS_POSSIBLE"]],
  ["RESOURCE_PRESSURE", "resource-pressure", ["RESOURCE_REASSIGNMENT_POSSIBLE"]],
  ["EXCESSIVE_TALENT_STAY", "affected-contestant-schedule", ["COMPACT_REGION_POSSIBLE", "REORDER_REGION_POSSIBLE"]],
  ["LOCK_PRESSURE", "active-locks", ["LOCK_CONSTRAINED_EXPLORATION"]],
  ["FRAGMENTATION", "fragmented-talent-or-space-region", ["COMPACT_REGION_POSSIBLE", "REORDER_REGION_POSSIBLE"]],
] as const) {
  test(`buildSearchSpacesForOpportunities maps ${kind} to a read-only search space`, () => {
    const result = one(kind);
    assert.equal(result.searchSpaces.length, 1);
    const space = result.searchSpaces[0];
    assert.equal(space.metadata.sourceOpportunityKind, kind);
    assert.equal(space.metadata.affectedRegion, region);
    assert.deepEqual(space.metadata.allowedTransformations, transformations);
    assert.deepEqual(space.candidates, []);
    assert.equal(space.metadata.readOnly, true);
    assert.equal(result.evidence[0].createdAt, "2026-06-25T00:00:00.000Z");
  });
}

test("buildSearchSpacesForOpportunities applies maxSearchSpaces budget and emits skipped evidence", () => {
  const { state, map } = fixture();
  const result = buildSearchSpacesForOpportunities(state, map, [opportunity("MAIN_FLOW_GAP", [1], 100), opportunity("RESOURCE_PRESSURE", [2], 90)], { maxSearchSpaces: 1 });
  assert.equal(result.searchSpaces.length, 1);
  assert.equal(result.summary.skippedOpportunityCount, 1);
  assert.equal(result.evidence.at(-1)?.kind, "search-space-skipped");
});

test("buildSearchSpacesForOpportunities applies maxTransformationsPerSpace budget", () => {
  const result = one("MAIN_FLOW_GAP");
  const limited = buildSearchSpacesForOpportunities(fixture().state, fixture().map, [opportunity("MAIN_FLOW_GAP")], { maxTransformationsPerSpace: 2 });
  assert.equal((result.searchSpaces[0].metadata.allowedTransformations as unknown[]).length, 3);
  assert.deepEqual(limited.searchSpaces[0].metadata.allowedTransformations, ["MOVE_CHAIN_POSSIBLE", "REORDER_REGION_POSSIBLE"]);
});

test("buildSearchSpacesForOpportunities applies maxAffectedTasksPerSpace budget", () => {
  const result = one("FRAGMENTATION", [3, 1, 2]);
  const limited = buildSearchSpacesForOpportunities(fixture().state, fixture().map, [opportunity("FRAGMENTATION", [3, 1, 2])], { maxAffectedTasksPerSpace: 2 });
  assert.deepEqual(result.searchSpaces[0].taskIds, [1, 2, 3]);
  assert.deepEqual(limited.searchSpaces[0].taskIds, [1, 2]);
  assert.equal(limited.searchSpaces[0].metadata.truncatedAffectedTasks, true);
});

test("buildSearchSpacesForOpportunities is deterministic and does not mutate inputs", () => {
  const { state, map } = fixture();
  const opportunities = [opportunity("RESOURCE_PRESSURE", [2], 80), opportunity("MAIN_FLOW_GAP", [1], 100)];
  const beforeState = stableStringify(state);
  const beforeOps = stableStringify(opportunities);
  const first = buildSearchSpacesForOpportunities(state, map, opportunities, { createdAt: null });
  const second = buildSearchSpacesForOpportunities(state, map, opportunities, { createdAt: null });
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(state), beforeState);
  assert.equal(stableStringify(opportunities), beforeOps);
  assert.deepEqual(first.searchSpaces.map((space) => space.metadata.sourceOpportunityKind), ["MAIN_FLOW_GAP", "RESOURCE_PRESSURE"]);
  assert.equal(first.searchSpaces.some((space) => space.candidates.length > 0), false);
});
