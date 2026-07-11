import type { Candidate, CandidateState, PartialPlan, SimulatedState } from "../contracts";

export type BaselineRepairCandidateLineageResolutionKind = "direct_candidate" | "single_candidate_partial_plan" | "unresolved";

export interface BaselineRepairCandidateLineageResolution {
  rawCandidate: Candidate | null;
  rawCandidateId: string | null;
  partialPlanId: string | null;
  partialPlanCandidateIds: string[];
  candidateStateCandidateId: string | null;
  syntheticDecisionCandidateId: string | null;
  expectedSyntheticCandidateId: string | null;
  candidateStateMatchesPartialPlan: boolean;
  rawCandidateContainedInPartialPlan: boolean;
  resolutionKind: BaselineRepairCandidateLineageResolutionKind;
  lineageConsistent: boolean;
  ambiguityReason: string | null;
  readOnly: true;
}

const empty = (candidateStateCandidateId: string | null, ambiguityReason: string | null, extra: Partial<BaselineRepairCandidateLineageResolution> = {}): BaselineRepairCandidateLineageResolution => ({ rawCandidate: null, rawCandidateId: null, partialPlanId: null, partialPlanCandidateIds: [], candidateStateCandidateId, syntheticDecisionCandidateId: null, expectedSyntheticCandidateId: null, candidateStateMatchesPartialPlan: false, rawCandidateContainedInPartialPlan: false, resolutionKind: "unresolved", lineageConsistent: false, ambiguityReason, readOnly: true, ...extra });

const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];

export function resolveBaselineRepairCandidateForSimulation(args: {
  simulatedState: SimulatedState | null | undefined;
  candidateState: CandidateState | null | undefined;
  rawCandidates: readonly Candidate[];
  partialPlans?: readonly PartialPlan[];
  decisionCandidates?: readonly Candidate[];
}): BaselineRepairCandidateLineageResolution {
  const rawById = new Map(args.rawCandidates.map((c) => [c.id, c]));
  const candidateId = args.candidateState?.candidateId ?? null;
  if (candidateId == null) return empty(null, "missing_candidate_state");
  const direct = rawById.get(candidateId);
  if (direct) return { rawCandidate: direct, rawCandidateId: direct.id, partialPlanId: null, partialPlanCandidateIds: [direct.id], candidateStateCandidateId: candidateId, syntheticDecisionCandidateId: null, expectedSyntheticCandidateId: null, candidateStateMatchesPartialPlan: false, rawCandidateContainedInPartialPlan: true, resolutionKind: "direct_candidate", lineageConsistent: true, ambiguityReason: null, readOnly: true };

  const decisionCandidate = (args.decisionCandidates ?? []).find((c) => c.id === candidateId) ?? null;
  const metaPartialPlanId = typeof decisionCandidate?.metadata?.partialPlanId === "string" ? decisionCandidate.metadata.partialPlanId : null;
  const planById = new Map((args.partialPlans ?? []).map((p) => [p.partialPlanId, p]));
  let partialPlan = metaPartialPlanId ? planById.get(metaPartialPlanId) ?? null : null;
  if (!partialPlan) {
    const metadataIds = strings(decisionCandidate?.metadata?.partialPlanCandidateIds);
    partialPlan = (args.partialPlans ?? []).find((p) => p.candidateIds.length === metadataIds.length && p.candidateIds.every((id) => metadataIds.includes(id))) ?? null;
  }
  const expectedSyntheticCandidateId = partialPlan ? `candidate:${partialPlan.partialPlanId}` : (metaPartialPlanId ? `candidate:${metaPartialPlanId}` : null);
  const syntheticDecisionCandidateId = decisionCandidate?.id ?? null;
  if (!partialPlan) return empty(candidateId, "partial_plan_not_found", { partialPlanId: metaPartialPlanId, syntheticDecisionCandidateId, expectedSyntheticCandidateId });
  const candidateStateMatchesPartialPlan = syntheticDecisionCandidateId === candidateId && expectedSyntheticCandidateId === candidateId;
  if (!candidateStateMatchesPartialPlan) return empty(candidateId, "candidate_state_partial_plan_mismatch", { partialPlanId: partialPlan.partialPlanId, partialPlanCandidateIds: [...partialPlan.candidateIds].sort(), syntheticDecisionCandidateId, expectedSyntheticCandidateId });
  const rawIds = partialPlan.candidateIds.filter((id) => rawById.has(id)).sort();
  if (rawIds.length !== 1) return empty(candidateId, rawIds.length === 0 ? "no_baseline_repair_candidate_in_partial_plan" : "ambiguous_baseline_repair_partial_plan", { partialPlanId: partialPlan.partialPlanId, partialPlanCandidateIds: rawIds, syntheticDecisionCandidateId, expectedSyntheticCandidateId, candidateStateMatchesPartialPlan });
  const raw = rawById.get(rawIds[0]) ?? null;
  return { rawCandidate: raw, rawCandidateId: raw?.id ?? null, partialPlanId: partialPlan.partialPlanId, partialPlanCandidateIds: rawIds, candidateStateCandidateId: candidateId, syntheticDecisionCandidateId, expectedSyntheticCandidateId, candidateStateMatchesPartialPlan, rawCandidateContainedInPartialPlan: raw != null, resolutionKind: raw ? "single_candidate_partial_plan" : "unresolved", lineageConsistent: raw != null, ambiguityReason: raw ? null : "raw_candidate_not_found", readOnly: true };
}
