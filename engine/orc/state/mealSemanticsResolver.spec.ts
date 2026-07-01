import test from "node:test";
import assert from "node:assert/strict";
import { stableStringify } from "../structuralEquality";
import { resolveORCMealSemantics } from "./mealSemanticsResolver";

const window = { start: "13:00", end: "16:30" };

test("resolveORCMealSemantics treats flexible duplicated meal and mealWindow as placement", () => {
  const result = resolveORCMealSemantics({ availability: { meal: window, mealWindow: window, actualMeal: null, globalHardBreaks: [] }, constraints: { mealMode: "flexible_meal_window" }, planning: [] } as any);
  assert.equal(result.mode, "meal_placement_window");
  assert.equal(result.mealMode, "flexible_meal_window");
  assert.equal(result.globalHardBreaks.length, 0);
  assert.ok(result.placementWindows.length > 0);
});

test("resolveORCMealSemantics treats global_hard_break meal as hard", () => {
  const result = resolveORCMealSemantics({ availability: { meal: window }, constraints: { mealMode: "global_hard_break" }, planning: [] } as any);
  assert.equal(result.mode, "global_hard_meal_break");
  assert.ok(result.globalHardBreaks.length > 0);
});

test("resolveORCMealSemantics preserves actualMeal as actual hard break", () => {
  const result = resolveORCMealSemantics({ availability: { actualMeal: window }, constraints: { mealMode: "flexible_meal_window" }, planning: [] } as any);
  assert.equal(result.mode, "actual_meal_break");
  assert.ok(result.actualMealBreaks.length > 0);
});

test("resolveORCMealSemantics preserves globalHardBreaks as hard", () => {
  const result = resolveORCMealSemantics({ availability: { globalHardBreaks: [window] }, constraints: { mealMode: "flexible_meal_window" }, planning: [] } as any);
  assert.equal(result.mode, "global_hard_meal_break");
  assert.deepEqual(result.globalHardBreaks, [window]);
});

test("resolveORCMealSemantics treats mealWindow without mealMode as placement", () => {
  const result = resolveORCMealSemantics({ availability: { mealWindow: window }, planning: [] } as any);
  assert.equal(result.mode, "meal_placement_window");
  assert.equal(result.globalHardBreaks.length, 0);
});

test("resolveORCMealSemantics keeps legacy meal without mealMode hard with warning", () => {
  const result = resolveORCMealSemantics({ availability: { meal: window }, planning: [] } as any);
  assert.equal(result.mode, "global_hard_meal_break");
  assert.ok(result.warnings.includes("legacy_meal_without_meal_mode_treated_as_hard"));
});

test("resolveORCMealSemantics explicit hard flags override flexible mode", () => {
  const result = resolveORCMealSemantics({ availability: { meal: { ...window, hardMealBreak: true }, mealWindow: window }, constraints: { mealMode: "flexible_meal_window" }, planning: [] } as any);
  assert.equal(result.mode, "global_hard_meal_break");
  assert.ok(result.globalHardBreaks.length > 0);
});

test("resolveORCMealSemantics does not mutate input and is deterministic and JSON serializable", () => {
  const input: any = { availability: { meal: window, mealWindow: window, actualMeal: null, globalHardBreaks: [] }, constraints: { mealMode: "flexible_meal_window" }, planning: [] };
  const before = stableStringify(input);
  const first = resolveORCMealSemantics(input);
  const second = resolveORCMealSemantics(input);
  assert.equal(stableStringify(input), before);
  assert.equal(stableStringify(first), stableStringify(second));
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.equal(first.readOnly, true);
  assert.equal(first.planningInfluence, "validation-semantics-only");
});
