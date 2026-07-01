import type { OperationalState } from "../contracts";
import type { TimeWindow } from "../../types";

export type ORCMealSemanticsMode = "global_hard_meal_break" | "meal_placement_window" | "actual_meal_break" | "meal_placeholder_only" | "unknown";
export interface ORCMealSemantics { mode: ORCMealSemanticsMode; source: string; globalHardBreaks: TimeWindow[]; placementWindows: TimeWindow[]; actualMealBreaks: TimeWindow[]; warnings: string[]; readOnly: true; planningInfluence: "validation-semantics-only"; }
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const hasWindow = (v: unknown): v is TimeWindow => isRecord(v) && typeof v.start === "string" && typeof v.end === "string";
const hard = (v: unknown) => { const r = isRecord(v) ? v : {}; return r.globalHardBreak === true || r.hardMealBreak === true || r.isGlobalHardBreak === true || r.blocksAllWork === true || r.dayClosed === true || r.productionStop === true; };
const actual = (v: unknown) => { const r = isRecord(v) ? v : {}; return r.actualMeal === true || r.kind === "actualMeal" || r.kind === "actual_meal_break"; };
const cloneWin = (w: TimeWindow): TimeWindow => ({ start: w.start, end: w.end });
export function resolveORCMealSemantics(snapshot: Pick<OperationalState, "availability" | "planning"> | null | undefined): ORCMealSemantics {
  const a = snapshot?.availability;
  const globalHardBreaks: TimeWindow[] = [];
  const placementWindows: TimeWindow[] = [];
  const actualMealBreaks: TimeWindow[] = [];
  const warnings: string[] = [];
  const add = (target: TimeWindow[], w: unknown) => { if (hasWindow(w)) target.push(cloneWin(w)); };
  for (const w of a?.globalHardBreaks ?? []) add(globalHardBreaks, w);
  if (hasWindow(a?.actualMeal)) add(actualMealBreaks, a?.actualMeal);
  if (hasWindow(a?.meal) && (hard(a?.meal) || hard(a))) add(globalHardBreaks, a?.meal); else if (hasWindow(a?.meal) && actual(a?.meal)) add(actualMealBreaks, a?.meal); else if (hasWindow(a?.meal)) add(globalHardBreaks, a?.meal);
  if (hasWindow(a?.mealWindow) && (hard(a?.mealWindow) || hard(a))) add(globalHardBreaks, a?.mealWindow); else if (hasWindow(a?.mealWindow) && actual(a?.mealWindow)) add(actualMealBreaks, a?.mealWindow); else if (hasWindow(a?.mealWindow)) add(placementWindows, a?.mealWindow);
  const mode: ORCMealSemanticsMode = globalHardBreaks.length > 0 ? "global_hard_meal_break" : actualMealBreaks.length > 0 ? "actual_meal_break" : placementWindows.length > 0 ? "meal_placement_window" : (snapshot?.planning ?? []).some((e: any) => e.operationalRole === "meal_break_placeholder") ? "meal_placeholder_only" : "unknown";
  if (mode === "unknown") warnings.push("No structured meal semantics were found; ORC will not invent a global hard meal break.");
  return Object.freeze({ mode, source: "operational-state-availability", globalHardBreaks, placementWindows, actualMealBreaks, warnings, readOnly: true, planningInfluence: "validation-semantics-only" });
}
export const hardMealWindowsFromSemantics = (s: ORCMealSemantics): TimeWindow[] => [...s.globalHardBreaks, ...s.actualMealBreaks];
