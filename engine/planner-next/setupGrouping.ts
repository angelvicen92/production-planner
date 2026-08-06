import type { PlannerNextProblem, ScheduledTask, SetupPolicy, Space, Task } from "./contracts";

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

/**
 * Explicit policies preserve the historical fixed order. Flexible policies
 * finish the active family before exposing every not-yet-started family as a
 * bounded search alternative. That keeps one block per family and forbids
 * reentry without selecting an order in the adapter.
 */
export function eligibleSetupTasksForPolicy<T extends Task>(
  pending: T[],
  scheduled: ScheduledTask[],
  policy: SetupPolicy,
): T[] {
  if (policy.flexibleFamilyOrder !== true) return eligibleSetupTasks(pending, policy.familyOrder);

  const lastFamily = scheduled.at(-1)?.setupFamilyId;
  if (lastFamily !== undefined && pending.some((task) => task.setupFamilyId === lastFamily)) {
    return [...pending].filter((task) => task.setupFamilyId === lastFamily).sort((a, b) => a.id.localeCompare(b.id));
  }

  const started = new Set(scheduled.flatMap((task) => task.setupFamilyId === undefined ? [] : [task.setupFamilyId]));
  const allowed = new Set(policy.familyOrder);
  return [...pending]
    .filter((task) => task.setupFamilyId !== undefined && allowed.has(task.setupFamilyId) && !started.has(task.setupFamilyId))
    .sort((left, right) => left.id.localeCompare(right.id));
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

export function followsSetupPolicy(tasks: ScheduledTask[], policy: SetupPolicy): boolean {
  if (policy.flexibleFamilyOrder !== true) return followsSetupOrder(tasks, policy.familyOrder);
  const sequence = setupFamilySequence(tasks);
  const allowed = new Set(policy.familyOrder);
  return sequence.length === policy.familyOrder.length
    && new Set(sequence).size === sequence.length
    && sequence.every((family) => allowed.has(family));
}
