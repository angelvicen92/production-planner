import type { SearchSpace } from "../contracts";

export interface ExplorationValue {
  searchSpaceId: string;
  expectedValue: number;
  confidence: number;
  explanation: string;
}

export interface ExplorationValueAnalysis {
  values: ExplorationValue[];
}

const finiteNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const arraySize = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const round = (value: number): number => Number(value.toFixed(6));

const estimateSingleSearchSpace = (searchSpace: SearchSpace): ExplorationValue => {
  const metadata = searchSpace.metadata ?? {};
  const taskCount = Array.isArray(searchSpace.taskIds) ? searchSpace.taskIds.length : 0;
  const transformationCount = arraySize(metadata.allowedTransformations);
  const priority = finiteNumber(metadata.sourceOpportunityPriority);
  const truncatedAffectedTasks = metadata.truncatedAffectedTasks === true;
  const repeatedByCognitiveMemory =
    typeof metadata.cognitiveFeedback === "object" &&
    metadata.cognitiveFeedback != null &&
    (metadata.cognitiveFeedback as { repeatedByCognitiveMemory?: unknown }).repeatedByCognitiveMemory === true;

  const taskSignal = clamp01(taskCount / 20);
  const transformationSignal = clamp01(transformationCount / 3);
  const prioritySignal = clamp01(priority / 100);
  const truncationSignal = truncatedAffectedTasks ? 0.1 : 0;
  const repetitionPenalty = repeatedByCognitiveMemory ? 0.2 : 0;

  const expectedValue = round(clamp01(prioritySignal * 0.45 + transformationSignal * 0.3 + taskSignal * 0.2 + truncationSignal - repetitionPenalty));
  const confidence = round(clamp01(0.35 + (taskCount > 0 ? 0.2 : 0) + (transformationCount > 0 ? 0.2 : 0) + (priority > 0 ? 0.15 : 0) - (repeatedByCognitiveMemory ? 0.1 : 0)));

  return {
    searchSpaceId: searchSpace.id,
    expectedValue,
    confidence,
    explanation: `Expected exploration value ${expectedValue.toFixed(6)} from priority=${priority}, taskCount=${taskCount}, transformationCount=${transformationCount}, truncatedAffectedTasks=${truncatedAffectedTasks}, repeatedByCognitiveMemory=${repeatedByCognitiveMemory}.`,
  };
};

export function estimateExplorationValue(searchSpaces: SearchSpace[]): ExplorationValueAnalysis {
  return {
    values: (searchSpaces ?? []).map((searchSpace) => estimateSingleSearchSpace(searchSpace)),
  };
}
