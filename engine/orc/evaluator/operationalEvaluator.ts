import type { Evidence, OperationalValue, SimulatedState, ValidationResult } from "../contracts";
import { deepFreeze } from "../immutability";
import { calculateOverallScore, evaluateOperationalMetrics } from "./metrics";

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

function validationBySimulatedStateId(validationResults: ValidationResult[]): Map<string, ValidationResult> {
  const byId = new Map<string, ValidationResult>();
  for (const validationResult of validationResults ?? []) {
    if (!byId.has(validationResult.simulatedStateId)) byId.set(validationResult.simulatedStateId, validationResult);
  }
  return byId;
}

function buildOperationalValue(simulatedState: SimulatedState, validationResult: ValidationResult, evidenceId: string, evaluatedAt: string | null): OperationalValue {
  const metrics = evaluateOperationalMetrics(simulatedState);
  const overallScore = calculateOverallScore(metrics);
  const breakdown = Object.fromEntries(Object.entries(metrics).map(([dimension, evaluation]) => [dimension, {
    score: evaluation.score,
    explanation: evaluation.explanation,
    metrics: evaluation.metrics,
  }]));

  return deepFreeze({
    simulatedStateId: simulatedState.id,
    continuity: metrics.continuity.score,
    makespan: metrics.makespan.score,
    permanence: metrics.permanence.score,
    compaction: metrics.compaction.score,
    resourcePressure: metrics.resourcePressure.score,
    robustness: metrics.robustness.score,
    stability: metrics.stability.score,
    futureFreedom: metrics.futureFreedom.score,
    overallScore,
    breakdown,
    evaluatedAt,
    evidenceIds: [evidenceId],
    metadata: {
      evaluationMode: "OPERATIONAL_MULTI_CRITERIA_V1",
      validationResultId: validationResult.id,
      validationResult: validationResult.result,
      dimensionCount: Object.keys(metrics).length,
      scoreAggregation: "unweighted-arithmetic-mean",
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
        dimensions: operationalValue.breakdown,
        overallScore: operationalValue.overallScore,
        scoreAggregation: "unweighted-arithmetic-mean",
        evaluationMode: "OPERATIONAL_MULTI_CRITERIA_V1",
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
