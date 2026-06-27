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

const makeOpportunity = (kind: ORCOpportunityKind, description: string, taskIds: readonly number[], metadata: ORCRecord): Opportunity => ({
  id: `orc-see:${kind.toLowerCase()}:${taskIds.length ? uniqueSortedNumbers(taskIds).join("-") : "state"}`,
  kind,
  description,
  taskIds: uniqueSortedNumbers(taskIds),
  searchSpaceIds: [],
  evidenceIds: [`evidence:orc-see:${kind.toLowerCase()}`],
  metadata: {
    priority: PRIORITY[kind],
    impactExpected: "unknown",
    urgency: "medium",
    criticality: "medium",
    confidence: 0.8,
    cause: kind,
    affectedRegion: "operational-state",
    ...metadata,
  },
});

export function detectOpportunities(analysis: OperationalAnalysis): OpportunityDetectionResult {
  const opportunities: Opportunity[] = [];

  if (analysis.continuity.mainFlow.configured && analysis.continuity.mainFlow.gapCount > 0) {
    opportunities.push(makeOpportunity("MAIN_FLOW_GAP", "Internal gaps were detected in the configured main flow.", analysis.continuity.mainFlow.plannedTaskIds, { impactExpected: "reduce_idle_time", gapCount: analysis.continuity.mainFlow.gapCount, internalGapMinutes: analysis.continuity.mainFlow.internalGapMinutes, affectedRegion: "main-flow" }));
  }

  if (analysis.continuity.pendingTaskCount > 0) {
    opportunities.push(makeOpportunity("UNPLANNED_PENDING_TASKS", "Pending tasks without planned placement were detected.", [], { impactExpected: "increase_completion", pendingTaskCount: analysis.continuity.pendingTaskCount, urgency: "high" }));
  }

  if (analysis.resourcePressure.overloadedResourceIds.length > 0) {
    const overloadedResourceIds = uniqueSortedNumbers(analysis.resourcePressure.overloadedResourceIds);
    opportunities.push(makeOpportunity("RESOURCE_PRESSURE", "Assigned resources appear in overlapping planned intervals.", taskIdsForResources(analysis, overloadedResourceIds), { impactExpected: "reduce_resource_conflicts", overloadedResourceIds, criticality: "high" }));
  }

  if (analysis.operationalMargin.maxStayContestantId != null && analysis.operationalMargin.maxStayMinutes > 240) {
    opportunities.push(makeOpportunity("EXCESSIVE_TALENT_STAY", "A contestant has an extended planned stay window.", [], { impactExpected: "reduce_talent_stay", maxStayContestantId: analysis.operationalMargin.maxStayContestantId, maxStayMinutes: analysis.operationalMargin.maxStayMinutes }));
  }

  if (analysis.dependencySummary.lockCount > 0 && analysis.dependencySummary.lockCount >= Math.max(2, Math.ceil(analysis.continuity.taskCount * 0.25))) {
    opportunities.push(makeOpportunity("LOCK_PRESSURE", "Locks constrain a significant part of the operational state.", analysis.dependencySummary.lockedTaskIds, { impactExpected: "improve_locked_region_awareness", lockCount: analysis.dependencySummary.lockCount, dependencyCount: analysis.dependencySummary.dependencyCount }));
  } else if (analysis.dependencySummary.dependencyCount > 0 && analysis.dependencySummary.taskIdsWithDependencies.length > 0) {
    opportunities.push(makeOpportunity("LOCK_PRESSURE", "Critical dependencies constrain the operational sequence.", analysis.dependencySummary.taskIdsWithDependencies, { impactExpected: "improve_dependency_awareness", lockCount: analysis.dependencySummary.lockCount, dependencyCount: analysis.dependencySummary.dependencyCount, cause: "CRITICAL_DEPENDENCIES" }));
  }

  if (analysis.fragmentation.totalSpaceSwitches > 2) {
    opportunities.push(makeOpportunity("FRAGMENTATION", "Talent flow includes repeated space switches.", allPlannedResourceTaskIds(analysis), { impactExpected: "reduce_space_switches", totalSpaceSwitches: analysis.fragmentation.totalSpaceSwitches }));
  }

  return { opportunities: prioritizeOpportunities(opportunities) };
}
