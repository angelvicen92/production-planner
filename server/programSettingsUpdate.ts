import { runSpatialAvailabilityValidation, SpatialAvailabilityValidationError } from "./spatialAvailabilityErrors";
import { validateSpatialAvailabilityCatalog, type SpatialCatalogSpace, type SpatialCatalogZone } from "./spaceAvailabilityHierarchy";

export type ProgramSettingsUpdateInput = Readonly<{
  defaultWorkStart?: string; defaultWorkEnd?: string; mealStart?: string; mealEnd?: string;
  mealMode?: string; contestantMealDurationMinutes?: number; contestantMealMaxSimultaneous?: number;
  spaceMealBreakMinutes?: number; itinerantMealBreakMinutes?: number; mealTaskTemplateName?: string;
  clockMode?: "auto" | "manual"; simulatedTime?: string | null;
  uiItinerantGroupOrderIndex?: number | null; uiUnlocatedGroupOrderIndex?: number | null;
}>;

export function buildProgramSettingsAtomicPatch(input: ProgramSettingsUpdateInput, zones: readonly SpatialCatalogZone[], spaces: readonly SpatialCatalogSpace[], nowIso: string): Readonly<Record<string, unknown>> {
  const hasStart = input.defaultWorkStart !== undefined;
  const hasEnd = input.defaultWorkEnd !== undefined;
  if (hasStart !== hasEnd) throw new SpatialAvailabilityValidationError("WORKDAY_REQUEST_PARTIAL");
  if (hasStart && hasEnd) runSpatialAvailabilityValidation(() => validateSpatialAvailabilityCatalog({ workDay: { start: input.defaultWorkStart, end: input.defaultWorkEnd }, zones, spaces }));
  const patch: Record<string, unknown> = {};
  const mappings = [
    ["defaultWorkStart", "default_work_start"], ["defaultWorkEnd", "default_work_end"],
    ["mealStart", "meal_start"], ["mealEnd", "meal_end"], ["mealMode", "meal_mode"],
    ["contestantMealDurationMinutes", "contestant_meal_duration_minutes"],
    ["contestantMealMaxSimultaneous", "contestant_meal_max_simultaneous"],
    ["spaceMealBreakMinutes", "space_meal_break_minutes"], ["itinerantMealBreakMinutes", "itinerant_meal_break_minutes"],
    ["clockMode", "clock_mode"], ["simulatedTime", "simulated_time"],
    ["uiItinerantGroupOrderIndex", "ui_itinerant_group_order_index"],
    ["uiUnlocatedGroupOrderIndex", "ui_unlocated_group_order_index"],
  ] as const;
  for (const [source, target] of mappings) if (input[source] !== undefined) patch[target] = input[source];
  if (input.mealTaskTemplateName !== undefined) patch.meal_task_template_name = input.mealTaskTemplateName.trim();
  if (input.clockMode === "manual" && input.simulatedTime) patch.simulated_set_at = nowIso;
  if (input.clockMode === "auto") { patch.simulated_time = null; patch.simulated_set_at = null; }
  return Object.freeze(patch);
}
