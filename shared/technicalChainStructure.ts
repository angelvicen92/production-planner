import { z } from "zod";
import type { EngineInputTechnicalChainInput } from "../engine/types";
const id = z.number().int().positive().max(2147483647);
/** Arrays are ordered: never numerically sort orderedTaskIds. Empty policies removes the rule. */
export const dailyTechnicalChainPolicySchema: z.ZodType<EngineInputTechnicalChainInput> = z.object({
  id:z.string().trim().min(1).max(120), orderedTaskIds:z.array(id).min(2),
  adjacency:z.literal("REQUIRED"), resourceContinuity:z.literal("REQUIRED"),
  requiredResourceIds:z.array(id).min(1),
}).strict();
export const technicalChainStructureSchema = z.object({contractVersion:z.literal(1),policies:z.array(dailyTechnicalChainPolicySchema).max(1)}).strict();
export type TechnicalChainStructure = z.infer<typeof technicalChainStructureSchema>;
export const persistedTechnicalChainStructureSchema = technicalChainStructureSchema.extend({by:z.string().uuid(),at:z.string().datetime({offset:true})}).strict();
