import type { OperationalState } from "../contracts";
import type { ORCBaselineSeedHardFeasibilityAudit } from "../active/orcBaselineSeedFeasibilityAudit";

export type BaselineRepairRuntimeInvariantCode =
  | "repairable_audit_group_not_processed"
  | "baseline_overlap_repair_summary_contract_missing"
  | "baseline_overlap_repair_audit_not_passed"
  | "baseline_overlap_repair_candidates_missing_after_audit"
  | "none";

export interface BaselineRepairRuntimeInvariantResult {
  ok: boolean;
  repairableAuditGroupDetected: boolean;
  invariantViolationCode: BaselineRepairRuntimeInvariantCode;
  selectedRepairableTaskIds: number[];
  selectedRepairableSpaceId: number | null;
  requiredAction: string | null;
  warnings: string[];
  readOnly: true;
}

const REQUIRED_SUMMARY_FIELDS = [
  "auditAvailable",
  "auditPassedToCandidateBuilder",
  "auditPassedToRepairBuilder",
  "sourceOfTruth",
  "auditSpaceOverlapGroupCount",
  "auditRepairableGroupCount",
  "repairableGroupSelection",
  "runtimeWiringWarnings",
] as const;

const asRecord = (value: unknown): Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const toNumber = (value: unknown): number | null => Number.isFinite(Number(value)) ? Number(value) : null;
const toIds = (value: unknown): number[] => Array.isArray(value) ? value.map(toNumber).filter((id): id is number => id != null) : [];
const isProductivePair = (group: Record<string, unknown>): boolean => {
  const roles = Array.isArray(group.roleLabels) ? group.roleLabels.map(String) : [];
  return roles.length >= 2 && roles.every((role) => role === "productive_task");
};
const isExclusivePair = (group: Record<string, unknown>): boolean => {
  const raw = Array.isArray(group.occupancyModes) ? group.occupancyModes : Array.isArray(group.spaceOccupancyModes) ? group.spaceOccupancyModes : [];
  const modes = raw.map(String);
  return modes.length >= 2 && modes.every((mode) => mode === "exclusive");
};

export function findBaselineRepairableAuditGroup(baselineSeedHardFeasibility: ORCBaselineSeedHardFeasibilityAudit | Record<string, unknown> | null | undefined): { taskIds: number[]; spaceId: number | null } | null {
  const groups: Record<string, unknown>[] = Array.isArray((baselineSeedHardFeasibility as any)?.spaceOverlapGroups) ? (baselineSeedHardFeasibility as any).spaceOverlapGroups.map(asRecord) : [];
  const repairable = groups
    .filter((group: Record<string, unknown>) => {
      const taskIds = toIds(group.taskIds);
      return Number(group.taskCount ?? taskIds.length) === 2
        && taskIds.length === 2
        && toNumber(group.spaceId) != null
        && isProductivePair(group)
        && isExclusivePair(group);
    })
    .map((group: Record<string, unknown>) => ({ taskIds: toIds(group.taskIds).sort((a, b) => a - b), spaceId: toNumber(group.spaceId) }))
    .sort((a: { taskIds: number[]; spaceId: number | null }, b: { taskIds: number[]; spaceId: number | null }) => (a.spaceId ?? 999999) - (b.spaceId ?? 999999) || a.taskIds.join("-").localeCompare(b.taskIds.join("-")));
  return repairable[0] ?? null;
}

export function assertBaselineRepairRuntimeInvariant(args: {
  baselineSeedHardFeasibility?: ORCBaselineSeedHardFeasibilityAudit | Record<string, unknown> | null;
  baselineOverlapRepairSummary?: Record<string, unknown> | null;
  candidateResult?: { candidates?: readonly unknown[]; summary?: unknown } | null;
  operationalState?: OperationalState | null;
}): BaselineRepairRuntimeInvariantResult {
  void args.candidateResult;
  void args.operationalState;
  const summary = asRecord(args.baselineOverlapRepairSummary);
  const group = findBaselineRepairableAuditGroup(args.baselineSeedHardFeasibility);
  const warnings: string[] = [];
  if (!group) return { ok: true, repairableAuditGroupDetected: false, invariantViolationCode: "none", selectedRepairableTaskIds: [], selectedRepairableSpaceId: null, requiredAction: null, warnings, readOnly: true };

  const missing = REQUIRED_SUMMARY_FIELDS.filter((field) => !(field in summary));
  if (missing.length > 0) {
    warnings.push(`missing_summary_fields:${missing.join(",")}`);
    return { ok: false, repairableAuditGroupDetected: true, invariantViolationCode: "baseline_overlap_repair_summary_contract_missing", selectedRepairableTaskIds: group.taskIds, selectedRepairableSpaceId: group.spaceId, requiredAction: "run_late_audit_repair_pass", warnings, readOnly: true };
  }
  if (summary.auditPassedToCandidateBuilder !== true || summary.auditPassedToRepairBuilder !== true || summary.sourceOfTruth !== "baseline-hard-feasibility-audit") {
    return { ok: false, repairableAuditGroupDetected: true, invariantViolationCode: "baseline_overlap_repair_audit_not_passed", selectedRepairableTaskIds: group.taskIds, selectedRepairableSpaceId: group.spaceId, requiredAction: "run_late_audit_repair_pass", warnings, readOnly: true };
  }
  const generated = Number(summary.generatedCandidateCount ?? 0);
  if (summary.skippedReason === "unsupported_overlap_cardinality") {
    return { ok: false, repairableAuditGroupDetected: true, invariantViolationCode: "repairable_audit_group_not_processed", selectedRepairableTaskIds: group.taskIds, selectedRepairableSpaceId: group.spaceId, requiredAction: "run_late_audit_repair_pass", warnings, readOnly: true };
  }
  if (!Number.isFinite(generated) || generated <= 0) {
    return { ok: false, repairableAuditGroupDetected: true, invariantViolationCode: "baseline_overlap_repair_candidates_missing_after_audit", selectedRepairableTaskIds: group.taskIds, selectedRepairableSpaceId: group.spaceId, requiredAction: "run_late_audit_repair_pass", warnings, readOnly: true };
  }
  return { ok: true, repairableAuditGroupDetected: true, invariantViolationCode: "none", selectedRepairableTaskIds: group.taskIds, selectedRepairableSpaceId: group.spaceId, requiredAction: null, warnings, readOnly: true };
}
