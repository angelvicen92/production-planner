import type { OperationalState } from "../contracts";

export type CompositeChangeSource = { changedTaskIds?: unknown; changedTaskCount?: unknown; readOnly?: unknown };
export type CompositeChangeSources = Record<string, CompositeChangeSource | unknown>;

export const COMPOSITE_MATERIALIZATION_UNEXPLAINED_DIFF_WARNING = "composite_materialization_change_sources_do_not_explain_final_diff" as const;
export const COMPOSITE_MATERIALIZATION_DECLARED_CHANGE_NOT_PRESENT_WARNING = "composite_materialization_declared_change_not_present" as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const nums = (value: unknown): number[] => Array.isArray(value) ? [...new Set(value.map(Number).filter(Number.isFinite))].sort((a, b) => a - b) : [];

function planningFingerprint(entry: any): string {
  return JSON.stringify({
    taskId: Number(entry.taskId),
    startPlanned: entry.startPlanned ?? null,
    endPlanned: entry.endPlanned ?? null,
    spaceId: entry.spaceId ?? entry.assignedSpace ?? null,
    assignedResourceIds: [...(entry.assignedResourceIds ?? entry.assignedResources ?? [])].map(Number).filter(Number.isFinite).sort((a, b) => a - b),
  });
}

export function changedTaskIdsBetweenPlanning(originalState?: OperationalState | null, finalState?: OperationalState | null): number[] {
  const before = new Map((originalState?.planning ?? []).map((entry: any) => [Number(entry.taskId), planningFingerprint(entry)]));
  const after = new Map((finalState?.planning ?? []).map((entry: any) => [Number(entry.taskId), planningFingerprint(entry)]));
  return [...new Set([...before.keys(), ...after.keys()].filter(Number.isFinite).filter((taskId) => before.get(taskId) !== after.get(taskId)))].sort((a, b) => a - b);
}

export interface ValidateCompositeMaterializationChangeSourcesInput {
  originalState?: OperationalState | null;
  selectedFinalState?: OperationalState | null;
  changeSources?: CompositeChangeSources | null;
  selectedFinalCandidateFamily?: string | null;
  rejectedOptionalImprovements?: Record<string, unknown> | string[] | null;
  productionConceptAlignment?: Record<string, unknown> | null;
}

export interface CompositeMaterializationChangeSourceValidation {
  summaryContractValid: boolean;
  unexplainedChangedTaskIds: number[];
  explainedChangedTaskIds: number[];
  declaredButUnchangedTaskIds: number[];
  appliedChangeSourceKeys: string[];
  rejectedChangeSourceKeys: string[];
  warnings: string[];
  materializationDiffContractValid: boolean;
  readOnlyAuditDoesNotAffectGate: true;
}

function rejectedKeys(input: ValidateCompositeMaterializationChangeSourcesInput): string[] {
  const rejected = input.rejectedOptionalImprovements;
  if (Array.isArray(rejected)) return rejected.map(String).sort();
  if (!isRecord(rejected)) return [];
  return Object.entries(rejected)
    .filter(([, value]) => value === true || (isRecord(value) && (value.rejected === true || value.selectedAsCommit === false)))
    .map(([key]) => key)
    .sort();
}

export function validateCompositeMaterializationChangeSources(input: ValidateCompositeMaterializationChangeSourcesInput): CompositeMaterializationChangeSourceValidation {
  const changed = changedTaskIdsBetweenPlanning(input.originalState, input.selectedFinalState);
  const changedSet = new Set(changed);
  const rejectedChangeSourceKeys = rejectedKeys(input);
  const rejectedSet = new Set(rejectedChangeSourceKeys);
  const appliedChangeSourceKeys = Object.keys(input.changeSources ?? {}).filter((key) => !rejectedSet.has(key)).sort();
  const declaredIds = new Set<number>();
  for (const key of appliedChangeSourceKeys) {
    const source = (input.changeSources ?? {})[key];
    if (isRecord(source)) nums(source.changedTaskIds).forEach((id) => declaredIds.add(id));
  }
  const explainedChangedTaskIds = changed.filter((id) => declaredIds.has(id));
  const unexplainedChangedTaskIds = changed.filter((id) => !declaredIds.has(id));
  const declaredButUnchangedTaskIds = [...declaredIds].filter((id) => !changedSet.has(id)).sort((a, b) => a - b);
  const warnings: string[] = [];
  if (unexplainedChangedTaskIds.length > 0) warnings.push(COMPOSITE_MATERIALIZATION_UNEXPLAINED_DIFF_WARNING);
  if (declaredButUnchangedTaskIds.length > 0) warnings.push(COMPOSITE_MATERIALIZATION_DECLARED_CHANGE_NOT_PRESENT_WARNING);
  return { summaryContractValid: warnings.length === 0, unexplainedChangedTaskIds, explainedChangedTaskIds, declaredButUnchangedTaskIds, appliedChangeSourceKeys, rejectedChangeSourceKeys, warnings, materializationDiffContractValid: unexplainedChangedTaskIds.length === 0 && declaredButUnchangedTaskIds.length === 0, readOnlyAuditDoesNotAffectGate: true };
}
