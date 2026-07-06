import type { OperationalState } from "../contracts";

type Rec = Record<string, any>;
const PROTECTED = new Set(["done", "in_progress"]);
const uniq = (xs: number[]) => [...new Set(xs.filter(Number.isFinite))].sort((a, b) => a - b);
const deps = (task: any) => uniq([...(task?.dependsOnTaskIds ?? []), ...(task?.dependsOnTaskId != null ? [task.dependsOnTaskId] : [])]);
const isProtected = (taskId: number, task: any, state: OperationalState) => PROTECTED.has(String(task?.status)) || (state.locks ?? []).some((l: any) => l.taskId === taskId);

export type ProductionWaveDependencyRole = "main" | "prerequisite" | "support" | "resource_blocker";
export interface ProductionWaveDependencyClosureInput {
  operationalState: OperationalState;
  initialTaskIds: number[];
  mainTaskIds?: number[];
  supportTaskIds?: number[];
  resourceBlockerTaskIds?: number[];
  maxBundleSearchDepth: number;
  maxDependencyBundleSize: number;
}
export interface ProductionWaveDependencyClosureResult {
  includedTaskIds: number[];
  mainTaskIds: number[];
  prerequisiteTaskIds: number[];
  supportTaskIds: number[];
  resourceBlockerTaskIds: number[];
  excludedTaskIds: number[];
  blockedByTaskIds: number[];
  brokenDependencyPairs: Array<{ taskId: number; dependsOnTaskId: number; reason: string; depth: number; readOnly: true }>;
  dependencyDepthByTaskId: Record<string, number>;
  dependencyRoleByTaskId: Record<string, ProductionWaveDependencyRole>;
  depthReached: number;
  truncatedByBudget: boolean;
  dependencyClosureComplete: boolean;
  hardBlockers: string[];
  warnings: string[];
  missingDependencyTaskIds: number[];
}

export function buildProductionWaveDependencyClosure(input: ProductionWaveDependencyClosureInput): ProductionWaveDependencyClosureResult {
  const state = input.operationalState;
  const tasks = new Map((state.tasks ?? []).map((t: any) => [Number(t.id), t]));
  const planned = new Set((state.planning ?? []).map((e: any) => Number(e.taskId)).filter(Number.isFinite));
  const main = new Set(uniq(input.mainTaskIds ?? []));
  const support = new Set(uniq(input.supportTaskIds ?? []));
  const blockers = new Set(uniq(input.resourceBlockerTaskIds ?? []));
  const included = new Set<number>();
  const excluded = new Set<number>();
  const blockedBy = new Set<number>();
  const missing = new Set<number>();
  const broken: ProductionWaveDependencyClosureResult["brokenDependencyPairs"] = [];
  const hard = new Set<string>();
  const warnings = new Set<string>();
  const depthBy = new Map<number, number>();
  const roleBy = new Map<number, ProductionWaveDependencyRole>();
  let depthReached = 0;
  let truncatedByBudget = false;
  const queue = uniq(input.initialTaskIds).map((taskId) => ({ taskId, depth: main.has(taskId) ? 0 : 1, parentTaskId: null as number | null }));
  for (const id of main) roleBy.set(id, "main");
  for (const id of support) roleBy.set(id, "support");
  for (const id of blockers) roleBy.set(id, "resource_blocker");

  while (queue.length) {
    const item = queue.shift()!;
    const task = tasks.get(item.taskId);
    depthReached = Math.max(depthReached, item.depth);
    if (!task || !planned.has(item.taskId)) {
      excluded.add(item.taskId); missing.add(item.taskId); hard.add("missing_transitive_prerequisite");
      if (item.parentTaskId != null) broken.push({ taskId: item.parentTaskId, dependsOnTaskId: item.taskId, reason: "missing_transitive_prerequisite", depth: item.depth, readOnly: true });
      continue;
    }
    if (isProtected(item.taskId, task, state)) {
      excluded.add(item.taskId); blockedBy.add(item.taskId); hard.add("protected_prerequisite");
      if (item.parentTaskId != null) broken.push({ taskId: item.parentTaskId, dependsOnTaskId: item.taskId, reason: "protected_prerequisite", depth: item.depth, readOnly: true });
      continue;
    }
    if (!included.has(item.taskId) && included.size + 1 > input.maxDependencyBundleSize) {
      truncatedByBudget = true; excluded.add(item.taskId); blockedBy.add(item.taskId); hard.add("dependency_bundle_budget_exceeded");
      if (item.parentTaskId != null) broken.push({ taskId: item.parentTaskId, dependsOnTaskId: item.taskId, reason: "dependency_bundle_budget_exceeded", depth: item.depth, readOnly: true });
      continue;
    }
    included.add(item.taskId);
    depthBy.set(item.taskId, Math.min(depthBy.get(item.taskId) ?? item.depth, item.depth));
    if (!roleBy.has(item.taskId)) roleBy.set(item.taskId, main.has(item.taskId) ? "main" : "prerequisite");
    for (const depId of deps(task)) {
      if (included.has(depId)) continue;
      const nextDepth = item.depth + 1;
      if (nextDepth > input.maxBundleSearchDepth) {
        excluded.add(depId); blockedBy.add(depId); hard.add("dependency_depth_limit_reached");
        broken.push({ taskId: item.taskId, dependsOnTaskId: depId, reason: "dependency_depth_limit_reached", depth: nextDepth, readOnly: true });
        continue;
      }
      queue.push({ taskId: depId, depth: nextDepth, parentTaskId: item.taskId });
    }
  }
  if (truncatedByBudget) warnings.add("dependency_bundle_budget_exceeded");
  const roleObj: Record<string, ProductionWaveDependencyRole> = {};
  for (const [id, role] of roleBy) if (included.has(id)) roleObj[String(id)] = role;
  const depthObj: Record<string, number> = {};
  for (const [id, depth] of depthBy) if (included.has(id)) depthObj[String(id)] = depth;
  const includedIds = uniq([...included]);
  return {
    includedTaskIds: includedIds,
    mainTaskIds: includedIds.filter((id) => roleObj[String(id)] === "main"),
    prerequisiteTaskIds: includedIds.filter((id) => roleObj[String(id)] === "prerequisite"),
    supportTaskIds: includedIds.filter((id) => roleObj[String(id)] === "support"),
    resourceBlockerTaskIds: includedIds.filter((id) => roleObj[String(id)] === "resource_blocker"),
    excludedTaskIds: uniq([...excluded]), blockedByTaskIds: uniq([...blockedBy]), brokenDependencyPairs: broken,
    dependencyDepthByTaskId: depthObj, dependencyRoleByTaskId: roleObj, depthReached, truncatedByBudget,
    dependencyClosureComplete: broken.length === 0 && !truncatedByBudget,
    hardBlockers: [...hard].sort(), warnings: [...warnings].sort(), missingDependencyTaskIds: uniq([...missing, ...broken.map((p) => p.dependsOnTaskId)]),
  };
}
