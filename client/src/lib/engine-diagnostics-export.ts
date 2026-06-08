import type {
  EngineDiagnosticWarning,
  EngineDiagnostics,
} from "@/hooks/use-engine-diagnostics";
import {
  calculatePlanningOperationalQuality,
  type OperationalQuality,
  type OperationalQualityInput,
} from "@/lib/planning-operational-quality";

export const ENGINE_DIAGNOSTICS_EXPORT_VERSION = 5;
export const MAX_EXPORTED_HARD_VIOLATIONS = 50;
export const MAX_EXPORTED_WARNINGS_PER_GROUP = 20;

const MAX_WARNING_TASK_IDS = 25;
const MAX_WARNING_MESSAGE_LENGTH = 500;
const MAX_METRIC_KEYS = 25;
const MAX_METRIC_ARRAY_ITEMS = 25;
const MAX_METRIC_DEPTH = 2;
const MAX_METRIC_STRING_LENGTH = 500;

type JsonPrimitive = string | number | boolean | null;
type CompactJsonValue = JsonPrimitive | CompactJsonValue[] | { [key: string]: CompactJsonValue };

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function compactJsonValue(value: unknown, depth = 0): CompactJsonValue | undefined {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "string") {
    return typeof value === "string" && value.length > MAX_METRIC_STRING_LENGTH
      ? value.slice(0, MAX_METRIC_STRING_LENGTH)
      : value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (depth >= MAX_METRIC_DEPTH) return undefined;

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METRIC_ARRAY_ITEMS)
      .map((item) => compactJsonValue(item, depth + 1))
      .filter((item): item is CompactJsonValue => item !== undefined);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_METRIC_KEYS)
        .flatMap(([key, item]) => {
          const compacted = compactJsonValue(item, depth + 1);
          return compacted === undefined ? [] : [[key, compacted]];
        }),
    );
  }

  return undefined;
}

function compactWarning(warning: EngineDiagnosticWarning): EngineDiagnosticWarning {
  return {
    code: optionalString(warning?.code),
    severity: optionalString(warning?.severity),
    message: optionalString(warning?.message)?.slice(0, MAX_WARNING_MESSAGE_LENGTH) ?? null,
    taskIds: Array.isArray(warning?.taskIds)
      ? warning.taskIds
        .map(optionalNumber)
        .filter((taskId): taskId is number => taskId !== null)
        .slice(0, MAX_WARNING_TASK_IDS)
      : null,
    bundleId: optionalString(warning?.bundleId),
  };
}

function compactWarnings(value: unknown): EngineDiagnosticWarning[] {
  return Array.isArray(value)
    ? value
      .filter((warning): warning is EngineDiagnosticWarning => Boolean(warning) && typeof warning === "object")
      .slice(0, MAX_EXPORTED_WARNINGS_PER_GROUP)
      .map(compactWarning)
    : [];
}

export type EngineDiagnosticsSnapshot = {
  exportVersion: number;
  generatedAt: string;
  planId: number | null;
  runId: number | null;
  engineVersion: string | null;
  status: string | null;
  solutionSource: string | null;
  createdAt: string | null;
  summary: {
    plannedTasks: number | null;
    unplannedTasks: number | null;
    hardConstraintViolations: number | null;
    hardValidationPassed: boolean | null;
    hardConstraintViolationCodes: string[];
    hardConstraintViolationDetails: CompactJsonValue[];
    mainStageGapMinutes: number | null;
    mainStageGapCount: number | null;
    coachSwitchCount: number | null;
    restrictiveTalentAverageStartOffset: number | null;
  };
  intelligence: {
    candidateSolutionsEvaluated: number | null;
    candidateSelectionReason: string | null;
    backtrackingAttempted: boolean | null;
    backtrackingAccepted: boolean | null;
    neighborhoodSearchAttempted: boolean | null;
    neighborhoodCandidatesGenerated: number | null;
    neighborhoodCandidateAccepted: boolean | null;
    operationalCompactionAttempted: boolean | null;
    operationalCompactionCandidatesGenerated: number | null;
    operationalCompactionAccepted: boolean | null;
    operationalCompactionReason: string | null;
    operationalCompactionMetricsBefore: CompactJsonValue | null;
    operationalCompactionMetricsAfter: CompactJsonValue | null;
    coachCompactionAttempted: boolean | null;
    coachCompactionCandidatesGenerated: number | null;
    coachCompactionRejectedReasons: CompactJsonValue;
    coachCompactionTargetedCoaches: CompactJsonValue;
    coachCompactionBestBefore: CompactJsonValue | null;
    coachCompactionBestAfter: CompactJsonValue | null;
    cpSatPilotAttempted: boolean | null;
    cpSatPilotAccepted: boolean | null;
    cpSatSegmentsAttempted: number | null;
    cpSatSegmentsAccepted: number | null;
  };
  selectedCandidateMetrics: CompactJsonValue | null;
  humanReviewTemplate: {
    observedIssue: null;
    expectedBehavior: null;
    criticalTalentOrResource: null;
    notes: null;
  };
  resourceBundles: {
    declared: number | null;
    usable: number | null;
    invalid: number | null;
    partiallyUsable: number | null;
  };
  warnings: {
    resourceDiagnosticWarnings: EngineDiagnosticWarning[];
    resourceBundleValidationWarnings: EngineDiagnosticWarning[];
  };
  operationalQuality: OperationalQuality;
};

export function buildEngineDiagnosticsSnapshot(
  diagnostics: EngineDiagnostics,
  options: { generatedAt?: Date; planId?: number; operationalQualityInput?: OperationalQualityInput } = {},
): EngineDiagnosticsSnapshot {
  const metadata = diagnostics?.engineMetadata ?? {};
  const warnings = diagnostics?.diagnosticWarnings ?? {};
  const selectedCandidateMetrics = compactJsonValue(diagnostics?.selectedCandidateMetrics);

  return {
    exportVersion: ENGINE_DIAGNOSTICS_EXPORT_VERSION,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    planId: optionalNumber(diagnostics?.planId) ?? optionalNumber(options.planId),
    runId: optionalNumber(diagnostics?.id),
    engineVersion: optionalString(diagnostics?.engineVersion),
    status: optionalString(diagnostics?.status),
    solutionSource: optionalString(diagnostics?.solutionSource),
    createdAt: optionalString(diagnostics?.createdAt),
    summary: {
      plannedTasks: optionalNumber(diagnostics?.plannedTasks),
      unplannedTasks: optionalNumber(diagnostics?.unplannedTasks),
      hardConstraintViolations: optionalNumber(diagnostics?.hardConstraintViolations),
      hardValidationPassed: optionalBoolean(diagnostics?.hardValidationPassed ?? metadata.hardValidationPassed),
      hardConstraintViolationCodes: (Array.isArray(diagnostics?.hardConstraintViolationCodes)
        ? diagnostics.hardConstraintViolationCodes
        : Array.isArray(metadata.hardConstraintViolationCodes) ? metadata.hardConstraintViolationCodes : [])
        .map(optionalString).filter((code): code is string => code !== null).slice(0, 20),
      hardConstraintViolationDetails: (Array.isArray(diagnostics?.hardConstraintViolationDetails)
        ? diagnostics.hardConstraintViolationDetails
        : Array.isArray(metadata.hardConstraintViolationDetails) ? metadata.hardConstraintViolationDetails : [])
        .slice(0, MAX_EXPORTED_HARD_VIOLATIONS)
        .map((detail) => compactJsonValue(detail))
        .filter((detail): detail is CompactJsonValue => detail !== undefined),
      mainStageGapMinutes: optionalNumber(diagnostics?.mainStageGapMinutes),
      mainStageGapCount: optionalNumber(diagnostics?.mainStageGapCount),
      coachSwitchCount: optionalNumber(diagnostics?.coachSwitchCount),
      restrictiveTalentAverageStartOffset: optionalNumber(diagnostics?.restrictiveTalentAverageStartOffset),
    },
    intelligence: {
      candidateSolutionsEvaluated: optionalNumber(metadata.candidateSolutionsEvaluated),
      candidateSelectionReason: optionalString(metadata.candidateSelectionReason),
      backtrackingAttempted: optionalBoolean(metadata.backtrackingAttempted),
      backtrackingAccepted: optionalBoolean(metadata.backtrackingAccepted),
      neighborhoodSearchAttempted: optionalBoolean(metadata.neighborhoodSearchAttempted),
      neighborhoodCandidatesGenerated: optionalNumber(metadata.neighborhoodCandidatesGenerated),
      neighborhoodCandidateAccepted: optionalBoolean(metadata.neighborhoodCandidateAccepted),
      operationalCompactionAttempted: optionalBoolean(metadata.operationalCompactionAttempted),
      operationalCompactionCandidatesGenerated: optionalNumber(metadata.operationalCompactionCandidatesGenerated),
      operationalCompactionAccepted: optionalBoolean(metadata.operationalCompactionAccepted),
      operationalCompactionReason: optionalString(metadata.operationalCompactionReason),
      operationalCompactionMetricsBefore: compactJsonValue(metadata.operationalCompactionMetricsBefore) ?? null,
      operationalCompactionMetricsAfter: compactJsonValue(metadata.operationalCompactionMetricsAfter) ?? null,
      coachCompactionAttempted: optionalBoolean(metadata.coachCompactionAttempted),
      coachCompactionCandidatesGenerated: optionalNumber(metadata.coachCompactionCandidatesGenerated),
      coachCompactionRejectedReasons: compactJsonValue(metadata.coachCompactionRejectedReasons) ?? [],
      coachCompactionTargetedCoaches: compactJsonValue(metadata.coachCompactionTargetedCoaches) ?? [],
      coachCompactionBestBefore: compactJsonValue(metadata.coachCompactionBestBefore) ?? null,
      coachCompactionBestAfter: compactJsonValue(metadata.coachCompactionBestAfter) ?? null,
      cpSatPilotAttempted: optionalBoolean(metadata.cpSatPilotAttempted),
      cpSatPilotAccepted: optionalBoolean(metadata.cpSatPilotAccepted),
      cpSatSegmentsAttempted: optionalNumber(metadata.cpSatSegmentsAttempted),
      cpSatSegmentsAccepted: optionalNumber(metadata.cpSatSegmentsAccepted),
    },
    selectedCandidateMetrics: selectedCandidateMetrics ?? null,
    humanReviewTemplate: {
      observedIssue: null,
      expectedBehavior: null,
      criticalTalentOrResource: null,
      notes: null,
    },
    resourceBundles: {
      declared: optionalNumber(metadata.declaredResourceBundleCount),
      usable: optionalNumber(metadata.usableResourceBundleCount),
      invalid: optionalNumber(metadata.invalidResourceBundleCount),
      partiallyUsable: optionalNumber(metadata.partiallyUsableResourceBundleCount),
    },
    warnings: {
      resourceDiagnosticWarnings: compactWarnings(warnings.resourceDiagnosticWarnings),
      resourceBundleValidationWarnings: compactWarnings(warnings.resourceBundleValidationWarnings),
    },
    operationalQuality: calculatePlanningOperationalQuality(options.operationalQualityInput),
  };
}

export function engineDiagnosticsFilename(snapshot: EngineDiagnosticsSnapshot): string {
  const planId = snapshot.planId ?? "unknown";
  const runId = snapshot.runId ?? "unknown";
  return `engine-diagnostics-plan-${planId}-${runId}.json`;
}
