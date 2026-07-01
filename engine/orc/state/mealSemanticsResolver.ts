import type { OperationalState } from "../contracts";
import type { TimeWindow } from "../../types";

export type ORCMealMode = "global_hard_break" | "flexible_meal_window" | string;
export type ORCMealSemanticsMode = "global_hard_meal_break" | "meal_placement_window" | "actual_meal_break" | "meal_placeholder_only" | "unknown";
export interface ORCMealSemantics { mode: ORCMealSemanticsMode; source: string; mealMode: ORCMealMode | null; globalHardBreaks: TimeWindow[]; placementWindows: TimeWindow[]; actualMealBreaks: TimeWindow[]; warnings: string[]; readOnly: true; planningInfluence: "validation-semantics-only"; }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const hasWindow = (v: unknown): v is TimeWindow => isRecord(v) && typeof v.start === "string" && typeof v.end === "string";
const hard = (v: unknown) => { const r = isRecord(v) ? v : {}; return r.globalHardBreak === true || r.hardMealBreak === true || r.isGlobalHardBreak === true || r.blocksAllWork === true || r.dayClosed === true || r.productionStop === true; };
const actual = (v: unknown) => { const r = isRecord(v) ? v : {}; return r.actualMeal === true || r.kind === "actualMeal" || r.kind === "actual_meal_break"; };
const cloneWin = (w: TimeWindow): TimeWindow => ({ start: w.start, end: w.end });
const sameWindow = (a: unknown, b: unknown): boolean => hasWindow(a) && hasWindow(b) && a.start === b.start && a.end === b.end;
const add = (target: TimeWindow[], w: unknown) => {
  if (!hasWindow(w)) return;
  const key = `${w.start}|${w.end}`;
  if (!target.some((item) => `${item.start}|${item.end}` === key)) target.push(cloneWin(w));
};
const mealModeOf = (snapshot: unknown): ORCMealMode | null => {
  const constraints = isRecord(snapshot) && isRecord(snapshot.constraints) ? snapshot.constraints : {};
  return typeof constraints.mealMode === "string" && constraints.mealMode.length > 0 ? constraints.mealMode : null;
};

export function resolveORCMealSemantics(snapshot: (Pick<OperationalState, "availability" | "planning"> & Partial<Pick<OperationalState, "constraints">>) | null | undefined): ORCMealSemantics {
  const a = snapshot?.availability;
  const mealMode = mealModeOf(snapshot);
  const globalHardBreaks: TimeWindow[] = [];
  const placementWindows: TimeWindow[] = [];
  const actualMealBreaks: TimeWindow[] = [];
  const warnings: string[] = [];

  for (const w of a?.globalHardBreaks ?? []) add(globalHardBreaks, w);
  if (hasWindow(a?.actualMeal)) add(actualMealBreaks, a?.actualMeal);

  const mealIsExplicitHard = hard(a?.meal) || hard(a);
  const mealWindowIsExplicitHard = hard(a?.mealWindow) || hard(a);
  const mealIsActual = actual(a?.meal);
  const mealWindowIsActual = actual(a?.mealWindow);

  if (hasWindow(a?.meal) && (mealIsExplicitHard || mealIsActual)) (mealIsActual && !mealIsExplicitHard ? add(actualMealBreaks, a.meal) : add(globalHardBreaks, a.meal));
  if (hasWindow(a?.mealWindow) && (mealWindowIsExplicitHard || mealWindowIsActual)) (mealWindowIsActual && !mealWindowIsExplicitHard ? add(actualMealBreaks, a.mealWindow) : add(globalHardBreaks, a.mealWindow));

  if (mealMode === "global_hard_break") {
    if (hasWindow(a?.meal)) add(globalHardBreaks, a.meal);
    else if (hasWindow(a?.mealWindow)) add(globalHardBreaks, a.mealWindow);
  } else if (mealMode === "flexible_meal_window") {
    if (hasWindow(a?.mealWindow) && !mealWindowIsExplicitHard && !mealWindowIsActual) add(placementWindows, a.mealWindow);
    if (hasWindow(a?.meal) && !mealIsExplicitHard && !mealIsActual && (!hasWindow(a?.mealWindow) || sameWindow(a.meal, a.mealWindow))) add(placementWindows, a.meal);
  } else {
    if (hasWindow(a?.mealWindow) && !mealWindowIsExplicitHard && !mealWindowIsActual) add(placementWindows, a.mealWindow);
    if (hasWindow(a?.meal) && !mealIsExplicitHard && !mealIsActual) {
      add(globalHardBreaks, a.meal);
      warnings.push("legacy_meal_without_meal_mode_treated_as_hard");
    }
  }

  const mode: ORCMealSemanticsMode = globalHardBreaks.length > 0 ? "global_hard_meal_break" : actualMealBreaks.length > 0 ? "actual_meal_break" : placementWindows.length > 0 ? "meal_placement_window" : (snapshot?.planning ?? []).some((e: any) => e.operationalRole === "meal_break_placeholder") ? "meal_placeholder_only" : "unknown";
  if (mode === "unknown") warnings.push("No structured meal semantics were found; ORC will not invent a global hard meal break.");
  return Object.freeze({ mode, source: "operational-state-availability", mealMode, globalHardBreaks, placementWindows, actualMealBreaks, warnings, readOnly: true, planningInfluence: "validation-semantics-only" });
}
export const hardMealWindowsFromSemantics = (s: ORCMealSemantics): TimeWindow[] => [...s.globalHardBreaks, ...s.actualMealBreaks];
