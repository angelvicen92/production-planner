import type { CognitiveState, Evidence, OperationalState, Opportunity, ReasoningBudgetProfile } from "../contracts";
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
  readonly opportunityPropagation: readonly import("../contracts").OpportunityPropagation[];
  readonly cognitiveState: CognitiveState | null;
  readonly evidence: readonly Evidence[];
  readonly informationalOnly: true;
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
  const budgetEvidence = buildCriticalityDrivenReasoningBudgetEvidence(state, reasoningBudgetProfiles, createdAt);
  return deepFreeze({
    operationalCriticality: result.operationalCriticality,
    reasoningBudgetProfiles,
    opportunityPropagation: propagation.opportunityPropagation,
    cognitiveState: propagation.cognitiveState,
    evidence: [...result.evidence, ...budgetEvidence, ...propagation.evidence],
    informationalOnly: true,
  }) as SearchAndExplorationUnderstanding;
}
