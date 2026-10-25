import { z } from "zod";
import type { EngineInputRoundSynchronizationInput } from "../engine/types";

const id = z.number().int().positive().max(2147483647);
const lane = z.object({ spaceId:id, taskIds:z.array(id).min(2),
  preparationMinutesBetweenRounds:z.number().int().min(0).max(2147483647).multipleOf(5) }).strict();
export const dailyRoundPolicySchema: z.ZodType<EngineInputRoundSynchronizationInput> = z.object({
  id:z.string().trim().min(1).max(120), synchronization:z.literal("START_TOGETHER_WHILE_ALL_LANES_ACTIVE"),
  lanes:z.array(lane).length(2),
}).strict();
/** Empty policies explicitly removes the structure. Task order is membership, not a fixed timetable. */
export const roundSynchronizationStructureSchema = z.object({
  contractVersion:z.literal(1), policies:z.array(dailyRoundPolicySchema).max(1),
}).strict();
export type RoundSynchronizationStructure = z.infer<typeof roundSynchronizationStructureSchema>;
export const persistedRoundSynchronizationStructureSchema = roundSynchronizationStructureSchema.extend({
  by:z.string().uuid(), at:z.string().datetime({offset:true}),
}).strict();
