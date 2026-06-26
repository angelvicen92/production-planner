import type { Candidate, CognitiveState, Evidence, OperationalState, SearchSpace } from "../contracts";
import { pruneDiscardedCandidates, type CognitivePruningStats } from "../cognitive/cognitivePruning";
import { buildStrategyCandidates } from "./strategyCandidateBuilder";

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

const normalizeBudgetValue = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

const metadataString = (value: unknown, fallback: string): string => (typeof value === "string" && value.length > 0 ? value : fallback);

export function buildCandidatesFromSearchSpaces(
  state: OperationalState,
  searchSpaces: SearchSpace[],
  options: CandidateBuilderOptions = {},
): CandidateBuilderResult {
  void state;
  const createdAt = options.createdAt ?? null;
  const cognitiveState = options.cognitiveState ?? {
    exploredOpportunityIds: [],
    exhaustedSearchSpaceIds: [],
    discardedCandidateIds: [],
    simulatedCandidateIds: [],
    committedCandidateIds: [],
    temporaryKnowledge: {},
    confidence: 1,
    createdAt,
    updatedAt: createdAt,
    reasoningBudget: {
      maxOpportunities: 20,
      maxSearchSpaces: 10,
      maxCandidates: DEFAULT_MAX_CANDIDATES_TOTAL,
      maxSimulations: 20,
      consumedOpportunities: 0,
      consumedSearchSpaces: 0,
      consumedCandidates: 0,
      consumedSimulations: 0,
    },
  } as CognitiveState;
  const result = buildStrategyCandidates(searchSpaces, cognitiveState);
  const maxTotal = normalizeBudgetValue(options.maxCandidatesTotal, DEFAULT_MAX_CANDIDATES_TOTAL);
  const maxPerSpace = normalizeBudgetValue(options.maxCandidatesPerSearchSpace, DEFAULT_MAX_CANDIDATES_PER_SEARCH_SPACE);
  const counts = new Map<string, number>();
  const kept: Candidate[] = [];
  const evidence = (searchSpaces ?? []).length === 0 ? [] : result.evidence
    .filter((item) => item.kind !== "strategy-candidate-diversity")
    .flatMap((item) => {
      const withCreatedAt = { ...item, createdAt };
      if (item.kind !== "strategy-candidate-generated") return [withCreatedAt];
      const compatibilityEvidence = { ...withCreatedAt, kind: "candidate-generated" };
      return options.cognitiveState ? [compatibilityEvidence, withCreatedAt] : [compatibilityEvidence];
    });
  let truncatedByBudget = false;
  for (const candidate of result.candidates) {
    const searchSpaceId = metadataString(candidate.metadata.searchSpaceId, "unknown");
    const count = counts.get(searchSpaceId) ?? 0;
    if (kept.length >= maxTotal || count >= maxPerSpace) {
      truncatedByBudget = true;
      evidence.push({ id: `evidence:orc-see:candidate:budget:${candidate.id}`, source: "orc-see", kind: "candidate-budget-truncated", subjectId: candidate.id, createdAt, data: { candidateId: candidate.id, searchSpaceId, readOnly: true } });
      continue;
    }
    counts.set(searchSpaceId, count + 1);
    kept.push({ ...candidate, evidenceIds: [...candidate.evidenceIds], state: { ...candidate.state, evidenceIds: [...candidate.state.evidenceIds], metadata: { ...candidate.state.metadata } }, metadata: { ...candidate.metadata }, assignments: [], operationalValues: [] });
  }
  const pruningResult = options.cognitiveState ? pruneDiscardedCandidates(options.cognitiveState, kept) : { items: kept, stats: { generatedCount: kept.length, keptCount: kept.length, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] } };
  for (const item of result.evidence) {
    if (item.kind === "strategy-candidate-discarded" && item.data.reason === "equivalent-candidate") {
      evidence.push({ ...item, id: String(item.id).replace("strategy-candidate:discarded:equivalent", "candidate:duplicate"), kind: "candidate-duplicate-discarded", createdAt });
    }
  }
  return { candidates: pruningResult.items, evidence, summary: { searchSpaceCount: (searchSpaces ?? []).length, candidateCount: pruningResult.items.length, duplicateCandidatesDiscarded: result.summary.discardedEquivalentCandidates, truncatedByBudget, pruning: pruningResult.stats } };
}
