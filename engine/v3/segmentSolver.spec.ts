import assert from "node:assert/strict";
import test from "node:test";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { validateHardConstraints } from "./hardValidation";
import { buildCoachMicroSegments, buildCriticalCoachSegments, buildPrimaryStageFixedIntervals, checkLocalMoveFeasibility, explainOptimizedCandidateInvalid, findCriticalCoachGap, repairDirectBlocker, runSegmentSolver, validateSegmentCandidateIntegrity, type CoachMicroSegment } from "./segmentSolver";
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
  assert.match(String(result.meta.candidateSelectionReason), /segment_solver selected: reduced critical coach gap/);
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

test("primary-stage guard indexes fixed intervals and prunes overlap before full validation", () => {
  const input = baseInput({
    tasks: baseInput().tasks.map((task) => task.id === 2 ? { ...task, spaceId: 10 } : task),
  });
  const baseline = baseOutput();
  const intervals = buildPrimaryStageFixedIntervals(input, baseline);
  assert.deepEqual(intervals.map((item) => item.taskId), [3, 4]);
  const local = checkLocalMoveFeasibility(input, baseline, {
    segment: localSegment(),
    starts: new Map([[2, 10 * 60]]),
    strategy: "left_shift_right_block",
    offsetMinutes: -180,
  });
  assert.equal(local.feasible, false);
  assert.equal(local.blockers[0]?.rejectionCode, "primary_stage_fixed_overlap");
  assert.deepEqual(local.blockers[0]?.blockingTaskIds, [3]);
});

test("primary-stage task itself is never movable", () => {
  const local = checkLocalMoveFeasibility(baseInput(), baseOutput(), {
    segment: localSegment({ taskIds: [3], movableTaskIds: [3], targetTaskIds: [3] }),
    starts: new Map([[3, 11 * 60]]),
    strategy: "bridge",
  });
  assert.equal(local.blockers[0]?.rejectionCode, "primary_stage_task_not_movable");
});

test("primary-stage diagnostics count locally pruned candidates and retain zero stage gap", () => {
  const input = baseInput({
    tasks: baseInput().tasks.map((task) => task.id === 2 ? { ...task, spaceId: 10 } : task),
  });
  const baseline = baseOutput();
  byId(baseline, 3)!.endPlanned = "11:30";
  byId(baseline, 4)!.startPlanned = "11:30";
  byId(baseline, 4)!.endPlanned = "12:30";
  const result = runSegmentSolver(input, baseline, { timeoutMs: 500 });
  assert.equal(result.meta.segmentSolverPrimaryStageGuardEnabled, true);
  assert.ok(result.meta.segmentSolverPrimaryStageFixedIntervals.length > 0);
  assert.ok(result.meta.segmentSolverPrimaryStagePrunedCandidates > 0);
  assert.ok(result.meta.segmentSolverFullValidationsPerformed < result.meta.segmentSolverAssignmentsExplored);
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


const localSegment = (overrides: Partial<CoachMicroSegment> = {}): CoachMicroSegment => ({
  strategy: "left_shift_right_block", coachId: 9001, coachName: "Coach Uno", windowStart: 8 * 60, windowEnd: 16 * 60,
  taskIds: [2], movableTaskIds: [2], targetTaskIds: [2], offsetMinutes: [-120, -90, -60, -30, -15],
  talentIds: [2], talentNames: ["Talent B"], resourceIds: [9001], resourceNames: ["Coach Uno"], ...overrides,
});

test("resource outside-task rejection exposes a concrete blocker", () => {
  const input = baseInput({ tasks: baseInput().tasks.concat([{ id: 10, planId: 52, templateId: 10, templateName: "External", zoneId: 3, spaceId: 31, contestantId: 10, contestantName: "Talent X", status: "done", durationOverrideMin: 30 }]) });
  const output = baseOutput(); output.plannedTasks!.push({ taskId: 10, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [9001] });
  const result = checkLocalMoveFeasibility(input, output, { segment: localSegment(), starts: new Map([[2, 11 * 60]]), strategy: "left_shift_right_block", offsetMinutes: -120 });
  const blocker = result.blockers.find((item) => item.resourceId === 9001);
  assert.equal(result.feasible, false); assert.equal(blocker?.rejectionCode, "fixed_task_blocks_shift"); assert.deepEqual(blocker?.blockingTaskIds, [10]); assert.equal(blocker?.resourceName, "Coach Uno");
});

test("dependency outside-segment rejection identifies the predecessor", () => {
  const input = baseInput({ tasks: baseInput().tasks.map((task) => task.id === 2 ? { ...task, dependsOnTaskIds: [6] } : task).concat([{ id: 6, planId: 52, templateId: 6, templateName: "Predecessor", zoneId: 3, spaceId: 32, contestantId: 2, contestantName: "Talent B", status: "pending", durationOverrideMin: 30 }]) });
  const output = baseOutput(); output.plannedTasks!.push({ taskId: 6, startPlanned: "11:30", endPlanned: "12:00", assignedResources: [] });
  const result = checkLocalMoveFeasibility(input, output, { segment: localSegment(), starts: new Map([[2, 11 * 60]]), strategy: "left_shift_right_block" });
  assert.equal(result.blockers[0]?.rejectionCode, "dependency_predecessor_outside_segment"); assert.deepEqual(result.blockers[0]?.suggestedExpansionTaskIds, [6]);
});

test("dependency outside-segment rejection identifies the successor", () => {
  const input = baseInput({ tasks: baseInput().tasks.map((task) => task.id === 6 ? { ...task, dependsOnTaskIds: [2] } : task).concat([{ id: 6, planId: 52, templateId: 6, templateName: "Successor", zoneId: 3, spaceId: 32, contestantId: 2, contestantName: "Talent B", status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [2] }]) });
  const output = baseOutput(); output.plannedTasks!.push({ taskId: 6, startPlanned: "11:15", endPlanned: "11:45", assignedResources: [] });
  const result = checkLocalMoveFeasibility(input, output, { segment: localSegment(), starts: new Map([[2, 11 * 60]]), strategy: "left_shift_right_block" });
  assert.equal(result.blockers[0]?.rejectionCode, "dependency_successor_outside_segment"); assert.deepEqual(result.blockers[0]?.suggestedExpansionTaskIds, [6]);
});

test("incremental feasibility rejects before full validation", () => {
  const input = baseInput({ tasks: baseInput().tasks.concat([{ id: 10, planId: 52, templateId: 10, templateName: "Locked blocker", zoneId: 3, spaceId: 31, contestantId: 10, status: "done", durationOverrideMin: 30 }]) });
  const output = baseOutput(); output.plannedTasks!.push({ taskId: 10, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [9001] });
  const result = runSegmentSolver(input, output, { timeoutMs: 500 });
  assert.ok(result.meta.segmentSolverLocalChecksPerformed > 0); assert.ok(result.meta.segmentSolverLocalChecksRejected > 0); assert.ok(result.meta.segmentSolverFullValidationsPerformed < result.meta.segmentSolverLocalChecksPerformed);
});

test("movable blocker triggers bounded expansion and direct repair", () => {
  const input = baseInput({ tasks: baseInput().tasks.concat([{ id: 10, planId: 52, templateId: 10, templateName: "Movable blocker", zoneId: 3, spaceId: 31, contestantId: 10, contestantName: "Talent X", status: "pending", durationOverrideMin: 30 }]) });
  const output = baseOutput(); output.plannedTasks!.push({ taskId: 10, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [9001] });
  const result = runSegmentSolver(input, output, { timeoutMs: 500 });
  assert.ok(result.meta.segmentSolverExpandedMicroSegmentsBuilt > 0); assert.ok(result.meta.segmentSolverExpansionTaskIds.includes(10)); assert.ok(result.meta.segmentSolverDirectRepairsAttempted > 0);
  assert.ok(result.meta.segmentSolverRepairChainsAttempted > 0);
  assert.ok(result.meta.segmentSolverRepairChainMaxDepthReached <= 2);
  assert.ok(result.meta.segmentSolverRepairChainMovedTaskIds.length <= 10);
});

test("locked or done blockers do not expand", () => {
  const input = baseInput({ tasks: baseInput().tasks.concat([{ id: 10, planId: 52, templateId: 10, templateName: "Done blocker", zoneId: 3, spaceId: 31, contestantId: 10, status: "done", durationOverrideMin: 30 }]) });
  const output = baseOutput(); output.plannedTasks!.push({ taskId: 10, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [9001] });
  const local = checkLocalMoveFeasibility(input, output, { segment: localSegment(), starts: new Map([[2, 11 * 60]]), strategy: "left_shift_right_block" });
  assert.equal(local.blockers[0]?.canExpandSegment, false); assert.equal(local.blockers[0]?.rejectionCode, "fixed_task_blocks_shift");
});

test("direct repair shifts a flexible blocker into a valid local slot", () => {
  const input = baseInput({ tasks: baseInput().tasks.concat([{ id: 10, planId: 52, templateId: 10, templateName: "Flexible blocker", zoneId: 3, spaceId: 31, contestantId: 10, status: "pending", durationOverrideMin: 30 }]) });
  const output = baseOutput(); output.plannedTasks!.push({ taskId: 10, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [9001] });
  const starts = new Map([[2, 11 * 60]]); const local = checkLocalMoveFeasibility(input, output, { segment: localSegment(), starts, strategy: "left_shift_right_block" });
  const repair = repairDirectBlocker(input, output, localSegment(), starts, local.blockers.find((item) => item.resourceId === 9001)!);
  assert.ok(repair.starts?.has(10)); assert.match(String(repair.strategy), /shift_blocker|lane_sequentialization/);
});

test("direct repair relocates a flexible meal inside its window", () => {
  const input = baseInput({ meal: { start: "10:00", end: "12:30" }, tasks: baseInput().tasks.concat([{ id: 10, planId: 52, templateId: 10, templateName: "Comida", breakKind: "itinerant_meal", zoneId: 3, spaceId: 31, contestantId: 10, status: "pending", durationOverrideMin: 30, resourceRequirements: { byItem: { 9001: 1 } } }]) });
  const output = baseOutput(); output.plannedTasks!.push({ taskId: 10, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [9001] });
  const starts = new Map([[2, 11 * 60]]); const local = checkLocalMoveFeasibility(input, output, { segment: localSegment(), starts, strategy: "left_shift_right_block" });
  const repair = repairDirectBlocker(input, output, localSegment(), starts, local.blockers.find((item) => item.blockingTaskIds.includes(10))!);
  assert.ok((repair.starts?.get(10) ?? 0) >= 10 * 60); assert.ok((repair.starts?.get(10) ?? 9999) + 30 <= 12 * 60 + 30);
});

test("catering-like flexible task can be relocated inside the meal window", () => {
  const input = baseInput({ meal: { start: "10:00", end: "12:30" }, tasks: baseInput().tasks.concat([{ id: 10, planId: 52, templateId: 10, templateName: "Servicio Sodexo", zoneId: 3, spaceId: 31, contestantId: 10, status: "pending", durationOverrideMin: 30, resourceRequirements: { byItem: { 9001: 1 } } }]) });
  const output = baseOutput(); output.plannedTasks!.push({ taskId: 10, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [9001] });
  const starts = new Map([[2, 11 * 60]]); const local = checkLocalMoveFeasibility(input, output, { segment: localSegment(), starts, strategy: "left_shift_right_block" });
  const repair = repairDirectBlocker(input, output, localSegment(), starts, local.blockers.find((item) => item.blockingTaskIds.includes(10))!);
  assert.ok(repair.starts?.has(10));
  assert.equal(repair.strategy, "sodexo_flexible_slot_relocated");
});

test("flexible meal does not block a coach room unless explicitly configured", () => {
  const meal = { id: 10, planId: 52, templateId: 10, templateName: "Comida", breakKind: "itinerant_meal" as const, zoneId: 2, spaceId: 20, contestantId: 10, status: "pending", durationOverrideMin: 30 };
  const input = baseInput({ tasks: baseInput().tasks.concat([meal]) });
  const output = baseOutput();
  output.plannedTasks!.push({ taskId: 10, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [] });
  const context = { segment: localSegment(), starts: new Map([[2, 11 * 60]]), strategy: "left_shift_right_block" };
  assert.equal(checkLocalMoveFeasibility(input, output, context).blockers.some((item) => item.constraintType === "space"), false);

  const explicitInput = baseInput({ tasks: baseInput().tasks.concat([{ ...meal, mealOccupiesSpace: true }]) });
  assert.equal(checkLocalMoveFeasibility(explicitInput, output, context).blockers.some((item) => item.constraintType === "space"), true);
});

test("accepted local move rejected by full validation exports complete failure diagnostics", () => {
  const input = baseInput({ contestantAvailabilityById: { 2: { start: "12:45", end: "14:00" } } });
  const result = runSegmentSolver(input, baseOutput(), { timeoutMs: 500 });
  assert.ok(result.meta.segmentSolverFullValidationsRejected > 0);
  assert.ok(result.meta.segmentSolverFullValidationTopFailures.length > 0);
  const failure = result.meta.segmentSolverFullValidationTopFailures[0];
  assert.ok(failure.fullValidationViolationCode);
  assert.ok(failure.movedTaskIds.length > 0);
  assert.ok(failure.taskIds.length > 0);
  assert.ok(failure.taskNames.length > 0);
  assert.ok(failure.talentNames.length > 0);
  assert.ok(result.meta.segmentSolverBestRepairRejectedBy);
  assert.ok(result.meta.segmentSolverFullValidationFailureCodes.length > 0);
});

test("lane sequentialization resolves a direct same-space overlap", () => {
  const input = baseInput({ tasks: baseInput().tasks.concat([{ id: 10, planId: 52, templateId: 10, templateName: "Lane blocker", zoneId: 3, spaceId: 20, contestantId: 10, status: "pending", durationOverrideMin: 30 }]) });
  const output = baseOutput(); output.plannedTasks!.push({ taskId: 10, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [] });
  const starts = new Map([[2, 11 * 60]]); const local = checkLocalMoveFeasibility(input, output, { segment: localSegment(), starts, strategy: "left_shift_right_block" });
  const repair = repairDirectBlocker(input, output, localSegment(), starts, local.blockers.find((item) => item.constraintType === "space")!);
  assert.ok(repair.starts?.has(10));
});

test("partial fifteen-minute coach-gap improvement is generated", () => {
  const result = runSegmentSolver(baseInput(), baseOutput(), { timeoutMs: 500 });
  assert.ok(result.meta.segmentSolverCandidateMetrics.some((item) => item.improvementMinutes >= 15)); assert.ok(result.meta.segmentSolverValidCandidates > 0);
});

test("solver candidates preserve Main Stage continuity and fixed tasks", () => {
  const input = baseInput(); const output = baseOutput(); const result = runSegmentSolver(input, output, { timeoutMs: 500 });
  assert.equal(result.meta.segmentSolverBestAfter?.mainStageGapMinutes, 0); assert.equal(byId(result.output, 5)?.startPlanned, "14:00"); assert.equal(validateHardConstraints(input, result.output).hardValidationPassed, true);
});

test("diagnostics expose blocker and incremental validation counters", () => {
  const input = baseInput({ tasks: baseInput().tasks.concat([{ id: 10, planId: 52, templateId: 10, templateName: "Done blocker", zoneId: 3, spaceId: 31, contestantId: 10, status: "done", durationOverrideMin: 30 }]) });
  const output = baseOutput(); output.plannedTasks!.push({ taskId: 10, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [9001] });
  const result = runSegmentSolver(input, output, { timeoutMs: 500 }); assert.ok(result.meta.segmentSolverTopBlockers.length > 0); assert.ok(result.meta.segmentSolverLocalChecksPerformed > 0); assert.ok(result.meta.segmentSolverFullValidationsPerformed >= 0);
});

test("timeout retains concrete blockers instead of only timeout", () => {
  const input = baseInput({ tasks: baseInput().tasks.concat([{ id: 10, planId: 52, templateId: 10, templateName: "Done blocker", zoneId: 3, spaceId: 31, contestantId: 10, status: "done", durationOverrideMin: 30 }]) });
  const output = baseOutput(); output.plannedTasks!.push({ taskId: 10, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [9001] });
  const result = runSegmentSolver(input, output, { timeoutMs: 100 }); assert.ok(result.meta.segmentSolverTopBlockers.length > 0); assert.notEqual(result.meta.segmentSolverReason, "segment_solver_timeout");
});

test("optimized candidate invalid unwraps talent overlap", () => {
  const input = baseInput();
  const baseline = baseOutput();
  const candidate = structuredClone(baseline);
  byId(candidate, 2)!.startPlanned = "09:00";
  byId(candidate, 2)!.endPlanned = "09:30";
  (input.tasks.find((task) => task.id === 2) as any).contestantId = 1;
  (input.tasks.find((task) => task.id === 2) as any).spaceId = 21;
  byId(candidate, 2)!.assignedResources = [];
  const failure = explainOptimizedCandidateInvalid(candidate, input, { baseline, movedTaskIds: [2] });
  assert.equal(failure.fullValidationViolationCode, "OPTIMIZED_CANDIDATE_INVALID");
  assert.equal(failure.underlyingViolationCode, "TALENT_OVERLAP");
  assert.deepEqual(failure.blockingTaskIds, [1]);
});

test("candidate integrity detects duplicate, lost and invalid tasks", () => {
  const baseline = baseOutput();
  const duplicate = structuredClone(baseline);
  duplicate.plannedTasks!.push({ ...duplicate.plannedTasks![0] });
  assert.ok(validateSegmentCandidateIntegrity(baseline, duplicate, [1]).some((failure) => failure.code === "candidate_duplicate_task"));
  const lost = structuredClone(baseline);
  lost.plannedTasks = lost.plannedTasks!.filter((task) => task.taskId !== 2);
  assert.ok(validateSegmentCandidateIntegrity(baseline, lost, [1]).some((failure) => failure.code === "candidate_lost_task"));
  const invalid = structuredClone(baseline);
  byId(invalid, 1)!.endPlanned = byId(invalid, 1)!.startPlanned;
  assert.ok(validateSegmentCandidateIntegrity(baseline, invalid, [1]).some((failure) => failure.code === "candidate_invalid_time_range"));
});
