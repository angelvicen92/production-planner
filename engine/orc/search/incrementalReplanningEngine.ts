export interface IncrementalReplanningContext {
  branchId: string;
  preservedState: Record<string, unknown>;
}

export interface IncrementalReplanningResult {
  reusedState: Record<string, unknown>;
  replannedElements: string[];
  explanation: string;
}

const cloneStableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(cloneStableValue);
  }

  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, cloneStableValue(nestedValue)]),
    );
  }

  return value;
};

const cloneStableRecord = (record: Record<string, unknown>): Record<string, unknown> => (
  cloneStableValue(record) as Record<string, unknown>
);

export function executeIncrementalReplanning(
  context: IncrementalReplanningContext,
): IncrementalReplanningResult {
  const reusedState = cloneStableRecord(context.preservedState ?? {});
  const replannedElements = Object.keys(reusedState).sort((left, right) => left.localeCompare(right));

  return {
    reusedState,
    replannedElements,
    explanation: replannedElements.length === 0
      ? `Branch ${context.branchId} was discarded with no reusable partial state; incremental replanning remains in shadow mode.`
      : `Branch ${context.branchId} was discarded; reusable partial state was preserved for deterministic shadow-mode incremental replanning.`,
  };
}
