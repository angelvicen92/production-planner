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
/** Physical occupancy collapses only demonstrably synchronized members of the same joint operation. */
export function secondaryPhysicalOccupations<T extends TemporalInterval & {jointGroupId?:string}>(tasks:T[]):T[] {
  const ordered=temporal(tasks), seen=new Set<string>();
  return ordered.filter(task=>{
    if(!task.jointGroupId)return true;
    const members=ordered.filter(candidate=>candidate.jointGroupId===task.jointGroupId);
    if(members.length<2||members.some(candidate=>candidate.start!==task.start||candidate.end!==task.end))return true;
    const key=`${task.jointGroupId}\0${task.start}\0${task.end}`;
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
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
