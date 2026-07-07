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

export interface ProductionWaveBundleDependencyTransformMove {
  taskId: number;
  startPlanned: string;
  endPlanned: string;
}

export interface ProductionWaveTransformedDependencyPair {
  dependentTaskId: number;
  prerequisiteTaskId: number;
  dependentProposedStart: string | null;
  prerequisiteProposedEnd: string | null;
  minDelayMinutes: number | null;
  violatedConstraint: "DIRECT_DEPENDENCY_BROKEN";
  dependencyDirectionResolved: true;
  reason: string;
  affectedTaskIds: number[];
  readOnly: true;
}

export interface ProductionWaveBundleDependencyTransformValidationInput {
  operationalState: OperationalState;
  proposedMoves: ProductionWaveBundleDependencyTransformMove[];
  includedTaskIds: number[];
  maxBundleSearchDepth: number;
  maxDependencyBundleSize: number;
}

export interface ProductionWaveBundleDependencyTransformValidationResult {
  complete: boolean;
  brokenDependencyPairs: ProductionWaveTransformedDependencyPair[];
  missingDependencyTaskIds: number[];
  leftInPlaceCompatibleTaskIds: number[];
  includedTaskIds: number[];
  movedTaskIds: number[];
  blockedByProtectedTaskIds: number[];
  blockedByBudgetTaskIds: number[];
  blockedByDepthTaskIds: number[];
  reasonCodes: string[];
}

const minutes = (t?: string | null) => {
  const parts = String(t ?? "").split(":").map(Number);
  return parts.length === 2 && parts.every(Number.isFinite) ? parts[0] * 60 + parts[1] : null;
};

export function validateProductionWaveBundleDependencyClosureAfterTransform(
  input: ProductionWaveBundleDependencyTransformValidationInput,
): ProductionWaveBundleDependencyTransformValidationResult {
  const state = input.operationalState;
  const tasks = new Map((state.tasks ?? []).map((t: any) => [Number(t.id), t]));
  const planning = new Map((state.planning ?? []).map((e: any) => [Number(e.taskId), e]));
  const moveByTaskId = new Map(input.proposedMoves.map((m) => [Number(m.taskId), m]));
  const included = new Set(uniq(input.includedTaskIds));
  const moved = new Set(uniq(input.proposedMoves.map((m) => Number(m.taskId))));
  const broken: ProductionWaveTransformedDependencyPair[] = [];
  const missing = new Set<number>();
  const leftCompatible = new Set<number>();
  const protectedIds = new Set<number>();
  const budgetIds = new Set<number>();
  const depthIds = new Set<number>();
  const reasonCodes = new Set<string>();

  if (included.size > input.maxDependencyBundleSize) {
    for (const id of [...included].slice(input.maxDependencyBundleSize)) budgetIds.add(id);
    reasonCodes.add("dependency-bundle-budget-exceeded");
  }

  const timing = (taskId: number) => {
    const move = moveByTaskId.get(taskId);
    const planned = planning.get(taskId) as any;
    return {
      start: minutes(move?.startPlanned ?? planned?.startPlanned),
      end: minutes(move?.endPlanned ?? planned?.endPlanned),
      startText: move?.startPlanned ?? planned?.startPlanned ?? null,
      endText: move?.endPlanned ?? planned?.endPlanned ?? null,
    };
  };

  for (const dependentId of included) {
    const task = tasks.get(dependentId);
    if (!task) {
      missing.add(dependentId);
      reasonCodes.add("missing-dependency-task");
      continue;
    }
    for (const prerequisiteId of deps(task)) {
      const prerequisite = tasks.get(prerequisiteId);
      if (!prerequisite || !planning.has(prerequisiteId)) {
        missing.add(prerequisiteId);
        reasonCodes.add("dependency-closure-incomplete");
      }
      if (!included.has(prerequisiteId)) {
        const preTiming = timing(prerequisiteId);
        const depTiming = timing(dependentId);
        if (preTiming.end != null && depTiming.start != null && preTiming.end <= depTiming.start) {
          leftCompatible.add(prerequisiteId);
          continue;
        }
        missing.add(prerequisiteId);
        if (prerequisite && isProtected(prerequisiteId, prerequisite, state)) {
          protectedIds.add(prerequisiteId);
          reasonCodes.add("protected-prerequisite");
        } else {
          reasonCodes.add("prerequisite-not-movable");
        }
      }
      const preTiming = timing(prerequisiteId);
      const depTiming = timing(dependentId);
      if (preTiming.end == null || depTiming.start == null || preTiming.end > depTiming.start) {
        reasonCodes.add("transformed-dependency-broken");
        broken.push({
          dependentTaskId: dependentId,
          prerequisiteTaskId: prerequisiteId,
          dependentProposedStart: depTiming.startText,
          prerequisiteProposedEnd: preTiming.endText,
          minDelayMinutes: preTiming.end != null && depTiming.start != null ? Math.max(0, preTiming.end - depTiming.start) : null,
          violatedConstraint: "DIRECT_DEPENDENCY_BROKEN",
          dependencyDirectionResolved: true,
          reason: "transformed_dependency_broken",
          affectedTaskIds: [dependentId, prerequisiteId],
          readOnly: true,
        });
      }
    }
  }

  const complete = broken.length === 0 && missing.size === 0 && protectedIds.size === 0 && budgetIds.size === 0 && depthIds.size === 0;
  if (!complete) reasonCodes.add("dependency-closure-incomplete");
  return {
    complete,
    brokenDependencyPairs: broken,
    missingDependencyTaskIds: uniq([...missing]),
    leftInPlaceCompatibleTaskIds: uniq([...leftCompatible]),
    includedTaskIds: uniq([...included]),
    movedTaskIds: uniq([...moved]),
    blockedByProtectedTaskIds: uniq([...protectedIds]),
    blockedByBudgetTaskIds: uniq([...budgetIds]),
    blockedByDepthTaskIds: uniq([...depthIds]),
    reasonCodes: [...reasonCodes].sort(),
  };
}
