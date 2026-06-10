import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput, EngineOutput, TaskInput } from "../types";
import { validateHardConstraints } from "./hardValidation";
import { runMealSchedulerSafely, scheduleFlexibleMeals } from "./mealScheduler";
import { buildRunDiagnostics } from "./runDiagnostics";

const task = (id: number, overrides: Partial<TaskInput> = {}): TaskInput => ({
  id, planId: 1, templateId: id, templateName: `Task ${id}`, status: "pending", durationOverrideMin: 30, ...overrides,
});
const input = (overrides: Partial<EngineInput> = {}): EngineInput => ({
  planId: 1, workDay: { start: "09:00", end: "18:00" }, meal: { start: "13:00", end: "15:00" },
  mealWindow: { start: "13:00", end: "15:00" }, camerasAvailable: 0, tasks: [], locks: [], planResourceItems: [], zoneResourceAssignments: {}, spaceResourceAssignments: {},
  ...overrides,
});
const output = (plannedTasks: EngineOutput["plannedTasks"]): EngineOutput => ({ feasible: true, complete: true, hardFeasible: true, plannedTasks });

test("global_hard_break keeps the configured meal window hard", () => {
  const work = task(1, { spaceId: 10 });
  const result = validateHardConstraints(input({ mealMode: "global_hard_break", tasks: [work] }), output([{ taskId: 1, startPlanned: "13:15", endPlanned: "13:45" }]));
  assert.ok(result.hardConstraintViolationCodes.includes("GLOBAL_BREAK_CROSSING"));
});

test("flexible meal without explicit space occupancy does not create SPACE_OVERLAP", () => {
  const meal = task(2, { templateName: "COMIDA", breakKind: "space_meal", spaceId: 10, mealOccupiesSpace: false });
  const work = task(1, { spaceId: 10 });
  const result = validateHardConstraints(input({ mealMode: "flexible_meal_window", mealTaskTemplateName: "COMIDA", tasks: [work, meal] }), output([
    { taskId: 1, startPlanned: "12:00", endPlanned: "12:30" },
    { taskId: 2, startPlanned: "12:00", endPlanned: "12:30" },
  ]));
  assert.ok(!result.hardConstraintViolationCodes.includes("SPACE_OVERLAP"));
});

test("meal scheduler assigns and staggers flexible meals inside the window", () => {
  const meals = [
    task(10, { templateName: "COMIDA", breakKind: "space_meal", spaceId: 10, durationOverrideMin: 30 }),
    task(11, { templateName: "COMIDA", breakKind: "space_meal", spaceId: 11, durationOverrideMin: 30 }),
  ];
  const engineInput = input({ mealMode: "flexible_meal_window", mealTaskTemplateName: "COMIDA", tasks: meals });
  const scheduled = scheduleFlexibleMeals(engineInput, output([
    { taskId: 10, startPlanned: "13:00", endPlanned: "13:30" },
    { taskId: 11, startPlanned: "13:00", endPlanned: "13:30" },
  ]));
  const starts = scheduled.output.plannedTasks.map((item) => item.startPlanned);
  assert.equal(scheduled.diagnostics.mealSchedulerAccepted, true);
  assert.ok(starts.every((start) => start >= "13:00" && start < "15:00"));
  assert.equal(new Set(starts).size, 2);
  assert.equal(validateHardConstraints(engineInput, scheduled.output).hardValidationPassed, true);
  const diagnostics = buildRunDiagnostics(engineInput, { ...scheduled.output, v3Meta: scheduled.diagnostics });
  assert.equal(diagnostics.engineMetadata.mealMode, "flexible_meal_window");
  assert.equal(diagnostics.engineMetadata.mealSchedulerAttempted, true);
  assert.ok(diagnostics.engineMetadata.mealAssignmentsGenerated > 0);
});

test("meal scheduler preserves locked and in-progress meal assignments", () => {
  const locked = task(10, { templateName: "COMIDA", breakKind: "itinerant_meal", itinerantTeamId: 5, status: "in_progress", durationOverrideMin: 30 });
  const engineInput = input({ mealMode: "flexible_meal_window", mealTaskTemplateName: "COMIDA", tasks: [locked] });
  const scheduled = scheduleFlexibleMeals(engineInput, output([{ taskId: 10, startPlanned: "13:20", endPlanned: "13:50" }]));
  assert.equal(scheduled.output.plannedTasks[0].startPlanned, "13:20");
  assert.equal(scheduled.diagnostics.mealMovedAssignments.length, 0);
});

test("safe meal scheduler preserves the original output when the scheduler throws", () => {
  const original = output([{ taskId: 1, startPlanned: "10:00", endPlanned: "10:30" }]);
  const scheduled = runMealSchedulerSafely(input(), original, () => { throw new Error("scheduler exploded"); });

  assert.equal(scheduled.output, original);
  assert.equal(scheduled.diagnostics.mealSchedulerReason, "meal_scheduler_exception");
  assert.ok(scheduled.diagnostics.mealSchedulerRejectedReasons.includes("meal_scheduler_exception"));
});

test("meal scheduler tolerates undefined task arrays", () => {
  const malformedInput = { ...input(), tasks: undefined } as unknown as EngineInput;
  const malformedOutput = { ...output([]), plannedTasks: undefined } as unknown as EngineOutput;

  assert.doesNotThrow(() => scheduleFlexibleMeals(malformedInput, malformedOutput));
});

test("candidate validation exceptions reject the slot without crashing the scheduler", () => {
  const meal = task(10, { templateName: "COMIDA", breakKind: "space_meal", spaceId: 10, durationOverrideMin: Number.NaN });
  const engineInput = input({ mealMode: "flexible_meal_window", mealTaskTemplateName: "COMIDA", contestantMealDurationMinutes: 30, tasks: [meal] });
  const scheduled = scheduleFlexibleMeals(
    engineInput,
    output([{ taskId: 10, startPlanned: "13:00", endPlanned: "13:30" }]),
    { validateHardConstraints: () => { throw new Error("invalid candidate"); } },
  );

  assert.equal(scheduled.diagnostics.mealSchedulerAccepted, false);
  assert.ok(scheduled.diagnostics.mealSchedulerRejectedReasons.includes("meal_candidate_validation_exception"));
});
