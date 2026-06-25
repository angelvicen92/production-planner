import type { Evidence, OperationalState, Opportunity, ORCRecord } from "../contracts";
import type { OperationalMap } from "./operationalMap";
import { prioritizeOpportunities } from "./opportunityPriority";

export type ORCOpportunityKind =
  | "MAIN_FLOW_GAP"
  | "EXCESSIVE_TALENT_STAY"
  | "RESOURCE_PRESSURE"
  | "FRAGMENTATION"
  | "LOCK_PRESSURE"
  | "UNPLANNED_PENDING_TASKS";

const PRIORITY: Record<ORCOpportunityKind, number> = {
  MAIN_FLOW_GAP: 100,
  UNPLANNED_PENDING_TASKS: 90,
  RESOURCE_PRESSURE: 80,
  EXCESSIVE_TALENT_STAY: 70,
  LOCK_PRESSURE: 60,
  FRAGMENTATION: 50,
};

const makeOpportunity = (kind: ORCOpportunityKind, description: string, taskIds: number[], metadata: ORCRecord): Opportunity => ({
  id: `orc-see:${kind.toLowerCase()}:${taskIds.length ? taskIds.join("-") : "state"}`,
  kind,
  description,
  taskIds: [...new Set(taskIds)].sort((a, b) => a - b),
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

export function detectOpportunitiesFromOperationalMap(state: OperationalState, map: OperationalMap): Opportunity[] {
  const opportunities: Opportunity[] = [];
  if (map.mainFlow?.configured && map.mainFlow.gapCount > 0) {
    opportunities.push(makeOpportunity("MAIN_FLOW_GAP", "Internal gaps were detected in the configured main flow.", map.mainFlow.plannedTaskIds, { impactExpected: "reduce_idle_time", gapCount: map.mainFlow.gapCount, internalGapMinutes: map.mainFlow.internalGapMinutes, affectedRegion: "main-flow" }));
  }
  if (map.pendingTaskCount > 0) {
    const pendingTaskIds = (state.tasks ?? []).filter((task) => task.status === "pending" && !(state.planning ?? []).some((item) => item.taskId === task.id)).map((task) => task.id);
    opportunities.push(makeOpportunity("UNPLANNED_PENDING_TASKS", "Pending tasks without planned placement were detected.", pendingTaskIds, { impactExpected: "increase_completion", pendingTaskCount: map.pendingTaskCount, urgency: "high" }));
  }
  if (map.resources.overloadedResourceIds.length > 0) {
    const taskIds = (state.planning ?? []).filter((item) => (item.assignedResourceIds ?? []).some((id) => map.resources.overloadedResourceIds.includes(id))).map((item) => item.taskId);
    opportunities.push(makeOpportunity("RESOURCE_PRESSURE", "Assigned resources appear in overlapping planned intervals.", taskIds, { impactExpected: "reduce_resource_conflicts", overloadedResourceIds: map.resources.overloadedResourceIds, criticality: "high" }));
  }
  if (map.talents.maxStayContestantId != null && map.talents.maxStayMinutes > 240) {
    const taskIds = (state.planning ?? []).filter((item) => state.tasks.find((task) => task.id === item.taskId)?.contestantId === map.talents.maxStayContestantId).map((item) => item.taskId);
    opportunities.push(makeOpportunity("EXCESSIVE_TALENT_STAY", "A contestant has an extended planned stay window.", taskIds, { impactExpected: "reduce_talent_stay", maxStayContestantId: map.talents.maxStayContestantId, maxStayMinutes: map.talents.maxStayMinutes }));
  }
  if (map.lockCount > 0 && map.lockCount >= Math.max(2, Math.ceil(map.taskCount * 0.25))) {
    opportunities.push(makeOpportunity("LOCK_PRESSURE", "Locks constrain a significant part of the operational state.", (state.locks ?? []).map((lock) => lock.taskId), { impactExpected: "improve_locked_region_awareness", lockCount: map.lockCount }));
  }
  if (map.fragmentation.totalSpaceSwitches > 2) {
    opportunities.push(makeOpportunity("FRAGMENTATION", "Talent flow includes repeated space switches.", state.planning.map((item) => item.taskId), { impactExpected: "reduce_space_switches", totalSpaceSwitches: map.fragmentation.totalSpaceSwitches }));
  }
  return prioritizeOpportunities(opportunities);
}

export function buildOpportunityDetectionEvidence(state: OperationalState, map: OperationalMap, opportunities: Opportunity[], createdAt: string | null = null): Evidence[] {
  return [{
    id: `evidence:orc-see:opportunity-detection:${state.id}`,
    source: "orc-see",
    kind: "opportunity-detection",
    subjectId: state.id,
    createdAt,
    data: {
      stateId: state.id,
      mapSummary: { taskCount: map.taskCount, plannedTaskCount: map.plannedTaskCount, pendingTaskCount: map.pendingTaskCount, lockCount: map.lockCount, mainFlowGapCount: map.mainFlow?.gapCount ?? 0, totalSpaceSwitches: map.fragmentation.totalSpaceSwitches },
      opportunityIds: opportunities.map((opportunity) => opportunity.id),
      opportunityKinds: opportunities.map((opportunity) => opportunity.kind),
      priority: opportunities.map((opportunity) => ({ id: opportunity.id, priority: opportunity.metadata.priority ?? null })),
    },
  }];
}
