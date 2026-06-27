import assert from "node:assert/strict";
import test from "node:test";
import type { Opportunity } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { classifyOpportunities } from "../analysis/opportunityClassificationEngine";
import { prioritizeOpportunities } from "../analysis/opportunityPrioritizationEngine";
import { buildSearchSpaces } from "./searchSpaceBuilder";

const opportunity = (kind: string, taskIds = [1, 2, 3], priority = 50): Opportunity => ({
  id: `op:${kind}`,
  kind,
  description: kind,
  taskIds,
  searchSpaceIds: [],
  evidenceIds: [],
  metadata: { priority },
});

const prioritize = (opportunities: Opportunity[]) => prioritizeOpportunities(classifyOpportunities(opportunities).opportunities).opportunities;

const one = (kind: string, taskIds?: number[]) => {
  return buildSearchSpaces(prioritize([opportunity(kind, taskIds)]), { createdAt: "2026-06-25T00:00:00.000Z" });
};

test("buildSearchSpaces returns empty arrays and valid summary without opportunities", () => {
  const result = buildSearchSpaces([]);
  assert.deepEqual(result.searchSpaces, []);
  assert.deepEqual(result.evidence, []);
  assert.equal(result.summary.opportunityCount, 0);
  assert.equal(result.summary.searchSpaceCount, 0);
  assert.equal(structuralEquals(result, JSON.parse(JSON.stringify(result))), true);
});

for (const [kind, region, transformations] of [
  ["MAIN_FLOW_GAP", "configured-main-flow", ["MOVE_CHAIN_POSSIBLE", "REORDER_REGION_POSSIBLE", "COMPACT_REGION_POSSIBLE"]],
  ["UNPLANNED_PENDING_TASKS", "unplanned-pending-tasks", ["SCHEDULE_PENDING_TASKS_POSSIBLE"]],
  ["RESOURCE_PRESSURE", "resource-pressure", ["RESOURCE_REASSIGNMENT_POSSIBLE"]],
  ["EXCESSIVE_TALENT_STAY", "affected-contestant-schedule", ["COMPACT_REGION_POSSIBLE", "REORDER_REGION_POSSIBLE"]],
  ["LOCK_PRESSURE", "active-locks", ["LOCK_CONSTRAINED_EXPLORATION"]],
  ["FRAGMENTATION", "fragmented-talent-or-space-region", ["COMPACT_REGION_POSSIBLE", "REORDER_REGION_POSSIBLE"]],
] as const) {
  test(`buildSearchSpaces maps ${kind} to a read-only search space`, () => {
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

test("buildSearchSpaces applies maxSearchSpaces budget and emits skipped evidence", () => {
  const result = buildSearchSpaces(prioritize([opportunity("MAIN_FLOW_GAP", [1], 100), opportunity("RESOURCE_PRESSURE", [2], 90)]), { maxSearchSpaces: 1 });
  assert.equal(result.searchSpaces.length, 1);
  assert.equal(result.summary.skippedOpportunityCount, 1);
  assert.equal(result.evidence.at(-1)?.kind, "search-space-skipped");
});

test("buildSearchSpaces applies maxTransformationsPerSpace budget", () => {
  const result = one("MAIN_FLOW_GAP");
  const limited = buildSearchSpaces(prioritize([opportunity("MAIN_FLOW_GAP")]), { maxTransformationsPerSpace: 2 });
  assert.equal((result.searchSpaces[0].metadata.allowedTransformations as unknown[]).length, 3);
  assert.deepEqual(limited.searchSpaces[0].metadata.allowedTransformations, ["MOVE_CHAIN_POSSIBLE", "REORDER_REGION_POSSIBLE"]);
});

test("buildSearchSpaces applies maxAffectedTasksPerSpace budget", () => {
  const result = one("FRAGMENTATION", [3, 1, 2]);
  const limited = buildSearchSpaces(prioritize([opportunity("FRAGMENTATION", [3, 1, 2])]), { maxAffectedTasksPerSpace: 2 });
  assert.deepEqual(result.searchSpaces[0].taskIds, [1, 2, 3]);
  assert.deepEqual(limited.searchSpaces[0].taskIds, [1, 2]);
  assert.equal(limited.searchSpaces[0].metadata.truncatedAffectedTasks, true);
});

test("buildSearchSpaces is deterministic and does not mutate inputs", () => {
  const opportunities = [opportunity("RESOURCE_PRESSURE", [2], 80), opportunity("MAIN_FLOW_GAP", [1], 100)];
  const beforeOps = stableStringify(opportunities);
  const prioritized = prioritize(opportunities);
  const beforePrioritized = stableStringify(prioritized);
  const first = buildSearchSpaces(prioritized, { createdAt: null });
  const second = buildSearchSpaces(prioritized, { createdAt: null });
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(prioritized), beforePrioritized);
  assert.equal(stableStringify(opportunities), beforeOps);
  assert.deepEqual(first.searchSpaces.map((space) => space.metadata.sourceOpportunityKind), ["MAIN_FLOW_GAP", "RESOURCE_PRESSURE"]);
  assert.equal(first.searchSpaces.some((space) => space.candidates.length > 0), false);
});
