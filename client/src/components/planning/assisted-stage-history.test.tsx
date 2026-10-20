import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAssistedHistory, type HistoryStage } from "@shared/assistedHistory";
import { AssistedStageHistory } from "./assisted-stage-history";
import { PlanningStageToolbar } from "./planning-stage-toolbar";
import { AssistedAutopilotProgress } from "./assisted-autopilot-progress";
import { projectAutopilotProgress } from "../../lib/assisted-autopilot-progress";
import type { AutopilotProgress } from "@shared/assistedAutopilot";

const s0: HistoryStage = { id: 101, ordinal: 0, parentStageId: null };
const old: HistoryStage = { id: 102, ordinal: 1, parentStageId: 101, archivedAt: "2026-10-01" };
const active: HistoryStage = { id: 115, ordinal: 14, parentStageId: 101 };
const history = [old, active, s0];
const renderHistory = (model = buildAssistedHistory(history, active)) => renderToStaticMarkup(<AssistedStageHistory model={model} active={active} timings={[]} disabled={false} onRestore={() => {}} onRedo={() => {}} />);
const toolbar = (stage: number | null) => renderToStaticMarkup(<PlanningStageToolbar stage={stage} planned={47} total={266} modified={false} touched={0} validation="Vigente" actions={null} editingTools={null} />);

test("toolbar and history label active S1 separately from historical #1 and retain stable stage IDs", () => {
  const model = buildAssistedHistory(history, active);
  assert.match(toolbar(model.localNumber), /Etapa S1/);
  const html = renderHistory(model);
  assert.match(html, /Planificación actual · Etapa S1/);
  assert.match(html, /Etapa S1 · actual/);
  assert.match(html, /data-stage-id="115"/);
  assert.match(html, /Etapa histórica #1 · ID 102/);
  assert.match(html, /Rama archivada · otro recorrido/);
  assert.doesNotMatch(html, /Etapa S14/);
  const other = html.slice(html.indexOf('data-testid="history-other-stages"'));
  assert.doesNotMatch(other, /Etapa S1/);
});

test("corrupt lineage never falls back to ordinal or zero and exposes the cause", () => {
  const model = buildAssistedHistory([old, { ...active, parentStageId: 999 }], active);
  assert.equal(model.localNumber, null);
  assert.match(toolbar(model.localNumber), /Etapa no disponible/);
  const html = renderHistory(model);
  assert.match(html, /Faltan ancestros o hay un ciclo/);
  assert.match(html, /Numeración y acumulados no disponibles/);
  assert.doesNotMatch(html, /Etapa S\d/);
  assert.match(html, /Etapa histórica #14 · ID 115/);
});

test("Autopilot uses the projected checkpoint in full and compact views while preserving historical progress and 266 obligations", () => {
  const progress = { phase: "VERIFYING", stage: 14, completed: 47, total: 266, scope: null, scopeTaskIds: [], runId: null, stopRequested: false, message: "verified" } as AutopilotProgress;
  const before = JSON.stringify(progress);
  for (const compact of [false, true]) {
    const view = projectAutopilotProgress(progress, [], [], buildAssistedHistory(history, active));
    const html = renderToStaticMarkup(<AssistedAutopilotProgress progress={progress} view={view} compact={compact} />);
    const primary = html.slice(0, html.indexOf("<details"));
    assert.match(primary, /Etapa S1/); assert.doesNotMatch(primary, /Etapa 14|Etapa S14/);
    assert.match(primary, /47 de 266 tareas/);
    const unknown = projectAutopilotProgress(progress);
    assert.equal(unknown.checkpointLabel, "Etapa no disponible");
    assert.ok(unknown.lineageError);
  }
  assert.equal(JSON.stringify(progress), before);
});
