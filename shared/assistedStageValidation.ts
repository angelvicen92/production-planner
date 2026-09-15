export type StageViolationSeverity = "HARD" | "REQUIRED" | "PREFERRED";

export interface StageViolation {
  ruleCode: string;
  severity: StageViolationSeverity;
  violationKey: string;
  affectedTaskIds: number[];
  affectedResourceIds: number[];
  affectedSpaceIds: number[];
  details: Record<string, unknown>;
  inheritedAcceptedExceptionId: number | null;
}

export interface StageValidationReport {
  contractVersion: 1;
  mode: "PROPOSAL_CERTIFIED_CLEAN_V1" | "MANUAL_DELTA_CLEAN_V1";
  hardValid: boolean;
  hardCount: number;
  requiredCount: number;
  preferredCount: number;
  preferredAssessment: "NOT_CLASSIFIED";
  violations: StageViolation[];
  [key: string]: unknown;
}

const canonicalIds = (values: readonly number[] | undefined) => [...new Set(values ?? [])].sort((a, b) => a - b);
const canonicalDimensions = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canonicalDimensions)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalDimensions(item)]))
    : value;

/** Lossless, message-independent identity for one material rule conflict. */
export function createViolationKey(input: {
  ruleCode: string; affectedTaskIds?: readonly number[]; affectedResourceIds?: readonly number[];
  affectedSpaceIds?: readonly number[]; dimensions?: Record<string, unknown>;
}): string {
  return JSON.stringify({ ruleCode: input.ruleCode, taskIds: canonicalIds(input.affectedTaskIds),
    resourceIds: canonicalIds(input.affectedResourceIds), spaceIds: canonicalIds(input.affectedSpaceIds),
    dimensions: canonicalDimensions(input.dimensions ?? {}) });
}

export function isAcceptedExceptionStillApplicable(exception: Pick<StageViolation, "violationKey" | "affectedTaskIds"> & { snapshotFingerprint: string },
  current: Pick<StageViolation, "violationKey">, materiallyChangedTaskIds: readonly number[]): boolean {
  const changed = new Set(materiallyChangedTaskIds);
  return exception.violationKey === current.violationKey && !exception.affectedTaskIds.some(id => changed.has(id));
}
