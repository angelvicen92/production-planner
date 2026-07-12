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


export function resolveBaselineRepairCandidateForSimulation(args: {
  simulatedState: SimulatedState | null | undefined;
  candidateState: CandidateState | null | undefined;
  rawCandidates: readonly Candidate[];
  partialPlans?: readonly PartialPlan[];
  decisionCandidates?: readonly Candidate[];
}): BaselineRepairCandidateLineageResolution {
  const rawById = new Map(args.rawCandidates.map((c) => [c.id, c]));
  const candidateId = args.candidateState?.candidateId ?? null;
  if (candidateId == null || candidateId.length === 0) return empty(candidateId, "missing_candidate_state");
  const direct = rawById.get(candidateId);
  if (direct) return { rawCandidate: direct, rawCandidateId: direct.id, partialPlanId: null, partialPlanCandidateIds: [direct.id], candidateStateCandidateId: candidateId, syntheticDecisionCandidateId: null, expectedSyntheticCandidateId: null, candidateStateMatchesPartialPlan: false, rawCandidateContainedInPartialPlan: true, resolutionKind: "direct_candidate", lineageConsistent: true, ambiguityReason: null, readOnly: true };

  const planById = new Map((args.partialPlans ?? []).map((p) => [p.partialPlanId, p]));
  const decisionCandidate = (args.decisionCandidates ?? []).find((c) => c.id === candidateId) ?? null;
  const syntheticDecisionCandidateId = decisionCandidate?.id ?? null;
  const metaPartialPlanId = typeof decisionCandidate?.metadata?.partialPlanId === "string" && decisionCandidate.metadata.partialPlanId.length > 0 ? decisionCandidate.metadata.partialPlanId : null;

  let partialPlan: PartialPlan | null = null;
  if (metaPartialPlanId != null) {
    partialPlan = planById.get(metaPartialPlanId) ?? null;
    const expectedFromMetadata = `candidate:${metaPartialPlanId}`;
    if (!partialPlan) return empty(candidateId, "partial_plan_not_found", { partialPlanId: metaPartialPlanId, syntheticDecisionCandidateId, expectedSyntheticCandidateId: expectedFromMetadata });
  } else if (candidateId.startsWith("candidate:")) {
    const possiblePartialPlanId = candidateId.slice("candidate:".length);
    partialPlan = planById.get(possiblePartialPlanId) ?? null;
    if (!partialPlan) return empty(candidateId, "partial_plan_not_found", { partialPlanId: possiblePartialPlanId, syntheticDecisionCandidateId, expectedSyntheticCandidateId: `candidate:${possiblePartialPlanId}` });
  } else {
    return empty(candidateId, "partial_plan_not_found", { syntheticDecisionCandidateId });
  }

  const expectedSyntheticCandidateId = `candidate:${partialPlan.partialPlanId}`;
  const candidateStateMatchesPartialPlan = candidateId === expectedSyntheticCandidateId && (decisionCandidate == null || syntheticDecisionCandidateId === expectedSyntheticCandidateId);
  if (!candidateStateMatchesPartialPlan) return empty(candidateId, "candidate_state_partial_plan_mismatch", { partialPlanId: partialPlan.partialPlanId, partialPlanCandidateIds: [...partialPlan.candidateIds].sort(), syntheticDecisionCandidateId, expectedSyntheticCandidateId });

  const rawIds = partialPlan.candidateIds.filter((id) => rawById.has(id)).sort();
  if (rawIds.length !== 1) return empty(candidateId, rawIds.length === 0 ? "no_baseline_repair_candidate_in_partial_plan" : "ambiguous_baseline_repair_partial_plan", { partialPlanId: partialPlan.partialPlanId, partialPlanCandidateIds: rawIds, syntheticDecisionCandidateId, expectedSyntheticCandidateId, candidateStateMatchesPartialPlan });
  const raw = rawById.get(rawIds[0]) ?? null;
  const rawCandidateContainedInPartialPlan = raw != null && partialPlan.candidateIds.includes(raw.id);
  if (!rawCandidateContainedInPartialPlan) return empty(candidateId, "raw_candidate_not_contained_in_partial_plan", { partialPlanId: partialPlan.partialPlanId, partialPlanCandidateIds: rawIds, syntheticDecisionCandidateId, expectedSyntheticCandidateId, candidateStateMatchesPartialPlan });
  return { rawCandidate: raw, rawCandidateId: raw.id, partialPlanId: partialPlan.partialPlanId, partialPlanCandidateIds: rawIds, candidateStateCandidateId: candidateId, syntheticDecisionCandidateId, expectedSyntheticCandidateId, candidateStateMatchesPartialPlan: true, rawCandidateContainedInPartialPlan: true, resolutionKind: "single_candidate_partial_plan", lineageConsistent: true, ambiguityReason: null, readOnly: true };
}
