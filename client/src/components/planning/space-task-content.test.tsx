import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpaceTaskContent } from "./space-task-content";

test("cards put participants before activity and time in both densities", () => {
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(<SpaceTaskContent participants={["Ana", "Bea"]} activity="Vocal" time="09:00–09:30" height={60} compact={compact}/>);
    assert.match(html, /data-space-task-primary/);
    assert.match(html, /data-space-task-participant[^>]*>Ana<\/span>/);
    assert.match(html, /data-space-task-participant[^>]*>Bea<\/span>/);
    assert.match(html, /data-space-task-secondary[^>]*><span[^>]*>Vocal<\/span><span[^>]*>09:00–09:30/);
  }
});

test("short cards prioritize the name, retain full hover text, and fall back to activity without a participant", () => {
  const short = renderToStaticMarkup(<SpaceTaskContent participants={["A long participant name"]} activity="VOC" time="09:00–09:05" height={10} compact={false}/>);
  assert.match(short, /font-size:8px;line-height:8px/);
  assert.match(short, /data-space-task-primary/);
  assert.doesNotMatch(short, /data-space-task-secondary/);
  assert.match(short, /title="A long participant name · VOC · 09:00–09:05"/);
  const fallback = renderToStaticMarkup(<SpaceTaskContent activity="Descanso comida" time="14:00–15:00" height={120} compact={true}/>);
  assert.match(fallback, /data-space-task-primary[^>]*><span[^>]*>Descanso comida<\/span>/);
  assert.doesNotMatch(fallback, /undefined|Sin concursante/);
});
