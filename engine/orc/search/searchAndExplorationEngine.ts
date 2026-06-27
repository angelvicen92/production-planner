import type { AdaptiveSearchSpaceProfile, CognitiveState, Evidence, OperationalState, Opportunity, OpportunityPropagation, ReasoningBudgetProfile } from "../contracts";
import { createReasoningBudget, type ReasoningBudget } from "../cognitive/reasoningBudget";
import { deepFreeze } from "../immutability";
import { understandOpportunityPropagation } from "../understanding/opportunityPropagation";
import {
  buildCriticalityDrivenReasoningBudgetEvidence,
  buildReasoningBudgetProfiles,
  understandOperationalCriticality,
  type OperationalCriticality,
  type ReasoningBudgetProfileConfig,
} from "../understanding/operationalCriticality";

export interface SearchAndExplorationUnderstanding {
  readonly operationalCriticality: OperationalCriticality;
  readonly reasoningBudgetProfiles: readonly ReasoningBudgetProfile[];
  readonly opportunityPropagation: readonly OpportunityPropagation[];
  readonly adaptiveSearchSpaceProfiles: readonly AdaptiveSearchSpaceProfile[];
  readonly cognitiveState: CognitiveState | null;
  readonly evidence: readonly Evidence[];
  readonly informationalOnly: true;
}


const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

export function buildAdaptiveSearchSpaceProfiles(
  reasoningBudgetProfiles: readonly ReasoningBudgetProfile[],
  opportunityPropagation: readonly OpportunityPropagation[],
): readonly AdaptiveSearchSpaceProfile[] {
  const propagationByOpportunityId = new Map(opportunityPropagation.map((item) => [item.opportunityId, item]));
  return deepFreeze([...reasoningBudgetProfiles].sort((a, b) => a.opportunityId.localeCompare(b.opportunityId)).map((budgetProfile) => {
    const propagationScore = propagationByOpportunityId.get(budgetProfile.opportunityId)?.propagationScore ?? 0;
    const reasoningBudget = budgetProfile.explorationBudget;
    const expectedExplorationValue = round((budgetProfile.criticalityLevel * reasoningBudget) + propagationScore);
    const maxDepth = Math.max(1, budgetProfile.maxDepth + Math.floor(propagationScore * budgetProfile.criticalityLevel));
    const maxBreadth = Math.max(1, Math.min(budgetProfile.maxSearchSpaceSize + Math.ceil(propagationScore * reasoningBudget), reasoningBudget + budgetProfile.maxSearchSpaceSize));
    return {
      opportunityId: budgetProfile.opportunityId,
      criticalityLevel: budgetProfile.criticalityLevel,
      propagationScore,
      reasoningBudget,
      maxDepth,
      maxBreadth,
      expectedExplorationValue,
    };
  })) as readonly AdaptiveSearchSpaceProfile[];
}

export function buildAdaptiveSearchSpaceProfileEvidence(profiles: readonly AdaptiveSearchSpaceProfile[], createdAt: string | null = null): readonly Evidence[] {
  return profiles.map((profile) => deepFreeze({
    id: `evidence:orc-see:adaptive-search-space-profile:${profile.opportunityId}`,
    source: "orc-see",
    kind: "adaptive-search-space-profile",
    subjectId: profile.opportunityId,
    createdAt,
    data: { profile, reason: "Derived from OCM criticality, OPA propagation and criticality-driven reasoning budget.", deterministic: true, shadowModeOnly: true, readOnly: true },
  }) as Evidence);
}

export interface SearchAndExplorationBudgetOptions extends ReasoningBudgetProfileConfig {
  readonly opportunities?: readonly Opportunity[];
  readonly reasoningBudget?: ReasoningBudget;
}

export function buildSearchAndExplorationUnderstanding(
  state: OperationalState,
  cognitiveState?: CognitiveState | null,
  createdAt: string | null = null,
  options: SearchAndExplorationBudgetOptions = {},
): SearchAndExplorationUnderstanding {
  const result = understandOperationalCriticality(state, cognitiveState, createdAt);
  const propagation = understandOpportunityPropagation(state, options.opportunities ?? state.cognitive?.opportunities ?? [], result.cognitiveState, createdAt, result.operationalCriticality);
  const reasoningBudget = options.reasoningBudget ?? cognitiveState?.reasoningBudget ?? createReasoningBudget();
  const reasoningBudgetProfiles = buildReasoningBudgetProfiles(
    state,
    options.opportunities ?? state.cognitive?.opportunities ?? [],
    result.operationalCriticality,
    { ...options, reasoningBudget },
  );
  const adaptiveSearchSpaceProfiles = buildAdaptiveSearchSpaceProfiles(reasoningBudgetProfiles, propagation.opportunityPropagation);
  const budgetEvidence = buildCriticalityDrivenReasoningBudgetEvidence(state, reasoningBudgetProfiles, createdAt);
  const profileEvidence = buildAdaptiveSearchSpaceProfileEvidence(adaptiveSearchSpaceProfiles, createdAt);
  return deepFreeze({
    operationalCriticality: result.operationalCriticality,
    reasoningBudgetProfiles,
    opportunityPropagation: propagation.opportunityPropagation,
    adaptiveSearchSpaceProfiles,
    cognitiveState: propagation.cognitiveState,
    evidence: [...result.evidence, ...budgetEvidence, ...propagation.evidence, ...profileEvidence],
    informationalOnly: true,
  }) as SearchAndExplorationUnderstanding;
}
