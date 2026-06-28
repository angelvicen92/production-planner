import type { CognitiveState, Evidence, OperationalState, Opportunity, ORCRecord, ReasoningBudgetProfile } from "../contracts";
import { createReasoningBudget, type ReasoningBudget } from "../cognitive/reasoningBudget";
import type { DynamicBottleneckAnalysis } from "../analysis/dynamicBottleneckAnalyzer";
import { deepFreeze } from "../immutability";

export interface CriticalResource { readonly resourceId: number; readonly assignedTaskCount: number; readonly occupiedMinutes: number; readonly overlapCount: number; readonly lockCount: number; readonly metrics: ORCRecord; readonly explanation: string; }
export interface CriticalTalent { readonly contestantId: number; readonly plannedTaskCount: number; readonly stayMinutes: number; readonly idleMinutes: number; readonly spaceSwitchCount: number; readonly dependencyCount: number; readonly metrics: ORCRecord; readonly explanation: string; }
export interface CriticalSpace { readonly spaceId: number; readonly plannedTaskCount: number; readonly occupiedMinutes: number; readonly internalGapMinutes: number; readonly conflictCount: number; readonly dependencyTouchCount: number; readonly metrics: ORCRecord; readonly explanation: string; }
export interface CriticalChain { readonly taskIds: readonly number[]; readonly length: number; readonly plannedTaskCount: number; readonly lockedTaskCount: number; readonly metrics: ORCRecord; readonly explanation: string; }
export interface LowFreedomRegion { readonly id: string; readonly kind: "resource" | "talent" | "space" | "day"; readonly freeMinutes: number; readonly occupiedMinutes: number; readonly taskCount: number; readonly metrics: ORCRecord; readonly explanation: string; }
export interface FutureFreedomAnalysis { readonly workDayMinutes: number; readonly pendingTaskCount: number; readonly lowFreedomRegions: readonly LowFreedomRegion[]; readonly conflictPropagationZones: readonly { readonly id: string; readonly taskIds: readonly number[]; readonly dependencyDegree: number; readonly metrics: ORCRecord; readonly explanation: string }[]; readonly metrics: ORCRecord; }
export interface OperationalCriticality { readonly criticalResources: readonly CriticalResource[]; readonly criticalTalents: readonly CriticalTalent[]; readonly criticalSpaces: readonly CriticalSpace[]; readonly criticalChains: readonly CriticalChain[]; readonly futureFreedom: FutureFreedomAnalysis; }
export interface OperationalCriticalityResult { readonly operationalCriticality: OperationalCriticality; readonly evidence: readonly Evidence[]; readonly cognitiveState: CognitiveState | null; }

type Planned = OperationalState["planning"][number] & { startMin: number; endMin: number; duration: number };
const toMinutes = (value: string | null | undefined): number | null => { if (!value) return null; const [h, m] = value.split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const byTimeThenTask = (a: Pick<Planned, "startMin" | "endMin" | "taskId">, b: Pick<Planned, "startMin" | "endMin" | "taskId">): number => a.startMin - b.startMin || a.endMin - b.endMin || a.taskId - b.taskId;
const uniqueSorted = (values: readonly number[]): number[] => [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
const intervalsOverlap = (a: Planned, b: Planned): boolean => a.startMin < b.endMin && b.startMin < a.endMin;
const sumInternalGaps = (items: readonly Planned[]): number => [...items].sort(byTimeThenTask).reduce((sum, item, index, ordered) => index === 0 ? 0 : sum + Math.max(0, item.startMin - ordered[index - 1].endMin), 0);
const buildPlanned = (state: OperationalState): Planned[] => (state.planning ?? []).map((item) => { const startMin = toMinutes(item.startPlanned); const endMin = toMinutes(item.endPlanned); return startMin == null || endMin == null || endMin < startMin ? null : { ...item, assignedResourceIds: uniqueSorted(item.assignedResourceIds ?? []), startMin, endMin, duration: endMin - startMin }; }).filter((item): item is Planned => item != null).sort(byTimeThenTask);
const resourceName = (state: OperationalState, resourceId: number): string => state.resources.find((resource) => Number(resource.id) === resourceId)?.name ?? `resource ${resourceId}`;

function buildResourceCriticality(state: OperationalState, planned: readonly Planned[]): CriticalResource[] {
  const lockCountByResource = new Map<number, number>();
  for (const lock of state.locks ?? []) if (lock.lockedResourceId != null) lockCountByResource.set(Number(lock.lockedResourceId), (lockCountByResource.get(Number(lock.lockedResourceId)) ?? 0) + 1);
  const rows = uniqueSorted(planned.flatMap((item) => item.assignedResourceIds ?? [])).map((resourceId) => {
    const items = planned.filter((item) => item.assignedResourceIds.includes(resourceId)); let overlapCount = 0;
    for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) if (intervalsOverlap(items[i], items[j])) overlapCount += 1;
    const occupiedMinutes = items.reduce((sum, item) => sum + item.duration, 0); const assignedTaskCount = items.length; const lockCount = lockCountByResource.get(resourceId) ?? 0;
    return { resourceId, assignedTaskCount, occupiedMinutes, overlapCount, lockCount, metrics: { assignedTaskCount, occupiedMinutes, overlapCount, lockCount }, explanation: `${resourceName(state, resourceId)} is critical because it carries ${assignedTaskCount} planned tasks, ${occupiedMinutes} occupied minutes, ${overlapCount} overlaps and ${lockCount} locks.` };
  });
  const maxLoad = Math.max(0, ...rows.map((row) => row.occupiedMinutes + row.overlapCount * 60 + row.lockCount * 30));
  return rows.filter((row) => maxLoad > 0 && row.occupiedMinutes + row.overlapCount * 60 + row.lockCount * 30 === maxLoad).sort((a, b) => a.resourceId - b.resourceId);
}
function buildTalentCriticality(state: OperationalState, planned: readonly Planned[]): CriticalTalent[] {
  const taskById = new Map(state.tasks.map((task) => [Number(task.id), task]));
  const dependencyCountByTask = new Map((state.dependencies ?? []).map((dep) => [Number(dep.taskId), (dep.dependsOnTaskIds?.length ?? 0) + (dep.dependsOnTemplateIds?.length ?? 0)]));
  const rows = uniqueSorted(state.tasks.map((task) => Number(task.contestantId)).filter((id) => Number.isFinite(id))).map((contestantId) => {
    const items = planned.filter((item) => taskById.get(item.taskId)?.contestantId === contestantId).sort(byTimeThenTask); const stayMinutes = items.length ? Math.max(...items.map((item) => item.endMin)) - Math.min(...items.map((item) => item.startMin)) : 0; const occupied = items.reduce((sum, item) => sum + item.duration, 0); const idleMinutes = Math.max(0, stayMinutes - occupied); let spaceSwitchCount = 0;
    for (let i = 1; i < items.length; i += 1) if ((items[i - 1].spaceId ?? null) !== (items[i].spaceId ?? null)) spaceSwitchCount += 1;
    const dependencyCount = items.reduce((sum, item) => sum + (dependencyCountByTask.get(item.taskId) ?? 0), 0); const plannedTaskCount = items.length;
    return { contestantId, plannedTaskCount, stayMinutes, idleMinutes, spaceSwitchCount, dependencyCount, metrics: { plannedTaskCount, stayMinutes, idleMinutes, spaceSwitchCount, dependencyCount }, explanation: `Talent ${contestantId} is critical because it has ${plannedTaskCount} planned tasks, ${stayMinutes} stay minutes, ${idleMinutes} idle minutes, ${spaceSwitchCount} space switches and ${dependencyCount} dependencies.` };
  }).filter((row) => row.plannedTaskCount > 0);
  if (rows.length === 0) return [];
  const minFreedom = Math.min(...rows.map((row) => row.idleMinutes + Math.max(0, 3 - row.plannedTaskCount) * 30));
  return rows.filter((row) => row.idleMinutes + Math.max(0, 3 - row.plannedTaskCount) * 30 === minFreedom).sort((a, b) => a.contestantId - b.contestantId);
}
function buildSpaceCriticality(state: OperationalState, planned: readonly Planned[]): CriticalSpace[] {
  const dependencyTaskIds = new Set((state.dependencies ?? []).flatMap((dep) => [dep.taskId, ...(dep.dependsOnTaskIds ?? [])]).map(Number));
  const rows = uniqueSorted(planned.map((item) => Number(item.spaceId)).filter((id) => Number.isFinite(id))).map((spaceId) => {
    const items = planned.filter((item) => item.spaceId === spaceId); let conflictCount = 0;
    for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) if (intervalsOverlap(items[i], items[j])) conflictCount += 1;
    const occupiedMinutes = items.reduce((sum, item) => sum + item.duration, 0); const internalGapMinutes = sumInternalGaps(items); const plannedTaskCount = items.length; const dependencyTouchCount = items.filter((item) => dependencyTaskIds.has(item.taskId)).length;
    return { spaceId, plannedTaskCount, occupiedMinutes, internalGapMinutes, conflictCount, dependencyTouchCount, metrics: { plannedTaskCount, occupiedMinutes, internalGapMinutes, conflictCount, dependencyTouchCount }, explanation: `Space ${spaceId} is critical because it conditions ${plannedTaskCount} tasks, ${occupiedMinutes} occupied minutes, ${internalGapMinutes} internal gap minutes, ${dependencyTouchCount} dependency touches and ${conflictCount} conflicts.` };
  });
  const maxPressure = Math.max(0, ...rows.map((row) => row.occupiedMinutes + row.conflictCount * 60 + row.dependencyTouchCount * 15 - row.internalGapMinutes));
  return rows.filter((row) => maxPressure > 0 && row.occupiedMinutes + row.conflictCount * 60 + row.dependencyTouchCount * 15 - row.internalGapMinutes === maxPressure).sort((a, b) => a.spaceId - b.spaceId);
}
function buildChains(state: OperationalState, planned: readonly Planned[]): CriticalChain[] {
  const plannedIds = new Set(planned.map((item) => item.taskId)); const prereqs = new Map<number, number[]>(); for (const dep of state.dependencies ?? []) prereqs.set(Number(dep.taskId), uniqueSorted(dep.dependsOnTaskIds ?? [])); const memo = new Map<number, number[]>();
  const visit = (taskId: number, seen = new Set<number>()): number[] => { if (memo.has(taskId)) return memo.get(taskId)!; if (seen.has(taskId)) return [taskId]; const options = (prereqs.get(taskId) ?? []).map((parent) => [...visit(parent, new Set([...seen, taskId])), taskId]); const best = (options.length ? options : [[taskId]]).sort((a, b) => b.length - a.length || a.join(",").localeCompare(b.join(",")))[0]; memo.set(taskId, best); return best; };
  const chains = uniqueSorted([...(state.dependencies ?? []).map((dep) => Number(dep.taskId)), ...planned.map((item) => item.taskId)]).map((id) => visit(id)); const maxLength = Math.max(0, ...chains.map((chain) => chain.length));
  return chains.filter((chain, index, arr) => chain.length === maxLength && maxLength > 1 && arr.findIndex((other) => other.join(",") === chain.join(",")) === index).map((taskIds) => ({ taskIds, length: taskIds.length, plannedTaskCount: taskIds.filter((id) => plannedIds.has(id)).length, lockedTaskCount: taskIds.filter((id) => state.locks.some((lock) => lock.taskId === id)).length, metrics: { length: taskIds.length, plannedTaskCount: taskIds.filter((id) => plannedIds.has(id)).length }, explanation: `Dependency chain ${taskIds.join(" -> ")} is critical because it is the longest detected chain with ${taskIds.length} tasks.` }));
}
function buildFutureFreedom(state: OperationalState, planned: readonly Planned[]): FutureFreedomAnalysis {
  const start = toMinutes(state.workDay?.start); const end = toMinutes(state.workDay?.end); const workDayMinutes = start != null && end != null && end >= start ? end - start : 0; const plannedIds = new Set(planned.map((item) => item.taskId)); const pendingTaskCount = state.tasks.filter((task) => task.status === "pending" && !plannedIds.has(Number(task.id))).length; const occupiedMinutes = planned.reduce((sum, item) => sum + item.duration, 0); const freeMinutes = Math.max(0, workDayMinutes - occupiedMinutes);
  const day: LowFreedomRegion = { id: "day", kind: "day", freeMinutes, occupiedMinutes, taskCount: planned.length, metrics: { workDayMinutes, occupiedMinutes, pendingTaskCount }, explanation: `The day has ${freeMinutes} free minutes after ${occupiedMinutes} occupied minutes and ${pendingTaskCount} pending tasks.` };
  const degree = new Map<number, number>(); for (const dep of state.dependencies ?? []) { degree.set(Number(dep.taskId), (degree.get(Number(dep.taskId)) ?? 0) + (dep.dependsOnTaskIds?.length ?? 0)); for (const parent of dep.dependsOnTaskIds ?? []) degree.set(Number(parent), (degree.get(Number(parent)) ?? 0) + 1); }
  const maxDegree = Math.max(0, ...degree.values()); const conflictPropagationZones = [...degree.entries()].filter(([, value]) => value === maxDegree && value > 0).sort((a, b) => a[0] - b[0]).map(([taskId, dependencyDegree]) => ({ id: `task:${taskId}`, taskIds: [taskId], dependencyDegree, metrics: { dependencyDegree }, explanation: `Task ${taskId} has the highest dependency degree (${dependencyDegree}), so conflicts can propagate from this zone.` }));
  return { workDayMinutes, pendingTaskCount, lowFreedomRegions: [day], conflictPropagationZones, metrics: { workDayMinutes, pendingTaskCount, occupiedMinutes, freeMinutes } };
}
export function buildOperationalCriticality(state: OperationalState): OperationalCriticality { const planned = buildPlanned(state); return deepFreeze({ criticalResources: buildResourceCriticality(state, planned), criticalTalents: buildTalentCriticality(state, planned), criticalSpaces: buildSpaceCriticality(state, planned), criticalChains: buildChains(state, planned), futureFreedom: buildFutureFreedom(state, planned) }) as OperationalCriticality; }
export function buildOperationalCriticalityEvidence(state: OperationalState, model: OperationalCriticality, buildTimeMs: number, createdAt: string | null = null): Evidence[] { return [deepFreeze({ id: `evidence:orc-understanding:operational-criticality:${state.id}`, source: "orc-understanding", kind: "operational-criticality", subjectId: state.id, createdAt, data: { stateId: state.id, criticalElements: { resourceIds: model.criticalResources.map((item) => item.resourceId), contestantIds: model.criticalTalents.map((item) => item.contestantId), spaceIds: model.criticalSpaces.map((item) => item.spaceId), chains: model.criticalChains.map((item) => item.taskIds) }, metrics: model, explanations: [...model.criticalResources.map((item) => item.explanation), ...model.criticalTalents.map((item) => item.explanation), ...model.criticalSpaces.map((item) => item.explanation), ...model.criticalChains.map((item) => item.explanation), ...model.futureFreedom.lowFreedomRegions.map((item) => item.explanation), ...model.futureFreedom.conflictPropagationZones.map((item) => item.explanation)], buildTimeMs, deterministic: true, shadowModeOnly: true } }) as Evidence]; }
export function understandOperationalCriticality(state: OperationalState, cognitiveState?: CognitiveState | null, createdAt: string | null = null): OperationalCriticalityResult { const operationalCriticality = buildOperationalCriticality(state); const buildTimeMs = 0; const evidence = buildOperationalCriticalityEvidence(state, operationalCriticality, buildTimeMs, createdAt); const nextCognitiveState = cognitiveState ? deepFreeze({ ...cognitiveState, operationalCriticality, temporaryKnowledge: { ...cognitiveState.temporaryKnowledge, operationalCriticality } }) as CognitiveState : null; return deepFreeze({ operationalCriticality, evidence, cognitiveState: nextCognitiveState }) as OperationalCriticalityResult; }


export interface ReasoningBudgetProfileConfig {
  readonly reasoningBudget?: ReasoningBudget;
  readonly lowCriticalityShare?: number;
  readonly mediumCriticalityShare?: number;
  readonly highCriticalityShare?: number;
  readonly dynamicBottleneckAnalysis?: DynamicBottleneckAnalysis | null;
}

const clampShare = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;

const opportunityTaskSet = (opportunity: Opportunity): Set<number> => new Set(uniqueSorted(opportunity.taskIds ?? []));
const intersects = (left: ReadonlySet<number>, right: readonly number[]): boolean => right.some((value) => left.has(value));
const plannedForOpportunity = (planned: readonly Planned[], opportunity: Opportunity): Planned[] => {
  const ids = opportunityTaskSet(opportunity);
  return planned.filter((item) => ids.has(item.taskId));
};

const criticalityScoreForOpportunity = (state: OperationalState, planned: readonly Planned[], opportunity: Opportunity, model: OperationalCriticality): number => {
  const taskIds = opportunityTaskSet(opportunity);
  const plannedItems = plannedForOpportunity(planned, opportunity);
  const resourceIds = uniqueSorted(plannedItems.flatMap((item) => item.assignedResourceIds));
  const spaceIds = uniqueSorted(plannedItems.map((item) => Number(item.spaceId)).filter((id) => Number.isFinite(id)));
  const taskById = new Map(state.tasks.map((task) => [Number(task.id), task]));
  const contestantIds = uniqueSorted(plannedItems.map((item) => Number(taskById.get(item.taskId)?.contestantId)).filter((id) => Number.isFinite(id)));
  return [
    model.criticalResources.some((item) => resourceIds.includes(item.resourceId)) ? 1 : 0,
    model.criticalSpaces.some((item) => spaceIds.includes(item.spaceId)) ? 1 : 0,
    model.criticalTalents.some((item) => contestantIds.includes(item.contestantId)) ? 1 : 0,
    model.criticalChains.some((item) => intersects(taskIds, item.taskIds)) ? 1 : 0,
    model.futureFreedom.conflictPropagationZones.some((zone) => intersects(taskIds, zone.taskIds)) ? 1 : 0,
    opportunity.opportunityImpact?.expectedImpact ?? (typeof opportunity.metadata?.priority === "number" ? Number(opportunity.metadata.priority) : 0),
  ].reduce((sum, value) => sum + value, 0);
};

const criticalityLevelForScore = (score: number, maxScore: number): number => {
  if (score <= 0 || maxScore <= 0) return 1;
  const ratio = score / maxScore;
  if (ratio >= 0.67) return 3;
  if (ratio >= 0.34) return 2;
  return 1;
};

export function buildReasoningBudgetProfiles(
  state: OperationalState,
  opportunities: readonly Opportunity[],
  model: OperationalCriticality = buildOperationalCriticality(state),
  config: ReasoningBudgetProfileConfig = {},
): readonly ReasoningBudgetProfile[] {
  const budget = config.reasoningBudget ?? createReasoningBudget();
  const shares = {
    1: clampShare(config.lowCriticalityShare, 0.5),
    2: clampShare(config.mediumCriticalityShare, 1),
    3: clampShare(config.highCriticalityShare, 1.5),
  } as const;
  const planned = buildPlanned(state);
  const dynamicImpactByOpportunity = new Map((config.dynamicBottleneckAnalysis?.opportunityImpacts ?? []).map((impact) => [impact.opportunityId, impact]));
  const scored = [...(opportunities ?? [])]
    .map((opportunity) => ({ opportunity, score: criticalityScoreForOpportunity(state, planned, opportunity, model) + ((dynamicImpactByOpportunity.get(opportunity.id)?.priorityBoost ?? 0) / 10) }))
    .sort((a, b) => a.opportunity.id.localeCompare(b.opportunity.id));
  const maxScore = Math.max(0, ...scored.map((item) => item.score));
  return deepFreeze(scored.map(({ opportunity, score }) => {
    const criticalityLevel = criticalityLevelForScore(score, maxScore);
    const share = shares[criticalityLevel as 1 | 2 | 3];
    const baseExploration = Math.max(1, Math.floor(budget.maxSearchSpaces / Math.max(1, scored.length)));
    const explorationBudget = Math.max(1, Math.min(budget.maxSearchSpaces, Math.ceil(baseExploration * share)));
    const maxCandidates = Math.max(1, Math.min(budget.maxCandidates, Math.ceil((budget.maxCandidates / Math.max(1, scored.length)) * share)));
    const simulationBudget = Math.max(1, Math.min(budget.maxSimulations, Math.ceil((budget.maxSimulations / Math.max(1, scored.length)) * share)));
    const maxDepth = Math.max(1, Math.ceil(criticalityLevel * share));
    const maxSearchSpaceSize = Math.max(1, Math.ceil(uniqueSorted(opportunity.taskIds).length * share));
    return {
      opportunityId: opportunity.id,
      criticalityLevel,
      explorationBudget,
      maxCandidates,
      maxDepth,
      maxSearchSpaceSize,
      simulationBudget,
      reason: `criticality-level-${criticalityLevel}-from-ocm-score-${score}${dynamicImpactByOpportunity.has(opportunity.id) ? "-with-dynamic-bottleneck" : ""}`,
    };
  })) as readonly ReasoningBudgetProfile[];
}

export function buildCriticalityDrivenReasoningBudgetEvidence(state: OperationalState, profiles: readonly ReasoningBudgetProfile[], createdAt: string | null = null): Evidence[] {
  return profiles.map((profile) => deepFreeze({
    id: `evidence:orc-see:criticality-reasoning-budget:${profile.opportunityId}`,
    source: "orc-see",
    kind: "criticality-reasoning-budget",
    subjectId: profile.opportunityId,
    createdAt,
    data: {
      stateId: state.id,
      opportunityId: profile.opportunityId,
      criticalityLevel: profile.criticalityLevel,
      assignedBudget: {
        explorationBudget: profile.explorationBudget,
        maxCandidates: profile.maxCandidates,
        maxDepth: profile.maxDepth,
        maxSearchSpaceSize: profile.maxSearchSpaceSize,
        simulationBudget: profile.simulationBudget,
      },
      reason: profile.reason,
      consumedBudget: { explorationBudget: 0, candidates: 0, depth: 0, simulations: 0 },
      deterministic: true,
      shadowModeOnly: true,
      readOnly: true,
    },
  }) as Evidence);
}
