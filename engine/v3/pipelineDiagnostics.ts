import type { EngineOutput } from "../types";

export const MAX_PIPELINE_CONFLICT_DETAILS = 10;
export const MAX_PIPELINE_CONFLICT_TASK_VALUES = 6;

export type PipelineDiagnosticsMetadata = Required<Pick<NonNullable<EngineOutput["v3Meta"]>,
  | "pipelineConflictDetails"
  | "pipelineRepairAttempted"
  | "pipelineRepairCandidatesGenerated"
  | "pipelineRepairAccepted"
  | "pipelineSegmentRepairAttempted"
  | "pipelineSegmentRepairCandidatesGenerated"
  | "pipelineSegmentRepairAccepted"
  | "pipelineSegmentRepairReason"
  | "pipelineSegmentRepairStrategiesTried"
  | "pipelineSegmentRepairMovedTalentNames"
  | "pipelineSegmentRepairRejectedReasons"
  | "pipelineLaneRepairAttempted"
  | "pipelineLaneRepairCandidatesGenerated"
  | "pipelineLaneRepairAccepted"
  | "pipelineLaneRepairReason"
  | "pipelineLaneRepairRejectedReasons"
  | "pipelineAlternativeLaneAttempted"
  | "pipelineAlternativeLaneCandidatesGenerated"
  | "pipelineAlternativeLaneAccepted"
  | "pipelineAlternativeLaneRejectedReasons"
>>;

const compactStrings = (value: unknown, limit: number): string[] => Array.isArray(value)
  ? [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))].slice(0, limit)
  : [];

const compactNumbers = (value: unknown): number[] => Array.isArray(value)
  ? [...new Set(value.map(Number).filter(Number.isFinite))].slice(0, MAX_PIPELINE_CONFLICT_TASK_VALUES)
  : [];

const finiteNumber = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const compactText = (value: unknown, fallback = ""): string => {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, 240);
};

const REPAIRABLE_REJECTIONS = new Set([
  "resource_conflict",
  "resource_conflict_unrepaired",
  "space_conflict",
  "space_conflict_unrepaired",
  "dependency_violation",
  "dependency_conflict_unrepaired",
  "candidate_failed_hard_validation",
]);

export const hasRepairablePipelineRejection = (value: unknown): boolean => (
  compactStrings(value, 20).some((reason) => REPAIRABLE_REJECTIONS.has(reason))
);

const fallbackViolationCode = (rejectedReasons: string[]): string => {
  if (rejectedReasons.some((reason) => reason.includes("resource_conflict"))) return "RESOURCE_OVERLAP";
  if (rejectedReasons.some((reason) => reason.includes("space_conflict"))) return "SPACE_OVERLAP";
  if (rejectedReasons.some((reason) => reason.includes("dependency"))) return "DEPENDENCY_VIOLATION";
  return "HARD_VALIDATION_FAILURE";
};

const compactConflictDetail = (
  detail: Record<string, unknown>,
  segmentRepairAttempted: boolean,
  strategiesTried: string[],
) => {
  const taskIds = compactNumbers(detail.taskIds);
  const blockingTaskIds = compactNumbers(detail.blockingTaskIds);
  const hasValidatorIdentity = taskIds.length > 0
    || blockingTaskIds.length > 0
    || finiteNumber(detail.resourceId) !== undefined
    || finiteNumber(detail.spaceId) !== undefined;
  const message = compactText(
    detail.message,
    hasValidatorIdentity ? "pipeline_conflict" : "conflict_detail_unavailable_from_validator",
  );
  return {
    candidateName: compactText(detail.candidateName, "pipeline_builder"),
    violationCode: compactText(detail.violationCode, "HARD_VALIDATION_FAILURE"),
    ...(finiteNumber(detail.resourceId) !== undefined ? { resourceId: finiteNumber(detail.resourceId) } : {}),
    ...(compactText(detail.resourceName) ? { resourceName: compactText(detail.resourceName) } : {}),
    ...(finiteNumber(detail.spaceId) !== undefined ? { spaceId: finiteNumber(detail.spaceId) } : {}),
    ...(compactText(detail.spaceName) ? { spaceName: compactText(detail.spaceName) } : {}),
    ...(compactText(detail.start) ? { start: compactText(detail.start) } : {}),
    ...(compactText(detail.end) ? { end: compactText(detail.end) } : {}),
    taskIds,
    taskNames: compactStrings(detail.taskNames, MAX_PIPELINE_CONFLICT_TASK_VALUES),
    talentNames: compactStrings(detail.talentNames, MAX_PIPELINE_CONFLICT_TASK_VALUES),
    blockingTaskIds,
    blockingTaskNames: compactStrings(detail.blockingTaskNames, MAX_PIPELINE_CONFLICT_TASK_VALUES),
    movableTaskIds: compactNumbers(detail.movableTaskIds),
    lockedOrExecutedTaskIds: compactNumbers(detail.lockedOrExecutedTaskIds),
    conflictKind: (["exclusive_lane_capacity", "break_window_blocker", "fixed_task_blocker", "movable_task_conflict", "dependency_chain_conflict", "unknown"].includes(compactText(detail.conflictKind))
      ? compactText(detail.conflictKind) : "unknown") as "exclusive_lane_capacity" | "break_window_blocker" | "fixed_task_blocker" | "movable_task_conflict" | "dependency_chain_conflict" | "unknown",
    isBreakBlocker: detail.isBreakBlocker === true,
    isExplicitLock: detail.isExplicitLock === true,
    isDoneOrInProgress: detail.isDoneOrInProgress === true,
    isImplicitFixed: detail.isImplicitFixed === true,
    canUseAlternativeLane: detail.canUseAlternativeLane === true,
    ...(compactText(detail.fixedReason) ? { fixedReason: compactText(detail.fixedReason) } : {}),
    alternativeLaneSpaceIds: compactNumbers(detail.alternativeLaneSpaceIds),
    ...(finiteNumber(detail.selectedAlternativeLaneSpaceId) !== undefined ? { selectedAlternativeLaneSpaceId: finiteNumber(detail.selectedAlternativeLaneSpaceId) } : {}),
    laneRepairResult: compactText(detail.laneRepairResult, compactText(detail.repairResult, "not_attempted")),
    repairAttempted: typeof detail.repairAttempted === "boolean" ? detail.repairAttempted : segmentRepairAttempted,
    repairStrategy: compactText(detail.repairStrategy, strategiesTried.join(",") || "none"),
    repairResult: compactText(detail.repairResult, "conflict_detail_unavailable_from_validator"),
    message,
  };
};

export const normalizePipelineDiagnosticsMetadata = (
  metadata: Record<string, unknown> | Partial<NonNullable<EngineOutput["v3Meta"]>> | null | undefined,
): PipelineDiagnosticsMetadata => {
  const source = (metadata ?? {}) as Record<string, unknown>;
  const rejectedReasons = compactStrings(source.pipelineRejectedReasons, 20);
  const strategiesTried = compactStrings(source.pipelineSegmentRepairStrategiesTried, 10);
  const segmentRepairAttempted = source.pipelineSegmentRepairAttempted === true;
  const segmentRepairAccepted = source.pipelineSegmentRepairAccepted === true;
  const repairableRejection = hasRepairablePipelineRejection(rejectedReasons);
  const suppliedReason = compactText(source.pipelineSegmentRepairReason);
  const segmentRepairReason = !segmentRepairAttempted && repairableRejection
    ? "segment_repair_not_invoked"
    : suppliedReason
      || (segmentRepairAttempted && !segmentRepairAccepted
        ? "repair_attempted_but_no_valid_candidate"
        : "not_attempted");
  const details = Array.isArray(source.pipelineConflictDetails)
    ? source.pipelineConflictDetails
      .filter((detail: unknown) => Boolean(detail) && typeof detail === "object")
      .slice(0, MAX_PIPELINE_CONFLICT_DETAILS)
      .map((detail: unknown) => compactConflictDetail(detail as Record<string, unknown>, segmentRepairAttempted, strategiesTried))
    : [];

  if (details.length === 0 && repairableRejection) {
    details.push(compactConflictDetail({
      candidateName: "pipeline_builder",
      violationCode: fallbackViolationCode(rejectedReasons),
      repairAttempted: segmentRepairAttempted,
      repairStrategy: strategiesTried.join(",") || "none",
      repairResult: segmentRepairReason,
      message: "conflict_detail_unavailable_from_validator",
    }, segmentRepairAttempted, strategiesTried));
  }

  return {
    pipelineConflictDetails: details,
    pipelineRepairAttempted: source.pipelineRepairAttempted === true,
    pipelineRepairCandidatesGenerated: finiteNumber(source.pipelineRepairCandidatesGenerated) ?? 0,
    pipelineRepairAccepted: source.pipelineRepairAccepted === true,
    pipelineSegmentRepairAttempted: segmentRepairAttempted,
    pipelineSegmentRepairCandidatesGenerated: finiteNumber(source.pipelineSegmentRepairCandidatesGenerated) ?? 0,
    pipelineSegmentRepairAccepted: segmentRepairAccepted,
    pipelineSegmentRepairReason: segmentRepairReason,
    pipelineSegmentRepairStrategiesTried: strategiesTried,
    pipelineSegmentRepairMovedTalentNames: compactStrings(source.pipelineSegmentRepairMovedTalentNames, 20),
    pipelineSegmentRepairRejectedReasons: compactStrings(source.pipelineSegmentRepairRejectedReasons, 10),
    pipelineLaneRepairAttempted: source.pipelineLaneRepairAttempted === true,
    pipelineLaneRepairCandidatesGenerated: finiteNumber(source.pipelineLaneRepairCandidatesGenerated) ?? 0,
    pipelineLaneRepairAccepted: source.pipelineLaneRepairAccepted === true,
    pipelineLaneRepairReason: compactText(source.pipelineLaneRepairReason, "not_attempted"),
    pipelineLaneRepairRejectedReasons: compactStrings(source.pipelineLaneRepairRejectedReasons, 10),
    pipelineAlternativeLaneAttempted: source.pipelineAlternativeLaneAttempted === true,
    pipelineAlternativeLaneCandidatesGenerated: finiteNumber(source.pipelineAlternativeLaneCandidatesGenerated) ?? 0,
    pipelineAlternativeLaneAccepted: source.pipelineAlternativeLaneAccepted === true,
    pipelineAlternativeLaneRejectedReasons: compactStrings(source.pipelineAlternativeLaneRejectedReasons, 10),
  };
};
