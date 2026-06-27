import type { CognitiveState, Evidence, OperationalState, Opportunity, OpportunityPropagation, ORCRecord } from "../contracts";
import { deepFreeze } from "../immutability";
import { buildOperationalCriticality, type OperationalCriticality } from "./operationalCriticality";

const uniqueSortedNumbers = (values: readonly number[]): number[] => [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
const uniqueSortedStrings = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value.length > 0))].sort((a, b) => a.localeCompare(b));
const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

const opportunityTaskIds = (opportunity: Opportunity): number[] => uniqueSortedNumbers(opportunity.taskIds ?? []);
const intersects = (left: ReadonlySet<number>, right: readonly number[]): boolean => right.some((value) => left.has(value));

interface PropagationFactors extends ORCRecord {
  readonly opportunityTaskIds: readonly number[];
  readonly affectedResourceCount: number;
  readonly affectedChainCount: number;
  readonly directDependencyEdges: number;
  readonly conflictReductionFactors: ORCRecord;
  readonly freedomGainFactors: ORCRecord;
}

function descendantsByTask(state: OperationalState): Map<number, number[]> {
  const children = new Map<number, number[]>();
  for (const dependency of state.dependencies ?? []) {
    const taskId = Number(dependency.taskId);
    for (const parent of dependency.dependsOnTaskIds ?? []) {
      const parentId = Number(parent);
      children.set(parentId, [...(children.get(parentId) ?? []), taskId]);
    }
  }
  const entries: Array<[number, number[]]> = [...children.entries()].map(([key, value]) => [key, uniqueSortedNumbers(value)]);
  return new Map(entries.sort((a, b) => a[0] - b[0]));
}

function collectReachable(seedIds: readonly number[], graph: ReadonlyMap<number, readonly number[]>): number[] {
  const seen = new Set<number>();
  const queue = [...seedIds].sort((a, b) => a - b);
  while (queue.length > 0) {
    const taskId = queue.shift()!;
    for (const child of graph.get(taskId) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
        queue.sort((a, b) => a - b);
      }
    }
  }
  return uniqueSortedNumbers([...seen]);
}

function plannedForTasks(state: OperationalState, taskIds: ReadonlySet<number>): OperationalState["planning"] {
  return (state.planning ?? []).filter((item) => taskIds.has(Number(item.taskId))).sort((a, b) => Number(a.taskId) - Number(b.taskId));
}

function buildPropagation(opportunity: Opportunity, state: OperationalState, model: OperationalCriticality): OpportunityPropagation {
  const taskIds = opportunityTaskIds(opportunity);
  const taskSet = new Set(taskIds);
  const descendants = collectReachable(taskIds, descendantsByTask(state));
  const propagatedTaskSet = new Set([...taskIds, ...descendants]);
  const planned = plannedForTasks(state, propagatedTaskSet);
  const resourceIds = uniqueSortedNumbers(planned.flatMap((item) => item.assignedResourceIds ?? []));
  const affectedResources = uniqueSortedStrings(resourceIds.map((resourceId) => `resource:${resourceId}`));
  const affectedChains = uniqueSortedStrings(model.criticalChains
    .filter((chain) => intersects(propagatedTaskSet, chain.taskIds))
    .map((chain) => `chain:${chain.taskIds.join("->")}`));
  const directDependencyEdges = (state.dependencies ?? []).reduce((sum, dependency) => {
    const child = Number(dependency.taskId);
    const parents = uniqueSortedNumbers(dependency.dependsOnTaskIds ?? []);
    return sum + (taskSet.has(child) ? parents.length : 0) + parents.filter((parent) => taskSet.has(parent)).length;
  }, 0);
  const criticalResourceHits = model.criticalResources.filter((item) => resourceIds.includes(item.resourceId));
  const conflictFromResources = criticalResourceHits.reduce((sum, item) => sum + item.overlapCount + item.lockCount, 0);
  const conflictFromSpaces = model.criticalSpaces.filter((item) => planned.some((plannedItem) => Number(plannedItem.spaceId) === item.spaceId)).reduce((sum, item) => sum + item.conflictCount + item.dependencyTouchCount, 0);
  const estimatedConflictReduction = round(clamp01((conflictFromResources + conflictFromSpaces + directDependencyEdges) / Math.max(1, state.tasks.length + state.dependencies.length)));
  const pendingTouch = descendants.filter((id) => !taskSet.has(id)).length;
  const lowFreedomTouch = model.futureFreedom.conflictPropagationZones.filter((zone) => intersects(propagatedTaskSet, zone.taskIds)).reduce((sum, zone) => sum + zone.dependencyDegree, 0);
  const estimatedFreedomGain = round(clamp01((pendingTouch + affectedResources.length + affectedChains.length + lowFreedomTouch) / Math.max(1, state.tasks.length + model.futureFreedom.pendingTaskCount)));
  const propagationScore = round(clamp01((estimatedConflictReduction * 0.45) + (estimatedFreedomGain * 0.45) + (Math.min(1, descendants.length / Math.max(1, state.tasks.length)) * 0.1)));
  const factors: PropagationFactors = { opportunityTaskIds: taskIds, affectedResourceCount: affectedResources.length, affectedChainCount: affectedChains.length, directDependencyEdges, conflictReductionFactors: { conflictFromResources, conflictFromSpaces }, freedomGainFactors: { descendantCount: descendants.length, pendingTouch, lowFreedomTouch } };
  return deepFreeze({
    opportunityId: opportunity.id,
    propagationScore,
    affectedResources,
    affectedChains,
    estimatedConflictReduction,
    estimatedFreedomGain,
    explanation: `Opportunity ${opportunity.id} can propagate through ${descendants.length} dependent tasks, ${affectedResources.length} resources and ${affectedChains.length} critical chains (factors: ${JSON.stringify(factors)}).`,
  }) as OpportunityPropagation;
}

export function analyzeOpportunityPropagation(state: OperationalState, opportunities: readonly Opportunity[] = state.cognitive?.opportunities ?? [], model: OperationalCriticality = buildOperationalCriticality(state)): readonly OpportunityPropagation[] {
  return deepFreeze([...(opportunities ?? [])].sort((a, b) => a.id.localeCompare(b.id)).map((opportunity) => buildPropagation(opportunity, state, model))) as readonly OpportunityPropagation[];
}

export function buildOpportunityPropagationEvidence(state: OperationalState, propagations: readonly OpportunityPropagation[], createdAt: string | null = null): readonly Evidence[] {
  return deepFreeze(propagations.map((propagation) => ({
    id: `evidence:orc-understanding:opportunity-propagation:${propagation.opportunityId}`,
    source: "orc-understanding",
    kind: "opportunity-propagation",
    subjectId: propagation.opportunityId,
    createdAt,
    data: { stateId: state.id, opportunityId: propagation.opportunityId, propagationScore: propagation.propagationScore, factors: { affectedResources: propagation.affectedResources, affectedChains: propagation.affectedChains, estimatedConflictReduction: propagation.estimatedConflictReduction, estimatedFreedomGain: propagation.estimatedFreedomGain }, explanation: propagation.explanation, deterministic: true, shadowModeOnly: true, readOnly: true },
  }))) as readonly Evidence[];
}

export function understandOpportunityPropagation(state: OperationalState, opportunities: readonly Opportunity[] = state.cognitive?.opportunities ?? [], cognitiveState?: CognitiveState | null, createdAt: string | null = null, model: OperationalCriticality = buildOperationalCriticality(state)) {
  const opportunityPropagation = analyzeOpportunityPropagation(state, opportunities, model);
  const evidence = buildOpportunityPropagationEvidence(state, opportunityPropagation, createdAt);
  const nextCognitiveState = cognitiveState ? deepFreeze({ ...cognitiveState, opportunityPropagation, temporaryKnowledge: { ...cognitiveState.temporaryKnowledge, opportunityPropagation } }) as CognitiveState : null;
  return deepFreeze({ opportunityPropagation, evidence, cognitiveState: nextCognitiveState, informationalOnly: true as const });
}
