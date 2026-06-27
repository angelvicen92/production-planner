import type { Candidate, OperationalState, ORCRecord, PlannedTransformation } from "../contracts";

export type CandidateAssignment = Candidate["assignments"][number];

export interface AssignmentApplicationRecord {
  readonly assignment: CandidateAssignment;
  readonly action: "applied" | "rejected" | "noop";
  readonly taskId: number;
  readonly reason: string;
  readonly changedFields: ReadonlyArray<"startPlanned" | "endPlanned" | "spaceId" | "assignedResourceIds">;
  readonly createdPlanningEntry: boolean;
}

export interface AssignmentApplicationResult {
  readonly applied: AssignmentApplicationRecord[];
  readonly rejected: AssignmentApplicationRecord[];
  readonly noops: AssignmentApplicationRecord[];
  readonly realChangeCount: number;
  readonly appliedTransformations: PlannedTransformation[];
  readonly evidenceData: ORCRecord;
}

const PROTECTED_STATUSES = new Set(["done", "in_progress"]);

function sameResources(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function hasLock(state: OperationalState, taskId: number, lockType: "full" | "time" | "space" | "resource"): boolean {
  return state.locks.some((lock) => lock.taskId === taskId && lock.lockType === lockType);
}


function changedFieldsFor(
  current: { startPlanned: string; endPlanned: string; spaceId?: number | null; assignedResourceIds: number[] } | undefined,
  assignment: CandidateAssignment,
): Array<"startPlanned" | "endPlanned" | "spaceId" | "assignedResourceIds"> {
  const fields: Array<"startPlanned" | "endPlanned" | "spaceId" | "assignedResourceIds"> = [];
  if (assignment.startPlanned != null && current?.startPlanned !== assignment.startPlanned) fields.push("startPlanned");
  if (assignment.endPlanned != null && current?.endPlanned !== assignment.endPlanned) fields.push("endPlanned");
  if (assignment.spaceId !== undefined && current?.spaceId !== assignment.spaceId) fields.push("spaceId");
  if (assignment.resourceIds !== undefined && !sameResources(current?.assignedResourceIds ?? [], assignment.resourceIds)) fields.push("assignedResourceIds");
  return fields;
}

function reject(assignment: CandidateAssignment, reason: string, changedFields: AssignmentApplicationRecord["changedFields"] = []): AssignmentApplicationRecord {
  return { assignment, action: "rejected", taskId: assignment.taskId, reason, changedFields, createdPlanningEntry: false };
}

export function applyCandidateAssignments(state: OperationalState, assignments: readonly CandidateAssignment[]): AssignmentApplicationResult {
  const applied: AssignmentApplicationRecord[] = [];
  const rejected: AssignmentApplicationRecord[] = [];
  const noops: AssignmentApplicationRecord[] = [];
  let realChangeCount = 0;

  for (const assignment of assignments) {
    const planningEntry = state.planning.find((entry) => entry.taskId === assignment.taskId);
    const task = state.tasks.find((item) => item.id === assignment.taskId);

    if (task == null) {
      rejected.push(reject(assignment, "task-not-found"));
      continue;
    }

    const changedFields = changedFieldsFor(planningEntry, assignment);
    if (PROTECTED_STATUSES.has(task.status)) {
      rejected.push(reject(assignment, `task-status-protected:${task.status}`, changedFields));
      continue;
    }
    if (hasLock(state, assignment.taskId, "full")) {
      rejected.push(reject(assignment, "lock-protected:full", changedFields));
      continue;
    }
    if ((changedFields.includes("startPlanned") || changedFields.includes("endPlanned")) && hasLock(state, assignment.taskId, "time")) {
      rejected.push(reject(assignment, "lock-protected:time", changedFields));
      continue;
    }
    if (changedFields.includes("spaceId") && hasLock(state, assignment.taskId, "space")) {
      rejected.push(reject(assignment, "lock-protected:space", changedFields));
      continue;
    }
    if (changedFields.includes("assignedResourceIds") && hasLock(state, assignment.taskId, "resource")) {
      rejected.push(reject(assignment, "lock-protected:resource", changedFields));
      continue;
    }

    if (planningEntry == null) {
      const startPlanned = assignment.startPlanned ?? task.startPlanned ?? null;
      const endPlanned = assignment.endPlanned ?? task.endPlanned ?? null;
      if (startPlanned == null || endPlanned == null) {
        rejected.push(reject(assignment, "planning-entry-missing-required-time", changedFields));
        continue;
      }
      const newEntry = {
        taskId: assignment.taskId,
        startPlanned,
        endPlanned,
        assignedResourceIds: [...assignment.resourceIds],
        spaceId: assignment.spaceId ?? task.spaceId ?? null,
      };
      state.planning.push(newEntry);
      realChangeCount += 1;
      applied.push({ assignment, action: "applied", taskId: assignment.taskId, reason: "planning-entry-created", changedFields: ["startPlanned", "endPlanned", "spaceId", "assignedResourceIds"], createdPlanningEntry: true });
      continue;
    }

    if (changedFields.length === 0) {
      noops.push({ assignment, action: "noop", taskId: assignment.taskId, reason: "assignment-matches-existing-planning", changedFields, createdPlanningEntry: false });
      continue;
    }

    for (const field of changedFields) {
      if (field === "startPlanned" && assignment.startPlanned != null) planningEntry.startPlanned = assignment.startPlanned;
      if (field === "endPlanned" && assignment.endPlanned != null) planningEntry.endPlanned = assignment.endPlanned;
      if (field === "spaceId") planningEntry.spaceId = assignment.spaceId ?? null;
      if (field === "assignedResourceIds") planningEntry.assignedResourceIds = [...assignment.resourceIds];
    }
    realChangeCount += changedFields.length;
    applied.push({ assignment, action: "applied", taskId: assignment.taskId, reason: "planning-entry-updated", changedFields, createdPlanningEntry: false });
  }

  return {
    applied,
    rejected,
    noops,
    realChangeCount,
    appliedTransformations: applied.map((record) => ({ kind: "SCHEDULE_PENDING", reason: `${record.reason}:${record.taskId}` })),
    evidenceData: {
      assignmentsReceived: assignments.length,
      assignmentsApplied: applied.length,
      assignmentsRejected: rejected.length,
      assignmentsNoop: noops.length,
      appliedAssignments: applied,
      rejectedAssignments: rejected,
      noopAssignments: noops,
      realChangeCount,
      officialStateMutated: false,
    },
  };
}
