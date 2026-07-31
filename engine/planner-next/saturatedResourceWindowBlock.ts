import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task, Window } from "./contracts";
import { canPlaceTask } from "./placement";
import { getTechnicalChains } from "./technicalChains";

export interface SaturatedResourceWindowBlock {
  key: string;
  taskIds: string[];
  resourceIds: string[];
  window: Window;
  tasks: Task[];
}

export interface SaturatedResourceWindowCandidate { tasks: ScheduledTask[]; order: string[] }
export interface SaturatedResourceWindowConstruction {
  candidates: SaturatedResourceWindowCandidate[];
  branchesExplored: number;
  exhausted: boolean;
}

const canonicalIds = (ids: string[]) => [...new Set(ids)].sort();
const windowKey = (window: Window) => `${window.start}-${window.end}`;

export function saturatedResourceWindowBlockKey(resourceIds: string[], window: Window, taskIds: string[]): string {
  return `resource-window:${canonicalIds(resourceIds).join(",")}:${windowKey(window)}:${canonicalIds(taskIds).join(",")}`;
}

/** Derives exact-fit, shared-resource cohorts exclusively from the effective problem. */
export function deriveSaturatedResourceWindowBlocks(problem: PlannerNextProblem, pending: Task[], placed: ScheduledTask[]): SaturatedResourceWindowBlock[] {
  const placedIds = new Set(placed.map(({ id }) => id));
  const technicalChainIds = new Set(getTechnicalChains(problem.tasks).flat().map(({ id }) => id));
  const accompanimentIds = new Set((problem.anchoredAccompaniments ?? []).flatMap((item) => [...item.beforeTaskIds, ...item.afterTaskIds]));
  const resourceById = new Map(problem.resources.map((resource) => [resource.id, resource]));
  const groups = new Map<string, Task[]>();
  for (const task of [...pending].sort((a, b) => a.id.localeCompare(b.id))) {
    if (task.kind !== "auxiliary" || task.jointGroupId !== undefined || technicalChainIds.has(task.id)
      || accompanimentIds.has(task.id) || placedIds.has(task.id) || task.requiredResourceIds?.length === 0
      || task.requiredResourceIds === undefined || task.availability?.length !== 1) continue;
    const resourceIds = canonicalIds(task.requiredResourceIds);
    if (resourceIds.length !== task.requiredResourceIds.length || resourceIds.some((id) => !resourceById.has(id))) continue;
    const window = task.availability[0]!;
    const key = `${resourceIds.join(",")}|${windowKey(window)}`;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  const blocks: SaturatedResourceWindowBlock[] = [];
  const claimed = new Set<string>();
  for (const tasks of [...groups.values()].sort((a, b) => a.map(x => x.id).join().localeCompare(b.map(x => x.id).join()))) {
    const window = tasks[0]!.availability![0]!;
    const resourceIds = canonicalIds(tasks[0]!.requiredResourceIds!);
    if (tasks.length < 2 || tasks.some(({ id }) => claimed.has(id))
      || tasks.reduce((sum, task) => sum + task.duration, 0) !== window.end - window.start
      || resourceIds.some((id) => !resourceById.get(id)!.availability.some((available) => available.start <= window.start && window.end <= available.end))) continue;
    const taskIds = tasks.map(({ id }) => id).sort();
    taskIds.forEach((id) => claimed.add(id));
    blocks.push({ key: saturatedResourceWindowBlockKey(resourceIds, window, taskIds), taskIds, resourceIds, window: { ...window }, tasks: [...tasks].sort((a, b) => a.id.localeCompare(b.id)) });
  }
  return blocks.sort((a, b) => a.key.localeCompare(b.key));
}

/** Enumerates only complete, hard-placeable orders; partial states never escape. */
export function constructSaturatedResourceWindowBlockCandidates(problem: PlannerNextProblem, block: SaturatedResourceWindowBlock, placed: ScheduledTask[], branchAllowance: number, scheduledSpaceMeals: ScheduledSpaceMeal[] = []): SaturatedResourceWindowConstruction {
  const candidates: SaturatedResourceWindowCandidate[] = [];
  const seen = new Set<string>();
  let branchesExplored = 0;
  const constraintCount = (task: Task) => task.dependencies.length + (task.requiredResourceIds?.length ?? 0) + (task.availability?.length ?? 0) + (task.participantId === undefined ? 0 : 1);
  const continuationCount = (task: Task, cursor: number, scheduled: ScheduledTask[]) => canPlaceTask(problem, task, cursor, [...placed, ...scheduled], scheduledSpaceMeals) ? 1 : 0;
  const visit = (remaining: Task[], cursor: number, scheduled: ScheduledTask[]): boolean => {
    if (remaining.length === 0) {
      if (cursor !== block.window.end) return false;
      const order = scheduled.map(({ id }) => id); const signature = order.join("|");
      if (!seen.has(signature)) { seen.add(signature); candidates.push({ tasks: scheduled, order }); }
      return false;
    }
    const ordered = [...remaining].sort((a, b) => continuationCount(a, cursor, scheduled) - continuationCount(b, cursor, scheduled)
      || b.duration - a.duration || constraintCount(b) - constraintCount(a) || a.id.localeCompare(b.id));
    for (const task of ordered) {
      if (branchesExplored >= branchAllowance) return true;
      branchesExplored += 1;
      if (cursor + task.duration > block.window.end || !canPlaceTask(problem, task, cursor, [...placed, ...scheduled], scheduledSpaceMeals)) continue;
      const next: ScheduledTask = { ...task, start: cursor, end: cursor + task.duration };
      if (visit(remaining.filter(({ id }) => id !== task.id), next.end, [...scheduled, next])) return true;
    }
    return false;
  };
  const exhausted = visit(block.tasks, block.window.start, []);
  candidates.sort((a, b) => a.order.join("|").localeCompare(b.order.join("|")));
  return { candidates, branchesExplored, exhausted };
}
