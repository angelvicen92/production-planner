import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask, exactTaskStartDomain } from "./placement";

export interface DeferredPrerequisiteReservation {
  taskIds: readonly string[];
  witness: readonly ScheduledTask[];
}

export interface DeferredPrerequisiteReservationResult {
  feasible: boolean;
  reservation: DeferredPrerequisiteReservation | null;
  repaired: boolean;
  branchesExplored: number;
  exhausted: boolean;
}

const byId = <T extends { id: string }>(left: T, right: T) => left.id.localeCompare(right.id);

function pendingHardPredecessors(problem: PlannerNextProblem, pending: readonly Task[], placed: readonly ScheduledTask[]): Task[] {
  const pendingById = new Map(pending.map((task) => [task.id, task]));
  const result = new Set<string>();
  const visit = (id: string): void => {
    const task = problem.tasks.find((item) => item.id === id);
    for (const dependency of task?.dependencies ?? []) {
      if (!pendingById.has(dependency) || result.has(dependency)) continue;
      result.add(dependency);
      visit(dependency);
    }
  };
  for (const task of placed) visit(task.id);
  return [...result].map((id) => pendingById.get(id)!).sort(byId);
}

function predecessorDeadlines(problem: PlannerNextProblem, reserved: readonly Task[], placed: readonly ScheduledTask[]): Map<string, number> {
  const reservedIds = new Set(reserved.map(({ id }) => id));
  const placedById = new Map(placed.map((task) => [task.id, task]));
  const successors = new Map<string, string[]>();
  for (const task of problem.tasks) for (const dependency of task.dependencies)
    successors.set(dependency, [...(successors.get(dependency) ?? []), task.id]);
  const memo = new Map<string, number>();
  const deadline = (id: string, visiting = new Set<string>()): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return problem.day.end;
    const next = new Set(visiting).add(id);
    const limits = (successors.get(id) ?? []).flatMap((successorId) => {
      const fixed = placedById.get(successorId);
      if (fixed) return [fixed.start];
      if (!reservedIds.has(successorId)) return [];
      const successor = reserved.find((task) => task.id === successorId)!;
      return [deadline(successorId, next) - successor.duration];
    });
    const value = Math.min(problem.day.end, ...limits);
    memo.set(id, value);
    return value;
  };
  for (const task of reserved) deadline(task.id);
  return memo;
}

function witnessStillValid(problem: PlannerNextProblem, tasks: readonly Task[], witness: readonly ScheduledTask[],
  placed: readonly ScheduledTask[], meals: readonly ScheduledSpaceMeal[], deadlines: ReadonlyMap<string, number>): boolean {
  const witnessIds = new Set(tasks.map(({ id }) => id));
  if (witness.length !== tasks.length || witness.some((item) => !witnessIds.has(item.id))) return false;
  for (const scheduled of witness) {
    const task = tasks.find(({ id }) => id === scheduled.id)!;
    if (scheduled.end > (deadlines.get(task.id) ?? problem.day.end)) return false;
    const others = [...placed, ...witness.filter(({ id }) => id !== scheduled.id)];
    if (!canPlaceTask(problem, task, scheduled.start, others, [...meals])) return false;
  }
  return true;
}

/**
 * Maintains a non-materialized, branch-local existence witness for flexible hard
 * predecessors. Candidate starts are accounted by the caller's exact ledger.
 */
export function maintainDeferredPrerequisiteReservation(problem: PlannerNextProblem, pending: readonly Task[],
  placed: readonly ScheduledTask[], meals: readonly ScheduledSpaceMeal[], previous: DeferredPrerequisiteReservation | null,
  consume: () => boolean): DeferredPrerequisiteReservationResult {
  const tasks = pendingHardPredecessors(problem, pending, placed);
  if (!tasks.length) return { feasible: true, reservation: { taskIds: [], witness: [] }, repaired: false, branchesExplored: 0, exhausted: false };
  const deadlines = predecessorDeadlines(problem, tasks, placed);
  const taskIds = tasks.map(({ id }) => id);
  const reusable = previous && JSON.stringify(previous.taskIds) === JSON.stringify(taskIds)
    && witnessStillValid(problem, tasks, previous.witness, placed, meals, deadlines);
  if (reusable) return { feasible: true, reservation: previous, repaired: false, branchesExplored: 0, exhausted: false };
  let branchesExplored = 0, exhausted = false;
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const reservedIds = new Set(taskIds);
  const search = (remaining: readonly Task[], witness: readonly ScheduledTask[]): ScheduledTask[] | null => {
    if (!remaining.length) return [...witness];
    const ready = remaining.filter((task) => task.dependencies
      .filter((id) => reservedIds.has(id)).every((id) => witness.some((item) => item.id === id)));
    if (!ready.length) return null;
    const choices = ready.map((task) => ({ task, starts: [...exactTaskStartDomain(problem, task, [...placed, ...witness], [...meals]).starts()]
      .filter((start) => start + task.duration <= (deadlines.get(task.id) ?? problem.day.end)).sort((a, b) => b - a) }))
      .sort((left, right) => left.starts.length - right.starts.length || left.task.id.localeCompare(right.task.id));
    const choice = choices[0]!;
    for (const start of choice.starts) {
      if (!consume()) { exhausted = true; return null; }
      branchesExplored += 1;
      if (!canPlaceTask(problem, choice.task, start, [...placed, ...witness], [...meals])) continue;
      const scheduled: ScheduledTask = { ...taskById.get(choice.task.id)!, start, end: start + choice.task.duration };
      const found = search(remaining.filter(({ id }) => id !== choice.task.id), [...witness, scheduled]);
      if (found || exhausted) return found;
    }
    return null;
  };
  const witness = search(tasks, []);
  return { feasible: witness !== null, reservation: witness ? { taskIds, witness: witness.sort(byId) } : null,
    repaired: previous !== null, branchesExplored, exhausted };
}
