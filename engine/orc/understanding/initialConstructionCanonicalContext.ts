import { createHash } from "node:crypto";
import type { EngineInput, TaskInput } from "../../types";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { resolveORCTaskDependencyGraph, type ORCDependencyEdge, type ORCDependencyGraphResolution } from "../state/dependencySemantics";

export type InitialConstructionCanonicalContextSource = "stage1-initial-construction-map" | "single-resolution-fallback";

export interface InitialConstructionCanonicalContext {
  readonly tasksById: ReadonlyMap<number, TaskInput>;
  readonly taskIds: readonly number[];
  readonly dependencyGraph: ORCDependencyGraphResolution | any;
  readonly prerequisitesByTaskId: ReadonlyMap<number, readonly number[]>;
  readonly dependentsByTaskId: ReadonlyMap<number, readonly number[]>;
  readonly edgeByKey: ReadonlyMap<string, ORCDependencyEdge>;
  readonly topologicalTaskIds: readonly number[];
  readonly cycleTaskIds: readonly number[];
  readonly source: InitialConstructionCanonicalContextSource;
  readonly fingerprint: string;
  readonly readOnly: true;
}

export interface InitialConstructionCanonicalContextBuildResult {
  readonly context: InitialConstructionCanonicalContext;
  readonly canonicalContextBuildCount: number;
  readonly dependencyGraphFallbackResolutionCount: number;
  readonly hotPathDependencyGraphResolutionCount: 0;
  readonly readOnly: true;
}

const uniq = (xs: readonly number[]) => [...new Set(xs.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
const edgeKey = (fromTaskId: number, toTaskId: number) => `${fromTaskId}->${toTaskId}`;
const hash = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");

function freezeMap<K, V>(map: Map<K, V>): ReadonlyMap<K, V> {
  return Object.freeze(map) as ReadonlyMap<K, V>;
}

function graphFromStage1(stage1: any): ORCDependencyGraphResolution | any | null {
  return stage1?.initialConstructionMap?.dependencyGraph ?? null;
}

function edgesOf(graph: any): ORCDependencyEdge[] {
  return [...(graph?.edges ?? [])].map((edge: any) => ({
    fromTaskId: Number(edge.fromTaskId),
    toTaskId: Number(edge.toTaskId),
    sourceTypes: [...(edge.sourceTypes ?? [])].map(String).sort(),
    readOnly: true as const,
  })).filter((edge) => Number.isFinite(edge.fromTaskId) && Number.isFinite(edge.toTaskId)).sort((a, b) => a.fromTaskId - b.fromTaskId || a.toTaskId - b.toTaskId);
}

function buildTopologicalTaskIds(taskIds: readonly number[], prerequisitesByTaskId: ReadonlyMap<number, readonly number[]>, dependentsByTaskId: ReadonlyMap<number, readonly number[]>, cycleTaskIds: readonly number[]): number[] {
  const cycle = new Set(cycleTaskIds);
  const indegree = new Map<number, number>();
  for (const id of taskIds) indegree.set(id, 0);
  for (const id of taskIds) for (const pre of prerequisitesByTaskId.get(id) ?? []) if (!cycle.has(id) && !cycle.has(pre) && indegree.has(id)) indegree.set(id, (indegree.get(id) ?? 0) + 1);
  const ready = [...taskIds].filter((id) => !cycle.has(id) && (indegree.get(id) ?? 0) === 0).sort((a, b) => a - b);
  const out: number[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    out.push(id);
    for (const dependent of [...(dependentsByTaskId.get(id) ?? [])].sort((a, b) => a - b)) {
      if (cycle.has(dependent)) continue;
      indegree.set(dependent, (indegree.get(dependent) ?? 0) - 1);
      if ((indegree.get(dependent) ?? 0) === 0) ready.push(dependent);
    }
    ready.sort((a, b) => a - b);
  }
  return [...out, ...taskIds.filter((id) => !out.includes(id)).sort((a, b) => a - b)];
}

function buildContext(args: { input: EngineInput; source: InitialConstructionCanonicalContextSource; dependencyGraph: any }): InitialConstructionCanonicalContext {
  const tasks = [...(args.input.tasks ?? [])].sort((a: any, b: any) => Number(a.id) - Number(b.id)) as TaskInput[];
  const taskIds = tasks.map((task: any) => Number(task.id));
  const taskIdSet = new Set(taskIds);
  const tasksById = new Map<number, TaskInput>(tasks.map((task: any) => [Number(task.id), task]));
  const nodeEdges = (args.dependencyGraph?.nodes ?? []).flatMap((node: any) => [...(node.directPrerequisiteTaskIds ?? [])].map((pre: any) => ({ fromTaskId: Number(pre), toTaskId: Number(node.taskId), sourceTypes: ["stage1_node"], readOnly: true as const })));
  const edgeMap = new Map<string, ORCDependencyEdge>();
  for (const edge of [...edgesOf(args.dependencyGraph), ...nodeEdges].filter((edge) => taskIdSet.has(edge.fromTaskId) && taskIdSet.has(edge.toTaskId))) {
    const k = edgeKey(edge.fromTaskId, edge.toTaskId);
    const previous = edgeMap.get(k);
    edgeMap.set(k, previous ? { ...edge, sourceTypes: [...new Set([...previous.sourceTypes, ...edge.sourceTypes])].sort(), readOnly: true } : edge);
  }
  const edges = [...edgeMap.values()].sort((a, b) => a.fromTaskId - b.fromTaskId || a.toTaskId - b.toTaskId);
  const prerequisitesByTaskId = new Map<number, number[]>(taskIds.map((id) => [id, []]));
  const dependentsByTaskId = new Map<number, number[]>(taskIds.map((id) => [id, []]));
  const edgeByKey = new Map<string, ORCDependencyEdge>();
  for (const edge of edges) {
    prerequisitesByTaskId.set(edge.toTaskId, uniq([...(prerequisitesByTaskId.get(edge.toTaskId) ?? []), edge.fromTaskId]));
    dependentsByTaskId.set(edge.fromTaskId, uniq([...(dependentsByTaskId.get(edge.fromTaskId) ?? []), edge.toTaskId]));
    edgeByKey.set(edgeKey(edge.fromTaskId, edge.toTaskId), edge);
  }
  const cycleTaskIds = uniq([...(args.dependencyGraph?.cycles ?? []).flatMap((cycle: any) => cycle.taskIds ?? []), ...(args.dependencyGraph?.nodes ?? []).filter((node: any) => node.inDependencyCycle).map((node: any) => node.taskId)]);
  const topologicalTaskIds = buildTopologicalTaskIds(taskIds, prerequisitesByTaskId, dependentsByTaskId, cycleTaskIds);
  const fingerprint = hash({ version: "INITIAL-CONSTRUCTION-CANONICAL-CONTEXT-V1", source: args.source, taskIds, edges, cycleTaskIds, topologicalTaskIds });
  return deepFreeze({ tasksById: freezeMap(tasksById), taskIds, dependencyGraph: { ...args.dependencyGraph, edges, readOnly: true }, prerequisitesByTaskId: freezeMap(prerequisitesByTaskId), dependentsByTaskId: freezeMap(dependentsByTaskId), edgeByKey: freezeMap(edgeByKey), topologicalTaskIds, cycleTaskIds, source: args.source, fingerprint, readOnly: true }) as InitialConstructionCanonicalContext;
}

export function buildInitialConstructionCanonicalContext(args: { input: EngineInput; stage1?: any | null }): InitialConstructionCanonicalContextBuildResult {
  const stage1Graph = graphFromStage1(args.stage1);
  const source: InitialConstructionCanonicalContextSource = stage1Graph ? "stage1-initial-construction-map" : "single-resolution-fallback";
  const dependencyGraph = stage1Graph ?? resolveORCTaskDependencyGraph((args.input.tasks ?? []) as any);
  return deepFreeze({ context: buildContext({ input: args.input, source, dependencyGraph }), canonicalContextBuildCount: 1, dependencyGraphFallbackResolutionCount: stage1Graph ? 0 : 1, hotPathDependencyGraphResolutionCount: 0, readOnly: true }) as InitialConstructionCanonicalContextBuildResult;
}

export function resolveInitialConstructionCanonicalContext(args: { input: EngineInput; stage1?: any | null; canonicalContext?: InitialConstructionCanonicalContext | null }): InitialConstructionCanonicalContext {
  return args.canonicalContext ?? buildInitialConstructionCanonicalContext({ input: args.input, stage1: args.stage1 }).context;
}
