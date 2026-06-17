import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput, EngineOutput, TaskInput } from "../../types";
import type { V4StrategicAnalysis } from "../analysis";
import { evaluateV4PlanQuality } from "../quality";
import { improveMainFlowContinuity } from "./index";

const task = (id: number, extra: Partial<TaskInput> = {}): TaskInput => ({
  id,
  planId: 1,
  templateId: id,
  templateName: `Task ${id}`,
  contestantId: id,
  status: "pending",
  durationOverrideMin: 30,
  spaceId: 10,
  ...extra,
});

const input = (tasks: TaskInput[], locks = [] as EngineInput["locks"]): EngineInput => ({
  planId: 1,
  workDay: { start: "09:00", end: "12:00" },
  mealMode: "flexible_meal_window",
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 2,
  tasks,
  locks,
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [],
});

const analysis = (): V4StrategicAnalysis => ({
  mainFlow: { id: 10, name: "Main", priority: 10, configuration: {} },
  continuousSpaces: [],
  criticalTalents: [],
  criticalResources: [],
  criticalSpaces: [],
  mainFlowCandidates: [],
  mainFlowSequence: [],
  topCriticalTalents: [],
  costOfDelayRanking: [],
  pressureScores: { talentPressureScore: 0, resourcePressureScore: 0, spacePressureScore: 0 },
  riskScore: "LOW",
  warnings: [],
});

test("improveMainFlowContinuity safely places an unplanned pending main-flow task inside an internal gap", () => {
  const engineInput = input([task(1), task(2), task(3)]);
  const output: EngineOutput = {
    feasible: true,
    complete: false,
    hardFeasible: true,
    plannedTasks: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30" },
      { taskId: 3, startPlanned: "10:00", endPlanned: "10:30" },
    ],
    unplanned: [{ taskId: 2, reason: { code: "UNPLANNED", message: "not planned" } as any }],
  };
  const strategicAnalysis = analysis();
  const quality = evaluateV4PlanQuality(engineInput, output, strategicAnalysis);

  const result = improveMainFlowContinuity(engineInput, output, strategicAnalysis, quality);

  assert.equal(result.improvementDiagnostics.applied, true);
  assert.equal(result.improvementDiagnostics.gapMinutesBefore, 30);
  assert.equal(result.improvementDiagnostics.gapMinutesAfter, 0);
  assert.deepEqual(result.improvementDiagnostics.moves?.map((move) => move.taskId), [2]);
  assert.ok(result.output.plannedTasks.some((planned) => planned.taskId === 2 && planned.startPlanned === "09:30" && planned.endPlanned === "10:00"));
});

test("improveMainFlowContinuity returns the original plan when the only candidate is locked", () => {
  const engineInput = input([task(1), task(2), task(3)], [{ id: 1, planId: 1, taskId: 2, lockType: "full", lockedStart: "11:00", lockedEnd: "11:30" }]);
  const output: EngineOutput = {
    feasible: true,
    complete: false,
    hardFeasible: true,
    plannedTasks: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30" },
      { taskId: 3, startPlanned: "10:00", endPlanned: "10:30" },
    ],
    unplanned: [{ taskId: 2, reason: { code: "UNPLANNED", message: "not planned" } as any }],
  };
  const strategicAnalysis = analysis();
  const quality = evaluateV4PlanQuality(engineInput, output, strategicAnalysis);

  const result = improveMainFlowContinuity(engineInput, output, strategicAnalysis, quality);

  assert.equal(result.improvementDiagnostics.applied, false);
  assert.equal(result.output, output);
});
