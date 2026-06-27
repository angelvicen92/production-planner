import type { Candidate, Evidence, SearchSpace } from "../contracts";
import { buildStrategyCandidates } from "./strategyCandidateBuilder";

export interface CandidateBuilderResult {
  candidates: Candidate[];
  evidence: Evidence[];
  summary: {
    searchSpaceCount: number;
    candidateCount: number;
    duplicateCandidatesDiscarded: number;
    truncatedByBudget: boolean;
    candidateBudget: {
      globalBudget: number;
      allocatedBudget: number;
      unusedBudget: number;
      allocations: Array<{ searchSpaceId: string; priority: number; allocatedBudget: number; generatedCandidates: number; unusedBudget: number }>;
    };
    pruning: {
      generatedCount: number;
      keptCount: number;
      prunedCount: number;
      estimatedBudgetSaved: number;
      prunedItems: Candidate[];
    };
  };
}

const GLOBAL_CANDIDATE_BUDGET = 20;

const numericMetadata = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

const priorityForSearchSpace = (searchSpace: SearchSpace): number => {
  const sourceOperationalPriority = searchSpace.metadata.sourceOperationalPriority;
  if (sourceOperationalPriority != null && typeof sourceOperationalPriority === "object") {
    const score = numericMetadata((sourceOperationalPriority as Record<string, unknown>).priorityScore);
    if (score != null) return score;
  }
  return numericMetadata(searchSpace.metadata.sourceOpportunityPriority) ?? numericMetadata(searchSpace.metadata.priority) ?? 0;
};

const allocateCandidateBudget = (searchSpaces: SearchSpace[], globalBudget = GLOBAL_CANDIDATE_BUDGET): Map<string, number> => {
  const budget = Math.max(0, Math.floor(globalBudget));
  if (searchSpaces.length === 0 || budget === 0) return new Map(searchSpaces.map((space) => [space.id, 0]));
  const weights = searchSpaces.map((space) => Math.max(0, priorityForSearchSpace(space)) + 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const floors = weights.map((weight) => Math.floor((budget * weight) / totalWeight));
  let remaining = budget - floors.reduce((sum, value) => sum + value, 0);
  const rankedRemainders = searchSpaces
    .map((space, index) => ({ id: space.id, index, remainder: (budget * weights[index]) / totalWeight - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const item of rankedRemainders) {
    if (remaining <= 0) break;
    floors[item.index] += 1;
    remaining -= 1;
  }
  return new Map(searchSpaces.map((space, index) => [space.id, floors[index]]));
};

const cloneCandidate = (candidate: Candidate): Candidate => ({
  ...candidate,
  evidenceIds: [...candidate.evidenceIds],
  state: { ...candidate.state, evidenceIds: [...candidate.state.evidenceIds], metadata: { ...candidate.state.metadata } },
  metadata: { ...candidate.metadata },
  assignments: [],
  operationalValues: [],
});

const searchSpaceEvidencePayload = (searchSpace: SearchSpace): Record<string, unknown> => ({
  id: searchSpace.id,
  taskIds: [...searchSpace.taskIds],
  evidenceIds: [...searchSpace.evidenceIds],
  metadata: { ...searchSpace.metadata },
});

const candidateEvidencePayload = (candidate: Candidate): Record<string, unknown> => ({
  id: candidate.id,
  evidenceIds: [...candidate.evidenceIds],
  metadata: { ...candidate.metadata },
});

export function buildCandidates(searchSpaces: SearchSpace[]): CandidateBuilderResult {
  const sourceSearchSpaces = [...(searchSpaces ?? [])].filter((searchSpace) => {
    const selection = searchSpace.metadata?.searchSpaceSelection;
    return !(selection != null && typeof selection === "object" && (selection as Record<string, unknown>).selected === false);
  });
  if (sourceSearchSpaces.length === 0) {
    return { candidates: [], evidence: [], summary: { searchSpaceCount: 0, candidateCount: 0, duplicateCandidatesDiscarded: 0, truncatedByBudget: false, candidateBudget: { globalBudget: GLOBAL_CANDIDATE_BUDGET, allocatedBudget: 0, unusedBudget: GLOBAL_CANDIDATE_BUDGET, allocations: [] }, pruning: { generatedCount: 0, keptCount: 0, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] } } };
  }

  const candidateBudgetBySearchSpaceId = allocateCandidateBudget(sourceSearchSpaces);
  const result = buildStrategyCandidates(sourceSearchSpaces, undefined, { candidateBudgetBySearchSpaceId });
  const candidates = result.candidates.map(cloneCandidate);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const searchSpacesById = new Map(sourceSearchSpaces.map((searchSpace) => [searchSpace.id, searchSpace]));
  const evidence: Evidence[] = [];
  const generatedBySearchSpaceId = new Map<string, number>();
  for (const candidate of candidates) {
    const searchSpaceId = typeof candidate.metadata.searchSpaceId === "string" ? candidate.metadata.searchSpaceId : "";
    generatedBySearchSpaceId.set(searchSpaceId, (generatedBySearchSpaceId.get(searchSpaceId) ?? 0) + 1);
  }
  const budgetAllocations = sourceSearchSpaces.map((searchSpace) => {
    const allocatedBudget = candidateBudgetBySearchSpaceId.get(searchSpace.id) ?? 0;
    const generatedCandidates = generatedBySearchSpaceId.get(searchSpace.id) ?? 0;
    return { searchSpaceId: searchSpace.id, priority: priorityForSearchSpace(searchSpace), allocatedBudget, generatedCandidates, unusedBudget: Math.max(0, allocatedBudget - generatedCandidates) };
  });

  for (const allocation of budgetAllocations) {
    evidence.push({
      id: `evidence:orc-see:candidate-budget:${allocation.searchSpaceId}`,
      source: "orc-see",
      kind: "candidate-budget-allocated",
      subjectId: allocation.searchSpaceId,
      createdAt: null,
      data: { ...allocation, readOnly: true },
    });
  }

  for (const item of result.evidence) {
    if (item.kind === "strategy-candidate-diversity") continue;
    if (item.kind === "strategy-candidate-generated") {
      const candidate = candidatesById.get(String(item.subjectId));
      const searchSpaceId = typeof item.data.searchSpaceId === "string" ? item.data.searchSpaceId : String(item.data.searchSpaceId ?? "");
      const searchSpace = searchSpacesById.get(searchSpaceId);
      const traceableData = {
        ...item.data,
        searchSpacePriority: budgetAllocations.find((allocation) => allocation.searchSpaceId === searchSpaceId)?.priority ?? 0,
        allocatedCandidateBudget: budgetAllocations.find((allocation) => allocation.searchSpaceId === searchSpaceId)?.allocatedBudget ?? 0,
        generatedCandidatesForSearchSpace: budgetAllocations.find((allocation) => allocation.searchSpaceId === searchSpaceId)?.generatedCandidates ?? 0,
        unusedCandidateBudget: budgetAllocations.find((allocation) => allocation.searchSpaceId === searchSpaceId)?.unusedBudget ?? 0,
        originSearchSpace: searchSpace ? searchSpaceEvidencePayload(searchSpace) : { id: searchSpaceId },
        generatedCandidate: candidate ? candidateEvidencePayload(candidate) : { id: item.subjectId },
      };
      evidence.push({ ...item, kind: "candidate-generated", createdAt: null, data: traceableData });
      evidence.push({ ...item, createdAt: null, data: traceableData });
      continue;
    }
    if (item.kind === "strategy-candidate-discarded" && item.data.reason === "equivalent-candidate") {
      evidence.push({
        ...item,
        id: String(item.id).replace("strategy-candidate:discarded:equivalent", "candidate:duplicate"),
        kind: "candidate-duplicate-discarded",
        createdAt: null,
        data: {
          ...item.data,
          originSearchSpace: searchSpacesById.has(String(item.subjectId)) ? searchSpaceEvidencePayload(searchSpacesById.get(String(item.subjectId)) as SearchSpace) : { id: item.subjectId },
        },
      });
    }
  }

  return {
    candidates,
    evidence,
    summary: {
      searchSpaceCount: sourceSearchSpaces.length,
      candidateCount: candidates.length,
      duplicateCandidatesDiscarded: result.summary.discardedEquivalentCandidates,
      truncatedByBudget: false,
      candidateBudget: { globalBudget: GLOBAL_CANDIDATE_BUDGET, allocatedBudget: budgetAllocations.reduce((sum, allocation) => sum + allocation.allocatedBudget, 0), unusedBudget: budgetAllocations.reduce((sum, allocation) => sum + allocation.unusedBudget, 0), allocations: budgetAllocations },
      pruning: { generatedCount: candidates.length, keptCount: candidates.length, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] },
    },
  };
}

export const buildCandidatesFromSearchSpaces = buildCandidates;
