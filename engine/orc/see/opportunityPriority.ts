import type { Opportunity } from "../contracts";

const KIND_PRIORITY: Record<string, number> = {
  MAIN_FLOW_GAP: 100,
  UNPLANNED_PENDING_TASKS: 90,
  RESOURCE_PRESSURE: 80,
  EXCESSIVE_TALENT_STAY: 70,
  LOCK_PRESSURE: 60,
  FRAGMENTATION: 50,
};

const numeric = (value: unknown, fallback: number): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function opportunityPriorityValue(opportunity: Opportunity): number {
  return numeric(opportunity.metadata?.priority, KIND_PRIORITY[opportunity.kind] ?? 0);
}

export function prioritizeOpportunities(opportunities: Opportunity[]): Opportunity[] {
  return opportunities
    .map((opportunity, index) => ({ opportunity, index }))
    .sort((a, b) => opportunityPriorityValue(b.opportunity) - opportunityPriorityValue(a.opportunity)
      || String(a.opportunity.id).localeCompare(String(b.opportunity.id))
      || a.index - b.index)
    .map(({ opportunity }) => opportunity);
}
