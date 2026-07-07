import type { Candidate, OperationalState } from "../contracts";

const PROTECTED = new Set(["done", "in_progress"]);
const uniq = (xs: number[]) => [...new Set(xs.filter(Number.isFinite))].sort((a, b) => a - b);
const mins = (t?: string | null) => { const p = String(t ?? "").split(":").map(Number); return p.length === 2 && p.every(Number.isFinite) ? p[0] * 60 + p[1] : null; };
const deps = (task: any) => uniq([...(task?.dependsOnTaskIds ?? []), ...(task?.dependsOnTaskId != null ? [task.dependsOnTaskId] : [])]);

export interface ResolvedDirectDependencyBrokenPair {
  prerequisiteTaskId: number | null;
  dependentTaskId: number | null;
  prerequisiteProposedEnd: string | null;
  dependentProposedStart: string | null;
  dependencyDirectionResolved: boolean;
  violatedConstraint: "DIRECT_DEPENDENCY_BROKEN";
  reason: string;
  originalPrefilterReason?: string | null;
  affectedTaskIds: number[];
  readOnly: true;
}

export function resolveDirectDependencyBrokenPair(input: { affectedTaskIds?: readonly number[] | null; operationalState: OperationalState; candidate?: Candidate | null; previewPlanning?: readonly any[] | null; originalPrefilterReason?: string | null }): ResolvedDirectDependencyBrokenPair {
  const affected = uniq([...(input.affectedTaskIds ?? [])].map(Number));
  const [a, b] = affected;
  const tasks = new Map((input.operationalState.tasks ?? []).map((t: any) => [Number(t.id), t]));
  const candidateMoves = new Map((input.candidate?.assignments ?? []).map((m: any) => [Number(m.taskId), m]));
  const basePlan = new Map(((input.previewPlanning ?? input.operationalState.planning) ?? []).map((e: any) => [Number(e.taskId), e]));
  const timing = (taskId: number) => {
    const move = candidateMoves.get(taskId) as any;
    const plan = basePlan.get(taskId) as any;
    return { start: move?.startPlanned ?? plan?.startPlanned ?? null, end: move?.endPlanned ?? plan?.endPlanned ?? null };
  };
  const bDependsOnA = Number.isFinite(a) && Number.isFinite(b) && deps(tasks.get(b)).includes(a);
  const aDependsOnB = Number.isFinite(a) && Number.isFinite(b) && deps(tasks.get(a)).includes(b);
  const prerequisiteTaskId = bDependsOnA ? a : aDependsOnB ? b : (Number.isFinite(a) ? a : null);
  const dependentTaskId = bDependsOnA ? b : aDependsOnB ? a : (Number.isFinite(b) ? b : null);
  return {
    prerequisiteTaskId,
    dependentTaskId,
    prerequisiteProposedEnd: prerequisiteTaskId != null ? timing(prerequisiteTaskId).end : null,
    dependentProposedStart: dependentTaskId != null ? timing(dependentTaskId).start : null,
    dependencyDirectionResolved: bDependsOnA || aDependsOnB,
    violatedConstraint: "DIRECT_DEPENDENCY_BROKEN",
    reason: "downstream-dependent-would-start-before-moved-prerequisite",
    originalPrefilterReason: input.originalPrefilterReason ?? null,
    affectedTaskIds: [...(input.affectedTaskIds ?? [])].map(Number).filter(Number.isFinite),
    readOnly: true,
  };
}

export interface DownstreamDependencySafetyResult {
  safe: boolean;
  brokenDownstreamDependencyPairs: any[];
  downstreamDependentTaskIds: number[];
  downstreamDependentsMovedWithBundle: number[];
  downstreamDependentsLeftCompatible: number[];
  downstreamDependentsBlockingMove: number[];
  reasonCodes: string[];
}

export function validateProductionWaveDownstreamDependentsAfterTransform(input: { operationalState: OperationalState; proposedMoves: readonly { taskId: number; startPlanned?: string | null; endPlanned?: string | null }[]; movedTaskIds: readonly number[]; maxBundleSearchDepth: number; maxDependencyBundleSize: number }): DownstreamDependencySafetyResult {
  const tasks = new Map((input.operationalState.tasks ?? []).map((t: any) => [Number(t.id), t]));
  const planning = new Map((input.operationalState.planning ?? []).map((e: any) => [Number(e.taskId), e]));
  const moves = new Map(input.proposedMoves.map((m) => [Number(m.taskId), m]));
  const moved = new Set(uniq([...input.movedTaskIds].map(Number)));
  const reverse = new Map<number, number[]>();
  for (const task of tasks.values() as any) for (const dep of deps(task)) reverse.set(dep, [...(reverse.get(dep) ?? []), Number(task.id)]);
  const downstream = new Set<number>(); const queue = [...moved].map((id) => ({ id, depth: 0 })); const reasons = new Set<string>();
  while (queue.length) { const { id, depth } = queue.shift()!; if (depth >= input.maxBundleSearchDepth) { reasons.add("downstream-depth-limit-reached"); continue; } for (const d of reverse.get(id) ?? []) if (!downstream.has(d) && !moved.has(d)) { downstream.add(d); queue.push({ id: d, depth: depth + 1 }); } }
  if (downstream.size > input.maxDependencyBundleSize) reasons.add("downstream-bundle-budget-exceeded");
  const time = (id: number) => { const mv = moves.get(id); const pl = planning.get(id) as any; return { s: mins(mv?.startPlanned ?? pl?.startPlanned), e: mins(mv?.endPlanned ?? pl?.endPlanned), st: mv?.startPlanned ?? pl?.startPlanned ?? null, et: mv?.endPlanned ?? pl?.endPlanned ?? null }; };
  const broken: any[] = []; const left: number[] = []; const blocking: number[] = [];
  for (const prerequisiteId of moved) for (const dependentId of reverse.get(prerequisiteId) ?? []) {
    const pre = time(prerequisiteId), dep = time(dependentId);
    if (dep.s != null && pre.e != null && dep.s >= pre.e) { if (!moved.has(dependentId)) left.push(dependentId); continue; }
    if (!moved.has(dependentId)) {
      blocking.push(dependentId); reasons.add("downstream-dependent-would-start-before-moved-prerequisite");
      broken.push({ prerequisiteTaskId: prerequisiteId, dependentTaskId: dependentId, prerequisiteProposedEnd: pre.et, dependentProposedStart: dep.st, dependencyDirectionResolved: true, violatedConstraint: "DIRECT_DEPENDENCY_BROKEN", reason: "downstream-dependent-would-start-before-moved-prerequisite", affectedTaskIds: [prerequisiteId, dependentId], dependentMovable: !PROTECTED.has(String((tasks.get(dependentId) as any)?.status)) && !(input.operationalState.locks ?? []).some((l: any) => l.taskId === dependentId), readOnly: true });
    }
  }
  return { safe: broken.length === 0 && !reasons.has("downstream-bundle-budget-exceeded"), brokenDownstreamDependencyPairs: broken, downstreamDependentTaskIds: uniq([...downstream]), downstreamDependentsMovedWithBundle: uniq([...downstream].filter((id) => moved.has(id))), downstreamDependentsLeftCompatible: uniq(left), downstreamDependentsBlockingMove: uniq(blocking), reasonCodes: [...reasons].sort() };
}
