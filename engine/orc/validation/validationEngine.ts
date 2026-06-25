import type { Evidence, SimulatedState, ValidationResult } from "../contracts";
import { deepFreeze } from "../immutability";

export interface ValidationEngineOptions {
  createdAt?: string | null;
}

export interface ValidationEngineResult {
  validationResults: ValidationResult[];
  evidence: Evidence[];
  summary: {
    simulatedStateCount: number;
    validCount: number;
    invalidCount: number;
  };
}

const VALIDATION_SOURCE = "orc-validation";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validateStructure(simulatedState: SimulatedState): string[] {
  const violations: string[] = [];

  if (!isNonEmptyString(simulatedState?.id)) violations.push("MISSING_SIMULATED_STATE_ID");
  if (!isNonEmptyString(simulatedState?.candidateStateId)) violations.push("MISSING_CANDIDATE_STATE_ID");
  if (!isNonEmptyString(simulatedState?.baseStateId)) violations.push("MISSING_BASE_STATE_ID");
  if (simulatedState?.operationalStateSnapshot == null) violations.push("MISSING_OPERATIONAL_STATE_SNAPSHOT");
  if (simulatedState?.operationalStateSnapshot != null && !Object.isFrozen(simulatedState.operationalStateSnapshot)) violations.push("MUTABLE_OPERATIONAL_STATE_SNAPSHOT");
  if (!Array.isArray(simulatedState?.appliedTransformations)) violations.push("INVALID_APPLIED_TRANSFORMATIONS");
  if (simulatedState?.simulationMode !== "READ_ONLY_BASELINE") violations.push("INVALID_SIMULATION_MODE");
  if (simulatedState?.readOnly !== true) violations.push("SIMULATED_STATE_NOT_READ_ONLY");

  const snapshot = simulatedState?.operationalStateSnapshot;
  if (snapshot != null) {
    if (!isNonEmptyString(snapshot.id)) violations.push("MISSING_SNAPSHOT_ID");
    if (snapshot.id !== simulatedState.baseStateId) violations.push("SNAPSHOT_ID_BASE_STATE_MISMATCH");
    if (snapshot.schemaVersion !== "ORC-SPEC-01") violations.push("INVALID_SNAPSHOT_SCHEMA_VERSION");
    if (!Array.isArray(snapshot.planning)) violations.push("INVALID_SNAPSHOT_PLANNING");
    if (!Array.isArray(snapshot.tasks)) violations.push("INVALID_SNAPSHOT_TASKS");
    if (!Array.isArray(snapshot.resources)) violations.push("INVALID_SNAPSHOT_RESOURCES");
    if (snapshot.cognitive == null) violations.push("MISSING_SNAPSHOT_COGNITIVE_STATE");
  }

  return violations;
}

function buildExplanation(violatedConstraints: string[]): string {
  if (violatedConstraints.length === 0) return "SimulatedState passed baseline structural validation.";
  return `SimulatedState failed baseline structural validation: ${violatedConstraints.join(", ")}.`;
}

export function validateSimulatedStates(
  simulatedStates: SimulatedState[],
  options: ValidationEngineOptions = {},
): ValidationEngineResult {
  const validatedAt = options.createdAt ?? null;
  const validationResults: ValidationResult[] = [];
  const evidence: Evidence[] = [];

  for (const simulatedState of simulatedStates ?? []) {
    const violatedConstraints = validateStructure(simulatedState);
    const result = violatedConstraints.length === 0 ? "VALID" : "INVALID";
    const simulatedStateId = isNonEmptyString(simulatedState?.id) ? simulatedState.id : "unknown";
    const explanation = buildExplanation(violatedConstraints);
    const evidenceId = `evidence:orc-validation:simulated-state:${simulatedStateId}`;

    validationResults.push(deepFreeze({
      id: `orc-validation:result:${simulatedStateId}`,
      simulatedStateId,
      result,
      violatedConstraints,
      explanation,
      validatedAt,
      evidenceIds: [evidenceId],
    }) as ValidationResult);

    evidence.push(deepFreeze({
      id: evidenceId,
      source: VALIDATION_SOURCE,
      kind: "simulated-state-validated",
      subjectId: simulatedStateId,
      createdAt: validatedAt,
      data: {
        simulatedStateId,
        result,
        violatedConstraints,
        explanation,
        validationScope: "structural-baseline",
        evaluatesCandidate: false,
        mutatesOperationalState: false,
        commitsPlanning: false,
      },
    }) as Evidence);
  }

  const validCount = validationResults.filter((validationResult) => validationResult.result === "VALID").length;
  const invalidCount = validationResults.length - validCount;

  return deepFreeze({
    validationResults,
    evidence,
    summary: {
      simulatedStateCount: (simulatedStates ?? []).length,
      validCount,
      invalidCount,
    },
  }) as ValidationEngineResult;
}
