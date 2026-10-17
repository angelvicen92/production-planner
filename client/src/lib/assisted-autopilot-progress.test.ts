import assert from "node:assert/strict";
import test from "node:test";
import type { AutopilotProgress } from "@shared/assistedAutopilot";
import { projectAutopilotProgress } from "./assisted-autopilot-progress";

const progress: AutopilotProgress = {
  phase: "GENERATING", stage: 5, completed: 47, total: 266,
  scope: { kind: "TASK_IDS", taskIds: [1, 2, 3] }, scopeTaskIds: [1, 2, 3],
  runId: 19, stopRequested: false, message: "internal selector / run 19",
};
const tasks = [
  { id: 1, spaceId: 7, template: { name: "Grabación" } },
  { id: 2, spaceId: 7, template: { name: "Estilismo de entrada" } },
  { id: 3, spaceId: 7, template: { name: "Grabación" } },
];
const spaces = [{ id: 7, name: "Plató 7" }];

test("committed counts alone drive progress through proposal, validation and acceptance", () => {
  for (const phase of ["GENERATING", "APPLYING", "VALIDATING", "ACCEPTING", "VERIFYING"] as const) {
    const view = projectAutopilotProgress({ ...progress, phase }, tasks, spaces);
    assert.equal(view.completed, 47); assert.equal(view.remaining, 219);
    assert.equal(view.percent, 47 / 266 * 100); assert.equal(view.percentLabel, "17,7");
    assert.equal(view.stageLabel, "Última etapa aceptada: 5");
  }
  assert.equal(projectAutopilotProgress({ ...progress, completed: 50 }).completed, 50);
});

test("scope and work types come from catalog membership and configured template names", () => {
  const view = projectAutopilotProgress(progress, tasks, spaces);
  assert.equal(view.scopeLabel, "Plató 7"); assert.equal(view.title, "Planificando Plató 7");
  assert.equal(view.scopeCount, 3);
  assert.equal(view.breakdown, "1 de Estilismo de entrada · 2 de Grabación");
  assert.doesNotMatch(JSON.stringify(view), /internal selector|TASK_IDS|run 19/);
  assert.deepEqual(projectAutopilotProgress(progress, [...tasks].reverse(), spaces), view);
});

test("location selectors use their explicit catalog space and null relations have honest fallbacks", () => {
  assert.equal(projectAutopilotProgress({ ...progress, scope: { kind: "SPACE", spaceId: 7 } }, [], spaces).scopeLabel, "Plató 7");
  const view = projectAutopilotProgress(progress, [{ id: 1, spaceId: null, template: null }], []);
  assert.equal(view.scopeLabel, "Selección de tareas"); assert.equal(view.scopeCount, 3);
  assert.equal(view.breakdown, "3 de Sin tipo disponible");
  assert.equal(projectAutopilotProgress(progress, tasks, []).scopeLabel, "Espacio sin nombre");
});

test("mixed and large scopes remain concise without dropping tasks from totals", () => {
  const many = Array.from({ length: 6 }, (_, id) => ({ id, spaceId: id, template: { name: `Actividad ${id}` } }));
  const view = projectAutopilotProgress({ ...progress, scopeTaskIds: [0, 1, 2, 3, 4, 5, 5] }, many, many.map(t => ({ id: t.id, name: `Zona ${t.id}` })));
  assert.equal(view.scopeCount, 6); assert.match(view.scopeLabel!, /y 3 espacios más/);
  assert.match(view.breakdown, /3 de otros tipos/);
  const mixed = projectAutopilotProgress(progress, [tasks[0]], spaces);
  assert.equal(mixed.scopeLabel, "Plató 7, tareas sin espacio");
});

test("every phase has a business label and a pending stop does not hide the current phase", () => {
  for (const phase of ["READING", "SELECTING", "GENERATING", "APPLYING", "VALIDATING", "ACCEPTING", "VERIFYING", "STOPPED", "FAILED", "COMPLETE"] as const) {
    assert.ok(projectAutopilotProgress({ ...progress, phase }).phaseLabel);
  }
  const view = projectAutopilotProgress({ ...progress, phase: "VALIDATING", stopRequested: true });
  assert.equal(view.phaseLabel, "Validando propuesta"); assert.match(view.guidance!, /al terminar la etapa/);
  assert.equal(projectAutopilotProgress({ ...progress, phase: "SELECTING" }).scopeCaption, "Último ámbito procesado");
});

test("final states retain achieved progress and the last processed scope", () => {
  for (const [code, label] of [["RUN_NO_PROPOSAL", /sin propuesta/], ["VALIDATION_NOT_CLEAN", /validación/], ["PROPOSAL_NOT_CLEAN", /requiere revisión/], ["PLANNING_CONFIGURATION_CONFLICT", /configuración del día/], ["unknown private error", /requiere revisión/]] as const) {
    const view = projectAutopilotProgress({ ...progress, phase: "FAILED", code }, tasks, spaces);
    assert.match(view.title, label); assert.equal(view.completed, 47);
    assert.equal(view.scopeCaption, "Último ámbito procesado"); assert.equal(view.scopeLabel, "Plató 7");
    assert.ok(view.guidance); assert.equal(view.tone, "warning");
  }
  const stopped = projectAutopilotProgress({ ...progress, phase: "STOPPED" }, tasks, spaces);
  assert.equal(stopped.tone, "stopped"); assert.match(stopped.guidance!, /continuar/);
  const complete = projectAutopilotProgress({ ...progress, phase: "COMPLETE", completed: 266 }, tasks, spaces);
  assert.equal(complete.percent, 100); assert.equal(complete.remaining, 0); assert.equal(complete.tone, "success");
});

test("zero, incomplete and out-of-range counts never produce misleading 100% or invalid widths", () => {
  assert.equal(projectAutopilotProgress({ ...progress, completed: 9999, total: 10000 }).percentLabel, "99,9");
  assert.equal(projectAutopilotProgress({ ...progress, completed: 9, total: 3 }).percent, 100);
  assert.equal(projectAutopilotProgress({ ...progress, completed: -1 }).percent, 0);
  const empty = projectAutopilotProgress({ ...progress, completed: 0, total: 0, scopeTaskIds: [], scope: null });
  assert.equal(empty.percent, 0); assert.equal(empty.countsKnown, false); assert.equal(empty.scopeLabel, null);
  assert.equal(projectAutopilotProgress({ ...progress, phase: "COMPLETE", total: 0, completed: 0 }).countsKnown, true);
});
