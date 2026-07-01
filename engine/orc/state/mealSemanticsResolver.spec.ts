import test from "node:test";
import assert from "node:assert/strict";
import { resolveORCMealSemantics } from "./mealSemanticsResolver";

test("resolveORCMealSemantics treats mealWindow as placement unless explicitly hard", () => {
  const input: any = { availability: { mealWindow: { start: "13:00", end: "16:30" } }, planning: [] };
  assert.equal(resolveORCMealSemantics(input).mode, "meal_placement_window");
  assert.equal(resolveORCMealSemantics({ availability: { mealWindow: { start: "13:00", end: "16:30", globalHardBreak: true } } } as any).mode, "global_hard_meal_break");
  assert.deepEqual(input.availability.mealWindow, { start: "13:00", end: "16:30" });
});
