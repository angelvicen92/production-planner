import type { OperationalAnalysis } from "../analysis/operationalStateAnalyzer";
import { analyzeOperationalState } from "../analysis/operationalStateAnalyzer";
import type { CognitiveState, Evidence, OperationalState, Opportunity, ORCRecord } from "../contracts";
import { shouldSkipOpportunity } from "../cognitive/cognitiveFeedback";
import { pruneRepeatedOpportunities, type CognitivePruningStats } from "../cognitive/cognitivePruning";
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

export interface OpportunityDetectionOptions {
  cognitiveState?: CognitiveState;
}

export function detectOpportunitiesFromOperationalAnalysis(state: OperationalState, analysis: OperationalAnalysis, options: OpportunityDetectionOptions = {}): Opportunity[] {
  const opportunities: Opportunity[] = [];
  if (analysis.continuity.mainFlow.configured && analysis.continuity.mainFlow.gapCount > 0) {
    opportunities.push(makeOpportunity("MAIN_FLOW_GAP", "Internal gaps were detected in the configured main flow.", [...analysis.continuity.mainFlow.plannedTaskIds], { impactExpected: "reduce_idle_time", gapCount: analysis.continuity.mainFlow.gapCount, internalGapMinutes: analysis.continuity.mainFlow.internalGapMinutes, affectedRegion: "main-flow" }));
  }
  if (analysis.continuity.pendingTaskCount > 0) {
    const pendingTaskIds = (state.tasks ?? []).filter((task) => task.status === "pending" && !(state.planning ?? []).some((item) => item.taskId === task.id)).map((task) => task.id);
    opportunities.push(makeOpportunity("UNPLANNED_PENDING_TASKS", "Pending tasks without planned placement were detected.", pendingTaskIds, { impactExpected: "increase_completion", pendingTaskCount: analysis.continuity.pendingTaskCount, urgency: "high" }));
  }
  if (analysis.resourcePressure.overloadedResourceIds.length > 0) {
    const overloadedResourceIds = [...analysis.resourcePressure.overloadedResourceIds];
    const taskIds = (state.planning ?? []).filter((item) => (item.assignedResourceIds ?? []).some((id) => overloadedResourceIds.includes(id))).map((item) => item.taskId);
    opportunities.push(makeOpportunity("RESOURCE_PRESSURE", "Assigned resources appear in overlapping planned intervals.", taskIds, { impactExpected: "reduce_resource_conflicts", overloadedResourceIds, criticality: "high" }));
  }
  if (analysis.operationalMargin.maxStayContestantId != null && analysis.operationalMargin.maxStayMinutes > 240) {
    const taskIds = (state.planning ?? []).filter((item) => state.tasks.find((task) => task.id === item.taskId)?.contestantId === analysis.operationalMargin.maxStayContestantId).map((item) => item.taskId);
    opportunities.push(makeOpportunity("EXCESSIVE_TALENT_STAY", "A contestant has an extended planned stay window.", taskIds, { impactExpected: "reduce_talent_stay", maxStayContestantId: analysis.operationalMargin.maxStayContestantId, maxStayMinutes: analysis.operationalMargin.maxStayMinutes }));
  }
  if (analysis.dependencySummary.lockCount > 0 && analysis.dependencySummary.lockCount >= Math.max(2, Math.ceil(analysis.continuity.taskCount * 0.25))) {
    opportunities.push(makeOpportunity("LOCK_PRESSURE", "Locks constrain a significant part of the operational state.", [...analysis.dependencySummary.lockedTaskIds], { impactExpected: "improve_locked_region_awareness", lockCount: analysis.dependencySummary.lockCount }));
  }
  if (analysis.fragmentation.totalSpaceSwitches > 2) {
    opportunities.push(makeOpportunity("FRAGMENTATION", "Talent flow includes repeated space switches.", state.planning.map((item) => item.taskId), { impactExpected: "reduce_space_switches", totalSpaceSwitches: analysis.fragmentation.totalSpaceSwitches }));
  }
  const ordered = prioritizeOpportunities(opportunities);
  return options.cognitiveState ? pruneRepeatedOpportunities(options.cognitiveState, ordered).items : ordered;
}

export function detectOpportunitiesFromOperationalMap(state: OperationalState, _map: OperationalMap, options: OpportunityDetectionOptions = {}): Opportunity[] {
  return detectOpportunitiesFromOperationalAnalysis(state, analyzeOperationalState(state), options);
}

export function detectOpportunitiesWithPruningFromOperationalAnalysis(state: OperationalState, analysis: OperationalAnalysis, options: OpportunityDetectionOptions = {}): { opportunities: Opportunity[]; pruning: CognitivePruningStats } {
  const unpruned = detectOpportunitiesFromOperationalAnalysis(state, analysis);
  const result = options.cognitiveState ? pruneRepeatedOpportunities(options.cognitiveState, unpruned) : { items: unpruned, stats: { generatedCount: unpruned.length, keptCount: unpruned.length, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] } };
  return { opportunities: result.items, pruning: result.stats };
}

export function detectOpportunitiesWithPruning(state: OperationalState, _map: OperationalMap, options: OpportunityDetectionOptions = {}): { opportunities: Opportunity[]; pruning: CognitivePruningStats } {
  return detectOpportunitiesWithPruningFromOperationalAnalysis(state, analyzeOperationalState(state), options);
}

export function buildOpportunityDetectionEvidence(state: OperationalState, map: OperationalMap, opportunities: Opportunity[], createdAt: string | null = null, cognitiveState?: CognitiveState): Evidence[] {
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
      cognitiveFeedback: {
        repeatedOpportunityIds: cognitiveState ? opportunities.filter((opportunity) => shouldSkipOpportunity(cognitiveState, opportunity)).map((opportunity) => opportunity.id) : [],
        potentialOmittableCount: cognitiveState ? opportunities.filter((opportunity) => shouldSkipOpportunity(cognitiveState, opportunity)).length : 0,
        observationalOnly: true,
      },
    },
  }];
}
