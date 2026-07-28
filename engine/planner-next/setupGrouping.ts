import type { PlannerNextProblem, ScheduledTask, Space, Task } from "./contracts";

export function setupSpaces(problem: Pick<PlannerNextProblem, "spaces">): Space[] {
  return [...problem.spaces].filter((space) => space.setupPolicy !== undefined).sort((a, b) => a.id.localeCompare(b.id));
}
export function setupTasks<T extends Task>(tasks: T[], spaceId: string): T[] {
  return [...tasks].filter((task) => task.spaceId === spaceId).sort((a, b) => a.id.localeCompare(b.id));
}
export function activeSetupFamily(pending: Task[], familyOrder: string[]): string | undefined {
  return familyOrder.find((family) => pending.some((task) => task.setupFamilyId === family));
}
export function eligibleSetupTasks<T extends Task>(pending: T[], familyOrder: string[]): T[] {
  const active = activeSetupFamily(pending, familyOrder);
  return active === undefined ? [] : [...pending].filter((task) => task.setupFamilyId === active).sort((a, b) => a.id.localeCompare(b.id));
}
export function setupFamilySequence(tasks: ScheduledTask[]): string[] {
  const ordered = [...tasks].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  const sequence: string[] = [];
  for (const task of ordered) if (task.setupFamilyId && sequence.at(-1) !== task.setupFamilyId) sequence.push(task.setupFamilyId);
  return sequence;
}
export function setupBlockCounts(tasks: ScheduledTask[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const family of setupFamilySequence(tasks)) counts[family] = (counts[family] ?? 0) + 1;
  return counts;
}
export function setupSwitchCount(tasks: ScheduledTask[]): number { return Math.max(0, setupFamilySequence(tasks).length - 1); }
export function hasSetupReentry(tasks: ScheduledTask[]): boolean { const sequence = setupFamilySequence(tasks); return new Set(sequence).size !== sequence.length; }
export function followsSetupOrder(tasks: ScheduledTask[], familyOrder: string[]): boolean {
  return setupFamilySequence(tasks).every((family, index) => family === familyOrder[index]);
}
