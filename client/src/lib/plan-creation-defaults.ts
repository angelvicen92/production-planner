import type { InsertPlan } from "@shared/schema";

export type PlanCreationDefaults = {
  defaultWorkStart: string;
  defaultWorkEnd: string;
  mealStart: string;
  mealEnd: string;
  mealMode: InsertPlan["mealMode"];
  contestantMealDurationMinutes: number;
  contestantMealMaxSimultaneous: number;
};

export function planDefaultsForNewDay(defaults: PlanCreationDefaults, date = new Date().toISOString().split("T")[0]): InsertPlan {
  return {date,workStart:defaults.defaultWorkStart,workEnd:defaults.defaultWorkEnd,mealStart:defaults.mealStart,mealEnd:defaults.mealEnd,mealMode:defaults.mealMode,contestantMealDurationMinutes:defaults.contestantMealDurationMinutes,contestantMealMaxSimultaneous:defaults.contestantMealMaxSimultaneous,camerasAvailable:0,status:"draft"};
}
