import type { Opportunity, OpportunityImpact } from "../contracts";

export type { OpportunityImpact };

export interface OpportunityImpactAnalysis {
  impacts: OpportunityImpact[];
}

const KIND_IMPACT: Record<string, number> = {
  MAIN_FLOW_GAP: 0.92,
  UNPLANNED_PENDING_TASKS: 0.88,
  RESOURCE_PRESSURE: 0.82,
  EXCESSIVE_TALENT_STAY: 0.7,
  LOCK_PRESSURE: 0.62,
  FRAGMENTATION: 0.54,
};

const finiteNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const arraySize = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

const booleanSignal = (value: unknown): number => (value === true ? 1 : 0);

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const round = (value: number): number => Number(value.toFixed(6));

const estimateSingleOpportunity = (opportunity: Opportunity): OpportunityImpact => {
  const metadata = opportunity.metadata ?? {};
  const taskCount = Array.isArray(opportunity.taskIds) ? opportunity.taskIds.length : 0;
  const priority = finiteNumber(metadata.priority);
  const bottleneckCount = arraySize(metadata.bottleneckIds);
  const derivedFromCriticalBottleneck = booleanSignal(metadata.derivedFromCriticalBottleneck);
  const kindImpact = KIND_IMPACT[opportunity.kind] ?? 0.45;

  const prioritySignal = clamp01(priority / 100);
  const taskSignal = clamp01(taskCount / 20);
  const bottleneckSignal = clamp01(bottleneckCount / 3);

  const expectedImpact = round(clamp01(kindImpact * 0.5 + prioritySignal * 0.25 + bottleneckSignal * 0.15 + taskSignal * 0.1));
  const confidence = round(clamp01(0.35 + (priority > 0 ? 0.18 : 0) + (taskCount > 0 ? 0.14 : 0) + bottleneckSignal * 0.18 + derivedFromCriticalBottleneck * 0.15));

  return {
    opportunityId: opportunity.id,
    expectedImpact,
    confidence,
    explanation: `Expected opportunity impact ${expectedImpact.toFixed(6)} from kind=${opportunity.kind}, priority=${priority}, taskCount=${taskCount}, bottleneckCount=${bottleneckCount}, derivedFromCriticalBottleneck=${derivedFromCriticalBottleneck === 1}.`,
  };
};

export function estimateOpportunityImpact(opportunities: Opportunity[]): OpportunityImpactAnalysis {
  return {
    impacts: (opportunities ?? []).map((opportunity) => estimateSingleOpportunity(opportunity)),
  };
}
