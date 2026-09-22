import type { EngineInput } from "../engine/types";
import { buildAssistedProblem, createPlanningScope } from "../engine/planner-next/assistedPlanning";
import type { EngineInputAdapterSupportedResult } from "../engine/planner-next/integration/engineInputAdapter";
import type { AssistedScopeSelector } from "../shared/assistedProposalContracts";

/** Projects the product status authority once, before status-free Planner Next. */
export function analyticalFutureEligibleTaskIds(input:EngineInput,identityMap:readonly {namespace:string;sourceId:string;canonicalId:string}[]):ReadonlySet<string>{
  const canonicalByProduct=new Map(identityMap.filter(item=>item.namespace==="task").map(item=>[Number(item.sourceId),item.canonicalId]));
  return new Set(input.tasks.filter(task=>task.status==="pending"||task.status==="interrupted").flatMap(task=>{
    const canonicalId=canonicalByProduct.get(task.id); return canonicalId?[canonicalId]:[];
  }));
}

export class ScopeResolutionError extends Error {
  constructor(readonly code: "INVALID_SCOPE" | "EMPTY_SCOPE") { super(code); }
}

/** Resolves product IDs only through the immutable EngineInput/identity-map authorities. */
export function resolveAssistedScope(input: EngineInput, adapter: EngineInputAdapterSupportedResult, selector: AssistedScopeSelector) {
  if (input.planId <= 0) throw new ScopeResolutionError("INVALID_SCOPE");
  const eligible = new Map(input.tasks.filter(task => task.status === "pending" || task.status === "interrupted")
    .map(task => [task.id, task] as const));
  const productIds = selector.kind === "TASK_IDS"
    ? [...new Set(selector.taskIds)].sort((a, b) => a - b)
    : [...eligible.values()].filter(task => task.spaceId === selector.spaceId).map(task => task.id).sort((a, b) => a - b);
  if (selector.kind === "TASK_IDS" && (productIds.length !== selector.taskIds.length || productIds.some(id => !eligible.has(id))))
    throw new ScopeResolutionError("INVALID_SCOPE");
  if (selector.kind === "SPACE" && !adapter.identityMap.some(i => i.namespace === "space" && i.sourceId === String(selector.spaceId)))
    throw new ScopeResolutionError("INVALID_SCOPE");
  if (!productIds.length) throw new ScopeResolutionError("EMPTY_SCOPE");
  const canonicalByProduct = new Map(adapter.identityMap.filter(i => i.namespace === "task").map(i => [Number(i.sourceId), i.canonicalId]));
  const canonicalIds = productIds.map(id => canonicalByProduct.get(id));
  if (canonicalIds.some(id => !id)) throw new ScopeResolutionError("INVALID_SCOPE");
  return Object.freeze({ productTaskIds: Object.freeze(productIds), scope: createPlanningScope(
    { kind: selector.kind, value: selector.kind === "SPACE" ? String(selector.spaceId) : productIds.join(",") },
    selector.kind === "SPACE" ? { spaceId: selector.spaceId } : {}, canonicalIds as string[]),
  });
}

/** Uses buildAssistedProblem as the single prerequisite-closure authority. */
export function expandVisiblePrerequisites(input: EngineInput, resolution: ReturnType<typeof resolveAssistedScope>, adapter: EngineInputAdapterSupportedResult) {
  const assisted = buildAssistedProblem(adapter.problem, resolution.scope, []);
  const sourceByCanonical = new Map(adapter.identityMap.filter(i => i.namespace === "task").map(i => [i.canonicalId, Number(i.sourceId)]));
  const eligible = new Set(input.tasks.filter(task => task.status === "pending" || task.status === "interrupted").map(task => task.id));
  const visibleSupporting = assisted.supportingTaskIds.filter(id => eligible.has(sourceByCanonical.get(id)!));
  const productTaskIds = [...new Set([...resolution.scope.resolvedTaskIds, ...visibleSupporting].map(id => sourceByCanonical.get(id)))];
  if (productTaskIds.some(id => !Number.isInteger(id) || id! <= 0)) throw new ScopeResolutionError("INVALID_SCOPE");
  return resolveAssistedScopeFromCanonical(productTaskIds as number[], [...resolution.scope.resolvedTaskIds, ...visibleSupporting], resolution.scope.selector, resolution.scope.metadata);
}
function resolveAssistedScopeFromCanonical(productTaskIds: number[], canonicalIds: string[], selector: {kind:string;value:string}, metadata: Readonly<Record<string,string|number|boolean|null>>) {
  const sortedProducts = [...productTaskIds].sort((a,b)=>a-b);
  return Object.freeze({ productTaskIds: Object.freeze(sortedProducts), scope: createPlanningScope(selector, metadata, canonicalIds) });
}
