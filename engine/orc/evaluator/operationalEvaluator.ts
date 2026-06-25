import type { Evidence, OperationalValue, SimulatedState, ValidationResult } from "../contracts";
import { deepFreeze } from "../immutability";

export interface OperationalEvaluatorOptions {
  createdAt?: string | null;
}

export interface OperationalEvaluatorResult {
  operationalValues: OperationalValue[];
  evidence: Evidence[];
  summary: {
    evaluatedCount: number;
    skippedInvalid: number;
  };
}

const EVALUATOR_SOURCE = "orc-operational-evaluator";
const BASELINE_SCORE = 0;

function validationBySimulatedStateId(validationResults: ValidationResult[]): Map<string, ValidationResult> {
  const byId = new Map<string, ValidationResult>();
  for (const validationResult of validationResults ?? []) {
    if (!byId.has(validationResult.simulatedStateId)) byId.set(validationResult.simulatedStateId, validationResult);
  }
  return byId;
}

function buildOperationalValue(simulatedState: SimulatedState, validationResult: ValidationResult, evidenceId: string, evaluatedAt: string | null): OperationalValue {
  return deepFreeze({
    simulatedStateId: simulatedState.id,
    continuity: BASELINE_SCORE,
    makespan: BASELINE_SCORE,
    permanence: BASELINE_SCORE,
    compaction: BASELINE_SCORE,
    resourcePressure: BASELINE_SCORE,
    robustness: BASELINE_SCORE,
    stability: BASELINE_SCORE,
    futureFreedom: BASELINE_SCORE,
    overallScore: BASELINE_SCORE,
    evaluatedAt,
    evidenceIds: [evidenceId],
    metadata: {
      evaluationMode: "STRUCTURAL_BASELINE",
      validationResultId: validationResult.id,
      validationResult: validationResult.result,
      generatesCandidates: false,
      detectsOpportunities: false,
      mutatesOperationalState: false,
      commitsPlanning: false,
    },
  }) as OperationalValue;
}

export function evaluateSimulatedStates(
  simulatedStates: SimulatedState[],
  validationResults: ValidationResult[],
  options: OperationalEvaluatorOptions = {},
): OperationalEvaluatorResult {
  const evaluatedAt = options.createdAt ?? null;
  const bySimulatedStateId = validationBySimulatedStateId(validationResults);
  const operationalValues: OperationalValue[] = [];
  const evidence: Evidence[] = [];
  let skippedInvalid = 0;

  for (const simulatedState of simulatedStates ?? []) {
    const validationResult = bySimulatedStateId.get(simulatedState.id);
    if (validationResult?.result !== "VALID") {
      skippedInvalid += 1;
      continue;
    }

    const evidenceId = `evidence:orc-operational-evaluator:simulated-state:${simulatedState.id}`;
    const operationalValue = buildOperationalValue(simulatedState, validationResult, evidenceId, evaluatedAt);
    operationalValues.push(operationalValue);
    evidence.push(deepFreeze({
      id: evidenceId,
      source: EVALUATOR_SOURCE,
      kind: "simulated-state-operational-value-evaluated",
      subjectId: simulatedState.id,
      createdAt: evaluatedAt,
      data: {
        simulatedStateId: simulatedState.id,
        validationResultId: validationResult.id,
        validationResult: validationResult.result,
        operationalValue,
        evaluationMode: "STRUCTURAL_BASELINE",
        readOnly: true,
        generatesCandidates: false,
        detectsOpportunities: false,
        mutatesOperationalState: false,
        commitsPlanning: false,
      },
    }) as Evidence);
  }

  return deepFreeze({
    operationalValues,
    evidence,
    summary: {
      evaluatedCount: operationalValues.length,
      skippedInvalid,
    },
  }) as OperationalEvaluatorResult;
}
