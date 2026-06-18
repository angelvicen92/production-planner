import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput, EngineOutput, TaskInput } from "../../types";
import type { V4StrategicAnalysis } from "../analysis";
import { evaluateV4PlanQuality } from "../quality";
import { isV4QualityBetter, optimizeV4PlanPostSelection } from "./index";

const task = (id: number, extra: Partial<TaskInput> = {}): TaskInput => ({
  id,
  planId: 1,
  templateId: id,
  templateName: `Task ${id}`,
  contestantId: id,
  status: "pending",
  durationOverrideMin: 30,
  spaceId: id,
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
  mainFlow: null,
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

test("V4 post optimizer reduces makespan with a hard-valid pending move", () => {
  const engineInput = input([task(1), task(2)]);
  const output: EngineOutput = {
    feasible: true,
    complete: true,
    hardFeasible: true,
    plannedTasks: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30" },
      { taskId: 2, startPlanned: "10:00", endPlanned: "10:30" },
    ],
    unplanned: [],
  };
  const strategicAnalysis = analysis();
  const quality = evaluateV4PlanQuality(engineInput, output, strategicAnalysis);

  const result = optimizeV4PlanPostSelection(engineInput, output, strategicAnalysis, quality, { postOptimizer: { maxCandidatesPerPass: 20 } } as any);

  assert.equal(result.diagnostics.applied, true);
  assert.ok(result.diagnostics.movesAccepted > 0);
  assert.equal(result.diagnostics.makespanBefore, "10:30");
  assert.ok((result.quality.makespan.lastTaskEnd ?? "99:99") < "10:30");
  assert.ok(isV4QualityBetter(result.quality, quality));
});

test("V4 post optimizer never moves done, in-progress or real locked tasks", () => {
  const engineInput = input([
    task(1),
    task(2, { status: "done", startPlanned: "10:00", endPlanned: "10:30" }),
    task(3, { status: "in_progress", startPlanned: "10:30", endPlanned: "11:00" }),
    task(4),
  ], [{ id: 10, planId: 1, taskId: 4, lockType: "full", lockedStart: "11:00", lockedEnd: "11:30" }]);
  const output: EngineOutput = {
    feasible: true,
    complete: true,
    hardFeasible: true,
    plannedTasks: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30" },
      { taskId: 2, startPlanned: "10:00", endPlanned: "10:30" },
      { taskId: 3, startPlanned: "10:30", endPlanned: "11:00" },
      { taskId: 4, startPlanned: "11:00", endPlanned: "11:30" },
    ],
    unplanned: [],
  };
  const strategicAnalysis = analysis();
  const quality = evaluateV4PlanQuality(engineInput, output, strategicAnalysis);

  const result = optimizeV4PlanPostSelection(engineInput, output, strategicAnalysis, quality, { postOptimizer: { maxCandidatesPerPass: 40 } } as any);

  const byId = new Map(result.output.plannedTasks.map((planned) => [planned.taskId, planned]));
  assert.equal(byId.get(2)?.startPlanned, "10:00");
  assert.equal(byId.get(3)?.startPlanned, "10:30");
  assert.equal(byId.get(4)?.startPlanned, "11:00");
});
