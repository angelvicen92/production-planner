import type { ExecutionEvidenceRecord } from "../evidence/executionEvidenceRecorder";
import { deepFreeze } from "../immutability";
import { structuralEquals } from "../structuralEquality";

export interface ReplayResult {
  executionId: string;

  replayed: boolean;

  differences: {
    summaryChanged: boolean;
    advisoryChanged: boolean;
    evidenceChanged: boolean;
  };

  summary: string;
}

const cloneSerializable = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const buildReplaySummary = (
  execution: ExecutionEvidenceRecord,
  differences: ReplayResult["differences"],
): string => {
  const changed = Object.values(differences).filter(Boolean).length;
  const status = changed === 0 ? "structurally identical" : `${changed} structural difference(s)`;
  return `Replay ${execution.executionId}: ${status}; evidenceIds=${execution.evidenceIds.length}.`;
};

export function replayExecution(
  execution: ExecutionEvidenceRecord,
): ReplayResult {
  const replayedExecution = cloneSerializable(execution);
  const differences = {
    summaryChanged: !structuralEquals(execution.summary, replayedExecution.summary),
    advisoryChanged: !structuralEquals(execution.advisoryDecision, replayedExecution.advisoryDecision),
    evidenceChanged: !structuralEquals(execution.evidenceIds, replayedExecution.evidenceIds),
  };

  return deepFreeze({
    executionId: execution.executionId,
    replayed: true,
    differences,
    summary: buildReplaySummary(execution, differences),
  }) as ReplayResult;
}
