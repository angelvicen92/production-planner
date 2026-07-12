import type { TaskInput } from "../../types";

const nums = (v: unknown): number[] => Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : v != null ? [Number(v)].filter(Number.isFinite) : [];
const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
const key = (from: number, to: number) => `${from}->${to}`;
const validSubject = (v: unknown) => v != null && Number.isFinite(Number(v)) && Number(v) > 0;
const sameSubject = (a: TaskInput, b: TaskInput) =>
  (validSubject(a.contestantId) && validSubject(b.contestantId) && Number(a.contestantId) === Number(b.contestantId)) ||
  (validSubject((a as any).itinerantTeamId) && validSubject((b as any).itinerantTeamId) && Number((a as any).itinerantTeamId) === Number((b as any).itinerantTeamId));

export interface ORCDependencyEdge { fromTaskId: number; toTaskId: number; sourceTypes: string[]; readOnly: true }
export interface ORCDependencyIssue { kind: "missing_explicit_task_dependency" | "non_applicable_template_dependency"; taskId: number; prerequisiteTaskId?: number; templateId?: number; readOnly: true }
export interface ORCDependencyCycle { taskIds: number[]; edgePath: number[]; sourceTypes: string[]; readOnly: true }
export interface ORCDependencyGraphResolution {
  prerequisitesByTaskId: Map<number, number[]>; dependentsByTaskId: Map<number, number[]>; edges: ORCDependencyEdge[]; issues: ORCDependencyIssue[]; cycles: ORCDependencyCycle[];
  counters: { explicitTaskDependencyReferenceCount: number; explicitTaskDependencyUniqueReferenceCount: number; explicitTaskDependencyUniqueEdgeCount: number; templateDependencyReferenceCount: number; templateDependencyUniqueReferenceCount: number; applicableTemplateDependencyReferenceCount: number; nonApplicableTemplateDependencyReferenceCount: number; resolvedTemplateDependencyUniqueEdgeCount: number; totalUniqueDependencyEdgeCount: number; missingExplicitTaskDependencyCount: number; blockingDependencyIssueCount: number; dependencyCycleCount: number };
  readOnly: true;
}

export function resolveORCTaskDependencyGraph(tasksInput: readonly TaskInput[]): ORCDependencyGraphResolution {
  const tasks = [...tasksInput].sort((a, b) => a.id - b.id);
  const byId = new Map(tasks.map(t => [t.id, t]));
  const edgeSources = new Map<string, Set<string>>();
  const issues: ORCDependencyIssue[] = [];
  let explicitRefs = 0, templateRefs = 0, applicableTemplateRefs = 0, nonApplicableTemplateRefs = 0;
  const explicitUniqueRefs = new Set<string>(), templateUniqueRefs = new Set<string>(), explicitEdges = new Set<string>(), templateEdges = new Set<string>();
  const addEdge = (from: number, to: number, source: string) => { const k = key(from, to); if (!edgeSources.has(k)) edgeSources.set(k, new Set()); edgeSources.get(k)!.add(source); };
  for (const task of tasks) {
    for (const dep of [...nums((task as any).dependsOnTaskId), ...nums((task as any).dependsOnTaskIds)]) {
      explicitRefs++; explicitUniqueRefs.add(`${task.id}:${dep}`);
      if (!byId.has(dep)) issues.push({ kind: "missing_explicit_task_dependency", taskId: task.id, prerequisiteTaskId: dep, readOnly: true });
      else { addEdge(dep, task.id, "explicit_task"); explicitEdges.add(key(dep, task.id)); }
    }
    for (const tid of [...nums((task as any).dependsOnTemplateId), ...nums((task as any).dependsOnTemplateIds)]) {
      templateRefs++; templateUniqueRefs.add(`${task.id}:${tid}`);
      const matches = tasks.filter(o => o.id !== task.id && Number((o as any).templateId) === tid && sameSubject(task, o));
      if (!matches.length) { nonApplicableTemplateRefs++; issues.push({ kind: "non_applicable_template_dependency", taskId: task.id, templateId: tid, readOnly: true }); }
      else { applicableTemplateRefs++; for (const m of matches) { addEdge(m.id, task.id, "template"); templateEdges.add(key(m.id, task.id)); } }
    }
  }
  const edges = [...edgeSources.entries()].map(([k, s]) => { const [fromTaskId, toTaskId] = k.split("->").map(Number); return { fromTaskId, toTaskId, sourceTypes: [...s].sort(), readOnly: true as const }; }).sort((a,b)=>a.fromTaskId-b.fromTaskId||a.toTaskId-b.toTaskId);
  const prereq = new Map<number, number[]>(), dep = new Map<number, number[]>(); for (const t of tasks) { prereq.set(t.id, []); dep.set(t.id, []); }
  for (const e of edges) { prereq.set(e.toTaskId, uniq([...(prereq.get(e.toTaskId)??[]), e.fromTaskId])); dep.set(e.fromTaskId, uniq([...(dep.get(e.fromTaskId)??[]), e.toTaskId])); }
  const cycles: ORCDependencyCycle[] = []; const seen = new Set<string>();
  const dfs = (start: number, cur: number, path: number[]) => { for (const n of dep.get(cur) ?? []) { if (n === start) { const cyc = [...path, n]; const ids = uniq(cyc); const ck = ids.join(","); if (!seen.has(ck)) { seen.add(ck); cycles.push({ taskIds: ids, edgePath: cyc, sourceTypes: uniq([]) as any, readOnly: true }); } } else if (!path.includes(n) && n >= start) dfs(start, n, [...path, n]); } };
  for (const t of tasks) dfs(t.id, t.id, [t.id]);
  const blocking = issues.filter(i => i.kind === "missing_explicit_task_dependency").length + cycles.length;
  return { prerequisitesByTaskId: prereq, dependentsByTaskId: dep, edges, issues, cycles, counters: { explicitTaskDependencyReferenceCount: explicitRefs, explicitTaskDependencyUniqueReferenceCount: explicitUniqueRefs.size, explicitTaskDependencyUniqueEdgeCount: explicitEdges.size, templateDependencyReferenceCount: templateRefs, templateDependencyUniqueReferenceCount: templateUniqueRefs.size, applicableTemplateDependencyReferenceCount: applicableTemplateRefs, nonApplicableTemplateDependencyReferenceCount: nonApplicableTemplateRefs, resolvedTemplateDependencyUniqueEdgeCount: templateEdges.size, totalUniqueDependencyEdgeCount: edges.length, missingExplicitTaskDependencyCount: issues.filter(i=>i.kind==="missing_explicit_task_dependency").length, blockingDependencyIssueCount: blocking, dependencyCycleCount: cycles.length }, readOnly: true };
}
