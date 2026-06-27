import type { Evidence, ORCRecord, SearchSpace } from "../contracts";
import type { ExplorationValueAnalysis, ExplorationValue } from "./explorationValueEstimator";
import { propagateFutureConstraints } from "./futureConstraintPropagationEngine";
import type { FutureConstraintEffect } from "./futureConstraintPropagationEngine";
import type { OperationalPriority, OperationalPriorityMap } from "./operationalPriorityAnalyzer";

export interface SelectedSearchSpace {
  searchSpace: SearchSpace;
  selected: boolean;
  selectionReason: string;
  futureConstraintEffect?: FutureConstraintEffect;
}

export interface SearchSpaceSelectionResult {
  selected: SelectedSearchSpace[];
}

const finiteNumber = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

const priorityForSearchSpace = (searchSpace: SearchSpace, priorities: OperationalPriorityMap): OperationalPriority | null => {
  const metadataPriority = searchSpace.metadata?.sourceOperationalPriority;
  if (metadataPriority != null && typeof metadataPriority === "object") {
    const record = metadataPriority as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    const priorityScore = finiteNumber(record.priorityScore);
    if (id != null && priorityScore != null) {
      const matched = priorities.priorities.find((priority) => priority.id === id) ?? null;
      return matched ?? { id, priorityScore, bottlenecks: [], criticalResources: [], activeConstraints: [], explanation: typeof record.explanation === "string" ? record.explanation : "Operational priority carried by SearchSpace metadata." };
    }
  }

  const opportunityPriority = finiteNumber(searchSpace.metadata?.sourceOpportunityPriority);
  if (opportunityPriority != null) {
    return { id: `opportunity:${String(searchSpace.metadata?.sourceOpportunityId ?? searchSpace.id)}`, priorityScore: opportunityPriority, bottlenecks: [], criticalResources: [], activeConstraints: [], explanation: "PrioritizedOpportunity priority carried by SearchSpace metadata." };
  }

  return null;
};

const explorationValueForSearchSpace = (searchSpace: SearchSpace, explorationValues: ExplorationValueAnalysis): ExplorationValue | null =>
  explorationValues.values.find((value) => value.searchSpaceId === searchSpace.id) ?? searchSpace.explorationValue ?? null;

const selectionReasonFor = (searchSpace: SearchSpace, priority: OperationalPriority | null, explorationValue: ExplorationValue | null): string => {
  const priorityPart = priority == null ? "no operational priority available" : `priority ${priority.id}=${priority.priorityScore}`;
  const valuePart = explorationValue == null ? "no exploration value available" : `exploration value ${explorationValue.expectedValue} confidence ${explorationValue.confidence}`;
  return `Selected for candidate generation using ${priorityPart} and ${valuePart}; v1 preserves observable behavior by selecting every built SearchSpace.`;
};

export function selectSearchSpaces(
  searchSpaces: SearchSpace[],
  priorities: OperationalPriorityMap,
  explorationValues: ExplorationValueAnalysis,
): SearchSpaceSelectionResult {
  const baseResult: SearchSpaceSelectionResult = {
    selected: [...(searchSpaces ?? [])].map((searchSpace) => ({
      searchSpace,
      selected: true,
      selectionReason: selectionReasonFor(searchSpace, priorityForSearchSpace(searchSpace, priorities ?? { priorities: [] }), explorationValueForSearchSpace(searchSpace, explorationValues ?? { values: [] })),
    })),
  };
  const futureConstraintAnalysis = propagateFutureConstraints(baseResult);
  const effectBySearchSpaceId = new Map(futureConstraintAnalysis.effects.map((effect) => [effect.searchSpaceId, effect]));

  return {
    selected: baseResult.selected.map((item) => ({
      ...item,
      futureConstraintEffect: effectBySearchSpaceId.get(item.searchSpace.id),
    })),
  };
}

export function buildSearchSpaceSelectionEvidence(
  result: SearchSpaceSelectionResult,
  priorities: OperationalPriorityMap,
  explorationValues: ExplorationValueAnalysis,
  createdAt: string | null = null,
): Evidence[] {
  return result.selected.map((item) => {
    const priority = priorityForSearchSpace(item.searchSpace, priorities ?? { priorities: [] });
    const explorationValue = explorationValueForSearchSpace(item.searchSpace, explorationValues ?? { values: [] });
    return {
      id: `evidence:orc-see:search-space-selection:${item.searchSpace.id}`,
      source: "orc-see",
      kind: "search-space-selection",
      subjectId: item.searchSpace.id,
      createdAt,
      data: {
        searchSpace: { id: item.searchSpace.id, taskIds: [...item.searchSpace.taskIds], metadata: { ...item.searchSpace.metadata } },
        selected: item.selected,
        selectionReason: item.selectionReason,
        operationalPriority: priority == null ? null : { id: priority.id, priorityScore: priority.priorityScore, explanation: priority.explanation },
        explorationValue: explorationValue == null ? null : { searchSpaceId: explorationValue.searchSpaceId, expectedValue: explorationValue.expectedValue, confidence: explorationValue.confidence, explanation: explorationValue.explanation },
        futureConstraintPropagation: item.futureConstraintEffect == null ? null : { searchSpaceId: item.futureConstraintEffect.searchSpaceId, propagatedConstraints: [...item.futureConstraintEffect.propagatedConstraints], propagationScore: item.futureConstraintEffect.propagationScore, explanation: item.futureConstraintEffect.explanation },
        readOnly: true,
      } as ORCRecord,
    };
  });
}
