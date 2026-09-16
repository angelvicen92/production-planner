import { z } from "zod";

export const assistedConfigRefreshApplySchema = z.object({
  expectedConfigRevisionId: z.number().int().positive(),
  selectedChangeKeys: z.array(z.string().min(1)).min(1),
}).strict();

export type AssistedConfigRefreshChangeKind = "NEW" | "MODIFIED" | "REMOVED";
export interface AssistedConfigRefreshChangeV1 {
  readonly key: string;
  readonly authority: "task_templates" | "optimizer";
  readonly kind: AssistedConfigRefreshChangeKind;
  readonly label: string;
  readonly localOverride: boolean;
}
export interface AssistedConfigRefreshPreviewV1 {
  readonly contractVersion: 1;
  readonly expectedConfigRevisionId: number;
  readonly changes: readonly AssistedConfigRefreshChangeV1[];
  readonly unsupportedAuthorities: readonly string[];
}
