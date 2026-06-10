import assert from "node:assert/strict";
import test from "node:test";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { validateHardConstraints } from "./hardValidation";
import { buildCoachMicroSegments, buildCriticalCoachSegments, findCriticalCoachGap, runSegmentSolver } from "./segmentSolver";
import { runSegmentSolverSelection } from "./index";

const baseInput = (overrides: Partial<EngineV3Input> = {}): EngineV3Input => ({
  planId: 52,
  workDay: { start: "08:00", end: "16:00" },
  mealMode: "flexible_meal_window",
  meal: { start: "11:00", end: "14:30" },
  mealTaskTemplateName: "Comida",
  camerasAvailable: 2,
  optimizerMainZoneId: 1,
  tasks: [
    { id: 1, planId: 52, templateId: 1, templateName: "Vocal A", zoneId: 2, spaceId: 20, contestantId: 1, contestantName: "Talent A", status: "pending", durationOverrideMin: 30, resourceRequirements: { byItem: { 9001: 1 } } },
    { id: 2, planId: 52, templateId: 1, templateName: "Vocal B", zoneId: 2, spaceId: 20, contestantId: 2, contestantName: "Talent B", status: "pending", durationOverrideMin: 30, resourceRequirements: { byItem: { 9001: 1 } } },
    { id: 3, planId: 52, templateId: 3, templateName: "Main A", zoneId: 1, spaceId: 10, contestantId: 3, contestantName: "Talent C", status: "pending", durationOverrideMin: 30 },
    { id: 4, planId: 52, templateId: 4, templateName: "Main B", zoneId: 1, spaceId: 10, contestantId: 4, contestantName: "Talent D", status: "pending", durationOverrideMin: 30 },
    { id: 5, planId: 52, templateId: 5, templateName: "Cierre", zoneId: 3, spaceId: 30, contestantId: 5, contestantName: "Talent E", status: "done", durationOverrideMin: 30, startPlanned: "14:00", endPlanned: "14:30" },
  ],
  locks: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [{ id: 9001, resourceItemId: 9001, typeId: 1, typeCode: "coach", name: "Coach Uno", isAvailable: true }],
  coachResourceIds: [9001],
  resourceItemComponents: {},
  contestantAvailabilityById: {},
  ...overrides,
});

const baseOutput = (): EngineOutput => ({
  feasible: true,
  complete: true,
  hardFeasible: true,
  plannedTasks: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [9001] },
    { taskId: 2, startPlanned: "13:00", endPlanned: "13:30", assignedResources: [9001] },
    { taskId: 3, startPlanned: "10:00", endPlanned: "10:30", assignedResources: [] },
    { taskId: 4, startPlanned: "10:30", endPlanned: "11:00", assignedResources: [] },
    { taskId: 5, startPlanned: "14:00", endPlanned: "14:30", assignedResources: [] },
  ],
  unplanned: [],
  warnings: [],
});

const byId = (output: EngineOutput, taskId: number) => output.plannedTasks?.find((task) => Number(task.taskId) === taskId);

test("segment solver builds the critical segment for the worst coach gap", () => {
  const segments = buildCriticalCoachSegments(baseInput(), baseOutput());
  assert.equal(segments.length, 1);
  assert.equal(segments[0].coachName, "Coach Uno");
  assert.deepEqual(segments[0].talentNames.sort(), ["Talent A", "Talent B"]);
  assert.ok(segments[0].windowEnd - segments[0].windowStart <= 300);
});

test("bounded exact segment candidate lowers coach gap and wins selection", () => {
  const input = baseInput();
  const baseline = baseOutput();
  const result = runSegmentSolverSelection(input, baseline, "operational_neighborhood", { candidateSolutionsEvaluated: 4 }, { segmentSolverTimeoutMs: 500 });
  assert.equal(result.meta.segmentSolverAttempted, true);
  assert.ok((result.meta.segmentSolverCandidatesGenerated ?? 0) > 0);
  assert.equal(result.meta.segmentSolverAccepted, true);
  assert.equal(result.meta.solutionSource, "segment_solver");
  assert.match(String(result.meta.candidateSelectionReason), /segment_solver selected: lower coach gap/);
  assert.ok(Number(result.meta.segmentSolverBestAfter?.maxCoachGapMinutes) < Number(result.meta.segmentSolverBestBefore?.maxCoachGapMinutes));
  assert.equal(validateHardConstraints(input, result.output).hardValidationPassed, true);
});

test("segment solver keeps Main Stage fixed and continuous", () => {
  const input = baseInput();
  const baseline = baseOutput();
  const result = runSegmentSolver(input, baseline, { timeoutMs: 500 });
  assert.equal(byId(result.output, 3)?.startPlanned, "10:00");
  assert.equal(byId(result.output, 4)?.startPlanned, "10:30");
  assert.equal(result.meta.segmentSolverBestAfter?.mainStageGapMinutes, 0);
});

test("segment solver respects locks, dependencies and resource capacity", () => {
  const input = baseInput({
    tasks: baseInput().tasks.map((task) => task.id === 2 ? { ...task, dependsOnTaskIds: [6] } : task).concat([
      { id: 6, planId: 52, templateId: 6, templateName: "Vestu B", zoneId: 2, spaceId: 21, contestantId: 2, contestantName: "Talent B", status: "pending", durationOverrideMin: 30 },
      { id: 7, planId: 52, templateId: 7, templateName: "Otro coach", zoneId: 3, spaceId: 22, contestantId: 8, contestantName: "Talent H", status: "done", durationOverrideMin: 30, startPlanned: "11:00", endPlanned: "11:30", assignedResourceIds: [9001] },
    ]),
    locks: [{ id: 1, planId: 52, taskId: 1, lockType: "full", lockedStart: "09:00", lockedEnd: "09:30" }],
  });
  const output = baseOutput();
  output.plannedTasks = [...(output.plannedTasks ?? []),
    { taskId: 6, startPlanned: "12:00", endPlanned: "12:30", assignedResources: [] },
    { taskId: 7, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [9001] },
  ];
  const result = runSegmentSolver(input, output, { timeoutMs: 500 });
  assert.equal(byId(result.output, 1)?.startPlanned, "09:00");
  assert.equal(validateHardConstraints(input, result.output).hardValidationPassed, true);
  assert.ok((result.output.plannedTasks?.length ?? 0) === (output.plannedTasks?.length ?? 0));
});

test("segment solver can move a local flexible meal together with the coach task", () => {
  const input = baseInput({
    meal: { start: "09:30", end: "12:30" },
    locks: [{ id: 2, planId: 52, taskId: 1, lockType: "full", lockedStart: "09:00", lockedEnd: "09:30" }],
    contestantAvailabilityById: { 2: { start: "09:30", end: "14:00" } },
    tasks: baseInput().tasks.concat([
      { id: 8, planId: 52, templateId: 8, templateName: "Comida", breakKind: "itinerant_meal", zoneId: 2, spaceId: 25, contestantId: 2, contestantName: "Talent B", status: "pending", durationOverrideMin: 30 },
      { id: 9, planId: 52, templateId: 9, templateName: "Coach bloqueado", zoneId: 3, spaceId: 26, contestantId: 9, contestantName: "Talent I", status: "done", durationOverrideMin: 180, startPlanned: "10:00", endPlanned: "13:00", assignedResourceIds: [9001] },
    ]),
  });
  const output = baseOutput();
  output.plannedTasks = [...(output.plannedTasks ?? []),
    { taskId: 8, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [] },
    { taskId: 9, startPlanned: "10:00", endPlanned: "13:00", assignedResources: [9001] },
  ];
  const result = runSegmentSolver(input, output, { timeoutMs: 1_000 });
  assert.equal(result.meta.segmentSolverMealMovesAttempted, true);
  assert.equal(result.meta.segmentSolverAccepted, true);
  assert.equal(result.meta.segmentSolverMealMovesAccepted, true);
  assert.ok(result.meta.segmentSolverMealMoveCount > 0);
  assert.equal(validateHardConstraints(input, result.output).hardValidationPassed, true);
});

test("segment solver timeout is diagnostic and returns a valid best-so-far plan", () => {
  const input = baseInput();
  const result = runSegmentSolver(input, baseOutput(), { timeoutMs: 0 });
  assert.equal(result.meta.segmentSolverReason, "segment_solver_timeout");
  assert.ok(result.meta.segmentSolverRejectedReasons.includes("segment_candidate_timeout"));
  assert.equal(validateHardConstraints(input, result.output).hardValidationPassed, true);
});


test("findCriticalCoachGap reports the actual largest coach gap and adjacent blocks", () => {
  const gap = findCriticalCoachGap(baseInput(), baseOutput(), 9001);
  assert.ok(gap);
  assert.equal(gap.gapStart, 9 * 60 + 30);
  assert.equal(gap.gapEnd, 13 * 60);
  assert.equal(gap.gapMinutes, 210);
  assert.deepEqual(gap.leftBlockTaskIds, [1]);
  assert.deepEqual(gap.rightBlockTaskIds, [2]);
  assert.deepEqual(gap.leftBlockTalentNames, ["Talent A"]);
  assert.deepEqual(gap.rightBlockTalentNames, ["Talent B"]);
});

test("bridge microsegment stays surgical and under the 18 task ceiling", () => {
  const input = baseInput();
  const output = baseOutput();
  const gap = findCriticalCoachGap(input, output, 9001);
  assert.ok(gap);
  const built = buildCoachMicroSegments(input, output, gap);
  const bridge = built.segments.find((segment) => segment.strategy === "bridge");
  assert.ok(bridge);
  assert.ok(bridge.taskIds.length <= 18);
  assert.ok(bridge.movableTaskIds.length <= 14);
  assert.ok(bridge.talentIds.length <= 4);
});

test("wide segment overflow falls back to real microsegments instead of aborting", () => {
  const extraTasks = Array.from({ length: 26 }, (_, index) => ({
    id: 100 + index, planId: 52, templateId: 100 + index, templateName: `Prep ${index}`,
    zoneId: 2, spaceId: 40, contestantId: 1, contestantName: "Talent A", status: "pending", durationOverrideMin: 5,
  }));
  const extraPlanned = extraTasks.map((task, index) => {
    const start = 9 * 60 + 30 + index * 5;
    const format = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    return { taskId: task.id, startPlanned: format(start), endPlanned: format(start + 5), assignedResources: [] };
  });
  const input = baseInput({ tasks: [...baseInput().tasks, ...extraTasks] });
  const output = baseOutput();
  output.plannedTasks = [...(output.plannedTasks ?? []), ...extraPlanned];
  const result = runSegmentSolver(input, output, { timeoutMs: 100 });
  assert.ok((result.meta.segmentSolverTaskCount ?? 0) > 25);
  assert.ok(result.meta.segmentSolverMicroSegmentsBuilt > 0);
  assert.ok(result.meta.segmentSolverMicroSegmentTaskCounts.every((count) => count <= 18));
  assert.notEqual(result.meta.segmentSolverReason, "segment_too_large");
  assert.ok(result.meta.segmentSolverRejectedReasons.includes("wide_segment_too_large"));
});

test("left and right surgical strategies explore candidates and emit complete diagnostics", () => {
  const result = runSegmentSolver(baseInput(), baseOutput(), { timeoutMs: 500 });
  assert.ok(result.meta.segmentSolverMicroSegmentStrategiesTried.includes("left_shift_right_block"));
  assert.ok(result.meta.segmentSolverMicroSegmentStrategiesTried.includes("right_shift_left_block"));
  assert.ok(result.meta.segmentSolverAssignmentsExplored > 0);
  assert.ok(result.meta.segmentSolverValidCandidates > 0);
  assert.equal(result.meta.segmentSolverCriticalGapStart, "09:30");
  assert.equal(result.meta.segmentSolverCriticalGapEnd, "13:00");
  assert.equal(result.meta.segmentSolverCriticalGapMinutes, 210);
  assert.ok(result.meta.segmentSolverBestCandidateMovedTaskIds.length > 0);
  assert.ok(result.meta.segmentSolverBestCandidateReason);
});
