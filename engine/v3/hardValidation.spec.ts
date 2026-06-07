import assert from "node:assert/strict";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { applyFinalHardValidationGate, MAX_HARD_VIOLATION_DETAILS, validateHardConstraints } from "./hardValidation";
import { compareCandidateSolutions } from "./solutionScoring";
import { buildRunDiagnostics } from "./runDiagnostics";

const input = (tasks: EngineV3Input["tasks"], overrides: Partial<EngineV3Input> = {}): EngineV3Input => ({
  planId: 26,
  workDay: { start: "09:00", end: "12:00" },
  meal: { start: "13:00", end: "13:30" },
  camerasAvailable: 2,
  tasks,
  locks: [],
  groupingZoneIds: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [],
  resourceItemComponents: {},
  ...overrides,
});

const output = (plannedTasks: EngineOutput["plannedTasks"]): EngineOutput => ({
  feasible: true,
  complete: true,
  hardFeasible: true,
  plannedTasks,
  unplanned: [],
  warnings: [],
});

const task = (id: number, contestantId: number, spaceId: number, extra: Partial<EngineV3Input["tasks"][number]> = {}): EngineV3Input["tasks"][number] => ({
  id, planId: 26, templateId: id, status: "pending", contestantId, spaceId, zoneId: 1, durationOverrideMin: 30, ...extra,
});

{
  const caseInput = input([task(1, 10, 101), task(2, 10, 102)]);
  const result = validateHardConstraints(caseInput, output([
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] },
    { taskId: 2, startPlanned: "09:15", endPlanned: "09:45", assignedResources: [] },
  ]));
  assert.ok(result.hardConstraintViolationCodes.includes("CONTESTANT_OVERLAP"));
}

{
  const caseInput = input([task(1, 10, 101), task(2, 11, 101)]);
  const result = validateHardConstraints(caseInput, output([
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] },
    { taskId: 2, startPlanned: "09:15", endPlanned: "09:45", assignedResources: [] },
  ]));
  assert.ok(result.hardConstraintViolationCodes.includes("SPACE_OVERLAP"));
}

{
  const caseInput = input([task(1, 10, 101, { templateName: "Micro A" }), task(2, 11, 101, { templateName: "Micro B" })], { spaceCapacityById: { 101: 2 }, spaceNameById: { 101: "Auxiliary microtasks" } });
  const result = validateHardConstraints(caseInput, output([
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:05", assignedResources: [] },
    { taskId: 2, startPlanned: "09:00", endPlanned: "09:05", assignedResources: [] },
  ]));
  assert.equal(result.hardConstraintViolationCodes.includes("SPACE_OVERLAP"), false);
}

{
  const caseInput = input([task(1, 10, 101, { templateName: "Micro A" }), task(2, 11, 101, { templateName: "Micro B" }), task(3, 12, 101, { templateName: "Micro C" })], { spaceCapacityById: { 101: 2 }, spaceNameById: { 101: "Auxiliary microtasks" } });
  const result = validateHardConstraints(caseInput, output([
    { taskId: 1, startPlanned: "09:35", endPlanned: "09:40", assignedResources: [] },
    { taskId: 2, startPlanned: "09:35", endPlanned: "09:40", assignedResources: [] },
    { taskId: 3, startPlanned: "09:35", endPlanned: "09:40", assignedResources: [] },
  ]));
  const detail = result.hardConstraintViolationDetails.find((item) => item.code === "SPACE_OVERLAP");
  assert.ok(detail);
  assert.equal(detail.spaceCapacity, 2);
  assert.equal(detail.observedConcurrency, 3);
  assert.equal(detail.spaceName, "Auxiliary microtasks");
  assert.equal(detail.details?.spaceCapacity, 2);
  assert.equal(detail.details?.observedConcurrency, 3);
  assert.deepEqual(detail.taskIds, [1, 2, 3]);
  assert.ok(Array.isArray(detail.taskNames));
}

{
  const tasks = Array.from({ length: 6 }, (_, index) => task(index + 1, 20 + index, 149, { templateName: `Micro ${index + 1}` }));
  const caseInput = input(tasks, { spaceCapacityById: { 149: 6 }, spaceNameById: { 149: "Concurrent booth" } });
  const result = validateHardConstraints(caseInput, output(tasks.map((row) => ({ taskId: row.id, startPlanned: "10:10", endPlanned: "10:15", assignedResources: [] }))));
  assert.equal(result.hardConstraintViolations, 0, "microtasks within capacity must not create pairwise violations");
}

{
  const caseInput = input([task(1, 10, 101)], { contestantAvailabilityById: { 10: { start: "10:00", end: "11:00" } } });
  const result = validateHardConstraints(caseInput, output([{ taskId: 1, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [] }]));
  assert.ok(result.hardConstraintViolationCodes.includes("AVAILABILITY_VIOLATION"));
}

{
  const caseInput = input([task(1, 10, 101), task(2, 11, 102, { dependsOnTaskIds: [1] })]);
  const result = validateHardConstraints(caseInput, output([
    { taskId: 1, startPlanned: "10:00", endPlanned: "10:30", assignedResources: [] },
    { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [] },
  ]));
  assert.ok(result.hardConstraintViolationCodes.includes("DEPENDENCY_VIOLATION"));
}

{
  const caseInput = input([task(1, 10, 101), task(2, 10, 102)]);
  const valid = output([
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] },
    { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [] },
  ]);
  const invalid = output([
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] },
    { taskId: 2, startPlanned: "09:15", endPlanned: "09:45", assignedResources: [] },
  ]);
  assert.ok(compareCandidateSolutions(caseInput, valid, invalid) > 0);
  const gated = applyFinalHardValidationGate(caseInput, invalid);
  assert.equal(gated.hardFeasible, false);
  assert.equal(gated.complete, false);
  assert.equal(gated.v3Meta?.hardValidationPassed, false);
}

{
  const tasks = Array.from({ length: 12 }, (_, index) => task(index + 1, 10, 101));
  const invalid = output(tasks.map((row) => ({ taskId: row.id, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [] })));
  const caseInput = input(tasks);
  const rawDiagnostics = buildRunDiagnostics(caseInput, invalid);
  assert.equal(rawDiagnostics.status, "infeasible", "diagnostics must never label an invalid output as success");
  const diagnostics = buildRunDiagnostics(caseInput, applyFinalHardValidationGate(caseInput, invalid));
  assert.equal(diagnostics.status, "infeasible");
  assert.equal(diagnostics.hardValidationPassed, false);
  assert.ok(diagnostics.hardConstraintViolationCodes.includes("CONTESTANT_OVERLAP"));
  assert.ok(diagnostics.hardConstraintViolationDetails.length <= MAX_HARD_VIOLATION_DETAILS);
  assert.ok(diagnostics.engineMetadata.hardConstraintViolationDetails.length <= MAX_HARD_VIOLATION_DETAILS);
}

{
  const caseInput = input([task(1, 10, 101)], {
    workDay: { start: "09:00", end: "18:00" },
    meal: { start: "13:00", end: "16:30" },
  });
  const result = validateHardConstraints(caseInput, output([
    { taskId: 1, startPlanned: "13:30", endPlanned: "14:00", assignedResources: [] },
  ]));
  assert.equal(result.hardConstraintViolations, 0);
  assert.ok(!result.hardConstraintViolationCodes.includes("MEAL_CROSSING"));
  const gated = applyFinalHardValidationGate(caseInput, output([
    { taskId: 1, startPlanned: "13:30", endPlanned: "14:00", assignedResources: [] },
  ]));
  assert.equal(gated.complete, true, "a flexible meal window must not prevent success");
}

{
  const caseInput = input([task(1, 10, 101)], {
    workDay: { start: "09:00", end: "18:00" },
    meal: { start: "13:00", end: "16:30" },
    actualMeal: { start: "14:00", end: "14:40", contestantId: 10 },
  });
  const result = validateHardConstraints(caseInput, output([
    { taskId: 1, startPlanned: "13:50", endPlanned: "14:20", assignedResources: [] },
  ]));
  assert.ok(result.hardConstraintViolationCodes.includes("MEAL_CROSSING"));
  assert.ok(result.hardConstraintViolationDetails.some((detail) => detail.details?.violationType === "MEAL_BLOCK_CROSSING"));
}

{
  const caseInput = input([task(1, 10, 101)], {
    workDay: { start: "09:00", end: "18:00" },
    meal: { start: "13:00", end: "16:30" },
    globalHardBreaks: [{ start: "15:00", end: "15:30" }],
  });
  const result = validateHardConstraints(caseInput, output([
    { taskId: 1, startPlanned: "14:50", endPlanned: "15:20", assignedResources: [] },
  ]));
  assert.ok(result.hardConstraintViolationCodes.includes("GLOBAL_BREAK_CROSSING"));
}

{
  const mealTask = task(2, 10, 102, { breakKind: "itinerant_meal", itinerantTeamId: 7 });
  const workTask = task(1, 10, 101, { itinerantTeamId: 7 });
  const caseInput = input([workTask, mealTask], {
    workDay: { start: "09:00", end: "18:00" },
    meal: { start: "13:00", end: "16:30" },
  });
  const result = validateHardConstraints(caseInput, output([
    { taskId: 1, startPlanned: "14:00", endPlanned: "14:30", assignedResources: [] },
    { taskId: 2, startPlanned: "14:10", endPlanned: "14:40", assignedResources: [] },
  ]));
  assert.ok(result.hardConstraintViolationCodes.includes("MEAL_CROSSING"));
}

{
  const tasks = Array.from({ length: 120 }, (_, index) => task(index + 1, index + 1, 1000 + index));
  const caseInput = input(tasks, {
    workDay: { start: "09:00", end: "18:00" },
    meal: { start: "13:00", end: "16:30" },
  });
  const result = validateHardConstraints(caseInput, output(tasks.map((row, index) => ({
    taskId: row.id,
    startPlanned: index % 2 === 0 ? "13:30" : "15:00",
    endPlanned: index % 2 === 0 ? "14:00" : "15:30",
    assignedResources: [],
  }))));
  assert.equal(result.hardConstraintViolations, 0, "meal availability windows must not create bulk hard violations");
}

console.log("engine/v3/hardValidation.spec.ts: OK");
