import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { CandidateAssignment } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { resolveORCTaskDependencyGraph } from "../state/dependencySemantics";

type TaskLike = NonNullable<EngineInput["tasks"]>[number] & Record<string, unknown>;
const min = (s?: string | null): number | null => /^\d{2}:\d{2}$/.test(String(s ?? "")) ? Number(String(s).slice(0,2))*60+Number(String(s).slice(3)) : null;
const hh = (m: number): string => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const hash = (v: unknown): string => createHash("sha256").update(stableStringify(v)).digest("hex");
const durationOf = (task: TaskLike | null | undefined): number => Number(task?.durationOverrideMin ?? task?.durationMin ?? task?.durationMinutes ?? task?.duration ?? 0) || 0;

export interface InitialConstructionDependencyTimeBound { taskId: number; time: string; minutes: number; edge: { fromTaskId: number; toTaskId: number; sourceTypes: readonly string[] }; readOnly: true }
export interface InitialConstructionProvisionallySatisfiedDependencyAudit { declaredSatisfiedTaskIds: number[]; actuallyAssignedTaskIds: number[]; declaredWithoutAssignmentTaskIds: number[]; coherent: boolean; fingerprint: string; readOnly: true }
export interface InitialConstructionDependencyTemporalBounds {
  earliestStart: string | null; latestEnd: string | null; assignedPrerequisiteTaskIds: number[]; assignedDependentTaskIds: number[];
  prerequisiteFinishBounds: InitialConstructionDependencyTimeBound[]; dependentStartBounds: InitialConstructionDependencyTimeBound[]; missingAssignmentTimeTaskIds: number[];
  hasContradictoryBounds: boolean; provisionallySatisfiedDependencyAudit: InitialConstructionProvisionallySatisfiedDependencyAudit; fingerprint: string; readOnly: true;
}

export function resolveInitialConstructionDependencyTemporalBounds(args: { input: EngineInput; taskId: number; assignments: readonly (CandidateAssignment | any)[]; tasks?: Map<number, TaskLike> | ReadonlyMap<number, TaskLike>; provisionallySatisfiedTaskIds?: readonly number[] }): InitialConstructionDependencyTemporalBounds {
  const taskId = Number(args.taskId);
  const graph = resolveORCTaskDependencyGraph((args.input.tasks ?? []) as any);
  const byTask = new Map<number, any>();
  for (const a of [...(args.assignments ?? [])].sort((a:any,b:any)=>Number(a.taskId)-Number(b.taskId)||String(a.startPlanned).localeCompare(String(b.startPlanned)))) if (!byTask.has(Number(a.taskId))) byTask.set(Number(a.taskId), a);
  const assignedIds = [...byTask.keys()].sort((a,b)=>a-b);
  const declared = [...new Set((args.provisionallySatisfiedTaskIds ?? []).map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
  const declaredWithout = declared.filter((id)=>!byTask.has(id));
  const auditBase = { declaredSatisfiedTaskIds: declared, actuallyAssignedTaskIds: assignedIds, declaredWithoutAssignmentTaskIds: declaredWithout, coherent: declaredWithout.length === 0, readOnly: true as const };
  const audit = { ...auditBase, fingerprint: hash(auditBase) };
  const edgeByKey = new Map(graph.edges.map((e)=>[`${e.fromTaskId}->${e.toTaskId}`, e]));
  const missing = new Set<number>();
  const prereqBounds: InitialConstructionDependencyTimeBound[] = [];
  for (const id of graph.prerequisitesByTaskId.get(taskId) ?? []) {
    const a = byTask.get(id); if (!a) continue; const m = min(a.endPlanned ?? a.end); if (m == null) { missing.add(id); continue; }
    const e = edgeByKey.get(`${id}->${taskId}`)!; prereqBounds.push({ taskId:id, time:hh(m), minutes:m, edge:{fromTaskId:id,toTaskId:taskId,sourceTypes:e?.sourceTypes ?? []}, readOnly:true });
  }
  const depBounds: InitialConstructionDependencyTimeBound[] = [];
  for (const id of graph.dependentsByTaskId.get(taskId) ?? []) {
    const a = byTask.get(id); if (!a) continue; const m = min(a.startPlanned ?? a.start); if (m == null) { missing.add(id); continue; }
    const e = edgeByKey.get(`${taskId}->${id}`)!; depBounds.push({ taskId:id, time:hh(m), minutes:m, edge:{fromTaskId:taskId,toTaskId:id,sourceTypes:e?.sourceTypes ?? []}, readOnly:true });
  }
  prereqBounds.sort((a,b)=>a.taskId-b.taskId); depBounds.sort((a,b)=>a.taskId-b.taskId);
  const earliest = prereqBounds.length ? Math.max(...prereqBounds.map((b)=>b.minutes)) : null;
  const latest = depBounds.length ? Math.min(...depBounds.map((b)=>b.minutes)) : null;
  const task = args.tasks?.get(taskId) ?? (args.input.tasks ?? []).find((t:any)=>Number(t.id)===taskId) as TaskLike | undefined;
  const duration = durationOf(task);
  const base = { earliestStart: earliest == null ? null : hh(earliest), latestEnd: latest == null ? null : hh(latest), assignedPrerequisiteTaskIds: prereqBounds.map((b)=>b.taskId), assignedDependentTaskIds: depBounds.map((b)=>b.taskId), prerequisiteFinishBounds: prereqBounds, dependentStartBounds: depBounds, missingAssignmentTimeTaskIds: [...missing].sort((a,b)=>a-b), hasContradictoryBounds: earliest != null && latest != null && earliest + duration > latest, provisionallySatisfiedDependencyAudit: audit, readOnly: true as const };
  return deepFreeze({ ...base, fingerprint: hash(base) }) as any;
}

export function evaluateInitialConstructionCombinedDependencyCompatibility(args: { input: EngineInput; baseAssignments?: readonly (CandidateAssignment|any)[]; branchAssignments?: readonly (CandidateAssignment|any)[] }) {
  const graph = resolveORCTaskDependencyGraph((args.input.tasks ?? []) as any);
  const byTask = new Map<number, any>();
  for (const a of [...(args.baseAssignments ?? []), ...(args.branchAssignments ?? [])]) byTask.set(Number(a.taskId), a);
  const violations: any[] = [];
  for (const e of graph.edges) {
    const pre = byTask.get(e.fromTaskId), dep = byTask.get(e.toTaskId); if (!pre || !dep) continue;
    const end = min(pre.endPlanned ?? pre.end), start = min(dep.startPlanned ?? dep.start); if (end == null || start == null) continue;
    if (end > start) violations.push({ code:"DEPENDENCY_CONFLICT", subtype:"COMBINED_DEPENDENCY_PRECHECK", prerequisiteTaskId:e.fromTaskId, dependentTaskId:e.toTaskId, prerequisiteEnd:hh(end), dependentStart:hh(start), sourceTypes:e.sourceTypes, readOnly:true });
  }
  const base = { compatible: violations.length === 0, violationCount: violations.length, violations: violations.slice(0,10), checkedEdgeCount: graph.edges.filter(e=>byTask.has(e.fromTaskId)&&byTask.has(e.toTaskId)).length, readOnly:true as const };
  return deepFreeze({ ...base, fingerprint: hash(base) }) as any;
}
