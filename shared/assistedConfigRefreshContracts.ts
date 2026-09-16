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
  /** Existing day-local provenance, independently of whether General differs semantically. */
  readonly localOverrides: readonly AssistedConfigRefreshLocalOverrideV1[];
  /** Daily authorities that cannot yet be refreshed losslessly from General. */
  readonly unsupportedAuthorities: readonly AssistedConfigRefreshUnsupportedAuthorityV1[];
}

export interface AssistedConfigRefreshLocalOverrideV1 {
  readonly key: string;
  readonly authority: "task_templates" | "optimizer";
  readonly label: string;
  readonly source: "ad_hoc_from_default" | "DAY_OVERRIDE";
}

export interface AssistedConfigRefreshUnsupportedAuthorityV1 {
  readonly authority: "plan_workday" | "contestant_availability" | "spatial_configuration" | "resource_configuration" | "resource_assignments_and_requirements" | "resource_bundles";
  readonly label: string;
  readonly reason: "NO_LOSSLESS_GENERAL_TO_DAY_PROJECTION";
}
