import type { ReasoningBudgetProfile } from "../contracts";

export function resolveInitialConstructionAnchorBranchLimit(reasoningBudget?: ReasoningBudgetProfile | null): number {
  const requested = Number(reasoningBudget?.maxCandidates ?? 6);
  const finite = Number.isFinite(requested) ? Math.floor(requested) : 6;
  return Math.max(2, Math.min(8, finite));
}
