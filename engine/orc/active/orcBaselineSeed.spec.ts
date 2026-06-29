import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput, EngineOutput } from "../../types";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { buildORCBaselineSeededInput } from "./orcBaselineSeed";

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
  assert.deepEqual(state.planning[0], { taskId: 1, startPlanned: "09:00", endPlanned: "09:10", assignedResourceIds: [10], spaceId: 200 });
});

test("buildORCBaselineSeededInput preserves protected task planning when baseline contains it", () => {
  const base = input(2);
  base.tasks![0].status = "done";
  base.tasks![0].startPlanned = "08:00";
  base.tasks![0].endPlanned = "08:10";
  const seeded = buildORCBaselineSeededInput(base, output(2));
  const done = seeded.input.tasks!.find((task) => task.id === 1)!;
  assert.equal(done.startPlanned, "08:00");
  assert.equal(done.endPlanned, "08:10");
  assert.equal(seeded.baselineSeed.warnings.length, 0);
});
