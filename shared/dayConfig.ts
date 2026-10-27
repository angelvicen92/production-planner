import {jointGroupStructureSchema} from "./jointGroupStructure";
import { technicalChainStructureSchema } from "./technicalChainStructure";
import { anchoredAccompanimentStructureSchema } from "./anchoredAccompanimentStructure";
import {dailyTaskOperationScopesSchema} from './dailyTaskOperationScopes';
import { roundSynchronizationStructureSchema } from "./roundSynchronizationStructure";
import { continuityEditSchema } from "./operationContinuity";
import { mainFlowPreferenceSchema } from "./mainFlowPreference";
import { z } from "zod";
import { transportParametersSchema } from "./transportPolicy";
import { configRevisionIdSchema, roundPreparationEditSchema, roundPreparationTargetSchema } from "./roundPreparation";

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
  participantTransition: z.discriminatedUnion("intent", [
    z.object({ intent: z.literal("INHERIT") }).strict(),
    z.object({ intent: z.literal("OVERRIDE"), value: z.number().int().min(0) }).strict(),
  ]).default({ intent: "INHERIT" }),
}).strict();

export const dayConfigEditSchema = z.object({
  workday: timeWindowSchema.optional(),
  meal: mealConfigurationSchema.optional(),
  mainFlowPreference: mainFlowPreferenceSchema.optional(),
  optimizer: z.record(z.string(), z.unknown()).superRefine((value,ctx)=>{
    const transport=value.transport;
    const parsed=transportParametersSchema.safeParse(transport==null?value:{...(typeof transport==='object'?transport:{}),...value});
    if(!parsed.success)for(const issue of parsed.error.issues)ctx.addIssue({...issue,path:['transport',...issue.path]});
  }).optional(),
  participantTransitionMinutes: z.number().int().min(0).optional(),
  roundPreparation: roundPreparationEditSchema.optional(),
  roundSynchronization: roundSynchronizationStructureSchema.optional(),
  technicalChains: technicalChainStructureSchema.optional(),
  anchoredAccompaniments: anchoredAccompanimentStructureSchema.optional(),
  jointGroups: jointGroupStructureSchema.optional(),
  taskOperationScopes: dailyTaskOperationScopesSchema.optional(),
  operationContinuity: continuityEditSchema.optional(),
  expectedRevisionId: configRevisionIdSchema.optional(),
}).strict().refine(value => value.jointGroups !== undefined || value.taskOperationScopes !== undefined || value.anchoredAccompaniments !== undefined || value.technicalChains !== undefined || value.roundSynchronization !== undefined || value.operationContinuity !== undefined || value.roundPreparation !== undefined || value.mainFlowPreference !== undefined || value.workday !== undefined || value.meal !== undefined || value.optimizer !== undefined || value.participantTransitionMinutes !== undefined, "At least one capability is required")
  .refine(value => value.jointGroups === undefined && value.taskOperationScopes === undefined && value.anchoredAccompaniments === undefined && value.technicalChains === undefined && value.roundSynchronization === undefined && value.roundPreparation === undefined && value.operationContinuity === undefined ? value.expectedRevisionId === undefined
    : value.expectedRevisionId !== undefined && [value.jointGroups,value.taskOperationScopes,value.anchoredAccompaniments,value.technicalChains,value.roundSynchronization,value.roundPreparation,value.operationContinuity].filter(v=>v!==undefined).length === 1 && Object.keys(value).every(key => key === "jointGroups" || key === "taskOperationScopes" || key === "anchoredAccompaniments" || key === "technicalChains" || key === "roundSynchronization" || key === "roundPreparation" || key === "operationContinuity" || key === "expectedRevisionId"),
  "La estructura se edita con la revisión consultada, sin mezclar otras categorías.");

export const dayConfigCapabilitySchema = z.enum(["WORKDAY_WINDOW", "GLOBAL_MEAL_BREAK", "PARTICIPANT_TRANSITION", "OPTIMIZATION", "BLOCK_COUNT_POLICY"]);
export const dayConfigRestoreSchema = z.union([
  z.object({ capability: dayConfigCapabilitySchema }).strict(),
  z.object({ capability: z.literal("OPERATION_CONTINUITY"), operationContinuity:z.object({groupId:z.string().uuid()}).strict(), expectedRevisionId:configRevisionIdSchema }).strict(),
  z.object({ capability: z.literal("SYNCHRONIZED_ROUNDS"), roundPreparation: roundPreparationTargetSchema, expectedRevisionId: configRevisionIdSchema }).strict(),
]);
export const dayConfigRefreshSchema = z.object({
  capabilities: z.array(dayConfigCapabilitySchema).min(1).max(5).transform(values => [...new Set(values)]),
  legacyTreatment: z.enum(["KEEP_LEGACY", "ADOPT_GENERAL_AS_INHERITED"]).default("KEEP_LEGACY"),
}).strict();

export type CreateDayConfigurationIntent = z.infer<typeof createDayConfigurationIntentSchema>;
export type DayConfigEdit = z.infer<typeof dayConfigEditSchema>;
export type DayConfigRestore = z.infer<typeof dayConfigRestoreSchema>;
export type DayConfigRefresh = z.infer<typeof dayConfigRefreshSchema>;
