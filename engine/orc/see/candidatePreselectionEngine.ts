import type { AdaptiveSearchSpaceProfile, Candidate, Evidence, OpportunityPropagation, ORCRecord, PartialPlan } from "../contracts";
import type { DiscardedPartialPlanComposition } from "./partialPlanComposer";
import { composePartialPlans } from "./partialPlanComposer";
import { deepFreeze } from "../immutability";
import { estimateOpportunityCosts, opportunityCostByCandidateId, type OpportunityCostEstimate } from "../search/opportunityCostEstimator";

export interface PreselectedCandidate {
  candidateId: string;
  preselectionScore: number;
  accepted: boolean;
  rejectionReason?: string;
}

export interface CandidatePreselectionResult {
  candidates: Candidate[];
  decisions: PreselectedCandidate[];
  evidence: Evidence[];
  partialPlans: ReadonlyArray<PartialPlan>;
  discardedPartialPlanCompositions: ReadonlyArray<DiscardedPartialPlanComposition>;
  summary: {
    generatedCandidates: number;
    acceptedCandidates: number;
    discardedCandidates: number;
    limit: number;
    partialPlans: {
      partialPlanCount: number;
      discardedCompositionCount: number;
      averageCompatibilityScore: number;
    };
  };
}

export interface CandidatePreselectionOptions {
  readonly maxCandidates?: number | null;
  readonly adaptiveSearchSpaceProfiles?: readonly AdaptiveSearchSpaceProfile[];
  readonly opportunityPropagation?: readonly OpportunityPropagation[];
  readonly createdAt?: string | null;
  readonly operationalState?: import("../contracts").OperationalState | null;
}

const DEFAULT_PRESELECTION_LIMIT = 12;
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const finite = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const stringValue = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const cloneCandidate = (candidate: Candidate): Candidate => ({
  ...candidate,
  evidenceIds: [...candidate.evidenceIds],
  state: { ...candidate.state, evidenceIds: [...candidate.state.evidenceIds], metadata: { ...candidate.state.metadata } },
  assignments: candidate.assignments.map((assignment) => ({ ...assignment, resourceIds: [...assignment.resourceIds] })),
  operationalValues: candidate.operationalValues.map((value) => ({ ...value, evidenceIds: [...value.evidenceIds], breakdown: { ...value.breakdown }, metadata: { ...value.metadata } })),
  metadata: { ...candidate.metadata },
});

function limitFrom(options: CandidatePreselectionOptions, candidateCount: number): number {
  if (candidateCount <= 1) return candidateCount;
  const explicit = finite(options.maxCandidates, DEFAULT_PRESELECTION_LIMIT);
  return Math.max(0, Math.min(candidateCount, Math.floor(explicit)));
}

function scoreCandidate(candidate: Candidate, profiles: ReadonlyMap<string, AdaptiveSearchSpaceProfile>, propagations: ReadonlyMap<string, OpportunityPropagation>, opportunityCost?: OpportunityCostEstimate): number {
  const opportunityId = stringValue(candidate.metadata.sourceOpportunityId) ?? stringValue(candidate.metadata.originOpportunity) ?? "";
  const profile = profiles.get(opportunityId);
  const propagation = propagations.get(opportunityId);
  const strategy = candidate.metadata.candidateStrategy as ORCRecord | undefined;
  const impact = finite(candidate.metadata.expectedOperationalImpact, finite(strategy?.expectedOperationalImpact, 0));
  const confidence = finite(candidate.metadata.confidence, 0);
  const executable = candidate.metadata.executesTransformations === true ? 1 : 0;
  const assignmentCoverage = candidate.assignments.length === 0 ? 0 : Math.min(1, candidate.assignments.length / Math.max(1, Array.isArray(candidate.metadata.taskIds) ? candidate.metadata.taskIds.length : candidate.assignments.length));
  const costPenalty = candidate.metadata.estimatedCost === "high" ? 0.3 : candidate.metadata.estimatedCost === "medium" ? 0.15 : 0;
  const score =
    finite(profile?.criticalityLevel) * 3 +
    finite(profile?.expectedExplorationValue) * 0.5 +
    finite(profile?.propagationScore) * 2 +
    finite(propagation?.estimatedConflictReduction) +
    finite(propagation?.estimatedFreedomGain) +
    impact +
    confidence +
    executable +
    assignmentCoverage -
    costPenalty -
    finite(opportunityCost?.estimatedCost) +
    finite(candidate.metadata.variantIndex) * 0.001;
  return round(score);
}

export function preselectCandidates(candidates: readonly Candidate[], options: CandidatePreselectionOptions = {}): CandidatePreselectionResult {
  const sourceCandidates = [...(candidates ?? [])];
  const limit = limitFrom(options, sourceCandidates.length);
  const profiles = new Map((options.adaptiveSearchSpaceProfiles ?? []).map((profile) => [profile.opportunityId, profile]));
  const propagations = new Map((options.opportunityPropagation ?? []).map((propagation) => [propagation.opportunityId, propagation]));
  const opportunityCostResult = estimateOpportunityCosts(sourceCandidates, options.operationalState ?? null, options.createdAt ?? null);
  const opportunityCosts = opportunityCostByCandidateId(opportunityCostResult.estimates);
  const ranked = sourceCandidates
    .map((candidate, index) => ({ candidate, index, opportunityCost: opportunityCosts.get(candidate.id), score: scoreCandidate(candidate, profiles, propagations, opportunityCosts.get(candidate.id)) }))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id) || a.index - b.index);
  const acceptedIds = new Set(ranked.slice(0, limit).map((item) => item.candidate.id));
  const rankByCandidateId = new Map(ranked.map((item, index) => [item.candidate.id, index + 1]));
  const scoreByCandidateId = new Map(ranked.map((item) => [item.candidate.id, item.score]));
  const decisions: PreselectedCandidate[] = ranked.map((item) => {
    const accepted = acceptedIds.has(item.candidate.id);
    return accepted
      ? { candidateId: item.candidate.id, preselectionScore: item.score, accepted }
      : { candidateId: item.candidate.id, preselectionScore: item.score, accepted, rejectionReason: "preselection-limit" };
  });
  const selected = sourceCandidates.filter((candidate) => acceptedIds.has(candidate.id)).map((sourceCandidate) => {
    const candidate = cloneCandidate(sourceCandidate);
    return {
      ...candidate,
      evidenceIds: [...candidate.evidenceIds, `evidence:orc-see:candidate-preselection:${candidate.id}`],
      state: { ...candidate.state, evidenceIds: [...candidate.state.evidenceIds, `evidence:orc-see:candidate-preselection:${candidate.id}`] },
      metadata: { ...candidate.metadata, opportunityCost: opportunityCosts.get(candidate.id) ?? null, preselection: { preselectionScore: scoreByCandidateId.get(candidate.id) ?? 0, position: rankByCandidateId.get(candidate.id) ?? null, accepted: true, deterministic: true, opportunityCost: opportunityCosts.get(candidate.id)?.estimatedCost ?? 0 } },
    };
  });
  const partialPlanResult = composePartialPlans(selected, { createdAt: options.createdAt ?? null });
  const evidence: Evidence[] = decisions.map((decision, index) => deepFreeze({
    id: `evidence:orc-see:candidate-preselection:${decision.candidateId}`,
    source: "orc-see",
    kind: "candidate-preselection",
    subjectId: decision.candidateId,
    createdAt: options.createdAt ?? null,
    data: {
      candidateId: decision.candidateId,
      preselectionScore: decision.preselectionScore,
      opportunityCost: opportunityCosts.get(decision.candidateId) ?? null,
      explorationInfluence: "opportunity-cost-subtracted-from-preselection-score",
      position: index + 1,
      accepted: decision.accepted,
      rejectionReason: decision.rejectionReason ?? null,
      limit,
      deterministic: true,
      readOnly: true,
    },
  }) as Evidence);
  evidence.push(deepFreeze({ id: "evidence:orc-see:candidate-preselection:summary", source: "orc-see", kind: "candidate-preselection-summary", subjectId: "orc-see:candidate-preselection", createdAt: options.createdAt ?? null, data: { generatedCandidates: sourceCandidates.length, acceptedCandidates: selected.length, discardedCandidates: sourceCandidates.length - selected.length, limit, decisions, opportunityCosts: opportunityCostResult.estimates, explorationInfluence: "lower opportunity cost improves deterministic exploration order during preselection", acceptedCandidateIds: selected.map((candidate) => candidate.id), discardedCandidateIds: decisions.filter((decision) => !decision.accepted).map((decision) => decision.candidateId), deterministic: true, readOnly: true } }) as Evidence);
  return deepFreeze({ candidates: selected, decisions, evidence: [...opportunityCostResult.evidence, ...evidence, ...partialPlanResult.evidence], partialPlans: partialPlanResult.partialPlans, discardedPartialPlanCompositions: partialPlanResult.discardedCompositions, summary: { generatedCandidates: sourceCandidates.length, acceptedCandidates: selected.length, discardedCandidates: sourceCandidates.length - selected.length, limit, partialPlans: { partialPlanCount: partialPlanResult.summary.partialPlanCount, discardedCompositionCount: partialPlanResult.summary.discardedCompositionCount, averageCompatibilityScore: partialPlanResult.summary.averageCompatibilityScore } } }) as CandidatePreselectionResult;
}
