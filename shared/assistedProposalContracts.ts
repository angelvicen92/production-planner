import { z } from "zod";

export const assistedScopeSelectorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TASK_IDS"), taskIds: z.array(z.number().int().positive()).min(1) }).strict(),
  z.object({ kind: z.literal("SPACE"), spaceId: z.number().int().positive() }).strict(),
]);
export const assistedProposalRequestSchema = z.object({
  selector: assistedScopeSelectorSchema,
  includePrerequisites: z.boolean(),
  expectedDraftFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  expectedBaseStageId: z.number().int().positive(),
}).strict();
export const assistedProposalApplySchema = assistedProposalRequestSchema.pick({
  expectedDraftFingerprint: true, expectedBaseStageId: true,
});
export type AssistedScopeSelector = z.infer<typeof assistedScopeSelectorSchema>;
export type AssistedProposalRequest = z.infer<typeof assistedProposalRequestSchema>;

export interface AssistedProposalPlacementV1 {
  readonly taskId: number; readonly startPlanned: string; readonly endPlanned: string;
  readonly spaceId: number; readonly zoneId: number | null;
}
export interface AssistedProposalRunResultV1 {
  readonly contractVersion: 1;
  readonly outcome: "PROPOSAL" | "NO_PROPOSAL" | "UNSUPPORTED";
  readonly selector: AssistedScopeSelector;
  readonly scopeTaskIds: readonly number[];
  readonly includePrerequisites: boolean;
  readonly proposal: readonly AssistedProposalPlacementV1[] | null;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly reasonCodes: readonly string[];
}
