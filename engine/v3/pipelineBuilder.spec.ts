import assert from "node:assert/strict";
import type { EngineInput, EngineOutput } from "../types";
import { validateHardConstraints } from "./hardValidation";
import { generatePipelineBuilderCandidates, type PipelineBuilderDiagnostics } from "./pipelineBuilder";
import { calculateOperationalMetrics, toMinutes } from "./metrics";
import { compareCandidateScores, scoreCandidateSolution } from "./solutionScoring";
import { runPipelineBuilderSelection } from "./index";

const buildScenario = (overrides: Partial<EngineInput> = {}): { input: EngineInput; baseline: EngineOutput } => {
  const input: EngineInput = {
    planId: 40,
    workDay: { start: "08:00", end: "14:00" },
    meal: { start: "13:00", end: "14:00" },
    camerasAvailable: 2,
    optimizerMainZoneId: 1,
    locks: [],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    resourceItemComponents: {},
    coachResourceIds: [501, 502],
    planResourceItems: [
      { id: 501, resourceItemId: 9001, typeId: 10, typeCode: "VOCAL_COACH", name: "Coach A", isAvailable: true },
      { id: 502, resourceItemId: 9002, typeId: 10, typeCode: "VOCAL_COACH", name: "Coach B", isAvailable: true },
    ],
    spaceCapacityById: { 10: 1, 20: 1 },
    tasks: [
      { id: 1, planId: 40, templateId: 1, templateName: "Vocal Coach", zoneId: 2, spaceId: 20, contestantId: 101, status: "pending", durationOverrideMin: 30 },
      { id: 2, planId: 40, templateId: 1, templateName: "Vocal Coach", zoneId: 2, spaceId: 20, contestantId: 201, status: "pending", durationOverrideMin: 30 },
      { id: 3, planId: 40, templateId: 1, templateName: "Vocal Coach", zoneId: 2, spaceId: 20, contestantId: 102, status: "pending", durationOverrideMin: 30 },
      { id: 4, planId: 40, templateId: 1, templateName: "Vocal Coach", zoneId: 2, spaceId: 20, contestantId: 202, status: "pending", durationOverrideMin: 30 },
      { id: 11, planId: 40, templateId: 2, templateName: "Plató 7", zoneId: 1, spaceId: 10, contestantId: 101, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [1] },
      { id: 12, planId: 40, templateId: 2, templateName: "Plató 7", zoneId: 1, spaceId: 10, contestantId: 201, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [2] },
      { id: 13, planId: 40, templateId: 2, templateName: "Plató 7", zoneId: 1, spaceId: 10, contestantId: 102, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [3] },
      { id: 14, planId: 40, templateId: 2, templateName: "Plató 7", zoneId: 1, spaceId: 10, contestantId: 202, status: "pending", durationOverrideMin: 30, dependsOnTaskIds: [4] },
    ] as any,
    ...overrides,
  };
  const baseline: EngineOutput = {
    feasible: true,
    complete: true,
    hardFeasible: true,
    plannedTasks: [
      { taskId: 1, startPlanned: "08:00", endPlanned: "08:30", assignedResources: [501] },
      { taskId: 2, startPlanned: "08:30", endPlanned: "09:00", assignedResources: [502] },
      { taskId: 3, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [501] },
      { taskId: 4, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [502] },
      { taskId: 11, startPlanned: "10:00", endPlanned: "10:30", assignedResources: [] },
      { taskId: 12, startPlanned: "10:30", endPlanned: "11:00", assignedResources: [] },
      { taskId: 13, startPlanned: "11:00", endPlanned: "11:30", assignedResources: [] },
      { taskId: 14, startPlanned: "11:30", endPlanned: "12:00", assignedResources: [] },
    ],
    unplanned: [],
  };
  return { input, baseline };
};

const diagnosticsFor = (input: EngineInput, baseline: EngineOutput): PipelineBuilderDiagnostics => {
  const score = scoreCandidateSolution(input, baseline);
  return {
    attempted: false,
    candidatesGenerated: 0,
    reason: "",
    rejectedReasons: [],
    before: { mainStageGapMinutes: score.mainStageGapMinutes },
    after: {},
  };
};

// Phase C builds a complete, hard-valid main-stage pipeline and groups the two coach waves.
{
  const { input, baseline } = buildScenario();
  const diagnostics = diagnosticsFor(input, baseline);
  const candidates = generatePipelineBuilderCandidates(input, baseline, diagnostics);
  assert.equal(diagnostics.attempted, true);
  assert.ok(candidates.length > 0);
  const grouped = candidates.find((candidate) => candidate.kind === "pipeline_coachA_first");
  assert.ok(grouped);
  assert.deepEqual(grouped.talentOrder, [101, 102, 201, 202]);
  const metrics = calculateOperationalMetrics(input, grouped.output);
  assert.equal(metrics.mainStageGapMinutes, 0);
  assert.equal(validateHardConstraints(input, grouped.output).hardConstraintViolations, 0);
  assert.equal(grouped.output.plannedTasks.length, baseline.plannedTasks.length);

  const plannedById = new Map(grouped.output.plannedTasks.map((task) => [task.taskId, task]));
  for (const [feederId, mainId] of [[1, 11], [2, 12], [3, 13], [4, 14]]) {
    assert.ok(toMinutes(plannedById.get(feederId)!.endPlanned)! <= toMinutes(plannedById.get(mainId)!.startPlanned)!);
  }
  assert.ok(scoreCandidateSolution(input, grouped.output).maxCoachGapMinutes < scoreCandidateSolution(input, baseline).maxCoachGapMinutes);
}

// A gapped greedy backbone is rebuilt into one continuous Main Stage sequence.
{
  const scenario = buildScenario();
  scenario.baseline.plannedTasks = scenario.baseline.plannedTasks.map((task) => {
    if (task.taskId === 13) return { ...task, startPlanned: "11:15", endPlanned: "11:45" };
    if (task.taskId === 14) return { ...task, startPlanned: "11:45", endPlanned: "12:15" };
    return task;
  });
  const candidates = generatePipelineBuilderCandidates(scenario.input, scenario.baseline);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => calculateOperationalMetrics(scenario.input, candidate.output).mainStageGapMinutes === 0));
}

// Locks and executed work are never moved; variants requiring such a move are rejected.
{
  const scenario = buildScenario();
  scenario.input.locks = [{ id: 1, planId: 40, taskId: 11, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" }];
  const diagnostics = diagnosticsFor(scenario.input, scenario.baseline);
  const candidates = generatePipelineBuilderCandidates(scenario.input, scenario.baseline, diagnostics);
  for (const candidate of candidates) {
    assert.equal(candidate.output.plannedTasks.find((task) => task.taskId === 11)?.startPlanned, "10:00");
  }
  assert.ok(diagnostics.rejectedReasons.includes("locked_or_executed_task"));
}

// A dependency that cannot remain ordered rejects the candidate with an explicit reason.
{
  const scenario = buildScenario();
  scenario.input.tasks = scenario.input.tasks.map((task) => Number(task.id) === 11
    ? { ...task, dependsOnTaskIds: [1, 99] }
    : task).concat([{ id: 99, planId: 40, templateId: 9, templateName: "Approval", zoneId: 3, spaceId: 30, contestantId: 999, status: "pending", startPlanned: "12:00", endPlanned: "12:30", durationOverrideMin: 30 } as any]);
  scenario.baseline.plannedTasks.push({ taskId: 99, startPlanned: "12:00", endPlanned: "12:30", assignedResources: [] });
  const diagnostics = diagnosticsFor(scenario.input, scenario.baseline);
  assert.equal(generatePipelineBuilderCandidates(scenario.input, scenario.baseline, diagnostics).length, 0);
  assert.ok(diagnostics.rejectedReasons.includes("dependency_violation"));
}

// Strong coach gap/split improvements outrank a smaller switch/talent-idle improvement.
{
  const { input, baseline } = buildScenario();
  const base = scoreCandidateSolution(input, baseline);
  const pipeline = { ...base, coachSplitDayPenalty: 0, maxCoachGapMinutes: 10, coachSwitchPenalty: 100, talentIdlePenalty: 100 };
  const localSwitch = { ...base, coachSplitDayPenalty: 1, maxCoachGapMinutes: 60, coachSwitchPenalty: 0, talentIdlePenalty: 0 };
  assert.ok(compareCandidateScores(pipeline, localSwitch) > 0);
}

// Selection exposes Phase C metadata and an operational candidate reason.
{
  const { input, baseline } = buildScenario();
  const selected = runPipelineBuilderSelection(input, baseline, "phaseA_greedy");
  assert.equal(selected.meta.pipelineBuilderAttempted, true);
  assert.ok(Number(selected.meta.pipelineCandidatesGenerated) > 0);
  assert.ok(selected.meta.pipelineBefore);
  assert.ok(selected.meta.pipelineAfter);
  assert.equal(selected.meta.pipelineAccepted, true);
  assert.match(String(selected.meta.candidateSelectionReason), /pipeline_builder selected: (lower coach gap|lower coach split|better operational quality)/);
}
