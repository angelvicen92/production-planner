import type { CandidateState, OperationalState } from "../contracts";

export type PlanningMaterializationSource = "baseline_seed_preserved" | "candidate_transformations" | "none";
export const ORC_PLANNING_MATERIALIZATION_CONTRACT_VERSION_ID225 = "ORC-PLANNING-MATERIALIZATION-ID225" as const;

export interface PlanningMaterializationDiagnostics {
  readonly source: PlanningMaterializationSource;
  readonly plannedTaskCount: number;
  readonly changedTaskCount: number;
  readonly warnings: readonly string[];
  readonly preservedAssignedSpaceCount: number;
  readonly missingAssignedSpaceFieldCount: number;
  readonly nullAssignedSpaceCount: number;
  readonly assignedSpaceContractValid: boolean;
  readonly materializationContractVersion: typeof ORC_PLANNING_MATERIALIZATION_CONTRACT_VERSION_ID225;
  readonly readOnly: true;
}

export type MaterializedPlanningEntry = OperationalState["planning"][number] & {
  readonly assignedSpace: number | null;
  readonly assignedResources: readonly number[];
};

export interface MaterializedPlanningResult {
  readonly planning: MaterializedPlanningEntry[];
  readonly diagnostics: PlanningMaterializationDiagnostics;
}

const PROTECTED_STATUSES = new Set(["done", "in_progress"]);

type MutableMaterializedPlanningEntry = OperationalState["planning"][number] & { assignedSpace: number | null; assignedResources: number[] };

function clonePlanningEntry(entry: OperationalState["planning"][number]): MutableMaterializedPlanningEntry | null {
  if (!Number.isFinite(entry.taskId) || !entry.startPlanned || !entry.endPlanned) return null;
  const assignedResourceIds = [...(entry.assignedResourceIds ?? [])].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const spaceId = entry.spaceId ?? null;
  return { ...entry, taskId: entry.taskId, startPlanned: entry.startPlanned, endPlanned: entry.endPlanned, assignedResourceIds, spaceId, assignedSpace: spaceId, assignedResources: [...assignedResourceIds] };
}

function sameResources(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasLock(state: OperationalState, taskId: number, lockType: "full" | "time" | "space" | "resource"): boolean {
  return state.locks.some((lock) => lock.taskId === taskId && lock.lockType === lockType);
}

function assignedSpaceContractDiagnostics(planning: readonly { assignedSpace?: number | null }[]) {
  const missingAssignedSpaceFieldCount = planning.filter((entry) => !("assignedSpace" in entry)).length;
  const nullAssignedSpaceCount = planning.filter((entry) => "assignedSpace" in entry && entry.assignedSpace == null).length;
  return {
    preservedAssignedSpaceCount: planning.length - missingAssignedSpaceFieldCount - nullAssignedSpaceCount,
    missingAssignedSpaceFieldCount,
    nullAssignedSpaceCount,
    assignedSpaceContractValid: missingAssignedSpaceFieldCount === 0,
    materializationContractVersion: ORC_PLANNING_MATERIALIZATION_CONTRACT_VERSION_ID225,
    readOnly: true as const,
  };
}

function diagnostics(source: PlanningMaterializationSource, planning: readonly MutableMaterializedPlanningEntry[], changedTaskCount: number, warnings: readonly string[]): PlanningMaterializationDiagnostics {
  return { source, plannedTaskCount: planning.length, changedTaskCount, warnings, ...assignedSpaceContractDiagnostics(planning) };
}

function planningFingerprint(entry: MaterializedPlanningEntry): string {
  return JSON.stringify({ taskId: entry.taskId, startPlanned: entry.startPlanned, endPlanned: entry.endPlanned, spaceId: entry.spaceId ?? null, assignedResourceIds: [...entry.assignedResourceIds].sort((a, b) => a - b) });
}

export function materializeSimulatedPlanning(candidateState: CandidateState, baseOperationalState: OperationalState): MaterializedPlanningResult {
  const warnings: string[] = [];
  const planning = (baseOperationalState.planning ?? []).map(clonePlanningEntry).filter((entry): entry is MutableMaterializedPlanningEntry => entry !== null).sort((a, b) => a.taskId - b.taskId);
  const baselineByTask = new Map(planning.map((entry) => [entry.taskId, planningFingerprint(entry)]));

  if (planning.length !== (baseOperationalState.planning ?? []).length) warnings.push("Baseline planning contained entries without taskId/start/end and they were skipped.");

  const assignments = candidateState.sourceAssignments ?? [];
  if (assignments.length === 0) {
    return { planning, diagnostics: diagnostics(planning.length > 0 ? "baseline_seed_preserved" : "none", planning, 0, warnings) };
  }

  for (const assignment of assignments) {
    const task = baseOperationalState.tasks.find((item) => item.id === assignment.taskId);
    const entry = planning.find((item) => item.taskId === assignment.taskId);
    if (!task) { warnings.push(`Assignment for task ${assignment.taskId} rejected during materialization: task-not-found.`); continue; }
    const nextResources = [...(assignment.resourceIds ?? [])].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const changedFields = [
      assignment.startPlanned != null && entry?.startPlanned !== assignment.startPlanned ? "startPlanned" : null,
      assignment.endPlanned != null && entry?.endPlanned !== assignment.endPlanned ? "endPlanned" : null,
      assignment.spaceId !== undefined && (entry?.spaceId ?? null) !== (assignment.spaceId ?? null) ? "spaceId" : null,
      assignment.resourceIds !== undefined && !sameResources(entry?.assignedResourceIds ?? [], nextResources) ? "assignedResourceIds" : null,
    ].filter((field): field is "startPlanned" | "endPlanned" | "spaceId" | "assignedResourceIds" => field !== null);

    let rejection: string | null = null;
    if (PROTECTED_STATUSES.has(task.status)) rejection = `task-status-protected:${task.status}`;
    else if (hasLock(baseOperationalState, assignment.taskId, "full")) rejection = "lock-protected:full";
    else if ((changedFields.includes("startPlanned") || changedFields.includes("endPlanned")) && hasLock(baseOperationalState, assignment.taskId, "time")) rejection = "lock-protected:time";
    else if (changedFields.includes("spaceId") && hasLock(baseOperationalState, assignment.taskId, "space")) rejection = "lock-protected:space";
    else if (changedFields.includes("assignedResourceIds") && hasLock(baseOperationalState, assignment.taskId, "resource")) rejection = "lock-protected:resource";
    if (rejection) { warnings.push(`Assignment for task ${assignment.taskId} rejected during materialization: ${rejection}.`); continue; }
    if (changedFields.length === 0) continue;

    if (!entry) {
      const startPlanned = assignment.startPlanned ?? task.startPlanned ?? null;
      const endPlanned = assignment.endPlanned ?? task.endPlanned ?? null;
      if (!startPlanned || !endPlanned) { warnings.push(`Assignment for task ${assignment.taskId} rejected during materialization: planning-entry-missing-required-time.`); continue; }
      planning.push({ taskId: assignment.taskId, startPlanned, endPlanned, assignedResourceIds: nextResources, spaceId: assignment.spaceId ?? task.spaceId ?? null, assignedSpace: assignment.spaceId ?? task.spaceId ?? null, assignedResources: [...nextResources] });
      continue;
    }
    if (assignment.startPlanned != null) entry.startPlanned = assignment.startPlanned;
    if (assignment.endPlanned != null) entry.endPlanned = assignment.endPlanned;
    if (assignment.spaceId !== undefined) { entry.spaceId = assignment.spaceId ?? null; entry.assignedSpace = assignment.spaceId ?? null; }
    if (assignment.resourceIds !== undefined) { entry.assignedResourceIds = [...nextResources]; entry.assignedResources = [...nextResources]; }
  }

  planning.sort((a, b) => a.taskId - b.taskId);
  const changedTaskCount = planning.filter((entry) => baselineByTask.get(entry.taskId) !== planningFingerprint(entry)).length;
  if (changedTaskCount === 0) {
    const source = planning.length > 0 ? "baseline_seed_preserved" : "none";
    return { planning, diagnostics: diagnostics(source, planning, 0, warnings) };
  }
  return { planning, diagnostics: diagnostics("candidate_transformations", planning, changedTaskCount, warnings) };
}
