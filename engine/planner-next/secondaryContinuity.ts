import type { PlannerNextProblem, Space, Task } from "./contracts";

export function requiredSecondarySpaces(problem: Pick<PlannerNextProblem, "spaces">): Space[] {
  return [...problem.spaces].filter((space) => space.secondaryContinuity === "REQUIRED")
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function secondaryTasks<T extends Task>(tasks: T[], spaceId: string): T[] {
  return [...tasks].filter((task) => task.kind === "auxiliary" && task.spaceId === spaceId)
    .sort((a, b) => a.id.localeCompare(b.id));
}
export interface TemporalInterval { id:string; start:number; end:number }
function temporal<T extends TemporalInterval>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
}
export function secondaryStart<T extends TemporalInterval>(tasks: T[]): number | null { return temporal(tasks)[0]?.start ?? null; }
export function secondaryEnd<T extends TemporalInterval>(tasks: T[]): number | null { return temporal(tasks).at(-1)?.end ?? null; }
export function secondaryGapMinutes<T extends TemporalInterval>(tasks: T[]): number {
  const ordered = temporal(tasks);
  return ordered.slice(1).reduce((sum, task, index) => sum + Math.max(0, task.start - ordered[index]!.end), 0);
}
export function secondaryBlockCount<T extends TemporalInterval>(tasks: T[]): number {
  const ordered = temporal(tasks);
  if (!ordered.length) return 0;
  return 1 + ordered.slice(1).filter((task, index) => task.start !== ordered[index]!.end).length;
}
export function hasRequiredSecondaryContinuity<T extends TemporalInterval>(tasks: T[]): boolean {
  return tasks.length > 0 && secondaryGapMinutes(tasks) === 0 && secondaryBlockCount(tasks) === 1
    && temporal(tasks).slice(1).every((task, index) => task.start === temporal(tasks)[index]!.end);
}
