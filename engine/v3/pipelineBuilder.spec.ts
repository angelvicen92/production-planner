import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput, EngineOutput } from "../types";
import { runPipelineBuilderSelection } from "./index";
import { validateHardConstraints } from "./hardValidation";
import { calculateOperationalMetrics, toMinutes } from "./metrics";
import { generatePipelineBuilderCandidates, type PipelineBuilderDiagnostics } from "./pipelineBuilder";
import { compareCandidateScores, scoreCandidateSolution } from "./solutionScoring";

const hhmm = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

type ScenarioOptions = { talentCount?: number; unmapped?: number[] };

const buildScenario = ({ talentCount = 8, unmapped = [] }: ScenarioOptions = {}): { input: EngineInput; baseline: EngineOutput } => {
  const talentIds = Array.from({ length: talentCount }, (_, index) => 101 + index);
  const mainStart = 12 * 60;
  const feederStart = 8 * 60;
  const tasks: any[] = [];
  const plannedTasks: EngineOutput["plannedTasks"] = [];

  talentIds.forEach((talentId, index) => {
    const feederId = 1_000 + talentId;
    const mainId = 2_000 + talentId;
    const coachId = index % 2 === 0 ? 501 : 502;
    if (!unmapped.includes(talentId)) {
      tasks.push({
        id: feederId,
        planId: 40,
        templateId: 1,
        templateName: "Vocal Coach",
        zoneId: 2,
        spaceId: 20,
        contestantId: talentId,
        contestantName: `Talent ${talentId}`,
        status: "pending",
        durationOverrideMin: 20,
      });
      plannedTasks.push({
        taskId: feederId,
        startPlanned: hhmm(feederStart + index * 20),
        endPlanned: hhmm(feederStart + (index + 1) * 20),
        assignedResources: [coachId],
      });
    }
    tasks.push({
      id: mainId,
      planId: 40,
      templateId: 2,
      templateName: "Main Stage",
      zoneId: 1,
      spaceId: 10,
      contestantId: talentId,
      contestantName: `Talent ${talentId}`,
      status: "pending",
      durationOverrideMin: 20,
      dependsOnTaskIds: unmapped.includes(talentId) ? [] : [feederId],
    });
    plannedTasks.push({
      taskId: mainId,
      startPlanned: hhmm(mainStart + index * 20),
      endPlanned: hhmm(mainStart + (index + 1) * 20),
      assignedResources: [],
    });
  });

  return {
    input: {
      planId: 40,
      workDay: { start: "08:00", end: "20:00" },
      meal: { start: "19:00", end: "20:00" },
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
      tasks,
    } as EngineInput,
    baseline: {
      feasible: true,
      complete: true,
      hardFeasible: true,
      plannedTasks,
      unplanned: [],
    },
  };
};

const diagnosticsFor = (input: EngineInput, baseline: EngineOutput): PipelineBuilderDiagnostics => {
  const score = scoreCandidateSolution(input, baseline);
  return {
    attempted: false,
    candidatesGenerated: 0,
    reason: "generator_not_invoked",
    rejectedReasons: [],
    before: { mainStageGapMinutes: score.mainStageGapMinutes },
    after: {},
    mappedTalents: [],
    unmappedTalents: [],
    movedTaskIds: [],
    stableTaskIds: [],
    feederOutcomes: [],
    repairAttempted: false,
    repairCandidatesGenerated: 0,
    repairAccepted: false,
    conflictDetails: [],
  };
};

const mainOrder = (input: EngineInput, output: EngineOutput): number[] => {
  const taskById = new Map(input.tasks.map((task) => [Number(task.id), task]));
  return [...output.plannedTasks]
    .filter((planned) => Number(taskById.get(Number(planned.taskId))?.zoneId) === 1)
    .sort((a, b) => (toMinutes(a.startPlanned) ?? 0) - (toMinutes(b.startPlanned) ?? 0))
    .map((planned) => Number(taskById.get(Number(planned.taskId))?.contestantId));
};

test("pipeline metadata defaults are observable when the generator is not invoked", () => {
  const { input, baseline } = buildScenario();
  const diagnostics = diagnosticsFor(input, baseline);
  assert.equal(diagnostics.attempted, false);
  assert.equal(diagnostics.reason, "generator_not_invoked");
  assert.deepEqual(diagnostics.mappedTalents, []);
  assert.deepEqual(diagnostics.movedTaskIds, []);
});

test("a fully mapped pipeline generates continuous hard-valid coach-wave candidates", () => {
  const { input, baseline } = buildScenario();
  const diagnostics = diagnosticsFor(input, baseline);
  const candidates = generatePipelineBuilderCandidates(input, baseline, diagnostics);
  assert.equal(diagnostics.attempted, true);
  assert.ok(candidates.length > 0);
  const grouped = candidates.find((candidate) => candidate.kind === "pipeline_coachA_first");
  assert.ok(grouped);
  assert.deepEqual(grouped.talentOrder, [101, 103, 105, 107, 102, 104, 106, 108]);
  assert.equal(calculateOperationalMetrics(input, grouped.output).mainStageGapMinutes, 0);
  assert.equal(validateHardConstraints(input, grouped.output).hardConstraintViolations, 0);
  assert.equal(grouped.output.plannedTasks.length, baseline.plannedTasks.length);
  assert.ok(grouped.feederOutcomes.includes("feeder_relocated"));
  assert.ok(scoreCandidateSolution(input, grouped.output).maxCoachGapMinutes < scoreCandidateSolution(input, baseline).maxCoachGapMinutes);
});

test("partial mapping generates candidates and keeps unmapped talents in stable holes", () => {
  const { input, baseline } = buildScenario({ talentCount: 10, unmapped: [103, 108] });
  const diagnostics = diagnosticsFor(input, baseline);
  const candidates = generatePipelineBuilderCandidates(input, baseline, diagnostics);
  assert.ok(candidates.length > 0);
  assert.equal(diagnostics.reason, "partial_mapping_used");
  assert.equal(diagnostics.mappedTalents.length, 8);
  assert.deepEqual(diagnostics.unmappedTalents, ["Talent 103", "Talent 108"]);
  const grouped = candidates.find((candidate) => candidate.kind === "pipeline_coachA_first")!;
  const order = mainOrder(input, grouped.output);
  assert.equal(order[2], 103);
  assert.equal(order[7], 108);
  assert.ok(order.indexOf(103) < order.indexOf(108));
  assert.equal(calculateOperationalMetrics(input, grouped.output).mainStageGapMinutes, 0);
  assert.equal(validateHardConstraints(input, grouped.output).hardConstraintViolations, 0);
});

test("an unrelocatable protected feeder can remain stable without aborting the candidate", () => {
  const { input, baseline } = buildScenario();
  input.locks = [{
    id: 1,
    planId: 40,
    taskId: 1_102,
    lockType: "time",
    lockedStart: baseline.plannedTasks.find((task) => task.taskId === 1_102)!.startPlanned,
    lockedEnd: baseline.plannedTasks.find((task) => task.taskId === 1_102)!.endPlanned,
  }];
  const diagnostics = diagnosticsFor(input, baseline);
  const candidates = generatePipelineBuilderCandidates(input, baseline, diagnostics);
  assert.ok(candidates.length > 0);
  const retained = candidates.find((candidate) => candidate.feederOutcomes.includes("feeder_kept_stable"));
  assert.ok(retained);
  assert.equal(retained.output.plannedTasks.find((task) => task.taskId === 1_102)?.startPlanned,
    baseline.plannedTasks.find((task) => task.taskId === 1_102)?.startPlanned);
  assert.equal(validateHardConstraints(input, retained.output).hardConstraintViolations, 0);
});

test("fewer than six mapped talents returns a concrete reason", () => {
  const { input, baseline } = buildScenario({ talentCount: 8, unmapped: [101, 102, 103] });
  const diagnostics = diagnosticsFor(input, baseline);
  assert.equal(generatePipelineBuilderCandidates(input, baseline, diagnostics).length, 0);
  assert.equal(diagnostics.reason, "not_enough_mapped_talents");
});

test("strong coach gap or split improvements outrank smaller local improvements", () => {
  const { input, baseline } = buildScenario();
  const base = scoreCandidateSolution(input, baseline);
  const pipeline = { ...base, coachSplitDayPenalty: 0, maxCoachGapMinutes: 10, coachSwitchPenalty: 100, talentIdlePenalty: 100 };
  const localSwitch = { ...base, coachSplitDayPenalty: 1, maxCoachGapMinutes: 60, coachSwitchPenalty: 0, talentIdlePenalty: 0 };
  assert.ok(compareCandidateScores(pipeline, localSwitch) > 0);
});

test("selection exports pipeline diagnostics and a premium candidate reason", () => {
  const { input, baseline } = buildScenario();
  const selected = runPipelineBuilderSelection(input, baseline, "phaseA_greedy");
  assert.equal(selected.meta.pipelineBuilderAttempted, true);
  assert.ok(Number(selected.meta.pipelineCandidatesGenerated) > 0);
  assert.equal(selected.meta.pipelineAccepted, true);
  assert.equal(selected.meta.pipelineMappedTalents?.length, 8);
  assert.ok((selected.meta.pipelineMovedTasks?.length ?? 0) > 0);
  assert.match(String(selected.meta.candidateSelectionReason), /pipeline_builder selected: (lower coach max gap|lower coach split|better operational quality)/);
});

test("real-like 19-talent partial mapping is observable and produces a concrete outcome", () => {
  const { input, baseline } = buildScenario({ talentCount: 19, unmapped: [104, 110, 117] });
  const diagnostics = diagnosticsFor(input, baseline);
  const candidates = generatePipelineBuilderCandidates(input, baseline, diagnostics);
  assert.equal(diagnostics.attempted, true);
  assert.equal(diagnostics.mappedTalents.length, 16);
  assert.equal(diagnostics.unmappedTalents.length, 3);
  assert.ok(candidates.length > 0 || [
    "candidate_failed_hard_validation",
    "candidate_would_create_main_stage_gap",
    "feeders_unschedulable",
    "all_candidates_rejected",
  ].includes(diagnostics.reason));
  if (candidates.length > 0) {
    assert.equal(diagnostics.reason, "partial_mapping_used");
    assert.ok(candidates.every((candidate) => validateHardConstraints(input, candidate.output).hardConstraintViolations === 0));
    assert.ok(candidates.every((candidate) => calculateOperationalMetrics(input, candidate.output).mainStageGapMinutes === 0));
  }
});

const addAuxiliary = (
  scenario: ReturnType<typeof buildScenario>,
  options: { id: number; start: number; end: number; spaceId?: number; resources?: number[]; status?: string; name?: string },
): void => {
  scenario.input.tasks.push({
    id: options.id,
    planId: 40,
    templateId: 90,
    templateName: options.name ?? "Auxiliary blocker",
    zoneId: 9,
    spaceId: options.spaceId ?? 30,
    status: options.status ?? "pending",
    durationOverrideMin: options.end - options.start,
    startPlanned: hhmm(options.start),
    endPlanned: hhmm(options.end),
  } as any);
  scenario.baseline.plannedTasks.push({
    taskId: options.id,
    startPlanned: hhmm(options.start),
    endPlanned: hhmm(options.end),
    assignedResources: options.resources ?? [],
  });
};

test("resource conflicts expose compact pipelineConflictDetails and can be repaired", () => {
  const scenario = buildScenario();
  addAuxiliary(scenario, { id: 9_001, start: 11 * 60 + 40, end: 12 * 60, resources: [501] });
  const diagnostics = diagnosticsFor(scenario.input, scenario.baseline);
  const candidates = generatePipelineBuilderCandidates(scenario.input, scenario.baseline, diagnostics);
  assert.equal(diagnostics.repairAttempted, true);
  assert.ok(diagnostics.conflictDetails.some((detail) => detail.violationCode === "RESOURCE_OVERLAP"
    && detail.resourceName === "Coach A" && detail.taskNames.length > 0));
  assert.ok(candidates.some((candidate) => validateHardConstraints(scenario.input, candidate.output).hardValidationPassed));
  assert.ok(diagnostics.repairCandidatesGenerated > 0);
});

test("a movable resource blocker is shifted and the repaired candidate remains hard-valid", () => {
  const scenario = buildScenario();
  addAuxiliary(scenario, { id: 9_002, start: 11 * 60 + 40, end: 12 * 60, resources: [501] });
  const candidates = generatePipelineBuilderCandidates(scenario.input, scenario.baseline, diagnosticsFor(scenario.input, scenario.baseline));
  const repaired = candidates.find((candidate) => candidate.repaired && candidate.movedTaskIds.includes(9_002));
  assert.ok(repaired);
  assert.notEqual(repaired.output.plannedTasks.find((task) => task.taskId === 9_002)?.startPlanned, "11:40");
  assert.equal(validateHardConstraints(scenario.input, repaired.output).hardConstraintViolations, 0);
});

test("a movable space blocker is shifted and the repaired candidate remains hard-valid", () => {
  const scenario = buildScenario();
  addAuxiliary(scenario, { id: 9_003, start: 11 * 60 + 40, end: 12 * 60, spaceId: 20 });
  const diagnostics = diagnosticsFor(scenario.input, scenario.baseline);
  const candidates = generatePipelineBuilderCandidates(scenario.input, scenario.baseline, diagnostics);
  const repaired = candidates.find((candidate) => candidate.repaired && candidate.movedTaskIds.includes(9_003));
  assert.ok(repaired);
  assert.ok(diagnostics.conflictDetails.some((detail) => detail.violationCode === "SPACE_OVERLAP" && detail.spaceId === 20));
  assert.equal(validateHardConstraints(scenario.input, repaired.output).hardConstraintViolations, 0);
});

test("locked blockers are not moved and expose a concrete repair reason", () => {
  const scenario = buildScenario();
  const target = scenario.baseline.plannedTasks.find((task) => task.taskId === 2_103)!;
  target.assignedResources = [700];
  scenario.input.planResourceItems?.push({ id: 700, resourceItemId: 9700, typeId: 99, typeCode: "EXCLUSIVE", name: "Locked rig", isAvailable: true } as any);
  addAuxiliary(scenario, { id: 9_004, start: 12 * 60 + 20, end: 12 * 60 + 40, resources: [700] });
  scenario.input.locks = [{ id: 44, planId: 40, taskId: 9_004, lockType: "time", lockedStart: "12:20", lockedEnd: "12:40" }];
  const diagnostics = diagnosticsFor(scenario.input, scenario.baseline);
  generatePipelineBuilderCandidates(scenario.input, scenario.baseline, diagnostics);
  assert.ok(diagnostics.rejectedReasons.includes("repair_blocked_by_locked_or_executed"));
  assert.ok(diagnostics.conflictDetails.some((detail) => detail.lockedOrExecutedTaskIds.includes(9_004)
    && detail.repairResult === "repair_blocked_by_locked_or_executed"));
});

test("repair never moves transport IN/OUT tasks", () => {
  const scenario = buildScenario();
  addAuxiliary(scenario, { id: 9_005, start: 11 * 60 + 40, end: 12 * 60, resources: [501], name: "Transport IN" });
  const candidates = generatePipelineBuilderCandidates(scenario.input, scenario.baseline, diagnosticsFor(scenario.input, scenario.baseline));
  for (const candidate of candidates) {
    assert.equal(candidate.output.plannedTasks.find((task) => task.taskId === 9_005)?.startPlanned, "11:40");
  }
});

test("repair does not open a Main Stage gap", () => {
  const scenario = buildScenario();
  addAuxiliary(scenario, { id: 9_006, start: 11 * 60 + 40, end: 12 * 60, spaceId: 20 });
  const candidates = generatePipelineBuilderCandidates(scenario.input, scenario.baseline, diagnosticsFor(scenario.input, scenario.baseline));
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => calculateOperationalMetrics(scenario.input, candidate.output).mainStageGapMinutes === 0));
});

test("bounded depth-two micro cascade resolves a simple chained conflict", () => {
  const scenario = buildScenario();
  addAuxiliary(scenario, { id: 9_007, start: 11 * 60 + 20, end: 11 * 60 + 40, spaceId: 20 });
  addAuxiliary(scenario, { id: 9_008, start: 11 * 60 + 40, end: 12 * 60, spaceId: 20 });
  const diagnostics = diagnosticsFor(scenario.input, scenario.baseline);
  const candidates = generatePipelineBuilderCandidates(scenario.input, scenario.baseline, diagnostics);
  assert.ok(candidates.some((candidate) => candidate.repaired && validateHardConstraints(scenario.input, candidate.output).hardValidationPassed));
  assert.ok(diagnostics.repairCandidatesGenerated > 0);
});

test("a repaired lower-gap pipeline wins selection over the current baseline", () => {
  const scenario = buildScenario();
  addAuxiliary(scenario, { id: 9_009, start: 11 * 60 + 40, end: 12 * 60, resources: [501] });
  const selected = runPipelineBuilderSelection(scenario.input, scenario.baseline, "operational_neighborhood");
  assert.equal(selected.meta.pipelineAccepted, true);
  assert.equal(selected.meta.pipelineRepairAccepted, true);
  assert.match(String(selected.meta.candidateSelectionReason), /pipeline_builder selected: repaired (lower coach gap|lower coach split|better operational quality)/);
});

test("pipeline conflict diagnostics payload is capped", () => {
  const scenario = buildScenario({ talentCount: 19 });
  for (let index = 0; index < 12; index += 1) {
    addAuxiliary(scenario, { id: 9_100 + index, start: 11 * 60 + 40 + index * 20, end: 12 * 60 + index * 20, spaceId: 20 });
  }
  const diagnostics = diagnosticsFor(scenario.input, scenario.baseline);
  generatePipelineBuilderCandidates(scenario.input, scenario.baseline, diagnostics);
  assert.ok(diagnostics.conflictDetails.length <= 10);
  assert.ok(diagnostics.conflictDetails.every((detail) => detail.taskIds.length <= 6 && detail.taskNames.length <= 6));
});
