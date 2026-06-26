import type { CognitiveState, Evidence, Opportunity, ORCRecord } from "../contracts";
import { getAdaptivePrioritySessionSignals } from "../cognitive/sessionLearning";
import { remainingBudget } from "../cognitive/reasoningBudget";
import { opportunityPriorityValue } from "./opportunityPriority";

export interface AdaptivePriorityResult {
  opportunities: Opportunity[];
  evidence: Evidence[];
  summary: {
    reprioritizedCount: number;
    promotedCount: number;
    demotedCount: number;
  };
}

interface Adjustment {
  delta: number;
  reason: string;
  cognitiveState: ORCRecord;
}

const asStringArray = (values: readonly string[] | undefined): string[] => [...(values ?? [])].sort();

const transformationSignalsByKind: Record<string, string[]> = {
  MAIN_FLOW_GAP: ["MOVE_CHAIN", "REORDER_REGION", "COMPACT_REGION"],
  UNPLANNED_PENDING_TASKS: ["SCHEDULE_PENDING"],
  RESOURCE_PRESSURE: ["REASSIGN_RESOURCE"],
  EXCESSIVE_TALENT_STAY: ["COMPACT_REGION", "REORDER_REGION"],
  LOCK_PRESSURE: [],
  FRAGMENTATION: ["COMPACT_REGION", "REORDER_REGION"],
};

function adjustmentFor(opportunity: Opportunity, cognitiveState: CognitiveState): Adjustment {
  const sessionKnowledge = getAdaptivePrioritySessionSignals(cognitiveState);
  const reasons: string[] = [];
  const used: ORCRecord = {};
  let delta = 0;

  const explored = cognitiveState.exploredOpportunityIds.includes(opportunity.id);
  if (explored) {
    delta -= 30;
    reasons.push("opportunity-already-explored-in-session");
    used.exploredOpportunityIds = [opportunity.id];
  }

  const unproductive = sessionKnowledge.unproductiveOpportunities.includes(opportunity.id);
  if (unproductive) {
    delta -= 20;
    reasons.push("opportunity-previously-unproductive");
    used.unproductiveOpportunities = [opportunity.id];
  }

  const resolved = sessionKnowledge.resolvedOpportunities.includes(opportunity.id);
  if (resolved) {
    delta += 15;
    reasons.push("opportunity-previously-resolved-by-session-learning");
    used.resolvedOpportunities = [opportunity.id];
  }

  const ownSearchSpaceIds = [`orc-see:search-space:${opportunity.id}`, ...opportunity.searchSpaceIds];
  const exhaustedRegions = asStringArray([...cognitiveState.exhaustedSearchSpaceIds, ...sessionKnowledge.exhaustedRegions]);
  const exhaustedMatches = ownSearchSpaceIds.filter((id) => exhaustedRegions.includes(id));
  if (exhaustedMatches.length > 0) {
    delta -= 25;
    reasons.push("linked-search-space-exhausted");
    used.exhaustedRegions = exhaustedMatches;
  }

  const patternMatches = (transformationSignalsByKind[opportunity.kind] ?? []).filter((pattern) => sessionKnowledge.learnedPatterns.includes(pattern));
  if (patternMatches.length > 0) {
    delta += 10;
    reasons.push("useful-transformation-pattern-matches-opportunity-kind");
    used.learnedPatterns = patternMatches;
  }

  const budget = remainingBudget(cognitiveState.reasoningBudget);
  if (budget.opportunities === 0) {
    delta -= 5;
    reasons.push("opportunity-budget-exhausted");
    used.remainingBudget = { opportunities: budget.opportunities };
  }

  return {
    delta,
    reason: reasons.length === 0 ? "no-cognitive-priority-signal" : reasons.join(";"),
    cognitiveState: used,
  };
}

export function reprioritizeOpportunities(
  opportunities: Opportunity[],
  cognitiveState: CognitiveState,
): AdaptivePriorityResult {
  const scored = opportunities.map((opportunity, index) => {
    const originalPriority = opportunityPriorityValue(opportunity);
    const adjustment = adjustmentFor(opportunity, cognitiveState);
    const adjustedPriority = originalPriority + adjustment.delta;
    const nextOpportunity: Opportunity = adjustment.delta === 0
      ? opportunity
      : {
        ...opportunity,
        evidenceIds: [...opportunity.evidenceIds, `evidence:orc-see:adaptive-priority:${opportunity.id}`],
        taskIds: [...opportunity.taskIds],
        searchSpaceIds: [...opportunity.searchSpaceIds],
        metadata: {
          ...opportunity.metadata,
          priority: adjustedPriority,
          adaptivePriority: {
            originalPriority,
            adjustedPriority,
            delta: adjustment.delta,
            reason: adjustment.reason,
            cognitiveState: adjustment.cognitiveState,
          },
        },
      };
    return { opportunity: nextOpportunity, index, originalPriority, adjustedPriority, adjustment };
  });

  const ordered = scored
    .slice()
    .sort((a, b) => b.adjustedPriority - a.adjustedPriority || a.index - b.index);

  const evidence = scored.map(({ opportunity, originalPriority, adjustedPriority, adjustment }): Evidence => ({
    id: `evidence:orc-see:adaptive-priority:${opportunity.id}`,
    source: "orc-see",
    kind: "adaptive-priority-adjustment",
    subjectId: opportunity.id,
    createdAt: null,
    data: {
      opportunityId: opportunity.id,
      opportunityKind: opportunity.kind,
      originalPriority,
      adjustedPriority,
      delta: adjustedPriority - originalPriority,
      reason: adjustment.reason,
      cognitiveState: adjustment.cognitiveState,
      readOnly: true,
    },
  }));

  const promotedCount = scored.filter((item) => item.adjustedPriority > item.originalPriority).length;
  const demotedCount = scored.filter((item) => item.adjustedPriority < item.originalPriority).length;

  return {
    opportunities: ordered.map((item) => item.opportunity),
    evidence,
    summary: {
      reprioritizedCount: promotedCount + demotedCount,
      promotedCount,
      demotedCount,
    },
  };
}
