import type { Candidate, CognitiveState, Opportunity, SearchSpace } from "../contracts";
import { shouldSkipCandidate, shouldSkipOpportunity, shouldSkipSearchSpace } from "./cognitiveFeedback";

export type CognitivePruningPhase = "opportunity-detection" | "search-space-builder" | "candidate-builder";
export type CognitivePruningReason = "repeated-opportunity" | "exhausted-search-space" | "discarded-candidate";

export interface CognitivePrunedItem {
  id: string;
  reason: CognitivePruningReason;
  phase: CognitivePruningPhase;
  estimatedBudgetSaved: number;
}

export interface CognitivePruningStats {
  generatedCount: number;
  keptCount: number;
  prunedCount: number;
  estimatedBudgetSaved: number;
  prunedItems: CognitivePrunedItem[];
}

export interface CognitivePruningResult<T> {
  items: T[];
  stats: CognitivePruningStats;
}

const emptyStats = (generatedCount: number): CognitivePruningStats => Object.freeze({
  generatedCount,
  keptCount: generatedCount,
  prunedCount: 0,
  estimatedBudgetSaved: 0,
  prunedItems: Object.freeze([]) as CognitivePrunedItem[],
});

function pruneKnownItems<T extends { id: string }>(
  state: CognitiveState,
  items: readonly T[] | undefined,
  shouldPrune: (state: CognitiveState, item: T) => boolean,
  phase: CognitivePruningPhase,
  reason: CognitivePruningReason,
): CognitivePruningResult<T> {
  const source = [...(items ?? [])];
  if (source.length === 0) return Object.freeze({ items: [], stats: emptyStats(0) });

  const kept: T[] = [];
  const prunedItems: CognitivePrunedItem[] = [];

  for (const item of source) {
    if (shouldPrune(state, item)) {
      prunedItems.push(Object.freeze({ id: item.id, reason, phase, estimatedBudgetSaved: 1 }));
      continue;
    }
    kept.push(item);
  }

  const stats: CognitivePruningStats = Object.freeze({
    generatedCount: source.length,
    keptCount: kept.length,
    prunedCount: prunedItems.length,
    estimatedBudgetSaved: prunedItems.reduce((total, item) => total + item.estimatedBudgetSaved, 0),
    prunedItems: Object.freeze([...prunedItems]),
  });

  return Object.freeze({ items: kept, stats });
}

export function pruneRepeatedOpportunities(state: CognitiveState, opportunities: readonly Opportunity[] | undefined): CognitivePruningResult<Opportunity> {
  return pruneKnownItems(state, opportunities, shouldSkipOpportunity, "opportunity-detection", "repeated-opportunity");
}

export function pruneExhaustedSearchSpaces(state: CognitiveState, searchSpaces: readonly SearchSpace[] | undefined): CognitivePruningResult<SearchSpace> {
  return pruneKnownItems(state, searchSpaces, shouldSkipSearchSpace, "search-space-builder", "exhausted-search-space");
}

export function pruneDiscardedCandidates(state: CognitiveState, candidates: readonly Candidate[] | undefined): CognitivePruningResult<Candidate> {
  return pruneKnownItems(state, candidates, shouldSkipCandidate, "candidate-builder", "discarded-candidate");
}
