export const A2_PLANNING_COMPARISON_CONTRACT_VERSION = "A2.planning-comparison.v1" as const;

export type PrimaryKpiId =
  | "P01"
  | "P02"
  | "P03"
  | "P04"
  | "P05"
  | "P06"
  | "P07"
  | "P08"
  | "P09"
  | "P10";

export const PRIMARY_KPI_IDS: readonly PrimaryKpiId[] = Object.freeze([
  "P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10",
]);

export type ComparisonDirection = "LOWER_IS_BETTER" | "HIGHER_IS_BETTER";
export type HardGateAssessment = "PASS" | "FAIL" | "UNASSESSED";
export type ComparisonClassification = "INVALID" | "WORSE" | "TRADEOFF" | "PARITY" | "PARETO_BETTER";
export type SignalRelation = "BETTER" | "EQUIVALENT" | "WORSE";

export interface PrimaryComparisonSignal {
  readonly id: string;
  readonly kpiId: PrimaryKpiId;
  readonly direction: ComparisonDirection;
  readonly humanValue: number;
  readonly optiPlanValue: number;
}

export interface ComparisonTolerancePolicy {
  readonly version: string;
  readonly toleranceBySignalId: Readonly<Record<string, number>>;
}

export interface SignalComparisonEvidence {
  readonly id: string;
  readonly kpiId: PrimaryKpiId;
  readonly direction: ComparisonDirection;
  readonly humanValue: number;
  readonly optiPlanValue: number;
  readonly rawDelta: number;
  readonly signedWorseningDelta: number;
  readonly tolerance: number;
  readonly relation: SignalRelation;
}

export interface PlanningComparisonInput {
  readonly referenceHardGates: HardGateAssessment;
  readonly optiPlanHardGates: HardGateAssessment;
  readonly signals: readonly PrimaryComparisonSignal[];
  readonly tolerancePolicy?: ComparisonTolerancePolicy;
  readonly requiredKpiIds?: readonly PrimaryKpiId[];
}

export interface ClassifiedPlanningComparison {
  readonly contractVersion: typeof A2_PLANNING_COMPARISON_CONTRACT_VERSION;
  readonly status: "CLASSIFIED";
  readonly classification: ComparisonClassification;
  readonly tolerancePolicyVersion: string | null;
  readonly signalEvidence: readonly SignalComparisonEvidence[];
  readonly betterSignalIds: readonly string[];
  readonly worseSignalIds: readonly string[];
  readonly equivalentSignalIds: readonly string[];
  readonly mayClaimBetterThanHuman: boolean;
  readonly explanation: string;
}

export interface BlockedPlanningComparison {
  readonly contractVersion: typeof A2_PLANNING_COMPARISON_CONTRACT_VERSION;
  readonly status: "BLOCKED_BY_CONFIGURATION";
  readonly classification: null;
  readonly missing: readonly string[];
  readonly explanation: string;
  readonly signalEvidence: readonly [];
  readonly mayClaimBetterThanHuman: false;
}

export type PlanningComparisonResult = ClassifiedPlanningComparison | BlockedPlanningComparison;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

function blocked(missing: readonly string[], explanation: string): BlockedPlanningComparison {
  return deepFreeze({
    contractVersion: A2_PLANNING_COMPARISON_CONTRACT_VERSION,
    status: "BLOCKED_BY_CONFIGURATION" as const,
    classification: null,
    missing: [...new Set(missing)].sort(),
    explanation,
    signalEvidence: [] as const,
    mayClaimBetterThanHuman: false as const,
  });
}

function classifySignal(signal: PrimaryComparisonSignal, tolerance: number): SignalComparisonEvidence {
  const rawDelta = signal.optiPlanValue - signal.humanValue;
  const signedWorseningDelta = signal.direction === "LOWER_IS_BETTER" ? rawDelta : -rawDelta;
  const relation: SignalRelation = signedWorseningDelta > tolerance
    ? "WORSE"
    : signedWorseningDelta < -tolerance
      ? "BETTER"
      : "EQUIVALENT";
  return deepFreeze({ ...signal, rawDelta, signedWorseningDelta, tolerance, relation });
}

function validateConfiguration(input: PlanningComparisonInput): readonly string[] {
  const missing: string[] = [];
  const requiredKpiIds = input.requiredKpiIds ?? PRIMARY_KPI_IDS;
  const signalIds = new Set<string>();
  const kpiIds = new Set<PrimaryKpiId>();

  if (input.referenceHardGates !== "PASS") missing.push(`reference_hard_gates:${input.referenceHardGates.toLowerCase()}`);
  if (input.optiPlanHardGates === "UNASSESSED") missing.push("optiplan_hard_gates:unassessed");

  for (const signal of input.signals) {
    if (!signal.id.trim()) missing.push("signal_id:empty");
    if (signalIds.has(signal.id)) missing.push(`signal_id:duplicate:${signal.id}`);
    signalIds.add(signal.id);
    kpiIds.add(signal.kpiId);
    if (!Number.isFinite(signal.humanValue)) missing.push(`signal_value:human:${signal.id}`);
    if (!Number.isFinite(signal.optiPlanValue)) missing.push(`signal_value:optiplan:${signal.id}`);
  }

  for (const kpiId of requiredKpiIds) {
    if (!kpiIds.has(kpiId)) missing.push(`primary_kpi:${kpiId}`);
  }

  const policy = input.tolerancePolicy;
  if (!policy) {
    missing.push("tolerance_policy");
    return missing;
  }
  if (!policy.version.trim()) missing.push("tolerance_policy:version");
  for (const signal of input.signals) {
    const tolerance = policy.toleranceBySignalId[signal.id];
    if (tolerance === undefined) missing.push(`tolerance:${signal.id}`);
    else if (!Number.isFinite(tolerance) || tolerance < 0) missing.push(`tolerance_invalid:${signal.id}`);
  }
  return missing;
}

/**
 * Applies the Objective Master comparison contract without aggregate scoring.
 * Hard-gate failure is non-compensable. Quality is classified only when the
 * complete primary KPI surface and an explicit versioned tolerance policy are
 * available. No A2-specific tolerance is embedded here.
 */
export function comparePlanningQuality(input: PlanningComparisonInput): PlanningComparisonResult {
  if (input.optiPlanHardGates === "FAIL") {
    return deepFreeze({
      contractVersion: A2_PLANNING_COMPARISON_CONTRACT_VERSION,
      status: "CLASSIFIED" as const,
      classification: "INVALID" as const,
      tolerancePolicyVersion: input.tolerancePolicy?.version ?? null,
      signalEvidence: [] as const,
      betterSignalIds: [] as const,
      worseSignalIds: [] as const,
      equivalentSignalIds: [] as const,
      mayClaimBetterThanHuman: false as const,
      explanation: "OptiPlan fails a non-compensable hard gate; quality victory/defeat is not calculated.",
    });
  }

  const configurationIssues = validateConfiguration(input);
  if (configurationIssues.length > 0) {
    return blocked(
      configurationIssues,
      "Comparison is blocked until hard-gate assessment, every required primary KPI signal and every explicit versioned tolerance are available.",
    );
  }

  const policy = input.tolerancePolicy!;
  const signalEvidence = [...input.signals]
    .sort((left, right) => left.kpiId.localeCompare(right.kpiId, "en") || left.id.localeCompare(right.id, "en"))
    .map((signal) => classifySignal(signal, policy.toleranceBySignalId[signal.id]!));
  const betterSignalIds = signalEvidence.filter(({ relation }) => relation === "BETTER").map(({ id }) => id);
  const worseSignalIds = signalEvidence.filter(({ relation }) => relation === "WORSE").map(({ id }) => id);
  const equivalentSignalIds = signalEvidence.filter(({ relation }) => relation === "EQUIVALENT").map(({ id }) => id);

  let classification: Exclude<ComparisonClassification, "INVALID">;
  if (worseSignalIds.length > 0 && betterSignalIds.length > 0) classification = "TRADEOFF";
  else if (worseSignalIds.length > 0) classification = "WORSE";
  else if (betterSignalIds.length > 0) classification = "PARETO_BETTER";
  else classification = "PARITY";

  const explanation = classification === "PARETO_BETTER"
    ? "No primary signal is worse beyond tolerance and at least one is materially better beyond tolerance."
    : classification === "PARITY"
      ? "All primary signals remain inside their explicit equivalence bands."
      : classification === "TRADEOFF"
        ? "At least one primary signal improves beyond tolerance and at least one worsens beyond tolerance; no victory claim is allowed."
        : "At least one primary signal worsens beyond tolerance and none improves beyond tolerance.";

  return deepFreeze({
    contractVersion: A2_PLANNING_COMPARISON_CONTRACT_VERSION,
    status: "CLASSIFIED" as const,
    classification,
    tolerancePolicyVersion: policy.version,
    signalEvidence,
    betterSignalIds,
    worseSignalIds,
    equivalentSignalIds,
    mayClaimBetterThanHuman: classification === "PARETO_BETTER",
    explanation,
  });
}
