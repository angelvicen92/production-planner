import type { ORCRecord } from "../contracts";
import type { DynamicBottleneckAnalysis } from "./dynamicBottleneckAnalyzer";
import type { ClassifiedOpportunity } from "./opportunityClassificationEngine";

export interface PrioritizedOpportunity extends ClassifiedOpportunity {
  priority: number;
  rationale: string[];
}

export interface OpportunityPrioritizationResult {
  opportunities: PrioritizedOpportunity[];
}

export interface OpportunityPrioritizationOptions {
  readonly dynamicBottleneckAnalysis?: DynamicBottleneckAnalysis | null;
}

const FAMILY_PRIORITY: Record<string, number> = {
  continuity: 100,
  completion: 90,
  resource: 80,
  "operational-margin": 70,
  constraints: 60,
  fragmentation: 50,
};

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const cloneMetadata = (metadata: ORCRecord | undefined): ORCRecord => ({ ...(metadata ?? {}) });

function basePriority(opportunity: ClassifiedOpportunity): { priority: number; criterion: string } {
  const explicitPriority = numeric(opportunity.metadata?.priority);
  if (explicitPriority !== null) return { priority: explicitPriority, criterion: "metadata.priority" };

  const familyPriority = FAMILY_PRIORITY[opportunity.classification.family];
  if (typeof familyPriority === "number") return { priority: familyPriority, criterion: "classification.family" };

  return { priority: 0, criterion: "classification.family:fallback" };
}

function prioritizeOpportunity(opportunity: ClassifiedOpportunity, dynamicBoost = 0, dynamicBottleneckIds: readonly string[] = []): PrioritizedOpportunity {
  const base = basePriority(opportunity);
  const priority = base.priority + dynamicBoost;
  const criterion = dynamicBoost > 0 ? `${base.criterion}+dynamic-bottleneck` : base.criterion;
  const rationale = [
    `priority=${priority}`,
    `criterion=${criterion}`,
    `family=${opportunity.classification.family}`,
    `operationalSignal=${opportunity.classification.operationalSignal}`,
    `affectedRegion=${opportunity.classification.affectedRegion}`,
  ];

  if (opportunity.classification.expectedImpact !== null) {
    rationale.push(`expectedImpact=${opportunity.classification.expectedImpact}`);
  }
  if (opportunity.classification.constraints.length > 0) {
    rationale.push(`constraints=${opportunity.classification.constraints.join(",")}`);
  }
  if (dynamicBoost > 0) {
    rationale.push(`dynamicBottleneckBoost=${dynamicBoost}`);
    rationale.push(`dynamicBottleneckIds=${dynamicBottleneckIds.join(",")}`);
  }

  return {
    ...opportunity,
    taskIds: [...opportunity.taskIds],
    searchSpaceIds: [...opportunity.searchSpaceIds],
    evidenceIds: [...opportunity.evidenceIds],
    metadata: cloneMetadata(opportunity.metadata),
    classification: {
      ...opportunity.classification,
      constraints: [...opportunity.classification.constraints],
    },
    priority,
    rationale,
  };
}

export function prioritizeOpportunities(
  opportunities: ClassifiedOpportunity[],
  options: OpportunityPrioritizationOptions = {},
): OpportunityPrioritizationResult {
  const impactByOpportunity = new Map((options.dynamicBottleneckAnalysis?.opportunityImpacts ?? []).map((impact) => [impact.opportunityId, impact]));
  const prioritized = [...(opportunities ?? [])].map((opportunity, index) => {
    const impact = impactByOpportunity.get(opportunity.id);
    return {
      opportunity: prioritizeOpportunity(opportunity, impact?.priorityBoost ?? 0, impact?.bottleneckIds ?? []),
      index,
    };
  });

  prioritized.sort((a, b) => b.opportunity.priority - a.opportunity.priority || a.index - b.index);

  return {
    opportunities: prioritized.map(({ opportunity }, finalIndex) => ({
      ...opportunity,
      rationale: [...opportunity.rationale, `finalOrder=${finalIndex}`],
    })),
  };
}
