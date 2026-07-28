import type { ScheduledTask, Task } from "./contracts";
export const technicalTasks = (tasks: Task[]): Task[] => tasks.filter((task) => task.kind === "technical");
export const technicalTaskIds = (tasks: Task[]): string[] => technicalTasks(tasks).map(({ id }) => id).sort();
export const canonicalTechnicalResourceIds = (task: Pick<Task, "requiredResourceIds">): string[] => [...(task.requiredResourceIds ?? [])].sort();
export const hasOwnTechnicalField = (task: object, field: "participantId" | "coachId" | "blockKey" | "setupFamilyId" | "jointGroupId"): boolean => Object.prototype.hasOwnProperty.call(task, field);
export function technicalIdentityMatches(expected: Task, actual: ScheduledTask): boolean {
  return actual.id === expected.id && actual.kind === "technical"
    && !hasOwnTechnicalField(actual, "participantId") && !hasOwnTechnicalField(actual, "coachId") && !hasOwnTechnicalField(actual, "blockKey")
    && !hasOwnTechnicalField(actual, "setupFamilyId") && !hasOwnTechnicalField(actual, "jointGroupId") && actual.spaceId === expected.spaceId
    && actual.duration === expected.duration && actual.end - actual.start === expected.duration
    && JSON.stringify(canonicalTechnicalResourceIds(actual)) === JSON.stringify(canonicalTechnicalResourceIds(expected))
    && Array.isArray(actual.dependencies) && actual.dependencies.length === 0;
}
export function technicalMetrics(expected: Task[], scheduled: ScheduledTask[]) {
  const ids = technicalTaskIds(expected);
  return { technicalOperationCount: ids.length, technicalOperationPlannedCount: scheduled.filter(({ kind }) => kind === "technical").length,
    technicalOperationStartById: Object.fromEntries(ids.map((id) => [id, scheduled.find((task) => task.id === id)?.start ?? null])),
    technicalOperationEndById: Object.fromEntries(ids.map((id) => [id, scheduled.find((task) => task.id === id)?.end ?? null])) };
}
