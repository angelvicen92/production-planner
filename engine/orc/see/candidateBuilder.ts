import type { Candidate, CognitiveState, Evidence, OperationalState, SearchSpace } from "../contracts";
import { shouldSkipCandidate } from "../cognitive/cognitiveFeedback";
import { pruneDiscardedCandidates, type CognitivePruningStats } from "../cognitive/cognitivePruning";

export interface CandidateBuilderOptions {
  maxCandidatesPerSearchSpace?: number;
  maxCandidatesTotal?: number;
  createdAt?: string | null;
  cognitiveState?: CognitiveState;
}

export interface CandidateBuilderResult {
  candidates: Candidate[];
  evidence: Evidence[];
  summary: {
    searchSpaceCount: number;
    candidateCount: number;
    duplicateCandidatesDiscarded: number;
    truncatedByBudget: boolean;
    pruning: CognitivePruningStats;
  };
}

const DEFAULT_MAX_CANDIDATES_PER_SEARCH_SPACE = 3;
const DEFAULT_MAX_CANDIDATES_TOTAL = 20;

const STRATEGY_BY_TRANSFORMATION: Record<string, string> = {
  MOVE_CHAIN_POSSIBLE: "CLOSE_MAIN_FLOW_GAP",
  REORDER_REGION_POSSIBLE: "REORDER_LOCAL_SEQUENCE",
  RESOURCE_REASSIGNMENT_POSSIBLE: "REDUCE_RESOURCE_PRESSURE",
  COMPACT_REGION_POSSIBLE: "COMPACT_REGION",
  LOCK_CONSTRAINED_EXPLORATION: "REDUCE_LOCK_PRESSURE",
  SCHEDULE_PENDING_TASKS_POSSIBLE: "SCHEDULE_PENDING_TASKS",
};

const FALLBACK_STRATEGY_BY_OPPORTUNITY: Record<string, string[]> = {
  MAIN_FLOW_GAP: ["CLOSE_MAIN_FLOW_GAP", "REORDER_LOCAL_SEQUENCE", "COMPACT_REGION"],
  UNPLANNED_PENDING_TASKS: ["SCHEDULE_PENDING_TASKS"],
  RESOURCE_PRESSURE: ["REDUCE_RESOURCE_PRESSURE"],
  EXCESSIVE_TALENT_STAY: ["REDUCE_TALENT_STAY", "COMPACT_REGION", "REORDER_LOCAL_SEQUENCE"],
  LOCK_PRESSURE: ["REDUCE_LOCK_PRESSURE"],
  FRAGMENTATION: ["COMPACT_REGION", "REORDER_LOCAL_SEQUENCE"],
};

const normalizeBudgetValue = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

const metadataString = (value: unknown, fallback: string): string => (typeof value === "string" && value.length > 0 ? value : fallback);

const uniqueStable = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

function candidateStrategies(searchSpace: SearchSpace): string[] {
  const transformations = Array.isArray(searchSpace.metadata.allowedTransformations) ? searchSpace.metadata.allowedTransformations : [];
  const fromTransformations = transformations
    .map((transformation) => (typeof transformation === "string" ? STRATEGY_BY_TRANSFORMATION[transformation] : undefined))
    .filter((strategy): strategy is string => typeof strategy === "string");
  const opportunityKind = metadataString(searchSpace.metadata.sourceOpportunityKind, "UNKNOWN");
  return uniqueStable(fromTransformations.length > 0 ? fromTransformations : (FALLBACK_STRATEGY_BY_OPPORTUNITY[opportunityKind] ?? []));
}

function confidenceFor(strategy: string, taskCount: number): number {
  const base = strategy === "SCHEDULE_PENDING_TASKS" ? 0.72 : strategy === "REDUCE_LOCK_PRESSURE" ? 0.58 : 0.64;
  return Math.max(0.1, Math.min(0.95, Number((base + Math.min(taskCount, 5) * 0.02).toFixed(2))));
}

function expectedImpactFor(strategy: string, opportunityKind: string): string {
  if (strategy === "SCHEDULE_PENDING_TASKS") return "increase-scheduled-coverage";
  if (strategy === "REDUCE_RESOURCE_PRESSURE") return "lower-resource-contention";
  if (strategy === "REDUCE_TALENT_STAY") return "shorter-talent-presence-window";
  if (strategy === "CLOSE_MAIN_FLOW_GAP") return "reduce-main-flow-idle-gap";
  if (strategy === "COMPACT_REGION") return opportunityKind === "FRAGMENTATION" ? "reduce-regional-fragmentation" : "compact-affected-region";
  if (strategy === "REORDER_LOCAL_SEQUENCE") return "improve-local-ordering";
  return "explore-read-only-operational-intent";
}

function estimatedCostFor(strategy: string, taskCount: number): string {
  if (strategy === "SCHEDULE_PENDING_TASKS" || taskCount > 8) return "medium";
  if (strategy === "REDUCE_LOCK_PRESSURE") return "high";
  return "low";
}

export function buildCandidatesFromSearchSpaces(
  state: OperationalState,
  searchSpaces: SearchSpace[],
  options: CandidateBuilderOptions = {},
): CandidateBuilderResult {
  void state;
  const budget = {
    maxCandidatesPerSearchSpace: normalizeBudgetValue(options.maxCandidatesPerSearchSpace, DEFAULT_MAX_CANDIDATES_PER_SEARCH_SPACE),
    maxCandidatesTotal: normalizeBudgetValue(options.maxCandidatesTotal, DEFAULT_MAX_CANDIDATES_TOTAL),
  };
  const createdAt = options.createdAt ?? null;
  const candidates: Candidate[] = [];
  const evidence: Evidence[] = [];
  const seen = new Set<string>();
  let duplicateCandidatesDiscarded = 0;
  let truncatedByBudget = false;

  for (const searchSpace of searchSpaces ?? []) {
    const sourceOpportunityId = metadataString(searchSpace.metadata.sourceOpportunityId, searchSpace.id);
    const sourceOpportunityKind = metadataString(searchSpace.metadata.sourceOpportunityKind, "UNKNOWN");
    const region = metadataString(searchSpace.metadata.affectedRegion, "unknown-region");
    let producedForSpace = 0;

    for (const strategy of candidateStrategies(searchSpace)) {
      if (producedForSpace >= budget.maxCandidatesPerSearchSpace || candidates.length >= budget.maxCandidatesTotal) {
        truncatedByBudget = true;
        evidence.push({
          id: `evidence:orc-see:candidate:budget:${searchSpace.id}:${strategy}`,
          source: "orc-see",
          kind: "candidate-budget-truncated",
          subjectId: searchSpace.id,
          createdAt,
          data: { searchSpaceId: searchSpace.id, opportunityId: sourceOpportunityId, strategy, region, budget, readOnly: true },
        });
        break;
      }
      const equivalenceKey = `${sourceOpportunityId}|${strategy}|${region}`;
      if (seen.has(equivalenceKey)) {
        duplicateCandidatesDiscarded += 1;
        evidence.push({
          id: `evidence:orc-see:candidate:duplicate:${searchSpace.id}:${strategy}`,
          source: "orc-see",
          kind: "candidate-duplicate-discarded",
          subjectId: searchSpace.id,
          createdAt,
          data: { searchSpaceId: searchSpace.id, opportunityId: sourceOpportunityId, strategy, region, equivalenceKey, readOnly: true },
        });
        continue;
      }
      seen.add(equivalenceKey);
      const candidateId = `orc-see:candidate:${sourceOpportunityId}:${region}:${strategy}`;
      const evidenceId = `evidence:orc-see:candidate:${sourceOpportunityId}:${region}:${strategy}`;
      const confidence = confidenceFor(strategy, searchSpace.taskIds.length);
      const expectedImpact = expectedImpactFor(strategy, sourceOpportunityKind);
      const estimatedCost = estimatedCostFor(strategy, searchSpace.taskIds.length);
      const repeatedByCognitiveMemory = options.cognitiveState ? shouldSkipCandidate(options.cognitiveState, candidateId) : false;
      candidates.push({
        id: candidateId,
        state: { status: "draft", reason: "read-only abstract ORC SEE candidate", evidenceIds: [evidenceId], metadata: { readOnly: true } },
        assignments: [],
        operationalValues: [],
        evidenceIds: [evidenceId],
        metadata: {
          readOnly: true,
          abstract: true,
          executesTransformations: false,
          searchSpaceId: searchSpace.id,
          sourceOpportunityId,
          sourceOpportunityKind,
          strategy,
          affectedRegion: region,
          taskIds: [...searchSpace.taskIds],
          confidence,
          expectedImpact,
          estimatedCost,
          generationReason: `Abstract candidate generated from ${sourceOpportunityKind} search space using ${strategy}`,
          cognitiveFeedback: { repeatedByCognitiveMemory, potentialOmittable: repeatedByCognitiveMemory, observationalOnly: true },
        },
      });
      evidence.push({
        id: evidenceId,
        source: "orc-see",
        kind: "candidate-generated",
        subjectId: candidateId,
        createdAt,
        data: { candidateId, searchSpaceId: searchSpace.id, opportunityId: sourceOpportunityId, opportunityKind: sourceOpportunityKind, strategy, region, confidence, expectedImpact, estimatedCost, generationReason: `Abstract candidate generated from ${sourceOpportunityKind} search space using ${strategy}`, readOnly: true, cognitiveFeedback: { repeatedByCognitiveMemory, potentialOmittable: repeatedByCognitiveMemory, observationalOnly: true } },
      });
      producedForSpace += 1;
    }
  }

  const pruningResult = options.cognitiveState ? pruneDiscardedCandidates(options.cognitiveState, candidates) : { items: candidates, stats: { generatedCount: candidates.length, keptCount: candidates.length, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] } };
  for (const item of pruningResult.stats.prunedItems) {
    evidence.push({
      id: `evidence:orc-see:candidate:pruned:${item.id}`,
      source: "orc-see",
      kind: "candidate-pruned",
      subjectId: item.id,
      createdAt,
      data: { candidateId: item.id, reason: item.reason, phase: item.phase, estimatedBudgetSaved: item.estimatedBudgetSaved, readOnly: true },
    });
  }

  return { candidates: pruningResult.items, evidence, summary: { searchSpaceCount: (searchSpaces ?? []).length, candidateCount: pruningResult.items.length, duplicateCandidatesDiscarded, truncatedByBudget, pruning: pruningResult.stats } };
}
