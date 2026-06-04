import assert from "node:assert/strict";
import { generatePlanV3 } from "../index";
import {
  countContestantOverlaps,
  countContestantWindowViolations,
  countDependencyViolations,
  countExclusiveResourceOverlaps,
  countExecutedTaskMoved,
  countLockedTaskMoved,
  countMealCrossings,
  countSpaceOverlaps,
} from "./metrics";
import { benchmarkScenarios, scenarioById } from "./scenarios";

const plannedById = (output: any) => new Map((output.plannedTasks ?? []).map((planned: any) => [Number(planned.taskId), planned]));
const run = (id: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I") => {
  const scenario = scenarioById.get(id);
  assert.ok(scenario, `scenario ${id} should exist`);
  const output = generatePlanV3(scenario.input, { timeLimitMs: 0 });
  return { scenario, output };
};

for (const scenario of benchmarkScenarios) {
  assert.ok(scenario.id, "scenario id is required");
  assert.ok(scenario.name, `scenario ${scenario.id} name is required`);
  assert.ok(scenario.description, `scenario ${scenario.id} description is required`);
  assert.ok(scenario.operationalExpectation, `scenario ${scenario.id} expectation is required`);
  assert.ok(Array.isArray(scenario.riskNotes), `scenario ${scenario.id} risk notes are required`);
  assert.ok(Array.isArray(scenario.input.tasks), `scenario ${scenario.id} input must be compatible with generatePlanV3`);
}

// Escenario E — invariantes hard de ejecución y locks.
{
  const { scenario, output } = run("E");
  assert.equal(output.hardFeasible, true);
  assert.equal(countExecutedTaskMoved(scenario.input, output), 0, "done/in_progress tasks must not move");
  assert.equal(countLockedTaskMoved(scenario.input, output), 0, "manual time locks must be respected");

  const planned = plannedById(output);
  const assertNotMovedIfReturned = (taskId: number, start: string, end: string, label: string) => {
    const row = planned.get(taskId) as any;
    if (!row) return;
    assert.deepEqual({ start: row.startPlanned, end: row.endPlanned }, { start, end }, label);
  };
  assertNotMovedIfReturned(5001, "09:00", "09:30", "done task stays fixed if returned by the engine");
  assertNotMovedIfReturned(5002, "09:30", "10:00", "in_progress task stays fixed if returned by the engine");
  assertNotMovedIfReturned(5003, "10:00", "10:30", "locked pending task stays fixed if returned by the engine");
}

// Disponibilidad de concursantes: los escenarios completos no deben planificar fuera de ventana.
for (const id of ["A", "B", "C", "D", "F", "G", "H"] as const) {
  const { scenario, output } = run(id);
  if (output.complete) {
    assert.equal(countContestantWindowViolations(scenario.input, output), 0, `scenario ${id} contestant windows`);
  }
}

// No solapar concursante ni espacio en escenarios completos.
for (const id of ["A", "B", "C", "D", "E", "F", "G", "H"] as const) {
  const { scenario, output } = run(id);
  if (output.complete) {
    assert.equal(countContestantOverlaps(scenario.input, output), 0, `scenario ${id} contestant overlaps`);
    assert.equal(countSpaceOverlaps(scenario.input, output), 0, `scenario ${id} space overlaps`);
  }
}

// Recursos exclusivos modelados como byItem en escenario D.
{
  const { scenario, output } = run("D");
  if (output.complete) {
    assert.equal(countExclusiveResourceOverlaps(scenario.input, output), 0, "exclusive coach resources must not overlap");
  }
}

// Comida global modelada como bloque hard mediante input.meal en escenario F.
{
  const { scenario, output } = run("F");
  if (output.complete) {
    assert.equal(countMealCrossings(scenario.input, output), 0, "tasks must not cross global meal block");
  }
}

// Dependencias modeladas en escenarios C y D.
for (const id of ["C", "D"] as const) {
  const { scenario, output } = run(id);
  if (output.complete) {
    assert.equal(countDependencyViolations(scenario.input, output), 0, `scenario ${id} dependencies`);
  }
}

// Escenario G — backtracking limitado debe activarse y aceptar una solución completa.
{
  const { scenario, output } = run("G");
  assert.equal(output.complete, true, "scenario G should be complete after limited backtracking");
  assert.equal(output.v3Meta?.backtrackingAttempted, true, "scenario G should attempt backtracking");
  assert.equal(output.v3Meta?.backtrackingAccepted, true, "scenario G should accept backtracking");
  assert.equal(output.v3Meta?.solutionSource, "phaseA_backtracking", "scenario G source");
  assert.equal(countContestantWindowViolations(scenario.input, output), 0, "scenario G contestant windows");
  assert.equal(countSpaceOverlaps(scenario.input, output), 0, "scenario G space overlaps");
}

// Escenario H — selección comparativa elige una alternativa válida mejor.
{
  const { scenario, output } = run("H");
  assert.equal(output.complete, true, "scenario H should be complete");
  assert.ok((output.v3Meta?.candidateSolutionsEvaluated ?? 0) >= 2, "scenario H should compare candidates");
  assert.equal(output.v3Meta?.solutionSource, "phaseA_backtracking", "scenario H source");
  assert.match(String(output.v3Meta?.candidateSelectionReason ?? ""), /main-stage gaps|gap/, "scenario H selection reason");
  assert.equal(countContestantWindowViolations(scenario.input, output), 0, "scenario H contestant windows");
  assert.equal(countSpaceOverlaps(scenario.input, output), 0, "scenario H space overlaps");
}

// Escenario I — stress sintético realista: puede ser complete o partial, pero nunca debe aceptar violaciones hard.
{
  const { scenario, output } = run("I");
  const contestantIds = new Set((scenario.input.tasks ?? []).map((task: any) => Number(task.contestantId)).filter((id: number) => Number.isFinite(id) && id > 0));
  assert.ok(contestantIds.size >= 12 && contestantIds.size <= 18, "scenario I should model 12-18 talents");
  assert.ok((scenario.input.tasks ?? []).length >= 60, "scenario I should include at least 60 tasks");
  assert.ok((scenario.input.planResourceItems ?? []).some((resource: any) => String(resource.name).includes("Coach")), "scenario I should include coaches");
  assert.ok(Number(scenario.input.optimizerMainZoneId ?? 0) > 0, "scenario I should define a main stage zone");
  assert.ok((scenario.input.locks ?? []).length >= 1, "scenario I should include manual locks");
  assert.ok((scenario.input.tasks ?? []).some((task: any) => task.status === "done"), "scenario I should include a done task");
  assert.ok((scenario.input.tasks ?? []).some((task: any) => task.status === "in_progress"), "scenario I should include an in_progress task");

  assert.equal(countContestantOverlaps(scenario.input, output), 0, "scenario I contestant overlaps");
  assert.equal(countSpaceOverlaps(scenario.input, output), 0, "scenario I space overlaps");
  assert.equal(countExclusiveResourceOverlaps(scenario.input, output), 0, "scenario I exclusive resource overlaps");
  assert.equal(countExecutedTaskMoved(scenario.input, output), 0, "scenario I done/in_progress tasks must not move");
  assert.equal(countLockedTaskMoved(scenario.input, output), 0, "scenario I manual locks must be respected");
  assert.equal(countMealCrossings(scenario.input, output), 0, "scenario I tasks must not cross hard meal block");
  assert.equal(countContestantWindowViolations(scenario.input, output), 0, "scenario I contestant availability windows");
  assert.equal(countDependencyViolations(scenario.input, output), 0, "scenario I dependencies");
}

console.log("engine/v3/benchmarks/scenarios.spec.ts: OK");
