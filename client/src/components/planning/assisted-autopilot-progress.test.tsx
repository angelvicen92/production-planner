import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AutopilotProgress } from "@shared/assistedAutopilot";
import { projectAutopilotProgress } from "../../lib/assisted-autopilot-progress";
import { AssistedAutopilotProgress } from "./assisted-autopilot-progress";

const progress: AutopilotProgress = {
  phase: "GENERATING", stage: 5, completed: 47, total: 266,
  scope: { kind: "SPACE", spaceId: 7 }, scopeTaskIds: [1], runId: 99,
  stopRequested: false, message: "RAW_TECHNICAL_MESSAGE",
};
const render = (p = progress) => renderToStaticMarkup(<AssistedAutopilotProgress progress={p} view={projectAutopilotProgress(p, [{ id: 1, template: { name: "Grabación" } }], [{ id: 7, name: "Plató 7" }], { localNumber: 2, lineageError: null })} />);

test("primary render puts accessible graphical progress, business scope and work before collapsed diagnostics", () => {
  const html = render();
  const primary = html.slice(0, html.indexOf("<details"));
  assert.match(primary, /role="progressbar"[^>]*aria-label="Progreso de la jornada planificada"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"[^>]*aria-valuenow="17\.669/);
  assert.match(primary, /47 de 266 tareas completadas/); assert.match(primary, /Quedan 219 tareas/);
  assert.match(primary, /Planificando Plató 7/); assert.match(primary, /Generando propuesta/);
  assert.match(primary, /1 tarea en este bloque/); assert.match(primary, /1 de Grabación/);
  assert.match(primary, /aria-live="polite"/);
  assert.doesNotMatch(primary, /RAW_TECHNICAL_MESSAGE|SPACE|scopeTaskIds|runId/);
  const technical = html.slice(html.indexOf("<details"));
  assert.match(technical, /Ver detalle técnico/); assert.match(technical, /RAW_TECHNICAL_MESSAGE/);
  assert.match(technical, /scopeTaskIds/); assert.doesNotMatch(technical, /<details[^>]*\bopen/);
});

test("complete, stopped and failed renders preserve achieved global progress and last scope", () => {
  for (const [phase, completed, message] of [["COMPLETE", 266, "Planificación completada"], ["STOPPED", 47, "Planificación detenida"], ["FAILED", 47, "requiere revisión"]] as const) {
    const html = render({ ...progress, phase, completed });
    assert.ok(html.includes(message)); assert.match(html, /Último ámbito procesado/);
    assert.match(html, new RegExp(`${completed} de 266 tareas completadas`));
    assert.match(html, /Plató 7/); assert.doesNotMatch(html, /Generando propuesta/);
  }
});

test("maximized presentation keeps one compact verified-progress bar with stage and scope", () => {
  const html = renderToStaticMarkup(<AssistedAutopilotProgress compact progress={progress} view={projectAutopilotProgress(progress, [{ id: 1, template: { name: "Grabación" } }], [{ id: 7, name: "Plató 7" }], { localNumber: 2, lineageError: null })} />);
  assert.equal((html.match(/role="progressbar"/g) ?? []).length, 1);
  assert.match(html, /47 de 266 tareas/);
  assert.match(html, /Etapa S2/);
  assert.match(html, /Generando propuesta/);
  assert.match(html, /Plató 7/);
  assert.doesNotMatch(html, /Tipos de tarea:|Quedan 219 tareas/);
  assert.match(html, /aria-valuenow="17\.669/);
  assert.match(html, /aria-live="polite"/);
});
