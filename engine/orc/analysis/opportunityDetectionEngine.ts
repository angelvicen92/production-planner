import type { CriticalBottleneck, CriticalBottleneckAnalysis } from "./criticalBottleneckAnalyzer";
import type { OperationalAnalysis } from "./operationalStateAnalyzer";
import type { Opportunity, ORCRecord } from "../contracts";
import { prioritizeOpportunities } from "../see/opportunityPriority";

export type ORCOpportunityKind =
  | "MAIN_FLOW_GAP"
  | "EXCESSIVE_TALENT_STAY"
  | "RESOURCE_PRESSURE"
  | "FRAGMENTATION"
  | "LOCK_PRESSURE"
  | "UNPLANNED_PENDING_TASKS";

export interface OpportunityDetectionResult {
  opportunities: Opportunity[];
}

const PRIORITY: Record<ORCOpportunityKind, number> = {
  MAIN_FLOW_GAP: 100,
  UNPLANNED_PENDING_TASKS: 90,
  RESOURCE_PRESSURE: 80,
  EXCESSIVE_TALENT_STAY: 70,
  LOCK_PRESSURE: 60,
  FRAGMENTATION: 50,
};

const uniqueSortedNumbers = (values: readonly number[]): number[] =>
  [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);

const taskIdsForResources = (analysis: OperationalAnalysis, resourceIds: readonly number[]): number[] =>
  uniqueSortedNumbers(resourceIds.flatMap((resourceId) => [...(analysis.resourcePressure.plannedTaskIdsByResourceId[resourceId] ?? [])]));

const allPlannedResourceTaskIds = (analysis: OperationalAnalysis): number[] =>
  taskIdsForResources(analysis, analysis.resourcePressure.assignedResourceIds);

const bottleneckEvidenceId = (bottleneckId: string): string => `evidence:orc-see:bottleneck:${bottleneckId}`;

const makeOpportunity = (kind: ORCOpportunityKind, description: string, taskIds: readonly number[], metadata: ORCRecord, bottlenecks: readonly CriticalBottleneck[] = []): Opportunity => ({
  id: `orc-see:${kind.toLowerCase()}:${taskIds.length ? uniqueSortedNumbers(taskIds).join("-") : "state"}`,
  kind,
  description,
  taskIds: uniqueSortedNumbers(taskIds),
  searchSpaceIds: [],
  evidenceIds: uniqueStrings([`evidence:orc-see:${kind.toLowerCase()}`, ...bottlenecks.map((item) => bottleneckEvidenceId(item.id))]),
  metadata: {
    priority: PRIORITY[kind],
    impactExpected: "unknown",
    urgency: "medium",
    criticality: "medium",
    confidence: 0.8,
    cause: kind,
    affectedRegion: "operational-state",
    ...metadata,
    bottleneckOrigins: bottlenecks.map((item) => ({ id: item.id, category: item.category, severity: item.severity })),
    bottleneckIds: bottlenecks.map((item) => item.id),
    derivedFromCriticalBottleneck: bottlenecks.length > 0,
  },
});

const uniqueStrings = (values: readonly string[]): string[] => [...new Set(values)];

const bottlenecksByCategory = (bottleneckAnalysis: CriticalBottleneckAnalysis, category: ORCOpportunityKind): CriticalBottleneck[] =>
  bottleneckAnalysis.bottlenecks.filter((item) => item.category === category).sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id));

const shouldEvaluate = (bottleneckAnalysis: CriticalBottleneckAnalysis, kind: ORCOpportunityKind): boolean =>
  bottleneckAnalysis.bottlenecks.length === 0 || bottlenecksByCategory(bottleneckAnalysis, kind).length > 0;

const pushUnique = (opportunitiesById: Map<string, Opportunity>, opportunity: Opportunity): void => {
  if (!opportunitiesById.has(opportunity.id)) opportunitiesById.set(opportunity.id, opportunity);
};

export function detectOpportunities(analysis: OperationalAnalysis, bottleneckAnalysis: CriticalBottleneckAnalysis = analysis.criticalBottleneckAnalysis): OpportunityDetectionResult {
  const opportunitiesById = new Map<string, Opportunity>();

  if (shouldEvaluate(bottleneckAnalysis, "MAIN_FLOW_GAP") && analysis.continuity.mainFlow.configured && analysis.continuity.mainFlow.gapCount > 0) {
    const origins = bottlenecksByCategory(bottleneckAnalysis, "MAIN_FLOW_GAP");
    pushUnique(opportunitiesById, makeOpportunity("MAIN_FLOW_GAP", "Internal gaps were detected in the configured main flow.", analysis.continuity.mainFlow.plannedTaskIds, { impactExpected: "reduce_idle_time", gapCount: analysis.continuity.mainFlow.gapCount, internalGapMinutes: analysis.continuity.mainFlow.internalGapMinutes, affectedRegion: "main-flow", derivedOpportunityKind: "MAIN_FLOW_GAP" }, origins));
  }

  if (shouldEvaluate(bottleneckAnalysis, "UNPLANNED_PENDING_TASKS") && analysis.continuity.pendingTaskCount > 0) {
    const origins = bottlenecksByCategory(bottleneckAnalysis, "UNPLANNED_PENDING_TASKS");
    pushUnique(opportunitiesById, makeOpportunity("UNPLANNED_PENDING_TASKS", "Pending tasks without planned placement were detected.", [], { impactExpected: "increase_completion", pendingTaskCount: analysis.continuity.pendingTaskCount, urgency: "high", derivedOpportunityKind: "UNPLANNED_PENDING_TASKS" }, origins));
  }

  if (shouldEvaluate(bottleneckAnalysis, "RESOURCE_PRESSURE") && analysis.resourcePressure.overloadedResourceIds.length > 0) {
    const overloadedResourceIds = uniqueSortedNumbers(analysis.resourcePressure.overloadedResourceIds);
    const origins = bottlenecksByCategory(bottleneckAnalysis, "RESOURCE_PRESSURE");
    pushUnique(opportunitiesById, makeOpportunity("RESOURCE_PRESSURE", "Assigned resources appear in overlapping planned intervals.", taskIdsForResources(analysis, overloadedResourceIds), { impactExpected: "reduce_resource_conflicts", overloadedResourceIds, criticality: "high", derivedOpportunityKind: "RESOURCE_PRESSURE" }, origins));
  }

  if (shouldEvaluate(bottleneckAnalysis, "EXCESSIVE_TALENT_STAY") && analysis.operationalMargin.maxStayContestantId != null && analysis.operationalMargin.maxStayMinutes > 240) {
    const origins = bottlenecksByCategory(bottleneckAnalysis, "EXCESSIVE_TALENT_STAY");
    pushUnique(opportunitiesById, makeOpportunity("EXCESSIVE_TALENT_STAY", "A contestant has an extended planned stay window.", [], { impactExpected: "reduce_talent_stay", maxStayContestantId: analysis.operationalMargin.maxStayContestantId, maxStayMinutes: analysis.operationalMargin.maxStayMinutes, derivedOpportunityKind: "EXCESSIVE_TALENT_STAY" }, origins));
  }

  if (shouldEvaluate(bottleneckAnalysis, "LOCK_PRESSURE") && analysis.dependencySummary.lockCount > 0 && analysis.dependencySummary.lockCount >= Math.max(2, Math.ceil(analysis.continuity.taskCount * 0.25))) {
    const origins = bottlenecksByCategory(bottleneckAnalysis, "LOCK_PRESSURE");
    pushUnique(opportunitiesById, makeOpportunity("LOCK_PRESSURE", "Locks constrain a significant part of the operational state.", analysis.dependencySummary.lockedTaskIds, { impactExpected: "improve_locked_region_awareness", lockCount: analysis.dependencySummary.lockCount, dependencyCount: analysis.dependencySummary.dependencyCount, derivedOpportunityKind: "LOCK_PRESSURE" }, origins));
  } else if (shouldEvaluate(bottleneckAnalysis, "LOCK_PRESSURE") && analysis.dependencySummary.dependencyCount > 0 && analysis.dependencySummary.taskIdsWithDependencies.length > 0) {
    const origins = bottlenecksByCategory(bottleneckAnalysis, "LOCK_PRESSURE");
    pushUnique(opportunitiesById, makeOpportunity("LOCK_PRESSURE", "Critical dependencies constrain the operational sequence.", analysis.dependencySummary.taskIdsWithDependencies, { impactExpected: "improve_dependency_awareness", lockCount: analysis.dependencySummary.lockCount, dependencyCount: analysis.dependencySummary.dependencyCount, cause: "CRITICAL_DEPENDENCIES", derivedOpportunityKind: "LOCK_PRESSURE" }, origins));
  }

  if (shouldEvaluate(bottleneckAnalysis, "FRAGMENTATION") && analysis.fragmentation.totalSpaceSwitches > 2) {
    const origins = bottlenecksByCategory(bottleneckAnalysis, "FRAGMENTATION");
    pushUnique(opportunitiesById, makeOpportunity("FRAGMENTATION", "Talent flow includes repeated space switches.", allPlannedResourceTaskIds(analysis), { impactExpected: "reduce_space_switches", totalSpaceSwitches: analysis.fragmentation.totalSpaceSwitches, derivedOpportunityKind: "FRAGMENTATION" }, origins));
  }

  return { opportunities: prioritizeOpportunities([...opportunitiesById.values()]) };
}
