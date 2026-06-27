import type { SimulatedState } from "../contracts";
import { stableStringify } from "../structuralEquality";

export interface StateSignature {
  signature: string;
}

export interface TranspositionEntry {
  signature: string;
  bestScore: number;
  branchId: string;
  visits: number;
}

export interface TranspositionTable {
  entries: Map<string, TranspositionEntry>;
}

const cloneEntry = (entry: TranspositionEntry): TranspositionEntry => ({ ...entry });

const sortedNumbers = (values: readonly number[] = []): number[] => [...values].sort((a, b) => a - b);
function canonicalPlanning(state: SimulatedState) {
  const snapshot = state.operationalStateSnapshot;
  return {
    planId: snapshot.planId,
    workDay: snapshot.workDay,
    planning: [...snapshot.planning]
      .map((entry) => ({
        taskId: entry.taskId,
        startPlanned: entry.startPlanned,
        endPlanned: entry.endPlanned,
        assignedResourceIds: sortedNumbers(entry.assignedResourceIds),
        spaceId: entry.spaceId ?? null,
      }))
      .sort((a, b) => a.taskId - b.taskId || a.startPlanned.localeCompare(b.startPlanned) || a.endPlanned.localeCompare(b.endPlanned)),
    tasks: [...snapshot.tasks]
      .map((task) => ({ ...task }))
      .sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0)),
    resources: [...snapshot.resources]
      .map((resource) => ({ ...resource }))
      .sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0)),
    spaces: snapshot.spaces,
    availability: {
      ...snapshot.availability,
      globalHardBreaks: [...snapshot.availability.globalHardBreaks].sort((a, b) => `${a.start}-${a.end}`.localeCompare(`${b.start}-${b.end}`)),
      protectedBreaks: [...snapshot.availability.protectedBreaks].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    },
    dependencies: [...snapshot.dependencies]
      .map((dependency) => ({
        taskId: dependency.taskId,
        dependsOnTaskIds: sortedNumbers(dependency.dependsOnTaskIds),
        dependsOnTemplateIds: sortedNumbers(dependency.dependsOnTemplateIds),
      }))
      .sort((a, b) => a.taskId - b.taskId),
    locks: [...snapshot.locks].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    constraints: snapshot.constraints,
    appliedTransformations: state.appliedTransformations.map((transformation) => ({ ...transformation })),
    simulationMode: state.simulationMode,
  };
}

export function buildStateSignature(
  simulatedState: SimulatedState,
): StateSignature {
  return { signature: stableStringify(canonicalPlanning(simulatedState)) };
}

export function lookupTransposition(
  table: TranspositionTable,
  signature: StateSignature,
): TranspositionEntry | null {
  const entry = table.entries.get(signature.signature) ?? null;
  return entry == null ? null : cloneEntry(entry);
}

export function registerTransposition(
  table: TranspositionTable,
  signature: StateSignature,
  score: number,
  branchId: string,
): TranspositionTable {
  const existing = table.entries.get(signature.signature) ?? null;
  const nextEntry: TranspositionEntry = existing == null
    ? { signature: signature.signature, bestScore: score, branchId, visits: 1 }
    : {
      signature: existing.signature,
      bestScore: score > existing.bestScore ? score : existing.bestScore,
      branchId: score > existing.bestScore ? branchId : existing.branchId,
      visits: existing.visits + 1,
    };
  const entries = new Map(Array.from(table.entries.entries()).map(([key, entry]) => [key, cloneEntry(entry)]));
  entries.set(signature.signature, nextEntry);
  return { entries };
}
