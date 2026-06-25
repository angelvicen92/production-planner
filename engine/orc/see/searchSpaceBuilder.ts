import type { Evidence, OperationalState, Opportunity, SearchSpace } from "../contracts";
import type { OperationalMap } from "./operationalMap";
import { prioritizeOpportunities } from "./opportunityPriority";

export interface SearchSpaceBuildOptions {
  maxSearchSpaces?: number;
  maxTransformationsPerSpace?: number;
  maxAffectedTasksPerSpace?: number;
}

export interface SearchSpaceBuildResult {
  searchSpaces: SearchSpace[];
  evidence: Evidence[];
  summary: {
    opportunityCount: number;
    searchSpaceCount: number;
    skippedOpportunityCount: number;
    budget: {
      maxSearchSpaces: number;
      maxTransformationsPerSpace: number;
      maxAffectedTasksPerSpace: number;
    };
  };
}

type BuildOptions = SearchSpaceBuildOptions & { createdAt?: string | null };

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

const uniqueSortedTaskIds = (taskIds: number[] | undefined): number[] =>
  [...new Set((taskIds ?? []).filter((id) => Number.isFinite(Number(id))).map(Number))].sort((a, b) => a - b);

function opportunityTemplate(opportunity: Opportunity, state: OperationalState, map: OperationalMap): {
  region: string;
  regionDetails: Record<string, string | number | boolean | null | number[]>;
  transformations: string[];
  restrictions: string[];
  fallbackTaskIds: number[];
} {
  switch (opportunity.kind) {
    case "MAIN_FLOW_GAP":
      return {
        region: "configured-main-flow",
        regionDetails: { spaceOrZoneId: map.mainFlow?.spaceOrZoneId ?? null, gapCount: map.mainFlow?.gapCount ?? 0 },
        transformations: [TRANSFORMATIONS.MOVE_CHAIN_POSSIBLE, TRANSFORMATIONS.REORDER_REGION_POSSIBLE, TRANSFORMATIONS.COMPACT_REGION_POSSIBLE],
        restrictions: ["do-not-touch-locks", "do-not-touch-in-progress-or-done", "respect-configured-space-or-zone"],
        fallbackTaskIds: map.mainFlow?.plannedTaskIds ?? [],
      };
    case "UNPLANNED_PENDING_TASKS":
      return {
        region: "unplanned-pending-tasks",
        regionDetails: { pendingTaskCount: map.pendingTaskCount },
        transformations: [TRANSFORMATIONS.SCHEDULE_PENDING_TASKS_POSSIBLE],
        restrictions: ["respect-availability", "respect-meal", "respect-locks", "respect-resources"],
        fallbackTaskIds: (state.tasks ?? []).filter((task) => task.status === "pending" && !(state.planning ?? []).some((item) => item.taskId === task.id)).map((task) => task.id),
      };
    case "RESOURCE_PRESSURE":
      return {
        region: "resource-pressure",
        regionDetails: { overloadedResourceIds: map.resources.overloadedResourceIds },
        transformations: [TRANSFORMATIONS.RESOURCE_REASSIGNMENT_POSSIBLE],
        restrictions: ["respect-availability", "respect-resource-type", "respect-locks"],
        fallbackTaskIds: [],
      };
    case "EXCESSIVE_TALENT_STAY":
      return {
        region: "affected-contestant-schedule",
        regionDetails: { contestantId: typeof opportunity.metadata.maxStayContestantId === "number" ? opportunity.metadata.maxStayContestantId : map.talents.maxStayContestantId, maxStayMinutes: typeof opportunity.metadata.maxStayMinutes === "number" ? opportunity.metadata.maxStayMinutes : map.talents.maxStayMinutes },
        transformations: [TRANSFORMATIONS.COMPACT_REGION_POSSIBLE, TRANSFORMATIONS.REORDER_REGION_POSSIBLE],
        restrictions: ["respect-dependencies", "respect-locks", "prevent-overlaps"],
        fallbackTaskIds: [],
      };
    case "LOCK_PRESSURE":
      return {
        region: "active-locks",
        regionDetails: { lockCount: map.lockCount },
        transformations: [TRANSFORMATIONS.LOCK_CONSTRAINED_EXPLORATION],
        restrictions: ["do-not-break-locks"],
        fallbackTaskIds: (state.locks ?? []).map((lock) => lock.taskId),
      };
    case "FRAGMENTATION":
      return {
        region: "fragmented-talent-or-space-region",
        regionDetails: { totalSpaceSwitches: map.fragmentation.totalSpaceSwitches },
        transformations: [TRANSFORMATIONS.COMPACT_REGION_POSSIBLE, TRANSFORMATIONS.REORDER_REGION_POSSIBLE],
        restrictions: ["respect-zones", "respect-availability", "respect-locks"],
        fallbackTaskIds: (state.planning ?? []).map((item) => item.taskId),
      };
    default:
      return { region: "unknown-opportunity-region", regionDetails: {}, transformations: [], restrictions: ["read-only"], fallbackTaskIds: [] };
  }
}

export function buildSearchSpacesForOpportunities(
  state: OperationalState,
  map: OperationalMap,
  opportunities: Opportunity[],
  options: BuildOptions = {},
): SearchSpaceBuildResult {
  const budget = {
    maxSearchSpaces: normalizeBudgetValue(options.maxSearchSpaces, DEFAULT_BUDGET.maxSearchSpaces),
    maxTransformationsPerSpace: normalizeBudgetValue(options.maxTransformationsPerSpace, DEFAULT_BUDGET.maxTransformationsPerSpace),
    maxAffectedTasksPerSpace: normalizeBudgetValue(options.maxAffectedTasksPerSpace, DEFAULT_BUDGET.maxAffectedTasksPerSpace),
  };
  const createdAt = options.createdAt ?? null;
  const orderedOpportunities = prioritizeOpportunities([...(opportunities ?? [])]);
  const searchSpaces: SearchSpace[] = [];
  const evidence: Evidence[] = [];

  for (const opportunity of orderedOpportunities) {
    if (searchSpaces.length >= budget.maxSearchSpaces) {
      evidence.push({
        id: `evidence:orc-see:search-space:skipped:${opportunity.id}`,
        source: "orc-see",
        kind: "search-space-skipped",
        subjectId: opportunity.id,
        createdAt,
        data: { opportunityId: opportunity.id, opportunityKind: opportunity.kind, reason: "max-search-spaces-budget-exhausted", budget },
      });
      continue;
    }

    const template = opportunityTemplate(opportunity, state, map);
    const fullTaskIds = uniqueSortedTaskIds(opportunity.taskIds?.length ? opportunity.taskIds : template.fallbackTaskIds);
    const taskIds = fullTaskIds.slice(0, budget.maxAffectedTasksPerSpace);
    const transformations = template.transformations.slice(0, budget.maxTransformationsPerSpace);
    const id = `orc-see:search-space:${opportunity.id}`;
    const evidenceId = `evidence:orc-see:search-space:${opportunity.id}`;

    searchSpaces.push({
      id,
      description: `Read-only search space for ${opportunity.kind}`,
      taskIds,
      candidates: [],
      evidenceIds: [evidenceId],
      metadata: {
        readOnly: true,
        sourceOpportunityId: opportunity.id,
        sourceOpportunityKind: opportunity.kind,
        affectedRegion: template.region,
        regionDetails: template.regionDetails,
        allowedTransformations: transformations,
        localRestrictions: template.restrictions,
        budget,
        originalAffectedTaskCount: fullTaskIds.length,
        truncatedAffectedTasks: fullTaskIds.length > taskIds.length,
        generatesCandidates: false,
        executesTransformations: false,
      },
    });

    evidence.push({
      id: evidenceId,
      source: "orc-see",
      kind: "search-space-built",
      subjectId: id,
      createdAt,
      data: {
        opportunityId: opportunity.id,
        opportunityKind: opportunity.kind,
        affectedRegion: template.region,
        budget,
        allowedTransformations: transformations,
        localRestrictions: template.restrictions,
        taskIds,
        readOnly: true,
      },
    });
  }

  return {
    searchSpaces,
    evidence,
    summary: {
      opportunityCount: orderedOpportunities.length,
      searchSpaceCount: searchSpaces.length,
      skippedOpportunityCount: orderedOpportunities.length - searchSpaces.length,
      budget,
    },
  };
}
