import assert from "node:assert/strict";
import test from "node:test";
import type { Opportunity } from "../contracts";
import type { OperationalPriorityMap } from "../analysis/operationalPriorityAnalyzer";
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


const priorityMap = (priorities: OperationalPriorityMap["priorities"]): OperationalPriorityMap => ({ priorities });

test("buildSearchSpaces uses an empty OperationalPriorityMap without changing legacy order", () => {
  const prioritized = prioritize([opportunity("MAIN_FLOW_GAP", [1], 100), opportunity("RESOURCE_PRESSURE", [2], 80)]);
  const result = buildSearchSpaces(prioritized, { operationalPriorityMap: priorityMap([]) });
  assert.deepEqual(result.searchSpaces.map((space) => space.metadata.sourceOpportunityKind), ["MAIN_FLOW_GAP", "RESOURCE_PRESSURE"]);
  assert.equal(result.summary.operationalPriorityCount, 0);
  assert.equal(result.summary.discardedPriorityCount, 0);
});

test("buildSearchSpaces starts with a single associated operational priority", () => {
  const prioritized = prioritize([opportunity("MAIN_FLOW_GAP", [1], 100), opportunity("RESOURCE_PRESSURE", [2], 80)]);
  const result = buildSearchSpaces(prioritized, {
    operationalPriorityMap: priorityMap([{ id: "resource:7", priorityScore: 999, bottlenecks: ["resource:7:overlap"], criticalResources: ["7"], activeConstraints: [], explanation: "resource first" }]),
  });
  assert.deepEqual(result.searchSpaces.map((space) => space.metadata.sourceOpportunityKind), ["RESOURCE_PRESSURE", "MAIN_FLOW_GAP"]);
  assert.deepEqual(result.searchSpaces[0].metadata.sourceOperationalPriority, { id: "resource:7", priorityScore: 999, explanation: "resource first" });
  assert.equal(result.evidence.find((item) => item.kind === "search-space-built")?.data.sourceOperationalPriority != null, true);
});

test("buildSearchSpaces respects multiple operational priorities before opportunity priority", () => {
  const prioritized = prioritize([
    opportunity("UNPLANNED_PENDING_TASKS", [3], 90),
    opportunity("RESOURCE_PRESSURE", [2], 80),
    opportunity("MAIN_FLOW_GAP", [1], 100),
  ]);
  const result = buildSearchSpaces(prioritized, {
    operationalPriorityMap: priorityMap([
      { id: "resource:1", priorityScore: 20, bottlenecks: ["resource:1:overlap"], criticalResources: ["1"], activeConstraints: [], explanation: "second" },
      { id: "continuity:pending-tasks", priorityScore: 30, bottlenecks: ["continuity:pending-tasks"], criticalResources: [], activeConstraints: [], explanation: "first" },
    ]),
  });
  assert.deepEqual(result.searchSpaces.map((space) => space.metadata.sourceOpportunityKind), ["UNPLANNED_PENDING_TASKS", "RESOURCE_PRESSURE", "MAIN_FLOW_GAP"]);
});

test("buildSearchSpaces orders tied operational priorities by id and records discarded priorities", () => {
  const prioritized = prioritize([opportunity("RESOURCE_PRESSURE", [2], 80), opportunity("LOCK_PRESSURE", [4], 60)]);
  const result = buildSearchSpaces(prioritized, {
    operationalPriorityMap: priorityMap([
      { id: "constraints:locks", priorityScore: 10, bottlenecks: ["constraints:locks"], criticalResources: [], activeConstraints: ["constraints:locks"], explanation: "locks" },
      { id: "resource:1", priorityScore: 10, bottlenecks: ["resource:1:overlap"], criticalResources: ["1"], activeConstraints: [], explanation: "resource" },
      { id: "zz-unmatched", priorityScore: 10, bottlenecks: [], criticalResources: [], activeConstraints: [], explanation: "discard" },
    ]),
  });
  assert.deepEqual(result.searchSpaces.map((space) => space.metadata.sourceOpportunityKind), ["LOCK_PRESSURE", "RESOURCE_PRESSURE"]);
  assert.equal(result.summary.discardedPriorityCount, 1);
  assert.equal(result.evidence.find((item) => item.kind === "operational-priority-discarded")?.subjectId, "zz-unmatched");
});

test("buildSearchSpaces priority guidance is deterministic, structurally equal, and non-mutating", () => {
  const prioritized = prioritize([opportunity("RESOURCE_PRESSURE", [2, 1], 80), opportunity("LOCK_PRESSURE", [4], 60)]);
  const map = priorityMap([
    { id: "resource:1", priorityScore: 10, bottlenecks: ["resource:1:overlap"], criticalResources: ["1"], activeConstraints: [], explanation: "resource" },
    { id: "constraints:locks", priorityScore: 20, bottlenecks: ["constraints:locks"], criticalResources: [], activeConstraints: ["constraints:locks"], explanation: "locks" },
  ]);
  const beforePrioritized = stableStringify(prioritized);
  const beforeMap = stableStringify(map);
  const first = buildSearchSpaces(prioritized, { operationalPriorityMap: map, createdAt: null });
  const second = buildSearchSpaces(prioritized, { operationalPriorityMap: map, createdAt: null });
  assert.equal(structuralEquals(first, second), true);
  assert.equal(structuralEquals(first, JSON.parse(JSON.stringify(first))), true);
  assert.equal(stableStringify(prioritized), beforePrioritized);
  assert.equal(stableStringify(map), beforeMap);
  assert.deepEqual(first.searchSpaces.map((space) => space.metadata.sourceOpportunityKind), ["LOCK_PRESSURE", "RESOURCE_PRESSURE"]);
});
