import type { Evidence, ORCRecord, SearchSpace } from "../contracts";
import type { FutureConstraintPropagationAnalysis, FutureConstraintEffect } from "./futureConstraintPropagationEngine";
import type { SearchSpaceSelectionResult, SelectedSearchSpace } from "./searchSpaceSelectionEngine";

export interface OrderedSearchSpace {
  searchSpace: SearchSpace;
  explorationOrder: number;
  orderingScore: number;
  explanation: string;
}

export interface BranchOrderingResult {
  orderedSearchSpaces: OrderedSearchSpace[];
}

const finiteNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const round = (value: number): number => Number(value.toFixed(6));

const hasOperationalPriority = (searchSpace: SearchSpace): boolean =>
  searchSpace.metadata?.sourceOperationalPriority != null && typeof searchSpace.metadata.sourceOperationalPriority === "object";

const priorityScoreFor = (searchSpace: SearchSpace): number => {
  const metadataPriority = searchSpace.metadata?.sourceOperationalPriority;
  if (metadataPriority != null && typeof metadataPriority === "object") {
    return finiteNumber((metadataPriority as ORCRecord).priorityScore);
  }
  return finiteNumber(searchSpace.metadata?.sourceOpportunityPriority, finiteNumber(searchSpace.metadata?.priority));
};

const explorationValueFor = (searchSpace: SearchSpace): { expectedValue: number; confidence: number } => ({
  expectedValue: finiteNumber(searchSpace.explorationValue?.expectedValue),
  confidence: finiteNumber(searchSpace.explorationValue?.confidence),
});

const scoreFor = (searchSpace: SearchSpace, effect: FutureConstraintEffect | null): number => {
  const priorityScore = priorityScoreFor(searchSpace);
  if (hasOperationalPriority(searchSpace)) return round(1_000_000 + priorityScore);
  if (priorityScore > 0) return round(priorityScore);
  const explorationValue = explorationValueFor(searchSpace);
  const explorationSignal = clamp01(explorationValue.expectedValue) * clamp01(explorationValue.confidence);
  const propagationSignal = clamp01(effect?.propagationScore ?? 0);
  return round(explorationSignal * 0.8 + propagationSignal * 0.2);
};

const explanationFor = (searchSpace: SearchSpace, effect: FutureConstraintEffect | null, orderingScore: number): string => {
  const priorityScore = priorityScoreFor(searchSpace);
  const explorationValue = explorationValueFor(searchSpace);
  const propagationScore = effect?.propagationScore ?? 0;
  return `Branch ordering score ${orderingScore.toFixed(6)} from operationalPriority=${priorityScore}, explorationValue=${explorationValue.expectedValue}, explorationConfidence=${explorationValue.confidence}, futureConstraintPropagation=${propagationScore}. Stable ties preserve SearchSpace selection order.`;
};

const cloneOrderedSearchSpace = (item: SelectedSearchSpace): SearchSpace => ({
  ...item.searchSpace,
  taskIds: [...item.searchSpace.taskIds],
  candidates: [...item.searchSpace.candidates],
  evidenceIds: [...item.searchSpace.evidenceIds],
  metadata: { ...item.searchSpace.metadata },
});

export function orderSearchSpaces(
  selection: SearchSpaceSelectionResult,
  propagation: FutureConstraintPropagationAnalysis,
): BranchOrderingResult {
  const effectBySearchSpaceId = new Map((propagation?.effects ?? []).map((effect) => [effect.searchSpaceId, effect]));
  const scored = (selection?.selected ?? [])
    .filter((item) => item.selected)
    .map((item, index) => {
      const effect = item.futureConstraintEffect ?? effectBySearchSpaceId.get(item.searchSpace.id) ?? null;
      const orderingScore = scoreFor(item.searchSpace, effect);
      return { item, index, orderingScore, explanation: explanationFor(item.searchSpace, effect, orderingScore) };
    })
    .sort((a, b) => b.orderingScore - a.orderingScore || a.index - b.index);

  return {
    orderedSearchSpaces: scored.map((entry, index) => ({
      searchSpace: cloneOrderedSearchSpace(entry.item),
      explorationOrder: index + 1,
      orderingScore: entry.orderingScore,
      explanation: entry.explanation,
    })),
  };
}

export function buildBranchOrderingEvidence(result: BranchOrderingResult, createdAt: string | null = null): Evidence[] {
  return (result?.orderedSearchSpaces ?? []).map((item) => ({
    id: `evidence:orc-see:branch-ordering:${item.searchSpace.id}`,
    source: "orc-see",
    kind: "branch-ordering",
    subjectId: item.searchSpace.id,
    createdAt,
    data: {
      searchSpaceId: item.searchSpace.id,
      explorationOrder: item.explorationOrder,
      orderingScore: item.orderingScore,
      criteria: ["OperationalPriorityMap", "ExplorationValue", "FutureConstraintPropagation", "SearchSpaceSelection"],
      explanation: item.explanation,
      readOnly: true,
    },
  }));
}
