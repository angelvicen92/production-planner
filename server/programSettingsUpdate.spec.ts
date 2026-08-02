import assert from "node:assert/strict";
import test from "node:test";
import { buildProgramSettingsAtomicPatch } from "./programSettingsUpdate";
import { api } from "../shared/routes";

const zones = [{ id: 1, availabilityStart: "10:00", availabilityEnd: "20:00" }];
const spaces = [{ id: 2, zoneId: 1, availabilityStart: "11:00", availabilityEnd: "19:00" }];
const now = "2026-08-02T00:00:00.000Z";

test("valid workday and meal settings produce one complete patch", () => {
  assert.deepEqual(buildProgramSettingsAtomicPatch({ defaultWorkStart: "09:00", defaultWorkEnd: "21:00", mealStart: "13:00", mealEnd: "15:00", mealMode: "flexible_meal_window", contestantMealDurationMinutes: 75, contestantMealMaxSimultaneous: 10, spaceMealBreakMinutes: 60, itinerantMealBreakMinutes: 45, mealTaskTemplateName: " Comer ", clockMode: "manual", simulatedTime: "12:00", uiItinerantGroupOrderIndex: 3, uiUnlocatedGroupOrderIndex: null }, zones, spaces, now), {
    default_work_start: "09:00", default_work_end: "21:00", meal_start: "13:00", meal_end: "15:00", meal_mode: "flexible_meal_window", contestant_meal_duration_minutes: 75, contestant_meal_max_simultaneous: 10, space_meal_break_minutes: 60, itinerant_meal_break_minutes: 45, meal_task_template_name: "Comer", clock_mode: "manual", simulated_time: "12:00", simulated_set_at: now, ui_itinerant_group_order_index: 3, ui_unlocated_group_order_index: null,
  });
});
test("invalid workday descendants and partial pairs produce no patch", () => {
  assert.throws(() => buildProgramSettingsAtomicPatch({ defaultWorkStart: "11:00", defaultWorkEnd: "21:00" }, zones, spaces, now), /ZONE_OUTSIDE_WORKDAY/);
  assert.throws(() => buildProgramSettingsAtomicPatch({ defaultWorkStart: "10:00", defaultWorkEnd: "20:00" }, [{ id: 1, availabilityStart: null, availabilityEnd: null }], [{ id: 2, zoneId: 1, availabilityStart: "09:00", availabilityEnd: "19:00" }], now), /SPACE_OUTSIDE_ZONE/);
  assert.throws(() => buildProgramSettingsAtomicPatch({ defaultWorkStart: "09:00" }, zones, spaces, now), /WORKDAY_REQUEST_PARTIAL/);
});
test("meal-only update does not require workday and preserves fields", () => {
  assert.deepEqual(buildProgramSettingsAtomicPatch({ mealStart: "13:00", mealEnd: "15:00", clockMode: "auto" }, [], [], now), { meal_start: "13:00", meal_end: "15:00", clock_mode: "auto", simulated_time: null, simulated_set_at: null });
});
test("shared contract still rejects unsupported program settings", () => {
  assert.equal(api.programSettings.update.input.safeParse({ unsupported: true }).success, false);
});
