import type { LockInput, TaskInput } from "../../types";
import type { EffectiveTaskResourceAssignment } from "./effectiveTaskResourceAssignments";

export interface ProjectedTaskResourceDetails {
  readonly taskId: number;
  readonly participantId: number | null;
  readonly relatedCoachResourceId: number | null;
  readonly lockedCoachResourceId: number | null;
  readonly lockId: number | null;
  readonly relatedParticipantIds: readonly number[];
}

export type ProjectedPlannerNextTaskResources =
  | {
      readonly status: "REPRESENTABLE";
      readonly coachResourceId?: number;
      readonly genericResourceIds: readonly number[];
      readonly assignmentResourceIds: readonly number[];
      readonly lockedResourceIds: readonly number[];
      readonly coachLockRedundant: boolean;
      readonly readOnly: true;
    }
  | {
      readonly status: "UNSUPPORTED";
      readonly reasonCode: "UNSUPPORTED_COACH_RESOURCE_MAPPING";
      readonly details: ProjectedTaskResourceDetails;
      readonly readOnly: true;
    };

const unique = (values: readonly number[]): readonly number[] =>
  Object.freeze([...new Set(values)].sort((left, right) => left - right));

/** Single authority for the hard resource channels published for one Planner Next task. */
export function resolveProjectedPlannerNextTaskResources(
  task: TaskInput,
  assignment: EffectiveTaskResourceAssignment,
  locks: readonly LockInput[],
  coachResourceIdByParticipantId: ReadonlyMap<number, number>,
  participantIdsByCoachResourceId: ReadonlyMap<number, readonly number[]>,
): ProjectedPlannerNextTaskResources {
  if (task.status === "cancelled") return Object.freeze({
    status: "REPRESENTABLE", genericResourceIds: Object.freeze([]), assignmentResourceIds: Object.freeze([]),
    lockedResourceIds: Object.freeze([]), coachLockRedundant: false, readOnly: true,
  });

  const assignmentResourceIds = unique(assignment.effectiveResourceIds);
  const resourceLocks = locks
    .filter((lock) => lock.taskId === task.id && (lock.lockType === "resource" || lock.lockType === "full") && Number.isInteger(lock.lockedResourceId) && lock.lockedResourceId! > 0)
    .sort((left, right) => left.id - right.id);
  const lockedResourceIds = unique(resourceLocks.map((lock) => lock.lockedResourceId!));
  const participantId = Number.isInteger(task.contestantId) && task.contestantId! > 0 ? task.contestantId! : null;
  const relatedCoachResourceId = participantId === null ? undefined : coachResourceIdByParticipantId.get(participantId);
  const coachTask = task.plannerNextKind === "main" || task.plannerNextKind === "vocal";
  const coachResourceId = coachTask && relatedCoachResourceId !== undefined && assignmentResourceIds.includes(relatedCoachResourceId)
    ? relatedCoachResourceId : undefined;

  const incompatibleCoachId = [...assignmentResourceIds, ...lockedResourceIds]
    .find((resourceId) => participantIdsByCoachResourceId.has(resourceId) && resourceId !== coachResourceId);
  const incompatibleLock = incompatibleCoachId === undefined ? undefined
    : resourceLocks.find((lock) => lock.lockedResourceId === incompatibleCoachId);
  if ((coachTask && coachResourceId === undefined) || incompatibleCoachId !== undefined) {
    const affectedCoachId = incompatibleCoachId ?? relatedCoachResourceId ?? null;
    return Object.freeze({
      status: "UNSUPPORTED",
      reasonCode: "UNSUPPORTED_COACH_RESOURCE_MAPPING",
      details: Object.freeze({
        taskId: task.id,
        participantId,
        relatedCoachResourceId: relatedCoachResourceId ?? null,
        lockedCoachResourceId: incompatibleLock?.lockedResourceId ?? null,
        lockId: incompatibleLock?.id ?? null,
        relatedParticipantIds: Object.freeze([...(participantIdsByCoachResourceId.get(affectedCoachId!) ?? [])].sort((left, right) => left - right)),
      }),
      readOnly: true,
    });
  }

  const genericResourceIds = unique([...assignmentResourceIds, ...lockedResourceIds]
    .filter((resourceId) => resourceId !== coachResourceId));
  return Object.freeze({
    status: "REPRESENTABLE",
    ...(coachResourceId === undefined ? {} : { coachResourceId }),
    genericResourceIds,
    assignmentResourceIds,
    lockedResourceIds,
    coachLockRedundant: coachResourceId !== undefined && lockedResourceIds.includes(coachResourceId),
    readOnly: true,
  });
}
