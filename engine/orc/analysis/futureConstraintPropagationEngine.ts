import type { ORCRecord } from "../contracts";
import type { SearchSpaceSelectionResult, SelectedSearchSpace } from "./searchSpaceSelectionEngine";

export interface FutureConstraintEffect {
  searchSpaceId: string;
  propagatedConstraints: string[];
  propagationScore: number;
  explanation: string;
}

export interface FutureConstraintPropagationAnalysis {
  effects: FutureConstraintEffect[];
}

const round = (value: number): number => Number(value.toFixed(6));

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];

const stableUnique = (values: string[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }
  return unique;
};

const metadataRecord = (value: unknown): ORCRecord => (value != null && typeof value === "object" ? (value as ORCRecord) : {});

const collectMetadataConstraints = (metadata: ORCRecord): string[] => {
  const propagated = [
    ...stringArray(metadata.activeConstraints).map((constraint) => `active:${constraint}`),
    ...stringArray(metadata.propagatedConstraints).map((constraint) => `metadata:${constraint}`),
    ...stringArray(metadata.allowedTransformations).map((transformation) => `transformation:${transformation}`),
  ];

  const sourceOpportunityId = typeof metadata.sourceOpportunityId === "string" ? metadata.sourceOpportunityId : null;
  if (sourceOpportunityId != null) propagated.push(`opportunity:${sourceOpportunityId}`);
  if (metadata.truncatedAffectedTasks === true) propagated.push("scope:truncated-affected-tasks");

  return propagated;
};

const effectForSelection = (item: SelectedSearchSpace): FutureConstraintEffect => {
  const searchSpace = item.searchSpace;
  const metadata = metadataRecord(searchSpace.metadata);
  const taskIds = Array.isArray(searchSpace.taskIds) ? searchSpace.taskIds : [];
  const propagatedConstraints = stableUnique([
    `search-space:${searchSpace.id}`,
    ...taskIds.map((taskId) => `task:${taskId}`),
    ...collectMetadataConstraints(metadata),
  ]);
  const propagationScore = round(clamp01(propagatedConstraints.length / 10));

  return {
    searchSpaceId: searchSpace.id,
    propagatedConstraints,
    propagationScore,
    explanation: `Propagated ${propagatedConstraints.length} future constraint signal(s) from SearchSpace ${searchSpace.id}; score=${propagationScore.toFixed(6)}.`,
  };
};

export function propagateFutureConstraints(
  searchSpaces: SearchSpaceSelectionResult,
): FutureConstraintPropagationAnalysis {
  return {
    effects: (searchSpaces?.selected ?? []).map((item) => effectForSelection(item)),
  };
}
