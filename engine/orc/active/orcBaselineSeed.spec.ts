import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput, EngineOutput } from "../../types";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { assertSerializableORCSeed, buildORCBaselineSeededInput } from "./orcBaselineSeed";

const input = (count = 3): EngineInput => ({
  planId: 191,
  workDay: { start: "09:00", end: "18:00" },
  camerasAvailable: 1,
  tasks: Array.from({ length: count }, (_, index) => ({ id: index + 1, planId: 191, templateId: index + 1, status: "pending", durationOverrideMin: 10, spaceId: 100 + index })),
  locks: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [{ id: 10, resourceItemId: 10, typeId: 1, name: "R", isAvailable: true }],
  resourceItemComponents: {},
  groupingZoneIds: [],
});

const output = (count = 3): EngineOutput => ({
  feasible: true,
  complete: true,
  hardFeasible: true,
  plannedTasks: Array.from({ length: count }, (_, index) => ({ taskId: index + 1, startPlanned: `09:${String(index * 10).padStart(2, "0")}`, endPlanned: `09:${String(index * 10 + 10).padStart(2, "0")}`, assignedResources: [10] })),
  schedule: Array.from({ length: count }, (_, index) => ({ taskId: index + 1, start: `09:${String(index * 10).padStart(2, "0")}`, end: `09:${String(index * 10 + 10).padStart(2, "0")}`, assignedResources: [10], assignedSpace: 200 + index })),
  unplanned: [],
});

test("buildORCBaselineSeededInput converts complete V4 baseline into OperationalState planning", () => {
  const result = buildORCBaselineSeededInput(input(219), output(219));
  const state = buildOperationalStateFromEngineInput(result.input);
  assert.equal(result.baselineSeed.applied, true);
  assert.equal(result.baselineSeed.seededPlanningCount, 219);
  assert.equal(state.planning.length, 219);
  assert.deepEqual({ taskId: state.planning[0].taskId, startPlanned: state.planning[0].startPlanned, endPlanned: state.planning[0].endPlanned, assignedResourceIds: state.planning[0].assignedResourceIds, spaceId: state.planning[0].spaceId }, { taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [10], spaceId: 200 });
  assert.equal(state.planning[0].operationalRole, "productive_task");
});

test("buildORCBaselineSeededInput preserves protected task planning when V4 did not plan it", () => {
  const base = input(2);
  base.tasks![0].status = "done";
  base.tasks![0].startPlanned = "08:00";
  base.tasks![0].endPlanned = "08:10";
  const seeded = buildORCBaselineSeededInput(base, output(0));
  const done = seeded.input.tasks!.find((task) => task.id === 1)!;
  assert.equal(done.startPlanned, "08:00");
  assert.equal(done.endPlanned, "08:10");
  assert.ok(seeded.baselineSeed.warnings.includes("Preserved existing planning for 1 protected/locked task(s)."));
});

test("buildORCBaselineSeededInput clears raw pending planning not produced by V4 while preserving fixed windows", () => {
  const base = input(1);
  base.tasks![0].startPlanned = "08:00";
  base.tasks![0].endPlanned = "08:10";
  base.tasks![0].assignedResourceIds = [10];
  base.tasks![0].fixedWindowStart = "10:00";
  base.tasks![0].fixedWindowEnd = "11:00";
  const before = JSON.stringify(base);
  const seeded = buildORCBaselineSeededInput(base, { ...output(0), plannedTasks: [], schedule: [] });
  assert.equal(seeded.seedPlanning.length, 0);
  assert.equal(seeded.baselineSeed.seededPlanningCount, 0);
  assert.equal(seeded.baselineSeed.clearedRawPlanningCount, 1);
  assert.equal(seeded.baselineSeed.unseededPendingCount, 1);
  assert.equal(seeded.input.tasks![0].startPlanned, undefined);
  assert.equal(seeded.input.tasks![0].endPlanned, undefined);
  assert.equal(seeded.input.tasks![0].assignedResourceIds, undefined);
  assert.equal(seeded.input.tasks![0].fixedWindowStart, "10:00");
  assert.equal(seeded.input.tasks![0].fixedWindowEnd, "11:00");
  assert.equal(JSON.stringify(base), before);
});

test("buildORCBaselineSeededInput seeds V4 and protected existing planning with explicit sources", () => {
  const base = input(4);
  base.tasks![1].status = "done";
  base.tasks![1].startPlanned = "08:10";
  base.tasks![1].endPlanned = "08:20";
  base.tasks![2].status = "in_progress";
  base.tasks![2].startPlanned = "08:20";
  base.tasks![2].endPlanned = "08:30";
  base.tasks![3].startPlanned = "08:30";
  base.tasks![3].endPlanned = "08:40";
  base.locks = [{ id: 1, planId: 191, taskId: 4, lockType: "time", lockedStart: "08:30", lockedEnd: "08:40" }];
  const seeded = buildORCBaselineSeededInput(base, output(1));
  assert.deepEqual(seeded.seedPlanning.map((entry) => entry.source), ["v4_planned_task", "protected_existing_planning", "protected_existing_planning", "protected_existing_planning"]);
  assert.equal(seeded.baselineSeed.protectedExistingPlanningCount, 3);
  assert.equal(seeded.input.tasks![1].startPlanned, "08:10");
  assert.equal(seeded.input.tasks![2].startPlanned, "08:20");
  assert.equal(seeded.input.tasks![3].startPlanned, "08:30");
});

test("baseline seed remains planning-only and JSON serializable", () => {
  const rich = input(1);
  (rich.tasks![0] as any).comments = [{ body: "must not leak" }];
  (rich.tasks![0] as any).template = { id: 1, name: "full template" };
  (rich.tasks![0] as any).createdAt = "2026-06-29T00:00:00.000Z";
  const result = buildORCBaselineSeededInput(rich, output(1));
  assert.deepEqual(Object.keys(result.seedPlanning[0]).sort(), ["allowsSpaceOverlap", "assignedResources", "assignedSpace", "blocksSpace", "countsAsWork", "countsForMainFlow", "countsForResourceLoad", "countsForTalentLoad", "endPlanned", "operationalRole", "seedSource", "source", "spaceOccupancyMode", "startPlanned", "taskId", "transportGroupCapacity", "transportGroupingTarget", "transportGroupingWeight"]);
  assert.equal(JSON.stringify(result.seedPlanning).includes("comments"), false);
  assert.equal(JSON.stringify(result.seedPlanning).includes("template"), false);
  assert.doesNotThrow(() => JSON.stringify(result.seedPlanning));
});

test("baseline seed keeps only required planning values for each task", () => {
  const result = buildORCBaselineSeededInput(input(2), output(2));
  assert.deepEqual({ taskId: result.seedPlanning[1].taskId, startPlanned: result.seedPlanning[1].startPlanned, endPlanned: result.seedPlanning[1].endPlanned, assignedSpace: result.seedPlanning[1].assignedSpace, assignedResources: result.seedPlanning[1].assignedResources, source: result.seedPlanning[1].source }, { taskId: 2, startPlanned: "09:10", endPlanned: "09:20", assignedSpace: 201, assignedResources: [10], source: "v4_planned_task" });
  assert.equal(result.seedPlanning[1].operationalRole, "productive_task");
  const taskJson = JSON.stringify(result.input.tasks![0]);
  assert.equal(taskJson.includes("comments"), false);
  assert.equal(taskJson.includes("createdAt"), false);
});


test("baseline seed safety rejects non-serializable and too-large payloads", () => {
  const circular: any = { taskId: 1 };
  circular.self = circular;
  assert.throws(() => assertSerializableORCSeed(circular), /baseline_seed_not_serializable/);
  assert.throws(() => assertSerializableORCSeed([{ taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResources: [10], blob: "x".repeat(128) }], 64), /baseline_seed_too_large/);
});
