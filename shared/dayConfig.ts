import { z } from "zod";

export const dayConfigSourceSchema = z.enum(["INHERITED", "DAY_OVERRIDE", "LEGACY_BACKFILL"]);
export type DayConfigSource = z.infer<typeof dayConfigSourceSchema>;

const timeWindowFields = {
  start: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
  end: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
};
export const timeWindowSchema = z.object(timeWindowFields).strict().refine(value => value.start < value.end, "Start must be earlier than end");

export const mealConfigurationSchema = z.object({...timeWindowFields,
  mode: z.enum(["global_hard_break", "flexible_meal_window"]),
}).strict().refine(value => value.start < value.end, "Start must be earlier than end");

export const createDayConfigurationIntentSchema = z.object({
  workday: z.discriminatedUnion("intent", [
    z.object({ intent: z.literal("INHERIT") }).strict(),
    z.object({ intent: z.literal("OVERRIDE"), value: timeWindowSchema }).strict(),
  ]),
  meal: z.discriminatedUnion("intent", [
    z.object({ intent: z.literal("INHERIT") }).strict(),
    z.object({ intent: z.literal("OVERRIDE"), value: mealConfigurationSchema }).strict(),
  ]),
}).strict();

export const dayConfigEditSchema = z.object({
  workday: timeWindowSchema.optional(),
  meal: mealConfigurationSchema.optional(),
  optimizer: z.record(z.string(), z.unknown()).optional(),
}).strict().refine(value => value.workday !== undefined || value.meal !== undefined || value.optimizer !== undefined, "At least one capability is required");

export const dayConfigCapabilitySchema = z.enum(["WORKDAY_WINDOW", "GLOBAL_MEAL_BREAK", "OPTIMIZATION"]);
export const dayConfigRestoreSchema = z.object({ capability: dayConfigCapabilitySchema }).strict();
export const dayConfigRefreshSchema = z.object({
  capabilities: z.array(dayConfigCapabilitySchema).min(1).max(3).transform(values => [...new Set(values)]),
  legacyTreatment: z.enum(["KEEP_LEGACY", "ADOPT_GENERAL_AS_INHERITED"]).default("KEEP_LEGACY"),
}).strict();

export type CreateDayConfigurationIntent = z.infer<typeof createDayConfigurationIntentSchema>;
export type DayConfigEdit = z.infer<typeof dayConfigEditSchema>;
export type DayConfigRestore = z.infer<typeof dayConfigRestoreSchema>;
export type DayConfigRefresh = z.infer<typeof dayConfigRefreshSchema>;
