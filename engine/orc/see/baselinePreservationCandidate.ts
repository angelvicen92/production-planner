import type { Candidate, Evidence, OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";

export const BASELINE_PRESERVATION_STRATEGY = "PRESERVE_BASELINE";
export const BASELINE_PRESERVATION_REASON = "No improvement candidates were generated; preserve and validate the current baseline through the ORC pipeline.";
export const BASELINE_SAFETY_REASON = "Baseline safety candidate generated alongside improvement candidates so ORC can preserve a valid V4 seed if no improvement candidate is accepted.";

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
  options: { readonly safetyCandidate?: boolean; readonly searchSpaceCount?: number } = {},
): BaselinePreservationCandidateResult | null {
  const planning = operationalState?.planning ?? [];
  const plannedTaskCount = planning.filter((entry) => Number.isFinite(entry.taskId) && Boolean(entry.startPlanned) && Boolean(entry.endPlanned)).length;
  if (!operationalState || plannedTaskCount === 0) return null;

  const isSafetyCandidate = options.safetyCandidate === true;
  const reason = isSafetyCandidate ? BASELINE_SAFETY_REASON : BASELINE_PRESERVATION_REASON;
  const candidateId = isSafetyCandidate ? `orc-see:baseline-preservation-safety:${operationalState.id}` : `orc-see:baseline-preservation:${operationalState.id}`;
  const evidenceId = isSafetyCandidate ? `evidence:orc-see:baseline-safety-candidate:${operationalState.id}` : `evidence:orc-see:baseline-preservation-candidate:${operationalState.id}`;
  const metadata = {
    baselinePreservation: true,
    planningInfluence: "none",
    readOnly: true,
    abstract: false,
    executesTransformations: false,
    strategy: BASELINE_PRESERVATION_STRATEGY,
    strategyFamily: "baseline-preservation",
    ...(isSafetyCandidate ? { baselineSafetyCandidate: true, shouldComposeWithOtherCandidates: false } : {}),
    generationReason: reason,
    operationalStateId: operationalState.id,
    plannedTaskCount,
  };

  const candidate: Candidate = deepFreeze({
    id: candidateId,
    state: { status: "valid", reason, evidenceIds: [evidenceId], metadata: { ...metadata } },
    assignments: [],
    operationalValues: [],
    evidenceIds: [evidenceId],
    metadata,
  }) as Candidate;

  const evidence: Evidence = deepFreeze({
    id: evidenceId,
    source: "orc-see",
    kind: isSafetyCandidate ? "baseline-safety-candidate-generated" : "baseline-preservation-candidate-generated",
    subjectId: candidateId,
    createdAt,
    data: {
      candidateId,
      operationalStateId: operationalState.id,
      plannedTaskCount,
      planningCount: plannedTaskCount,
      searchSpaceCount: options.searchSpaceCount ?? 0,
      reason,
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
      ...(isSafetyCandidate ? { baselineSafetyCandidate: true, shouldComposeWithOtherCandidates: false } : {}),
      generationReason: reason,
      readOnly: true,
      mutatesOperationalState: false,
      commitsPlanning: false,
      planningInfluence: "none",
    },
  }) as BaselinePreservationCandidateResult;
}
