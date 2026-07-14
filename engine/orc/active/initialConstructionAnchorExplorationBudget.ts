import type { ReasoningBudgetProfile } from "../contracts";
import { deepFreeze } from "../immutability";

export interface InitialConstructionAnchorExplorationBudget {
  initialTemporalCandidateBatchSize: number;
  maxTemporalCandidatesPerAnchor: number;
  maxBranchEvaluationsPerAnchor: number;
  maxResourceAlternativesPerTemporalCandidate: number;
  readOnly: true;
}

export const DEFAULT_INITIAL_CONSTRUCTION_ANCHOR_EXPLORATION_BUDGET: InitialConstructionAnchorExplorationBudget = deepFreeze({
  initialTemporalCandidateBatchSize: 8,
  maxTemporalCandidatesPerAnchor: 24,
  maxBranchEvaluationsPerAnchor: 48,
  maxResourceAlternativesPerTemporalCandidate: 8,
  readOnly: true,
}) as InitialConstructionAnchorExplorationBudget;

const positive = (value: unknown, fallback: number): number => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;

export function resolveInitialConstructionAnchorExplorationBudget(args?: { reasoningBudget?: ReasoningBudgetProfile | null; maxBranches?: number | null; maxResourceAlternativesPerTemporalCandidate?: number | null }): InitialConstructionAnchorExplorationBudget {
  const defaults = DEFAULT_INITIAL_CONSTRUCTION_ANCHOR_EXPLORATION_BUDGET;
  const existingLimit = positive(args?.maxBranches ?? args?.reasoningBudget?.maxCandidates, defaults.maxResourceAlternativesPerTemporalCandidate);
  const budget = {
    initialTemporalCandidateBatchSize: positive((args?.reasoningBudget as any)?.initialTemporalCandidateBatchSize, defaults.initialTemporalCandidateBatchSize),
    maxTemporalCandidatesPerAnchor: positive((args?.reasoningBudget as any)?.maxTemporalCandidatesPerAnchor, defaults.maxTemporalCandidatesPerAnchor),
    maxBranchEvaluationsPerAnchor: positive(args?.maxBranches ?? (args?.reasoningBudget as any)?.maxBranchEvaluationsPerAnchor, defaults.maxBranchEvaluationsPerAnchor),
    maxResourceAlternativesPerTemporalCandidate: positive(args?.maxResourceAlternativesPerTemporalCandidate ?? existingLimit, defaults.maxResourceAlternativesPerTemporalCandidate),
    readOnly: true as const,
  };
  budget.maxTemporalCandidatesPerAnchor = Math.max(budget.initialTemporalCandidateBatchSize, budget.maxTemporalCandidatesPerAnchor);
  return deepFreeze(budget) as InitialConstructionAnchorExplorationBudget;
}
