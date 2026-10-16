import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StageHistoryTiming } from "./stage-history-timing";

test("history renders named metrics and actual start/end timestamps, with explicit unavailable values", () => {
  const generation = { start: "2026-10-11T12:00:02Z", end: "2026-10-11T12:00:05Z", durationMs: 3_000 };
  const requestToAcceptance = { start: "2026-10-11T12:00:00Z", end: "2026-10-11T12:03:00Z", durationMs: 180_000 };
  const html = renderToStaticMarkup(createElement(StageHistoryTiming, { timing: { stageId: 2, generation, requestToAcceptance } }));
  for (const label of ["Generación", "Solicitud a aceptación", "Inicio del run", "Fin del run", "Solicitud registrada", "Aceptación", "3 s", "180 s"]) assert.ok(html.includes(label), label);
  for (const date of [generation.start, generation.end, requestToAcceptance.start, requestToAcceptance.end]) assert.ok(html.includes(`dateTime="${date}"`));
  assert.ok(html.includes("<details")); assert.ok(!html.includes("<details open"));
  const empty = renderToStaticMarkup(createElement(StageHistoryTiming));
  assert.equal(empty.match(/No disponible/g)?.length, 4); assert.ok(!empty.includes("<time"));
});
