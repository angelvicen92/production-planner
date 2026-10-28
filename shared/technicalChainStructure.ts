import { z } from "zod";
import type { EngineInputTechnicalChainInput } from "../engine/types";
const id = z.number().int().positive().max(2147483647);
/** Arrays are ordered: never numerically sort orderedTaskIds. Empty policies removes the rule.
 * Only phases may explicitly declare no universal physical identity. The field
 * remains required; every operation retains its own effective requirements. */
export const dailyTechnicalChainPolicySchema: z.ZodType<EngineInputTechnicalChainInput> = z.object({
  id:z.string().trim().min(1).max(120), orderedTaskIds:z.array(id).min(2),
  phases:z.array(z.array(id).min(1)).min(1).optional(),
  adjacency:z.literal("REQUIRED"), resourceContinuity:z.literal("REQUIRED"),
  requiredResourceIds:z.array(id),
}).strict().superRefine((policy,ctx)=>{
  if(policy.phases===undefined&&policy.requiredResourceIds.length===0)
    ctx.addIssue({code:z.ZodIssueCode.too_small,type:"array",minimum:1,inclusive:true,path:["requiredResourceIds"],message:"A linear chain requires a common resource"});
});
export const technicalChainStructureSchema = z.object({contractVersion:z.literal(1),policies:z.array(dailyTechnicalChainPolicySchema).max(1)}).strict();
export type TechnicalChainStructure = z.infer<typeof technicalChainStructureSchema>;
export const persistedTechnicalChainStructureSchema = technicalChainStructureSchema.extend({by:z.string().uuid(),at:z.string().datetime({offset:true})}).strict();
