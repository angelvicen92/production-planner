import type { CognitiveState, Evidence, ORCRecord, SearchSpace } from "../contracts";
import type { PrioritizedOpportunity } from "../analysis/opportunityPrioritizationEngine";
import type { OperationalPriority, OperationalPriorityMap } from "../analysis/operationalPriorityAnalyzer";
import { shouldSkipSearchSpace } from "../cognitive/cognitiveFeedback";
import { pruneExhaustedSearchSpaces, type CognitivePruningStats } from "../cognitive/cognitivePruning";

export interface SearchSpaceBuildOptions {
  maxSearchSpaces?: number;
  maxTransformationsPerSpace?: number;
  maxAffectedTasksPerSpace?: number;
  operationalPriorityMap?: OperationalPriorityMap | null;
}

export interface SearchSpaceBuildResult {
  searchSpaces: SearchSpace[];
  evidence: Evidence[];
  summary: {
    opportunityCount: number;
    searchSpaceCount: number;
    skippedOpportunityCount: number;
    pruning: CognitivePruningStats;
    operationalPriorityCount: number;
    discardedPriorityCount: number;
    budget: {
      maxSearchSpaces: number;
      maxTransformationsPerSpace: number;
      maxAffectedTasksPerSpace: number;
    };
  };
}


export type SearchSpaceBuilderResult = SearchSpaceBuildResult;

type BuildOptions = SearchSpaceBuildOptions & { createdAt?: string | null; cognitiveState?: CognitiveState };

const DEFAULT_BUDGET = {
  maxSearchSpaces: 10,
  maxTransformationsPerSpace: 3,
  maxAffectedTasksPerSpace: 20,
};

const TRANSFORMATIONS = {
  MOVE_CHAIN_POSSIBLE: "MOVE_CHAIN_POSSIBLE",
  REORDER_REGION_POSSIBLE: "REORDER_REGION_POSSIBLE",
  RESOURCE_REASSIGNMENT_POSSIBLE: "RESOURCE_REASSIGNMENT_POSSIBLE",
  COMPACT_REGION_POSSIBLE: "COMPACT_REGION_POSSIBLE",
  LOCK_CONSTRAINED_EXPLORATION: "LOCK_CONSTRAINED_EXPLORATION",
  SCHEDULE_PENDING_TASKS_POSSIBLE: "SCHEDULE_PENDING_TASKS_POSSIBLE",
} as const;

const normalizeBudgetValue = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

const uniqueSortedTaskIds = (taskIds: readonly number[] | undefined): number[] =>
  [...new Set((taskIds ?? []).filter((id) => Number.isFinite(Number(id))).map(Number))].sort((a, b) => a - b);

const numberMetadata = (metadata: ORCRecord, key: string, fallback = 0): number =>
  typeof metadata[key] === "number" && Number.isFinite(metadata[key]) ? metadata[key] : fallback;

const numberArrayMetadata = (metadata: ORCRecord, key: string): number[] =>
  Array.isArray(metadata[key]) ? uniqueSortedTaskIds(metadata[key] as number[]) : [];


const normalizedPriorityIds = (priority: OperationalPriority): string[] =>
  [...new Set([priority.id, ...(priority.bottlenecks ?? []), ...(priority.criticalResources ?? []).map((id) => `resource:${id}`), ...(priority.activeConstraints ?? [])])].sort((a, b) => a.localeCompare(b));

const stringMetadata = (metadata: ORCRecord, key: string): string | null =>
  typeof metadata[key] === "string" && metadata[key].length > 0 ? metadata[key] : null;

const priorityMatchesOpportunity = (priority: OperationalPriority, opportunity: PrioritizedOpportunity): boolean => {
  const metadata = opportunity.metadata ?? {};
  const ids = normalizedPriorityIds(priority);
  const hasId = (id: string): boolean => ids.includes(id) || ids.some((value) => value.startsWith(`${id}:`));

  switch (opportunity.kind) {
    case "MAIN_FLOW_GAP": {
      const spaceOrZoneId = typeof metadata.spaceOrZoneId === "number" ? String(metadata.spaceOrZoneId) : null;
      return spaceOrZoneId != null ? hasId(`constraints:main-flow:${spaceOrZoneId}`) || hasId(`main-flow:${spaceOrZoneId}`) : ids.some((id) => id.startsWith("constraints:main-flow:") || id.startsWith("main-flow:"));
    }
    case "UNPLANNED_PENDING_TASKS":
      return hasId("continuity:pending-tasks");
    case "RESOURCE_PRESSURE": {
      const resourceIds = numberArrayMetadata(metadata, "overloadedResourceIds").map(String);
      return resourceIds.length > 0 ? resourceIds.some((id) => hasId(`resource:${id}`)) : ids.some((id) => id.startsWith("resource:"));
    }
    case "EXCESSIVE_TALENT_STAY": {
      const contestantId = typeof metadata.maxStayContestantId === "number" ? String(metadata.maxStayContestantId) : null;
      return contestantId != null ? hasId(`talent:${contestantId}`) : ids.some((id) => id.startsWith("talent:"));
    }
    case "LOCK_PRESSURE":
      return hasId("constraints:locks");
    case "FRAGMENTATION":
      return hasId("flow:space-switches");
    default: {
      const affectedRegion = stringMetadata(metadata, "affectedRegion") ?? opportunity.classification?.affectedRegion ?? null;
      return affectedRegion != null && hasId(affectedRegion);
    }
  }
};

const orderOpportunitiesByOperationalPriority = (
  opportunities: readonly PrioritizedOpportunity[],
  operationalPriorityMap: OperationalPriorityMap | null | undefined,
): { orderedOpportunities: PrioritizedOpportunity[]; discardedPriorities: OperationalPriority[]; opportunityPriorityById: Map<string, OperationalPriority | null> } => {
  const input = [...(opportunities ?? [])];
  const priorities = [...(operationalPriorityMap?.priorities ?? [])].sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
  if (priorities.length === 0) {
    return { orderedOpportunities: input, discardedPriorities: [], opportunityPriorityById: new Map(input.map((opportunity) => [opportunity.id, null])) };
  }

  const used = new Set<string>();
  const orderedOpportunities: PrioritizedOpportunity[] = [];
  const discardedPriorities: OperationalPriority[] = [];
  const opportunityPriorityById = new Map<string, OperationalPriority | null>();

  for (const priority of priorities) {
    const matches = input.filter((opportunity) => !used.has(opportunity.id) && priorityMatchesOpportunity(priority, opportunity));
    if (matches.length === 0) {
      discardedPriorities.push(priority);
      continue;
    }
    for (const opportunity of matches) {
      used.add(opportunity.id);
      orderedOpportunities.push(opportunity);
      opportunityPriorityById.set(opportunity.id, priority);
    }
  }

  for (const opportunity of input) {
    if (!used.has(opportunity.id)) {
      orderedOpportunities.push(opportunity);
      opportunityPriorityById.set(opportunity.id, null);
    }
  }

  return { orderedOpportunities, discardedPriorities, opportunityPriorityById };
};

function opportunityTemplate(opportunity: PrioritizedOpportunity): {
  region: string;
  regionDetails: Record<string, string | number | boolean | null | number[]>;
  transformations: string[];
  restrictions: string[];
} {
  const metadata = opportunity.metadata ?? {};
  switch (opportunity.kind) {
    case "MAIN_FLOW_GAP":
      return {
        region: "configured-main-flow",
        regionDetails: { spaceOrZoneId: typeof metadata.spaceOrZoneId === "number" ? metadata.spaceOrZoneId : null, gapCount: numberMetadata(metadata, "gapCount") },
        transformations: [TRANSFORMATIONS.MOVE_CHAIN_POSSIBLE, TRANSFORMATIONS.REORDER_REGION_POSSIBLE, TRANSFORMATIONS.COMPACT_REGION_POSSIBLE],
        restrictions: ["do-not-touch-locks", "do-not-touch-in-progress-or-done", "respect-configured-space-or-zone"],
      };
    case "UNPLANNED_PENDING_TASKS":
      return {
        region: "unplanned-pending-tasks",
        regionDetails: { pendingTaskCount: numberMetadata(metadata, "pendingTaskCount") },
        transformations: [TRANSFORMATIONS.SCHEDULE_PENDING_TASKS_POSSIBLE],
        restrictions: ["respect-availability", "respect-meal", "respect-locks", "respect-resources"],
      };
    case "RESOURCE_PRESSURE":
      return {
        region: "resource-pressure",
        regionDetails: { overloadedResourceIds: numberArrayMetadata(metadata, "overloadedResourceIds") },
        transformations: [TRANSFORMATIONS.RESOURCE_REASSIGNMENT_POSSIBLE],
        restrictions: ["respect-availability", "respect-resource-type", "respect-locks"],
      };
    case "EXCESSIVE_TALENT_STAY":
      return {
        region: "affected-contestant-schedule",
        regionDetails: { contestantId: typeof metadata.maxStayContestantId === "number" ? metadata.maxStayContestantId : null, maxStayMinutes: numberMetadata(metadata, "maxStayMinutes") },
        transformations: [TRANSFORMATIONS.COMPACT_REGION_POSSIBLE, TRANSFORMATIONS.REORDER_REGION_POSSIBLE],
        restrictions: ["respect-dependencies", "respect-locks", "prevent-overlaps"],
      };
    case "LOCK_PRESSURE":
      return {
        region: "active-locks",
        regionDetails: { lockCount: numberMetadata(metadata, "lockCount") },
        transformations: [TRANSFORMATIONS.LOCK_CONSTRAINED_EXPLORATION],
        restrictions: ["do-not-break-locks"],
      };
    case "FRAGMENTATION":
      return {
        region: "fragmented-talent-or-space-region",
        regionDetails: { totalSpaceSwitches: numberMetadata(metadata, "totalSpaceSwitches") },
        transformations: [TRANSFORMATIONS.COMPACT_REGION_POSSIBLE, TRANSFORMATIONS.REORDER_REGION_POSSIBLE],
        restrictions: ["respect-zones", "respect-availability", "respect-locks"],
      };
    default:
      return { region: opportunity.classification?.affectedRegion ?? "unknown-opportunity-region", regionDetails: {}, transformations: [], restrictions: ["read-only"] };
  }
}

export function buildSearchSpaces(
  opportunities: PrioritizedOpportunity[],
  options: BuildOptions = {},
): SearchSpaceBuildResult {
  const budget = {
    maxSearchSpaces: normalizeBudgetValue(options.maxSearchSpaces, DEFAULT_BUDGET.maxSearchSpaces),
    maxTransformationsPerSpace: normalizeBudgetValue(options.maxTransformationsPerSpace, DEFAULT_BUDGET.maxTransformationsPerSpace),
    maxAffectedTasksPerSpace: normalizeBudgetValue(options.maxAffectedTasksPerSpace, DEFAULT_BUDGET.maxAffectedTasksPerSpace),
  };
  const createdAt = options.createdAt ?? null;
  const { orderedOpportunities, discardedPriorities, opportunityPriorityById } = orderOpportunitiesByOperationalPriority(opportunities ?? [], options.operationalPriorityMap);
  const searchSpaces: SearchSpace[] = [];
  const evidence: Evidence[] = [];

  for (const priority of discardedPriorities) {
    evidence.push({
      id: `evidence:orc-see:operational-priority:discarded:${priority.id}`,
      source: "orc-see",
      kind: "operational-priority-discarded",
      subjectId: priority.id,
      createdAt,
      data: { priority: { id: priority.id, priorityScore: priority.priorityScore, bottlenecks: [...priority.bottlenecks], criticalResources: [...priority.criticalResources], activeConstraints: [...priority.activeConstraints], explanation: priority.explanation }, reason: "no-associated-opportunity", explanation: "Operational priority was considered but did not match any available prioritized opportunity.", readOnly: true },
    });
  }

  for (const opportunity of orderedOpportunities) {
    if (searchSpaces.length >= budget.maxSearchSpaces) {
      evidence.push({
        id: `evidence:orc-see:search-space:skipped:${opportunity.id}`,
        source: "orc-see",
        kind: "search-space-skipped",
        subjectId: opportunity.id,
        createdAt,
        data: { opportunityId: opportunity.id, opportunityKind: opportunity.kind, priority: opportunity.priority, prioritizationRationale: [...opportunity.rationale], reason: "max-search-spaces-budget-exhausted", budget },
      });
      continue;
    }

    const sourceOperationalPriority = opportunityPriorityById.get(opportunity.id) ?? null;
    const template = opportunityTemplate(opportunity);
    const fullTaskIds = uniqueSortedTaskIds(opportunity.taskIds);
    const taskIds = fullTaskIds.slice(0, budget.maxAffectedTasksPerSpace);
    const transformations = template.transformations.slice(0, budget.maxTransformationsPerSpace);
    const id = `orc-see:search-space:${opportunity.id}`;
    const evidenceId = `evidence:orc-see:search-space:${opportunity.id}`;
    const repeatedByCognitiveMemory = options.cognitiveState ? shouldSkipSearchSpace(options.cognitiveState, id) : false;

    const builtSearchSpace: SearchSpace = {
      id,
      description: `Read-only search space for ${opportunity.kind}`,
      taskIds,
      candidates: [],
      evidenceIds: [evidenceId],
      metadata: {
        readOnly: true,
        sourceOpportunityId: opportunity.id,
        sourceOpportunityKind: opportunity.kind,
        sourceOpportunityPriority: opportunity.priority,
        sourceOpportunityRationale: [...opportunity.rationale],
        sourceOperationalPriority: sourceOperationalPriority == null ? null : { id: sourceOperationalPriority.id, priorityScore: sourceOperationalPriority.priorityScore, explanation: sourceOperationalPriority.explanation },
        affectedRegion: template.region,
        regionDetails: template.regionDetails,
        allowedTransformations: transformations,
        localRestrictions: template.restrictions,
        budget,
        originalAffectedTaskCount: fullTaskIds.length,
        truncatedAffectedTasks: fullTaskIds.length > taskIds.length,
        generatesCandidates: false,
        executesTransformations: false,
        cognitiveFeedback: { repeatedByCognitiveMemory, potentialOmittable: repeatedByCognitiveMemory, observationalOnly: true },
      },
    };

    searchSpaces.push(builtSearchSpace);
    evidence.push({
      id: evidenceId,
      source: "orc-see",
      kind: "search-space-built",
      subjectId: id,
      createdAt,
      data: {
        opportunity: {
          id: opportunity.id,
          kind: opportunity.kind,
          taskIds: [...opportunity.taskIds],
          classification: { ...opportunity.classification, constraints: [...opportunity.classification.constraints] },
        },
        opportunityId: opportunity.id,
        opportunityKind: opportunity.kind,
        priority: opportunity.priority,
        sourceOperationalPriority: sourceOperationalPriority == null ? null : { id: sourceOperationalPriority.id, priorityScore: sourceOperationalPriority.priorityScore, bottlenecks: [...sourceOperationalPriority.bottlenecks], criticalResources: [...sourceOperationalPriority.criticalResources], activeConstraints: [...sourceOperationalPriority.activeConstraints], explanation: sourceOperationalPriority.explanation },
        prioritizationRationale: [...opportunity.rationale],
        searchSpace: { id: builtSearchSpace.id, taskIds: [...builtSearchSpace.taskIds], metadata: builtSearchSpace.metadata },
        affectedRegion: template.region,
        budget,
        allowedTransformations: transformations,
        localRestrictions: template.restrictions,
        taskIds,
        readOnly: true,
        cognitiveFeedback: { repeatedByCognitiveMemory, potentialOmittable: repeatedByCognitiveMemory, observationalOnly: true },
      },
    });
  }

  const pruningResult = options.cognitiveState ? pruneExhaustedSearchSpaces(options.cognitiveState, searchSpaces) : { items: searchSpaces, stats: { generatedCount: searchSpaces.length, keptCount: searchSpaces.length, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] } };
  for (const item of pruningResult.stats.prunedItems) {
    evidence.push({
      id: `evidence:orc-see:search-space:pruned:${item.id}`,
      source: "orc-see",
      kind: "search-space-pruned",
      subjectId: item.id,
      createdAt,
      data: { searchSpaceId: item.id, reason: item.reason, phase: item.phase, estimatedBudgetSaved: item.estimatedBudgetSaved, readOnly: true },
    });
  }

  return {
    searchSpaces: pruningResult.items,
    evidence,
    summary: {
      opportunityCount: orderedOpportunities.length,
      searchSpaceCount: pruningResult.items.length,
      skippedOpportunityCount: orderedOpportunities.length - pruningResult.items.length,
      operationalPriorityCount: options.operationalPriorityMap?.priorities.length ?? 0,
      discardedPriorityCount: discardedPriorities.length,
      pruning: pruningResult.stats,
      budget,
    },
  };
}

export const buildSearchSpacesForOpportunities = buildSearchSpaces;

export type { AdaptiveSearchSpaceResult } from "./adaptiveSearchSpaceBuilder";
export { buildAdaptiveSearchSpaces } from "./adaptiveSearchSpaceBuilder";
