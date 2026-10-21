import { z } from "zod";

export const roundPreparationTargetSchema = z.object({
  policyId: z.string().trim().min(1),
  spaceId: z.number().int().positive().safe(),
}).strict();
export const roundPreparationEditSchema = roundPreparationTargetSchema.extend({
  preparationMinutesBetweenRounds: z.number().int().nonnegative().max(2147483647),
}).strict();
export const configRevisionIdSchema = z.number().int().positive().safe().nullable();
export const roundPreparationOverrideSchema = roundPreparationEditSchema.extend({
  by: z.string().uuid(),
  at: z.string().datetime({ offset: true }),
}).strict();
export type RoundPreparationEdit = z.infer<typeof roundPreparationEditSchema>;
export type RoundPreparationTarget = z.infer<typeof roundPreparationTargetSchema>;
export type RoundPreparationOverride = z.infer<typeof roundPreparationOverrideSchema>;
export interface RoundPreparationValue extends RoundPreparationEdit {
  spaceName: string;
  taskCount: number;
  baselineMinutes: number;
  source: "DAY_SNAPSHOT" | "DAY_OVERRIDE";
  overrideMetadata: { createdBy: string; createdAt: string } | null;
}
