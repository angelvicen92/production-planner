import { z } from "zod";

const positive = z.number().int().positive();
export const templatePlannerOperationSchema = z.object({
  contractVersion: z.literal(1),
  kind: z.enum(["main", "vocal", "auxiliary", "technical"]),
}).strict();
export type TemplatePlannerOperation = z.infer<typeof templatePlannerOperationSchema>;

/** Explicit structural profiles. No task identities or scheduled times. */
const common = z.object({
  contractVersion: z.literal(1),
  transport: z.literal("NONE"),
  setup: z.literal("NONE"),
  meals: z.literal("DAY_CONFIGURATION"),
  searchPolicy: z.enum(["COMPATIBILITY_PRESERVING", "EXACT_CONSTRUCTIVE"]),
  searchBudget: z.object({bestK:positive, maxBacktracks:positive, maxPatterns:positive,
    maxBranchExpansions:positive.max(100_000)}).strict(),
  timeGridMinutes: z.literal(5),
  resourceTransitionMinutes: z.number().int().nonnegative(),
}).strict();
export const newDayPlannerConfigurationSchema = z.discriminatedUnion("scenario", [
  common.extend({scenario:z.literal("MAIN_WITH_VOCAL_FEEDER"),
  mainFlow: z.object({spaceId:positive,
    preferredEnd:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    continuity:z.literal("REQUIRED"), maxBlocksByKey:positive, minTasksPerBlock:positive}).strict(),
}).strict(),
  common.extend({scenario:z.literal("STANDALONE_ONLY"),searchPolicy:z.literal("EXACT_CONSTRUCTIVE")}).strict(),
]);
export type NewDayPlannerConfiguration = z.infer<typeof newDayPlannerConfigurationSchema>;
export const newDayPlannerSnapshotSchema = z.object({contractVersion:z.literal(1),
  sourceRevision:z.number().int().nonnegative(), configuration:newDayPlannerConfigurationSchema.nullable()}).strict();
export type NewDayPlannerSnapshot = z.infer<typeof newDayPlannerSnapshotSchema>;

// Legacy rules remain opaque; the new operational declaration is always typed.
export const templateRulesWithPlannerOperationSchema = z.any().superRefine((value,ctx)=>{
  if(value?.plannerNextOperation != null && !templatePlannerOperationSchema.safeParse(value.plannerNextOperation).success)
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Rol operativo Planner Next inválido.",path:["plannerNextOperation"]});
});
