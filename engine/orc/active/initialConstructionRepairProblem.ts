import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";

const uniq = (xs: readonly number[]) => [...new Set(xs.filter(Number.isFinite))].sort((a,b)=>a-b);
const combinations = (items: number[], size: number): number[][] => {
  const out: number[][] = [];
  const walk = (start: number, acc: number[]) => {
    if (acc.length === size) { out.push([...acc]); return; }
    for (let i=start; i<items.length; i++) walk(i+1, [...acc, items[i]]);
  };
  walk(0, []);
  return out;
};

export interface InitialConstructionRepairEjectionSet { readonly ejectedTaskIds: readonly number[]; readonly repairDependencyClosureTaskIds: readonly number[]; readonly fingerprint: string; readonly readOnly: true }
export interface InitialConstructionRepairProblem {
  readonly residualFingerprint: string; readonly blockedAnchorTaskId: number; readonly blockedAnchorRank: number | null; readonly blockedAnchorClosureTaskIds: readonly number[];
  readonly directConflictTaskIds: readonly number[]; readonly dependencyConflictTaskIds: readonly number[]; readonly candidateEjectionSets: readonly InitialConstructionRepairEjectionSet[];
  readonly protectedTaskIds: readonly number[]; readonly immutableTaskIds: readonly number[]; readonly maximumEjectionDepth: number; readonly fingerprint: string; readonly readOnly: true;
}

function taskDeps(input: EngineInput): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const t of input.tasks ?? []) {
    const ids = uniq([...(t as any).dependsOnTaskIds ?? [], ...(t as any).dependencyTaskIds ?? [], ...(t as any).prerequisiteTaskIds ?? [], ...((t as any).dependencies ?? []).map((d:any)=>Number(d?.taskId ?? d?.fromTaskId ?? d))]);
    map.set(Number((t as any).id), ids);
  }
  return map;
}

export function resolveInitialConstructionImmutableTaskIds(args: { input: EngineInput; originOperationalState: OperationalState; protectedTaskIds?: readonly number[] }): number[] {
  const out = new Set<number>(args.protectedTaskIds ?? []);
  for (const t of args.input.tasks ?? []) if (["done", "in_progress"].includes(String((t as any).status))) out.add(Number((t as any).id));
  for (const l of (args.input as any).locks ?? []) out.add(Number(l.taskId ?? l.task_id ?? l.id));
  for (const p of args.originOperationalState.planning ?? []) out.add(Number((p as any).taskId));
  return uniq([...out]);
}

export function repairDependencyClosure(args: { input: EngineInput; seedTaskIds: readonly number[]; provisionalAssignmentTaskIds: readonly number[] }): number[] {
  const deps = taskDeps(args.input);
  const provisional = new Set(args.provisionalAssignmentTaskIds.map(Number));
  const closure = new Set(args.seedTaskIds.map(Number).filter((id)=>provisional.has(id)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [taskId, prereqs] of deps) {
      if (!provisional.has(taskId) || closure.has(taskId)) continue;
      if (prereqs.some((id)=>closure.has(id))) { closure.add(taskId); changed = true; }
    }
  }
  return uniq([...closure]);
}

export function buildInitialConstructionRepairProblem(args: { input: EngineInput; originOperationalState: OperationalState; residualFingerprint: string; blockedAnchorTaskId: number; blockedAnchorRank?: number | null; blockedAnchorClosureTaskIds?: readonly number[]; terminalEvidence?: any; provisionalAssignments: readonly CandidateAssignment[]; protectedTaskIds?: readonly number[]; maxEjectedAssignments?: number; maxRepairNeighborhoodTasks?: number }): InitialConstructionRepairProblem {
  const maxDepth = args.maxEjectedAssignments ?? 4;
  const maxNeighborhood = args.maxRepairNeighborhoodTasks ?? 12;
  const provisionalIds = uniq(args.provisionalAssignments.map(a=>Number(a.taskId)));
  const immutable = resolveInitialConstructionImmutableTaskIds(args);
  const immutableSet = new Set(immutable);
  const ev = args.terminalEvidence ?? {};
  const details = Array.isArray(ev.taskWindowConflictDetails) ? ev.taskWindowConflictDetails : [];
  const direct = uniq([
    ...(ev.contestantConflictTaskIds ?? []), ...(ev.spaceConflictTaskIds ?? []), ...(ev.resourceConflictTaskIds ?? []),
    ...details.flatMap((d:any)=>[...(d.conflictTaskIds ?? []), d.taskId].filter((id:any)=>Number(id)!==Number(args.blockedAnchorTaskId))).map(Number),
  ].filter((id)=>provisionalIds.includes(Number(id)) && !immutableSet.has(Number(id))));
  const dep = uniq([...(ev.dependencyLowerBoundTaskIds ?? []), ...(ev.dependencyUpperBoundTaskIds ?? [])].map(Number).filter((id)=>provisionalIds.includes(id) && !immutableSet.has(id)));
  const related = uniq([...direct, ...dep]);
  const candidateEjectionSets: InitialConstructionRepairEjectionSet[] = [];
  for (let depth=1; depth<=maxDepth; depth++) {
    for (const combo of combinations(related, depth)) {
      const closure = repairDependencyClosure({ input: args.input, seedTaskIds: combo, provisionalAssignmentTaskIds: provisionalIds });
      const neighborhood = uniq([Number(args.blockedAnchorTaskId), ...(args.blockedAnchorClosureTaskIds ?? []), ...closure]);
      if (closure.length === 0 || neighborhood.length > maxNeighborhood || closure.some((id)=>immutableSet.has(id))) continue;
      const fingerprint = createHash("sha256").update(stableStringify({ combo, closure })).digest("hex");
      candidateEjectionSets.push({ ejectedTaskIds: combo, repairDependencyClosureTaskIds: closure, fingerprint, readOnly: true });
    }
  }
  const payload = { residualFingerprint: args.residualFingerprint, blockedAnchorTaskId: Number(args.blockedAnchorTaskId), direct, dep, sets: candidateEjectionSets.map(s=>({e:s.ejectedTaskIds,c:s.repairDependencyClosureTaskIds})) };
  return deepFreeze({ residualFingerprint: args.residualFingerprint, blockedAnchorTaskId: Number(args.blockedAnchorTaskId), blockedAnchorRank: args.blockedAnchorRank ?? null, blockedAnchorClosureTaskIds: uniq(args.blockedAnchorClosureTaskIds ?? [Number(args.blockedAnchorTaskId)]), directConflictTaskIds: direct, dependencyConflictTaskIds: dep, candidateEjectionSets, protectedTaskIds: uniq(args.protectedTaskIds ?? []), immutableTaskIds: immutable, maximumEjectionDepth: maxDepth, fingerprint: createHash("sha256").update(stableStringify(payload)).digest("hex"), readOnly: true });
}
