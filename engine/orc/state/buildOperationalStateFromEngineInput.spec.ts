import test from "node:test";
import assert from "node:assert/strict";
import type { EngineInput } from "../../types";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { resolveORCMealSemantics } from "./mealSemanticsResolver";

test("buildOperationalStateFromEngineInput carries mealMode into OperationalState constraints", () => {
  const input = { planId: 213, tasks: [], mealMode: "flexible_meal_window" } as EngineInput;
  const state = buildOperationalStateFromEngineInput(input);
  assert.equal(state.constraints.mealMode, "flexible_meal_window");
});

test("buildOperationalStateFromEngineInput duplicated flexible meal fields resolve as placement window", () => {
  const input = {
    planId: 213,
    workDay: { start: "09:00", end: "18:00" },
    mealMode: "flexible_meal_window",
    meal: { start: "13:00", end: "16:30" },
    mealWindow: { start: "13:00", end: "16:30" },
    tasks: [{ id: 1, planId: 213, templateId: 1, status: "pending", startPlanned: "13:15", endPlanned: "13:45" } as any],
  } as EngineInput;
  const state = buildOperationalStateFromEngineInput(input);
  const semantics = resolveORCMealSemantics(state);
  assert.equal(semantics.mealMode, "flexible_meal_window");
  assert.equal(semantics.mode, "meal_placement_window");
  assert.equal(semantics.globalHardBreaks.length, 0);
  assert.ok(semantics.placementWindows.length > 0);
});
