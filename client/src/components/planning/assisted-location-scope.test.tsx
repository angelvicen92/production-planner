import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistedLocationScope } from "./assisted-location-scope";

test("hierarchy exposes real members, partial selection and empty spaces accessibly", () => {
  const html = renderToStaticMarkup(<AssistedLocationScope zones={[{ id: 1, name: "Real zone" }]}
    spaces={[{ id: 2, zoneId: 1, name: "A" }, { id: 3, zoneId: 1, name: "B" }]}
    tasks={[{ id: 4, spaceId: 2, status: "pending" }]} selected={[2]} disabled={false} onChange={() => {}}/>);
  assert.match(html, /aria-checked="mixed"[^>]*aria-label="Seleccionar zona Real zone"/);
  assert.match(html, /Seleccionar espacio A/); assert.match(html, /Seleccionar espacio B/);
  assert.match(html, /0 pendientes/); assert.match(html, /Retirar selección de ubicaciones/);
  assert.match(html, /<details open=""/);
});
