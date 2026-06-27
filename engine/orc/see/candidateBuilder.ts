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
    pruning: {
      generatedCount: number;
      keptCount: number;
      prunedCount: number;
      estimatedBudgetSaved: number;
      prunedItems: Candidate[];
    };
  };
}

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
  const sourceSearchSpaces = [...(searchSpaces ?? [])];
  if (sourceSearchSpaces.length === 0) {
    return { candidates: [], evidence: [], summary: { searchSpaceCount: 0, candidateCount: 0, duplicateCandidatesDiscarded: 0, truncatedByBudget: false, pruning: { generatedCount: 0, keptCount: 0, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] } } };
  }

  const result = buildStrategyCandidates(sourceSearchSpaces);
  const candidates = result.candidates.map(cloneCandidate);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const searchSpacesById = new Map(sourceSearchSpaces.map((searchSpace) => [searchSpace.id, searchSpace]));
  const evidence: Evidence[] = [];

  for (const item of result.evidence) {
    if (item.kind === "strategy-candidate-diversity") continue;
    if (item.kind === "strategy-candidate-generated") {
      const candidate = candidatesById.get(String(item.subjectId));
      const searchSpaceId = typeof item.data.searchSpaceId === "string" ? item.data.searchSpaceId : String(item.data.searchSpaceId ?? "");
      const searchSpace = searchSpacesById.get(searchSpaceId);
      const traceableData = {
        ...item.data,
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
      pruning: { generatedCount: candidates.length, keptCount: candidates.length, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] },
    },
  };
}

export const buildCandidatesFromSearchSpaces = buildCandidates;
