import type { Evidence, OperationalState, Opportunity, ORCRecord } from "../contracts";
import { deepFreeze } from "../immutability";
import { buildOperationalCriticality } from "../understanding/operationalCriticality";

export type DynamicBottleneckKind = "resource" | "space" | "talent" | "chain" | "day";

export interface DynamicBottleneck {
  readonly id: string;
  readonly kind: DynamicBottleneckKind;
  readonly pressureScore: number;
  readonly normalizedPressure: number;
  readonly taskIds: readonly number[];
  readonly relatedResourceIds: readonly number[];
  readonly relatedSpaceIds: readonly number[];
  readonly relatedContestantIds: readonly number[];
  readonly indicators: ORCRecord;
  readonly explanation: string;
}

export interface DynamicBottleneckAnalysis {
  readonly bottlenecks: readonly DynamicBottleneck[];
  readonly opportunityImpacts: readonly DynamicBottleneckOpportunityImpact[];
  readonly evidence: readonly Evidence[];
}

export interface DynamicBottleneckOpportunityImpact {
  readonly opportunityId: string;
  readonly bottleneckIds: readonly string[];
  readonly priorityBoost: number;
  readonly indicators: ORCRecord;
}

type Planned = OperationalState["planning"][number] & { startMin: number; endMin: number; duration: number };
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const toMinutes = (value: string | null | undefined): number | null => { if (!value) return null; const [h, m] = value.split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const uniqueSorted = (values: readonly number[]): number[] => [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b);
const buildPlanned = (state: OperationalState): Planned[] => (state.planning ?? []).map((item) => { const startMin = toMinutes(item.startPlanned); const endMin = toMinutes(item.endPlanned); return startMin == null || endMin == null || endMin < startMin ? null : { ...item, assignedResourceIds: uniqueSorted(item.assignedResourceIds ?? []), startMin, endMin, duration: endMin - startMin }; }).filter((item): item is Planned => item != null).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.taskId - b.taskId);
const sumGaps = (items: readonly Planned[]): number => [...items].sort((a, b) => a.startMin - b.startMin || a.taskId - b.taskId).reduce((sum, item, index, ordered) => index === 0 ? 0 : sum + Math.max(0, item.startMin - ordered[index - 1].endMin), 0);
const overlapCount = (items: readonly Planned[]): number => { let count = 0; for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) if (items[i].startMin < items[j].endMin && items[j].startMin < items[i].endMin) count += 1; return count; };
const pressureCutoff = (scores: readonly number[]): number => scores.length === 0 ? Number.POSITIVE_INFINITY : scores.reduce((sum, score) => sum + score, 0) / scores.length;

function row(id: string, kind: DynamicBottleneckKind, pressureScore: number, taskIds: number[], resourceIds: number[], spaceIds: number[], contestantIds: number[], indicators: ORCRecord): Omit<DynamicBottleneck, "normalizedPressure" | "explanation"> {
  return { id, kind, pressureScore: round(pressureScore), taskIds: uniqueSorted(taskIds), relatedResourceIds: uniqueSorted(resourceIds), relatedSpaceIds: uniqueSorted(spaceIds), relatedContestantIds: uniqueSorted(contestantIds), indicators };
}

function detectRows(state: OperationalState): Omit<DynamicBottleneck, "normalizedPressure" | "explanation">[] {
  const planned = buildPlanned(state);
  const taskById = new Map(state.tasks.map((task) => [Number(task.id), task]));
  const criticality = buildOperationalCriticality(state);
  const dependencyDegree = new Map<number, number>();
  for (const dep of state.dependencies ?? []) { dependencyDegree.set(Number(dep.taskId), (dependencyDegree.get(Number(dep.taskId)) ?? 0) + (dep.dependsOnTaskIds?.length ?? 0)); for (const parent of dep.dependsOnTaskIds ?? []) dependencyDegree.set(Number(parent), (dependencyDegree.get(Number(parent)) ?? 0) + 1); }
  const rows: Omit<DynamicBottleneck, "normalizedPressure" | "explanation">[] = [];
  for (const resourceId of uniqueSorted([...(state.resources ?? []).map((resource) => Number(resource.id)), ...planned.flatMap((item) => item.assignedResourceIds)])) {
    const items = planned.filter((item) => item.assignedResourceIds.includes(resourceId)); if (items.length === 0) continue;
    const occupiedMinutes = items.reduce((sum, item) => sum + item.duration, 0); const overlaps = overlapCount(items); const dependentTasks = items.filter((item) => dependencyDegree.has(item.taskId)).length; const substitutes = Math.max(1, (state.resources?.length ?? 0));
    rows.push(row(`resource:${resourceId}`, "resource", occupiedMinutes + overlaps * 60 + dependentTasks * 30 + (items.length / substitutes) * 30, items.map((item) => item.taskId), [resourceId], [], items.map((item) => Number(taskById.get(item.taskId)?.contestantId)).filter(Number.isFinite), { occupiedMinutes, overlapCount: overlaps, dependentTasks, substitutePoolSize: substitutes, plannedTaskCount: items.length }));
  }
  for (const spaceId of uniqueSorted(planned.map((item) => Number(item.spaceId)).filter(Number.isFinite))) {
    const items = planned.filter((item) => item.spaceId === spaceId); const occupiedMinutes = items.reduce((sum, item) => sum + item.duration, 0); const gaps = sumGaps(items); const conflicts = overlapCount(items); const dependencyTouches = items.filter((item) => dependencyDegree.has(item.taskId)).length;
    rows.push(row(`space:${spaceId}`, "space", occupiedMinutes + conflicts * 60 + dependencyTouches * 20 - gaps, items.map((item) => item.taskId), items.flatMap((item) => item.assignedResourceIds), [spaceId], [], { occupiedMinutes, internalGapMinutes: gaps, conflictCount: conflicts, dependencyTouches, plannedTaskCount: items.length }));
  }
  for (const chain of criticality.criticalChains) rows.push(row(`chain:${chain.taskIds.join("-")}`, "chain", chain.length * 60 + chain.lockedTaskCount * 30 + chain.plannedTaskCount * 15, [...chain.taskIds], [], [], [], { length: chain.length, plannedTaskCount: chain.plannedTaskCount, lockedTaskCount: chain.lockedTaskCount }));
  for (const zone of criticality.futureFreedom.conflictPropagationZones) rows.push(row(`propagation:${zone.id}`, "chain", zone.dependencyDegree * 45, [...zone.taskIds], [], [], [], { dependencyDegree: zone.dependencyDegree }));
  return rows.filter((item) => item.pressureScore > 0);
}

const opportunityImpact = (opportunity: Opportunity, bottlenecks: readonly DynamicBottleneck[]): DynamicBottleneckOpportunityImpact => {
  const taskIds = new Set(opportunity.taskIds ?? []);
  const metadataResources = Array.isArray(opportunity.metadata?.overloadedResourceIds) ? opportunity.metadata.overloadedResourceIds.map(Number) : [];
  const matches = bottlenecks.filter((b) => b.taskIds.some((id) => taskIds.has(id)) || b.relatedResourceIds.some((id) => metadataResources.includes(id)) || String(opportunity.kind).toLowerCase().includes(b.kind));
  const priorityBoost = round(matches.reduce((sum, b) => sum + b.normalizedPressure, 0) * 10);
  return { opportunityId: opportunity.id, bottleneckIds: matches.map((item) => item.id).sort(), priorityBoost, indicators: { matchedBottleneckCount: matches.length, matchedPressure: round(matches.reduce((sum, b) => sum + b.normalizedPressure, 0)) } };
};

export function analyzeDynamicBottlenecks(state: OperationalState, opportunities: readonly Opportunity[] = [], createdAt: string | null = null): DynamicBottleneckAnalysis {
  const candidates = detectRows(state).sort((a, b) => b.pressureScore - a.pressureScore || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const cutoff = pressureCutoff(candidates.map((item) => item.pressureScore));
  const max = Math.max(0, ...candidates.map((item) => item.pressureScore));
  const bottlenecks = candidates.filter((item) => item.pressureScore >= cutoff && max > 0).map((item) => deepFreeze({ ...item, normalizedPressure: round(item.pressureScore / max), explanation: `${item.id} is dynamically limiting because its pressure score ${item.pressureScore} is above the operational-state baseline ${round(cutoff)}.` }) as DynamicBottleneck);
  const opportunityImpacts = [...opportunities].map((opportunity) => opportunityImpact(opportunity, bottlenecks)).filter((impact) => impact.priorityBoost > 0).sort((a, b) => b.priorityBoost - a.priorityBoost || a.opportunityId.localeCompare(b.opportunityId));
  const evidence = [deepFreeze({ id: `evidence:orc-see:dynamic-bottlenecks:${state.id}`, source: "orc-see", kind: "dynamic-bottleneck-analysis", subjectId: state.id, createdAt, data: { stateId: state.id, bottlenecks, opportunityImpacts, cutoff: round(cutoff), deterministic: true, shadowModeOnly: true, readOnly: true } }) as Evidence];
  return deepFreeze({ bottlenecks, opportunityImpacts, evidence }) as DynamicBottleneckAnalysis;
}
