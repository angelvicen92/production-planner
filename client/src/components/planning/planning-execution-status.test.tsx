import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { planningExecutionStatus, planningExecutionLabels, PlanningExecutionLegend, PlanningExecutionMarker } from "./planning-execution-status";

test("all five live states have distinct labels and only pending has no extra glyph", () => {
  for (const status of Object.keys(planningExecutionLabels) as (keyof typeof planningExecutionLabels)[]) {
    assert.equal(planningExecutionStatus({ status }, "accepted"), status);
    const markup = renderToStaticMarkup(<PlanningExecutionMarker status={status} />);
    if (status === "pending") assert.equal(markup, "");
    else {
      assert.match(markup, new RegExp(`data-execution-marker="${status}"`));
      assert.match(markup, /aria-hidden="true"/);
      assert.match(markup, /<svg/);
    }
  }
  const legend = renderToStaticMarkup(<PlanningExecutionLegend />);
  assert.match(legend, /aria-label="Estados de ejecución"/);
  for (const label of Object.values(planningExecutionLabels)) assert.ok(legend.includes(label));
});

test("draft, projected meals/breaks, manual blocks and missing or unknown authority have no execution indicator", () => {
  for (const status of Object.keys(planningExecutionLabels)) {
    assert.equal(planningExecutionStatus({ status }, "assisted-draft"), null);
    for (const extra of [{ isManualBlock: true }, { breakKind: "space_meal" }, { breakKind: "itinerant_meal" }, { operationalMealPolicyId: "meal-policy" }])
      assert.equal(planningExecutionStatus({ status, ...extra }, "accepted"), null);
  }
  for (const status of [undefined, null, "", "accepted", "draft", "toString", "__proto__"])
    assert.equal(planningExecutionStatus({ status }, "accepted"), null);
  assert.equal(renderToStaticMarkup(<PlanningExecutionMarker status={null} />), "");
});

test("transitions and reset reflect the supplied state without changing times, history or placement", () => {
  const original = Object.freeze({ status: "pending", startPlanned: "09:00", endPlanned: "09:05", startReal: "09:01", endReal: "09:03", spaceId: 42, assignedResources: Object.freeze([8]) });
  for (const status of ["pending", "in_progress", "done", "interrupted", "cancelled", "pending"]) {
    const row = Object.freeze({ ...original, status });
    assert.equal(planningExecutionStatus(row, "accepted"), status);
    assert.deepEqual(row, { ...original, status });
  }
  // A planned end in the past never supplies completion authority.
  assert.equal(planningExecutionStatus(original, "accepted"), "pending");
});
