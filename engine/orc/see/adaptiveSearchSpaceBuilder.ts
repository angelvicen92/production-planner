import type { CognitiveState, Evidence, Opportunity, SearchSpace } from "../contracts";
import type { OpportunityDiagnosis } from "./opportunityDiagnosis";
import { remainingBudget, type ReasoningBudget } from "../cognitive/reasoningBudget";
import { shouldSkipSearchSpace } from "../cognitive/cognitiveFeedback";

export interface AdaptiveSearchSpaceResult {
  searchSpaces: SearchSpace[];
  evidence: Evidence[];
  summary: {
    generatedSearchSpaces: number;
    discardedSearchSpaces: number;
    averageSearchSpaceSize: number;
    exhaustedRegionsSkipped: number;
  };
}

export interface AdaptiveSearchSpaceOptions {
  diagnoses?: OpportunityDiagnosis[];
}

const TRANSFORMATIONS_BY_KIND: Record<string, string[]> = {
  MAIN_FLOW_GAP: ["MOVE_CHAIN_POSSIBLE", "REORDER_REGION_POSSIBLE", "COMPACT_REGION_POSSIBLE"],
  UNPLANNED_PENDING_TASKS: ["SCHEDULE_PENDING_TASKS_POSSIBLE"],
  RESOURCE_PRESSURE: ["RESOURCE_REASSIGNMENT_POSSIBLE"],
  EXCESSIVE_TALENT_STAY: ["COMPACT_REGION_POSSIBLE", "REORDER_REGION_POSSIBLE"],
  LOCK_PRESSURE: ["LOCK_CONSTRAINED_EXPLORATION"],
  FRAGMENTATION: ["COMPACT_REGION_POSSIBLE", "REORDER_REGION_POSSIBLE"],
};

const REGION_BY_KIND: Record<string, string> = {
  MAIN_FLOW_GAP: "configured-main-flow",
  UNPLANNED_PENDING_TASKS: "unplanned-pending-tasks",
  RESOURCE_PRESSURE: "resource-pressure",
  EXCESSIVE_TALENT_STAY: "affected-contestant-schedule",
  LOCK_PRESSURE: "active-locks",
  FRAGMENTATION: "fragmented-talent-or-space-region",
};

const RESTRICTIONS_BY_KIND: Record<string, string[]> = {
  MAIN_FLOW_GAP: ["do-not-touch-locks", "do-not-touch-in-progress-or-done", "respect-configured-space-or-zone"],
  UNPLANNED_PENDING_TASKS: ["respect-availability", "respect-meal", "respect-locks", "respect-resources"],
  RESOURCE_PRESSURE: ["respect-availability", "respect-resource-type", "respect-locks"],
  EXCESSIVE_TALENT_STAY: ["respect-dependencies", "respect-locks", "prevent-overlaps"],
  LOCK_PRESSURE: ["do-not-break-locks"],
  FRAGMENTATION: ["respect-zones", "respect-availability", "respect-locks"],
};

type Strategy = "region-focus" | "diversity-focus";

const strategiesFor = (opportunity: Opportunity): Strategy[] => {
  const transformations = TRANSFORMATIONS_BY_KIND[opportunity.kind] ?? [];
  return transformations.length > 1 && opportunity.taskIds.length > 1 ? ["region-focus", "diversity-focus"] : ["region-focus"];
};

const uniqueSortedTaskIds = (taskIds: readonly number[] | undefined): number[] =>
  [...new Set((taskIds ?? []).filter((id) => Number.isFinite(Number(id))).map(Number))].sort((a, b) => a - b);

const sizeLimitFor = (budget: ReasoningBudget): number => {
  const remaining = remainingBudget(budget);
  const pressure = Math.max(1, Math.min(5, remaining.candidates || budget.maxCandidates || 1));
  return pressure;
};

const taskWindowFor = (taskIds: number[], strategy: Strategy, maxSize: number): number[] => {
  if (strategy === "diversity-focus") return taskIds.filter((_, index) => index % 2 === 0).slice(0, Math.max(1, maxSize));
  return taskIds.slice(0, Math.max(1, maxSize));
};

const equivalenceKey = (opportunity: Opportunity, strategy: Strategy, taskIds: number[], transformations: string[], region: string, diagnosisCause: string | null): string =>
  `${opportunity.kind}|${region}|${diagnosisCause ?? "undiagnosed"}|${strategy}|${taskIds.join(",")}|${transformations.join(",")}`;

function evidence(id: string, kind: string, subjectId: string, data: Record<string, unknown>): Evidence {
  return { id, source: "orc-see", kind, subjectId, createdAt: null, data: data as Record<string, never> };
}

export function buildAdaptiveSearchSpaces(
  opportunities: Opportunity[],
  cognitiveState: CognitiveState,
  reasoningBudget: ReasoningBudget,
  options: AdaptiveSearchSpaceOptions = {},
): AdaptiveSearchSpaceResult {
  const remaining = remainingBudget(reasoningBudget);
  const maxSpaces = remaining.searchSpaces;
  const maxSize = sizeLimitFor(reasoningBudget);
  const searchSpaces: SearchSpace[] = [];
  const emittedEvidence: Evidence[] = [];
  const seen = new Set<string>();
  let discardedSearchSpaces = 0;
  let exhaustedRegionsSkipped = 0;
  const diagnosisByOpportunityId = new Map((options.diagnoses ?? []).map((diagnosis) => [diagnosis.opportunityId, diagnosis]));

  for (const opportunity of [...(opportunities ?? [])]) {
    for (const strategy of strategiesFor(opportunity)) {
      const diagnosis = diagnosisByOpportunityId.get(opportunity.id) ?? null;
      const region = diagnosis?.affectedRegion ?? REGION_BY_KIND[opportunity.kind] ?? "unknown-opportunity-region";
      const transformations = [...(TRANSFORMATIONS_BY_KIND[opportunity.kind] ?? [])];
      const allowedTransformations = strategy === "diversity-focus" ? transformations.slice().reverse().slice(0, 1) : transformations.slice(0, Math.max(1, Math.min(2, transformations.length)));
      const taskIds = taskWindowFor(uniqueSortedTaskIds(opportunity.taskIds), strategy, maxSize);
      const id = `orc-see:adaptive-search-space:${opportunity.id}:${strategy}`;
      const key = equivalenceKey(opportunity, strategy, taskIds, allowedTransformations, region, diagnosis?.primaryCause ?? null);
      const baseData = { opportunityId: opportunity.id, opportunityKind: opportunity.kind, searchSpaceId: id, region, strategy, searchSpaceSize: taskIds.length, budgetConsumed: searchSpaces.length, diversityKey: key, readOnly: true };

      if (searchSpaces.length >= maxSpaces) {
        discardedSearchSpaces += 1;
        emittedEvidence.push(evidence(`evidence:orc-see:adaptive-search-space:discarded:budget:${opportunity.id}:${strategy}`, "adaptive-search-space-discarded", opportunity.id, { ...baseData, reason: "insufficient-search-space-budget" }));
        continue;
      }
      if (shouldSkipSearchSpace(cognitiveState, id)) {
        discardedSearchSpaces += 1;
        exhaustedRegionsSkipped += 1;
        emittedEvidence.push(evidence(`evidence:orc-see:adaptive-search-space:discarded:exhausted:${opportunity.id}:${strategy}`, "adaptive-search-space-discarded", id, { ...baseData, reason: "exhausted-region" }));
        continue;
      }
      if (seen.has(key)) {
        discardedSearchSpaces += 1;
        emittedEvidence.push(evidence(`evidence:orc-see:adaptive-search-space:discarded:duplicate:${opportunity.id}:${strategy}`, "adaptive-search-space-discarded", id, { ...baseData, reason: "structural-duplicate" }));
        continue;
      }
      seen.add(key);
      const evidenceId = `evidence:orc-see:adaptive-search-space:${opportunity.id}:${strategy}`;
      searchSpaces.push({
        id,
        description: `Adaptive read-only search space for ${opportunity.kind} (${strategy})`,
        taskIds,
        candidates: [],
        evidenceIds: [evidenceId],
        metadata: {
          readOnly: true,
          adaptive: true,
          sourceOpportunityId: opportunity.id,
          sourceOpportunityKind: opportunity.kind,
          affectedRegion: region,
          diagnosis: diagnosis == null ? null : { opportunityId: diagnosis.opportunityId, primaryCause: diagnosis.primaryCause, contributingFactors: diagnosis.contributingFactors, confidence: diagnosis.confidence, explanation: diagnosis.explanation },
          regionDetails: { opportunityTaskCount: uniqueSortedTaskIds(opportunity.taskIds).length, strategy, diagnosedCause: diagnosis?.primaryCause ?? null },
          allowedTransformations,
          localRestrictions: RESTRICTIONS_BY_KIND[opportunity.kind] ?? ["read-only"],
          budget: { remainingSearchSpaces: maxSpaces, maxTasksPerSpace: maxSize },
          originalAffectedTaskCount: uniqueSortedTaskIds(opportunity.taskIds).length,
          truncatedAffectedTasks: uniqueSortedTaskIds(opportunity.taskIds).length > taskIds.length,
          diversity: { strategy, key, achieved: seen.size },
          generatesCandidates: false,
          executesTransformations: false,
          cognitiveFeedback: { repeatedByCognitiveMemory: false, potentialOmittable: false, observationalOnly: true },
        },
      });
      emittedEvidence.push(evidence(evidenceId, "adaptive-search-space-built", id, { ...baseData, diagnosis, primaryCause: diagnosis?.primaryCause ?? null, contributingFactors: diagnosis?.contributingFactors ?? [], allowedTransformations, budgetConsumed: searchSpaces.length, diversityAchieved: seen.size }));
    }
  }

  const averageSearchSpaceSize = searchSpaces.length === 0 ? 0 : Math.round((searchSpaces.reduce((sum, space) => sum + space.taskIds.length, 0) / searchSpaces.length) * 1_000_000) / 1_000_000;
  return { searchSpaces, evidence: emittedEvidence, summary: { generatedSearchSpaces: searchSpaces.length, discardedSearchSpaces, averageSearchSpaceSize, exhaustedRegionsSkipped } };
}
