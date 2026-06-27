import type { Opportunity, ORCRecord } from "../contracts";

export interface OpportunityClassification {
  readonly family: string;
  readonly affectedRegion: string;
  readonly expectedImpact: string | null;
  readonly operationalSignal: string;
  readonly constraints: readonly string[];
}

export interface ClassifiedOpportunity extends Opportunity {
  readonly classification: OpportunityClassification;
}

export interface OpportunityClassificationResult {
  readonly opportunities: ClassifiedOpportunity[];
}

const FAMILY_BY_KIND: Record<string, string> = {
  MAIN_FLOW_GAP: "continuity",
  UNPLANNED_PENDING_TASKS: "completion",
  RESOURCE_PRESSURE: "resource",
  EXCESSIVE_TALENT_STAY: "operational-margin",
  LOCK_PRESSURE: "constraints",
  FRAGMENTATION: "fragmentation",
};

const SIGNAL_BY_KIND: Record<string, string> = {
  MAIN_FLOW_GAP: "main-flow-gap",
  UNPLANNED_PENDING_TASKS: "unplanned-pending-tasks",
  RESOURCE_PRESSURE: "resource-pressure",
  EXCESSIVE_TALENT_STAY: "excessive-talent-stay",
  LOCK_PRESSURE: "lock-pressure",
  FRAGMENTATION: "space-fragmentation",
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function constraintsFrom(metadata: ORCRecord): string[] {
  const constraints = new Set<string>();
  if (typeof metadata.lockCount === "number" && metadata.lockCount > 0) constraints.add("locks");
  if (typeof metadata.dependencyCount === "number" && metadata.dependencyCount > 0) constraints.add("dependencies");
  if (Array.isArray(metadata.overloadedResourceIds) && metadata.overloadedResourceIds.length > 0) constraints.add("resource-overlap");
  if (metadata.cause === "CRITICAL_DEPENDENCIES") constraints.add("critical-dependencies");
  return [...constraints].sort();
}

function classifyOpportunity(opportunity: Opportunity): ClassifiedOpportunity {
  const metadata = { ...(opportunity.metadata ?? {}) };
  const affectedRegion = stringValue(metadata.affectedRegion) ?? FAMILY_BY_KIND[opportunity.kind] ?? "generic";

  return {
    ...opportunity,
    taskIds: [...opportunity.taskIds],
    searchSpaceIds: [...opportunity.searchSpaceIds],
    evidenceIds: [...opportunity.evidenceIds],
    metadata,
    classification: {
      family: FAMILY_BY_KIND[opportunity.kind] ?? "generic",
      affectedRegion,
      expectedImpact: stringValue(metadata.impactExpected),
      operationalSignal: SIGNAL_BY_KIND[opportunity.kind] ?? String(opportunity.kind).toLowerCase(),
      constraints: constraintsFrom(metadata),
    },
  };
}

export function classifyOpportunities(opportunities: Opportunity[]): OpportunityClassificationResult {
  return { opportunities: [...(opportunities ?? [])].map(classifyOpportunity) };
}
