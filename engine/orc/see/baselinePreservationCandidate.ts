import type { Candidate, Evidence, OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";

export const BASELINE_PRESERVATION_STRATEGY = "PRESERVE_BASELINE";
export const BASELINE_PRESERVATION_REASON = "No improvement candidates were generated; preserve and validate the current baseline through the ORC pipeline.";

export interface BaselinePreservationCandidateResult {
  candidate: Candidate;
  evidence: Evidence;
  summary: {
    plannedTaskCount: number;
    generationReason: string;
    readOnly: true;
    mutatesOperationalState: false;
    commitsPlanning: false;
    planningInfluence: "none";
  };
}

export function buildBaselinePreservationCandidate(
  operationalState: OperationalState | null | undefined,
  createdAt: string | null = null,
): BaselinePreservationCandidateResult | null {
  const planning = operationalState?.planning ?? [];
  const plannedTaskCount = planning.filter((entry) => Number.isFinite(entry.taskId) && Boolean(entry.startPlanned) && Boolean(entry.endPlanned)).length;
  if (!operationalState || plannedTaskCount === 0) return null;

  const candidateId = `orc-see:baseline-preservation:${operationalState.id}`;
  const evidenceId = `evidence:orc-see:baseline-preservation-candidate:${operationalState.id}`;
  const metadata = {
    baselinePreservation: true,
    planningInfluence: "none",
    readOnly: true,
    abstract: false,
    executesTransformations: false,
    strategy: BASELINE_PRESERVATION_STRATEGY,
    strategyFamily: "baseline-preservation",
    generationReason: BASELINE_PRESERVATION_REASON,
    operationalStateId: operationalState.id,
    plannedTaskCount,
  };

  const candidate: Candidate = deepFreeze({
    id: candidateId,
    state: { status: "valid", reason: BASELINE_PRESERVATION_REASON, evidenceIds: [evidenceId], metadata: { ...metadata } },
    assignments: [],
    operationalValues: [],
    evidenceIds: [evidenceId],
    metadata,
  }) as Candidate;

  const evidence: Evidence = deepFreeze({
    id: evidenceId,
    source: "orc-see",
    kind: "baseline-preservation-candidate-generated",
    subjectId: candidateId,
    createdAt,
    data: {
      operationalStateId: operationalState.id,
      plannedTaskCount,
      reason: BASELINE_PRESERVATION_REASON,
      readOnly: true,
      mutatesOperationalState: false,
      commitsPlanning: false,
      planningInfluence: "none",
    },
  }) as Evidence;

  return deepFreeze({
    candidate,
    evidence,
    summary: {
      plannedTaskCount,
      generationReason: BASELINE_PRESERVATION_REASON,
      readOnly: true,
      mutatesOperationalState: false,
      commitsPlanning: false,
      planningInfluence: "none",
    },
  }) as BaselinePreservationCandidateResult;
}
