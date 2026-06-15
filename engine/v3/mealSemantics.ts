import type { EngineInput, ProtectedBreakInput, TaskInput, TimeWindow } from "../types";
const toMinutes = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

export type MealMode = "global_hard_break" | "flexible_meal_window";

export const getMealMode = (input: EngineInput): { mode: MealMode; reason: string } => {
  const configured = String(input.mealMode ?? "").trim().toLowerCase();
  if (configured === "global_hard_break" || configured === "flexible_meal_window") {
    return { mode: configured, reason: "explicit_configuration" };
  }
  return { mode: "global_hard_break", reason: "meal_mode_inferred_legacy_global_break" };
};

export const mealOccupiesSpace = (task: TaskInput): boolean => task.mealOccupiesSpace === true;

export type ResolvedProtectedBreak = ProtectedBreakInput & {
  kind: "meal" | "global" | "protected";
  source: "actual_meal" | "global_hard_break" | "protected_break";
};

const validWindow = (window: TimeWindow | null | undefined): window is TimeWindow => {
  const start = toMinutes(window?.start);
  const end = toMinutes(window?.end);
  return start !== null && end !== null && end > start;
};

/** `input.meal` is a placement window, never a hard block by itself. */
export const getMealWindow = (input: EngineInput): TimeWindow | null => {
  const explicit = input.mealWindow
    ?? (input.mealWindowStart && input.mealWindowEnd
      ? { start: input.mealWindowStart, end: input.mealWindowEnd }
      : null)
    ?? input.meal;
  return validWindow(explicit) ? explicit : null;
};

export const getProtectedBreaks = (input: EngineInput): ResolvedProtectedBreak[] => {
  const breaks: ResolvedProtectedBreak[] = [];
  const mode = getMealMode(input);
  const append = (
    candidate: ProtectedBreakInput | null | undefined,
    source: ResolvedProtectedBreak["source"],
    defaultKind: ResolvedProtectedBreak["kind"],
  ) => {
    if (!candidate || !validWindow(candidate)) return;
    breaks.push({ ...candidate, kind: candidate.kind ?? defaultKind, source });
  };

  if (mode.mode === "global_hard_break" && mode.reason === "explicit_configuration") {
    const mealWindow = getMealWindow(input);
    if (mealWindow) append({ ...mealWindow, kind: "global", label: "COMIDA" }, "global_hard_break", "global");
  }
  append(input.actualMeal, "actual_meal", "meal");
  if (input.actualMealStart && input.actualMealEnd) {
    append({ start: input.actualMealStart, end: input.actualMealEnd, kind: "meal" }, "actual_meal", "meal");
  }
  for (const hardBreak of input.globalHardBreaks ?? []) append({ ...hardBreak, kind: "global" }, "global_hard_break", "global");
  for (const protectedBreak of input.protectedBreaks ?? []) append(protectedBreak, "protected_break", "protected");

  return breaks;
};

export const isMealTask = (input: EngineInput, task: TaskInput): boolean => {
  if (task.breakKind === "space_meal" || task.breakKind === "itinerant_meal") return true;
  if (input.mealTaskTemplateId && Number(task.templateId) === Number(input.mealTaskTemplateId)) return true;
  const configuredName = String(input.mealTaskTemplateName ?? "").trim().toLowerCase();
  const taskName = String(task.templateName ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (configuredName.length > 0 && taskName === configuredName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")) return true;
  // TODO: replace this defensive legacy-name fallback with an admin-configured task category.
  return getMealMode(input).mode === "flexible_meal_window"
    && /(^|\s)(comida|meal|catering|sodexo)(\s|$)/.test(taskName);
};
