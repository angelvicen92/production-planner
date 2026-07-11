import type { Candidate, CandidateState, PartialPlan, SimulatedState } from "../contracts";

export interface BaselineRepairCandidateLineageResolution {
  rawCandidate: Candidate | null;
  rawCandidateId: string | null;
  partialPlanId: string | null;
  partialPlanCandidateIds: string[];
  lineageConsistent: boolean;
  ambiguityReason: string | null;
  readOnly: true;
}

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
  if (candidateId == null) return { rawCandidate: null, rawCandidateId: null, partialPlanId: null, partialPlanCandidateIds: [], lineageConsistent: false, ambiguityReason: "missing_candidate_state", readOnly: true };
  const direct = rawById.get(candidateId);
  if (direct) return { rawCandidate: direct, rawCandidateId: direct.id, partialPlanId: null, partialPlanCandidateIds: [direct.id], lineageConsistent: true, ambiguityReason: null, readOnly: true };

  const decisionCandidate = (args.decisionCandidates ?? []).find((c) => c.id === candidateId) ?? null;
  const metaPartialPlanId = typeof decisionCandidate?.metadata?.partialPlanId === "string" ? decisionCandidate.metadata.partialPlanId : null;
  const planById = new Map((args.partialPlans ?? []).map((p) => [p.partialPlanId, p]));
  let partialPlan = metaPartialPlanId ? planById.get(metaPartialPlanId) ?? null : null;
  if (!partialPlan) {
    const metadataIds = strings(decisionCandidate?.metadata?.partialPlanCandidateIds);
    partialPlan = (args.partialPlans ?? []).find((p) => p.candidateIds.length === metadataIds.length && p.candidateIds.every((id) => metadataIds.includes(id))) ?? null;
  }
  if (!partialPlan && candidateId.startsWith("candidate:partial-plan:")) {
    const planId = candidateId.slice("candidate:".length);
    partialPlan = planById.get(planId) ?? null;
  }
  if (!partialPlan) return { rawCandidate: null, rawCandidateId: null, partialPlanId: metaPartialPlanId, partialPlanCandidateIds: [], lineageConsistent: false, ambiguityReason: "partial_plan_not_found", readOnly: true };
  const rawIds = partialPlan.candidateIds.filter((id) => rawById.has(id)).sort();
  if (rawIds.length !== 1) return { rawCandidate: null, rawCandidateId: null, partialPlanId: partialPlan.partialPlanId, partialPlanCandidateIds: rawIds, lineageConsistent: false, ambiguityReason: rawIds.length === 0 ? "no_baseline_repair_candidate_in_partial_plan" : "ambiguous_baseline_repair_partial_plan", readOnly: true };
  const raw = rawById.get(rawIds[0]) ?? null;
  return { rawCandidate: raw, rawCandidateId: raw?.id ?? null, partialPlanId: partialPlan.partialPlanId, partialPlanCandidateIds: rawIds, lineageConsistent: raw != null, ambiguityReason: raw ? null : "raw_candidate_not_found", readOnly: true };
}
