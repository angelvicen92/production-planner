import type { Candidate, CandidateState, Evidence, OperationalState, PlannedTransformation, PlannedTransformationKind } from "../contracts";
import { deepFreeze } from "../immutability";

export interface TransformationEngineOptions {
  maxTransformations?: number;
  createdAt?: string | null;
}

export interface TransformationEngineResult {
  candidateStates: CandidateState[];
  evidence: Evidence[];
  summary: {
    candidateCount: number;
    transformedCount: number;
    truncatedByBudget: boolean;
  };
}

const DEFAULT_MAX_TRANSFORMATIONS = 20;

const KIND_BY_STRATEGY: Record<string, PlannedTransformationKind> = {
  CLOSE_MAIN_FLOW_GAP: "MOVE_CHAIN",
  REORDER_LOCAL_SEQUENCE: "REORDER_REGION",
  REDUCE_RESOURCE_PRESSURE: "REASSIGN_RESOURCE",
  COMPACT_REGION: "COMPACT_REGION",
  REDUCE_LOCK_PRESSURE: "REORDER_REGION",
  SCHEDULE_PENDING_TASKS: "SCHEDULE_PENDING",
  REDUCE_TALENT_STAY: "COMPACT_REGION",
};

function normalizeBudget(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_TRANSFORMATIONS;
  return Math.max(0, Math.floor(value));
}

function metadataString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function metadataNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function plannedTransformationsFor(candidate: Candidate): PlannedTransformation[] {
  if (candidate.metadata.baselinePreservation === true || candidate.metadata.executesTransformations === false && candidate.metadata.strategy === "PRESERVE_BASELINE") return [];
  const strategy = metadataString(candidate.metadata.strategy, "UNKNOWN_STRATEGY");
  const kind = KIND_BY_STRATEGY[strategy] ?? "REORDER_REGION";
  return [{ kind, reason: `Abstract read-only intent for ${strategy}` }];
}

export function buildCandidateStates(
  state: OperationalState,
  candidates: Candidate[],
  options: TransformationEngineOptions = {},
): TransformationEngineResult {
  void state;
  const maxTransformations = normalizeBudget(options.maxTransformations);
  const createdAt = options.createdAt ?? null;
  const candidateStates: CandidateState[] = [];
  const evidence: Evidence[] = [];
  let truncatedByBudget = false;

  for (const candidate of candidates ?? []) {
    if (candidateStates.length >= maxTransformations) {
      truncatedByBudget = true;
      evidence.push({
        id: `evidence:orc-transformation:budget:${candidate.id}`,
        source: "orc-transformation",
        kind: "candidate-state-budget-truncated",
        subjectId: candidate.id,
        createdAt,
        data: { candidateId: candidate.id, maxTransformations, readOnly: true },
      });
      break;
    }

    const strategy = metadataString(candidate.metadata.strategy, "UNKNOWN_STRATEGY");
    const originOpportunity = typeof candidate.metadata.sourceOpportunityId === "string" ? candidate.metadata.sourceOpportunityId : null;
    const plannedTransformations = plannedTransformationsFor(candidate);
    const estimatedImpact = candidate.metadata.expectedImpact ?? null;
    const estimatedCost = candidate.metadata.estimatedCost ?? null;
    const confidence = metadataNumber(candidate.metadata.confidence, 0);
    const candidateStateId = `orc-transformation:candidate-state:${candidate.id}`;
    const evidenceId = `evidence:orc-transformation:candidate-state:${candidate.id}`;
    const candidateState: CandidateState = deepFreeze({
      id: candidateStateId,
      candidateId: candidate.id,
      strategy,
      originOpportunity,
      plannedTransformations,
      estimatedImpact,
      estimatedCost,
      confidence,
      sourceAssignments: candidate.assignments.map((assignment) => ({ ...assignment, resourceIds: [...assignment.resourceIds] })),
    }) as CandidateState;
    candidateStates.push(candidateState);
    evidence.push({
      id: evidenceId,
      source: "orc-transformation",
      kind: "candidate-state-generated",
      subjectId: candidateStateId,
      createdAt,
      data: {
        candidateId: candidate.id,
        candidateStateId,
        strategy,
        originOpportunity,
        plannedTransformations: plannedTransformations.map((transformation) => transformation.kind),
        estimatedImpact,
        estimatedCost,
        confidence,
        sourceAssignmentCount: candidate.assignments.length,
        sourceAssignments: candidate.assignments.map((assignment) => ({ ...assignment, resourceIds: [...assignment.resourceIds] })),
        readOnly: true,
        executesTransformations: plannedTransformations.length > 0 && (candidate.assignments?.length ?? 0) > 0,
      },
    });
  }

  return deepFreeze({
    candidateStates,
    evidence,
    summary: { candidateCount: (candidates ?? []).length, transformedCount: candidateStates.length, truncatedByBudget },
  }) as TransformationEngineResult;
}
