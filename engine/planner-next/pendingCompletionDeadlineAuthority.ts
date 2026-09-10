import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { exactTaskStartDomain } from "./placement";

export interface PendingCompletionDeadlineAuthority {
  pendingById: ReadonlyMap<string, Task>;
  completionDeadline(taskId: string): number;
}

/**
 * Necessary-only deadline propagation over optimistic pending domains.
 *
 * Pending tasks are never placed against each other here.  Their own bound is
 * the latest start admitted by the canonical hard domain against fixed work,
 * plus duration. Successor bounds can only tighten that completion bound.
 */
export function createPendingCompletionDeadlineAuthority(problem: PlannerNextProblem, pending: readonly Task[],
  placed: readonly ScheduledTask[], meals: readonly ScheduledSpaceMeal[] = [],
  terminalStartBounds: ReadonlyMap<string, number> = new Map()): PendingCompletionDeadlineAuthority {
  const pendingById = new Map([...pending].sort((a, b) => a.id.localeCompare(b.id)).map((task) => [task.id, task]));
  const placedById = new Map(placed.map((task) => [task.id, task]));
  const successors = new Map<string, string[]>();
  for (const task of [...problem.tasks].sort((a, b) => a.id.localeCompare(b.id))) for (const dependency of task.dependencies)
    successors.set(dependency, [...(successors.get(dependency) ?? []), task.id].sort());

  // Cyclic precedence has no conclusive recursive deadline. Keep only each
  // member's independently safe own-domain bound and do not propagate through it.
  const cycleIds = new Set<string>(), visited = new Set<string>(), stack: string[] = [], active = new Set<string>();
  const findCycles = (id: string): void => {
    if (active.has(id)) { for (const member of stack.slice(stack.indexOf(id))) cycleIds.add(member); return; }
    if (visited.has(id)) return;
    visited.add(id); active.add(id); stack.push(id);
    for (const successor of successors.get(id) ?? []) if (pendingById.has(successor)) findCycles(successor);
    stack.pop(); active.delete(id);
  };
  for (const id of pendingById.keys()) findCycles(id);

  const own = new Map<string, number>();
  const ownLatestCompletion = (task: Task): number => {
    const cached = own.get(task.id); if (cached !== undefined) return cached;
    const domain = exactTaskStartDomain(problem, task, [...placed], [...meals]);
    let latestStart: number | undefined;
    for (let index = domain.intervals.length - 1; index >= 0; index--) {
      const interval = domain.intervals[index]!;
      const candidate = problem.day.start + Math.floor((interval.end - problem.day.start) / 5) * 5;
      if (candidate >= interval.start) { latestStart = candidate; break; }
    }
    // Empty/unknown authority abstains rather than manufacturing a deadline;
    // zero-domain pruning remains owned by the forward checker.
    const value = latestStart === undefined ? problem.day.end : latestStart + task.duration;
    own.set(task.id, value); return value;
  };

  const memo = new Map<string, number>();
  const completionDeadline = (id: string): number => {
    const cached = memo.get(id); if (cached !== undefined) return cached;
    const task = pendingById.get(id); if (!task) return problem.day.end;
    const limits = [ownLatestCompletion(task)];
    if (!cycleIds.has(id)) for (const successorId of successors.get(id) ?? []) {
      const fixed = placedById.get(successorId);
      if (fixed) limits.push(fixed.start);
      else if (terminalStartBounds.has(successorId)) limits.push(terminalStartBounds.get(successorId)!);
      else {
        const successor = pendingById.get(successorId);
        if (successor && !cycleIds.has(successor)) limits.push(completionDeadline(successorId) - successor.duration);
      }
    }
    const value = Math.min(...limits); memo.set(id, value); return value;
  };
  return { pendingById, completionDeadline };
}
