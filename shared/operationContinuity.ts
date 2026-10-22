import { z } from "zod";

export const continuityPolicySchema = z.enum(["OFF", "PREFERRED", "REQUIRED"]);
export const continuityGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  policy: continuityPolicySchema,
  gapWeight: z.number().int().min(1).max(1000),
  revision: z.number().int().nonnegative(),
}).strict();
export type ContinuityGroup = z.infer<typeof continuityGroupSchema>;
export const continuityGroupWriteSchema = continuityGroupSchema.omit({ id: true, revision: true }).extend({
  expectedRevision: z.number().int().nonnegative().nullable(),
}).strict();
export const continuityEditSchema = z.object({
  groupId: z.string().uuid(), policy: continuityPolicySchema,
  gapWeight: z.number().int().min(1).max(1000),
}).strict();
export type ContinuityEdit = z.infer<typeof continuityEditSchema>;
export interface OperationContinuityGroup<T = number> {
  id: string;
  taskIds: T[];
  policy: ContinuityGroup["policy"];
  gapWeight: number;
}
